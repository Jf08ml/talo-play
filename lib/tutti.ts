import { ref, get, onValue, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { normalizeText } from "./text";
import { EASY_LETTERS } from "./tuttiCategories";

/**
 * Tutti Frutti ("Basta"). Round flow lives in `rooms/{id}/tutti/state` and
 * only changes through transactions; answers and votes are plain writes in
 * their own nodes so typing never contends with the round transactions.
 * Scores are never stored: every client computes them from answers + votes
 * with `scoreRound`, which is deterministic.
 */

export const MIN_CATEGORIES = 3;
export const MAX_CATEGORIES = 12;
export const MAX_CATEGORY_LENGTH = 30;
export const MAX_ANSWER_LENGTH = 40;
export const ROUND_OPTIONS = [3, 5, 8] as const;
export const ROUND_SECONDS_OPTIONS = [0, 60, 90, 120] as const;

export interface TuttiMeta {
  game: "tutti";
  categories: string[];
  rounds: number;
  /** 0 = no time limit; rounds then end only with "¡Basta!". */
  roundSeconds: number;
  letters: string;
  createdAt: number | object;
}

export type TuttiStatus = "waiting" | "writing" | "reviewing" | "finished";

export interface TuttiPlayer {
  name: string;
  color: string;
}

export interface TuttiState {
  status: TuttiStatus;
  seed: number;
  /** Increments on "Jugar de nuevo" so answers from earlier games never mix in. */
  gameNo: number;
  round: number;
  roundStartedAt: number;
  /** Who ended the round: a client id, "tiempo", or "" while writing. */
  endedBy: string;
  order: string[];
  players: Record<string, TuttiPlayer>;
  /** Players done reviewing the current round. */
  ready: Record<string, boolean>;
}

/** `c{categoryIndex}` → answer text (string keys: RTDB turns numeric-keyed objects into arrays). */
export type PlayerAnswers = Record<string, string>;
/** roundKey → clientId → answers */
export type AllAnswers = Record<string, Record<string, PlayerAnswers>>;
/** roundKey → `{authorId}__c{cat}` → voterId → true (= rejected) */
export type AllVotes = Record<string, Record<string, Record<string, boolean>>>;

function normalizeState(raw: Partial<TuttiState> | null): TuttiState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    round: raw.round ?? 0,
    roundStartedAt: raw.roundStartedAt ?? 0,
    endedBy: raw.endedBy ?? "",
    order: raw.order ?? [],
    players: raw.players ?? {},
    ready: raw.ready ?? {},
  };
}

export function catKey(cat: number): string {
  return `c${cat}`;
}

export function voteKey(authorId: string, cat: number): string {
  return `${authorId}__${catKey(cat)}`;
}

export function roundKey(state: Pick<TuttiState, "gameNo" | "round">, round = state.round): string {
  return `g${state.gameNo}r${round}`;
}

/** The letter for a round: a seeded shuffle of the room's letters, so no letter repeats within a game. */
export function letterFor(seed: number, letters: string, round: number): string {
  const order = seededShuffle(letters.split(""), seed);
  return order[round % order.length];
}

export const normalizeAnswer = normalizeText;

export function startsWithLetter(text: string, letter: string): boolean {
  return normalizeAnswer(text).startsWith(normalizeAnswer(letter));
}

export interface AnswerResult {
  text: string;
  /** Doesn't start with the round's letter (or is empty). */
  wrongLetter: boolean;
  rejections: number;
  valid: boolean;
  points: number;
}

/**
 * Scores one round. An answer is invalid if empty / wrong letter, or if more
 * than half of the other players rejected it. Valid answers score 20 if
 * they're the only valid one in the category, 10 if unique, 5 if repeated.
 */
export function scoreRound(
  players: string[],
  categoryCount: number,
  letter: string,
  answers: Record<string, PlayerAnswers> | undefined,
  votes: Record<string, Record<string, boolean>> | undefined
): Record<string, AnswerResult[]> {
  const voters = Math.max(1, players.length - 1);
  const out: Record<string, AnswerResult[]> = {};
  for (const id of players) out[id] = [];

  for (let cat = 0; cat < categoryCount; cat++) {
    const results = players.map((id) => {
      const text = (answers?.[id]?.[catKey(cat)] ?? "").trim();
      const rejections = Object.keys(votes?.[voteKey(id, cat)] ?? {}).filter((v) => v !== id).length;
      const wrongLetter = !text || !startsWithLetter(text, letter);
      return { id, text, wrongLetter, rejections, valid: !wrongLetter && rejections * 2 <= voters };
    });
    const valid = results.filter((r) => r.valid);
    for (const r of results) {
      let points = 0;
      if (r.valid) {
        const same = valid.filter((v) => normalizeAnswer(v.text) === normalizeAnswer(r.text)).length;
        points = valid.length === 1 ? 20 : same > 1 ? 5 : 10;
      }
      out[r.id].push({ text: r.text, wrongLetter: r.wrongLetter, rejections: r.rejections, valid: r.valid, points });
    }
  }
  return out;
}

