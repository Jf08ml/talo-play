import {
  ref,
  get,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onValue,
  push,
  remove,
  serverTimestamp,
  set,
  update,
  type Unsubscribe,
} from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, mulberry32, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { levenshtein, normalizeText } from "./text";
import { DEFAULT_WORDS } from "./dibujoWords";

/**
 * Dibujá y adiviná. Turn flow lives in `rooms/{id}/dibujo/state` and only
 * changes through transactions; strokes and chat are plain writes in their
 * own nodes, keyed per turn (`turnKey`). The secret word is in the state, so
 * it's visible with DevTools — accepted, as there is no backend to hide it.
 */

export const ROUND_OPTIONS = [1, 2, 3] as const;
export const DRAW_SECONDS_OPTIONS = [60, 80, 100] as const;
export const CHOOSE_SECONDS = 15;
export const REVEAL_MS = 4000;
export const WORD_OPTIONS = 3;
export const MAX_WORD_LENGTH = 30;
export const MAX_CUSTOM_WORDS = 300;
export const MAX_GUESS_LENGTH = 60;

/** Logical canvas size; strokes are stored in these coordinates. */
export const CANVAS_W = 1000;
export const CANVAS_H = 750;

export const GUESS_MIN_POINTS = 50;
export const GUESS_MAX_POINTS = 100;
export const DRAWER_POINTS_PER_GUESS = 15;

export interface DibujoMeta {
  game: "dibujo";
  /** Who created the room: starts the game (anyone can if they're away). Absent on older rooms. */
  hostId?: string;
  /** How many times each player draws. */
  rounds: number;
  drawSeconds: number;
  customWords?: string[];
  /** Include DEFAULT_WORDS (always true if there are no custom words). */
  useDefaultWords: boolean;
  createdAt: number | object;
}

export type DibujoStatus = "waiting" | "choosing" | "drawing" | "reveal" | "finished";

export interface DibujoPlayer {
  name: string;
  color: string;
}

export interface Guess {
  points: number;
  at: number;
}

export interface DibujoState {
  status: DibujoStatus;
  seed: number;
  /** Increments on "Jugar de nuevo" so strokes/chat from earlier games never mix in. */
  gameNo: number;
  turnNo: number;
  /** Server-time start of the current phase (choosing / drawing / reveal). */
  phaseStartedAt: number;
  /** "" while choosing. */
  word: string;
  /** Who draws this turn, fixed when the turn starts so players joining mid-turn don't change it. */
  drawer: string;
  order: string[];
  players: Record<string, DibujoPlayer>;
  guessed: Record<string, Guess>;
  scores: Record<string, number>;
}

export interface Stroke {
  color: string;
  width: number;
  /** Flat [x0, y0, x1, y1, …] in CANVAS_W × CANVAS_H coordinates. */
  points: number[];
}

export interface ChatMessage {
  by: string;
  text: string;
  at: number;
}

function normalizeState(raw: Partial<DibujoState> | null): DibujoState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    turnNo: raw.turnNo ?? 0,
    phaseStartedAt: raw.phaseStartedAt ?? 0,
    word: raw.word ?? "",
    drawer: raw.drawer ?? "",
    order: raw.order ?? [],
    players: raw.players ?? {},
    guessed: raw.guessed ?? {},
    scores: raw.scores ?? {},
  };
}

export function turnKey(state: Pick<DibujoState, "gameNo" | "turnNo">): string {
  return `g${state.gameNo}t${state.turnNo}`;
}

function drawerForTurn(order: string[], turnNo: number): string {
  return order.length ? order[turnNo % order.length] : "";
}

export function totalTurns(state: Pick<DibujoState, "order">, rounds: number): number {
  return rounds * state.order.length;
}

