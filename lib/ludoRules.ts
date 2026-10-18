/**
 * Board geometry and move rules for Parchís and classic Ludo, pure (no
 * Firebase). Seats `a` red (top-left), `b` green (top-right), `c` yellow
 * (bottom-right), `d` blue (bottom-left); tokens go clockwise.
 *
 * A token's position is its progress from its seat's exit square: -1 in the
 * base, 0…`lastTrack` on the shared track, then its own lane and `goal`.
 *
 * - Ludo (15×15): 52 squares, out with a 6, landing on rivals outside the
 *   stars sends them home, no blocking.
 * - Parchís (19×19, Spanish rules with one die): 68 squares, 12 safe squares
 *   (exits included), a 7-square lane. Out with a 5 (mandatory if possible);
 *   a 6 rolls again and counts 7 once no token is in the base; at most two
 *   tokens per square, and two of the same color are a barrier nobody passes
 *   (with a 6 you must open yours). Landing alone on a rival outside a safe
 *   square eats it and you count 20 with any token; reaching the goal counts
 *   10. On your exit square with two tokens, coming out eats a rival there.
 */

export type Seat = "a" | "b" | "c" | "d";
export const SEATS: Seat[] = ["a", "b", "c", "d"];
export type LudoRules = "parchis" | "ludo";

export const TOKENS = 4;

export interface RulesInfo {
  /** Squares on the shared track. */
  track: number;
  /** Progress of the last shared square before the lane. */
  lastTrack: number;
  goal: number;
  /** Roll that brings a token out. */
  exitRoll: number;
  /** Track square of each seat's exit. */
  starts: Record<Seat, number>;
  safe: Set<number>;
}

export const RULES: Record<LudoRules, RulesInfo> = {
  ludo: {
    track: 52,
    lastTrack: 50,
    goal: 56,
    exitRoll: 6,
    starts: { a: 0, b: 13, c: 26, d: 39 },
    safe: new Set([0, 8, 13, 21, 26, 34, 39, 47]),
  },
  parchis: {
    track: 68,
    lastTrack: 63,
    goal: 71,
    exitRoll: 5,
    starts: { a: 0, b: 17, c: 34, d: 51 },
    // Per quarter: the exit, a square in the middle and the next lane's entry.
    safe: new Set([0, 1, 2, 3].flatMap((q) => [0, 7, 12].map((o) => q * 17 + o))),
  },
};

/** Bonus counts in Parchís. */
export const EAT_BONUS = 20;
export const GOAL_BONUS = 10;

// ---- Geometry --------------------------------------------------------------

export type Cell = [number, number];

export interface BoardGeometry {
  size: number;
  /** Track squares (row, col), from red's exit. */
  track: Cell[];
  /** Each seat's lane squares, from the track to the center (goal excluded). */
  lanes: Record<Seat, Cell[]>;
  /** Top-left of each base quadrant and its side. */
  bases: Record<Seat, Cell>;
  baseSize: number;
  /** Top-left of the central goal and its side. */
  center: Cell;
  centerSize: number;
}

/** Quarter turn clockwise of a cell in an n×n grid. */
const rotCell = ([r, c]: Cell, n: number): Cell => [c, n - 1 - r];
/** Quarter turn clockwise of a point (cell units) in an n×n grid. */
const rotPoint = ([y, x]: Cell, n: number): Cell => [x, n - y];

function rotate<T extends Cell>(p: T, times: number, f: (p: Cell) => Cell): Cell {
  let out: Cell = p;
  for (let i = 0; i < times; i++) out = f(out);
  return out;
}

const LUDO_TRACK: Cell[] = [
  ...[1, 2, 3, 4, 5].map((c) => [6, c] as Cell),
  ...[5, 4, 3, 2, 1, 0].map((r) => [r, 6] as Cell),
  [0, 7],
  [0, 8],
  ...[1, 2, 3, 4, 5].map((r) => [r, 8] as Cell),
  ...[9, 10, 11, 12, 13, 14].map((c) => [6, c] as Cell),
  [7, 14],
  [8, 14],
  ...[13, 12, 11, 10, 9].map((c) => [8, c] as Cell),
  ...[9, 10, 11, 12, 13, 14].map((r) => [r, 8] as Cell),
  [14, 7],
  [14, 6],
  ...[13, 12, 11, 10, 9].map((r) => [r, 6] as Cell),
  ...[5, 4, 3, 2, 1, 0].map((c) => [8, c] as Cell),
  [7, 0],
  [6, 0],
];

