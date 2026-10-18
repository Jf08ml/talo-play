import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { transactState } from "./transact";
import { joinSeats, leaveSeatIn, otherSeat, seatOf2, swapSeatsIn, takeSeatIn, type Seat2, type SeatPlayer } from "./twoSeats";

/**
 * Otelo (Reversi) on 8×8. Seat `a` plays black and moves first, `b` white;
 * everyone else watches. A move must flank at least one rival line (in any of
 * the 8 directions), which flips to your color. Without a move you pass
 * (automatically); when neither can move, the one with more discs wins.
 *
 * The board is a 64-character string, row-major from the top: "." empty,
 * "a"/"b" a disc.
 */

export const SIZE = 8;
const EMPTY = ".";

export type Seat = Seat2;
export type OteloStatus = "waiting" | "playing" | "finished";
export type EndReason = "" | "full" | "resign";

export const SEAT_STYLE: Record<Seat, { label: string; fill: string; ring: string }> = {
  a: { label: "Negras", fill: "#111827", ring: "#475569" },
  b: { label: "Blancas", fill: "#f8fafc", ring: "#cbd5e1" },
};

export interface OteloMeta {
  game: "otelo";
  hostId?: string;
  createdAt: number | object;
}

export interface OteloState {
  status: OteloStatus;
  gameNo: number;
  players: Record<string, SeatPlayer>;
  seats: Record<Seat, string>;
  cells: string;
  turn: Seat;
  /** Square of the last disc placed (-1 none) and the discs it flipped ("3,11,19"). */
  last: number;
  flipped: string;
  /** Who had to pass on the last move ("" nobody). */
  passed: Seat | "";
  moveNo: number;
  winner: Seat | "draw" | "";
  endReason: EndReason;
  wins: Record<string, number>;
}

export function initialCells(): string {
  const cells = Array<string>(SIZE * SIZE).fill(EMPTY);
  cells[3 * SIZE + 3] = "b";
  cells[3 * SIZE + 4] = "a";
  cells[4 * SIZE + 3] = "a";
  cells[4 * SIZE + 4] = "b";
  return cells.join("");
}

function normalizeState(raw: Partial<OteloState> | null): OteloState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    seats: { a: raw.seats?.a ?? "", b: raw.seats?.b ?? "" },
    cells: raw.cells && raw.cells.length === SIZE * SIZE ? raw.cells : initialCells(),
    turn: raw.turn ?? "a",
    last: raw.last ?? -1,
    flipped: raw.flipped ?? "",
    passed: raw.passed ?? "",
    moveNo: raw.moveNo ?? 0,
    winner: raw.winner ?? "",
    endReason: raw.endReason ?? "",
    wins: raw.wins ?? {},
  };
}

export { otherSeat };
export const seatOf = seatOf2;

const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
] as const;

/** The discs placing `side` at `idx` would flip (empty = not a legal move). */
export function flipsFor(cells: string, side: Seat, idx: number): number[] {
  if (cells[idx] !== EMPTY) return [];
  const rival = otherSeat(side);
  const r0 = Math.floor(idx / SIZE);
  const c0 = idx % SIZE;
  const out: number[] = [];
  for (const [dr, dc] of DIRS) {
    const line: number[] = [];
    let r = r0 + dr;
    let c = c0 + dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && cells[r * SIZE + c] === rival) {
      line.push(r * SIZE + c);
      r += dr;
      c += dc;
    }
    if (line.length && r >= 0 && r < SIZE && c >= 0 && c < SIZE && cells[r * SIZE + c] === side) out.push(...line);
  }
  return out;
}

/** Squares where `side` can play. */
export function legalSquares(cells: string, side: Seat): number[] {
  const out: number[] = [];
  for (let i = 0; i < SIZE * SIZE; i++) if (flipsFor(cells, side, i).length) out.push(i);
  return out;
}

export function discCount(cells: string, side: Seat): number {
  let n = 0;
  for (const ch of cells) if (ch === side) n++;
  return n;
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/otelo/state`;

function mutate(roomId: string, fn: (state: OteloState) => OteloState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createOteloRoom(hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: OteloMeta = { game: "otelo", hostId, createdAt: serverTimestamp() };
  const state: Partial<OteloState> = { status: "waiting", gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getOteloMeta(roomId: string): Promise<Partial<OteloMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeOtelo(roomId: string, cb: (state: OteloState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export const joinOtelo = (roomId: string, clientId: string, player: SeatPlayer) =>
  mutate(roomId, (s) => joinSeats(s, clientId, player));
export const takeSeat = (roomId: string, clientId: string, seat: Seat, expected: string) =>
  mutate(roomId, (s) => takeSeatIn(s, clientId, seat, expected));
export const leaveSeat = (roomId: string, clientId: string) => mutate(roomId, (s) => leaveSeatIn(s, clientId));
export const swapSeats = (roomId: string) => mutate(roomId, (s) => swapSeatsIn(s));

function freshBoard(s: OteloState): OteloState {
  return {
    ...s,
    status: "playing",
    cells: initialCells(),
    turn: "a",
    last: -1,
    flipped: "",
    passed: "",
    moveNo: 0,
    winner: "",
    endReason: "",
  };
}

export function startOtelo(roomId: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting" || !s.seats.a || !s.seats.b || s.seats.a === s.seats.b) return null;
    return freshBoard(s);
  });
}

function finish(s: OteloState, winner: Seat | "draw", endReason: EndReason): OteloState {
  const id = winner === "draw" ? "" : s.seats[winner];
  return { ...s, status: "finished", winner, endReason, wins: id ? { ...s.wins, [id]: (s.wins[id] ?? 0) + 1 } : s.wins };
}

export function placeDisc(roomId: string, clientId: string, idx: number, expectedMoveNo: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.seats[s.turn] !== clientId || s.moveNo !== expectedMoveNo) return null;
    const flips = flipsFor(s.cells, s.turn, idx);
    if (flips.length === 0) return null;
    const out = [...s.cells];
    out[idx] = s.turn;
    for (const f of flips) out[f] = s.turn;
    const cells = out.join("");
    const base = { ...s, cells, last: idx, flipped: flips.join(","), moveNo: s.moveNo + 1 };
    const rival = otherSeat(s.turn);
    if (legalSquares(cells, rival).length) return { ...base, turn: rival, passed: "" as const };
    if (legalSquares(cells, s.turn).length) return { ...base, passed: rival };
    const a = discCount(cells, "a");
    const b = discCount(cells, "b");
    return finish(base, a === b ? "draw" : a > b ? "a" : "b", "full");
  });
}

export function resign(roomId: string, clientId: string) {
  return mutate(roomId, (s) => {
    const mine = seatOf(s, clientId);
    if (s.status !== "playing" || !mine) return null;
    return finish(s, otherSeat(mine), "resign");
  });
}

/** Same players, swapping colors: whoever played white now starts with black. */
export function rematch(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    const swapped = { ...s, gameNo: s.gameNo + 1, seats: { a: s.seats.b, b: s.seats.a } };
    return swapped.seats.a && swapped.seats.b ? freshBoard(swapped) : { ...freshBoard(swapped), status: "waiting" };
  });
}
