import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { transactState } from "./transact";
import { joinSeats, leaveSeatIn, otherSeat, seatOf2, swapSeatsIn, takeSeatIn, type Seat2, type SeatPlayer } from "./twoSeats";
import {
  CHECKERS,
  applyStep,
  decodePosition,
  encodePosition,
  initialPosition,
  legalSteps,
  winKind,
  type Position,
  type Step,
} from "./backgammonRules";

/**
 * Backgammon, a match to `matchTo` points between seats `a` (white, bottom)
 * and `b` (black). Rules in `lib/backgammonRules.ts`.
 *
 * Each game opens with one die each (rerolled on a tie); the higher plays both.
 * A turn: `roll` (or offer the doubling cube first) → `move` one checker per
 * die (`moveChecker`; `undo` restores the turn's start) → `endTurn` once no
 * die can be used. Without any legal move the turn passes right after the
 * roll. Bearing off the 15th checker ends the game: 1 point, 2 for a gammon,
 * 3 for a backgammon, times the cube. A refused double gives the doubler the
 * cube's value. Dice are rolled with Math.random inside the transaction.
 */

export type Seat = Seat2;
export type BgStatus = "waiting" | "playing" | "finished";
export type BgPhase = "roll" | "move" | "double" | "gameover";
export type ResultKind = "" | "simple" | "gammon" | "backgammon" | "drop" | "resign";

export const MATCH_OPTIONS = [1, 3, 5, 7] as const;
export const MAX_CUBE = 64;

export const SEAT_STYLE: Record<Seat, { label: string; fill: string; ring: string; text: string }> = {
  a: { label: "Blancas", fill: "#f5efe0", ring: "#b8a77e", text: "#44403c" },
  b: { label: "Negras", fill: "#1f2937", ring: "#64748b", text: "#e2e8f0" },
};

export interface BgMeta {
  game: "backgammon";
  matchTo: number;
  hostId?: string;
  createdAt: number | object;
}

export interface BgState {
  status: BgStatus;
  matchTo: number;
  /** Matches started in this room, for "Revancha". */
  gameNo: number;
  /** Games played in this match. */
  gameInMatch: number;
  players: Record<string, SeatPlayer>;
  seats: Record<Seat, string>;
  score: Record<Seat, number>;
  /** `encodePosition` of the board. */
  pos: string;
  /** The board when this turn's moves started, for undo. */
  turnStart: string;
  turn: Seat;
  phase: BgPhase;
  /** The roll as thrown ("3,5"; doubles once) and the dice still to use. */
  rolled: string;
  dice: string;
  /** This turn's steps as "from/to*" in the mover's coordinates (* = hit). */
  moves: string;
  /** The first roll of a game (one die each). */
  opening: boolean;
  /** The last roll had no legal move (turn passed). */
  blocked: boolean;
  cube: number;
  cubeOwner: Seat | "";
  moveNo: number;
  /** The game that just ended. */
  result: { winner: Seat | ""; points: number; kind: ResultKind };
  /** Matches won per client id. */
  wins: Record<string, number>;
}

const NO_RESULT = { winner: "" as const, points: 0, kind: "" as const };

function normalizeState(raw: Partial<BgState> | null): BgState | null {
  if (!raw || !raw.status) return null;
  const pos = raw.pos ?? encodePosition(initialPosition());
  return {
    status: raw.status,
    matchTo: raw.matchTo ?? 3,
    gameNo: raw.gameNo ?? 0,
    gameInMatch: raw.gameInMatch ?? 0,
    players: raw.players ?? {},
    seats: { a: raw.seats?.a ?? "", b: raw.seats?.b ?? "" },
    score: { a: raw.score?.a ?? 0, b: raw.score?.b ?? 0 },
    pos,
    turnStart: raw.turnStart ?? pos,
    turn: raw.turn ?? "a",
    phase: raw.phase ?? "roll",
    rolled: raw.rolled ?? "",
    dice: raw.dice ?? "",
    moves: raw.moves ?? "",
    opening: raw.opening ?? false,
    blocked: raw.blocked ?? false,
    cube: raw.cube ?? 1,
    cubeOwner: raw.cubeOwner ?? "",
    moveNo: raw.moveNo ?? 0,
    result: { ...NO_RESULT, ...raw.result },
    wins: raw.wins ?? {},
  };
}

export const seatOf = seatOf2;
export { otherSeat };

