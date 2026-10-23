import { ref, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { transactState } from "./transact";
import { joinSeats, leaveSeatIn, otherSeat, seatOf2, swapSeatsIn, takeSeatIn, type Seat2, type SeatPlayer } from "./twoSeats";

/**
 * Triqui (ta-te-ti) on 3×3. Seat `a` plays X and moves first, `b` plays O;
 * everyone else watches. Three in a row (row, column or diagonal) wins.
 *
 * Variants: `clasico` (a full board without a line is a draw) and `infinito`
 * (each side keeps only its last `INFINITE_KEEP` marks: placing a fourth
 * removes its oldest, so there are no draws).
 *
 * The game is stored as `moves`, the squares played in order ("4031…", one
 * digit each); turns alternate from `a`, so even indexes are `a`'s. The board
 * is derived from it (`cellsOf`), never stored.
 */

export const SIZE = 3;
export const INFINITE_KEEP = 3;
const EMPTY = ".";

export type Seat = Seat2;
export type TriquiStatus = "waiting" | "playing" | "finished";
export type Variant = "clasico" | "infinito";
export type EndReason = "" | "line" | "full" | "resign";

export const VARIANTS: Variant[] = ["clasico", "infinito"];

export const SEAT_STYLE: Record<Seat, { label: string; mark: string; color: string }> = {
  a: { label: "Cruz", mark: "X", color: "#22d3ee" },
  b: { label: "Círculo", mark: "O", color: "#fb7185" },
};

export const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export interface TriquiMeta {
  game: "triqui";
  variant: Variant;
  hostId?: string;
  createdAt: number | object;
}

export interface TriquiState {
  status: TriquiStatus;
  gameNo: number;
  variant: Variant;
  players: Record<string, SeatPlayer>;
  seats: Record<Seat, string>;
  moves: string;
  winner: Seat | "draw" | "";
  endReason: EndReason;
  wins: Record<string, number>;
}

function normalizeState(raw: Partial<TriquiState> | null): TriquiState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    variant: raw.variant === "infinito" ? "infinito" : "clasico",
    players: raw.players ?? {},
    seats: { a: raw.seats?.a ?? "", b: raw.seats?.b ?? "" },
    moves: raw.moves ?? "",
    winner: raw.winner ?? "",
    endReason: raw.endReason ?? "",
    wins: raw.wins ?? {},
  };
}

export { otherSeat };
export const seatOf = seatOf2;

export const turnOf = (moves: string): Seat => (moves.length % 2 === 0 ? "a" : "b");

/** The squares each side still has on the board, oldest first. */
export function marksOf(moves: string, variant: Variant): Record<Seat, number[]> {
  const out: Record<Seat, number[]> = { a: [], b: [] };
  [...moves].forEach((ch, i) => out[i % 2 === 0 ? "a" : "b"].push(Number(ch)));
  if (variant === "infinito") {
    out.a = out.a.slice(-INFINITE_KEEP);
    out.b = out.b.slice(-INFINITE_KEEP);
  }
  return out;
}

/** The board as 9 characters: "." empty, "a"/"b" a mark. */
export function cellsOf(moves: string, variant: Variant): string {
  const cells = Array<string>(SIZE * SIZE).fill(EMPTY);
  const marks = marksOf(moves, variant);
  for (const seat of ["a", "b"] as const) for (const i of marks[seat]) cells[i] = seat;
  return cells.join("");
}

/** The completed line, if any. */
export function winLine(cells: string): readonly number[] | null {
  return LINES.find(([x, y, z]) => cells[x] !== EMPTY && cells[x] === cells[y] && cells[x] === cells[z]) ?? null;
}

/**
 * In `infinito`, the mark of `seat` that its next move will remove (-1 none).
 * Shown faded so both players can plan around it.
 */
export function nextToVanish(moves: string, variant: Variant, seat: Seat): number {
  if (variant !== "infinito") return -1;
  const mine = marksOf(moves, variant)[seat];
  return mine.length >= INFINITE_KEEP ? mine[0] : -1;
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/triqui/state`;

function mutate(roomId: string, fn: (state: TriquiState) => TriquiState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createTriquiRoom(variant: Variant, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: TriquiMeta = { game: "triqui", variant, hostId, createdAt: serverTimestamp() };
  const state: Partial<TriquiState> = { status: "waiting", variant, gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export function subscribeTriqui(roomId: string, cb: (state: TriquiState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export const joinTriqui = (roomId: string, clientId: string, player: SeatPlayer) =>
  mutate(roomId, (s) => joinSeats(s, clientId, player));
export const takeSeat = (roomId: string, clientId: string, seat: Seat, expected: string) =>
  mutate(roomId, (s) => takeSeatIn(s, clientId, seat, expected));
export const leaveSeat = (roomId: string, clientId: string) => mutate(roomId, (s) => leaveSeatIn(s, clientId));
export const swapSeats = (roomId: string) => mutate(roomId, (s) => swapSeatsIn(s));

function freshBoard(s: TriquiState): TriquiState {
  return { ...s, status: "playing", moves: "", winner: "", endReason: "" };
}

export function startTriqui(roomId: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting" || !s.seats.a || !s.seats.b || s.seats.a === s.seats.b) return null;
    return freshBoard(s);
  });
}

function finish(s: TriquiState, winner: Seat | "draw", endReason: EndReason): TriquiState {
  const id = winner === "draw" ? "" : s.seats[winner];
  return { ...s, status: "finished", winner, endReason, wins: id ? { ...s.wins, [id]: (s.wins[id] ?? 0) + 1 } : s.wins };
}

/** Plays `idx` for the side in turn; `expectedMoves` = how many moves I saw, so a double tap can't play twice. */
export function playSquare(roomId: string, clientId: string, idx: number, expectedMoves: number) {
  return mutate(roomId, (s) => {
    const turn = turnOf(s.moves);
    if (s.status !== "playing" || s.seats[turn] !== clientId || s.moves.length !== expectedMoves) return null;
    if (idx < 0 || idx >= SIZE * SIZE || cellsOf(s.moves, s.variant)[idx] !== EMPTY) return null;
    const moves = s.moves + idx;
    const cells = cellsOf(moves, s.variant);
    const next = { ...s, moves };
    if (winLine(cells)) return finish(next, turn, "line");
    if (!cells.includes(EMPTY)) return finish(next, "draw", "full");
    return next;
  });
}

export function resign(roomId: string, clientId: string) {
  return mutate(roomId, (s) => {
    const mine = seatOf(s, clientId);
    if (s.status !== "playing" || !mine) return null;
    return finish(s, otherSeat(mine), "resign");
  });
}

/** Same players, swapping marks: whoever played O now starts with X. */
export function rematch(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    const swapped = { ...s, gameNo: s.gameNo + 1, seats: { a: s.seats.b, b: s.seats.a } };
    return swapped.seats.a && swapped.seats.b ? freshBoard(swapped) : { ...freshBoard(swapped), status: "waiting" };
  });
}
