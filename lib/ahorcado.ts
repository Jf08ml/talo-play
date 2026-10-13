import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { transactState } from "./transact";
import { DEFAULT_WORDS } from "./dibujoWords";

/**
 * Ahorcado. Each round one player (the setter, in turn order) writes a secret
 * word, or lets the app pick one from Dibujá y adiviná's list; the others take
 * turns guessing a letter or the whole word. Six misses and the setter wins
 * the round. Each player sets once; then the game ends.
 *
 * The word is stored cleaned (uppercase, no accents, Ñ kept, single spaces)
 * in the shared state — readable with DevTools, accepted.
 */

export const MAX_MISSES = 6;
export const MIN_WORD = 3;
export const MAX_WORD = 24;
/** Points: each right letter; completing or guessing the word; hanging the guessers. */
export const LETTER_POINTS = 1;
export const SOLVE_POINTS = 3;
export const HANG_POINTS = 3;

export const ALPHABET = [..."ABCDEFGHIJKLMNÑOPQRSTUVWXYZ"];

export interface AhorcadoMeta {
  game: "ahorcado";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  createdAt: number | object;
}

export type AhorcadoStatus = "waiting" | "choosing" | "guessing" | "roundEnd" | "finished";

export interface AhorcadoPlayer {
  name: string;
  color: string;
}

export interface AhorcadoState {
  status: AhorcadoStatus;
  gameNo: number;
  players: Record<string, AhorcadoPlayer>;
  /** This game's players; `order[round]` sets the word of each round. */
  order: string[];
  round: number;
  word: string;
  /** The app picked the word: the setter guesses too and nobody scores the hanging. */
  fromApp: boolean;
  /** Letters tried, in order. */
  tried: string;
  /** Wrong whole-word guesses (they count as misses). */
  wordMisses: number;
  /** Guesses made this round; the guesser is `guessersOf(state)[turnNo % n]`. */
  turnNo: number;
  /** Who completed or guessed the word, "" if hanged. */
  solvedBy: string;
  last: { by: string; text: string; ok: boolean };
  scores: Record<string, number>;
}

/** Uppercase, no accents (Ñ kept), only letters and single spaces. */
export function cleanWord(text: string): string {
  return text
    .toUpperCase()
    .replace(/Ñ/g, "\u0001")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\u0001/g, "Ñ")
    .replace(/[^A-ZÑ ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Why a word can't be used, or null. */
export function wordProblem(text: string): string | null {
  const w = cleanWord(text);
  const letters = w.replace(/ /g, "").length;
  if (letters < MIN_WORD) return `Tiene que tener al menos ${MIN_WORD} letras.`;
  if (w.length > MAX_WORD) return `Máximo ${MAX_WORD} caracteres.`;
  return null;
}

const APP_WORDS = DEFAULT_WORDS.map(cleanWord).filter((w) => !w.includes(" ") && w.length >= 4);

function normalizeState(raw: Partial<AhorcadoState> | null): AhorcadoState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    order: raw.order ?? [],
    round: raw.round ?? 0,
    word: raw.word ?? "",
    fromApp: raw.fromApp ?? false,
    tried: raw.tried ?? "",
    wordMisses: raw.wordMisses ?? 0,
    turnNo: raw.turnNo ?? 0,
    solvedBy: raw.solvedBy ?? "",
    last: { by: raw.last?.by ?? "", text: raw.last?.text ?? "", ok: raw.last?.ok ?? false },
    scores: raw.scores ?? {},
  };
}

export function setterOf(state: Pick<AhorcadoState, "order" | "round">): string {
  return state.order[state.round] ?? "";
}

export function guessersOf(state: Pick<AhorcadoState, "order" | "round" | "fromApp">): string[] {
  const setter = setterOf(state);
  return state.fromApp ? state.order : state.order.filter((id) => id !== setter);
}

export function currentGuesser(state: AhorcadoState): string {
  const g = guessersOf(state);
  return g.length ? g[state.turnNo % g.length] : "";
}

export function misses(state: Pick<AhorcadoState, "word" | "tried" | "wordMisses">): number {
  return [...state.tried].filter((l) => !state.word.includes(l)).length + state.wordMisses;
}

