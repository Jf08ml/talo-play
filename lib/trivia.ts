import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS, type TriviaCategory, type TriviaQuestion } from "./triviaQuestions";

/**
 * Trivia. The game's questions and the order of each one's options derive
 * from `state.seed`; the question flow (question → reveal → … → finished)
 * lives in `rooms/{id}/trivia/state` and only changes through transactions.
 * Answers are checked on the client, as everywhere else in Talo.
 */

export const QUESTION_COUNT_OPTIONS = [10, 15, 20] as const;
export const SECONDS_OPTIONS = [15, 20, 30] as const;
export const COUNTDOWN_MS = 3000;
export const REVEAL_MS = 5000;
export const MIN_POINTS = 500;
export const MAX_POINTS = 1000;

export interface TriviaMeta {
  game: "trivia";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  questionCount: number;
  seconds: number;
  categories: TriviaCategory[];
  createdAt: number | object;
}

export type TriviaStatus = "waiting" | "question" | "reveal" | "finished";

export interface TriviaPlayer {
  name: string;
  color: string;
}

export interface TriviaAnswer {
  /** Index into the question's `a` (0 = right). */
  choice: number;
  points: number;
}

export interface TriviaState {
  status: TriviaStatus;
  seed: number;
  gameNo: number;
  /** Index of the current question in the game (0-based). */
  qNo: number;
  /** Server time when the current phase started; a question's can be in the future (countdown). */
  phaseStartedAt: number;
  players: Record<string, TriviaPlayer>;
  /** Answers to the current question. */
  answers: Record<string, TriviaAnswer>;
  scores: Record<string, number>;
}

function normalizeState(raw: Partial<TriviaState> | null): TriviaState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    qNo: raw.qNo ?? 0,
    phaseStartedAt: raw.phaseStartedAt ?? 0,
    players: raw.players ?? {},
    answers: raw.answers ?? {},
    scores: raw.scores ?? {},
  };
}

export function normalizeMeta(raw: Partial<TriviaMeta>): Pick<TriviaMeta, "questionCount" | "seconds" | "categories"> {
  return {
    questionCount: raw.questionCount ?? 10,
    seconds: raw.seconds ?? 20,
    categories: raw.categories?.length ? raw.categories : TRIVIA_CATEGORIES.map((c) => c.id),
  };
}

/** Indexes into TRIVIA_QUESTIONS for this game, in order. */
export function pickQuestions(seed: number, categories: TriviaCategory[], count: number): number[] {
  const pool = TRIVIA_QUESTIONS.map((q, i) => (categories.includes(q.cat) ? i : -1)).filter((i) => i >= 0);
  return seededShuffle(pool, seed).slice(0, count);
}

/** A question with its options in display order; `order[k]` is the index into `a` shown k-th. */
export function questionView(seed: number, questionIndex: number): { question: TriviaQuestion; order: number[] } {
  return {
    question: TRIVIA_QUESTIONS[questionIndex],
    order: seededShuffle([0, 1, 2, 3], seed ^ (questionIndex * 2654435761)),
  };
}

export function categoryInfo(id: TriviaCategory) {
  return TRIVIA_CATEGORIES.find((c) => c.id === id)!;
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/trivia/state`;

function mutate(roomId: string, fn: (state: TriviaState) => TriviaState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createTriviaRoom(
  params: { questionCount: number; seconds: number; categories: TriviaCategory[] },
  hostId: string
): Promise<string> {
  const roomId = generateRoomCode();
  const meta: TriviaMeta = { game: "trivia", hostId, ...params, createdAt: serverTimestamp() };
  const state: Partial<TriviaState> = { status: "waiting", seed: makeSeed(), gameNo: 0, qNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getTriviaMeta(roomId: string): Promise<Partial<TriviaMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeTrivia(roomId: string, cb: (state: TriviaState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinTrivia(roomId: string, clientId: string, player: TriviaPlayer) {
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

function firstQuestion(s: TriviaState, seed: number, gameNo: number): TriviaState {
  const scores: Record<string, number> = {};
  for (const id of Object.keys(s.players)) scores[id] = 0;
  return { ...s, status: "question", seed, gameNo, qNo: 0, phaseStartedAt: serverNow() + COUNTDOWN_MS, answers: {}, scores };
}

export function startTrivia(roomId: string) {
  return mutate(roomId, (s) => (s.status === "waiting" ? firstQuestion(s, s.seed, s.gameNo) : null));
}

/**
 * Records my answer to the current question (once). A right answer scores by
 * how much time was left. When `answersNeeded` players (the connected ones)
 * have answered, the question is revealed without waiting for the clock.
 */
export function submitAnswer(
  roomId: string,
  expectedQ: number,
  clientId: string,
  choice: number,
  seconds: number,
  answersNeeded: number
) {
  return mutate(roomId, (s) => {
    if (s.status !== "question" || s.qNo !== expectedQ || s.answers[clientId]) return null;
    const now = serverNow();
    if (now < s.phaseStartedAt) return null;
    const total = seconds * 1000;
    const left = Math.max(0, Math.min(total, s.phaseStartedAt + total - now));
    const points = choice === 0 ? Math.round(MIN_POINTS + (MAX_POINTS - MIN_POINTS) * (left / total)) : 0;
    const answers = { ...s.answers, [clientId]: { choice, points } };
    const scores = { ...s.scores, [clientId]: (s.scores[clientId] ?? 0) + points };
    const everyone = Object.keys(answers).length >= answersNeeded;
    return { ...s, answers, scores, ...(everyone ? { status: "reveal" as const, phaseStartedAt: now } : {}) };
  });
}

/** Time's up: show the right answer. Applies once per question. */
export function revealAnswer(roomId: string, expectedQ: number) {
  return mutate(roomId, (s) =>
    s.status === "question" && s.qNo === expectedQ ? { ...s, status: "reveal", phaseStartedAt: serverNow() } : null
  );
}

/** After the reveal: the next question, or the end. Applies once per question. */
export function nextQuestion(roomId: string, expectedQ: number, totalQuestions: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "reveal" || s.qNo !== expectedQ) return null;
    if (s.qNo + 1 >= totalQuestions) return { ...s, status: "finished", answers: {} };
    return { ...s, status: "question", qNo: s.qNo + 1, phaseStartedAt: serverNow(), answers: {} };
  });
}

export function restartTrivia(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) =>
    s.status === "finished" && s.gameNo === expectedGame ? firstQuestion(s, makeSeed(), s.gameNo + 1) : null
  );
}
