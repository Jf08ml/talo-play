import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { transactState } from "./transact";

/**
 * Puntos y cajas. By turns, each player draws one line between two adjacent
 * dots; closing a box claims it and earns another line. When every line is
 * drawn, the most boxes wins.
 *
 * A board of `size`×`size` boxes has (size+1)·size horizontal lines, then
 * size·(size+1) vertical ones. `lines` and `boxes` are strings with "." for
 * empty or the player's index in `order` ("0"–"3").
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const SIZE_OPTIONS = [3, 4, 5, 6] as const;
const EMPTY = ".";

export const PLAYER_COLORS = ["#22d3ee", "#f472b6", "#facc15", "#a3e635"];

export interface CajasMeta {
  game: "cajas";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  /** Boxes per side. */
  size: number;
  createdAt: number | object;
}

export type CajasStatus = "waiting" | "playing" | "finished";

export interface CajasPlayer {
  name: string;
  color: string;
}

export interface CajasState {
  status: CajasStatus;
  gameNo: number;
  players: Record<string, CajasPlayer>;
  /** This game's players, in turn order (up to four); later joiners watch. */
  order: string[];
  /** Index in `order` of whoever draws next. */
  turn: number;
  lines: string;
  boxes: string;
  lastLine: number;
  /** Indexes in `order` of the winners ("" while playing; several on a tie). */
  winners: string;
  wins: Record<string, number>;
}

export function lineCount(size: number): number {
  return 2 * size * (size + 1);
}

/** Horizontal line above box row `r` (0…size), column `c`. */
export function hLine(size: number, r: number, c: number): number {
  return r * size + c;
}

/** Vertical line left of box column `c` (0…size), row `r`. */
export function vLine(size: number, r: number, c: number): number {
  return (size + 1) * size + r * (size + 1) + c;
}

export function boxLines(size: number, box: number): number[] {
  const r = Math.floor(box / size);
  const c = box % size;
  return [hLine(size, r, c), hLine(size, r + 1, c), vLine(size, r, c), vLine(size, r, c + 1)];
}

/** Boxes that touch a line (one or two). */
export function boxesOfLine(size: number, line: number): number[] {
  const H = (size + 1) * size;
  const out: number[] = [];
  if (line < H) {
    const r = Math.floor(line / size);
    const c = line % size;
    if (r > 0) out.push((r - 1) * size + c);
    if (r < size) out.push(r * size + c);
  } else {
    const k = line - H;
    const r = Math.floor(k / (size + 1));
    const c = k % (size + 1);
    if (c > 0) out.push(r * size + c - 1);
    if (c < size) out.push(r * size + c);
  }
  return out;
}

export function countBoxes(boxes: string, player: number): number {
  let n = 0;
  for (const b of boxes) if (b === String(player)) n++;
  return n;
}

export function drawnLines(lines: string): number {
  let n = 0;
  for (const l of lines) if (l !== EMPTY) n++;
  return n;
}

function normalizeState(raw: Partial<CajasState> | null): CajasState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    order: raw.order ?? [],
    turn: raw.turn ?? 0,
    lines: raw.lines ?? "",
    boxes: raw.boxes ?? "",
    lastLine: raw.lastLine ?? -1,
    winners: raw.winners ?? "",
    wins: raw.wins ?? {},
  };
}

export function normalizeMeta(raw: Partial<CajasMeta>): Pick<CajasMeta, "size"> {
  return { size: raw.size ?? 4 };
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/cajas/state`;

function mutate(roomId: string, fn: (state: CajasState) => CajasState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createCajasRoom(params: { size: number }, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: CajasMeta = { game: "cajas", hostId, ...params, createdAt: serverTimestamp() };
  const state: Partial<CajasState> = { status: "waiting", gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getCajasMeta(roomId: string): Promise<Partial<CajasMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeCajas(roomId: string, cb: (state: CajasState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinCajas(roomId: string, clientId: string, player: CajasPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

function newGame(s: CajasState, participants: string[], size: number): CajasState {
  return {
    ...s,
    status: "playing",
    order: seededShuffle(participants, makeSeed()).slice(0, MAX_PLAYERS),
    turn: 0,
    lines: EMPTY.repeat(lineCount(size)),
    boxes: EMPTY.repeat(size * size),
    lastLine: -1,
    winners: "",
  };
}

/** Starts with up to four of `participants` (the connected players), in a random order. */
export function startCajas(roomId: string, participants: string[], size: number) {
  return mutate(roomId, (s) => {
    const ids = participants.filter((id) => s.players[id]);
    if (s.status !== "waiting" || ids.length < MIN_PLAYERS) return null;
    return newGame(s, ids, size);
  });
}

export function playAgain(roomId: string, expectedGame: number, participants: string[], size: number) {
  return mutate(roomId, (s) => {
    const ids = participants.filter((id) => s.players[id]);
    if (s.status !== "finished" || s.gameNo !== expectedGame || ids.length < MIN_PLAYERS) return null;
    return { ...newGame(s, ids, size), gameNo: s.gameNo + 1 };
  });
}

/** Draws `line` for whoever is in turn; `expectedDrawn` keeps a double tap from drawing twice. */
export function drawLine(roomId: string, clientId: string, line: number, expectedDrawn: number, size: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.order[s.turn] !== clientId) return null;
    if (drawnLines(s.lines) !== expectedDrawn || line < 0 || line >= s.lines.length || s.lines[line] !== EMPTY) return null;
    const me = String(s.turn);
    const lines = s.lines.slice(0, line) + me + s.lines.slice(line + 1);
    let boxes = s.boxes;
    let closed = 0;
    for (const b of boxesOfLine(size, line)) {
      if (boxes[b] === EMPTY && boxLines(size, b).every((l) => lines[l] !== EMPTY)) {
        boxes = boxes.slice(0, b) + me + boxes.slice(b + 1);
        closed++;
      }
    }
    const next = { ...s, lines, boxes, lastLine: line, turn: closed ? s.turn : (s.turn + 1) % s.order.length };
    if (boxes.includes(EMPTY)) return next;
    const counts = s.order.map((_, i) => countBoxes(boxes, i));
    const best = Math.max(...counts);
    const winners = s.order.map((_, i) => i).filter((i) => counts[i] === best);
    const wins = { ...s.wins };
    if (winners.length === 1) wins[s.order[winners[0]]] = (wins[s.order[winners[0]]] ?? 0) + 1;
    return { ...next, status: "finished", winners: winners.join(","), wins };
  });
}

/** The player in turn left: anyone passes their turn. Guarded by the lines drawn. */
export function skipTurn(roomId: string, expectedTurn: number, expectedDrawn: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.turn !== expectedTurn || drawnLines(s.lines) !== expectedDrawn) return null;
    return { ...s, turn: (s.turn + 1) % s.order.length };
  });
}
