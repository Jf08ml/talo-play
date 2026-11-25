import { SIZE, type Seat } from "./otelo";
import { deepen, pickBest, randomOf, type BotLevel } from "./boardBot";

/**
 * Otelo's computer rival: negamax with alpha-beta over a numeric board.
 * Fácil is greedy (the move that flips the most, now and then at random);
 * normal and difícil weigh squares (corners good, the squares next to them
 * bad) and mobility; difícil also plays the last empties perfectly.
 */

const LEVELS: Record<BotLevel, { depth: number; ms: number; blunder: number; exact: number }> = {
  facil: { depth: 1, ms: 0, blunder: 0.25, exact: 0 },
  normal: { depth: 2, ms: 300, blunder: 0.1, exact: 0 },
  dificil: { depth: 9, ms: 800, blunder: 0, exact: 10 },
};

// prettier-ignore
const WEIGHTS = [
  100, -20, 10,  5,  5, 10, -20, 100,
  -20, -50, -2, -2, -2, -2, -50, -20,
   10,  -2,  1,  1,  1,  1,  -2,  10,
    5,  -2,  1,  0,  0,  1,  -2,   5,
    5,  -2,  1,  0,  0,  1,  -2,   5,
   10,  -2,  1,  1,  1,  1,  -2,  10,
  -20, -50, -2, -2, -2, -2, -50, -20,
  100, -20, 10,  5,  5, 10, -20, 100,
];
const N = SIZE * SIZE;
const DIRS = [-9, -8, -7, -1, 1, 7, 8, 9];

/** Board: 1 / -1 the discs (1 = the side to move at the root), 0 empty. */
type Board = Int8Array;

function flips(b: Board, me: number, idx: number): number[] {
  if (b[idx] !== 0) return [];
  const out: number[] = [];
  const c0 = idx % SIZE;
  for (const d of DIRS) {
    const dc = d === -9 || d === -1 || d === 7 ? -1 : d === -7 || d === 1 || d === 9 ? 1 : 0;
    const line: number[] = [];
    let i = idx + d;
    let c = c0 + dc;
    while (i >= 0 && i < N && c >= 0 && c < SIZE && b[i] === -me) {
      line.push(i);
      i += d;
      c += dc;
    }
    if (line.length && i >= 0 && i < N && c >= 0 && c < SIZE && b[i] === me) out.push(...line);
  }
  return out;
}

function moves(b: Board, me: number): { idx: number; flips: number[] }[] {
  const out: { idx: number; flips: number[] }[] = [];
  for (let i = 0; i < N; i++) {
    if (b[i] !== 0) continue;
    const f = flips(b, me, i);
    if (f.length) out.push({ idx: i, flips: f });
  }
  return out;
}

function evaluate(b: Board, me: number): number {
  let s = 0;
  for (let i = 0; i < N; i++) s += b[i] * WEIGHTS[i];
  return me * s + 5 * (moves(b, me).length - moves(b, -me).length);
}

function discDiff(b: Board, me: number): number {
  let s = 0;
  for (let i = 0; i < N; i++) s += b[i];
  return me * s;
}

const END = 10_000;

function negamax(b: Board, me: number, depth: number, alpha: number, beta: number, exact: boolean, passed: boolean, tick: () => void): number {
  tick();
  const list = moves(b, me);
  if (!list.length) {
    if (passed) {
      const d = discDiff(b, me);
      return d > 0 ? END + d : d < 0 ? -END + d : 0;
    }
    return -negamax(b, -me, depth, -beta, -alpha, exact, true, tick);
  }
  if (depth === 0 && !exact) return evaluate(b, me);
  let best = -Infinity;
  for (const m of list) {
    b[m.idx] = me;
    for (const f of m.flips) b[f] = me;
    const v = -negamax(b, -me, depth - 1, -beta, -alpha, exact, false, tick);
    b[m.idx] = 0;
    for (const f of m.flips) b[f] = -me;
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** The square the bot plays as `side` on `cells` (the game's 64-char board); -1 if it has none. */
export function oteloBotMove(cells: string, side: Seat, level: BotLevel): number {
  const b: Board = Int8Array.from(cells, (ch) => (ch === side ? 1 : ch === "." ? 0 : -1));
  const list = moves(b, 1);
  if (!list.length) return -1;
  const { depth, ms, blunder, exact } = LEVELS[level];
  if (Math.random() < blunder) return randomOf(list).idx;
  if (level === "facil") return pickBest(list.map((m) => ({ move: m.idx, score: m.flips.length })));
  const empties = b.filter((v) => v === 0).length;
  const solve = empties <= exact;
  const scoreAll = (d: number, tick: () => void) => {
    // Worse moves only need a bound (below the best so far), not their exact score.
    let best = -Infinity;
    return list.map((m) => {
      b[m.idx] = 1;
      for (const f of m.flips) b[f] = 1;
      try {
        const score = -negamax(b, -1, d - 1, -Infinity, -(best - 1), solve, false, tick);
        if (score > best) best = score;
        return { move: m.idx, score };
      } finally {
        b[m.idx] = 0;
        for (const f of m.flips) b[f] = -1;
      }
    });
  };
  // The last empties are solved to the end (the depth doesn't matter there).
  return pickBest(solve ? scoreAll(1, () => {}) : deepen(depth, ms, scoreAll));
}