export function isRevealed(word: string, tried: string): boolean {
  return [...word].every((ch) => ch === " " || tried.includes(ch));
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/ahorcado/state`;

function mutate(roomId: string, fn: (state: AhorcadoState) => AhorcadoState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createAhorcadoRoom(hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: AhorcadoMeta = { game: "ahorcado", hostId, createdAt: serverTimestamp() };
  const state: Partial<AhorcadoState> = { status: "waiting", gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getAhorcadoMeta(roomId: string): Promise<Partial<AhorcadoMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeAhorcado(roomId: string, cb: (state: AhorcadoState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinAhorcado(roomId: string, clientId: string, player: AhorcadoPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

const freshRound = (s: AhorcadoState, round: number): AhorcadoState => ({
  ...s,
  status: "choosing",
  round,
  word: "",
  fromApp: false,
  tried: "",
  wordMisses: 0,
  turnNo: 0,
  solvedBy: "",
  last: { by: "", text: "", ok: false },
});

function newGame(s: AhorcadoState, participants: string[]): AhorcadoState {
  return { ...freshRound(s, 0), order: seededShuffle(participants, makeSeed()), scores: {} };
}

export function startAhorcado(roomId: string, participants: string[]) {
  return mutate(roomId, (s) => {
    const ids = participants.filter((id) => s.players[id]);
    if (s.status !== "waiting" || ids.length < 2) return null;
    return newGame(s, ids);
  });
}

export function playAgain(roomId: string, expectedGame: number, participants: string[]) {
  return mutate(roomId, (s) => {
    const ids = participants.filter((id) => s.players[id]);
    if (s.status !== "finished" || s.gameNo !== expectedGame || ids.length < 2) return null;
    return { ...newGame(s, ids), gameNo: s.gameNo + 1 };
  });
}

/**
 * The setter's word, or `null` to let the app pick one. Anyone may let the
 * app pick when the setter left (`asSetter` false).
 */
export function chooseWord(roomId: string, clientId: string, expectedRound: number, text: string | null) {
  return mutate(roomId, (s) => {
    if (s.status !== "choosing" || s.round !== expectedRound || !s.players[clientId]) return null;
    const isSetter = setterOf(s) === clientId;
    if (text !== null && (!isSetter || wordProblem(text))) return null;
    const word = text !== null ? cleanWord(text) : APP_WORDS[Math.floor(Math.random() * APP_WORDS.length)];
    return { ...s, status: "guessing", word, fromApp: text === null };
  });
}

function endRound(s: AhorcadoState, solvedBy: string): AhorcadoState {
  const scores = { ...s.scores };
  if (solvedBy) scores[solvedBy] = (scores[solvedBy] ?? 0) + SOLVE_POINTS;
  else if (!s.fromApp) scores[setterOf(s)] = (scores[setterOf(s)] ?? 0) + HANG_POINTS;
  return { ...s, status: "roundEnd", solvedBy, scores };
}

/** A letter (one character) or the whole word, by the guesser in turn. */
export function guess(roomId: string, clientId: string, expectedTurn: number, text: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "guessing" || s.turnNo !== expectedTurn || currentGuesser(s) !== clientId) return null;
    const g = cleanWord(text);
    if (!g) return null;
    const base = { ...s, turnNo: s.turnNo + 1 };
    if (g.length === 1 && g !== " ") {
      if (s.tried.includes(g)) return null;
      const ok = s.word.includes(g);
      const next = { ...base, tried: s.tried + g, last: { by: clientId, text: g, ok } };
      if (ok) next.scores = { ...s.scores, [clientId]: (s.scores[clientId] ?? 0) + LETTER_POINTS };
      if (ok && isRevealed(s.word, next.tried)) return endRound(next, clientId);
      return misses(next) >= MAX_MISSES ? endRound(next, "") : next;
    }
    const ok = g === s.word;
    const next = { ...base, last: { by: clientId, text: g, ok }, wordMisses: s.wordMisses + (ok ? 0 : 1) };
    if (ok) return endRound(next, clientId);
    return misses(next) >= MAX_MISSES ? endRound(next, "") : next;
  });
}

/** The guesser in turn left: anyone passes their turn. */
export function skipGuesser(roomId: string, expectedTurn: number) {
  return mutate(roomId, (s) =>
    s.status === "guessing" && s.turnNo === expectedTurn ? { ...s, turnNo: s.turnNo + 1 } : null
  );
}

/** Next setter, or the end after everyone set a word. */
export function nextRound(roomId: string, expectedRound: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "roundEnd" || s.round !== expectedRound) return null;
    return s.round + 1 >= s.order.length ? { ...s, status: "finished" } : freshRound(s, s.round + 1);
  });
}
