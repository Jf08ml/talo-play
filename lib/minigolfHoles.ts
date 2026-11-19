import { mulberry32 } from "./random";
import { BALL_R, CUP_R, type Bumper, type Hole, type Mill, type Seg, type Vec, type Zone } from "./minigolfSim";

/**
 * Minigolf's holes, generated from a seed (nothing hand-made, so there's
 * nothing to memorize). A random walk over a 4×6 grid of 5-unit cells lays
 * the fairway — lanes joined edge to edge, some cells opened up as wider
 * rooms — rasterized at `RES`; its outline becomes the walls. Then, by
 * difficulty, it gets dressed: banks across the outer corner of turns,
 * slopes, sand, water (always leaving a way around), bumpers, blocks and
 * turning mills. A Dijkstra from the cup gives the distance field the bots
 * aim with and checks the tee can reach the cup; the par comes from it.
 *
 * Deterministic: changing anything here changes every room's and day's
 * holes. Draw with `rand()` in the same order, and don't sort with random
 * comparators.
 */

export type Difficulty = "facil" | "media" | "dificil";

export const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: "facil", label: "Fácil" },
  { id: "media", label: "Media" },
  { id: "dificil", label: "Difícil" },
];

const GW = 4;
const GH = 6;
const C = 5;
const RES = 0.5;
const COLS = (GW * C) / RES;
const ROWS = (GH * C) / RES;

type Cell = [number, number];

const DIRS: Cell[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

interface Plan {
  path: Cell[];
  /** Inset of each path cell (smaller = wider room). */
  inset: number[];
}

const PARAMS: Record<Difficulty, { len: [number, number]; features: [number, number]; lane: number; mills: boolean; water: boolean }> = {
  facil: { len: [3, 4], features: [1, 2], lane: 1.0, mills: false, water: false },
  media: { len: [4, 6], features: [2, 4], lane: 1.05, mills: true, water: true },
  dificil: { len: [6, 9], features: [4, 6], lane: 1.25, mills: true, water: true },
};

const pick = (rand: () => number, lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

function walk(rand: () => number, len: number): Cell[] | null {
  for (let attempt = 0; attempt < 200; attempt++) {
    const path: Cell[] = [[Math.floor(rand() * GW), GH - 1 - Math.floor(rand() * 2)]];
    const seen = new Set([`${path[0][0]},${path[0][1]}`]);
    let dir = 0;
    while (path.length < len) {
      const [x, y] = path[path.length - 1];
      const free = DIRS.map((d, i) => ({ i, x: x + d[0], y: y + d[1] })).filter(
        (n) => n.x >= 0 && n.y >= 0 && n.x < GW && n.y < GH && !seen.has(`${n.x},${n.y}`)
      );
      if (!free.length) break;
      // Prefer going on straight, then up, sideways, rarely back down.
      const weight = (i: number) => (i === dir ? 4 : i === 0 ? 3 : i === 2 ? 0.6 : 2);
      const total = free.reduce((s, n) => s + weight(n.i), 0);
      let roll = rand() * total;
      let next = free[free.length - 1];
      for (const n of free) {
        roll -= weight(n.i);
        if (roll <= 0) {
          next = n;
          break;
        }
      }
      dir = next.i;
      path.push([next.x, next.y]);
      seen.add(`${next.x},${next.y}`);
    }
    if (path.length === len) return path;
  }
  return null;
}

/** A cell's inner rectangle [x, y, w, h]. */
function inner(c: Cell, inset: number): [number, number, number, number] {
  return [c[0] * C + inset, c[1] * C + inset, C - 2 * inset, C - 2 * inset];
}

function fillRect(grid: Uint8Array, x: number, y: number, w: number, h: number, v: number) {
  const c0 = Math.max(0, Math.round(x / RES));
  const c1 = Math.min(COLS, Math.round((x + w) / RES));
  const r0 = Math.max(0, Math.round(y / RES));
  const r1 = Math.min(ROWS, Math.round((y + h) / RES));
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) grid[r * COLS + c] = v;
}

/** The outline of the green as merged wall segments. */
function outline(floor: Uint8Array): Seg[] {
  const at = (c: number, r: number) => (c >= 0 && r >= 0 && c < COLS && r < ROWS ? floor[r * COLS + c] : 0);
  const walls: Seg[] = [];
  // Horizontal edges: between row r-1 and r.
  for (let r = 0; r <= ROWS; r++) {
    for (const side of [0, 1]) {
      let start = -1;
      for (let c = 0; c <= COLS; c++) {
        const edge = c < COLS && (side === 0 ? at(c, r) === 1 && at(c, r - 1) === 0 : at(c, r - 1) === 1 && at(c, r) === 0);
        if (edge && start < 0) start = c;
        if (!edge && start >= 0) {
          walls.push({ ax: start * RES, ay: r * RES, bx: c * RES, by: r * RES });
          start = -1;
        }
      }
    }
  }
  for (let c = 0; c <= COLS; c++) {
    for (const side of [0, 1]) {
      let start = -1;
      for (let r = 0; r <= ROWS; r++) {
        const edge = r < ROWS && (side === 0 ? at(c, r) === 1 && at(c - 1, r) === 0 : at(c - 1, r) === 1 && at(c, r) === 0);
        if (edge && start < 0) start = r;
        if (!edge && start >= 0) {
          walls.push({ ax: c * RES, ay: start * RES, bx: c * RES, by: r * RES });
          start = -1;
        }
      }
    }
  }
  return walls;
}

function polyBox(poly: number[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    x0 = Math.min(x0, poly[i]);
    x1 = Math.max(x1, poly[i]);
    y0 = Math.min(y0, poly[i + 1]);
    y1 = Math.max(y1, poly[i + 1]);
  }
  return [x0, y0, x1, y1];
}

const rectPoly = (x: number, y: number, w: number, h: number) => [x, y, x + w, y, x + w, y + h, x, y + h];

function circlePoly(cx: number, cy: number, r: number, rand: () => number): number[] {
  const out: number[] = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = r * (0.85 + rand() * 0.25);
    out.push(cx + Math.cos(a) * k, cy + Math.sin(a) * k);
  }
  return out;
}

