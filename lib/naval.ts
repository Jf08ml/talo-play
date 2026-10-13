import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { transactState } from "./transact";

/**
 * Batalla naval. Two seats (`a`, `b`) like 4 en línea; everyone else watches.
 * Each player places their fleet on a 10×10 map, then they take turns firing
 * at the other's map; a hit earns another shot.
 *
 * Maps are 100-character strings, row-major: a fleet has "." for water and
 * the ship's index ("0"–"4") on its cells; shots have "." (not fired) or "x".
 * Both fleets live in the shared state, so they're readable with DevTools —
 * accepted, there is no backend to hide them.
 */

export const SIZE = 10;
const CELLS = SIZE * SIZE;
const WATER = ".";
const SHOT = "x";

export const FLEET = [
  { name: "Portaaviones", len: 5 },
  { name: "Acorazado", len: 4 },
  { name: "Crucero", len: 3 },
  { name: "Submarino", len: 3 },
  { name: "Destructor", len: 2 },
] as const;

export type Seat = "a" | "b";
export type NavalStatus = "waiting" | "placing" | "playing" | "finished";

export const SEAT_COLORS: Record<Seat, { label: string; color: string }> = {
  a: { label: "Flota roja", color: "#fb7185" },
  b: { label: "Flota azul", color: "#38bdf8" },
};

export interface NavalMeta {
  game: "naval";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  createdAt: number | object;
}

export interface NavalPlayer {
  name: string;
  color: string;
}

export interface NavalState {
  status: NavalStatus;
  gameNo: number;
  players: Record<string, NavalPlayer>;
  /** Client id in each seat, "" if empty. */
  seats: Record<Seat, string>;
  /** Fleet placed and confirmed. */
  ready: Record<Seat, boolean>;
  fleets: Record<Seat, string>;
  /** Shots fired BY each seat, on the other seat's map. */
  shots: Record<Seat, string>;
  turn: Seat;
  /** Who fires first this game; alternates on every rematch. */
  starter: Seat;
  lastShot: { by: Seat | ""; idx: number };
  winner: Seat | "";
  /** Games won per client id, across rematches. */
  wins: Record<string, number>;
}

export function emptyMap(): string {
  return WATER.repeat(CELLS);
}

const okMap = (m: string | undefined) => (m && m.length === CELLS ? m : emptyMap());

function normalizeState(raw: Partial<NavalState> | null): NavalState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    seats: { a: raw.seats?.a ?? "", b: raw.seats?.b ?? "" },
    ready: { a: raw.ready?.a ?? false, b: raw.ready?.b ?? false },
    fleets: { a: okMap(raw.fleets?.a), b: okMap(raw.fleets?.b) },
    shots: { a: okMap(raw.shots?.a), b: okMap(raw.shots?.b) },
    turn: raw.turn ?? "a",
    starter: raw.starter ?? "a",
    lastShot: { by: raw.lastShot?.by ?? "", idx: raw.lastShot?.idx ?? -1 },
    winner: raw.winner ?? "",
    wins: raw.wins ?? {},
  };
}

export function otherSeat(s: Seat): Seat {
  return s === "a" ? "b" : "a";
}

export function seatOf(state: Pick<NavalState, "seats">, clientId: string): Seat | null {
  if (!clientId) return null;
  if (state.seats.a === clientId) return "a";
  if (state.seats.b === clientId) return "b";
  return null;
}

export function shotCount(shots: string): number {
  let n = 0;
  for (const c of shots) if (c === SHOT) n++;
  return n;
}

export function isShot(shots: string, idx: number): boolean {
  return shots[idx] === SHOT;
}

/** The ship index on a cell, or -1 for water. */
export function shipAt(fleet: string, idx: number): number {
  return fleet[idx] === WATER || fleet[idx] === undefined ? -1 : Number(fleet[idx]);
}

export function shipCells(fleet: string, ship: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < fleet.length; i++) if (fleet[i] === String(ship)) out.push(i);
  return out;
}

/** Whether every cell of `ship` was hit. */
export function isSunk(fleet: string, shots: string, ship: number): boolean {
  const cells = shipCells(fleet, ship);
  return cells.length > 0 && cells.every((i) => shots[i] === SHOT);
}

export function allSunk(fleet: string, shots: string): boolean {
  return FLEET.every((_, i) => isSunk(fleet, shots, i));
}

/** Cells a ship of `len` would cover from `start`, or null if it doesn't fit on the map. */
function lineFrom(start: number, len: number, horizontal: boolean): number[] | null {
  const r = Math.floor(start / SIZE);
  const c = start % SIZE;
  if (horizontal ? c + len > SIZE : r + len > SIZE) return null;
  return Array.from({ length: len }, (_, k) => (horizontal ? start + k : start + k * SIZE));
}

/** Whether a ship's cells run left to right. One-cell ships don't exist, so two cells decide it. */
export function isHorizontal(fleet: string, ship: number): boolean {
  const cells = shipCells(fleet, ship);
  return cells.length < 2 || cells[1] - cells[0] === 1;
}

/**
 * Moves `ship` so it starts at `start` (top/left cell) with the given
 * orientation, or null if it would leave the map or overlap another ship.
 */
