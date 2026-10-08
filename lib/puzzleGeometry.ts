/**
 * Deterministic jigsaw-piece geometry generator.
 *
 * Every client derives the exact same piece outlines from (rows, cols, seed),
 * so no piece geometry ever needs to travel over the network — only piece
 * positions do.
 */

import { mulberry32 } from "./random";

export type EdgeSign = -1 | 0 | 1; // -1 = socket (blank), 0 = flat (border), 1 = tab (bump)

export interface PieceEdges {
  top: EdgeSign;
  right: EdgeSign;
  bottom: EdgeSign;
  left: EdgeSign;
}

export interface PieceDef {
  id: string;
  row: number;
  col: number;
  /** Correct top-left position of this piece's cell within the assembled image, in px. */
  correctX: number;
  correctY: number;
  edges: PieceEdges;
}

export interface PuzzleLayout {
  rows: number;
  cols: number;
  cellW: number;
  cellH: number;
  /** Knob radius, in px. */
  knob: number;
  /** Max distance a tab can bulge outside the cell bounding box, in px (>= knob). */
  bleed: number;
  pieces: PieceDef[];
}


/**
 * Builds the shared edge grids: `horiz[r][c]` is the edge between piece
 * (r-1,c) and (r,c); `vert[r][c]` is the edge between (r,c-1) and (r,c).
 * Border edges are always flat (0); internal edges get a random tab/socket
 * that both neighboring pieces agree on.
 */
function generateEdgeGrids(rows: number, cols: number, seed: number) {
  const rand = mulberry32(seed);
  const horiz: EdgeSign[][] = Array.from({ length: rows + 1 }, () =>
    new Array(cols).fill(0)
  );
  const vert: EdgeSign[][] = Array.from({ length: rows }, () =>
    new Array(cols + 1).fill(0)
  );

  for (let r = 1; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      horiz[r][c] = rand() < 0.5 ? 1 : -1;
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 1; c < cols; c++) {
      vert[r][c] = rand() < 0.5 ? 1 : -1;
    }
  }
  return { horiz, vert };
}

export function generatePuzzleLayout(
  rows: number,
  cols: number,
  imageW: number,
  imageH: number,
  seed: number
): PuzzleLayout {
  const cellW = imageW / cols;
  const cellH = imageH / rows;
  const knob = Math.min(cellW, cellH) * 0.22;
  const bleed = Math.ceil(knob * 1.15);
  const { horiz, vert } = generateEdgeGrids(rows, cols, seed);

  const pieces: PieceDef[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const edges: PieceEdges = {
        top: r === 0 ? 0 : (-horiz[r][c] as EdgeSign),
        bottom: r === rows - 1 ? 0 : horiz[r + 1][c],
        left: c === 0 ? 0 : (-vert[r][c] as EdgeSign),
        right: c === cols - 1 ? 0 : vert[r][c + 1],
      };
      pieces.push({
        id: `${r}_${c}`,
        row: r,
        col: c,
        correctX: Math.round(c * cellW),
        correctY: Math.round(r * cellH),
        edges,
      });
    }
  }

  return { rows, cols, cellW, cellH, knob, bleed, pieces };
}

// ---- Path construction -----------------------------------------------
//
// Each edge is walked in a local (s, t) frame: s runs 0 -> len along the
// edge's direction of travel, t is the perpendicular offset (t > 0 always
// means "bulging away from the cell center"). `edgeToAbsolute()` below maps
// that local frame onto absolute cell coordinates for each of the 4 sides.

type Pt = [number, number];
type Cubic = [Pt, Pt, Pt]; // control1, control2, end

/**
 * Converts a circular arc into a sequence of cubic Beziers using the exact
 * tangent-based formula (kappa = 4/3 * tan(delta/4) per segment, valid for
 * any sweep direction/size), segments capped at 45° for smoothness.
 */