function pointInPoly(poly: number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function markPoly(grid: Uint8Array, poly: number[], v: number) {
  const [x0, y0, x1, y1] = polyBox(poly);
  for (let r = Math.max(0, Math.floor(y0 / RES)); r <= Math.min(ROWS - 1, Math.floor(y1 / RES)); r++)
    for (let c = Math.max(0, Math.floor(x0 / RES)); c <= Math.min(COLS - 1, Math.floor(x1 / RES)); c++)
      if (pointInPoly(poly, (c + 0.5) * RES, (r + 0.5) * RES)) grid[r * COLS + c] = v;
}

function polyEdges(poly: number[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < poly.length; i += 2) {
    const j = (i + 2) % poly.length;
    out.push({ ax: poly[i], ay: poly[i + 1], bx: poly[j], by: poly[j + 1] });
  }
  return out;
}

/** Distance from the cup over cells that are green and not blocked (8 neighbors, Dijkstra). */
function distanceField(floor: Uint8Array, blocked: Uint8Array, cup: Vec): Float64Array {
  const dist = new Float64Array(COLS * ROWS).fill(Infinity);
  const open = (i: number) => floor[i] === 1 && blocked[i] === 0;
  const start = Math.floor(cup.y / RES) * COLS + Math.floor(cup.x / RES);
  dist[start] = 0;
  // Small grid: a plain binary heap.
  const heap: [number, number][] = [[0, start]];
  const push = (d: number, i: number) => {
    heap.push([d, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  const steps = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const c = i % COLS;
    const r = (i - c) / COLS;
    for (const [dc, dr, k] of steps) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const n = nr * COLS + nc;
      if (!open(n)) continue;
      // No cutting corners past a wall.
      if (dc && dr && (!open(r * COLS + nc) || !open(nr * COLS + c))) continue;
      const nd = d + k * RES;
      if (nd < dist[n]) {
        dist[n] = nd;
        push(nd, n);
      }
    }
  }
  return dist;
}

/** Green cells within `pad` of a wall are blocked for the distance field (the ball can't hug a wall). */
function clearance(floor: Uint8Array, blocked: Uint8Array) {
  const near = new Uint8Array(blocked);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      if (floor[i] !== 1) continue;
      for (const [dc, dr] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || floor[nr * COLS + nc] !== 1) near[i] = 1;
      }
    }
  return near;
}

