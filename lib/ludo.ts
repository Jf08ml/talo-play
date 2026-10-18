import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { transactState } from "./transact";
import {
  EAT_BONUS,
  GOAL_BONUS,
  RULES,
  SEATS,
  TOKENS,
  applyMove,
  legalMoves,
  stepsFor,
  type Board,
  type LudoMove,
  type LudoRules,
  type Seat,
} from "./ludoRules";

/**
 * Parchís (and classic Ludo) for 2–4; the rules and the board live in
 * `lib/ludoRules.ts`. With two players they sit opposite (a and c). Rooms
 * from before Parchís have no `rules` and play Ludo.
 *
 * The die is rolled with Math.random inside the transaction by the player in
 * turn. A turn: roll → move (`steps` = the roll; in Parchís a 6 counts 7 with
 * every token out) → in Parchís maybe a bonus move (`steps` 20 after eating,
 * 10 after reaching the goal) → roll again after a 6 (and in Ludo after eating
 * or reaching the goal). Three 6s in a row send the token moved this turn back
 * to its base (Parchís) or just lose the turn (Ludo).
 */

export { SEATS, TOKENS, type LudoRules, type Seat };
/** Who sits first: opposite seats for two players. */
const JOIN_ORDER: Seat[] = ["a", "c", "b", "d"];

export const SEAT_INFO: Record<Seat, { label: string; color: string; light: string }> = {
  a: { label: "Rojo", color: "#ef4444", light: "#fecaca" },
  b: { label: "Verde", color: "#22c55e", light: "#bbf7d0" },
  c: { label: "Amarillo", color: "#eab308", light: "#fef08a" },
  d: { label: "Azul", color: "#3b82f6", light: "#bfdbfe" },
};

export const RULES_LABEL: Record<LudoRules, string> = { parchis: "Parchís", ludo: "Ludo clásico" };

export type LudoStatus = "waiting" | "playing" | "finished";
export type Phase = "roll" | "move";

export interface LudoMeta {
  game: "ludo";
  /** Missing in rooms from before Parchís: those play Ludo. */
  rules?: LudoRules;
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  createdAt: number | object;
}

export interface LudoPlayer {
  name: string;
  color: string;
}

export interface LastMove {
  seat: Seat | "";
  /** -1 (not punished): the roll had no move. */
  token: number;
  from: number;
  to: number;
  captured: boolean;
  /** 20 or 10 when this was a Parchís bonus move. */
  bonus: number;
  /** Three 6s: the token went back to its base (token -1: just lost the turn). */
  punished: boolean;
}

export interface LudoState {
  status: LudoStatus;
  rules: LudoRules;
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
  /** What the pending move counts: the roll, 7, or a 20/10 bonus. */
  steps: number;
  /** 6s rolled in a row this turn. */
  sixes: number;
  /** Token moved last this turn (-1 none): the one three 6s send home. */
  turnToken: number;
  /** Bumped on every roll and move, so a double tap can't act twice. */
  moveNo: number;
  /** What just happened, for everyone to see. */
  last: LastMove;
  winner: Seat | "";
  /** Games won per client id, across rematches. */
  wins: Record<string, number>;
}

const START_TOKENS = "-1,-1,-1,-1";
const NO_MOVE: LastMove = { seat: "", token: -1, from: 0, to: 0, captured: false, bonus: 0, punished: false };

