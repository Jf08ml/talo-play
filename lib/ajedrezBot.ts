import { applyMove, legalMoves, type ChessMove, type Color, type Position } from "./ajedrezRules";
import { deepen, pickBest, randomOf, type BotLevel } from "./boardBot";

/**
 * Ajedrez' computer rival. The root moves come from the game's full rules
 * (`legalMoves`, so castling, en passant and promotions are right); below the
 * root it searches on its own numeric board — alpha-beta, captures first
 * (most valuable victim), a capture-only search at the horizon, material +
 * piece-square tables — ignoring castling and en passant there, which is fine
 * for a few moves ahead. Deeper while time lasts; lower levels add noise.
 */

const LEVELS: Record<BotLevel, { depth: number; ms: number; noise: number; quiet: boolean; blunder: number }> = {
  facil: { depth: 1, ms: 200, noise: 120, quiet: false, blunder: 0.15 },
  normal: { depth: 3, ms: 600, noise: 25, quiet: true, blunder: 0 },
  dificil: { depth: 7, ms: 1200, noise: 0, quiet: true, blunder: 0 },
};

// Pieces: 1 pawn, 2 knight, 3 bishop, 4 rook, 5 queen, 6 king; + white, − black.
const KIND: Record<string, number> = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
const VALUE = [0, 100, 320, 330, 500, 900, 0];
const MATE = 100_000;

