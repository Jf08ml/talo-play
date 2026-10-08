import { ref, get, onValue, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { getDb, getStorageInstance } from "./firebase";
import { generateRoomCode } from "./ids";
import { cropSquare } from "./images";
import { makeSeed, mulberry32 } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";

/**
 * Rompecabezas deslizante, race mode. Everyone gets the same scramble
 * (derived from `state.seed`) and solves their own copy; each player writes
 * only their own board, and the race (countdown, results, winner) goes
 * through transactions.
 *
 * A board is `tiles[position] = tile`, where tile `t` (1…n-1) belongs at
 * position `t - 1` and 0 is the gap, which belongs at the last position.
 */

export const SIZES = [
  { label: "Fácil", size: 3 },
  { label: "Media", size: 4 },
  { label: "Difícil", size: 5 },
] as const;

export const COUNTDOWN_MS = 3000;
const IMAGE_PX = 720;

export interface DeslizMeta {
  game: "deslizante";
  size: number;
  imageUrl: string;
  showNumbers: boolean;
  createdAt: number | object;
}

export type DeslizStatus = "waiting" | "racing";

export interface DeslizPlayer {
  name: string;
  color: string;
}

export interface DeslizResult {
  ms: number;
  moves: number;
}

export interface DeslizState {
  status: DeslizStatus;
  seed: number;
  /** Increments on each new race so boards from earlier races never mix in. */
  gameNo: number;
  /** Server time when moves are allowed (after the countdown). */
  startedAt: number;
  players: Record<string, DeslizPlayer>;
  results: Record<string, DeslizResult>;
  /** First to finish; "" until then. */
  winner: string;
}

export interface PlayerBoard {
  tiles: number[];
  moves: number;
}

function normalizeState(raw: Partial<DeslizState> | null): DeslizState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    startedAt: raw.startedAt ?? 0,
    players: raw.players ?? {},
    results: raw.results ?? {},
    winner: raw.winner ?? "",
  };
}

export function solvedTiles(size: number): number[] {
  const n = size * size;
  return [...Array.from({ length: n - 1 }, (_, i) => i + 1), 0];
}

export function correctCount(tiles: number[]): number {
  return tiles.filter((t, i) => t !== 0 && t === i + 1).length;
}

export function isSolved(tiles: number[]): boolean {
  return tiles.length > 0 && correctCount(tiles) === tiles.length - 1;
}

function neighbors(pos: number, size: number): number[] {
  const r = Math.floor(pos / size);
  const c = pos % size;
  const out: number[] = [];
  if (r > 0) out.push(pos - size);
  if (r < size - 1) out.push(pos + size);
  if (c > 0) out.push(pos - 1);
  if (c < size - 1) out.push(pos + 1);
  return out;
}

/**
 * The race's starting board: a seeded random walk of the gap from the solved
 * position (so it's always solvable), never undoing the previous step, and
 * long enough to leave few tiles in place.
 */
export function scramble(size: number, seed: number): number[] {
  const tiles = solvedTiles(size);
  const rand = mulberry32(seed);
  let gap = tiles.length - 1;
  let prev = -1;
  const steps = tiles.length * 30;
  for (let i = 0; i < steps || correctCount(tiles) > size; i++) {
    const options = neighbors(gap, size).filter((p) => p !== prev);
    const next = options[Math.floor(rand() * options.length)];
    tiles[gap] = tiles[next];
    tiles[next] = 0;
    prev = gap;
    gap = next;
  }
  return tiles;
}

/**
 * Moves toward the gap every tile between `pos` and the gap, if `pos` shares
 * its row or column. Returns the new board and how many tiles moved (0 = not
 * a valid move).
 */
export function slide(tiles: number[], size: number, pos: number): { tiles: number[]; moved: number } {
  const gap = tiles.indexOf(0);
  if (pos === gap || pos < 0 || pos >= tiles.length) return { tiles, moved: 0 };
  const sameRow = Math.floor(pos / size) === Math.floor(gap / size);
  const sameCol = pos % size === gap % size;
  if (!sameRow && !sameCol) return { tiles, moved: 0 };

  const step = sameRow ? (pos > gap ? 1 : -1) : pos > gap ? size : -size;
  const next = tiles.slice();
  let g = gap;
  while (g !== pos) {
    next[g] = next[g + step];
    g += step;
  }
  next[pos] = 0;
  return { tiles: next, moved: Math.abs(pos - gap) / Math.abs(step) };
}

