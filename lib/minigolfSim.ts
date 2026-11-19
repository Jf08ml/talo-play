/**
 * Minigolf's physics, pure and deterministic: the same shot from the same
 * place at the same hole time rolls the same way on every phone, so a
 * player's shots can be replayed by the others from four numbers (start,
 * angle, power, time). Only + − × ÷ √ and the mills' sin/cos: the published
 * resting point is snapped to anyway, so a last-bit difference can't drift.
 *
 * A hole lives in its own units (a few dozen across, the ball is 0.56 wide);
 * y grows downwards. Holes come from lib/minigolfHoles.ts; drawing is
 * lib/minigolfDraw.ts (2D) and lib/minigolf3d.ts (3D).
 */

export const BALL_R = 0.28;
export const CUP_R = 0.42;
/** Ball speed (units/s) at full power. */
export const MAX_SPEED = 19;
/** Fixed physics step. */
export const DT = 1 / 200;
/** Half the thickness of a mill's arm. */
export const MILL_T = 0.16;

const GRASS = 4.6;
const SAND = 15;
const SLOPE_G = 5.5;
const WALL_E = 0.72;
const BUMPER_E = 0.95;
const BUMPER_KICK = 2.6;
const MILL_E = 0.55;
const STOP = 0.15;
/** Faster than this over the cup and it lips out. */
const CAPTURE = 4.2;
const CUP_PULL = 18;
const MAX_ROLL_S = 20;
/** Rolling this slowly (on a slope) for this long counts as stopped. */
const SLOW_S = 0.6;

export interface Vec {
  x: number;
  y: number;
}

/** A wall: a segment the ball bounces off. */
export interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export type ZoneKind = "sand" | "water" | "slope";

export interface Zone {
  kind: ZoneKind;
  /** Polygon as x0,y0,x1,y1… */
  poly: number[];
  /** Bounding box [minX, minY, maxX, maxY]. */
  box: [number, number, number, number];
  /** Downhill direction × steepness (slopes). */
  slope?: Vec;
}

export interface Bumper {
  x: number;
  y: number;
  r: number;
}

/** A turning bar: `arms` arms of length `len` from its hub, angle = phase + w·t. */
export interface Mill {
  x: number;
  y: number;
  len: number;
  w: number;
  phase: number;
  arms: 2 | 3 | 4;
}

export interface Hole {
  seed: number;
  /** Size in units. */
  w: number;
  h: number;
  /** Raster cell size and dimensions (floor, solid, distance field). */
  res: number;
  cols: number;
  rows: number;
  /** 1 = green. */
  floor: Uint8Array;
  /** Distance to the cup along the green (units), Infinity where unreachable. */
  dist: Float64Array;
  walls: Seg[];
  /** Solid shapes (banks, blocks), drawn filled; their edges are in `walls`. */
  blocks: number[][];
  zones: Zone[];
  bumpers: Bumper[];
  mills: Mill[];
  tee: Vec;
  cup: Vec;
  par: number;
}

export type RollEnd = "rest" | "in" | "water";

/** A ball rolling after a shot. `t` is the hole's clock (s), which moves the mills. */
export interface Roll {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  elapsed: number;
  slow: number;
  done: RollEnd | null;
}

/** What happened in a step, for sounds and effects. */
export interface RollEvents {
  /** Hardest impact speed against a wall or a block. */
  wall: number;
  bumper: number;
  mill: number;
  cup: boolean;
  water: boolean;
  /** Rolled over the cup too fast. */
  lip: boolean;
}

export const noEvents = (): RollEvents => ({ wall: 0, bumper: 0, mill: 0, cup: false, water: false, lip: false });

/** Shot speed from power 0–1 (a curve, so short putts are easier to dose). */
export function shotSpeed(power: number): number {
  return MAX_SPEED * Math.pow(Math.max(0, Math.min(1, power)), 1.25);
}

export function startRoll(x: number, y: number, t: number, angle: number, power: number): Roll {
  const s = shotSpeed(power);
  return { x, y, vx: Math.cos(angle) * s, vy: Math.sin(angle) * s, t, elapsed: 0, slow: 0, done: null };
}

