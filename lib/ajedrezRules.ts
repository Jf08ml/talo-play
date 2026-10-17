/**
 * Chess rules, pure. The board is a 64-character string, row-major from the
 * top (row 0 = rank 8, black's back row): "." empty, uppercase white
 * (PNBRQK), lowercase black. Moves use square indexes 0–63.
 *
 * Covers every rule but threefold repetition (players can agree a draw).
 */

export type Color = "w" | "b";
export type PromoPiece = "q" | "r" | "b" | "n";

export interface Position {
  cells: string;
  turn: Color;
  /** Castling rights still available: subset of "KQkq", "-" if none. */
  castling: string;
  /** En passant target square (the one a pawn just skipped), or -1. */
  ep: number;
  /** Half-moves since the last capture or pawn move (50-move rule at 100). */
  half: number;
}

export interface ChessMove {
  from: number;
  to: number;
  promo?: PromoPiece;
}

export const INITIAL: Position = {
  cells: "rnbqkbnr" + "pppppppp" + ".".repeat(32) + "PPPPPPPP" + "RNBQKBNR",
  turn: "w",
  castling: "KQkq",
  ep: -1,
  half: 0,
};

const EMPTY = ".";
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

export function colorOf(p: string): Color | null {
  if (p === EMPTY || !p) return null;
  return p === p.toUpperCase() ? "w" : "b";
}

export const other = (c: Color): Color => (c === "w" ? "b" : "w");
const rc = (i: number) => [i >> 3, i & 7];
const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

export function squareName(i: number): string {
  const [r, c] = rc(i);
  return "abcdefgh"[c] + (8 - r);
}

/** Is `sq` attacked by any piece of color `by`? */
export function attacked(cells: string, sq: number, by: Color): boolean {
  const [r, c] = rc(sq);
  const is = (rr: number, cc: number, pieces: string) => inside(rr, cc) && pieces.includes(cells[rr * 8 + cc]);
  const up = by === "w";
  const P = up ? "P" : "p";
  // A white pawn attacks upwards, so it sits one row below the square.
  const pr = up ? r + 1 : r - 1;
  if (is(pr, c - 1, P) || is(pr, c + 1, P)) return true;
  const N = up ? "N" : "n";
  if (KNIGHT.some(([dr, dc]) => is(r + dr, c + dc, N))) return true;
  const K = up ? "K" : "k";
  if (KING.some(([dr, dc]) => is(r + dr, c + dc, K))) return true;
  const slide = (dirs: number[][], pieces: string) =>
    dirs.some(([dr, dc]) => {
      let rr = r + dr;
      let cc = c + dc;
      while (inside(rr, cc)) {
        const p = cells[rr * 8 + cc];
        if (p !== EMPTY) return pieces.includes(p);
        rr += dr;
        cc += dc;
      }
      return false;
    });
  return slide(ORTHO, up ? "RQ" : "rq") || slide(DIAG, up ? "BQ" : "bq");
}

export function kingSquare(cells: string, color: Color): number {
  return cells.indexOf(color === "w" ? "K" : "k");
}

export function inCheck(pos: Pick<Position, "cells">, color: Color): boolean {
  const k = kingSquare(pos.cells, color);
  return k >= 0 && attacked(pos.cells, k, other(color));
}

function pseudoMoves(pos: Position): ChessMove[] {
  const { cells, turn } = pos;
  const out: ChessMove[] = [];
  const add = (from: number, to: number) => out.push({ from, to });
  for (let i = 0; i < 64; i++) {
    const p = cells[i];
    if (colorOf(p) !== turn) continue;
    const [r, c] = rc(i);
    const kind = p.toLowerCase();
    if (kind === "p") {
      const dir = turn === "w" ? -1 : 1;
      const startRow = turn === "w" ? 6 : 1;
      const lastRow = turn === "w" ? 0 : 7;
      const pushTo = (to: number) => {
        if ((to >> 3) === lastRow) for (const promo of ["q", "r", "b", "n"] as PromoPiece[]) out.push({ from: i, to, promo });
        else add(i, to);
      };
      const one = (r + dir) * 8 + c;
      if (inside(r + dir, c) && cells[one] === EMPTY) {
        pushTo(one);
        const two = (r + 2 * dir) * 8 + c;
        if (r === startRow && cells[two] === EMPTY) add(i, two);
      }
      for (const dc of [-1, 1]) {
        if (!inside(r + dir, c + dc)) continue;
        const to = (r + dir) * 8 + c + dc;
        if (colorOf(cells[to]) === other(turn) || to === pos.ep) pushTo(to);
      }
    } else if (kind === "n" || kind === "k") {
      for (const [dr, dc] of kind === "n" ? KNIGHT : KING) {
        if (!inside(r + dr, c + dc)) continue;
        const to = (r + dr) * 8 + c + dc;
        if (colorOf(cells[to]) !== turn) add(i, to);
      }
    } else {
      const dirs = kind === "r" ? ORTHO : kind === "b" ? DIAG : [...ORTHO, ...DIAG];
      for (const [dr, dc] of dirs) {
        let rr = r + dr;
        let cc = c + dc;
        while (inside(rr, cc)) {
          const to = rr * 8 + cc;
          const col = colorOf(cells[to]);
          if (col === turn) break;
          add(i, to);
          if (col) break;
          rr += dr;
          cc += dc;
        }
      }
    }
  }
  // Castling: king and rook unmoved (rights), squares between empty, king not
  // in check and not crossing or landing on an attacked square.
  const enemy = other(turn);
  const castle = (right: string, king: number, rook: number, empty: number[], safe: number[], to: number) => {
    if (!pos.castling.includes(right)) return;
    if (cells[king] !== (turn === "w" ? "K" : "k") || cells[rook] !== (turn === "w" ? "R" : "r")) return;
    if (empty.some((s) => cells[s] !== EMPTY)) return;
    if (safe.some((s) => attacked(cells, s, enemy))) return;
    add(king, to);
  };
  if (turn === "w") {
    castle("K", 60, 63, [61, 62], [60, 61, 62], 62);
    castle("Q", 60, 56, [57, 58, 59], [60, 59, 58], 58);
  } else {
    castle("k", 4, 7, [5, 6], [4, 5, 6], 6);
    castle("q", 4, 0, [1, 2, 3], [4, 3, 2], 2);
  }
  return out;
}