/** The room's word pool, deduplicated. */
export function wordPool(meta: Pick<DibujoMeta, "customWords" | "useDefaultWords">): string[] {
  const custom = meta.customWords ?? [];
  const words = [...(meta.useDefaultWords || custom.length === 0 ? DEFAULT_WORDS : []), ...custom];
  const seen = new Set<string>();
  return words.filter((w) => {
    const key = normalizeText(w);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The words offered to the drawer on a turn: consecutive slices of a seeded shuffle, so they don't repeat until the pool runs out. */
export function wordOptions(seed: number, pool: string[], turnNo: number): string[] {
  const shuffled = seededShuffle(pool, seed);
  return Array.from(
    { length: Math.min(WORD_OPTIONS, shuffled.length) },
    (_, i) => shuffled[(turnNo * WORD_OPTIONS + i) % shuffled.length]
  );
}

export type GuessCheck = "correct" | "close" | "wrong";

export function checkGuess(guess: string, word: string): GuessCheck {
  const g = normalizeText(guess);
  const w = normalizeText(word);
  if (!g) return "wrong";
  if (g === w) return "correct";
  return w.length >= 4 && levenshtein(g, w) <= 1 ? "close" : "wrong";
}

/**
 * The word as guessers see it: letters hidden, except one revealed at half
 * the drawing time and another at three quarters (words of 4+ letters).
 */
export function wordHint(word: string, seed: number, turnNo: number, elapsedFraction: number): string {
  const letterIdx = [...word].map((ch, i) => (ch === " " ? -1 : i)).filter((i) => i >= 0);
  const revealCount = letterIdx.length < 4 ? 0 : (elapsedFraction >= 0.5 ? 1 : 0) + (elapsedFraction >= 0.75 ? 1 : 0);
  const rand = mulberry32(seed + turnNo * 7919);
  const shown = new Set(seededShuffle(letterIdx, Math.floor(rand() * 0xffffffff)).slice(0, revealCount));
  return [...word].map((ch, i) => (ch === " " ? "  " : shown.has(i) ? ch : "_")).join(" ");
}

// ---- Firebase ------------------------------------------------------------

const base = (roomId: string) => `rooms/${roomId}/dibujo`;

function mutate(roomId: string, fn: (state: DibujoState) => DibujoState | null) {
  return transactState(`${base(roomId)}/state`, normalizeState, fn);
}

export async function createDibujoRoom(params: {
  rounds: number;
  drawSeconds: number;
  customWords: string[];
  useDefaultWords: boolean;
}, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const customWords = params.customWords
    .map((w) => w.trim().slice(0, MAX_WORD_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_CUSTOM_WORDS);
  const meta: DibujoMeta = {
    game: "dibujo",
    hostId,
    rounds: params.rounds,
    drawSeconds: params.drawSeconds,
    useDefaultWords: params.useDefaultWords || customWords.length === 0,
    createdAt: serverTimestamp(),
  };
  if (customWords.length) meta.customWords = customWords;
  const state: Partial<DibujoState> = { status: "waiting", seed: makeSeed(), gameNo: 0, turnNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [`${base(roomId)}/state`]: state,
  });
  return roomId;
}

export async function getDibujoMeta(roomId: string): Promise<Partial<DibujoMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeDibujoState(roomId: string, cb: (state: DibujoState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/state`), (snap) => cb(normalizeState(snap.val())));
}

/**
 * Follows one turn's strokes incrementally (child events), so a stroke being
 * drawn only resends itself, not the whole drawing.
 */
export function subscribeStrokes(
  roomId: string,
  tk: string,
  cb: (strokes: Map<string, Stroke>) => void
): Unsubscribe {
  const strokesRef = ref(getDb(), `${base(roomId)}/strokes/${tk}`);
  const strokes = new Map<string, Stroke>();
  cb(new Map(strokes));
  const upsert = (snap: { key: string | null; val: () => unknown }) => {
    const v = snap.val() as Partial<Stroke> | null;
    if (!snap.key || !v) return;
    strokes.set(snap.key, { color: v.color ?? "#000", width: v.width ?? 6, points: v.points ?? [] });
    cb(new Map(strokes));
  };
  const unsubs = [
    onChildAdded(strokesRef, upsert),
    onChildChanged(strokesRef, upsert),
    onChildRemoved(strokesRef, (snap) => {
      if (snap.key) strokes.delete(snap.key);
      cb(new Map(strokes));
    }),
  ];
  return () => unsubs.forEach((u) => u());
}

export function newStrokeId(roomId: string, tk: string): string {
  return push(ref(getDb(), `${base(roomId)}/strokes/${tk}`)).key!;
}

export function saveStroke(roomId: string, tk: string, id: string, stroke: Stroke) {
  return set(ref(getDb(), `${base(roomId)}/strokes/${tk}/${id}`), stroke);
}

export function removeStroke(roomId: string, tk: string, id: string) {
  return remove(ref(getDb(), `${base(roomId)}/strokes/${tk}/${id}`));
}

export function clearStrokes(roomId: string, tk: string) {
  return remove(ref(getDb(), `${base(roomId)}/strokes/${tk}`));
}

export function subscribeChat(roomId: string, tk: string, cb: (messages: ChatMessage[]) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/chat/${tk}`), (snap) => {
    const raw = (snap.val() ?? {}) as Record<string, Partial<ChatMessage>>;
    // Push keys sort chronologically.
    cb(
      Object.keys(raw)
        .sort()
        .map((k) => ({ by: raw[k].by ?? "", text: raw[k].text ?? "", at: typeof raw[k].at === "number" ? raw[k].at : 0 }))
    );
  });
}

export function sendChat(roomId: string, tk: string, by: string, text: string) {
  return push(ref(getDb(), `${base(roomId)}/chat/${tk}`), {
    by,
    text: text.trim().slice(0, MAX_GUESS_LENGTH),
    at: serverTimestamp(),
  });
}

export function joinDibujo(roomId: string, clientId: string, player: DibujoPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (s.order.includes(clientId) && known?.name === player.name && known?.color === player.color) {
      return null;
    }
    return {
      ...s,
      order: s.order.includes(clientId) ? s.order : [...s.order, clientId],
      players: { ...s.players, [clientId]: player },
      scores: { ...s.scores, [clientId]: s.scores[clientId] ?? 0 },
    };
  });
}

