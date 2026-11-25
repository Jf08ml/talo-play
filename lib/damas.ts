import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { transactState } from "./transact";
import { normalizeBotFields, onlineSeats, type BotLevel, type Opponent } from "./boardBot";

/**
 * Damas on an 8×8 board. Two seats (`a` whites, starting at the bottom and
 * moving first; `b` blacks); everyone else watches. Rules, as usually played
 * in Latin America: men move one square diagonally forward and capture
 * forward or backward; capturing is mandatory (any capture, not necessarily
 * the longest) and a capturing piece keeps capturing while it can; a man
 * that ends its move on the far row becomes a flying king. You lose when you
 * have no moves left (or no pieces).
 *
 * The board is a 64-character string, row-major from the top: "." empty,
 * "a"/"b" men, "A"/"B" kings. Only dark squares ((row + col) odd) are used.
 */

export const SIZE = 8;
const EMPTY = ".";

export type Seat = "a" | "b";
export type DamasStatus = "waiting" | "playing" | "finished";
export type EndReason = "" | "nomoves" | "resign" | "draw";

export const SEAT_STYLE: Record<Seat, { label: string; fill: string; ring: string }> = {
  a: { label: "Blancas", fill: "#f5efe0", ring: "#d6c7a1" },
  b: { label: "Negras", fill: "#1f2937", ring: "#64748b" },
};

export interface DamasMeta {
  game: "damas";
  /** Made by «Jugar en línea» (against a person or, unknown to them, a bot). */
  online?: boolean;
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  createdAt: number | object;
}

export interface DamasPlayer {
  name: string;
  color: string;
}

export interface Move {
  from: number;
  to: number;
  /** The square of the captured piece, or -1. */
  captured: number;
}

export interface DamasState {
  status: DamasStatus;
  gameNo: number;
  players: Record<string, DamasPlayer>;
  /** Client id in each seat, "" if empty. */
  seats: Record<Seat, string>;
  cells: string;
  turn: Seat;
  /** Square of the piece that must keep capturing this turn, or -1. */
  chain: number;
  lastMove: { from: number; to: number };
  /** Jumps/moves made this game, to guard against double taps. */
  moveNo: number;
  /** Who offered a draw ("" if nobody). Cleared by any move. */
  drawOffer: Seat | "";
  winner: Seat | "draw" | "";
  endReason: EndReason;
  wins: Record<string, number>;
  /** «Jugar en línea»: the bot's id and level ("" against a person); see lib/boardBot.ts. */
  botId: string;
  botLevel: BotLevel | "";
  online: boolean;
}

export function initialCells(): string {
  let out = "";
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const dark = (r + c) % 2 === 1;
      out += !dark ? EMPTY : r < 3 ? "b" : r > 4 ? "a" : EMPTY;
    }
  }
  return out;
}

function normalizeState(raw: Partial<DamasState> | null): DamasState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    seats: { a: raw.seats?.a ?? "", b: raw.seats?.b ?? "" },
    cells: raw.cells && raw.cells.length === SIZE * SIZE ? raw.cells : initialCells(),
    turn: raw.turn ?? "a",
    chain: raw.chain ?? -1,
    lastMove: { from: raw.lastMove?.from ?? -1, to: raw.lastMove?.to ?? -1 },
    moveNo: raw.moveNo ?? 0,
    drawOffer: raw.drawOffer ?? "",
    winner: raw.winner ?? "",
    endReason: raw.endReason ?? "",
    wins: raw.wins ?? {},
    ...normalizeBotFields(raw),
  };
}

export function otherSeat(s: Seat): Seat {
  return s === "a" ? "b" : "a";
}

export function seatOf(state: Pick<DamasState, "seats">, clientId: string): Seat | null {
  if (!clientId) return null;
  if (state.seats.a === clientId) return "a";
  if (state.seats.b === clientId) return "b";
  return null;
}

export function ownerOf(ch: string | undefined): Seat | null {
  if (ch === "a" || ch === "A") return "a";
  if (ch === "b" || ch === "B") return "b";
  return null;
}