export function applyMove(pos: Position, m: ChessMove): Position {
  const cells = pos.cells.split("");
  const piece = cells[m.from];
  const kind = piece.toLowerCase();
  const captured = cells[m.to] !== EMPTY;
  cells[m.to] = piece;
  cells[m.from] = EMPTY;
  let enPassant = false;
  if (kind === "p" && m.to === pos.ep) {
    // The captured pawn sits behind the target square.
    cells[m.to + (pos.turn === "w" ? 8 : -8)] = EMPTY;
    enPassant = true;
  }
  if (kind === "p" && (m.to >> 3 === 0 || m.to >> 3 === 7)) {
    const promo = m.promo ?? "q";
    cells[m.to] = pos.turn === "w" ? promo.toUpperCase() : promo;
  }
  if (kind === "k" && Math.abs(m.to - m.from) === 2) {
    const rookFrom = m.to > m.from ? m.from + 3 : m.from - 4;
    const rookTo = m.to > m.from ? m.from + 1 : m.from - 1;
    cells[rookTo] = cells[rookFrom];
    cells[rookFrom] = EMPTY;
  }
  let castling = pos.castling === "-" ? "" : pos.castling;
  const drop = (rights: string) => (castling = castling.split("").filter((x) => !rights.includes(x)).join(""));
  if (piece === "K") drop("KQ");
  if (piece === "k") drop("kq");
  for (const sq of [m.from, m.to]) {
    if (sq === 63) drop("K");
    if (sq === 56) drop("Q");
    if (sq === 7) drop("k");
    if (sq === 0) drop("q");
  }
  const ep = kind === "p" && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1;
  return {
    cells: cells.join(""),
    turn: other(pos.turn),
    castling: castling || "-",
    ep,
    half: kind === "p" || captured || enPassant ? 0 : pos.half + 1,
  };
}

export function legalMoves(pos: Position): ChessMove[] {
  return pseudoMoves(pos).filter((m) => !inCheck(applyMove(pos, m), pos.turn));
}

export function sameMove(a: ChessMove, b: ChessMove): boolean {
  return a.from === b.from && a.to === b.to && (a.promo ?? "") === (b.promo ?? "");
}

/** Only kings, or a king and one minor piece against a lone king. */
export function insufficientMaterial(cells: string): boolean {
  const pieces = cells.split("").filter((p) => p !== EMPTY && p.toLowerCase() !== "k");
  if (pieces.length === 0) return true;
  return pieces.length === 1 && "nNbB".includes(pieces[0]);
}

export type Outcome = { result: "mate"; winner: Color } | { result: "ahogado" | "material" | "cincuenta" } | null;

/** Is the game over after this position? */
export function outcome(pos: Position): Outcome {
  if (legalMoves(pos).length === 0) return inCheck(pos, pos.turn) ? { result: "mate", winner: other(pos.turn) } : { result: "ahogado" };
  if (insufficientMaterial(pos.cells)) return { result: "material" };
  if (pos.half >= 100) return { result: "cincuenta" };
  return null;
}

/** Spanish piece letters for the notation: Rey, Dama, Torre, Alfil, Caballo. */
const SAN_LETTER: Record<string, string> = { k: "R", q: "D", r: "T", b: "A", n: "C" };

/** Algebraic notation of `m` in `pos`, with Spanish letters (Cf3, exd5, O-O, e8=D+). */
export function toSan(pos: Position, m: ChessMove): string {
  const piece = pos.cells[m.from];
  const kind = piece.toLowerCase();
  const after = applyMove(pos, m);
  const end = outcome(after);
  const suffix = end?.result === "mate" ? "#" : inCheck(after, after.turn) ? "+" : "";
  if (kind === "k" && Math.abs(m.to - m.from) === 2) return (m.to > m.from ? "O-O" : "O-O-O") + suffix;
  const capture = pos.cells[m.to] !== EMPTY || (kind === "p" && m.to === pos.ep);
  const dest = squareName(m.to);
  if (kind === "p") {
    const from = capture ? `${squareName(m.from)[0]}x` : "";
    const promo = m.promo || (m.to >> 3 === 0 || m.to >> 3 === 7) ? `=${SAN_LETTER[m.promo ?? "q"]}` : "";
    return from + dest + promo + suffix;
  }
  // Another piece of the same kind that could also go there: disambiguate.
  const rivals = legalMoves(pos).filter((o) => o.to === m.to && o.from !== m.from && pos.cells[o.from] === piece);
  let dis = "";
  if (rivals.length) {
    const [fr, fc] = rc(m.from);
    const sameFile = rivals.some((o) => (o.from & 7) === fc);
    const sameRank = rivals.some((o) => o.from >> 3 === fr);
    const name = squareName(m.from);
    dis = !sameFile ? name[0] : !sameRank ? name[1] : name;
  }
  return SAN_LETTER[kind] + dis + (capture ? "x" : "") + dest + suffix;
}
