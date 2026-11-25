import { SIZE, cellsOf, winLine, type Variant } from "./triqui";
import { pickBest, randomOf, type BotLevel } from "./boardBot";

/**
 * Triqui's computer rival: negamax over the moves string (the board is
 * derived from it, so `infinito` is handled for free). Clásico is searched to
 * the end on difícil (unbeatable); infinito never ends, so it's searched a
 * few moves deep. Lower levels see less and sometimes play at random.
 */

const LEVELS: Record<BotLevel, { depth: number; blunder: number }> = {
  facil: { depth: 2, blunder: 0.4 },
  normal: { depth: 4, blunder: 0.15 },
  dificil: { depth: 9, blunder: 0 },
};

const WIN = 100;

function freeSquares(cells: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < SIZE * SIZE; i++) if (cells[i] === ".") out.push(i);
  return out;
}

/** Value of `moves` for the side to move: + winning, − losing, faster is bigger. */
function search(moves: string, variant: Variant, depth: number, ply: number, memo: Map<string, number>): number {
  const cells = cellsOf(moves, variant);
  if (winLine(cells)) return -(WIN - ply);
  const free = freeSquares(cells);
  if (!free.length || depth === 0) return 0;
  // In infinito the order of each side's marks matters, so key by the last six moves.
  const key = `${variant === "infinito" ? moves.slice(-6) : cells}|${moves.length % 2}|${depth}`;
  const known = memo.get(key);
  if (known !== undefined) return known === 0 ? 0 : known > 0 ? known - ply : known + ply;
  let best = -Infinity;
  for (const i of free) best = Math.max(best, -search(moves + i, variant, depth - 1, ply + 1, memo));
  // Stored relative to this node (ply-independent), so transpositions at other plies reuse it.
  memo.set(key, best === 0 ? 0 : best > 0 ? best + ply : best - ply);
  return best;
}

export function triquiBotMove(moves: string, variant: Variant, level: BotLevel): number {
  const free = freeSquares(cellsOf(moves, variant));
  const { blunder } = LEVELS[level];
  // Infinito's tree never ends: seven moves ahead is plenty and stays quick on a phone.
  const depth = variant === "infinito" ? Math.min(LEVELS[level].depth, 7) : LEVELS[level].depth;
  if (Math.random() < blunder) return randomOf(free);
  const memo = new Map<string, number>();
  return pickBest(free.map((move) => ({ move, score: -search(moves + move, variant, depth - 1, 1, memo) })));
}