export const parseDice = (s: string): number[] => (s ? s.split(",").map(Number) : []);
export const positionOf = (s: Pick<BgState, "pos">): Position => decodePosition(s.pos);

/** Steps the player in turn can make now. */
export function currentSteps(s: BgState): Step[] {
  if (s.status !== "playing" || s.phase !== "move") return [];
  return legalSteps(positionOf(s), s.turn, parseDice(s.dice));
}

/** Whether the player in turn may offer the cube now. */
export function canDouble(s: BgState): boolean {
  return s.status === "playing" && s.phase === "roll" && s.cube < MAX_CUBE && (s.cubeOwner === "" || s.cubeOwner === s.turn);
}

const roll = () => 1 + Math.floor(Math.random() * 6);
const diceOf = (d1: number, d2: number) => (d1 === d2 ? [d1, d1, d1, d1] : [d1, d2]);

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/backgammon/state`;

function mutate(roomId: string, fn: (state: BgState) => BgState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createBackgammonRoom(matchTo: number, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: BgMeta = { game: "backgammon", matchTo, hostId, createdAt: serverTimestamp() };
  const state: Partial<BgState> = { status: "waiting", matchTo, gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getBackgammonMeta(roomId: string): Promise<Partial<BgMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeBackgammon(roomId: string, cb: (state: BgState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export const joinBackgammon = (roomId: string, clientId: string, player: SeatPlayer) =>
  mutate(roomId, (s) => joinSeats(s, clientId, player));
export const takeSeat = (roomId: string, clientId: string, seat: Seat, expected: string) =>
  mutate(roomId, (s) => takeSeatIn(s, clientId, seat, expected));
export const leaveSeat = (roomId: string, clientId: string) => mutate(roomId, (s) => leaveSeatIn(s, clientId));
export const swapSeats = (roomId: string) => mutate(roomId, (s) => swapSeatsIn(s));

/** A new game of the match: fresh board, opening roll. */
function newGame(s: BgState): BgState {
  let d1 = roll();
  let d2 = roll();
  while (d1 === d2) {
    d1 = roll();
    d2 = roll();
  }
  const pos = encodePosition(initialPosition());
  return {
    ...s,
    status: "playing",
    pos,
    turnStart: pos,
    turn: d1 > d2 ? "a" : "b",
    phase: "move",
    // The opening roll keeps who threw what: a's die first.
    rolled: `${d1},${d2}`,
    dice: `${d1},${d2}`,
    moves: "",
    opening: true,
    blocked: false,
    cube: 1,
    cubeOwner: "",
    moveNo: s.moveNo + 1,
    result: NO_RESULT,
  };
}

function newMatch(s: BgState): BgState {
  return newGame({ ...s, score: { a: 0, b: 0 }, gameInMatch: 0 });
}

export function startBackgammon(roomId: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting" || !s.seats.a || !s.seats.b || s.seats.a === s.seats.b) return null;
    return newMatch(s);
  });
}

/** Ends the game: `winner` takes `points`; the match may be over. */
function endGame(s: BgState, winner: Seat, points: number, kind: ResultKind): BgState {
  const score = { ...s.score, [winner]: s.score[winner] + points };
  const base: BgState = {
    ...s,
    score,
    phase: "gameover",
    dice: "",
    moveNo: s.moveNo + 1,
    gameInMatch: s.gameInMatch + 1,
    result: { winner, points, kind },
  };
  if (score[winner] < s.matchTo) return base;
  const id = s.seats[winner];
  return { ...base, status: "finished", wins: id ? { ...s.wins, [id]: (s.wins[id] ?? 0) + 1 } : s.wins };
}

function passTo(s: BgState, seat: Seat): BgState {
  return { ...s, turn: seat, phase: "roll", dice: "", moves: "", opening: false, turnStart: s.pos };
}

export function rollDice(roomId: string, clientId: string, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.phase !== "roll" || s.seats[s.turn] !== clientId || s.moveNo !== expectedMove) return null;
    const d1 = roll();
    const d2 = roll();
    const dice = diceOf(d1, d2);
    const next: BgState = {
      ...s,
      phase: "move",
      rolled: `${d1},${d2}`,
      dice: dice.join(","),
      moves: "",
      opening: false,
      blocked: false,
      turnStart: s.pos,
      moveNo: s.moveNo + 1,
    };
    if (legalSteps(positionOf(s), s.turn, dice).length > 0) return next;
    return { ...passTo(next, otherSeat(s.turn)), rolled: next.rolled, blocked: true };
  });
}

/** Moves one checker from own coordinate `from` with die `die`. */
export function moveChecker(roomId: string, clientId: string, from: number, die: number, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.phase !== "move" || s.seats[s.turn] !== clientId || s.moveNo !== expectedMove) return null;
    const step = currentSteps(s).find((x) => x.from === from && x.die === die);
    if (!step) return null;
    const pos = applyStep(positionOf(s), s.turn, step);
    const dice = parseDice(s.dice);
    dice.splice(dice.indexOf(die), 1);
    const label = `${from === 25 ? "barra" : from}/${step.to === 0 ? "afuera" : step.to}${step.hit ? "*" : ""}`;
    const next: BgState = {
      ...s,
      pos: encodePosition(pos),
      dice: dice.join(","),
      moves: s.moves ? `${s.moves} ${label}` : label,
      moveNo: s.moveNo + 1,
    };
    if (pos.off[s.turn] === CHECKERS) {
      const kind = winKind(pos, s.turn);
      return endGame(next, s.turn, kind * s.cube, kind === 3 ? "backgammon" : kind === 2 ? "gammon" : "simple");
    }
    return next;
  });
}

/** Takes back this turn's moves. */
export function undoTurn(roomId: string, clientId: string, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.phase !== "move" || s.seats[s.turn] !== clientId || s.moveNo !== expectedMove) return null;
    if (!s.moves) return null;
    const rolled = parseDice(s.rolled);
    const dice = s.opening ? rolled : diceOf(rolled[0], rolled[1]);
    return { ...s, pos: s.turnStart, dice: dice.join(","), moves: "", moveNo: s.moveNo + 1 };
  });
}

/** Done moving (only once no die can be used). */
export function endTurn(roomId: string, clientId: string, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.phase !== "move" || s.seats[s.turn] !== clientId || s.moveNo !== expectedMove) return null;
    if (currentSteps(s).length > 0) return null;
    return { ...passTo(s, otherSeat(s.turn)), moveNo: s.moveNo + 1 };
  });
}

export function offerDouble(roomId: string, clientId: string, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (!canDouble(s) || s.seats[s.turn] !== clientId || s.moveNo !== expectedMove) return null;
    return { ...s, phase: "double", moveNo: s.moveNo + 1 };
  });
}

/** The rival of whoever doubled accepts (cube ×2, now theirs) or refuses (loses the cube's value). */
export function answerDouble(roomId: string, clientId: string, accept: boolean, expectedMove: number) {
  return mutate(roomId, (s) => {
    const responder = otherSeat(s.turn);
    if (s.status !== "playing" || s.phase !== "double" || s.seats[responder] !== clientId || s.moveNo !== expectedMove) return null;
    if (!accept) return endGame(s, s.turn, s.cube, "drop");
    return { ...s, phase: "roll", cube: s.cube * 2, cubeOwner: responder, moveNo: s.moveNo + 1 };
  });
}

/** Gives up the current game (the rival takes the cube's value). */
export function resignGame(roomId: string, clientId: string) {
  return mutate(roomId, (s) => {
    const mine = seatOf(s, clientId);
    if (s.status !== "playing" || s.phase === "gameover" || !mine) return null;
    return endGame(s, otherSeat(mine), s.cube, "resign");
  });
}

export function nextGame(roomId: string, expectedGameInMatch: number) {
  return mutate(roomId, (s) =>
    s.status === "playing" && s.phase === "gameover" && s.gameInMatch === expectedGameInMatch ? newGame(s) : null
  );
}

/** The player in turn left: their turn passes (a pending double counts as refused). */
export function skipAbsent(roomId: string, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.moveNo !== expectedMove) return null;
    if (s.phase === "double") return endGame(s, s.turn, s.cube, "drop");
    if (s.phase !== "roll" && s.phase !== "move") return null;
    return { ...passTo({ ...s, pos: s.turnStart }, otherSeat(s.turn)), moveNo: s.moveNo + 1 };
  });
}

/** New match with colors swapped. */
export function rematch(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    const swapped: BgState = { ...s, gameNo: s.gameNo + 1, seats: { a: s.seats.b, b: s.seats.a } };
    return swapped.seats.a && swapped.seats.b ? newMatch(swapped) : { ...swapped, status: "waiting" };
  });
}
