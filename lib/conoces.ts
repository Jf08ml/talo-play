import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { CONOCES_QUESTIONS, type ConocesQuestion } from "./conocesQuestions";

/**
 * ¿Cuánto me conocés? By turns, one player (the protagonist) gets a question
 * about themselves and secretly picks their answer while everyone else picks
 * what they think it was. Each right guess is a point for the guesser and
 * one for the protagonist (being predictable pays).
 *
 * The question of turn `turnNo` is `questionFor(seed, turnNo)`; the answer
 * lives in the state, readable with DevTools — accepted, there is no backend.
 */

export const MIN_PLAYERS = 2;
export const ANSWER_SECONDS = 40;
export const ROUND_OPTIONS = [2, 3, 5] as const;

export interface ConocesMeta {
  game: "conoces";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  /** Questions each player answers about themselves. */
  rounds: number;
  createdAt: number | object;
}

export type ConocesStatus = "waiting" | "answering" | "reveal" | "finished";

export interface ConocesPlayer {
  name: string;
  color: string;
}

export interface ConocesState {
  status: ConocesStatus;
  seed: number;
  gameNo: number;
  turnNo: number;
  phaseStartedAt: number;
  players: Record<string, ConocesPlayer>;
  /** This game's protagonists in turn order; later joiners can guess but aren't asked. */
  order: string[];
  /** The protagonist's choice, -1 while unanswered. */
  answer: number;
  /** guesser → option index. */
  guesses: Record<string, number>;
  scores: Record<string, number>;
  /** Right guesses per pair `{protagonist}__{guesser}`, to say who knows whom best. */
  hits: Record<string, number>;
}

function normalizeState(raw: Partial<ConocesState> | null): ConocesState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    turnNo: raw.turnNo ?? 0,
    phaseStartedAt: raw.phaseStartedAt ?? 0,
    players: raw.players ?? {},
    order: raw.order ?? [],
    answer: raw.answer ?? -1,
    guesses: raw.guesses ?? {},
    scores: raw.scores ?? {},
    hits: raw.hits ?? {},
  };
}

export function normalizeMeta(raw: Partial<ConocesMeta>): Pick<ConocesMeta, "rounds"> {
  return { rounds: raw.rounds ?? 3 };
}

export function protagonistOf(state: Pick<ConocesState, "order" | "turnNo">): string {
  return state.order.length ? state.order[state.turnNo % state.order.length] : "";
}

export function totalTurns(state: Pick<ConocesState, "order">, rounds: number): number {
  return state.order.length * rounds;
}

/** The question of turn `turnNo`: a seeded shuffle of the bank, no repeats until it runs out. */
export function questionFor(seed: number, turnNo: number): ConocesQuestion {
  const order = seededShuffle(
    CONOCES_QUESTIONS.map((_, i) => i),
    seed
  );
  return CONOCES_QUESTIONS[order[turnNo % order.length]];
}

