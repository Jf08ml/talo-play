import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { transactState } from "./transact";
import type { RetoLevel } from "./retoPrompts";

/**
 * Verdad o reto. By turns, the player in turn picks verdad or reto and gets a
 * random unused card; anyone else decides whether they did it (+1) or
 * chickened out. It never ends: players who join get added to the turn order,
 * and whoever isn't connected is skipped.
 */

export const MIN_PLAYERS = 3;

export type Kind = "verdad" | "reto";

export interface RetoMeta {
  game: "reto";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  levels: RetoLevel[];
  createdAt: number | object;
}

export type RetoStatus = "waiting" | "choosing" | "card";

export interface RetoPlayer {
  name: string;
  color: string;
}

export interface RetoState {
  status: RetoStatus;
  players: Record<string, RetoPlayer>;
  order: string[];
  /** Whose turn it is. */
  current: string;
  turnNo: number;
  card: { kind: Kind | ""; idx: number };
  /** Cards already shown, keyed `v{idx}` / `r{idx}`. */
  used: Record<string, boolean>;
  /** The previous turn's outcome, for everyone to see. */
  last: { by: string; kind: Kind | ""; idx: number; done: boolean };
  scores: Record<string, number>;
  /** Times each player chickened out. */
  chickens: Record<string, number>;
}

function normalizeState(raw: Partial<RetoState> | null): RetoState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    players: raw.players ?? {},
    order: raw.order ?? [],
    current: raw.current ?? "",
    turnNo: raw.turnNo ?? 0,
    card: { kind: raw.card?.kind ?? "", idx: raw.card?.idx ?? -1 },
    used: raw.used ?? {},
    last: { by: raw.last?.by ?? "", kind: raw.last?.kind ?? "", idx: raw.last?.idx ?? -1, done: raw.last?.done ?? false },
    scores: raw.scores ?? {},
    chickens: raw.chickens ?? {},
  };
}

export function normalizeMeta(raw: Partial<RetoMeta>): Pick<RetoMeta, "levels"> {
  return { levels: raw.levels?.length ? raw.levels : ["tranqui"] };
}

const usedKey = (kind: Kind, idx: number) => `${kind === "verdad" ? "v" : "r"}${idx}`;

/**
 * The next player after `current` who is connected; players connected but not
 * in the order yet are appended first.
 */
function advance(s: RetoState, connected: string[]): RetoState {
  const order = [...s.order, ...connected.filter((id) => s.players[id] && !s.order.includes(id))];
  const here = order.filter((id) => connected.includes(id));
  if (here.length === 0) return { ...s, order };
  const from = order.indexOf(s.current);
  let next = here[0];
  for (let k = 1; k <= order.length; k++) {
    const id = order[(from + k) % order.length];
    if (connected.includes(id)) {
      next = id;
      break;
    }
  }
  return { ...s, order, current: next, turnNo: s.turnNo + 1, status: "choosing", card: { kind: "", idx: -1 } };
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/reto/state`;

function mutate(roomId: string, fn: (state: RetoState) => RetoState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createRetoRoom(params: { levels: RetoLevel[] }, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: RetoMeta = { game: "reto", hostId, ...params, createdAt: serverTimestamp() };
  const state: Partial<RetoState> = { status: "waiting" };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getRetoMeta(roomId: string): Promise<Partial<RetoMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeReto(roomId: string, cb: (state: RetoState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinReto(roomId: string, clientId: string, player: RetoPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

/** Shuffles the connected players into a turn order and gives the first turn. */
export function startReto(roomId: string, connected: string[]) {
  return mutate(roomId, (s) => {
    const ids = connected.filter((id) => s.players[id]);
    if (s.status !== "waiting" || ids.length < MIN_PLAYERS) return null;
    const order = seededShuffle(ids, makeSeed());
    return { ...s, status: "choosing", order, current: order[0], turnNo: 0, card: { kind: "", idx: -1 } };
  });
}

/** The player in turn picks verdad or reto: a random card not used yet (all again once they run out). */
export function pickCard(roomId: string, clientId: string, expectedTurn: number, kind: Kind, poolSize: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "choosing" || s.turnNo !== expectedTurn || s.current !== clientId || poolSize < 1) return null;
    let free = Array.from({ length: poolSize }, (_, i) => i).filter((i) => !s.used[usedKey(kind, i)]);
    let used = s.used;
    if (free.length === 0) {
      used = Object.fromEntries(Object.entries(s.used).filter(([k]) => !k.startsWith(kind === "verdad" ? "v" : "r")));
      free = Array.from({ length: poolSize }, (_, i) => i);
    }
    const idx = free[Math.floor(Math.random() * free.length)];
    return { ...s, status: "card", card: { kind, idx }, used: { ...used, [usedKey(kind, idx)]: true } };
  });
}

/** Someone else decides: did they do it? Then the turn moves on. */
export function judge(roomId: string, clientId: string, expectedTurn: number, done: boolean, connected: string[]) {
  return mutate(roomId, (s) => {
    if (s.status !== "card" || s.turnNo !== expectedTurn || s.current === clientId || !s.players[clientId]) return null;
    const who = s.current;
    const scores = done ? { ...s.scores, [who]: (s.scores[who] ?? 0) + 1 } : s.scores;
    const chickens = done ? s.chickens : { ...s.chickens, [who]: (s.chickens[who] ?? 0) + 1 };
    const last = { by: who, kind: s.card.kind, idx: s.card.idx, done };
    return advance({ ...s, scores, chickens, last }, connected);
  });
}

/** The player in turn left: on to the next one. */
export function skipTurn(roomId: string, expectedTurn: number, connected: string[]) {
  return mutate(roomId, (s) => (s.status !== "waiting" && s.turnNo === expectedTurn ? advance(s, connected) : null));
}
