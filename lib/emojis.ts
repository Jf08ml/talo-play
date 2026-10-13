import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { levenshtein, normalizeText } from "./text";
import { EMOJI_CATEGORIES, EMOJI_PUZZLES, type EmojiCategory, type EmojiPuzzle } from "./emojiPuzzles";

/**
 * Adiviná con emojis. Same flow as Trivia (question → reveal → … →
 * finished, in `rooms/{id}/emojis/state`), but answers are typed: each
 * player tries as many times as they want, checked locally with
 * `checkAnswer`, and only a right answer is recorded (`submitSolved`).
 * The answers are in the bundle, so they're readable — accepted, as always.
 */

export const QUESTION_COUNT_OPTIONS = [10, 15, 20] as const;
export const SECONDS_OPTIONS = [30, 45, 60] as const;
export const COUNTDOWN_MS = 3000;
export const REVEAL_MS = 4500;
export const MIN_POINTS = 500;
export const MAX_POINTS = 1000;

export interface EmojisMeta {
  game: "emojis";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  questionCount: number;
  seconds: number;
  categories: EmojiCategory[];
  createdAt: number | object;
}

export type EmojisStatus = "waiting" | "question" | "reveal" | "finished";

export interface EmojisPlayer {
  name: string;
  color: string;
}

export interface EmojisState {
  status: EmojisStatus;
  seed: number;
  gameNo: number;
  qNo: number;
  /** Server time when the phase started; the first question's is in the future (countdown). */
  phaseStartedAt: number;
  players: Record<string, EmojisPlayer>;
  /** Points of whoever solved the current puzzle. */
  solved: Record<string, number>;
  scores: Record<string, number>;
}

function normalizeState(raw: Partial<EmojisState> | null): EmojisState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    qNo: raw.qNo ?? 0,
    phaseStartedAt: raw.phaseStartedAt ?? 0,
    players: raw.players ?? {},
    solved: raw.solved ?? {},
    scores: raw.scores ?? {},
  };
}

export function normalizeMeta(raw: Partial<EmojisMeta>): Pick<EmojisMeta, "questionCount" | "seconds" | "categories"> {
  return {
    questionCount: raw.questionCount ?? 10,
    seconds: raw.seconds ?? 45,
    categories: raw.categories?.length ? raw.categories : EMOJI_CATEGORIES.map((c) => c.id),
  };
}

/** Indexes into EMOJI_PUZZLES for this game, in order. */
export function pickPuzzles(seed: number, categories: EmojiCategory[], count: number): number[] {
  const pool = EMOJI_PUZZLES.map((p, i) => (categories.includes(p.cat) ? i : -1)).filter((i) => i >= 0);
  return seededShuffle(pool, seed).slice(0, count);
}

export function categoryInfo(id: EmojiCategory) {
  return EMOJI_CATEGORIES.find((c) => c.id === id)!;
}

/** Lowercase, no accents or punctuation, without a leading article. */
function clean(text: string): string {
  return normalizeText(text)
    .replace(/[^a-z0-9ñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(el|la|los|las|the) /, "");
}

/** Typos allowed for an answer of this length (refranes are long). */
function tolerance(len: number): number {
  if (len <= 4) return 0;
  if (len <= 8) return 1;
  return Math.floor(len * 0.15) + 1;
}

export type AnswerCheck = "correct" | "close" | "wrong";

export function checkAnswer(guess: string, puzzle: EmojiPuzzle): AnswerCheck {
  const g = clean(guess);
  if (!g) return "wrong";
  let best: AnswerCheck = "wrong";
  for (const answer of [puzzle.a, ...(puzzle.alt ?? [])]) {
    const a = clean(answer);
    const d = levenshtein(g, a);
    const tol = tolerance(a.length);
    if (d <= tol) return "correct";
    if (d <= tol * 2 + 1 && a.length >= 4) best = "close";
  }
  return best;
}

/**
 * The answer as a hint: each letter as "_", spaces kept. From half the time
 * on, each word's first letter shows.
 */
export function answerHint(answer: string, showFirst: boolean): string {
  return answer
    .split(" ")
    .map((w) => [...w].map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) ? (showFirst && i === 0 ? ch.toUpperCase() : "_") : ch)).join(" "))
    .join("   ");
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/emojis/state`;

function mutate(roomId: string, fn: (state: EmojisState) => EmojisState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createEmojisRoom(
  params: { questionCount: number; seconds: number; categories: EmojiCategory[] },
  hostId: string
): Promise<string> {
  const roomId = generateRoomCode();
  const meta: EmojisMeta = { game: "emojis", hostId, ...params, createdAt: serverTimestamp() };
  const state: Partial<EmojisState> = { status: "waiting", seed: makeSeed(), gameNo: 0, qNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getEmojisMeta(roomId: string): Promise<Partial<EmojisMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeEmojis(roomId: string, cb: (state: EmojisState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinEmojis(roomId: string, clientId: string, player: EmojisPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color && clientId in s.scores) return null;
    return {
      ...s,
      players: { ...s.players, [clientId]: player },
      scores: { ...s.scores, [clientId]: s.scores[clientId] ?? 0 },
    };
  });
}

function firstQuestion(s: EmojisState, seed: number, gameNo: number): EmojisState {
  const scores: Record<string, number> = {};
  for (const id of Object.keys(s.players)) scores[id] = 0;
  return { ...s, status: "question", seed, gameNo, qNo: 0, phaseStartedAt: serverNow() + COUNTDOWN_MS, solved: {}, scores };
}

export function startEmojis(roomId: string) {
  return mutate(roomId, (s) => (s.status === "waiting" ? firstQuestion(s, s.seed, s.gameNo) : null));
}

/**
 * Records that I solved the current puzzle (once), scoring by the time left.
 * When `solversNeeded` players (the connected ones) solved it, it's revealed.
 */
export function submitSolved(roomId: string, expectedQ: number, clientId: string, seconds: number, solversNeeded: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "question" || s.qNo !== expectedQ || clientId in s.solved) return null;
    const now = serverNow();
    if (now < s.phaseStartedAt) return null;
    const total = seconds * 1000;
    const left = Math.max(0, Math.min(total, s.phaseStartedAt + total - now));
    const points = Math.round(MIN_POINTS + (MAX_POINTS - MIN_POINTS) * (left / total));
    const solved = { ...s.solved, [clientId]: points };
    const scores = { ...s.scores, [clientId]: (s.scores[clientId] ?? 0) + points };
    const everyone = Object.keys(solved).length >= solversNeeded;
    return { ...s, solved, scores, ...(everyone ? { status: "reveal" as const, phaseStartedAt: now } : {}) };
  });
}

/** Time's up: show the answer. Applies once per puzzle. */
export function revealAnswer(roomId: string, expectedQ: number) {
  return mutate(roomId, (s) =>
    s.status === "question" && s.qNo === expectedQ ? { ...s, status: "reveal", phaseStartedAt: serverNow() } : null
  );
}

/** After the reveal: the next puzzle, or the end. Applies once per puzzle. */
export function nextQuestion(roomId: string, expectedQ: number, totalQuestions: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "reveal" || s.qNo !== expectedQ) return null;
    if (s.qNo + 1 >= totalQuestions) return { ...s, status: "finished", solved: {} };
    return { ...s, status: "question", qNo: s.qNo + 1, phaseStartedAt: serverNow(), solved: {} };
  });
}

export function restartEmojis(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) =>
    s.status === "finished" && s.gameNo === expectedGame ? firstQuestion(s, makeSeed(), s.gameNo + 1) : null
  );
}