export function isKing(ch: string | undefined): boolean {
  return ch === "A" || ch === "B";
}

const DIRS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;

const inside = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

/** Row direction a man of `side` moves in. */
const forward = (side: Seat) => (side === "a" ? -1 : 1);

function capturesFrom(cells: string, idx: number): Move[] {
  const ch = cells[idx];
  const side = ownerOf(ch);
  if (!side) return [];
  const r = Math.floor(idx / SIZE);
  const c = idx % SIZE;
  const out: Move[] = [];
  for (const [dr, dc] of DIRS) {
    if (isKing(ch)) {
      let rr = r + dr;
      let cc = c + dc;
      while (inside(rr, cc) && cells[rr * SIZE + cc] === EMPTY) {
        rr += dr;
        cc += dc;
      }
      if (!inside(rr, cc) || ownerOf(cells[rr * SIZE + cc]) !== otherSeat(side)) continue;
      const captured = rr * SIZE + cc;
      rr += dr;
      cc += dc;
      while (inside(rr, cc) && cells[rr * SIZE + cc] === EMPTY) {
        out.push({ from: idx, to: rr * SIZE + cc, captured });
        rr += dr;
        cc += dc;
      }
    } else {
      const mr = r + dr;
      const mc = c + dc;
      const lr = r + 2 * dr;
      const lc = c + 2 * dc;
      if (!inside(lr, lc)) continue;
      if (ownerOf(cells[mr * SIZE + mc]) === otherSeat(side) && cells[lr * SIZE + lc] === EMPTY) {
        out.push({ from: idx, to: lr * SIZE + lc, captured: mr * SIZE + mc });
      }
    }
  }
  return out;
}

function stepsFrom(cells: string, idx: number): Move[] {
  const ch = cells[idx];
  const side = ownerOf(ch);
  if (!side) return [];
  const r = Math.floor(idx / SIZE);
  const c = idx % SIZE;
  const out: Move[] = [];
  for (const [dr, dc] of DIRS) {
    if (!isKing(ch) && dr !== forward(side)) continue;
    let rr = r + dr;
    let cc = c + dc;
    while (inside(rr, cc) && cells[rr * SIZE + cc] === EMPTY) {
      out.push({ from: idx, to: rr * SIZE + cc, captured: -1 });
      if (!isKing(ch)) break;
      rr += dr;
      cc += dc;
    }
  }
  return out;
}

/** Every legal move for `side`: only the chaining piece's captures, else any capture, else plain moves. */
export function legalMoves(cells: string, side: Seat, chain: number): Move[] {
  if (chain >= 0) return capturesFrom(cells, chain);
  const captures: Move[] = [];
  const steps: Move[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (ownerOf(cells[i]) !== side) continue;
    captures.push(...capturesFrom(cells, i));
    if (captures.length === 0) steps.push(...stepsFrom(cells, i));
  }
  return captures.length ? captures : steps;
}

/**
 * The board after `move` (one step or one jump) by `turn`: a jump that can
 * keep capturing leaves `chain` on that piece and the same side to move;
 * otherwise a man ending on the far row is crowned and the turn passes.
 */
export function applyMove(cells: string, turn: Seat, move: Move): { cells: string; chain: number; turn: Seat } {
  const out = [...cells];
  out[move.to] = out[move.from];
  out[move.from] = EMPTY;
  if (move.captured >= 0) out[move.captured] = EMPTY;
  let next = out.join("");
  if (move.captured >= 0 && capturesFrom(next, move.to).length > 0) return { cells: next, chain: move.to, turn };
  const row = Math.floor(move.to / SIZE);
  if (!isKing(next[move.to]) && row === (turn === "a" ? 0 : SIZE - 1)) {
    next = next.slice(0, move.to) + next[move.to].toUpperCase() + next.slice(move.to + 1);
  }
  return { cells: next, chain: -1, turn: otherSeat(turn) };
}

