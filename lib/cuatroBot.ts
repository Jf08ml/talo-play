import { COLS, ROWS, type Disc } from "./cuatro";
import { pickBest, randomOf, type BotLevel } from "./boardBot";

/**
 * 4 en línea's computer rival: negamax with alpha-beta, center columns first,
 * and a window count at the horizon (open threes and twos, the center column).
 * Lower levels look fewer moves ahead and sometimes drop a disc at random.
 */

const LEVELS: Record<BotLevel, { depth: number; blunder: number }> = {
  facil: { depth: 2, blunder: 0.3 },
  normal: { depth: 4, blunder: 0.08 },
  dificil: { depth: 7, blunder: 0 },
};

const WIN = 1_000_000;
const ORDER = [3, 2, 4, 1, 5, 0, 6];

/** Every run of four cells (row, column, both diagonals). */
const WINDOWS: number[][] = (() => {
  const out: number[][] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const er = r + dr * 3;
        const ec = c + dc * 3;
        if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
        out.push([0, 1, 2, 3].map((k) => (r + dr * k) * COLS + (c + dc * k)));
      }
  return out;
})();

/** Board as numbers: 0 empty, 1 / 2 the discs. */
type Board = number[];

function landing(b: Board, col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) if (b[r * COLS + col] === 0) return r * COLS + col;
  return -1;
}

/** Whether the disc just put at `idx` makes four. */
function wins(b: Board, idx: number): boolean {
  const p = b[idx];
  const r0 = Math.floor(idx / COLS);
  const c0 = idx % COLS;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let n = 1;
    for (const s of [1, -1]) {
      let r = r0 + dr * s;
      let c = c0 + dc * s;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && b[r * COLS + c] === p) {
        n++;
        r += dr * s;
        c += dc * s;
      }
    }
    if (n >= 4) return true;
  }
  return false;
}

/** Static value for `me`. */
function evaluate(b: Board, me: number): number {
  const them = 3 - me;
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    const v = b[r * COLS + 3];
    if (v === me) score += 3;
    else if (v === them) score -= 3;
  }
  for (const w of WINDOWS) {
    let mine = 0;
    let theirs = 0;
    for (const i of w) {
      if (b[i] === me) mine++;
      else if (b[i] === them) theirs++;
    }
    if (mine && theirs) continue;
    if (mine === 3) score += 8;
    else if (mine === 2) score += 2;
    else if (theirs === 3) score -= 9;
    else if (theirs === 2) score -= 2;
  }
  return score;
}

function negamax(b: Board, me: number, depth: number, ply: number, alpha: number, beta: number, filled: number): number {
  if (filled === ROWS * COLS) return 0;
  if (depth === 0) return evaluate(b, me);
  let best = -Infinity;
  for (const col of ORDER) {
    const idx = landing(b, col);
    if (idx < 0) continue;
    b[idx] = me;
    const v = wins(b, idx) ? WIN - ply : -negamax(b, 3 - me, depth - 1, ply + 1, -beta, -alpha, filled + 1);
    b[idx] = 0;
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** The column the bot drops its disc in, playing `disc` on `cells` (the game's 42-char board). */
export function cuatroBotMove(cells: string, disc: Disc, level: BotLevel): number {
  const b: Board = [...cells].map((ch) => (ch === "a" ? 1 : ch === "b" ? 2 : 0));
  const me = disc === "a" ? 1 : 2;
  const filled = b.filter(Boolean).length;
  const cols = ORDER.filter((c) => landing(b, c) >= 0);
  const { depth, blunder } = LEVELS[level];
  if (Math.random() < blunder) return randomOf(cols);
  return pickBest(
    cols.map((col) => {
      const idx = landing(b, col);
      b[idx] = me;
      const score = wins(b, idx) ? WIN : -negamax(b, 3 - me, depth - 1, 1, -Infinity, Infinity, filled + 1);
      b[idx] = 0;
      return { move: col, score };
    })
  );
}
