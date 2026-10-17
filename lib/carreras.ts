import { ref, get, onDisconnect, onValue, remove, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { TRACKS, type TrackId } from "./carrerasTrack";

/**
 * Carreras, two games on the same rooms, physics and controls: `carreras`
 * (2D, seen from above on a shared screen) and `carreras3d` (3D). Rooms run
 * in one of two modes, chosen when the room is created (2D is always
 * `pantalla`):
 *
 * - `pantalla`: the race runs on a shared screen (`/carreras/{id}/pantalla`, a
 *   computer on a TV or projector) and phones are only controllers. The
 *   screen is the authority: it simulates every car from the inputs
 *   (`carreras/input/{clientId}`) and reports finishes; it writes laps and
 *   places to `carreras/live` for the phones.
 * - `telefono`: no screen. Each phone simulates and draws its own car and
 *   publishes its pose (`carreras/cars/{clientId}`) for the others to draw;
 *   each one reports its own finish.
 *
 * `carreras/state` (seats, countdown, results) only changes by transaction.
 */

export const COUNTDOWN_MS = 3000;
/** After the first car finishes, how long the rest have before the race closes. */
export const FINISH_GRACE_MS = 25000;
export const LAP_OPTIONS = [3, 5, 8];

export type Seat = "a" | "b" | "c" | "d";
export const SEATS: Seat[] = ["a", "b", "c", "d"];

export const CARS: Record<Seat, { label: string; color: string; glow: string }> = {
  a: { label: "Auto rojo", color: "#fb3a5d", glow: "rgba(251,58,93,0.55)" },
  b: { label: "Auto celeste", color: "#22d3ee", glow: "rgba(34,211,238,0.55)" },
  c: { label: "Auto verde", color: "#4ade80", glow: "rgba(74,222,128,0.55)" },
  d: { label: "Auto amarillo", color: "#facc15", glow: "rgba(250,204,21,0.55)" },
};

export type CarrerasGame = "carreras" | "carreras3d";
export type CarrerasMode = "pantalla" | "telefono";
export type CarrerasStatus = "waiting" | "racing" | "finished";

export interface CarrerasMeta {
  game: CarrerasGame;
  hostId?: string;
  mode: CarrerasMode;
  track: TrackId;
  laps: number;
  createdAt: number | object;
}

export interface CarrerasPlayer {
  name: string;
  color: string;
}

export interface CarrerasState {
  status: CarrerasStatus;
  gameNo: number;
  players: Record<string, CarrerasPlayer>;
  /** Client id in each seat, "" if empty. */
  seats: Record<Seat, string>;
  /** Seats that started this race (e.g. "abd"). */
  racers: string;
  /** Server time when the cars may move (the countdown ends). */
  startedAt: number;
  /** Race time (ms) of every seat that finished. */
  results: Partial<Record<Seat, number>>;
  /** Server time of the first finish, 0 before; starts FINISH_GRACE_MS. */
  firstAt: number;
  /** Fastest finisher, set when the race closes. */
  winner: Seat | "";
  /** Races won per client id. */
  wins: Record<string, number>;
}

export interface CarInputWire {
  s: number;
  b: boolean;
}

export interface LiveCar {
  lap: number;
  place: number;
}

export interface CarrerasLive {
  gameNo: number;
  cars: Partial<Record<Seat, LiveCar>>;
}

/** A car's pose in phone mode, written by its own phone. */
export interface CarPose {
  /** gameNo it belongs to. */
  g: number;
  x: number;
  y: number;
  h: number;
  vx: number;
  vy: number;
  /** Progress along the track (laps × length + arc length). */
  p: number;
  /** Server time of the sample. */
  t: number;
}

export function isCarrerasGame(game: unknown): game is CarrerasGame {
  return game === "carreras" || game === "carreras3d";
}

export function normalizeMeta(raw: Partial<CarrerasMeta>): CarrerasMeta {
  const game = raw.game === "carreras3d" ? "carreras3d" : "carreras";
  return {
    game,
    hostId: raw.hostId,
    mode: game === "carreras3d" && raw.mode === "telefono" ? "telefono" : "pantalla",
    track: raw.track && raw.track in TRACKS ? raw.track : "ovalo",
    laps: raw.laps ?? 5,
    createdAt: raw.createdAt ?? 0,
  };
}

function normalizeState(raw: Partial<CarrerasState> | null): CarrerasState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    seats: { a: raw.seats?.a ?? "", b: raw.seats?.b ?? "", c: raw.seats?.c ?? "", d: raw.seats?.d ?? "" },
    racers: raw.racers ?? "",
    startedAt: raw.startedAt ?? 0,
    results: raw.results ?? {},
    firstAt: raw.firstAt ?? 0,
    winner: raw.winner ?? "",
    wins: raw.wins ?? {},
  };
}

export function seatOf(state: Pick<CarrerasState, "seats">, clientId: string): Seat | null {
  if (!clientId) return null;
  return SEATS.find((seat) => state.seats[seat] === clientId) ?? null;
}

export function racersOf(state: Pick<CarrerasState, "racers">): Seat[] {
  return SEATS.filter((seat) => state.racers.includes(seat));
}

/** Which seats are taken, as a string ("ab-d" style), to notice changes. */
export function roomCarsKey(state: Pick<CarrerasState, "seats">): string {
  return SEATS.map((seat) => (state.seats[seat] ? seat : "-")).join("");
}

