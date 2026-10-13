import { ref, get, onDisconnect, onValue, remove, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { TRACKS, type TrackId } from "./carrerasTrack";

/**
 * Carreras: the race runs on a shared screen (`/carreras/{id}/pantalla`, a
 * computer on a projector or TV) and phones are the controllers. Unlike the
 * other games the screen is the authority: it simulates the cars from the
 * players' inputs and reports the winner. Phones only write their own input.
 *
 * - `carreras/state` — seats, race status and results (transactions).
 * - `carreras/input/{clientId}` — `{s, b}`: steering -1…1 and brake, written
 *   on change; removed on disconnect (a car without input brakes).
 * - `carreras/live` — laps and places, written by the screen for the phones.
 */

export const COUNTDOWN_MS = 3000;
export const LAP_OPTIONS = [3, 5, 8];

export type Seat = "a" | "b";
export const SEATS: Seat[] = ["a", "b"];

export const CARS: Record<Seat, { label: string; color: string; glow: string }> = {
  a: { label: "Auto rojo", color: "#fb3a5d", glow: "rgba(251,58,93,0.55)" },
  b: { label: "Auto azul", color: "#22d3ee", glow: "rgba(34,211,238,0.55)" },
};

export type CarrerasStatus = "waiting" | "racing" | "finished";

export interface CarrerasMeta {
  game: "carreras";
  hostId?: string;
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
  /** Server time when the cars may move (the countdown ends). */
  startedAt: number;
  winner: Seat | "";
  /** Race time of the winner, in ms. */
  winnerMs: number;
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

export function normalizeMeta(raw: Partial<CarrerasMeta>): CarrerasMeta {
  return {
    game: "carreras",
    hostId: raw.hostId,
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
    seats: { a: raw.seats?.a ?? "", b: raw.seats?.b ?? "" },
    startedAt: raw.startedAt ?? 0,
    winner: raw.winner ?? "",
    winnerMs: raw.winnerMs ?? 0,
    wins: raw.wins ?? {},
  };
}

export function seatOf(state: Pick<CarrerasState, "seats">, clientId: string): Seat | null {
  if (!clientId) return null;
  if (state.seats.a === clientId) return "a";
  if (state.seats.b === clientId) return "b";
  return null;
}

// ---- Firebase ------------------------------------------------------------

const base = (roomId: string) => `rooms/${roomId}/carreras`;
const statePath = (roomId: string) => `${base(roomId)}/state`;

function mutate(roomId: string, fn: (state: CarrerasState) => CarrerasState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createCarrerasRoom(hostId: string, track: TrackId, laps: number): Promise<string> {
  const roomId = generateRoomCode();
  const meta: CarrerasMeta = { game: "carreras", hostId, track, laps, createdAt: serverTimestamp() };
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

/** Starts the countdown; one car is enough (a practice lap against the clock). */
export function startRace(roomId: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting" || (!s.seats.a && !s.seats.b)) return null;
    return { ...s, status: "racing", startedAt: serverNow() + COUNTDOWN_MS, winner: "", winnerMs: 0 };
  });
}

/** The screen saw `seat` cross the finish line first. */
export function reportWinner(roomId: string, expectedGame: number, seat: Seat, raceMs: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "racing" || s.gameNo !== expectedGame || s.winner) return null;
    const id = s.seats[seat];
    return {
      ...s,
      status: "finished",
      winner: seat,
      winnerMs: Math.round(raceMs),
      wins: id ? { ...s.wins, [id]: (s.wins[id] ?? 0) + 1 } : s.wins,
    };
  });
}

/** Same seats, straight into a new countdown (or back to waiting if someone is missing). */
export function rematch(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    const anyone = s.seats.a || s.seats.b;
    return {
      ...s,
      status: anyone ? "racing" : "waiting",
      gameNo: s.gameNo + 1,
      startedAt: serverNow() + COUNTDOWN_MS,
      winner: "",
      winnerMs: 0,
    };
  });
}

/** Back to the seats screen (to change players). */
export function backToWaiting(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) =>
    s.status === "finished" && s.gameNo === expectedGame ? { ...s, status: "waiting", gameNo: s.gameNo + 1 } : null
  );
}

// ---- Inputs (phone → screen) ----------------------------------------------

/** Starts sending this phone's input; returns a sender and a cleanup. */
export function openInput(roomId: string, clientId: string) {
  const r = ref(getDb(), `${base(roomId)}/input/${clientId}`);
  onDisconnect(r).remove().catch(console.error);
  return {
    send: (input: CarInputWire) => set(r, input).catch(console.error),
    close: () => {
      onDisconnect(r).cancel().catch(console.error);
      remove(r).catch(console.error);
    },
  };
}

export function subscribeInputs(roomId: string, cb: (inputs: Record<string, CarInputWire>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/input`), (snap) => cb(snap.val() ?? {}));
}

// ---- Live race info (screen → phones) -------------------------------------

export function writeLive(roomId: string, live: CarrerasLive) {
  return set(ref(getDb(), `${base(roomId)}/live`), live).catch(console.error);
}

export function subscribeLive(roomId: string, cb: (live: CarrerasLive | null) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/live`), (snap) => {
    const raw = snap.val() as Partial<CarrerasLive> | null;
    cb(raw ? { gameNo: raw.gameNo ?? 0, cars: raw.cars ?? {} } : null);
  });
}