function inPoly(poly: number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inZone(z: Zone, x: number, y: number): boolean {
  return x >= z.box[0] && x <= z.box[2] && y >= z.box[1] && y <= z.box[3] && inPoly(z.poly, x, y);
}

export function onFloor(h: Hole, x: number, y: number): boolean {
  const c = Math.floor(x / h.res);
  const r = Math.floor(y / h.res);
  return c >= 0 && r >= 0 && c < h.cols && r < h.rows && h.floor[r * h.cols + c] === 1;
}

/** Path distance to the cup from a point (large off the green or where it can't get). */
export function distAt(h: Hole, x: number, y: number): number {
  const c = Math.floor(x / h.res);
  const r = Math.floor(y / h.res);
  if (c < 0 || r < 0 || c >= h.cols || r >= h.rows) return 1e4;
  const d = h.dist[r * h.cols + c];
  if (!Number.isFinite(d)) return 1e4;
  const cx = (c + 0.5) * h.res;
  const cy = (r + 0.5) * h.res;
  return d + Math.hypot(x - cx, y - cy) * 0.5;
}

export function millAngle(m: Mill, t: number): number {
  return m.phase + m.w * t;
}

/** Push the ball out of a segment (thickened by `pad`) moving at (uvx, uvy); returns the impact speed. */
function hitSeg(r: Roll, ax: number, ay: number, bx: number, by: number, pad: number, e: number, mill: Mill | null): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-9;
  let u = ((r.x - ax) * dx + (r.y - ay) * dy) / len2;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  const qx = ax + u * dx;
  const qy = ay + u * dy;
  let nx = r.x - qx;
  let ny = r.y - qy;
  const rad = BALL_R + pad;
  const d2 = nx * nx + ny * ny;
  if (d2 >= rad * rad) return 0;
  const d = Math.sqrt(d2);
  if (d < 1e-6) {
    // Dead center on the line: push out along its normal.
    const l = Math.sqrt(len2);
    nx = -dy / l;
    ny = dx / l;
  } else {
    nx /= d;
    ny /= d;
  }
  r.x = qx + nx * rad;
  r.y = qy + ny * rad;
  // A mill's arm moves: bounce relative to it (it can push the ball).
  const uvx = mill ? -mill.w * (qy - mill.y) : 0;
  const uvy = mill ? mill.w * (qx - mill.x) : 0;
  const vn = (r.vx - uvx) * nx + (r.vy - uvy) * ny;
  if (vn >= 0) return 0;
  r.vx -= (1 + e) * vn * nx;
  r.vy -= (1 + e) * vn * ny;
  return -vn;
}

/** One physics step. */
export function stepRoll(h: Hole, r: Roll, ev?: RollEvents): void {
  if (r.done) return;
  // The ground under the ball.
  let fric = GRASS;
  let sx = 0;
  let sy = 0;
  for (const z of h.zones) {
    if (!inZone(z, r.x, r.y)) continue;
    if (z.kind === "water") {
      r.done = "water";
      r.vx = r.vy = 0;
      if (ev) ev.water = true;
      return;
    }
    if (z.kind === "sand") fric = SAND;
    else if (z.slope) {
      sx += z.slope.x;
      sy += z.slope.y;
    }
  }
  r.vx += sx * SLOPE_G * DT;
  r.vy += sy * SLOPE_G * DT;
  let s = Math.sqrt(r.vx * r.vx + r.vy * r.vy);
  if (s > 0) {
    const ns = Math.max(0, s - fric * DT);
    r.vx *= ns / s;
    r.vy *= ns / s;
    s = ns;
  }

  // The cup pulls a ball rolling over it; slow enough, it drops.
  const cdx = h.cup.x - r.x;
  const cdy = h.cup.y - r.y;
  const cd = Math.sqrt(cdx * cdx + cdy * cdy);
  if (cd < CUP_R) {
    if ((cd < CUP_R * 0.75 && s < CAPTURE) || (cd < CUP_R && s < 1.2)) {
      r.done = "in";
      r.x = h.cup.x;
      r.y = h.cup.y;
      r.vx = r.vy = 0;
      if (ev) ev.cup = true;
      return;
    }
    const pull = (CUP_PULL * (1 - cd / CUP_R)) / Math.max(cd, 0.05);
    r.vx += cdx * pull * DT;
    r.vy += cdy * pull * DT;
    if (ev && s >= CAPTURE) ev.lip = true;
  }

  r.x += r.vx * DT;
  r.y += r.vy * DT;
  r.t += DT;
  r.elapsed += DT;

  for (const w of h.walls) {
    const hit = hitSeg(r, w.ax, w.ay, w.bx, w.by, 0, WALL_E, null);
    if (ev && hit > ev.wall) ev.wall = hit;
  }
  for (const b of h.bumpers) {
    const dx = r.x - b.x;
    const dy = r.y - b.y;
    const rad = BALL_R + b.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rad * rad) continue;
    const d = Math.sqrt(d2) || 1e-6;
    const nx = dx / d;
    const ny = dy / d;
    r.x = b.x + nx * rad;
    r.y = b.y + ny * rad;
    const vn = r.vx * nx + r.vy * ny;
    if (vn < 0) {
      r.vx -= (1 + BUMPER_E) * vn * nx;
      r.vy -= (1 + BUMPER_E) * vn * ny;
    }
    r.vx += nx * BUMPER_KICK;
    r.vy += ny * BUMPER_KICK;
    if (ev) ev.bumper = Math.max(ev.bumper, -vn + BUMPER_KICK);
  }
  for (const m of h.mills) {
    const a0 = millAngle(m, r.t);
    for (let k = 0; k < m.arms; k++) {
      const a = a0 + (k * Math.PI * 2) / m.arms;
      const hit = hitSeg(r, m.x, m.y, m.x + Math.cos(a) * m.len, m.y + Math.sin(a) * m.len, MILL_T, MILL_E, m);
      if (ev && hit > ev.mill) ev.mill = hit;
    }
  }

  // Squeezed out of the green somehow: treat it like water (back to the shot's start).
  if (!onFloor(h, r.x, r.y)) {
    r.done = "water";
    r.vx = r.vy = 0;
    if (ev) ev.water = true;
    return;
  }

  const speed = Math.sqrt(r.vx * r.vx + r.vy * r.vy);
  if (speed < STOP) {
    r.slow += DT;
    if (sx === 0 && sy === 0) r.slow = SLOW_S;
  } else if (speed < STOP * 3) r.slow += DT;
  else r.slow = 0;
  if (r.slow >= SLOW_S || r.elapsed > MAX_ROLL_S) {
    // Stopping with its center over the cup: it drops.
    if (Math.hypot(h.cup.x - r.x, h.cup.y - r.y) < CUP_R) {
      r.done = "in";
      r.x = h.cup.x;
      r.y = h.cup.y;
      r.vx = r.vy = 0;
      if (ev) ev.cup = true;
      return;
    }
    r.done = "rest";
    r.vx = r.vy = 0;
  }
}

