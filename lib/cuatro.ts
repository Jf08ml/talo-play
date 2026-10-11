import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { transactState } from "./transact";

/**
 * 4 en línea. Two seats (`a` red, `b` yellow); everyone else in the room
 * watches. The board is a 42-character string, row-major from the top row
 * ("." empty, "a"/"b" a disc), so RTDB never turns it into an array.
 */

export const ROWS = 6;
export const COLS = 7;
const EMPTY = ".";

export type Disc = "a" | "b";
export type CuatroStatus = "waiting" | "playing" | "finished";

export const DISCS: Record<Disc, { label: string; color: string; glow: string }> = {
  a: { label: "Rojas", color: "#fb3a5d", glow: "rgba(251,58,93,0.55)" },
  b: { label: "Amarillas", color: "#facc15", glow: "rgba(250,204,21,0.55)" },
};

export interface CuatroMeta {
  game: "cuatro";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  createdAt: number | object;
}

export interface CuatroPlayer {
  name: string;
  color: string;
}

export interface CuatroState {
  status: CuatroStatus;
  gameNo: number;
  players: Record<string, CuatroPlayer>;
  /** Client id in each seat, "" if empty. */
  seats: Record<Disc, string>;
  cells: string;
  turn: Disc;
  /** Who moved first this game; alternates on every rematch. */
  starter: Disc;
  /** Index of the last disc dropped, -1 at the start. */
  lastMove: number;
  winner: Disc | "draw" | "";
  /** Games won per client id, across rematches. */
  wins: Record<string, number>;
}

export function emptyCells(): string {
  return EMPTY.repeat(ROWS * COLS);
}

function normalizeState(raw: Partial<CuatroState> | null): CuatroState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    seats: { a: raw.seats?.a ?? "", b: raw.seats?.b ?? "" },
    cells: raw.cells && raw.cells.length === ROWS * COLS ? raw.cells : emptyCells(),
    turn: raw.turn ?? "a",
    starter: raw.starter ?? "a",
    lastMove: raw.lastMove ?? -1,
    winner: raw.winner ?? "",
    wins: raw.wins ?? {},
  };
}

export function otherDisc(d: Disc): Disc {
  return d === "a" ? "b" : "a";
}

export function seatOf(state: Pick<CuatroState, "seats">, clientId: string): Disc | null {
  if (!clientId) return null;
  if (state.seats.a === clientId) return "a";
  if (state.seats.b === clientId) return "b";
  return null;
}

export function movesMade(cells: string): number {
  let n = 0;
  for (const c of cells) if (c !== EMPTY) n++;
  return n;
}

/** The row a disc dropped in `col` lands on, or -1 if the column is full. */
export function landingRow(cells: string, col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) if (cells[r * COLS + col] === EMPTY) return r;
  return -1;
}

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const;

/** The winning disc and its four-in-a-row (or longer) cells, if any. */
export function findWin(cells: string): { disc: Disc; line: number[] } | null {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const d = cells[r * COLS + c];
      if (d === EMPTY) continue;
      for (const [dr, dc] of DIRECTIONS) {
        // Only start counting at the first cell of a run.
        const pr = r - dr;
        const pc = c - dc;
        if (pr >= 0 && pr < ROWS && pc >= 0 && pc < COLS && cells[pr * COLS + pc] === d) continue;
        const line: number[] = [];
        let rr = r;
        let cc = c;
        while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && cells[rr * COLS + cc] === d) {
          line.push(rr * COLS + cc);
          rr += dr;
          cc += dc;
        }
        if (line.length >= 4) return { disc: d as Disc, line };
      }
    }
  }
  return null;
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/cuatro/state`;

function mutate(roomId: string, fn: (state: CuatroState) => CuatroState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createCuatroRoom(hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: CuatroMeta = { game: "cuatro", hostId, createdAt: serverTimestamp() };
  const state: Partial<CuatroState> = { status: "waiting", gameNo: 0, cells: emptyCells(), turn: "a", starter: "a" };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getCuatroMeta(roomId: string): Promise<Partial<CuatroMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeCuatro(roomId: string, cb: (state: CuatroState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

/** Registers the player and, before the game, sits them in a free seat. */
export function joinCuatro(roomId: string, clientId: string, player: CuatroPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    const free: Disc | null = !s.seats.a ? "a" : !s.seats.b ? "b" : null;
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
 * saw there, so I never kick out someone who just sat). Mid-game, only a
 * left player's seat can be taken.
 */
export function takeSeat(roomId: string, clientId: string, seat: Disc, expectedOccupant: string) {
  return mutate(roomId, (s) => {
    if (s.seats[seat] !== expectedOccupant || s.seats[seat] === clientId) return null;
    const mine = seatOf(s, clientId);
    if (s.status !== "waiting" && (mine || !expectedOccupant)) return null;
    const seats = { ...s.seats, [seat]: clientId };
    if (mine) seats[mine] = "";
    return { ...s, seats };
  });
}

/** Swaps who plays red and who plays yellow (before the game). */
export function swapSeats(roomId: string) {
  return mutate(roomId, (s) =>
    s.status === "waiting" ? { ...s, seats: { a: s.seats.b, b: s.seats.a } } : null
  );
}

export function leaveSeat(roomId: string, clientId: string) {
  return mutate(roomId, (s) => {
    const mine = seatOf(s, clientId);
    if (s.status !== "waiting" || !mine) return null;
    return { ...s, seats: { ...s.seats, [mine]: "" } };
  });
}

export function startCuatro(roomId: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting" || !s.seats.a || !s.seats.b || s.seats.a === s.seats.b) return null;
    return { ...s, status: "playing", cells: emptyCells(), turn: s.starter, lastMove: -1, winner: "" };
  });
}

/** Drops a disc for whoever is in turn; `expectedMoves` keeps a double tap from playing twice. */
export function dropDisc(roomId: string, clientId: string, col: number, expectedMoves: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.seats[s.turn] !== clientId) return null;
    if (movesMade(s.cells) !== expectedMoves || col < 0 || col >= COLS) return null;
    const row = landingRow(s.cells, col);
    if (row < 0) return null;
    const idx = row * COLS + col;
    const cells = s.cells.slice(0, idx) + s.turn + s.cells.slice(idx + 1);
    const win = findWin(cells);
    if (win) {
      return {
        ...s,
        cells,
        lastMove: idx,
        status: "finished",
        winner: win.disc,
        wins: { ...s.wins, [clientId]: (s.wins[clientId] ?? 0) + 1 },
      };
    }
    if (movesMade(cells) === ROWS * COLS) return { ...s, cells, lastMove: idx, status: "finished", winner: "draw" };
    return { ...s, cells, lastMove: idx, turn: otherDisc(s.turn) };
  });
}

/** Same seats, empty board; the other player starts. */
export function rematch(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    const starter = otherDisc(s.starter);
    const ready = s.seats.a && s.seats.b;
    return {
      ...s,
      status: ready ? "playing" : "waiting",
      gameNo: s.gameNo + 1,
      starter,
      turn: starter,
      cells: emptyCells(),
      lastMove: -1,
      winner: "",
    };
  });
}