function arcToBeziers(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): Cubic[] {
  const totalSweep = endAngle - startAngle;
  const segments = Math.max(1, Math.ceil(Math.abs(totalSweep) / (Math.PI / 4)));
  const delta = totalSweep / segments;
  const kappa = (4 / 3) * Math.tan(delta / 4);

  const curves: Cubic[] = [];
  for (let i = 0; i < segments; i++) {
    const a1 = startAngle + i * delta;
    const a2 = a1 + delta;
    const p0: Pt = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    const p3: Pt = [cx + r * Math.cos(a2), cy + r * Math.sin(a2)];
    const t0: Pt = [-Math.sin(a1), Math.cos(a1)];
    const t1: Pt = [-Math.sin(a2), Math.cos(a2)];
    const c1: Pt = [p0[0] + kappa * r * t0[0], p0[1] + kappa * r * t0[1]];
    const c2: Pt = [p3[0] - kappa * r * t1[0], p3[1] - kappa * r * t1[1]];
    curves.push([c1, c2, p3]);
  }
  return curves;
}

/**
 * Local-frame (s,t) segments for one edge of length `len`: flat line to the
 * base of the knob, a clean semicircular bump/dent of radius `r`, flat line
 * to the end. `sign` 0 keeps the whole edge a straight flat line (used at
 * the puzzle's outer border).
 */
function knobSegments(
  len: number,
  r: number,
  sign: EdgeSign
): { line?: Pt; curves?: Cubic[] }[] {
  if (sign === 0) {
    return [{ line: [len, 0] }];
  }

  const cx = len / 2;
  const neckStart: Pt = [cx - r, 0];

  // Sweep through the far side of the circle from the baseline so the arc
  // bulges toward +t (sign > 0) or -t (sign < 0), meeting the baseline
  // tangentially at both ends.
  const curves =
    sign > 0
      ? arcToBeziers(cx, 0, r, Math.PI, 0)
      : arcToBeziers(cx, 0, r, Math.PI, 2 * Math.PI);

  return [{ line: neckStart }, { curves }, { line: [len, 0] }];
}

/** Maps a local (s,t) edge-frame point to absolute cell coordinates for each side. */
function edgeToAbsolute(side: "top" | "right" | "bottom" | "left", w: number, h: number) {
  switch (side) {
    case "top":
      // (0,0) -> (w,0), bulge toward -y (outside the cell, upward)
      return ([s, t]: Pt): Pt => [s, -t];
    case "right":
      // (w,0) -> (w,h), bulge toward +x (outside the cell, rightward)
      return ([s, t]: Pt): Pt => [w + t, s];
    case "bottom":
      // (w,h) -> (0,h), bulge toward +y (outside the cell, downward)
      return ([s, t]: Pt): Pt => [w - s, h + t];
    case "left":
      // (0,h) -> (0,0), bulge toward -x (outside the cell, leftward)
      return ([s, t]: Pt): Pt => [-t, h - s];
  }
}

/**
 * Returns a full SVG-style path `d` string for a piece's outline in local
 * cell coordinates, where (0,0) is the cell's top-left corner. Tabs/sockets
 * may extend outside [0,w]x[0,h] by up to `knob`.
 */
export function buildPiecePath(
  w: number,
  h: number,
  knob: number,
  edges: PieceEdges
): string {
  const cmds: string[] = ["M 0 0"];
  const sides: Array<["top" | "right" | "bottom" | "left", number, EdgeSign]> = [
    ["top", w, edges.top],
    ["right", h, edges.right],
    ["bottom", w, edges.bottom],
    ["left", h, edges.left],
  ];

  for (const [side, len, sign] of sides) {
    const toAbs = edgeToAbsolute(side, w, h);
    for (const seg of knobSegments(len, knob, sign)) {
      if (seg.line) {
        const [x, y] = toAbs(seg.line);
        cmds.push(`L ${x} ${y}`);
      } else if (seg.curves) {
        for (const [c1, c2, end] of seg.curves) {
          const [x1, y1] = toAbs(c1);
          const [x2, y2] = toAbs(c2);
          const [ex, ey] = toAbs(end);
          cmds.push(`C ${x1} ${y1} ${x2} ${y2} ${ex} ${ey}`);
        }
      }
    }
  }

  cmds.push("Z");
  return cmds.join(" ");
}
