import { SIZE, applyMove, isKing, legalMoves, ownerOf, type Move, type Seat } from "./damas";
import { deepen, pickBest, randomOf, type BotLevel } from "./boardBot";

/**
 * Damas' computer rival: minimax with alpha-beta on the game's own rules
 * (`legalMoves`/`applyMove`), so capture chains are steps where the same side
 * moves again. Material (kings count triple), men pushed forward and the
 * center; searched deeper while time lasts. It plays one step per call: in a
 * chain the room calls it again for the next jump.
 */

const LEVELS: Record<BotLevel, { depth: number; ms: number; blunder: number }> = {
  facil: { depth: 2, ms: 300, blunder: 0.3 },
  normal: { depth: 4, ms: 500, blunder: 0.05 },
  dificil: { depth: 10, ms: 900, blunder: 0 },
};

const WIN = 100_000;

/** Static value for `me`. */
export function damasEval(cells: string, me: Seat): number {
  let s = 0;
  for (let i = 0; i < cells.length; i++) {
    const side = ownerOf(cells[i]);
    if (!side) continue;
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    let v: number;
    if (isKing(cells[i])) v = 300;
    else {
      const advance = side === "a" ? SIZE - 1 - r : r;
      // Men on the back row guard against crowning; the rest want to move up.
      v = 100 + advance * 4 + (advance === 0 ? 6 : 0);
    }
    if (c >= 2 && c <= 5 && r >= 2 && r <= 5) v += 4;
    s += side === me ? v : -v;
  }
  return s;
}

interface Node {
  cells: string;
  turn: Seat;
  chain: number;
}

function search(n: Node, me: Seat, depth: number, ply: number, alpha: number, beta: number, tick: () => void): number {
  tick();
  const list = legalMoves(n.cells, n.turn, n.chain);
  if (!list.length) return n.turn === me ? -(WIN - ply) : WIN - ply;
  // At the horizon, forced captures still get played out (a few steps), so a trade isn't cut in half.
  if (depth <= 0 && n.chain < 0 && (list[0].captured < 0 || depth <= -4)) return damasEval(n.cells, me);
  const maximizing = n.turn === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const m of list) {
    const v = search(applyMove(n.cells, n.turn, m), me, depth - 1, ply + 1, alpha, beta, tick);
    if (maximizing) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best;
}

/** The step the bot plays as `turn` (with `chain` the piece that must keep jumping, or -1). */
export function damasBotMove(cells: string, turn: Seat, chain: number, level: BotLevel): Move | null {
  const list = legalMoves(cells, turn, chain);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const { depth, ms, blunder } = LEVELS[level];
  if (Math.random() < blunder) return randomOf(list);
  const scored = deepen(depth, ms, (d, tick) => {
    // Worse moves only need a bound (below the best so far), not their exact score.
    let best = -Infinity;
    return list.map((m) => {
      const score = search(applyMove(cells, turn, m), turn, d - 1, 1, best - 1, Infinity, tick);
      if (score > best) best = score;
      return { move: m, score };
    });
  });
  return pickBest(scored);
}

/** Whether the bot takes a draw offer: only when it isn't ahead. */
export function damasBotAcceptsDraw(cells: string, side: Seat): boolean {
  return damasEval(cells, side) < 60;
}
