import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { getDb, getStorageInstance } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { cropSquare } from "./images";
import { EMOJI_THEMES, type TextPair } from "./memotestDecks";

/**
 * Memotest: find the pairs. The deck is derived from `state.seed` plus the
 * room's deck config (emoji theme, uploaded photos or text pairs), so only
 * which cards are face up / matched travels over the network. Every state
 * change goes through a transaction on `rooms/{id}/memo`, so there is no
 * host: whoever acts, the database decides.
 */

export const MEMO_SIZES = [
  { label: "Fácil", pairs: 8 },
  { label: "Media", pairs: 12 },
  { label: "Difícil", pairs: 18 },
] as const;

export const MIN_PAIRS = 4;
export const MAX_PAIRS = 18;
export const MAX_TEXT_LENGTH = 40;
export const TURN_SECONDS_OPTIONS = [0, 10, 20, 30] as const;

/** How long a non-matching pair stays face up before it's turned back down. */
export const MISMATCH_REVEAL_MS = 1100;

export type DeckKind = "emoji" | "fotos" | "texto";

export interface MemoRules {
  /** "turnos": one player at a time. "colab": everyone flips at once, against the clock. */
  mode: "turnos" | "colab";
  /** Turnos only: finding a pair lets you play again. */
  extraTurn: boolean;
  /** Turnos only: seconds per turn, 0 = no limit. */
  turnSeconds: number;
}

export const DEFAULT_RULES: MemoRules = { mode: "turnos", extraTurn: true, turnSeconds: 0 };

/** The room's fixed setup, as stored in `rooms/{id}/meta`. */
export interface MemoMeta {
  game: "memotest";
  /** Who created the room: starts the game (anyone can if they're away). Absent on older rooms. */
  hostId?: string;
  /** Absent on rooms created before decks were configurable (= emoji). */
  kind?: DeckKind;
  theme?: string;
  pairs: number;
  images?: string[];
  textPairs?: TextPair[];
  rules?: Partial<MemoRules>;
  createdAt: number | object;
}

/** `MemoMeta` with defaults filled in. */
export interface MemoConfig {
  kind: DeckKind;
  theme: string;
  pairs: number;
  images: string[];
  textPairs: TextPair[];
  rules: MemoRules;
}

export type CardFace =
  | { kind: "emoji"; value: string }
  | { kind: "image"; url: string }
  | { kind: "text"; value: string; side: 0 | 1 };

export interface Card {
  /** Two cards match when they share `pair` (text pairs have different faces). */
  pair: number;
  face: CardFace;
}

export type MemoStatus = "waiting" | "playing" | "finished";

export interface MemoPlayer {
  name: string;
  color: string;
}

export interface MemoState {
  status: MemoStatus;
  seed: number;
  /** Turn order, by client id. In colab mode it's just the player list. */
  order: string[];
  players: Record<string, MemoPlayer>;
  /** Index into `order` of whoever's turn it is (turnos mode). */
  turn: number;
  /** Face-up cards not yet resolved (0, 1 or 2 card indexes). */
  flipped: number[];
  /** `c{cardIndex}` → client id who matched it (string keys: RTDB turns numeric-keyed objects into arrays). */
  matched: Record<string, string>;
  /** Pairs of cards flipped so far (a "move"). */
  moves: number;
  /** Server-time ms; 0 when not set. */
  startedAt: number;
  finishedAt: number;
  turnStartedAt: number;
}

// RTDB drops empty arrays/objects and null keys, and rejects `undefined`, so
// every field gets a concrete default here and transactions never write holes.
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
    moves: raw.moves ?? 0,
    startedAt: raw.startedAt ?? 0,
    finishedAt: raw.finishedAt ?? 0,
    turnStartedAt: raw.turnStartedAt ?? 0,
  };
}

export function normalizeMeta(meta: Partial<MemoMeta>): MemoConfig {
  const kind = meta.kind ?? "emoji";
  const images = meta.images ?? [];
  const textPairs = meta.textPairs ?? [];
  return {
    kind,
    theme: meta.theme ?? EMOJI_THEMES[0].id,
    pairs: kind === "fotos" ? images.length : kind === "texto" ? textPairs.length : meta.pairs ?? 8,
    images,
    textPairs,
    rules: { ...DEFAULT_RULES, ...meta.rules },
  };
}

/** The deck for one game, identical on every client. */
export function buildDeck(seed: number, config: MemoConfig): Card[] {
  let pairs: [CardFace, CardFace][];
  if (config.kind === "fotos") {
    pairs = config.images.map((url) => [
      { kind: "image", url },
      { kind: "image", url },
    ]);
  } else if (config.kind === "texto") {
    pairs = config.textPairs.map(({ a, b }) => [
      { kind: "text", value: a, side: 0 },
      { kind: "text", value: b, side: 1 },
    ]);
  } else {
    const theme = EMOJI_THEMES.find((t) => t.id === config.theme) ?? EMOJI_THEMES[0];
    pairs = seededShuffle(theme.emojis, seed)
      .slice(0, config.pairs)
      .map((value) => [
        { kind: "emoji", value },
        { kind: "emoji", value },
      ]);
  }
  // All first halves, then all second halves (not interleaved): this is the
  // order the shuffle saw before decks were configurable, so older rooms keep
  // their exact layout.
  const cards: Card[] = [0, 1].flatMap((side) =>
    pairs.map((faces, pair) => ({ pair, face: faces[side] }))
  );
  return seededShuffle(cards, seed + 1);
}