/** Finishers by time, then those who didn't finish. */
export function standings(state: CarrerasState): { seat: Seat; ms: number | null }[] {
  return racersOf(state)
    .map((seat) => ({ seat, ms: state.results[seat] ?? null }))
    .sort((x, y) => (x.ms ?? Infinity) - (y.ms ?? Infinity));
}

// ---- Firebase ------------------------------------------------------------

const base = (roomId: string) => `rooms/${roomId}/carreras`;
const statePath = (roomId: string) => `${base(roomId)}/state`;

function mutate(roomId: string, fn: (state: CarrerasState) => CarrerasState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createCarrerasRoom(
  game: CarrerasGame,
  hostId: string,
  settings: { mode: CarrerasMode; track: TrackId; laps: number }
): Promise<string> {
  const roomId = generateRoomCode();
  const meta: CarrerasMeta = { game, hostId, ...settings, createdAt: serverTimestamp() };
  const state: Partial<CarrerasState> = { status: "waiting", gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getCarrerasMeta(roomId: string): Promise<Partial<CarrerasMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeCarreras(roomId: string, cb: (state: CarrerasState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

/** Registers the player and, before the race, sits them in a free seat. */
export function joinCarreras(roomId: string, clientId: string, player: CarrerasPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    const free = SEATS.find((seat) => !s.seats[seat]) ?? null;
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
 * saw there). Mid-race only a left player's seat, and only by a spectator.
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

function raceFrom(s: CarrerasState): CarrerasState | null {
  const racers = SEATS.filter((seat) => s.seats[seat]).join("");
  if (!racers) return null;
  return { ...s, status: "racing", racers, startedAt: serverNow() + COUNTDOWN_MS, results: {}, firstAt: 0, winner: "" };
}

/** Starts the countdown; one car is enough (a practice race against the clock). */
export function startRace(roomId: string) {
  return mutate(roomId, (s) => (s.status === "waiting" ? raceFrom(s) : null));
}

/** Closes the race: the fastest finisher wins. */
function finish(s: CarrerasState): CarrerasState {
  const best = standings(s)[0];
  const winner = best && best.ms !== null ? best.seat : "";
  const id = winner ? s.seats[winner] : "";
  return {
    ...s,
    status: "finished",
    winner,
    wins: id ? { ...s.wins, [id]: (s.wins[id] ?? 0) + 1 } : s.wins,
  };
}

/** `seat` crossed the finish line after `raceMs` (once per seat). */
export function reportFinish(roomId: string, expectedGame: number, seat: Seat, raceMs: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "racing" || s.gameNo !== expectedGame) return null;
    if (!s.racers.includes(seat) || s.results[seat] !== undefined) return null;
    const next = {
      ...s,
      results: { ...s.results, [seat]: Math.max(0, Math.round(raceMs)) },
      firstAt: s.firstAt || serverNow(),
    };
    return racersOf(next).every((r) => next.results[r] !== undefined) ? finish(next) : next;
  });
}

/**
 * Ends the race after someone finished: when the grace time ran out, or
 * earlier if everyone still racing has left (`othersGone`, the caller's call).
 */
export function closeRace(roomId: string, expectedGame: number, othersGone: boolean) {
  return mutate(roomId, (s) => {
    if (s.status !== "racing" || s.gameNo !== expectedGame || !s.firstAt) return null;
    if (!othersGone && serverNow() < s.firstAt + FINISH_GRACE_MS) return null;
    return finish(s);
  });
}

/** Same seats, straight into a new countdown (or back to waiting if nobody is seated). */
export function rematch(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    const next = { ...s, gameNo: s.gameNo + 1 };
    return raceFrom(next) ?? { ...next, status: "waiting" };
  });
}

/** Back to the seats screen (to change drivers), also to abandon a race. */
export function backToWaiting(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) =>
    s.status !== "waiting" && s.gameNo === expectedGame ? { ...s, status: "waiting", gameNo: s.gameNo + 1 } : null
  );
}

// ---- Per-player values -------------------------------------------------------

/** A value this client keeps at `path` while connected, removed on disconnect. */
function ownedValue<T>(path: string) {
  const r = ref(getDb(), path);
  onDisconnect(r).remove().catch(console.error);
  return {
    send: (value: T) => set(r, value).catch(console.error),
    close: () => {
      onDisconnect(r).cancel().catch(console.error);
      remove(r).catch(console.error);
    },
  };
}

// ---- Inputs (pantalla: phone → screen) ------------------------------------

export function openInput(roomId: string, clientId: string) {
  return ownedValue<CarInputWire>(`${base(roomId)}/input/${clientId}`);
}

export function subscribeInputs(roomId: string, cb: (inputs: Record<string, CarInputWire>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/input`), (snap) => cb(snap.val() ?? {}));
}

// ---- Live race info (pantalla: screen → phones) ---------------------------

export function writeLive(roomId: string, live: CarrerasLive) {
  return set(ref(getDb(), `${base(roomId)}/live`), live).catch(console.error);
}

export function subscribeLive(roomId: string, cb: (live: CarrerasLive | null) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/live`), (snap) => {
    const raw = snap.val() as Partial<CarrerasLive> | null;
    cb(raw ? { gameNo: raw.gameNo ?? 0, cars: raw.cars ?? {} } : null);
  });
}

// ---- Car poses (telefono: every phone → everyone) -------------------------

export function openPose(roomId: string, clientId: string) {
  return ownedValue<CarPose>(`${base(roomId)}/cars/${clientId}`);
}

export function subscribePoses(roomId: string, cb: (poses: Record<string, CarPose>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/cars`), (snap) => cb(snap.val() ?? {}));
}
