import { ref, get, onValue, runTransaction, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";

/**
 * Memotest: turn-based pairs game. The deck is derived from `state.seed`, so
 * only which cards are face up / matched travels over the network. Every
 * state change goes through a transaction on `rooms/{id}/memo`, so there is no
 * host: whoever acts, the database decides.
 */

export const MEMO_SIZES = [
  { label: "Fácil", pairs: 8, cols: 4 },
  { label: "Media", pairs: 12, cols: 6 },
  { label: "Difícil", pairs: 18, cols: 6 },
] as const;

const EMOJIS = [
  "🐶", "🐱", "🦊", "🐼", "🐸", "🐵", "🦁", "🐯", "🐨", "🐷", "🐙", "🦄",
  "🐝", "🐢", "🦋", "🐬", "🍕", "🍔", "🍉", "🍓", "🍌", "🍒", "🥑", "🌮",
  "⚽", "🏀", "🎸", "🚀", "🌈", "⭐", "🎈", "🍩",
];

/** How long a non-matching pair stays face up before the turn passes. */
export const MISMATCH_REVEAL_MS = 1100;

export interface MemoMeta {
  game: "memotest";
  pairs: number;
  createdAt: number | object;
}

export type MemoStatus = "waiting" | "playing" | "finished";

export interface MemoPlayer {
  name: string;
  color: string;
}

// RTDB drops empty arrays/objects and null keys, so everything but `status`
// and `seed` may be absent on read — normalizeState fills them back in.
export interface MemoState {
  status: MemoStatus;
  seed: number;
  /** Turn order, by client id. */
  order: string[];
  players: Record<string, MemoPlayer>;
  /** Index into `order` of whoever's turn it is. */
  turn: number;
  /** Face-up cards not yet resolved (0, 1 or 2 card indexes). */
  flipped: number[];
  /** `c{cardIndex}` → client id who matched it (string keys: RTDB turns numeric-keyed objects into arrays). */
  matched: Record<string, string>;
}

function normalizeState(raw: Partial<MemoState> | null): MemoState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    order: raw.order ?? [],
    players: raw.players ?? {},
    turn: raw.turn ?? 0,
    flipped: raw.flipped ?? [],
    matched: raw.matched ?? {},
  };
}

/** The card faces for a game, identical on every client: `deck[i]` is card i's emoji. */
export function buildDeck(seed: number, pairs: number): string[] {
  const faces = seededShuffle(EMOJIS, seed).slice(0, pairs);
  return seededShuffle([...faces, ...faces], seed + 1);
}

export function scores(state: MemoState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of state.order) out[id] = 0;
  for (const owner of Object.values(state.matched)) out[owner] = (out[owner] ?? 0) + 0.5;
  return out;
}

export function cardKey(card: number): string {
  return `c${card}`;
}

function memoRef(roomId: string) {
  return ref(getDb(), `rooms/${roomId}/memo`);
}

export async function createMemotestRoom(pairs: number): Promise<string> {
  const roomId = generateRoomCode();
  const meta: MemoMeta = { game: "memotest", pairs, createdAt: serverTimestamp() };
  const state: Partial<MemoState> = { status: "waiting", seed: makeSeed(), turn: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [`rooms/${roomId}/memo`]: state,
  });
  return roomId;
}

export async function getMemoMeta(roomId: string): Promise<{ game?: string; pairs?: number } | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeMemo(roomId: string, cb: (state: MemoState | null) => void): Unsubscribe {
  return onValue(memoRef(roomId), (snap) => cb(normalizeState(snap.val())));
}

/**
 * Applies `fn` to the current state inside a transaction. `fn` returns the
 * next state, or null to leave it untouched.
 */
function mutate(roomId: string, fn: (state: MemoState) => MemoState | null) {
  return runTransaction(memoRef(roomId), (raw: Partial<MemoState> | null) => {
    const state = normalizeState(raw);
    // No local copy yet: return the raw value so the SDK fetches the real one and retries.
    if (!state) return raw;
    return fn(state) ?? undefined;
  });
}

/** Adds this player to the turn order (idempotent) and keeps their name/color fresh. */
export function joinMemo(roomId: string, clientId: string, player: MemoPlayer) {
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

export function startMemo(roomId: string) {
  return mutate(roomId, (s) =>
    s.status === "waiting" && s.order.length > 0 ? { ...s, status: "playing", turn: 0 } : null
  );
}

export function flipCard(roomId: string, clientId: string, card: number, deck: string[]) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.order[s.turn] !== clientId) return null;
    if (s.flipped.length >= 2 || s.flipped.includes(card) || s.matched[cardKey(card)] !== undefined) return null;

    const flipped = [...s.flipped, card];
    if (flipped.length < 2) return { ...s, flipped };

    const [a, b] = flipped;
    if (deck[a] !== deck[b]) return { ...s, flipped }; // stays visible until resolveMismatch

    // A pair: keep it and play again.
    const matched = { ...s.matched, [cardKey(a)]: clientId, [cardKey(b)]: clientId };
    const done = Object.keys(matched).length >= deck.length;
    return { ...s, flipped: [], matched, status: done ? "finished" : "playing" };
  });
}

/**
 * Turns a non-matching pair back down and passes the turn. Every client calls
 * this after the reveal delay; only the first one whose `pair` still matches
 * the state does anything, so a player closing the tab can't freeze the game.
 */
export function resolveMismatch(roomId: string, pair: number[]) {
  return mutate(roomId, (s) => {
    if (s.flipped.length !== 2 || s.flipped[0] !== pair[0] || s.flipped[1] !== pair[1]) return null;
    return { ...s, flipped: [], turn: (s.turn + 1) % Math.max(1, s.order.length) };
  });
}

/** Skips the turn of a player who left; `expectedTurn` guards against skipping twice. */
export function skipTurn(roomId: string, expectedTurn: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.turn !== expectedTurn) return null;
    return { ...s, flipped: [], turn: (s.turn + 1) % Math.max(1, s.order.length) };
  });
}

/** New deck, same players; whoever was second starts, so the first move rotates. */
export function restartMemo(roomId: string) {
  return mutate(roomId, (s) =>
    s.status !== "finished"
      ? null
      : {
          ...s,
          status: "playing",
          seed: makeSeed(),
          flipped: [],
          matched: {},
          turn: s.order.length ? 1 % s.order.length : 0,
        }
  );
}