function normalizeState(raw: Partial<LudoState> | null): LudoState | null {
  if (!raw || !raw.status) return null;
  const tokens = raw.tokens ?? ({} as Partial<Record<Seat, string>>);
  return {
    status: raw.status,
    rules: raw.rules === "parchis" ? "parchis" : "ludo",
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
    steps: raw.steps ?? raw.die ?? 0,
    sixes: raw.sixes ?? 0,
    turnToken: raw.turnToken ?? -1,
    moveNo: raw.moveNo ?? 0,
    last: { ...NO_MOVE, ...raw.last },
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

export function activeSeats(s: Pick<LudoState, "active">): Seat[] {
  return s.active.split("").filter((x): x is Seat => SEATS.includes(x as Seat));
}

export function boardOf(s: Pick<LudoState, "tokens">): Board {
  return { a: parseTokens(s.tokens.a), b: parseTokens(s.tokens.b), c: parseTokens(s.tokens.c), d: parseTokens(s.tokens.d) };
}

function tokensOf(board: Board): Record<Seat, string> {
  return { a: board.a.join(","), b: board.b.join(","), c: board.c.join(","), d: board.d.join(",") };
}

/** Whether the pending move is a Parchís bonus (20 or 10). */
export const isBonus = (s: Pick<LudoState, "steps">) => s.steps >= GOAL_BONUS;

/** The moves the player in turn can make now (none outside the move phase). */
export function currentMoves(s: LudoState): LudoMove[] {
  if (s.status !== "playing" || s.phase !== "move") return [];
  return legalMoves(s.rules, boardOf(s), activeSeats(s), s.turn, s.steps, isBonus(s));
}

function nextSeat(s: LudoState): Seat {
  const seats = activeSeats(s);
  return seats[(seats.indexOf(s.turn) + 1) % seats.length];
}

function passTurn(s: LudoState): LudoState {
  return { ...s, turn: nextSeat(s), phase: "roll", sixes: 0, turnToken: -1 };
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/ludo/state`;

function mutate(roomId: string, fn: (state: LudoState) => LudoState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createLudoRoom(hostId: string, rules: LudoRules): Promise<string> {
  const roomId = generateRoomCode();
  const meta: LudoMeta = { game: "ludo", rules, hostId, createdAt: serverTimestamp() };
  const state: Partial<LudoState> = { status: "waiting", rules, gameNo: 0 };
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
  return {
    ...s,
    status: "playing",
    active,
    tokens,
    turn: active[0] as Seat,
    phase: "roll",
    die: 0,
    steps: 0,
    sixes: 0,
    turnToken: -1,
    moveNo: s.moveNo + 1,
    last: NO_MOVE,
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
    const board = boardOf(s);
    const steps = stepsFor(s.rules, die, board[s.turn]);
    const base: LudoState = { ...s, die, steps, sixes, moveNo: s.moveNo + 1 };
    if (sixes >= 3) {
      const p = s.turnToken >= 0 ? board[s.turn][s.turnToken] : -1;
      if (s.rules === "parchis" && p >= 0 && p <= RULES.parchis.lastTrack) {
        board[s.turn][s.turnToken] = -1;
        const last: LastMove = { ...NO_MOVE, seat: s.turn, token: s.turnToken, from: p, to: -1, punished: true };
        return passTurn({ ...base, tokens: tokensOf(board), last });
      }
      return passTurn({ ...base, last: { ...NO_MOVE, seat: s.turn, punished: true } });
    }
    const moves = legalMoves(s.rules, board, activeSeats(s), s.turn, steps);
    if (moves.length === 0) {
      const stuck = { ...base, last: { ...NO_MOVE, seat: s.turn } };
      return die === 6 ? stuck : passTurn(stuck);
    }
    return { ...base, phase: "move" };
  });
}

export function moveToken(roomId: string, clientId: string, token: number, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.phase !== "move" || s.seats[s.turn] !== clientId || s.moveNo !== expectedMove) return null;
    const seat = s.turn;
    const move = currentMoves(s).find((m) => m.token === token);
    if (!move) return null;
    const board = applyMove(boardOf(s), seat, move);
    const captured = move.captures.length > 0;
    const goal = RULES[s.rules].goal;
    const next: LudoState = {
      ...s,
      tokens: tokensOf(board),
      moveNo: s.moveNo + 1,
      turnToken: token,
      last: { seat, token, from: move.from, to: move.to, captured, bonus: isBonus(s) ? s.steps : 0, punished: false },
    };
    if (board[seat].every((p) => p === goal)) {
      return { ...next, status: "finished", winner: seat, wins: { ...s.wins, [clientId]: (s.wins[clientId] ?? 0) + 1 } };
    }
    if (s.rules === "ludo") {
      return s.die === 6 || captured || move.to === goal ? { ...next, phase: "roll" } : passTurn(next);
    }
    const bonus = captured ? EAT_BONUS : move.to === goal ? GOAL_BONUS : 0;
    if (bonus && legalMoves(s.rules, board, activeSeats(s), seat, bonus, true).length > 0) {
      return { ...next, phase: "move", steps: bonus };
    }
    return s.die === 6 ? { ...next, phase: "roll" } : passTurn(next);
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
    const at = active.indexOf(s.winner);
    const rotated = at >= 0 ? active.slice(at + 1) + active.slice(0, at + 1) : active;
    return { ...fresh(s, active), gameNo: s.gameNo + 1, turn: rotated[0] as Seat };
  });
}