/** Arrow keys move the tile *into* the gap from the opposite side, as on a physical puzzle. */
export function arrowTarget(tiles: number[], size: number, key: string): number {
  const gap = tiles.indexOf(0);
  const r = Math.floor(gap / size);
  const c = gap % size;
  if (key === "ArrowUp" && r < size - 1) return gap + size;
  if (key === "ArrowDown" && r > 0) return gap - size;
  if (key === "ArrowLeft" && c < size - 1) return gap + 1;
  if (key === "ArrowRight" && c > 0) return gap - 1;
  return -1;
}

// ---- Firebase ------------------------------------------------------------

const base = (roomId: string) => `rooms/${roomId}/desliz`;

function mutate(roomId: string, fn: (state: DeslizState) => DeslizState | null) {
  return transactState(`${base(roomId)}/state`, normalizeState, fn);
}

export async function createDeslizRoom(params: { file: File; size: number; showNumbers: boolean }): Promise<string> {
  const roomId = generateRoomCode();
  const blob = await cropSquare(params.file, IMAGE_PX, 0.9);
  const imgRef = storageRef(getStorageInstance(), `rooms/${roomId}/image.jpg`);
  await uploadBytes(imgRef, blob, { contentType: "image/jpeg" });
  const imageUrl = await getDownloadURL(imgRef);

  const meta: DeslizMeta = {
    game: "deslizante",
    size: params.size,
    imageUrl,
    showNumbers: params.showNumbers,
    createdAt: serverTimestamp(),
  };
  const state: Partial<DeslizState> = { status: "waiting", seed: makeSeed(), gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [`${base(roomId)}/state`]: state,
  });
  return roomId;
}

export async function getDeslizMeta(roomId: string): Promise<Partial<DeslizMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeDesliz(
  roomId: string,
  cb: (data: { state: DeslizState | null; boards: Record<string, Record<string, PlayerBoard>> }) => void
): Unsubscribe {
  return onValue(ref(getDb(), base(roomId)), (snap) => {
    const raw = (snap.val() ?? {}) as {
      state?: Partial<DeslizState>;
      boards?: Record<string, Record<string, Partial<PlayerBoard>>>;
    };
    const boards: Record<string, Record<string, PlayerBoard>> = {};
    for (const [g, byPlayer] of Object.entries(raw.boards ?? {})) {
      boards[g] = {};
      for (const [id, b] of Object.entries(byPlayer)) boards[g][id] = { tiles: b.tiles ?? [], moves: b.moves ?? 0 };
    }
    cb({ state: normalizeState(raw.state ?? null), boards });
  });
}

export function gameKey(state: Pick<DeslizState, "gameNo">): string {
  return `g${state.gameNo}`;
}

export function saveBoard(roomId: string, gk: string, clientId: string, board: PlayerBoard) {
  return set(ref(getDb(), `${base(roomId)}/boards/${gk}/${clientId}`), board);
}

export function joinDesliz(roomId: string, clientId: string, player: DeslizPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

/** Starts the countdown; moves unlock for everyone at `startedAt`. */
export function startRace(roomId: string) {
  return mutate(roomId, (s) =>
    s.status === "waiting" ? { ...s, status: "racing", startedAt: serverNow() + COUNTDOWN_MS } : null
  );
}

/** Records my time (once per race); the first one to report wins. */
export function reportFinish(roomId: string, expectedGame: number, clientId: string, moves: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "racing" || s.gameNo !== expectedGame || s.results[clientId]) return null;
    const ms = Math.max(0, serverNow() - s.startedAt);
    return {
      ...s,
      results: { ...s.results, [clientId]: { ms, moves } },
      winner: s.winner || clientId,
    };
  });
}

/** A new scramble, back to the waiting room. Only once someone has won. */
export function newRace(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) =>
    s.gameNo !== expectedGame || !s.winner
      ? null
      : { ...s, status: "waiting", seed: makeSeed(), gameNo: s.gameNo + 1, startedAt: 0, results: {}, winner: "" }
  );
}
