import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { transactState } from "./transact";

/**
 * Ludo for 2–4. Seats `a` red, `b` green, `c` yellow, `d` blue, clockwise;
 * with two players they sit opposite (a and c). Each token's position is its
 * progress from its seat's start: -1 in the base, 0–50 on the shared track,
 * 51–55 in its home column and 56 at the goal.
 *
 * Rules: a 6 takes a token out and rolls again (three 6s in a row lose the
 * turn); landing on rivals outside a safe square sends them back to their base
 * and rolls again, as does reaching the goal; the goal needs the exact count.
 * First to bring the four tokens home wins. The die is rolled with
 * Math.random inside the transaction by the player in turn.
 */

export type Seat = "a" | "b" | "c" | "d";
export const SEATS: Seat[] = ["a", "b", "c", "d"];
/** Who sits first: opposite seats for two players. */
const JOIN_ORDER: Seat[] = ["a", "c", "b", "d"];

export const SEAT_INFO: Record<Seat, { label: string; color: string; light: string; start: number }> = {
  a: { label: "Rojo", color: "#ef4444", light: "#fecaca", start: 0 },
  b: { label: "Verde", color: "#22c55e", light: "#bbf7d0", start: 13 },
  c: { label: "Amarillo", color: "#eab308", light: "#fef08a", start: 26 },
  d: { label: "Azul", color: "#3b82f6", light: "#bfdbfe", start: 39 },
};

export const TOKENS = 4;
export const LAST_TRACK = 50;
export const GOAL = 56;
export const TRACK_LENGTH = 52;

/** The 52 track squares on a 15×15 board, clockwise from red's start. */
export const TRACK: [number, number][] = [
  ...[1, 2, 3, 4, 5].map((c) => [6, c] as [number, number]),
  ...[5, 4, 3, 2, 1, 0].map((r) => [r, 6] as [number, number]),
  [0, 7],
  [0, 8],
  ...[1, 2, 3, 4, 5].map((r) => [r, 8] as [number, number]),
  ...[9, 10, 11, 12, 13, 14].map((c) => [6, c] as [number, number]),
  [7, 14],
  [8, 14],
  ...[13, 12, 11, 10, 9].map((c) => [8, c] as [number, number]),
  ...[9, 10, 11, 12, 13, 14].map((r) => [r, 8] as [number, number]),
  [14, 7],
  [14, 6],
  ...[13, 12, 11, 10, 9].map((r) => [r, 6] as [number, number]),
  ...[5, 4, 3, 2, 1, 0].map((c) => [8, c] as [number, number]),
  [7, 0],
  [6, 0],
];

/** Each seat's home column (progress 51–55) and goal square (56). */
export const HOME: Record<Seat, [number, number][]> = {
  a: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  b: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  c: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  d: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
};

/** Top-left corner of each seat's base quadrant (6×6). */
export const BASE_ORIGIN: Record<Seat, [number, number]> = { a: [0, 0], b: [0, 9], c: [9, 9], d: [9, 0] };

/** Starts and the squares 8 ahead of them: nobody can be captured there. */
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export type LudoStatus = "waiting" | "playing" | "finished";
export type Phase = "roll" | "move";

export interface LudoMeta {
  game: "ludo";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  createdAt: number | object;
}

export interface LudoPlayer {
  name: string;
  color: string;
}

export interface LudoState {
  status: LudoStatus;
  gameNo: number;
  players: Record<string, LudoPlayer>;
  /** Client id in each seat, "" if empty. */
  seats: Record<Seat, string>;
  /** Seats playing this game, in turn order (e.g. "ac"). */
  active: string;
  /** Per seat, the four tokens' progress as "p,p,p,p". */
  tokens: Record<Seat, string>;
  turn: Seat;
  phase: Phase;
  /** Last roll, 0 before the first. */
  die: number;
  /** 6s rolled in a row this turn. */
  sixes: number;
  /** Bumped on every roll and move, so a double tap can't act twice. */
  moveNo: number;
  /** What just happened, for everyone to see. */
  last: { seat: Seat | ""; token: number; from: number; to: number; captured: boolean };
  winner: Seat | "";
  /** Games won per client id, across rematches. */
  wins: Record<string, number>;
}