/** Ludo's lanes; the sixth square of each is its goal. */
const LUDO_HOME: Record<Seat, Cell[]> = {
  a: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  b: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  c: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  d: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
};

const P = 19;
/** One quarter of the Parchís track: red's exit up to green's. */
const PARCHIS_QUARTER: Cell[] = [
  [8, 4], [8, 5], [8, 6], [8, 7],
  [7, 8], [6, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 9],
  [0, 10], [1, 10], [2, 10], [3, 10],
];
/** Green's lane, entered from the top middle square. */
const GREEN_LANE: Cell[] = [1, 2, 3, 4, 5, 6, 7].map((r) => [r, 9] as Cell);
/** Turns from green's side to each seat's. */
const TURNS: Record<Seat, number> = { a: 3, b: 0, c: 1, d: 2 };

export const GEOMETRY: Record<LudoRules, BoardGeometry> = {
  ludo: {
    size: 15,
    track: LUDO_TRACK,
    lanes: {
      a: LUDO_HOME.a.slice(0, 5),
      b: LUDO_HOME.b.slice(0, 5),
      c: LUDO_HOME.c.slice(0, 5),
      d: LUDO_HOME.d.slice(0, 5),
    },
    bases: { a: [0, 0], b: [0, 9], c: [9, 9], d: [9, 0] },
    baseSize: 6,
    center: [6, 6],
    centerSize: 3,
  },
  parchis: {
    size: P,
    track: [0, 1, 2, 3].flatMap((q) => PARCHIS_QUARTER.map((cell) => rotate(cell, q, (x) => rotCell(x, P)))),
    lanes: {
      a: GREEN_LANE.map((cell) => rotate(cell, TURNS.a, (x) => rotCell(x, P))),
      b: GREEN_LANE,
      c: GREEN_LANE.map((cell) => rotate(cell, TURNS.c, (x) => rotCell(x, P))),
      d: GREEN_LANE.map((cell) => rotate(cell, TURNS.d, (x) => rotCell(x, P))),
    },
    bases: { a: [0, 0], b: [0, 11], c: [11, 11], d: [11, 0] },
    baseSize: 8,
    center: [8, 8],
    centerSize: 3,
  },
};

/** Where green's tokens rest in the goal (centers, cell units); rotated for the rest. */
const GREEN_GOAL: Cell[] = [
  [8.42, 8.85],
  [8.42, 9.5],
  [8.42, 10.15],
  [8.98, 9.5],
];

/** Track square (index into `track`) of a token, or -1 off the track. */
export function trackIndex(rules: LudoRules, seat: Seat, progress: number): number {
  const r = RULES[rules];
  if (progress < 0 || progress > r.lastTrack) return -1;
  return (r.starts[seat] + progress) % r.track;
}

/** Center (row, col in cell units) where a token is drawn. */
export function tokenCenter(rules: LudoRules, seat: Seat, progress: number, token: number): Cell {
  const g = GEOMETRY[rules];
  const r = RULES[rules];
  if (progress < 0) {
    const [r0, c0] = g.bases[seat];
    const gap = g.baseSize / 3;
    const off = g.baseSize / 2 - gap / 2;
    return [r0 + off + (token >> 1) * gap, c0 + off + (token & 1) * gap];
  }
  if (progress <= r.lastTrack) {
    const [row, col] = g.track[trackIndex(rules, seat, progress)];
    return [row + 0.5, col + 0.5];
  }
  if (progress < r.goal) {
    const [row, col] = g.lanes[seat][progress - r.lastTrack - 1];
    return [row + 0.5, col + 0.5];
  }
  if (rules === "ludo") {
    const [row, col] = LUDO_HOME[seat][5];
    return [row + 0.5, col + 0.5];
  }
  return rotate(GREEN_GOAL[token], TURNS[seat], (x) => rotPoint(x, P));
}

// ---- Moves -----------------------------------------------------------------

export type Board = Record<Seat, number[]>;

export interface LudoMove {
  token: number;
  from: number;
  to: number;
  /** Rival tokens sent back to their base. */
  captures: { seat: Seat; token: number }[];
}

