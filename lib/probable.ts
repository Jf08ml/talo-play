import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { PROBABLE_DECKS, type ProbableDeck } from "./probablePrompts";

/**
 * ¿Quién es más probable? A phrase comes up and everyone votes for someone in
 * the room (themselves included). The most voted get the title; whoever voted
 * with the majority scores a point.
 *
 * The phrase of question `qNo` is `promptFor(seed, pool, qNo)`; votes live in
 * the state, readable with DevTools — it's a party game, accepted.
 */

export const MIN_PLAYERS = 3;
export const VOTE_SECONDS = 30;
export const QUESTION_OPTIONS = [10, 15, 20] as const;
export const MAX_CUSTOM_PROMPTS = 50;
export const MAX_PROMPT_LENGTH = 90;

export interface ProbableMeta {
  game: "probable";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  decks: ProbableDeck[];
  /** Phrases written by the host, added to the decks'. */
  customPrompts?: string[];
  questions: number;
  createdAt: number | object;
}

export type ProbableStatus = "waiting" | "voting" | "reveal" | "finished";

export interface ProbablePlayer {
  name: string;
  color: string;
}

export interface ProbableState {
  status: ProbableStatus;
  seed: number;
  gameNo: number;
  qNo: number;
  phaseStartedAt: number;
  players: Record<string, ProbablePlayer>;
  /** voter → who they voted, for the current question. */
  votes: Record<string, string>;
  /** Points for voting with the majority. */
  scores: Record<string, number>;
  /** Titles won (most voted) per player, this game. */
  titles: Record<string, number>;
  /** `q{n}` → the most voted of question n, comma-separated (ties share it). */
  history: Record<string, string>;
}

function normalizeState(raw: Partial<ProbableState> | null): ProbableState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    qNo: raw.qNo ?? 0,
    phaseStartedAt: raw.phaseStartedAt ?? 0,
    players: raw.players ?? {},
    votes: raw.votes ?? {},
    scores: raw.scores ?? {},
    titles: raw.titles ?? {},
    history: raw.history ?? {},
  };
}

export function normalizeMeta(raw: Partial<ProbableMeta>): Pick<ProbableMeta, "decks" | "customPrompts" | "questions"> {
  return {
    decks: raw.decks ?? (raw.customPrompts?.length ? [] : ["tranqui"]),
    customPrompts: raw.customPrompts ?? [],
    questions: raw.questions ?? 10,
  };
}

/** Every phrase the room can draw from: its decks in catalog order, then the custom ones. */
export function promptPool(meta: Pick<ProbableMeta, "decks" | "customPrompts">): string[] {
  const fromDecks = PROBABLE_DECKS.filter((d) => meta.decks.includes(d.id)).flatMap((d) => d.prompts);
  return [...fromDecks, ...(meta.customPrompts ?? [])];
}

/** The phrase of question `qNo`: a seeded shuffle of the pool, no repeats until it runs out. */
export function promptFor(seed: number, pool: string[], qNo: number): string {
  if (pool.length === 0) return "";
  const order = seededShuffle(
    pool.map((_, i) => i),
    seed
  );
  return pool[order[qNo % pool.length]];
}

/** Votes per player, most voted first. */
export function tally(votes: Record<string, string>): [string, number][] {
  const counts = new Map<string, number>();
  for (const target of Object.values(votes)) counts.set(target, (counts.get(target) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** The most voted (all of them, on a tie). */
export function topVoted(votes: Record<string, string>): string[] {
  const rows = tally(votes);
  if (rows.length === 0) return [];
  return rows.filter(([, n]) => n === rows[0][1]).map(([id]) => id);
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/probable/state`;

function mutate(roomId: string, fn: (state: ProbableState) => ProbableState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createProbableRoom(
  params: { decks: ProbableDeck[]; customPrompts: string[]; questions: number },
  hostId: string
): Promise<string> {
  const roomId = generateRoomCode();
  const meta: ProbableMeta = { game: "probable", hostId, ...params, createdAt: serverTimestamp() };
  const state: Partial<ProbableState> = { status: "waiting", seed: makeSeed(), gameNo: 0, qNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getProbableMeta(roomId: string): Promise<Partial<ProbableMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeProbable(roomId: string, cb: (state: ProbableState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinProbable(roomId: string, clientId: string, player: ProbablePlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

export function startProbable(roomId: string, connected: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting" || connected < MIN_PLAYERS) return null;
    return { ...s, status: "voting", qNo: 0, phaseStartedAt: serverNow(), votes: {}, scores: {}, titles: {}, history: {} };
  });
}

function reveal(s: ProbableState): ProbableState {
  const top = topVoted(s.votes);
  const scores = { ...s.scores };
  for (const [voter, target] of Object.entries(s.votes)) {
    if (top.includes(target)) scores[voter] = (scores[voter] ?? 0) + 1;
  }
  const titles = { ...s.titles };
  for (const id of top) titles[id] = (titles[id] ?? 0) + 1;
  return {
    ...s,
    status: "reveal",
    phaseStartedAt: serverNow(),
    scores,
    titles,
    history: top.length ? { ...s.history, [`q${s.qNo}`]: top.join(",") } : s.history,
  };
}

/**
 * My vote (it can change until everyone voted). When `votersNeeded` players
 * (the connected ones) have voted, the result is revealed.
 */
export function castVote(roomId: string, expectedQ: number, voter: string, target: string, votersNeeded: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "voting" || s.qNo !== expectedQ) return null;
    if (!s.players[voter] || !s.players[target] || s.votes[voter] === target) return null;
    const next = { ...s, votes: { ...s.votes, [voter]: target } };
    return Object.keys(next.votes).length >= votersNeeded ? reveal(next) : next;
  });
}

/** Time's up (or someone left without voting): reveal with the votes there are. */
export function closeVote(roomId: string, expectedQ: number) {
  return mutate(roomId, (s) => (s.status === "voting" && s.qNo === expectedQ ? reveal(s) : null));
}

/** Next phrase, or the final results after the last one. */
export function nextQuestion(roomId: string, expectedQ: number, totalQuestions: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "reveal" || s.qNo !== expectedQ) return null;
    if (s.qNo + 1 >= totalQuestions) return { ...s, status: "finished", phaseStartedAt: serverNow() };
    return { ...s, status: "voting", qNo: s.qNo + 1, votes: {}, phaseStartedAt: serverNow() };
  });
}

/** New phrases (new seed) with everyone's points back to zero. */
export function playAgain(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    return {
      ...s,
      status: "voting",
      seed: makeSeed(),
      gameNo: s.gameNo + 1,
      qNo: 0,
      phaseStartedAt: serverNow(),
      votes: {},
      scores: {},
      titles: {},
      history: {},
    };
  });
}
