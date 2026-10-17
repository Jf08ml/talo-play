import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, mulberry32, seededShuffle } from "./random";
import { transactState } from "./transact";
import { ONDA_SPECTRA } from "./ondaSpectra";

/**
 * En la misma onda (Wavelength-style). Each turn one player, the psychic, sees
 * where a hidden target sits on a scale (0–100, e.g. "Frío ↔ Caliente") and
 * gives a one-line clue; everyone else places their own needle. The closer,
 * the more points; the psychic gets the guessers' average.
 *
 * Scale and target derive from the seed and the turn (`spectrumFor`,
 * `targetFor`), so they're readable with DevTools — accepted, it's a party game.
 */

export const MIN_PLAYERS = 2;
export const ROUND_OPTIONS = [1, 2, 3] as const;
export const MAX_CLUE_LENGTH = 60;

/** Points by distance to the target: within 3 → 4, 8 → 3, 13 → 2. */
export const BANDS: { within: number; points: number }[] = [
  { within: 3, points: 4 },
  { within: 8, points: 3 },
  { within: 13, points: 2 },
];

export interface OndaMeta {
  game: "onda";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  /** Times each player is the psychic. */
  rounds: number;
  createdAt: number | object;
}

export type OndaStatus = "waiting" | "clue" | "guessing" | "reveal" | "finished";

export interface OndaPlayer {
  name: string;
  color: string;
}

export interface OndaState {
  status: OndaStatus;
  seed: number;
  gameNo: number;
  players: Record<string, OndaPlayer>;
  /** Psychics in turn order, fixed when the game starts. */
  order: string[];
  turnNo: number;
  /** Scales the psychics skipped this game: shifts which scale comes up. */
  skips: number;
  clue: string;
  /** Needle per guesser for the current turn (0–100). */
  guesses: Record<string, number>;
  scores: Record<string, number>;
}

function normalizeState(raw: Partial<OndaState> | null): OndaState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    order: raw.order ?? [],
    turnNo: raw.turnNo ?? 0,
    skips: raw.skips ?? 0,
    clue: raw.clue ?? "",
    guesses: raw.guesses ?? {},
    scores: raw.scores ?? {},
  };
}

export function psychicOf(s: Pick<OndaState, "order" | "turnNo">): string {
  return s.order.length ? s.order[s.turnNo % s.order.length] : "";
}

export function totalTurns(s: Pick<OndaState, "order">, rounds: number): number {
  return s.order.length * rounds;
}

/** The scale of a turn: a seeded shuffle of the list, moved on by the skips. */
export function spectrumFor(s: Pick<OndaState, "seed" | "turnNo" | "skips">): [string, string] {
  const order = seededShuffle(
    ONDA_SPECTRA.map((_, i) => i),
    s.seed
  );
  return ONDA_SPECTRA[order[(s.turnNo + s.skips) % order.length]];
}

/** The hidden target of a turn, 4–96 so the best band always fits on the dial. */
export function targetFor(s: Pick<OndaState, "seed" | "turnNo" | "skips">): number {
  const rand = mulberry32((s.seed ^ Math.imul(s.turnNo + 1, 0x9e3779b1) ^ Math.imul(s.skips + 1, 0x85ebca6b)) >>> 0);
  return 4 + Math.floor(rand() * 93);
}

export function pointsFor(guess: number, target: number): number {
  const d = Math.abs(guess - target);
  return BANDS.find((b) => d <= b.within)?.points ?? 0;
}