/** Tokens on a track square, across the seats in play. */
function onSquare(rules: LudoRules, board: Board, active: Seat[], square: number) {
  const out: { seat: Seat; token: number }[] = [];
  for (const seat of active) {
    board[seat].forEach((p, token) => {
      if (trackIndex(rules, seat, p) === square) out.push({ seat, token });
    });
  }
  return out;
}

function ludoMove(board: Board, active: Seat[], seat: Seat, token: number, steps: number): LudoMove | null {
  const r = RULES.ludo;
  const from = board[seat][token];
  let to: number;
  if (from < 0) {
    if (steps !== r.exitRoll) return null;
    to = 0;
  } else {
    if (from >= r.goal || from + steps > r.goal) return null;
    to = from + steps;
  }
  const square = trackIndex("ludo", seat, to);
  const captures =
    square >= 0 && !r.safe.has(square)
      ? onSquare("ludo", board, active, square).filter((t) => t.seat !== seat)
      : [];
  return { token, from, to, captures };
}

function parchisMove(board: Board, active: Seat[], seat: Seat, token: number, steps: number, bonus: boolean): LudoMove | null {
  const r = RULES.parchis;
  const from = board[seat][token];
  if (from < 0) {
    if (bonus || steps !== r.exitRoll) return null;
    const here = onSquare("parchis", board, active, r.starts[seat]);
    if (here.length < 2) return { token, from, to: 0, captures: [] };
    const rivals = here.filter((t) => t.seat !== seat);
    if (rivals.length === 0) return null;
    return { token, from, to: 0, captures: [rivals[rivals.length - 1]] };
  }
  const to = from + steps;
  if (from >= r.goal || to > r.goal) return null;

  const occupants = (k: number) => {
    if (k <= r.lastTrack) return onSquare("parchis", board, active, trackIndex("parchis", seat, k));
    return board[seat].flatMap((p, i) => (p === k ? [{ seat, token: i }] : []));
  };
  for (let k = from + 1; k < to; k++) {
    const here = occupants(k);
    if (here.length >= 2 && here[0].seat === here[1].seat) return null; // barrier
  }
  if (to === r.goal) return { token, from, to, captures: [] };
  const here = occupants(to);
  if (here.length >= 2) return null;
  const square = trackIndex("parchis", seat, to);
  const eats = here.length === 1 && here[0].seat !== seat && square >= 0 && !r.safe.has(square);
  return { token, from, to, captures: eats ? here : [] };
}

/**
 * The moves `seat` can make counting `steps` (`bonus`: the 20/10 of Parchís,
 * which can't bring tokens out and isn't bound by the mandatory moves).
 */
export function legalMoves(
  rules: LudoRules,
  board: Board,
  active: Seat[],
  seat: Seat,
  steps: number,
  bonus = false
): LudoMove[] {
  const all = board[seat]
    .map((_, token) =>
      rules === "ludo" ? ludoMove(board, active, seat, token, steps) : parchisMove(board, active, seat, token, steps, bonus)
    )
    .filter((m): m is LudoMove => m !== null);
  if (rules === "ludo" || bonus) return all;

  const r = RULES.parchis;
  // With a 5, coming out is mandatory.
  if (steps === r.exitRoll) {
    const exits = all.filter((m) => m.from < 0);
    if (exits.length) return exits;
  }
  // With a 6 (or 7), your barriers must open.
  if (steps === 6 || steps === 7) {
    const mine = board[seat];
    const inBarrier = (i: number) =>
      mine[i] >= 0 && mine[i] <= r.lastTrack && mine.some((p, j) => j !== i && p === mine[i]);
    const opening = all.filter((m) => inBarrier(m.token));
    if (opening.length) return opening;
  }
  return all;
}

/** The board after a move. */
export function applyMove(board: Board, seat: Seat, move: LudoMove): Board {
  const next = { ...board, [seat]: [...board[seat]] };
  next[seat][move.token] = move.to;
  for (const c of move.captures) {
    next[c.seat] = [...next[c.seat]];
    next[c.seat][c.token] = -1;
  }
  return next;
}

/** How far a roll counts: in Parchís a 6 is 7 once no token is in the base. */
export function stepsFor(rules: LudoRules, die: number, mine: number[]): number {
  return rules === "parchis" && die === 6 && mine.every((p) => p >= 0) ? 7 : die;
}