export function pieceCount(cells: string, side: Seat): number {
  let n = 0;
  for (const ch of cells) if (ownerOf(ch) === side) n++;
  return n;
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/damas/state`;

function mutate(roomId: string, fn: (state: DamasState) => DamasState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

/** With `vs`, a «Jugar en línea» room: both seated (colors at random) and playing at once. */
export async function createDamasRoom(hostId: string, vs?: Opponent): Promise<string> {
  const roomId = generateRoomCode();
  const meta: DamasMeta = { game: "damas", hostId, createdAt: serverTimestamp(), ...(vs ? { online: true } : {}) };
  const state: Partial<DamasState> = vs
    ? { gameNo: 0, cells: initialCells(), turn: "a", status: "playing", ...onlineSeats(hostId, vs) }
    : { status: "waiting", gameNo: 0, cells: initialCells(), turn: "a" };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getDamasMeta(roomId: string): Promise<Partial<DamasMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeDamas(roomId: string, cb: (state: DamasState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

/** Registers the player and, before the game, sits them in a free seat. */
export function joinDamas(roomId: string, clientId: string, player: DamasPlayer) {
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

/**
 * Takes a seat that is free or whose player left (`expectedOccupant` is who I
 * saw there). Mid-game, only a left player's seat, by someone without one.
 */
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

function freshBoard(s: DamasState): DamasState {
  return {
    ...s,
    status: "playing",
    cells: initialCells(),
    turn: "a",
    chain: -1,
    lastMove: { from: -1, to: -1 },
    moveNo: 0,
    drawOffer: "",
    winner: "",
    endReason: "",
  };
}

export function startDamas(roomId: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting" || !s.seats.a || !s.seats.b || s.seats.a === s.seats.b) return null;
    return freshBoard(s);
  });
}

function finish(s: DamasState, winner: Seat | "draw", endReason: EndReason): DamasState {
  const id = winner === "draw" ? "" : s.seats[winner];
  return {
    ...s,
    status: "finished",
    winner,
    endReason,
    chain: -1,
    drawOffer: "",
    wins: id ? { ...s.wins, [id]: (s.wins[id] ?? 0) + 1 } : s.wins,
  };
}

/** One move (or one jump of a capture chain) by whoever is in turn. */
export function makeMove(roomId: string, clientId: string, from: number, to: number, expectedMoveNo: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.seats[s.turn] !== clientId || s.moveNo !== expectedMoveNo) return null;
    const move = legalMoves(s.cells, s.turn, s.chain).find((m) => m.from === from && m.to === to);
    if (!move) return null;
    const after = applyMove(s.cells, s.turn, move);
    const next = { ...s, ...after, lastMove: { from, to }, moveNo: s.moveNo + 1, drawOffer: "" as const };
    if (after.chain >= 0) return next;
    return legalMoves(after.cells, after.turn, -1).length === 0 ? finish(next, s.turn, "nomoves") : next;
  });
}

export function resign(roomId: string, clientId: string) {
  return mutate(roomId, (s) => {
    const mine = seatOf(s, clientId);
    if (s.status !== "playing" || !mine) return null;
    return finish(s, otherSeat(mine), "resign");
  });
}

/** Offers a draw, or accepts the rival's offer. */
export function offerDraw(roomId: string, clientId: string) {
  return mutate(roomId, (s) => {
    const mine = seatOf(s, clientId);
    if (s.status !== "playing" || !mine || s.drawOffer === mine) return null;
    if (s.drawOffer === otherSeat(mine)) return finish(s, "draw", "draw");
    return { ...s, drawOffer: mine };
  });
}

/** Same players, swapping colors: whoever played blacks now starts with whites. */
export function rematch(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    const swapped = { ...s, gameNo: s.gameNo + 1, seats: { a: s.seats.b, b: s.seats.a } };
    return swapped.seats.a && swapped.seats.b ? freshBoard(swapped) : { ...freshBoard(swapped), status: "waiting" };
  });
}