const START_TOKENS = "-1,-1,-1,-1";

function normalizeState(raw: Partial<LudoState> | null): LudoState | null {
  if (!raw || !raw.status) return null;
  const tokens = raw.tokens ?? ({} as Partial<Record<Seat, string>>);
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    seats: { a: raw.seats?.a ?? "", b: raw.seats?.b ?? "", c: raw.seats?.c ?? "", d: raw.seats?.d ?? "" },
    active: raw.active ?? "",
    tokens: {
      a: tokens.a ?? START_TOKENS,
      b: tokens.b ?? START_TOKENS,
      c: tokens.c ?? START_TOKENS,
      d: tokens.d ?? START_TOKENS,
    },
    turn: raw.turn ?? "a",
    phase: raw.phase ?? "roll",
    die: raw.die ?? 0,
    sixes: raw.sixes ?? 0,
    moveNo: raw.moveNo ?? 0,
    last: {
      seat: raw.last?.seat ?? "",
      token: raw.last?.token ?? -1,
      from: raw.last?.from ?? 0,
      to: raw.last?.to ?? 0,
      captured: raw.last?.captured ?? false,
    },
    winner: raw.winner ?? "",
    wins: raw.wins ?? {},
  };
}

export function parseTokens(s: string): number[] {
  const t = s.split(",").map(Number);
  return t.length === TOKENS && t.every((n) => Number.isInteger(n)) ? t : [-1, -1, -1, -1];
}

export function seatOf(state: Pick<LudoState, "seats">, clientId: string): Seat | null {
  if (!clientId) return null;
  return SEATS.find((s) => state.seats[s] === clientId) ?? null;
}

/** Track square (0–51) of a token on the shared track, or -1 if it isn't on it. */
export function trackIndex(seat: Seat, progress: number): number {
  if (progress < 0 || progress > LAST_TRACK) return -1;
  return (SEAT_INFO[seat].start + progress) % TRACK_LENGTH;
}

/** Board cell (row, col) of a token; base tokens sit in their quadrant. */
export function cellOf(seat: Seat, progress: number, token: number): [number, number] {
  if (progress < 0) {
    const [r0, c0] = BASE_ORIGIN[seat];
    return [r0 + 1.5 + (token >> 1) * 2, c0 + 1.5 + (token & 1) * 2];
  }
  if (progress <= LAST_TRACK) return TRACK[trackIndex(seat, progress)];
  return HOME[seat][Math.min(progress, GOAL) - LAST_TRACK - 1];
}

/** Indexes of the tokens that can move with `die`. */
export function movableTokens(tokens: number[], die: number): number[] {
  const out: number[] = [];
  tokens.forEach((p, i) => {
    if (p < 0 ? die === 6 : p < GOAL && p + die <= GOAL) out.push(i);
  });
  return out;
}

function activeSeats(s: Pick<LudoState, "active">): Seat[] {
  return s.active.split("").filter((x): x is Seat => SEATS.includes(x as Seat));
}

function nextSeat(s: LudoState): Seat {
  const seats = activeSeats(s);
  return seats[(seats.indexOf(s.turn) + 1) % seats.length];
}

