import { ref, get, onValue, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, mulberry32 } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { PALABRA_WORDS } from "./palabraWords";

/**
 * Palabra secreta (Wordle-style race). Everyone guesses the same word,
 * derived from `state.seed`; each player writes only their own guesses, and
 * the race (countdown, results, winner) goes through transactions. Anyone
 * who reads the code could compute the word — accepted, there is no backend.
 *
 * There is no dictionary: any 5 letters count as a guess.
 */

export const WORD_LENGTH = 5;
export const MAX_TRIES = 6;
export const COUNTDOWN_MS = 3000;

export type LetterScore = "hit" | "near" | "miss";

export interface PalabraMeta {
  game: "palabra";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  createdAt: number | object;
}

export type PalabraStatus = "waiting" | "racing";

export interface PalabraPlayer {
  name: string;
  color: string;
}

export interface PalabraResult {
  ms: number;
  tries: number;
  solved: boolean;
}

export interface PalabraState {
  status: PalabraStatus;
  seed: number;
  /** Increments on each new word so guesses from earlier races never mix in. */
  gameNo: number;
  /** Server time when guessing opens (after the countdown). */
  startedAt: number;
  players: Record<string, PalabraPlayer>;
  /** Everyone who finished this race, solved or out of tries. */
  results: Record<string, PalabraResult>;
  /** First to solve it; "" until then. */
  winner: string;
  /** Races won per client id. */
  wins: Record<string, number>;
}

function normalizeState(raw: Partial<PalabraState> | null): PalabraState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    startedAt: raw.startedAt ?? 0,
    players: raw.players ?? {},
    results: raw.results ?? {},
    winner: raw.winner ?? "",
    wins: raw.wins ?? {},
  };
}

/** Uppercase without accents, but keeping the Ñ (it's its own letter). */
export function normalizeWord(text: string): string {
  return text
    .toUpperCase()
    .replace(/Ñ/g, "\u0001")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\u0001/g, "Ñ")
    .replace(/[^A-ZÑ]/g, "");
}

/** The race's word as written (with accents), for the reveal. */
export function displayWord(seed: number): string {
  return PALABRA_WORDS[Math.floor(mulberry32(seed)() * PALABRA_WORDS.length)].toUpperCase();
}

/** The race's word as guesses are compared against it. */
export function secretWord(seed: number): string {
  return normalizeWord(displayWord(seed));
}

/**
 * Wordle scoring: exact letters first, then letters elsewhere in the word,
 * each answer letter used at most once (so repeated letters aren't overcounted).
 */
export function scoreGuess(guess: string, answer: string): LetterScore[] {
  const g = [...guess];
  const a = [...answer];
  const out: LetterScore[] = g.map(() => "miss");
  const left = new Map<string, number>();
  g.forEach((ch, i) => {
    if (ch === a[i]) out[i] = "hit";
    else left.set(a[i], (left.get(a[i]) ?? 0) + 1);
  });
  g.forEach((ch, i) => {
    if (out[i] === "hit") return;
    const n = left.get(ch) ?? 0;
    if (n > 0) {
      out[i] = "near";
      left.set(ch, n - 1);
    }
  });
  return out;
}

/** Best known score of each letter across my guesses, for the keyboard. */
export function keyboardScores(guesses: string[], answer: string): Record<string, LetterScore> {
  const rank: Record<LetterScore, number> = { miss: 0, near: 1, hit: 2 };
  const out: Record<string, LetterScore> = {};
  for (const guess of guesses) {
    scoreGuess(guess, answer).forEach((s, i) => {
      const ch = [...guess][i];
      if (!out[ch] || rank[s] > rank[out[ch]]) out[ch] = s;
    });
  }
  return out;
}

// ---- Firebase ------------------------------------------------------------

const base = (roomId: string) => `rooms/${roomId}/palabra`;

function mutate(roomId: string, fn: (state: PalabraState) => PalabraState | null) {
  return transactState(`${base(roomId)}/state`, normalizeState, fn);
}

export async function createPalabraRoom(hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: PalabraMeta = { game: "palabra", hostId, createdAt: serverTimestamp() };
  const state: Partial<PalabraState> = { status: "waiting", seed: makeSeed(), gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [`${base(roomId)}/state`]: state,
  });
  return roomId;
}

export async function getPalabraMeta(roomId: string): Promise<Partial<PalabraMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

/** Guesses per game key (`g{gameNo}`) and player. */
export type GuessBoards = Record<string, Record<string, string[]>>;

export function subscribePalabra(
  roomId: string,
  cb: (data: { state: PalabraState | null; boards: GuessBoards }) => void
): Unsubscribe {
  return onValue(ref(getDb(), base(roomId)), (snap) => {
    const raw = (snap.val() ?? {}) as {
      state?: Partial<PalabraState>;
      boards?: Record<string, Record<string, { guesses?: string[] }>>;
    };
    const boards: GuessBoards = {};
    for (const [g, byPlayer] of Object.entries(raw.boards ?? {})) {
      boards[g] = {};
      for (const [id, b] of Object.entries(byPlayer)) boards[g][id] = Object.values(b.guesses ?? {});
    }
    cb({ state: normalizeState(raw.state ?? null), boards });
  });
}

export function gameKey(state: Pick<PalabraState, "gameNo">): string {
  return `g${state.gameNo}`;
}

export function saveGuesses(roomId: string, gk: string, clientId: string, guesses: string[]) {
  return set(ref(getDb(), `${base(roomId)}/boards/${gk}/${clientId}`), { guesses });
}

export function joinPalabra(roomId: string, clientId: string, player: PalabraPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

/** Starts the countdown; guessing opens for everyone at `startedAt`. */
export function startPalabra(roomId: string) {
  return mutate(roomId, (s) =>
    s.status === "waiting" ? { ...s, status: "racing", startedAt: serverNow() + COUNTDOWN_MS } : null
  );
}

/** Records how my race went (once); the first one to solve it wins. */
export function reportFinish(roomId: string, expectedGame: number, clientId: string, tries: number, solved: boolean) {
  return mutate(roomId, (s) => {
    if (s.status !== "racing" || s.gameNo !== expectedGame || s.results[clientId]) return null;
    const ms = Math.max(0, serverNow() - s.startedAt);
    const wins = solved && !s.winner;
    return {
      ...s,
      results: { ...s.results, [clientId]: { ms, tries, solved } },
      winner: wins ? clientId : s.winner,
      wins: wins ? { ...s.wins, [clientId]: (s.wins[clientId] ?? 0) + 1 } : s.wins,
    };
  });
}

/** A new word, back to the waiting room. Only someone who already finished can ask for it. */
export function newWord(roomId: string, expectedGame: number, clientId: string) {
  return mutate(roomId, (s) =>
    s.gameNo !== expectedGame || !s.results[clientId]
      ? null
      : { ...s, status: "waiting", seed: makeSeed(), gameNo: s.gameNo + 1, startedAt: 0, results: {}, winner: "" }
  );
}
