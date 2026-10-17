import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { transactState } from "./transact";
import type { YoNuncaLevel } from "./yonuncaPrompts";

/**
 * Yo nunca nunca. A phrase comes up and everyone answers in secret "yo sí"
 * (I did) or "yo no"; once everyone connected answered (or someone taps
 * "Revelar"), the room sees who did. Each "yo sí" adds to that player's count:
 * the final ranking is who has lived the most.
 *
 * The phrase of question `qNo` is `promptFor(seed, pool, qNo)`.
 */

export const MIN_PLAYERS = 2;
export const QUESTION_OPTIONS = [15, 25, 40] as const;

export interface YoNuncaMeta {
  game: "yonunca";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  levels: YoNuncaLevel[];
  questions: number;
  createdAt: number | object;
}

export type YoNuncaStatus = "waiting" | "answering" | "reveal" | "finished";

export interface YoNuncaPlayer {
  name: string;
  color: string;
}

export interface YoNuncaState {
  status: YoNuncaStatus;
  seed: number;
  gameNo: number;
  qNo: number;
  players: Record<string, YoNuncaPlayer>;
  /** Answers to the current phrase: true = "yo sí". */
  answers: Record<string, boolean>;
  /** "Yo sí" count per player, this game. */
  counts: Record<string, number>;
}

function normalizeState(raw: Partial<YoNuncaState> | null): YoNuncaState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    qNo: raw.qNo ?? 0,
    players: raw.players ?? {},
    answers: raw.answers ?? {},
    counts: raw.counts ?? {},
  };
}

export function normalizeMeta(raw: Partial<YoNuncaMeta>): Pick<YoNuncaMeta, "levels" | "questions"> {
  return { levels: raw.levels?.length ? raw.levels : ["tranqui"], questions: raw.questions ?? 25 };
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

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/yonunca/state`;

function mutate(roomId: string, fn: (state: YoNuncaState) => YoNuncaState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createYoNuncaRoom(params: { levels: YoNuncaLevel[]; questions: number }, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: YoNuncaMeta = { game: "yonunca", hostId, ...params, createdAt: serverTimestamp() };
  const state: Partial<YoNuncaState> = { status: "waiting", seed: makeSeed(), gameNo: 0, qNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getYoNuncaMeta(roomId: string): Promise<Partial<YoNuncaMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeYoNunca(roomId: string, cb: (state: YoNuncaState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinYoNunca(roomId: string, clientId: string, player: YoNuncaPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

export function startYoNunca(roomId: string, connected: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting" || connected < MIN_PLAYERS) return null;
    return { ...s, status: "answering", qNo: 0, answers: {}, counts: {} };
  });
}

function reveal(s: YoNuncaState): YoNuncaState {
  const counts = { ...s.counts };
  for (const [id, yes] of Object.entries(s.answers)) if (yes) counts[id] = (counts[id] ?? 0) + 1;
  return { ...s, status: "reveal", counts };
}

/**
 * My answer (it can change until the reveal). When `needed` players (the
 * connected ones) have answered, everyone's answer is revealed.
 */
export function answer(roomId: string, expectedQ: number, clientId: string, yes: boolean, needed: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "answering" || s.qNo !== expectedQ || !s.players[clientId]) return null;
    if (s.answers[clientId] === yes) return null;
    const next = { ...s, answers: { ...s.answers, [clientId]: yes } };
    return Object.keys(next.answers).length >= needed ? reveal(next) : next;
  });
}

/** Reveal now with the answers there are (someone is taking too long, or left). */
export function revealNow(roomId: string, expectedQ: number) {
  return mutate(roomId, (s) =>
    s.status === "answering" && s.qNo === expectedQ && Object.keys(s.answers).length > 0 ? reveal(s) : null
  );
}

/** Next phrase, or the final ranking after the last one. */
export function nextPhrase(roomId: string, expectedQ: number, total: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "reveal" || s.qNo !== expectedQ) return null;
    if (s.qNo + 1 >= total) return { ...s, status: "finished" };
    return { ...s, status: "answering", qNo: s.qNo + 1, answers: {} };
  });
}

/** New phrases (new seed), counts back to zero. */
export function playAgain(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    return { ...s, status: "answering", seed: makeSeed(), gameNo: s.gameNo + 1, qNo: 0, answers: {}, counts: {} };
  });
}