export const hitKey = (protagonist: string, guesser: string) => `${protagonist}__${guesser}`;

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/conoces/state`;

function mutate(roomId: string, fn: (state: ConocesState) => ConocesState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createConocesRoom(params: { rounds: number }, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: ConocesMeta = { game: "conoces", hostId, ...params, createdAt: serverTimestamp() };
  const state: Partial<ConocesState> = { status: "waiting", seed: makeSeed(), gameNo: 0, turnNo: 0, answer: -1 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getConocesMeta(roomId: string): Promise<Partial<ConocesMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeConoces(roomId: string, cb: (state: ConocesState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinConoces(roomId: string, clientId: string, player: ConocesPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

function newGame(s: ConocesState, participants: string[], seed: number): ConocesState {
  return {
    ...s,
    status: "answering",
    seed,
    turnNo: 0,
    phaseStartedAt: serverNow(),
    order: seededShuffle(participants, seed),
    answer: -1,
    guesses: {},
    scores: {},
    hits: {},
  };
}

/** Starts with `participants` (the connected players) as protagonists. */
export function startConoces(roomId: string, participants: string[]) {
  return mutate(roomId, (s) => {
    const ids = participants.filter((id) => s.players[id]);
    if (s.status !== "waiting" || ids.length < MIN_PLAYERS) return null;
    return newGame(s, ids, s.seed);
  });
}

/** New questions and order with whoever is connected now; points back to zero. */
export function playAgain(roomId: string, expectedGame: number, participants: string[]) {
  return mutate(roomId, (s) => {
    const ids = participants.filter((id) => s.players[id]);
    if (s.status !== "finished" || s.gameNo !== expectedGame || ids.length < MIN_PLAYERS) return null;
    return { ...newGame(s, ids, makeSeed()), gameNo: s.gameNo + 1 };
  });
}

function reveal(s: ConocesState): ConocesState {
  const protagonist = protagonistOf(s);
  const scores = { ...s.scores };
  const hits = { ...s.hits };
  if (s.answer >= 0) {
    for (const [guesser, choice] of Object.entries(s.guesses)) {
      if (choice !== s.answer || guesser === protagonist) continue;
      scores[guesser] = (scores[guesser] ?? 0) + 1;
      scores[protagonist] = (scores[protagonist] ?? 0) + 1;
      const k = hitKey(protagonist, guesser);
      hits[k] = (hits[k] ?? 0) + 1;
    }
  }
  return { ...s, status: "reveal", phaseStartedAt: serverNow(), scores, hits };
}

const everyoneIn = (s: ConocesState, guessersNeeded: number) =>
  s.answer >= 0 && Object.keys(s.guesses).length >= guessersNeeded;

/** The protagonist's secret answer. `guessersNeeded` = connected players other than them. */
export function submitAnswer(roomId: string, expectedTurn: number, clientId: string, choice: number, guessersNeeded: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "answering" || s.turnNo !== expectedTurn || protagonistOf(s) !== clientId) return null;
    if (choice < 0 || choice >= questionFor(s.seed, s.turnNo).a.length || s.answer === choice) return null;
    const next = { ...s, answer: choice };
    return everyoneIn(next, guessersNeeded) ? reveal(next) : next;
  });
}

/** My guess about the protagonist (it can change until everyone answered). */
export function submitGuess(roomId: string, expectedTurn: number, clientId: string, choice: number, guessersNeeded: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "answering" || s.turnNo !== expectedTurn || protagonistOf(s) === clientId) return null;
    if (!s.players[clientId] || choice < 0 || choice >= questionFor(s.seed, s.turnNo).a.length) return null;
    if (s.guesses[clientId] === choice) return null;
    const next = { ...s, guesses: { ...s.guesses, [clientId]: choice } };
    return everyoneIn(next, guessersNeeded) ? reveal(next) : next;
  });
}

/** Time's up, or someone left: reveal with what there is. */
export function closeTurn(roomId: string, expectedTurn: number) {
  return mutate(roomId, (s) => (s.status === "answering" && s.turnNo === expectedTurn ? reveal(s) : null));
}

function advance(s: ConocesState, total: number): ConocesState {
  if (s.turnNo + 1 >= total) return { ...s, status: "finished", phaseStartedAt: serverNow() };
  return { ...s, status: "answering", turnNo: s.turnNo + 1, phaseStartedAt: serverNow(), answer: -1, guesses: {} };
}

export function nextTurn(roomId: string, expectedTurn: number, total: number) {
  return mutate(roomId, (s) => (s.status === "reveal" && s.turnNo === expectedTurn ? advance(s, total) : null));
}

/** The protagonist isn't here and hasn't answered: on to the next one, no reveal. */
export function skipTurn(roomId: string, expectedTurn: number, total: number) {
  return mutate(roomId, (s) =>
    s.status === "answering" && s.turnNo === expectedTurn && s.answer < 0 ? advance(s, total) : null
  );
}