function passTurn(s: LudoState): LudoState {
  return { ...s, turn: nextSeat(s), phase: "roll", sixes: 0 };
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/ludo/state`;

function mutate(roomId: string, fn: (state: LudoState) => LudoState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createLudoRoom(hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: LudoMeta = { game: "ludo", hostId, createdAt: serverTimestamp() };
  const state: Partial<LudoState> = { status: "waiting", gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getLudoMeta(roomId: string): Promise<Partial<LudoMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeLudo(roomId: string, cb: (state: LudoState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

/** Registers the player and, before the game, sits them in a free seat. */
export function joinLudo(roomId: string, clientId: string, player: LudoPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    const free = JOIN_ORDER.find((seat) => !s.seats[seat]) ?? null;
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
 * saw there). Mid-game, only a playing seat whose player left can be taken.
 */
export function takeSeat(roomId: string, clientId: string, seat: Seat, expectedOccupant: string) {
  return mutate(roomId, (s) => {
    if (s.seats[seat] !== expectedOccupant || s.seats[seat] === clientId) return null;
    const mine = seatOf(s, clientId);
    if (s.status !== "waiting" && (mine || !expectedOccupant || !s.active.includes(seat))) return null;
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

function fresh(s: LudoState, active: string): LudoState {
  const tokens = { a: START_TOKENS, b: START_TOKENS, c: START_TOKENS, d: START_TOKENS };
  const first = active[0] as Seat;
  return {
    ...s,
    status: "playing",
    active,
    tokens,
    turn: first,
    phase: "roll",
    die: 0,
    sixes: 0,
    moveNo: s.moveNo + 1,
    last: { seat: "", token: -1, from: 0, to: 0, captured: false },
    winner: "",
  };
}

export function startLudo(roomId: string) {
  return mutate(roomId, (s) => {
    const active = SEATS.filter((seat) => s.seats[seat]).join("");
    if (s.status !== "waiting" || active.length < 2) return null;
    return fresh(s, active);
  });
}

export function rollDie(roomId: string, clientId: string, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.phase !== "roll" || s.seats[s.turn] !== clientId || s.moveNo !== expectedMove) return null;
    const die = 1 + Math.floor(Math.random() * 6);
    const sixes = die === 6 ? s.sixes + 1 : 0;
    const base = { ...s, die, sixes, moveNo: s.moveNo + 1 };
    if (sixes >= 3) return passTurn(base);
    const movable = movableTokens(parseTokens(s.tokens[s.turn]), die);
    if (movable.length === 0) return die === 6 ? { ...base, phase: "roll" } : passTurn(base);
    return { ...base, phase: "move" };
  });
}

export function moveToken(roomId: string, clientId: string, token: number, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.phase !== "move" || s.seats[s.turn] !== clientId || s.moveNo !== expectedMove) return null;
    const seat = s.turn;
    const mine = parseTokens(s.tokens[seat]);
    if (!movableTokens(mine, s.die).includes(token)) return null;
    const from = mine[token];
    const to = from < 0 ? 0 : from + s.die;
    mine[token] = to;
    const tokens = { ...s.tokens, [seat]: mine.join(",") };

    let captured = false;
    const square = trackIndex(seat, to);
    if (square >= 0 && !SAFE.has(square)) {
      for (const other of activeSeats(s)) {
        if (other === seat) continue;
        const theirs = parseTokens(tokens[other]);
        let hit = false;
        theirs.forEach((p, i) => {
          if (trackIndex(other, p) === square) {
            theirs[i] = -1;
            hit = true;
          }
        });
        if (hit) {
          captured = true;
          tokens[other] = theirs.join(",");
        }
      }
    }

    const next: LudoState = { ...s, tokens, moveNo: s.moveNo + 1, last: { seat, token, from, to, captured } };
    if (mine.every((p) => p === GOAL)) {
      return { ...next, status: "finished", winner: seat, wins: { ...s.wins, [clientId]: (s.wins[clientId] ?? 0) + 1 } };
    }
    if (s.die === 6 || captured || to === GOAL) return { ...next, phase: "roll" };
    return passTurn(next);
  });
}

/** The player in turn left: the next one plays. */
export function skipTurn(roomId: string, expectedMove: number) {
  return mutate(roomId, (s) =>
    s.status === "playing" && s.moveNo === expectedMove ? passTurn({ ...s, moveNo: s.moveNo + 1 }) : null
  );
}

/** Same seats, tokens back home; whoever sits now plays. */
export function rematch(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    const active = SEATS.filter((seat) => s.seats[seat]).join("");
    if (active.length < 2) return { ...s, status: "waiting", gameNo: s.gameNo + 1 };
    // The seat after last game's winner starts.
    const rotated = active.includes(s.winner) ? active.slice(active.indexOf(s.winner) + 1) + active.slice(0, active.indexOf(s.winner) + 1) : active;
    return { ...fresh(s, active), gameNo: s.gameNo + 1, turn: rotated[0] as Seat };
  });
}