export function cardKey(card: number): string {
  return `c${card}`;
}

export function scores(state: MemoState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of state.order) out[id] = 0;
  for (const owner of Object.values(state.matched)) out[owner] = (out[owner] ?? 0) + 0.5;
  return out;
}

function memoRef(roomId: string) {
  return ref(getDb(), `rooms/${roomId}/memo`);
}

export type CreateMemoParams =
  | { kind: "emoji"; theme: string; pairs: number; rules: MemoRules }
  | { kind: "fotos"; files: File[]; rules: MemoRules }
  | { kind: "texto"; textPairs: TextPair[]; rules: MemoRules };

export async function createMemotestRoom(params: CreateMemoParams, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: MemoMeta = {
    game: "memotest",
    hostId,
    kind: params.kind,
    pairs: 0,
    rules: params.rules,
    createdAt: serverTimestamp(),
  };

  if (params.kind === "emoji") {
    meta.theme = params.theme;
    meta.pairs = params.pairs;
  } else if (params.kind === "fotos") {
    const storage = getStorageInstance();
    meta.images = await Promise.all(
      params.files.map(async (file, i) => {
        const blob = await cropSquare(file, 320);
        const fileRef = storageRef(storage, `rooms/${roomId}/card-${i}.jpg`);
        await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
        return getDownloadURL(fileRef);
      })
    );
    meta.pairs = meta.images.length;
  } else {
    meta.textPairs = params.textPairs.map(({ a, b }) => ({
      a: a.trim().slice(0, MAX_TEXT_LENGTH),
      b: b.trim().slice(0, MAX_TEXT_LENGTH),
    }));
    meta.pairs = meta.textPairs.length;
  }

  const state: Partial<MemoState> = { status: "waiting", seed: makeSeed(), turn: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [`rooms/${roomId}/memo`]: state,
  });
  return roomId;
}

export async function getMemoMeta(roomId: string): Promise<Partial<MemoMeta> | null> {
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
  return transactState(`rooms/${roomId}/memo`, normalizeState, fn);
}

function nextTurn(s: MemoState): number {
  return (s.turn + 1) % Math.max(1, s.order.length);
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
  return mutate(roomId, (s) => {
    if (s.status !== "waiting" || s.order.length === 0) return null;
    const now = serverNow();
    return { ...s, status: "playing", turn: 0, moves: 0, startedAt: now, turnStartedAt: now };
  });
}

export function flipCard(roomId: string, clientId: string, card: number, deck: Card[], rules: MemoRules) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing") return null;
    if (rules.mode === "turnos" && s.order[s.turn] !== clientId) return null;
    if (s.flipped.length >= 2 || s.flipped.includes(card) || s.matched[cardKey(card)] !== undefined) {
      return null;
    }

    const flipped = [...s.flipped, card];
    if (flipped.length < 2) return { ...s, flipped };

    const [a, b] = flipped;
    const moves = s.moves + 1;
    if (deck[a].pair !== deck[b].pair) return { ...s, flipped, moves }; // stays visible until resolveMismatch

    const now = serverNow();
    const matched = { ...s.matched, [cardKey(a)]: clientId, [cardKey(b)]: clientId };
    const done = Object.keys(matched).length >= deck.length;
    const keepsTurn = rules.mode === "colab" || rules.extraTurn;
    return {
      ...s,
      flipped: [],
      matched,
      moves,
      status: done ? "finished" : "playing",
      finishedAt: done ? now : 0,
      turn: keepsTurn ? s.turn : nextTurn(s),
      turnStartedAt: now,
    };
  });
}

/**
 * Turns a non-matching pair back down (and in turnos mode passes the turn).
 * Every client calls this after the reveal delay; only the first one whose
 * `pair` still matches the state does anything, so a player closing the tab
 * can't freeze the game.
 */
export function resolveMismatch(roomId: string, pair: number[], rules: MemoRules) {
  return mutate(roomId, (s) => {
    if (s.flipped.length !== 2 || s.flipped[0] !== pair[0] || s.flipped[1] !== pair[1]) return null;
    if (rules.mode === "colab") return { ...s, flipped: [] };
    return { ...s, flipped: [], turn: nextTurn(s), turnStartedAt: serverNow() };
  });
}

/**
 * Passes the turn of a player who ran out of time or left. Called by any
 * client; the expected turn/start guard makes concurrent calls apply once.
 * A pending mismatch is left to resolveMismatch.
 */
export function passTurn(roomId: string, expectedTurn: number, expectedTurnStartedAt: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.turn !== expectedTurn) return null;
    if (s.turnStartedAt !== expectedTurnStartedAt || s.flipped.length === 2) return null;
    return { ...s, flipped: [], turn: nextTurn(s), turnStartedAt: serverNow() };
  });
}

/** New shuffle, same players; whoever was second starts, so the first move rotates. */
export function restartMemo(roomId: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished") return null;
    const now = serverNow();
    return {
      ...s,
      status: "playing",
      seed: makeSeed(),
      flipped: [],
      matched: {},
      moves: 0,
      startedAt: now,
      finishedAt: 0,
      turnStartedAt: now,
      turn: s.order.length ? 1 % s.order.length : 0,
    };
  });
}