function scoreTurn(s: OndaState): Record<string, number> {
  const target = targetFor(s);
  const scores = { ...s.scores };
  const earned = Object.entries(s.guesses).map(([id, g]) => {
    const p = pointsFor(g, target);
    scores[id] = (scores[id] ?? 0) + p;
    return p;
  });
  if (earned.length) {
    const psychic = psychicOf(s);
    const avg = Math.round(earned.reduce((a, b) => a + b, 0) / earned.length);
    scores[psychic] = (scores[psychic] ?? 0) + avg;
  }
  return scores;
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/onda/state`;

function mutate(roomId: string, fn: (state: OndaState) => OndaState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createOndaRoom(params: { rounds: number }, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: OndaMeta = { game: "onda", hostId, ...params, createdAt: serverTimestamp() };
  const state: Partial<OndaState> = { status: "waiting", seed: makeSeed(), gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getOndaMeta(roomId: string): Promise<Partial<OndaMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeOnda(roomId: string, cb: (state: OndaState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinOnda(roomId: string, clientId: string, player: OndaPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

/** Fixes the psychics' order (the connected players, shuffled) and starts. */
export function startOnda(roomId: string, connected: string[]) {
  return mutate(roomId, (s) => {
    const ids = connected.filter((id) => s.players[id]);
    if (s.status !== "waiting" || ids.length < MIN_PLAYERS) return null;
    return {
      ...s,
      status: "clue",
      order: seededShuffle(ids, makeSeed()),
      turnNo: 0,
      skips: 0,
      clue: "",
      guesses: {},
      scores: {},
    };
  });
}

/** The psychic asks for another scale (before giving the clue). */
export function skipSpectrum(roomId: string, clientId: string, expectedTurn: number) {
  return mutate(roomId, (s) =>
    s.status === "clue" && s.turnNo === expectedTurn && psychicOf(s) === clientId ? { ...s, skips: s.skips + 1 } : null
  );
}

export function giveClue(roomId: string, clientId: string, expectedTurn: number, clue: string) {
  const text = clue.trim().slice(0, MAX_CLUE_LENGTH);
  return mutate(roomId, (s) => {
    if (s.status !== "clue" || s.turnNo !== expectedTurn || psychicOf(s) !== clientId || !text) return null;
    return { ...s, status: "guessing", clue: text, guesses: {} };
  });
}

/** A guesser locks their needle; when `needed` guessers did, the target is revealed. */
export function submitGuess(roomId: string, clientId: string, expectedTurn: number, value: number, needed: number) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return mutate(roomId, (s) => {
    if (s.status !== "guessing" || s.turnNo !== expectedTurn) return null;
    if (!s.players[clientId] || psychicOf(s) === clientId || clientId in s.guesses) return null;
    const next = { ...s, guesses: { ...s.guesses, [clientId]: v } };
    return Object.keys(next.guesses).length >= needed ? { ...next, status: "reveal", scores: scoreTurn(next) } : next;
  });
}

/** Reveal with the guesses there are (someone is taking too long, or left). */
export function revealNow(roomId: string, expectedTurn: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "guessing" || s.turnNo !== expectedTurn || Object.keys(s.guesses).length === 0) return null;
    return { ...s, status: "reveal", scores: scoreTurn(s) };
  });
}

function advance(s: OndaState, rounds: number): OndaState {
  if (s.turnNo + 1 >= totalTurns(s, rounds)) return { ...s, status: "finished" };
  return { ...s, status: "clue", turnNo: s.turnNo + 1, clue: "", guesses: {} };
}

export function nextTurn(roomId: string, expectedTurn: number, rounds: number) {
  return mutate(roomId, (s) => (s.status === "reveal" && s.turnNo === expectedTurn ? advance(s, rounds) : null));
}

/** The psychic left before the reveal: on to the next one. */
export function skipTurn(roomId: string, expectedTurn: number, rounds: number) {
  return mutate(roomId, (s) =>
    (s.status === "clue" || s.status === "guessing") && s.turnNo === expectedTurn ? advance(s, rounds) : null
  );
}

/** Back to the waiting room with a new seed, so whoever is here now plays. */
export function playAgain(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    return { ...s, status: "waiting", seed: makeSeed(), gameNo: s.gameNo + 1, order: [], turnNo: 0, skips: 0, clue: "", guesses: {}, scores: {} };
  });
}
