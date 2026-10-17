import { ref, get, onValue, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import type { Stroke } from "./dibujo";

/**
 * Teléfono descompuesto (drawn). Everyone writes a phrase; then the chains
 * pass from hand to hand, alternating drawing what the last entry said and
 * describing the drawing that arrived. At step k, player i of `order` works
 * on chain (i − k) mod N: even steps are text, odd steps drawings. When every
 * chain went around, the room watches them one by one in the album.
 *
 * Entries are plain writes at `telefono/g{gameNo}/c{chain}/s{step}` (each
 * player writes only theirs); the step only moves through `telefono/state`
 * transactions, when every connected player is done or time runs out.
 */

export const MIN_PLAYERS = 3;
export const MAX_STEPS = 10;
export const WRITE_SECONDS = 45;
export const DRAW_OPTIONS = [60, 90, 120] as const;
/** Extra time after a step's deadline before anyone may force it on. */
export const GRACE_MS = 4000;
export const MAX_TEXT_LENGTH = 80;

export interface TelefonoMeta {
  game: "telefono";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  drawSeconds: number;
  createdAt: number | object;
}

export type TelefonoStatus = "waiting" | "playing" | "album";

export interface TelefonoPlayer {
  name: string;
  color: string;
}

export interface TelefonoState {
  status: TelefonoStatus;
  gameNo: number;
  players: Record<string, TelefonoPlayer>;
  /** Who plays this game, fixed at the start; chain i starts with order[i]. */
  order: string[];
  step: number;
  stepStartedAt: number;
  /** Who already handed in the current step. */
  done: Record<string, boolean>;
  /** Album: which chain is shown and how many of its entries are uncovered. */
  albumChain: number;
  albumStep: number;
}

export interface Entry {
  by: string;
  text?: string;
  strokes?: Stroke[];
}

function normalizeState(raw: Partial<TelefonoState> | null): TelefonoState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    order: raw.order ?? [],
    step: raw.step ?? 0,
    stepStartedAt: raw.stepStartedAt ?? 0,
    done: raw.done ?? {},
    albumChain: raw.albumChain ?? 0,
    albumStep: raw.albumStep ?? 0,
  };
}

export function normalizeEntry(raw: Partial<Entry> | null): Entry | null {
  if (!raw || !raw.by) return null;
  return {
    by: raw.by,
    text: raw.text,
    strokes: raw.strokes?.map((s) => ({ color: s.color ?? "#000", width: s.width ?? 6, points: s.points ?? [] })),
  };
}

export function totalSteps(s: Pick<TelefonoState, "order">): number {
  return Math.min(s.order.length, MAX_STEPS);
}

export function isDrawStep(step: number): boolean {
  return step % 2 === 1;
}

/** The chain player `id` works on at `step` (-1 if they're not in this game). */
export function chainOf(s: Pick<TelefonoState, "order">, id: string, step: number): number {
  const i = s.order.indexOf(id);
  if (i < 0) return -1;
  const n = s.order.length;
  return (((i - step) % n) + n) % n;
}

export function stepSeconds(step: number, drawSeconds: number): number {
  return isDrawStep(step) ? drawSeconds : WRITE_SECONDS;
}

/** Ideas for the first phrase, for whoever goes blank. */
export const PHRASE_IDEAS = [
  "Un gato manejando un colectivo",
  "Mi abuela haciendo paracaidismo",
  "Un dinosaurio tomando mate",
  "Un pingüino en la playa con sombrilla",
  "El presidente bailando cumbia",
  "Un robot enamorado de una heladera",
  "Una vaca en patineta",
  "Un fantasma con miedo a la oscuridad",
  "Un perro cocinando un asado",
  "Un astronauta perdido en el supermercado",
  "Una sirena en el subte",
  "Un caracol ganando una carrera",
  "Un oso haciendo yoga",
  "Un pirata con celular",
  "Una pizza volando por el espacio",
  "Un mago que se olvidó el truco",
  "Un elefante escondido detrás de un árbol",
  "Un superhéroe lavando los platos",
  "Una jirafa con bufanda",
  "Un tiburón en una pileta de lona",
];

// ---- Firebase ------------------------------------------------------------

const base = (roomId: string) => `rooms/${roomId}/telefono`;
const statePath = (roomId: string) => `${base(roomId)}/state`;
const entryPath = (roomId: string, gameNo: number, chain: number, step: number) =>
  `${base(roomId)}/g${gameNo}/c${chain}/s${step}`;

