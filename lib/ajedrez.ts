import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { transactState } from "./transact";
import { INITIAL, applyMove, legalMoves, outcome, sameMove, toSan, type ChessMove, type Color, type Position, type PromoPiece } from "./ajedrezRules";

/**
 * Ajedrez. Two seats (`a` whites at the bottom, moving first; `b` blacks,
 * whose board is drawn flipped); everyone else watches. The position lives in
 * the state and every move is checked against `legalMoves` inside the
 * transaction, guarded by `moveNo`. Rules in `lib/ajedrezRules.ts`.
 */

export type Seat = "a" | "b";
export type AjedrezStatus = "waiting" | "playing" | "finished";
export type EndReason = "" | "mate" | "ahogado" | "material" | "cincuenta" | "abandono" | "tablas";

export const SEAT_LABEL: Record<Seat, string> = { a: "Blancas", b: "Negras" };
export const colorOfSeat = (s: Seat): Color => (s === "a" ? "w" : "b");
export const seatOfColor = (c: Color): Seat => (c === "w" ? "a" : "b");

export interface AjedrezMeta {
  game: "ajedrez";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  createdAt: number | object;
}

export interface AjedrezPlayer {
  name: string;
  color: string;
}

export interface AjedrezState {
  status: AjedrezStatus;
  gameNo: number;
  players: Record<string, AjedrezPlayer>;
  /** Client id in each seat, "" if empty. */
  seats: Record<Seat, string>;
  cells: string;
  turn: Color;
  castling: string;
  ep: number;
  half: number;
  /** Moves made this game, to guard against double taps. */
  moveNo: number;
  lastMove: { from: number; to: number };
  /** The game's moves in notation, space-separated. */
  history: string;
  /** Who offered a draw ("" if nobody). Cleared by any move. */
  drawOffer: Seat | "";
  winner: Seat | "draw" | "";
  endReason: EndReason;
  wins: Record<string, number>;
}

function normalizeState(raw: Partial<AjedrezState> | null): AjedrezState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    seats: { a: raw.seats?.a ?? "", b: raw.seats?.b ?? "" },
    cells: raw.cells && raw.cells.length === 64 ? raw.cells : INITIAL.cells,
    turn: raw.turn ?? "w",
    castling: raw.castling ?? INITIAL.castling,
    ep: raw.ep ?? -1,
    half: raw.half ?? 0,
    moveNo: raw.moveNo ?? 0,
    lastMove: { from: raw.lastMove?.from ?? -1, to: raw.lastMove?.to ?? -1 },
    history: raw.history ?? "",
    drawOffer: raw.drawOffer ?? "",
    winner: raw.winner ?? "",
    endReason: raw.endReason ?? "",
    wins: raw.wins ?? {},
  };
}

export function positionOf(s: AjedrezState): Position {
  return { cells: s.cells, turn: s.turn, castling: s.castling, ep: s.ep, half: s.half };
}

export function seatOf(state: Pick<AjedrezState, "seats">, clientId: string): Seat | null {
  if (!clientId) return null;
  if (state.seats.a === clientId) return "a";
  if (state.seats.b === clientId) return "b";
  return null;
}

const otherSeat = (s: Seat): Seat => (s === "a" ? "b" : "a");

function freshBoard(s: AjedrezState): AjedrezState {
  return {
    ...s,
    status: "playing",
    cells: INITIAL.cells,
    turn: "w",
    castling: INITIAL.castling,
    ep: -1,
    half: 0,
    moveNo: 0,
    lastMove: { from: -1, to: -1 },
    history: "",
    drawOffer: "",
    winner: "",
    endReason: "",
  };
}