function sideOf(a: Cell, b: Cell): number {
  return DIRS.findIndex((d) => a[0] + d[0] === b[0] && a[1] + d[1] === b[1]);
}

/** One attempt at a hole; null if it came out unplayable. */
function tryHole(seed: number, difficulty: Difficulty): Hole | null {
  const rand = mulberry32(seed);
  const P = PARAMS[difficulty];
  const path = walk(rand, pick(rand, P.len[0], P.len[1]));
  if (!path) return null;
  const n = path.length;
  const plan: Plan = { path, inset: path.map(() => (rand() < 0.3 ? 0.4 : P.lane)) };
  // Tee and cup cells are a bit roomier.
  plan.inset[0] = Math.min(plan.inset[0], 0.8);
  plan.inset[n - 1] = Math.min(plan.inset[n - 1], 0.6);

  const floor = new Uint8Array(COLS * ROWS);
  path.forEach((c, i) => {
    const [x, y, w, h] = inner(c, plan.inset[i]);
    fillRect(floor, x, y, w, h, 1);
    if (i === 0) return;
    // The gap between this cell and the previous one, as wide as the narrower of the two.
    const prev = path[i - 1];
    const band = Math.max(plan.inset[i], plan.inset[i - 1]);
    const [a, ia, b, ib] = prev[0] + prev[1] < c[0] + c[1] ? [prev, plan.inset[i - 1], c, plan.inset[i]] : [c, plan.inset[i], prev, plan.inset[i - 1]];
    if (a[1] === b[1]) fillRect(floor, (a[0] + 1) * C - ia, a[1] * C + band, ia + ib, C - 2 * band, 1);
    else fillRect(floor, a[0] * C + band, (a[1] + 1) * C - ia, C - 2 * band, ia + ib, 1);
  });

  const walls = outline(floor);
  const blocks: number[][] = [];
  const zones: Zone[] = [];
  const bumpers: Bumper[] = [];
  const mills: Mill[] = [];
  const blocked = new Uint8Array(COLS * ROWS);

  const center = (i: number): Vec => ({ x: path[i][0] * C + C / 2, y: path[i][1] * C + C / 2 });
  const [tx, ty] = [center(0).x + (rand() - 0.5) * 1.2, center(0).y + (rand() - 0.5) * 1.2];
  const tee = { x: tx, y: ty };
  const last = inner(path[n - 1], plan.inset[n - 1]);
  const cup = {
    x: last[0] + 1 + rand() * (last[2] - 2),
    y: last[1] + 1 + rand() * (last[3] - 2),
  };
  // Turns: openings on two adjacent sides.
  const openings = (i: number) => {
    const s: number[] = [];
    if (i > 0) s.push(sideOf(path[i], path[i - 1]));
    if (i < n - 1) s.push(sideOf(path[i], path[i + 1]));
    return s;
  };
  const kept = (p: Vec, r: number) => Math.hypot(p.x - tee.x, p.y - tee.y) > r + 1.1 && Math.hypot(p.x - cup.x, p.y - cup.y) > r + 1.2;

  // Banks on every turn's outer corner.
  for (let i = 1; i < n - 1; i++) {
    const [a, b] = openings(i);
    if ((a + 2) % 4 === b) continue;
    const [x, y, w, h] = inner(path[i], plan.inset[i]);
    const k = Math.min(w, h) * (0.32 + rand() * 0.14);
    // The corner away from both openings.
    const right = a === 1 || b === 1;
    const down = a === 2 || b === 2;
    const cx = right ? x : x + w;
    const cy = down ? y : y + h;
    const sx = right ? 1 : -1;
    const sy = down ? 1 : -1;
    const tri = [cx, cy, cx + sx * k, cy, cx, cy + sy * k];
    blocks.push(tri);
    walls.push({ ax: cx + sx * k, ay: cy, bx: cx, by: cy + sy * k });
    markPoly(blocked, tri, 1);
  }

  // The rest, from a shuffled menu.
  const menu: string[] = ["slope", "sand", "bumpers", "block", "slope", "sand"];
  if (P.water) menu.push("water", "water");
  if (P.mills) menu.push("mill", "mill");
  const want = pick(rand, P.features[0], P.features[1]);
  const used = new Set<number>();
  for (let f = 0; f < want * 3 && used.size < Math.min(want, n); f++) {
    const kind = menu[Math.floor(rand() * menu.length)];
    const i = Math.floor(rand() * n);
    if (used.has(i)) continue;
    const [x, y, w, h] = inner(path[i], plan.inset[i]);
    const ops = openings(i);
    const straight = ops.length === 2 && (ops[0] + 2) % 4 === ops[1];
    const vertical = straight && ops[0] % 2 === 0;
    const c = center(i);
    if (kind === "slope") {
      const d = DIRS[Math.floor(rand() * 4)];
      const k = 0.6 + rand() * 0.5;
      const poly = rectPoly(x, y, w, h);
      zones.push({ kind: "slope", poly, box: polyBox(poly), slope: { x: d[0] * k, y: d[1] * k } });
    } else if (kind === "sand") {
      const r = 0.9 + rand() * 0.8;
      const p = { x: x + r + rand() * Math.max(0.01, w - 2 * r), y: y + r + rand() * Math.max(0.01, h - 2 * r) };
      if (!kept(p, r)) continue;
      const poly = circlePoly(p.x, p.y, r, rand);
      zones.push({ kind: "sand", poly, box: polyBox(poly) });
    } else if (kind === "water") {
      if (i === 0 || i === n - 1) continue;
      let poly: number[];
      if (straight && w < 3.6) {
        // A pond across the lane leaving a gap on one side.
        const gap = 1.6 + rand() * 0.4;
        const left = rand() < 0.5;
        poly = vertical
          ? rectPoly(left ? x + gap : x, c.y - 0.7, w - gap, 1.4)
          : rectPoly(c.x - 0.7, left ? y + gap : y, 1.4, h - gap);
      } else {
        const r = 0.9 + rand() * 0.6;
        const p = { x: x + r + rand() * Math.max(0.01, w - 2 * r), y: y + r + rand() * Math.max(0.01, h - 2 * r) };
        if (!kept(p, r)) continue;
        poly = circlePoly(p.x, p.y, r, rand);
      }
      zones.push({ kind: "water", poly, box: polyBox(poly) });
      markPoly(blocked, poly, 1);
    } else if (kind === "bumpers") {
      if (w < 3.4) continue;
      const count = pick(rand, 1, 3);
      for (let k = 0; k < count; k++) {
        const r = 0.35 + rand() * 0.25;
        const p = { x: x + 0.9 + rand() * (w - 1.8), y: y + 0.9 + rand() * (h - 1.8) };
        if (!kept(p, r) || bumpers.some((b) => Math.hypot(b.x - p.x, b.y - p.y) < b.r + r + 1)) continue;
        bumpers.push({ ...p, r });
        markPoly(blocked, circlePoly(p.x, p.y, r, () => 0.5), 1);
      }
    } else if (kind === "block") {
      if (w < 3.4 || !kept(c, 1.2)) continue;
      const s = 0.8 + rand() * 0.5;
      const poly = rand() < 0.5 ? rectPoly(c.x - s / 2, c.y - s / 2, s, s) : [c.x, c.y - s * 0.7, c.x + s * 0.7, c.y, c.x, c.y + s * 0.7, c.x - s * 0.7, c.y];
      blocks.push(poly);
      walls.push(...polyEdges(poly));
      markPoly(blocked, poly, 1);
    } else if (kind === "mill") {
      if (!straight || i === 0 || i === n - 1) continue;
      // Short of the walls: a ball can always sneak past along them.
      const len = Math.min(w, h) / 2 - 0.9;
      if (len < 0.6) continue;
      if (!kept(c, len)) continue;
      mills.push({ x: c.x, y: c.y, len, w: (rand() < 0.5 ? -1 : 1) * (0.9 + rand() * 0.7), phase: rand() * Math.PI * 2, arms: rand() < 0.75 ? 2 : 4 });
    }
    used.add(i);
  }

  const dist = distanceField(floor, clearance(floor, blocked), cup);
  const ti = Math.floor(tee.y / RES) * COLS + Math.floor(tee.x / RES);
  if (!Number.isFinite(dist[ti])) return null;
  // Tee and cup clear of everything.
  if (zones.some((z) => z.kind !== "slope" && (pointInPoly(z.poly, tee.x, tee.y) || pointInPoly(z.poly, cup.x, cup.y)))) return null;
  if (blocks.some((b) => pointInPoly(b, cup.x, cup.y) || pointInPoly(b, tee.x, tee.y))) return null;
  if (Math.hypot(cup.x - tee.x, cup.y - tee.y) < CUP_R + BALL_R + 3) return null;

  const hazards = (mills.length ? 1 : 0) + (zones.some((z) => z.kind === "water") ? 1 : 0);
  const par = Math.max(2, Math.min(6, 2 + Math.floor(dist[ti] / 13) + (hazards ? 1 : 0)));
  return { seed, w: GW * C, h: GH * C, res: RES, cols: COLS, rows: ROWS, floor, dist, walls, blocks, zones, bumpers, mills, tee, cup, par };
}

