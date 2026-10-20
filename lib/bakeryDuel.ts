import { ref, onValue, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { saveRoomSettings } from "./roomSettings";
import {
  EMPTY_CAKE,
  LEVELS,
  PEEK_SECONDS,
  applyBuild,
  freshCake,
  makeOrders,
  mismatches,
  missingStep,
  orderPoints,
  orderVisible,
  type BuildAction,
  type Cake,
  type Field,
  type Level,
  type OrderTicket,
} from "./bakery";

/**
 * Pastelería's duel: a timed shift where everyone gets the same orders (from
 * `state.seed`, one level's options) and builds them as fast as they can. A
 * right cake scores like in the solo game (streak bonus, less for each look
 * back at a hidden order); a wrong one takes `WRONG_PENALTY` and the next
 * order comes anyway. Most points when the clock runs out wins.
 *
 * Each player runs their own shift (`shiftStep`, pure) and writes only
 * `boards/g{gameNo}/{clientId}` (score, counts and the cake on the counter,
 * so rivals see it). The shift (countdown, end, winner) goes through
 * transactions on `state`; any client closes it after the end with the
 * scores it sees.
 */

export const COUNTDOWN_MS = 3000;
/** Wait after the end before closing, so the last deliveries arrive. */
export const CLOSE_GRACE_MS = 2500;
export const WRONG_PENALTY = 25;
export const DUEL_MINUTES = [2, 3, 5];
/** More than anyone can build in the longest shift. */
const DUEL_ORDERS = 150;

export const duelLevel = (level: number): Level => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level))];

/** A level's orders in a line, for the duel's settings ("Hasta 2 pisos · 1 decoración · con dibujo"). */
export function duelLevelSummary(level: number): string {
  const lv = duelLevel(level);
  const most = Math.max(...lv.layers);
  return [
    most === 1 ? "1 piso" : `hasta ${most} pisos`,
    lv.decorationCount === 1 ? "1 decoración" : `${lv.decorationCount} decoraciones`,
    lv.memorize ? `el pedido se esconde a los ${lv.memorize} s` : lv.picture ? "pedido con dibujo" : "pedido sin dibujo",
  ]
    .join(" · ")
    .replace(/^./, (c) => c.toUpperCase());
}

/** The shift's orders, the same on every phone. */
export const duelOrders = (level: number, seed: number): OrderTicket[] => makeOrders({ ...duelLevel(level), orders: DUEL_ORDERS }, seed);

// ---- One player's shift ------------------------------------------------------

export interface Delivery {
  /** Counts deliveries, so each one shows its feedback once. */
  n: number;
  right: boolean;
  wrong: Field[];
  points: number;
}

export interface Shift {
  orderNo: number;
  cake: Cake;
  /** Seconds on this order and until when its card shows (levels with `memorize`). */
  elapsed: number;
  showUntil: number;
  peeks: number;
  score: number;
  streak: number;
  bestStreak: number;
  right: number;
  wrong: number;
  last: Delivery | null;
}

export function newShift(lv: Level): Shift {
  return { orderNo: 0, cake: freshCake(lv), elapsed: 0, showUntil: lv.memorize, peeks: 0, score: 0, streak: 0, bestStreak: 0, right: 0, wrong: 0, last: null };
}

export type ShiftAction = BuildAction | { type: "reset" } | { type: "peek" } | { type: "tick"; seconds: number } | { type: "deliver" };

export function shiftStep(s: Shift, lv: Level, tickets: OrderTicket[], a: ShiftAction): Shift {
  switch (a.type) {
    case "set":
    case "layers":
    case "decoration": {
      const cake = applyBuild(s.cake, lv, a);
      return cake ? { ...s, cake } : s;
    }
    case "reset":
      return { ...s, cake: freshCake(lv) };
    case "peek":
      return orderVisible(lv, s.elapsed, s.showUntil) ? s : { ...s, peeks: s.peeks + 1, showUntil: s.elapsed + PEEK_SECONDS };
    case "tick":
      return { ...s, elapsed: s.elapsed + a.seconds };
    case "deliver": {
      const ticket = tickets[s.orderNo];
      if (!ticket || missingStep(s.cake)) return s;
      const wrong = mismatches(s.cake, ticket.order);
      const right = wrong.length === 0;
      const streak = right ? s.streak + 1 : 0;
      const points = right ? orderPoints(1, streak, 0, s.peeks) : -Math.min(WRONG_PENALTY, s.score);
      return {
        ...newShift(lv),
        orderNo: s.orderNo + 1,
        score: s.score + points,
        streak,
        bestStreak: Math.max(s.bestStreak, streak),
        right: s.right + (right ? 1 : 0),
        wrong: s.wrong + (right ? 0 : 1),
        last: { n: (s.last?.n ?? 0) + 1, right, wrong, points },
      };
    }
  }
}

// ---- Room data ---------------------------------------------------------------

export interface DuelMeta {
  game: "pasteleria";
  hostId?: string;
  createdAt: number | object;
  /** Index in `LEVELS`: which options and rules the orders use. */
  level: number;
  minutes: number;
}

export type DuelStatus = "waiting" | "playing" | "finished";

export interface DuelPlayer {
  name: string;
  color: string;
}