// Piece-square tables from white's side, index 0 = a8 (like the game's board).
// prettier-ignore
const PST: number[][] = [
  [],
  [ 0, 0, 0, 0, 0, 0, 0, 0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5, 5,10,25,25,10, 5, 5,
    0, 0, 0,20,20, 0, 0, 0, 5,-5,-10,0, 0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0, 0, 0, 0, 0, 0, 0, 0],
  [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,
   -30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  [-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,
   -10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  [0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,
   -5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0],
  [-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,
   0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
  [-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20],
];
// prettier-ignore
const KING_END = [-50,-40,-30,-20,-20,-30,-40,-50,-30,-20,-10,0,0,-10,-20,-30,-30,-10,20,30,30,20,-10,-30,-30,-10,30,40,40,30,-10,-30,
  -30,-10,30,40,40,30,-10,-30,-30,-10,20,30,30,20,-10,-30,-30,-30,0,0,0,0,-30,-30,-50,-30,-30,-30,-30,-30,-30,-50];

const mirror = (i: number) => ((7 - (i >> 3)) << 3) | (i & 7);

// Targets per square, precomputed.
const jumps = (deltas: number[][]) =>
  Array.from({ length: 64 }, (_, i) =>
    deltas
      .map(([dr, dc]) => [(i >> 3) + dr, (i & 7) + dc])
      .filter(([r, c]) => r >= 0 && r < 8 && c >= 0 && c < 8)
      .map(([r, c]) => r * 8 + c)
  );
const KNIGHT = jumps([[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]);
const KING = jumps([[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]);
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const rays = (dirs: number[][]) =>
  Array.from({ length: 64 }, (_, i) =>
    dirs.map(([dr, dc]) => {
      const out: number[] = [];
      for (let r = (i >> 3) + dr, c = (i & 7) + dc; r >= 0 && r < 8 && c >= 0 && c < 8; r += dr, c += dc) out.push(r * 8 + c);
      return out;
    })
  );
const ROOK_RAYS = rays(ORTHO);
const BISHOP_RAYS = rays(DIAG);

interface Board {
  sq: Int8Array;
  king: [number, number]; // [white, black]
}

function toBoard(cells: string): Board {
  const sq = new Int8Array(64);
  const king: [number, number] = [-1, -1];
  for (let i = 0; i < 64; i++) {
    const ch = cells[i];
    if (ch === ".") continue;
    const k = KIND[ch.toLowerCase()];
    const white = ch !== ch.toLowerCase();
    sq[i] = white ? k : -k;
    if (k === 6) king[white ? 0 : 1] = i;
  }
  return { sq, king };
}

/** Is `s` attacked by `by` (1 white, −1 black)? */
function attacked(b: Board, s: number, by: number): boolean {
  const q = b.sq;
  for (const t of KNIGHT[s]) if (q[t] === 2 * by) return true;
  for (const t of KING[s]) if (q[t] === 6 * by) return true;
  // A white pawn attacks upward (toward row 0), so it sits one row below.
  const pr = (s >> 3) + (by === 1 ? 1 : -1);
  if (pr >= 0 && pr < 8) {
    const c = s & 7;
    if (c > 0 && q[pr * 8 + c - 1] === by) return true;
    if (c < 7 && q[pr * 8 + c + 1] === by) return true;
  }
  for (const ray of ROOK_RAYS[s])
    for (const t of ray) {
      if (!q[t]) continue;
      if (q[t] === 4 * by || q[t] === 5 * by) return true;
      break;
    }
  for (const ray of BISHOP_RAYS[s])
    for (const t of ray) {
      if (!q[t]) continue;
      if (q[t] === 3 * by || q[t] === 5 * by) return true;
      break;
    }
  return false;
}

/** Moves as from | to << 6, with an ordering score; pawns reaching the end become queens. */
function generate(b: Board, side: number, capturesOnly: boolean): { m: number; o: number }[] {
  const q = b.sq;
  const out: { m: number; o: number }[] = [];
  const add = (from: number, to: number, attacker: number) => {
    const victim = Math.abs(q[to]);
    if (capturesOnly && !victim) return;
    out.push({ m: from | (to << 6), o: victim ? VALUE[victim] * 10 - VALUE[attacker] : 0 });
  };
  for (let i = 0; i < 64; i++) {
    const p = q[i] * side;
    if (p <= 0) continue;
    if (p === 1) {
      const dir = side === 1 ? -8 : 8;
      const one = i + dir;
      const r = i >> 3;
      const last = side === 1 ? 1 : 6; // the row before promoting
      if (one >= 0 && one < 64 && !q[one]) {
        if (!capturesOnly || r === last) out.push({ m: i | (one << 6), o: r === last ? 800 : 0 });
        const two = i + 2 * dir;
        if (!capturesOnly && r === (side === 1 ? 6 : 1) && !q[two]) out.push({ m: i | (two << 6), o: 0 });
      }
      for (const dc of [-1, 1]) {
        const c = (i & 7) + dc;
        if (c < 0 || c > 7 || one < 0 || one >= 64) continue;
        const t = one + dc;
        if (q[t] * side < 0) add(i, t, 1);
      }
    } else if (p === 2 || p === 6) {
      for (const t of (p === 2 ? KNIGHT : KING)[i]) if (q[t] * side <= 0) add(i, t, p);
    } else {
      const sets = p === 4 ? ROOK_RAYS[i] : p === 3 ? BISHOP_RAYS[i] : [...ROOK_RAYS[i], ...BISHOP_RAYS[i]];
      for (const ray of sets)
        for (const t of ray) {
          if (q[t] * side > 0) break;
          add(i, t, p);
          if (q[t]) break;
        }
    }
  }
  return out.sort((x, y) => y.o - x.o);
}

/** Makes `m`; returns what to undo it with. */
function make(b: Board, m: number): number {
  const from = m & 63;
  const to = m >> 6;
  const piece = b.sq[from];
  const captured = b.sq[to];
  const r = to >> 3;
  b.sq[to] = Math.abs(piece) === 1 && (r === 0 || r === 7) ? 5 * Math.sign(piece) : piece;
  b.sq[from] = 0;
  if (piece === 6) b.king[0] = to;
  if (piece === -6) b.king[1] = to;
  return captured;
}

function unmake(b: Board, m: number, captured: number, piece: number) {
  const from = m & 63;
  const to = m >> 6;
  b.sq[from] = piece;
  b.sq[to] = captured;
  if (piece === 6) b.king[0] = from;
  if (piece === -6) b.king[1] = from;
}

/** Static value for `side`. */
function evaluate(b: Board, side: number): number {
  const q = b.sq;
  let heavy = 0;
  for (let i = 0; i < 64; i++) {
    const k = Math.abs(q[i]);
    if (k >= 2 && k <= 5) heavy += VALUE[k];
  }
  const endgame = heavy <= 1300;
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const p = q[i];
    if (!p) continue;
    const k = Math.abs(p);
    const at = p > 0 ? i : mirror(i);
    const table = k === 6 && endgame ? KING_END : PST[k];
    s += Math.sign(p) * (VALUE[k] + table[at]);
  }
  return s * side;
}

const kingOf = (b: Board, side: number) => b.king[side === 1 ? 0 : 1];

function quiesce(b: Board, side: number, alpha: number, beta: number, depth: number, tick: () => void): number {
  tick();
  const stand = evaluate(b, side);
  if (stand >= beta || depth <= 0) return stand;
  if (stand > alpha) alpha = stand;
  for (const { m } of generate(b, side, true)) {
    const piece = b.sq[m & 63];
    const cap = make(b, m);
    if (attacked(b, kingOf(b, side), -side)) {
      unmake(b, m, cap, piece);
      continue;
    }
    const v = -quiesce(b, -side, -beta, -alpha, depth - 1, tick);
    unmake(b, m, cap, piece);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function search(b: Board, side: number, depth: number, ply: number, alpha: number, beta: number, quiet: boolean, tick: () => void): number {
  if (depth <= 0) return quiet ? quiesce(b, side, alpha, beta, 6, tick) : evaluate(b, side);
  tick();
  let legal = 0;
  let best = -Infinity;
  for (const { m } of generate(b, side, false)) {
    const piece = b.sq[m & 63];
    const cap = make(b, m);
    if (attacked(b, kingOf(b, side), -side)) {
      unmake(b, m, cap, piece);
      continue;
    }
    legal++;
    const v = -search(b, -side, depth - 1, ply + 1, -beta, -alpha, quiet, tick);
    unmake(b, m, cap, piece);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  if (!legal) return attacked(b, kingOf(b, side), -side) ? -(MATE - ply) : 0;
  return best;
}

const sideOf = (c: Color) => (c === "w" ? 1 : -1);

/** The bot's move in `pos` (its color is `pos.turn`), or null if it has none. */
export function ajedrezBotMove(pos: Position, level: BotLevel): ChessMove | null {
  const list = legalMoves(pos);
  if (!list.length) return null;
  const { depth, ms, noise, quiet, blunder } = LEVELS[level];
  if (Math.random() < blunder) return randomOf(list);
  let children = list.map((m) => ({ m, b: toBoard(applyMove(pos, m).cells) }));
  const them = -sideOf(pos.turn);
  const scored = deepen(depth, ms, (d, tick) => {
    // Moves that can't come within the noise of the best only need a bound, not their exact score.
    let best = -Infinity;
    const out = children.map(({ m, b }) => {
      const floor = best - 2 * noise - 1;
      const score = -search(b, them, d - 1, 1, -Infinity, -floor, quiet, tick);
      if (score > best) best = score;
      return { move: m, b, score };
    });
    // The next, deeper pass looks at the best moves first, so it prunes more.
    children = [...out].sort((x, y) => y.score - x.score).map(({ move, b }) => ({ m: move, b }));
    return out.map(({ move, score }) => ({ move, score }));
  });
  return pickBest(scored.map((s) => ({ move: s.move, score: s.score + (noise ? Math.round((Math.random() - 0.5) * 2 * noise) : 0) })));
}

/** Whether the bot takes a draw offer: only when it isn't ahead. */
export function ajedrezBotAcceptsDraw(pos: Position, color: Color): boolean {
  return evaluate(toBoard(pos.cells), sideOf(color)) < 50;
}