/** The hole moved and cut to its green's bounding box, so it fills the screen. */
function crop(h: Hole): Hole {
  let c0 = h.cols, r0 = h.rows, c1 = -1, r1 = -1;
  for (let r = 0; r < h.rows; r++)
    for (let c = 0; c < h.cols; c++)
      if (h.floor[r * h.cols + c]) {
        c0 = Math.min(c0, c);
        c1 = Math.max(c1, c);
        r0 = Math.min(r0, r);
        r1 = Math.max(r1, r);
      }
  const cols = c1 - c0 + 1;
  const rows = r1 - r0 + 1;
  const floor = new Uint8Array(cols * rows);
  const dist = new Float64Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      floor[r * cols + c] = h.floor[(r + r0) * h.cols + c + c0];
      dist[r * cols + c] = h.dist[(r + r0) * h.cols + c + c0];
    }
  const dx = -c0 * h.res;
  const dy = -r0 * h.res;
  const poly = (p: number[]) => p.map((v, i) => v + (i % 2 ? dy : dx));
  return {
    ...h,
    w: cols * h.res,
    h: rows * h.res,
    cols,
    rows,
    floor,
    dist,
    walls: h.walls.map((w) => ({ ax: w.ax + dx, ay: w.ay + dy, bx: w.bx + dx, by: w.by + dy })),
    blocks: h.blocks.map(poly),
    zones: h.zones.map((z) => ({ ...z, poly: poly(z.poly), box: [z.box[0] + dx, z.box[1] + dy, z.box[2] + dx, z.box[3] + dy] })),
    bumpers: h.bumpers.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy })),
    mills: h.mills.map((m) => ({ ...m, x: m.x + dx, y: m.y + dy })),
    tee: { x: h.tee.x + dx, y: h.tee.y + dy },
    cup: { x: h.cup.x + dx, y: h.cup.y + dy },
  };
}

/** The hole for a seed: the first attempt that comes out playable. */
export function generateHole(seed: number, difficulty: Difficulty): Hole {
  // Practically always the first few; then an easier one rather than nothing.
  for (const d of [difficulty, "media", "facil"] as Difficulty[]) {
    for (let k = 0; k < 80; k++) {
      const h = tryHole((seed + k * 104729) >>> 0, d);
      if (h) return crop(h);
    }
  }
  throw new Error("minigolf: no hole");
}

/** A course: `count` holes from one seed. */
export function course(seed: number, count: number, difficulty: Difficulty): Hole[] {
  return Array.from({ length: count }, (_, i) => generateHole((seed + i * 7919) >>> 0, difficulty));
}

/** Today's three holes, the same for everyone (`day` = yyyymmdd). */
export const DAILY_HOLES = 3;
export function dailyCourse(day: string): Hole[] {
  return course(Number(day) * 31 + 7, DAILY_HOLES, "media");
}