export interface DuelState {
  status: DuelStatus;
  seed: number;
  /** Increments on each shift so boards from earlier ones never mix in. */
  gameNo: number;
  /** Server times: building opens at `startedAt` (after the countdown) and stops at `endsAt`. */
  startedAt: number;
  endsAt: number;
  players: Record<string, DuelPlayer>;
  /** Scores when the shift closed. */
  final: Record<string, number>;
  /** Top score ("" = tie or nobody scored). */
  winner: string;
  /** Shifts won per client id. */
  wins: Record<string, number>;
}

/** What each player publishes about their shift. */
export interface DuelBoard {
  score: number;
  right: number;
  wrong: number;
  bestStreak: number;
  orderNo: number;
  cake: Cake;
}

export function normalizeMeta(raw: Partial<DuelMeta>): Pick<DuelMeta, "level" | "minutes"> {
  return {
    level: typeof raw.level === "number" ? Math.max(0, Math.min(LEVELS.length - 1, Math.round(raw.level))) : 1,
    minutes: DUEL_MINUTES.includes(raw.minutes ?? 0) ? raw.minutes! : 3,
  };
}

function normalizeState(raw: Partial<DuelState> | null): DuelState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    startedAt: raw.startedAt ?? 0,
    endsAt: raw.endsAt ?? 0,
    players: raw.players ?? {},
    final: raw.final ?? {},
    winner: raw.winner ?? "",
    wins: raw.wins ?? {},
  };
}

// RTDB drops nulls and empty arrays: a cake comes back with fields missing.
function normalizeBoard(raw: Partial<DuelBoard> & { cake?: Partial<Cake> }): DuelBoard {
  const cake: Partial<Cake> = raw.cake ?? {};
  return {
    score: raw.score ?? 0,
    right: raw.right ?? 0,
    wrong: raw.wrong ?? 0,
    bestStreak: raw.bestStreak ?? 0,
    orderNo: raw.orderNo ?? 0,
    cake: { ...EMPTY_CAKE, ...cake, decorations: Object.values(cake.decorations ?? {}) },
  };
}

const base = (roomId: string) => `rooms/${roomId}/pasteleria`;
export const STATE_KEY = "pasteleria/state";

function mutate(roomId: string, fn: (state: DuelState) => DuelState | null) {
  return transactState(`${base(roomId)}/state`, normalizeState, fn);
}

export async function createDuelRoom(settings: { level: number; minutes: number }, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: DuelMeta = { game: "pasteleria", hostId, createdAt: serverTimestamp(), ...normalizeMeta(settings) };
  const state: Partial<DuelState> = { status: "waiting", seed: makeSeed(), gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [`${base(roomId)}/state`]: state,
  });
  return roomId;
}

export function saveDuelSettings(roomId: string, settings: { level: number; minutes: number }) {
  return saveRoomSettings(roomId, STATE_KEY, normalizeMeta(settings));
}

/** Boards per game key (`g{gameNo}`) and player. */
export type DuelBoards = Record<string, Record<string, DuelBoard>>;

export function subscribeDuel(roomId: string, cb: (data: { state: DuelState | null; boards: DuelBoards }) => void): Unsubscribe {
  return onValue(ref(getDb(), base(roomId)), (snap) => {
    const raw = (snap.val() ?? {}) as { state?: Partial<DuelState>; boards?: Record<string, Record<string, Partial<DuelBoard>>> };
    const boards: DuelBoards = {};
    for (const [g, byPlayer] of Object.entries(raw.boards ?? {})) {
      boards[g] = {};
      for (const [id, b] of Object.entries(byPlayer)) boards[g][id] = normalizeBoard(b);
    }
    cb({ state: normalizeState(raw.state ?? null), boards });
  });
}

export const gameKey = (state: Pick<DuelState, "gameNo">) => `g${state.gameNo}`;

export function saveBoard(roomId: string, gk: string, clientId: string, board: DuelBoard) {
  return set(ref(getDb(), `${base(roomId)}/boards/${gk}/${clientId}`), board);
}

export function joinDuel(roomId: string, clientId: string, player: DuelPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

const shiftTimes = (minutes: number) => {
  const startedAt = serverNow() + COUNTDOWN_MS;
  return { startedAt, endsAt: startedAt + minutes * 60_000 };
};

export function startDuel(roomId: string, minutes: number) {
  return mutate(roomId, (s) =>
    s.status === "waiting" ? { ...s, status: "playing", ...shiftTimes(minutes), final: {}, winner: "" } : null
  );
}

/** Another shift right away, with new orders. */
export function playAgain(roomId: string, expectedGame: number, minutes: number) {
  return mutate(roomId, (s) =>
    s.status !== "finished" || s.gameNo !== expectedGame
      ? null
      : { ...s, status: "playing", seed: makeSeed(), gameNo: s.gameNo + 1, ...shiftTimes(minutes), final: {}, winner: "" }
  );
}

/** Closes the shift once its time (and the grace) is over, with the scores this client sees. */
export function closeDuel(roomId: string, expectedGame: number, boards: Record<string, DuelBoard>) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.gameNo !== expectedGame || serverNow() < s.endsAt + CLOSE_GRACE_MS) return null;
    const final = Object.fromEntries(Object.entries(boards).map(([id, b]) => [id, b.score]));
    const top = Math.max(0, ...Object.values(final));
    const leaders = Object.keys(final).filter((id) => final[id] === top);
    const winner = top > 0 && leaders.length === 1 ? leaders[0] : "";
    return {
      ...s,
      status: "finished",
      final,
      winner,
      wins: winner ? { ...s.wins, [winner]: (s.wins[winner] ?? 0) + 1 } : s.wins,
    };
  });
}