export function placeShip(fleet: string, ship: number, start: number, horizontal: boolean): string | null {
  const cells = lineFrom(start, FLEET[ship].len, horizontal);
  if (!cells) return null;
  const mark = String(ship);
  if (cells.some((i) => fleet[i] !== WATER && fleet[i] !== mark)) return null;
  const out = [...fleet].map((c) => (c === mark ? WATER : c));
  for (const i of cells) out[i] = mark;
  return out.join("");
}

/** A random legal fleet (ships may touch, never overlap). */
export function randomFleet(): string {
  for (;;) {
    let fleet = emptyMap();
    let ok = true;
    for (let ship = 0; ship < FLEET.length && ok; ship++) {
      let placed: string | null = null;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        placed = placeShip(fleet, ship, Math.floor(Math.random() * CELLS), Math.random() < 0.5);
      }
      if (placed) fleet = placed;
      else ok = false;
    }
    if (ok) return fleet;
  }
}

/** Every ship present once, straight and in one piece. */
export function validFleet(fleet: string): boolean {
  if (fleet.length !== CELLS) return false;
  for (const c of fleet) if (c !== WATER && !(Number(c) >= 0 && Number(c) < FLEET.length)) return false;
  return FLEET.every((s, ship) => {
    const cells = shipCells(fleet, ship);
    if (cells.length !== s.len) return false;
    const expected = lineFrom(cells[0], s.len, isHorizontal(fleet, ship));
    return !!expected && expected.every((v, k) => v === cells[k]);
  });
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/naval/state`;

function mutate(roomId: string, fn: (state: NavalState) => NavalState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createNavalRoom(hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: NavalMeta = { game: "naval", hostId, createdAt: serverTimestamp() };
  const state: Partial<NavalState> = { status: "waiting", gameNo: 0, turn: "a", starter: "a" };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getNavalMeta(roomId: string): Promise<Partial<NavalMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeNaval(roomId: string, cb: (state: NavalState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

/** Registers the player and, before the game, sits them in a free seat. */
export function joinNaval(roomId: string, clientId: string, player: NavalPlayer) {
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
 * saw there). After the game started, only a left player's seat can be
 * taken, by someone without a seat — they inherit that fleet.
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

export function leaveSeat(roomId: string, clientId: string) {
  return mutate(roomId, (s) => {
    const mine = seatOf(s, clientId);
    if (s.status !== "waiting" || !mine) return null;
    return { ...s, seats: { ...s.seats, [mine]: "" } };
  });
}

function toPlacing(s: NavalState): NavalState {
  return {
    ...s,
    status: "placing",
    ready: { a: false, b: false },
    fleets: { a: emptyMap(), b: emptyMap() },
    shots: { a: emptyMap(), b: emptyMap() },
    turn: s.starter,
    lastShot: { by: "", idx: -1 },
    winner: "",
  };
}

/** Both seats taken: everyone goes to place their fleet. */
export function startNaval(roomId: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting" || !s.seats.a || !s.seats.b || s.seats.a === s.seats.b) return null;
    return toPlacing(s);
  });
}

/** Confirms my fleet; when both are ready, the battle starts. */
export function submitFleet(roomId: string, clientId: string, fleet: string) {
  return mutate(roomId, (s) => {
    const seat = seatOf(s, clientId);
    if (s.status !== "placing" || !seat || s.ready[seat] || !validFleet(fleet)) return null;
    const next = { ...s, fleets: { ...s.fleets, [seat]: fleet }, ready: { ...s.ready, [seat]: true } };
    return next.ready.a && next.ready.b ? { ...next, status: "playing", turn: s.starter } : next;
  });
}

/** Back to placing my ships (only while the other one isn't ready yet). */
export function unready(roomId: string, clientId: string) {
  return mutate(roomId, (s) => {
    const seat = seatOf(s, clientId);
    if (s.status !== "placing" || !seat || !s.ready[seat]) return null;
    return { ...s, ready: { ...s.ready, [seat]: false } };
  });
}

/** Fires at `idx` of the rival's map; `expectedShots` keeps a double tap from firing twice. */
export function fire(roomId: string, clientId: string, idx: number, expectedShots: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.seats[s.turn] !== clientId) return null;
    const mine = s.shots[s.turn];
    if (shotCount(mine) !== expectedShots || idx < 0 || idx >= CELLS || isShot(mine, idx)) return null;
    const shots = { ...s.shots, [s.turn]: mine.slice(0, idx) + SHOT + mine.slice(idx + 1) };
    const target = s.fleets[otherSeat(s.turn)];
    const hit = shipAt(target, idx) >= 0;
    const lastShot = { by: s.turn, idx };
    if (hit && allSunk(target, shots[s.turn])) {
      return {
        ...s,
        shots,
        lastShot,
        status: "finished",
        winner: s.turn,
        wins: { ...s.wins, [clientId]: (s.wins[clientId] ?? 0) + 1 },
      };
    }
    return { ...s, shots, lastShot, turn: hit ? s.turn : otherSeat(s.turn) };
  });
}

/** Same seats, new fleets; the other player fires first. */
export function rematch(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    const starter = otherSeat(s.starter);
    const next = toPlacing({ ...s, gameNo: s.gameNo + 1, starter });
    return s.seats.a && s.seats.b ? next : { ...next, status: "waiting" };
  });
}