export function sumPoints(results: AnswerResult[] | undefined): number {
  return (results ?? []).reduce((acc, r) => acc + r.points, 0);
}

// ---- Firebase ------------------------------------------------------------

const base = (roomId: string) => `rooms/${roomId}/tutti`;

function mutate(roomId: string, fn: (state: TuttiState) => TuttiState | null) {
  return transactState(`${base(roomId)}/state`, normalizeState, fn);
}

export async function createTuttiRoom(params: {
  categories: string[];
  rounds: number;
  roundSeconds: number;
  letters: string;
}): Promise<string> {
  const roomId = generateRoomCode();
  const meta: TuttiMeta = {
    game: "tutti",
    categories: params.categories.map((c) => c.trim().slice(0, MAX_CATEGORY_LENGTH)),
    rounds: Math.min(params.rounds, params.letters.length),
    roundSeconds: params.roundSeconds,
    letters: params.letters || EASY_LETTERS,
    createdAt: serverTimestamp(),
  };
  const state: Partial<TuttiState> = { status: "waiting", seed: makeSeed(), gameNo: 0, round: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [`${base(roomId)}/state`]: state,
  });
  return roomId;
}

export async function getTuttiMeta(roomId: string): Promise<Partial<TuttiMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeTutti(
  roomId: string,
  cb: (data: { state: TuttiState | null; answers: AllAnswers; votes: AllVotes }) => void
): Unsubscribe {
  return onValue(ref(getDb(), base(roomId)), (snap) => {
    const raw = (snap.val() ?? {}) as { state?: Partial<TuttiState>; answers?: AllAnswers; votes?: AllVotes };
    cb({ state: normalizeState(raw.state ?? null), answers: raw.answers ?? {}, votes: raw.votes ?? {} });
  });
}

export function joinTutti(roomId: string, clientId: string, player: TuttiPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (s.order.includes(clientId) && known?.name === player.name && known?.color === player.color) {
      return null;
    }
    return {
      ...s,
      order: s.order.includes(clientId) ? s.order : [...s.order, clientId],
      players: { ...s.players, [clientId]: player },
    };
  });
}

export function startTutti(roomId: string) {
  return mutate(roomId, (s) =>
    s.status === "waiting" && s.order.length > 0
      ? { ...s, status: "writing", round: 0, roundStartedAt: serverNow(), endedBy: "", ready: {} }
      : null
  );
}

/** Saves my answers for a round (the whole set, so a reload restores them). */
export function saveAnswers(roomId: string, rk: string, clientId: string, answers: PlayerAnswers) {
  return set(ref(getDb(), `${base(roomId)}/answers/${rk}/${clientId}`), answers);
}

/** Closes the round for everyone ("¡Basta!" or time up); applies once per round. */
export function endRound(roomId: string, expectedRound: number, by: string) {
  return mutate(roomId, (s) =>
    s.status === "writing" && s.round === expectedRound ? { ...s, status: "reviewing", endedBy: by } : null
  );
}

export function setVote(roomId: string, rk: string, authorId: string, cat: number, voterId: string, reject: boolean) {
  return set(ref(getDb(), `${base(roomId)}/votes/${rk}/${voteKey(authorId, cat)}/${voterId}`), reject ? true : null);
}

export function setReady(roomId: string, clientId: string, ready: boolean) {
  return mutate(roomId, (s) => {
    if (s.status !== "reviewing" || !!s.ready[clientId] === ready) return null;
    const next = { ...s.ready };
    if (ready) next[clientId] = true;
    else delete next[clientId];
    return { ...s, ready: next };
  });
}

/** From review to the next round (or the end of the game); applies once per round. */
export function advanceRound(roomId: string, expectedRound: number, totalRounds: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "reviewing" || s.round !== expectedRound) return null;
    if (s.round + 1 >= totalRounds) return { ...s, status: "finished", ready: {} };
    return { ...s, status: "writing", round: s.round + 1, roundStartedAt: serverNow(), endedBy: "", ready: {} };
  });
}

export function restartTutti(roomId: string) {
  return mutate(roomId, (s) =>
    s.status !== "finished"
      ? null
      : {
          ...s,
          status: "writing",
          seed: makeSeed(),
          gameNo: s.gameNo + 1,
          round: 0,
          roundStartedAt: serverNow(),
          endedBy: "",
          ready: {},
        }
  );
}