export function startDibujo(roomId: string) {
  return mutate(roomId, (s) =>
    s.status === "waiting" && s.order.length > 0
      ? { ...s, status: "choosing", turnNo: 0, drawer: drawerForTurn(s.order, 0), phaseStartedAt: serverNow(), word: "", guessed: {} }
      : null
  );
}

export function chooseWord(roomId: string, expectedTurn: number, word: string) {
  return mutate(roomId, (s) =>
    s.status === "choosing" && s.turnNo === expectedTurn
      ? { ...s, status: "drawing", word, phaseStartedAt: serverNow() }
      : null
  );
}

/**
 * Records a correct guess (once per player per turn) and scores it: the
 * guesser by how much time was left, the drawer a fixed amount. Ends the turn
 * when `guessersNeeded` players (the connected non-drawers) have guessed.
 */
export function submitCorrectGuess(
  roomId: string,
  expectedTurn: number,
  clientId: string,
  drawSeconds: number,
  guessersNeeded: number
) {
  return mutate(roomId, (s) => {
    const drawer = s.drawer;
    if (s.status !== "drawing" || s.turnNo !== expectedTurn) return null;
    if (clientId === drawer || s.guessed[clientId]) return null;

    const now = serverNow();
    const total = drawSeconds * 1000;
    const left = Math.max(0, Math.min(total, s.phaseStartedAt + total - now));
    const points = Math.round(GUESS_MIN_POINTS + (GUESS_MAX_POINTS - GUESS_MIN_POINTS) * (left / total));

    const guessed = { ...s.guessed, [clientId]: { points, at: now } };
    const scores = { ...s.scores, [clientId]: (s.scores[clientId] ?? 0) + points };
    if (drawer) scores[drawer] = (scores[drawer] ?? 0) + DRAWER_POINTS_PER_GUESS;
    const everyone = Object.keys(guessed).length >= guessersNeeded;
    return {
      ...s,
      guessed,
      scores,
      ...(everyone ? { status: "reveal" as const, phaseStartedAt: now } : {}),
    };
  });
}

/** Time's up (or the drawer left): show the word. Applies once per turn. */
export function endTurn(roomId: string, expectedTurn: number) {
  return mutate(roomId, (s) =>
    s.status === "drawing" && s.turnNo === expectedTurn ? { ...s, status: "reveal", phaseStartedAt: serverNow() } : null
  );
}

/**
 * After the reveal (or to skip a drawer who isn't there while choosing): the
 * next player chooses, or the game ends. Applies once per turn.
 */
export function nextTurn(roomId: string, expectedTurn: number, rounds: number) {
  return mutate(roomId, (s) => {
    if (s.turnNo !== expectedTurn || (s.status !== "reveal" && s.status !== "choosing")) return null;
    const turnNo = s.turnNo + 1;
    if (turnNo >= totalTurns(s, rounds)) return { ...s, status: "finished", word: "", guessed: {} };
    return { ...s, status: "choosing", turnNo, drawer: drawerForTurn(s.order, turnNo), word: "", guessed: {}, phaseStartedAt: serverNow() };
  });
}

export function restartDibujo(roomId: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished") return null;
    const scores: Record<string, number> = {};
    for (const id of s.order) scores[id] = 0;
    return {
      ...s,
      status: "choosing",
      seed: makeSeed(),
      gameNo: s.gameNo + 1,
      turnNo: 0,
      drawer: drawerForTurn(s.order, 0),
      word: "",
      guessed: {},
      scores,
      phaseStartedAt: serverNow(),
    };
  });
}