export interface ShotResult {
  x: number;
  y: number;
  end: RollEnd;
  /** Seconds it rolled. */
  elapsed: number;
}

/** A whole shot, run to the end at once (bots, and the resting point published with each shot). */
export function simulate(h: Hole, x: number, y: number, t: number, angle: number, power: number): ShotResult {
  const r = startRoll(x, y, t, angle, power);
  while (!r.done) stepRoll(h, r);
  return { x: r.x, y: r.y, end: r.done, elapsed: r.elapsed };
}

// ---- Bots ------------------------------------------------------------------------

/**
 * A bot's shot: it tries a fan of angles and powers with the real physics
 * and scores where each ends (in the cup best, then closest to it along the
 * green; water worst). Each shot's score is averaged with its neighbors', so
 * it prefers shots that still work when it misses a little — not the ones
 * that graze the water. Then it misses a little, by `skill` (0 sloppy … 1 sharp).
 */
export function botShot(h: Hole, x: number, y: number, t: number, skill: number, rand: () => number): { angle: number; power: number } {
  const toCup = Math.atan2(h.cup.y - y, h.cup.x - x);
  const powers = [0.14, 0.22, 0.3, 0.38, 0.47, 0.57, 0.68, 0.8, 1];
  const here = distAt(h, x, y);
  const scoreOf = (a: number, p: number) => {
    const res = simulate(h, x, y, t, a, p);
    return res.end === "in" ? -40 : res.end === "water" ? here + 14 : distAt(h, res.x, res.y);
  };
  /** Angles around (`wrap`) or a fine fan toward the cup. */
  const fans = [
    { angles: Array.from({ length: 64 }, (_, k) => (k / 64) * Math.PI * 2), wrap: true },
    { angles: [-0.09, -0.06, -0.03, 0, 0.03, 0.06, 0.09].map((d) => toCup + d), wrap: false },
  ];
  let best = { angle: toCup, power: 0.4, score: Infinity };
  for (const { angles, wrap } of fans) {
    const grid = angles.map((a) => powers.map((p) => scoreOf(a, p)));
    const A = angles.length;
    for (let i = 0; i < A; i++)
      for (let j = 0; j < powers.length; j++) {
        const near: number[] = [grid[i][j]];
        for (const di of [-1, 1]) {
          const k = wrap ? (i + di + A) % A : i + di;
          if (k >= 0 && k < A) near.push(grid[k][j]);
        }
        for (const dj of [-1, 1]) if (grid[i][j + dj] !== undefined) near.push(grid[i][j + dj]);
        const score = (grid[i][j] * 2 + near.slice(1).reduce((s, v) => s + v, 0)) / (near.length + 1);
        if (score < best.score) best = { angle: angles[i], power: powers[j], score };
      }
  }
  const errA = (1 - skill) * 0.14 + 0.012;
  const errP = (1 - skill) * 0.2 + 0.03;
  return {
    angle: best.angle + (rand() + rand() - 1) * errA,
    power: Math.max(0.05, Math.min(1, best.power * (1 + (rand() + rand() - 1) * errP))),
  };
}

// ---- Scoring -------------------------------------------------------------------

/** Strokes on a hole are capped here (not holed by then: this many). */
export const MAX_STROKES = 8;

/** "Birdie", "Par"… for a score on a hole. */
export function scoreName(strokes: number, par: number): string {
  if (strokes === 1) return "¡Hoyo en uno!";
  const d = strokes - par;
  if (d <= -3) return "¡Albatros!";
  if (d === -2) return "¡Águila!";
  if (d === -1) return "¡Birdie!";
  if (d === 0) return "Par";
  if (d === 1) return "Bogey";
  if (d === 2) return "Doble bogey";
  return `+${d}`;
}

/** "+3", "−2", "E" (even) for a total against par. */
export function toPar(strokes: number, par: number): string {
  const d = strokes - par;
  return d === 0 ? "E" : d > 0 ? `+${d}` : `−${-d}`;
}