function mutate(roomId: string, fn: (state: TelefonoState) => TelefonoState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createTelefonoRoom(params: { drawSeconds: number }, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: TelefonoMeta = { game: "telefono", hostId, ...params, createdAt: serverTimestamp() };
  const state: Partial<TelefonoState> = { status: "waiting", gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getTelefonoMeta(roomId: string): Promise<Partial<TelefonoMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeTelefono(roomId: string, cb: (state: TelefonoState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function subscribeEntry(
  roomId: string,
  gameNo: number,
  chain: number,
  step: number,
  cb: (entry: Entry | null) => void
): Unsubscribe {
  return onValue(ref(getDb(), entryPath(roomId, gameNo, chain, step)), (snap) => cb(normalizeEntry(snap.val())));
}

/** Every chain of a game, for the album: chain → step → entry. */
export function subscribeChains(roomId: string, gameNo: number, cb: (chains: (Entry | null)[][]) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/g${gameNo}`), (snap) => {
    const raw = (snap.val() ?? {}) as Record<string, Record<string, Partial<Entry>>>;
    const chains: (Entry | null)[][] = [];
    for (const [ck, steps] of Object.entries(raw)) {
      const c = Number(ck.slice(1));
      chains[c] = [];
      for (const [sk, e] of Object.entries(steps ?? {})) chains[c][Number(sk.slice(1))] = normalizeEntry(e);
    }
    cb(chains);
  });
}

export function joinTelefono(roomId: string, clientId: string, player: TelefonoPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

export function startTelefono(roomId: string, connected: string[]) {
  return mutate(roomId, (s) => {
    const ids = connected.filter((id) => s.players[id]);
    if (s.status !== "waiting" || ids.length < MIN_PLAYERS) return null;
    return {
      ...s,
      status: "playing",
      order: seededShuffle(ids, makeSeed()),
      step: 0,
      stepStartedAt: serverNow(),
      done: {},
      albumChain: 0,
      albumStep: 0,
    };
  });
}

function nextStep(s: TelefonoState): TelefonoState {
  if (s.step + 1 >= totalSteps(s)) return { ...s, status: "album", done: {}, albumChain: 0, albumStep: 0 };
  return { ...s, step: s.step + 1, stepStartedAt: serverNow(), done: {} };
}

/**
 * Saves my entry for the step and marks me done; the step moves on once every
 * player in `connected` (those of the order still here) is done.
 */
export async function submitEntry(
  roomId: string,
  state: Pick<TelefonoState, "gameNo" | "order" | "step">,
  clientId: string,
  entry: { text?: string; strokes?: Stroke[] },
  connected: string[]
) {
  const chain = chainOf(state, clientId, state.step);
  if (chain < 0) return;
  const value: Entry = { by: clientId };
  if (entry.text !== undefined) value.text = entry.text.trim().slice(0, MAX_TEXT_LENGTH);
  if (entry.strokes) value.strokes = entry.strokes;
  await set(ref(getDb(), entryPath(roomId, state.gameNo, chain, state.step)), value);
  const expectedStep = state.step;
  const expectedGame = state.gameNo;
  await mutate(roomId, (s) => {
    if (s.status !== "playing" || s.step !== expectedStep || s.gameNo !== expectedGame || s.done[clientId]) return null;
    const done = { ...s.done, [clientId]: true };
    const waiting = connected.filter((id) => s.order.includes(id) && !done[id]);
    return waiting.length === 0 ? nextStep({ ...s, done }) : { ...s, done };
  });
}

/** Someone left or ran out of time: move on with what there is. */
export function forceNextStep(roomId: string, expectedGame: number, expectedStep: number) {
  return mutate(roomId, (s) =>
    s.status === "playing" && s.gameNo === expectedGame && s.step === expectedStep ? nextStep(s) : null
  );
}

/** Album: uncovers the next entry, or goes to the next chain. */
export function albumNext(roomId: string, expected: { chain: number; step: number }) {
  return mutate(roomId, (s) => {
    if (s.status !== "album" || s.albumChain !== expected.chain || s.albumStep !== expected.step) return null;
    if (s.albumStep + 1 < totalSteps(s)) return { ...s, albumStep: s.albumStep + 1 };
    if (s.albumChain + 1 < s.order.length) return { ...s, albumChain: s.albumChain + 1, albumStep: 0 };
    return null;
  });
}

/** Back to the waiting room, so whoever is here now plays the next game. */
export function playAgain(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "album" || s.gameNo !== expectedGame) return null;
    return { ...s, status: "waiting", gameNo: s.gameNo + 1, order: [], step: 0, done: {}, albumChain: 0, albumStep: 0 };
  });
}