function finish(s: AjedrezState, winner: Seat | "draw", endReason: EndReason): AjedrezState {
  const id = winner === "draw" ? "" : s.seats[winner];
  return {
    ...s,
    status: "finished",
    winner,
    endReason,
    drawOffer: "",
    wins: id ? { ...s.wins, [id]: (s.wins[id] ?? 0) + 1 } : s.wins,
  };
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/ajedrez/state`;

function mutate(roomId: string, fn: (state: AjedrezState) => AjedrezState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createAjedrezRoom(hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: AjedrezMeta = { game: "ajedrez", hostId, createdAt: serverTimestamp() };
  const state: Partial<AjedrezState> = { status: "waiting", gameNo: 0, cells: INITIAL.cells };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getAjedrezMeta(roomId: string): Promise<Partial<AjedrezMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeAjedrez(roomId: string, cb: (state: AjedrezState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

/** Registers the player and, before the game, sits them in a free seat. */
export function joinAjedrez(roomId: string, clientId: string, player: AjedrezPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    const free: Seat | null = !s.seats.a ? "a" : !s.seats.b ? "b" : null;
    const sit = s.status === "waiting" && !seatOf(s, clientId) && free;
    if (!sit && known?.name === player.name && known?.color === player.color) return null;
    return {
      ...s,
      players: { ...s.players, [clientId]: player },
      seats: sit ? { ...s.seats, [sit]: clientId } : s.seats,
    };
  });
}

/** Takes a free seat or one whose player left (`expectedOccupant` is who I saw there). */
export function takeSeat(roomId: string, clientId: string, seat: Seat, expectedOccupant: string) {
  return mutate(roomId, (s) => {
    if (s.seats[seat] !== expectedOccupant || s.seats[seat] === clientId) return null;
    const mine = seatOf(s, clientId);
    if (s.status !== "waiting" && (mine || !expectedOccupant)) return null;
    const seats = { ...s.seats, [seat]: clientId };
    if (mine) seats[mine] = "";
    return { ...s, seats };
  });
}

export function swapSeats(roomId: string) {
  return mutate(roomId, (s) => (s.status === "waiting" ? { ...s, seats: { a: s.seats.b, b: s.seats.a } } : null));
}

export function leaveSeat(roomId: string, clientId: string) {
  return mutate(roomId, (s) => {
    const mine = seatOf(s, clientId);
    if (s.status !== "waiting" || !mine) return null;
    return { ...s, seats: { ...s.seats, [mine]: "" } };
  });
}

export function startAjedrez(roomId: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting" || !s.seats.a || !s.seats.b || s.seats.a === s.seats.b) return null;
    return freshBoard(s);
  });
}

export function makeMove(roomId: string, clientId: string, from: number, to: number, promo: PromoPiece | undefined, expectedMoveNo: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.moveNo !== expectedMoveNo) return null;
    const seat = seatOfColor(s.turn);
    if (s.seats[seat] !== clientId) return null;
    const pos = positionOf(s);
    const move: ChessMove = promo ? { from, to, promo } : { from, to };
    const legal = legalMoves(pos);
    // A promotion without a piece chosen defaults to queen.
    const chosen = legal.find((m) => sameMove(m, move)) ?? legal.find((m) => m.from === from && m.to === to && m.promo === "q" && !promo);
    if (!chosen) return null;
    const san = toSan(pos, chosen);
    const next = applyMove(pos, chosen);
    const moved: AjedrezState = {
      ...s,
      ...next,
      moveNo: s.moveNo + 1,
      lastMove: { from, to },
      history: s.history ? `${s.history} ${san}` : san,
      drawOffer: "",
    };
    const end = outcome(next);
    if (!end) return moved;
    return end.result === "mate" ? finish(moved, seatOfColor(end.winner), "mate") : finish(moved, "draw", end.result);
  });
}

export function resign(roomId: string, clientId: string) {
  return mutate(roomId, (s) => {
    const mine = seatOf(s, clientId);
    if (s.status !== "playing" || !mine) return null;
    return finish(s, otherSeat(mine), "abandono");
  });
}

/** Offers a draw, or accepts the rival's offer. */
export function offerDraw(roomId: string, clientId: string) {
  return mutate(roomId, (s) => {
    const mine = seatOf(s, clientId);
    if (s.status !== "playing" || !mine || s.drawOffer === mine) return null;
    if (s.drawOffer === otherSeat(mine)) return finish(s, "draw", "tablas");
    return { ...s, drawOffer: mine };
  });
}

/** Same players, swapping colors. */
export function rematch(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    const swapped = { ...s, gameNo: s.gameNo + 1, seats: { a: s.seats.b, b: s.seats.a } };
    return swapped.seats.a && swapped.seats.b ? freshBoard(swapped) : { ...freshBoard(swapped), status: "waiting" };
  });
}
