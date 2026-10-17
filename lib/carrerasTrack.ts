/**
 * Carreras: tracks and car physics, pure (no Firebase, no DOM). The race's
 * authority (the screen in pantalla mode, each phone in telefono mode) runs it.
 *
 * Everything lives in a 1600×900 logical world. A track is a closed
 * centerline (Catmull-Rom through `points`) with a fixed width; the walls are
 * its edges. Progress along the centerline (arc length) drives laps and
 * positions.
 */

import { mulberry32 } from "./random";

export const WORLD_W = 1600;
export const WORLD_H = 900;

/** Scenery and light of a track (looks only; the physics are the same). */
export type TrackTheme = "campo" | "atardecer" | "desierto" | "nieve" | "noche";
export const THEMES: TrackTheme[] = ["campo", "atardecer", "desierto", "nieve", "noche"];

export type FixedTrackId = "ovalo" | "curvas" | "costa" | "rulos" | "serpentina";
/** `aleatoria` is generated from the race state's `trackSeed`. */
export type TrackId = FixedTrackId | "aleatoria";

export interface TrackDef {
  label: string;
  hint: string;
  width: number;
  theme: TrackTheme;
  /** Control points, in driving order; the start line is at the first one. */
  points: [number, number][];
}

export const TRACKS: Record<FixedTrackId, TrackDef> = {
  ovalo: {
    label: "Óvalo",
    hint: "Fácil",
    width: 130,
    theme: "campo",
    points: [
      [800, 770], [560, 770], [340, 690], [270, 450], [340, 210], [560, 130],
      [800, 130], [1040, 130], [1260, 210], [1330, 450], [1260, 690], [1040, 770],
    ],
  },
  curvas: {
    label: "Curvas",
    hint: "Media",
    width: 115,
    theme: "atardecer",
    points: [
      [800, 800], [480, 800], [230, 730], [160, 500], [260, 300], [470, 300],
      [600, 470], [790, 560], [960, 450], [930, 250], [1060, 110], [1320, 120],
      [1460, 300], [1440, 590], [1290, 780], [1050, 810],
    ],
  },
  costa: {
    label: "Costa",
    hint: "Rápida",
    width: 125,
    theme: "desierto",
    points: [
      [900, 800], [600, 800], [330, 790], [180, 700], [150, 540], [230, 420],
      [380, 390], [520, 430], [640, 380], [660, 250], [760, 140], [1000, 120],
      [1250, 120], [1420, 180], [1470, 330], [1390, 460], [1260, 490], [1170, 580],
      [1200, 700], [1080, 800],
    ],
  },
  rulos: {
    label: "Rulos",
    hint: "Difícil",
    width: 105,
    theme: "noche",
    points: [
      [700, 820], [380, 820], [170, 730], [140, 520], [290, 420], [470, 460],
      [560, 320], [430, 210], [560, 85], [800, 90], [920, 230], [840, 380],
      [930, 520], [1100, 430], [1110, 230], [1260, 100], [1460, 160], [1480, 420],
      [1350, 580], [1430, 760], [1180, 830], [950, 780],
    ],
  },
  serpentina: {
    label: "Serpentina",
    hint: "Técnica",
    width: 105,
    theme: "nieve",
    points: [
      [760, 830], [480, 830], [250, 800], [130, 680], [170, 540], [320, 500],
      [430, 400], [350, 280], [200, 220], [230, 100], [420, 80], [580, 170],
      [640, 320], [760, 420], [880, 320], [920, 170], [1060, 90], [1240, 110],
      [1300, 250], [1200, 370], [1230, 500], [1400, 520], [1480, 650], [1400, 790],
      [1100, 830],
    ],
  },
};

export const TRACK_ORDER: TrackId[] = ["ovalo", "curvas", "costa", "rulos", "serpentina", "aleatoria"];

export const RANDOM_TRACK = { label: "Aleatoria", hint: "Sorpresa" };

export function isTrackId(id: unknown): id is TrackId {
  return id === "aleatoria" || (typeof id === "string" && id in TRACKS);
}

export function trackLabel(id: TrackId): string {
  return id === "aleatoria" ? RANDOM_TRACK.label : TRACKS[id].label;
}

export interface Track {
  def: TrackDef;
  /** Sampled centerline, closed (the last point connects to the first). */
  xs: Float64Array;
  ys: Float64Array;
  /** Arc length at each sample. */
  cum: Float64Array;
  length: number;
}

const SAMPLE_STEP = 10;

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function sample(def: TrackDef): Track {
  const P = def.points;
  const n = P.length;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const [a, b, c, d] = [P[(i - 1 + n) % n], P[i], P[(i + 1) % n], P[(i + 2) % n]];
    const steps = Math.max(4, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / SAMPLE_STEP));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      xs.push(catmull(a[0], b[0], c[0], d[0], t));
      ys.push(catmull(a[1], b[1], c[1], d[1], t));
    }
  }
  const cum = new Float64Array(xs.length);
  let length = 0;
  for (let i = 0; i < xs.length; i++) {
    cum[i] = length;
    const j = (i + 1) % xs.length;
    length += Math.hypot(xs[j] - xs[i], ys[j] - ys[i]);
  }
  return { def, xs: Float64Array.from(xs), ys: Float64Array.from(ys), cum, length };
}

/**
 * Why a track can't be raced or drawn well, or null if it's fine: parts of it
 * closer than its width (roads overlapping), curves tighter than the road
 * (the inner edge folds over), out of the world, or too short.
 */
export function trackProblem(track: Track): string | null {
  const { xs, ys, cum, length, def } = track;
  const n = xs.length;
  const w = def.width;
  if (length < 2600) return "short";
  for (let i = 0; i < n; i++) {
    if (xs[i] < w / 2 + 20 || xs[i] > WORLD_W - w / 2 - 20 || ys[i] < w / 2 + 10 || ys[i] > WORLD_H - w / 2 - 10) {
      return "outside";
    }
  }
  // Turning radius over a few samples.
  const k = 3;
  for (let i = 0; i < n; i++) {
    const a = (i - k + n) % n;
    const b = (i + k) % n;
    const h1 = Math.atan2(ys[i] - ys[a], xs[i] - xs[a]);
    const h2 = Math.atan2(ys[b] - ys[i], xs[b] - xs[i]);
    let d = Math.abs(h2 - h1);
    if (d > Math.PI) d = Math.PI * 2 - d;
    const arc = Math.hypot(xs[i] - xs[a], ys[i] - ys[a]) + Math.hypot(xs[b] - xs[i], ys[b] - ys[i]);
    if (d > 0.001 && arc / d < w / 2 + 6) return "tight";
  }
  // Separation between parts of the track that aren't neighbors along it.
  const minGap = w + 34;
  for (let i = 0; i < n; i += 2) {
    for (let j = i + 2; j < n; j += 2) {
      let along = Math.abs(cum[j] - cum[i]);
      along = Math.min(along, length - along);
      if (along < minGap * 2.2) continue;
      if (Math.hypot(xs[j] - xs[i], ys[j] - ys[i]) < minGap) return "overlap";
    }
  }
  return null;
}

/**
 * A random closed track: points around the center at uneven radii, in angle
 * order (so it never crosses itself). Of the first few that `trackProblem`
 * accepts it keeps the longest, which is the one with the most bends. The
 * start line goes on the straightest stretch.
 */
function randomDef(seed: number): TrackDef {
  let best: { def: TrackDef; length: number } | null = null;
  let found = 0;
  for (let attempt = 0; attempt < 120 && found < 6; attempt++) {
    const rand = mulberry32((seed ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0);
    const n = 9 + Math.floor(rand() * 7);
    const width = 105 + Math.round(rand() * 25);
    const rx = WORLD_W / 2 - width / 2 - 40;
    const ry = WORLD_H / 2 - width / 2 - 25;
    const turn = rand() < 0.5 ? 1 : -1;
    const phase = rand() * Math.PI * 2;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = phase + turn * ((i + (rand() - 0.5) * 0.55) / n) * Math.PI * 2;
      // Now and then a point pulled well inside, for a pocket or a hairpin.
      const r = rand() < 0.32 ? 0.22 + rand() * 0.33 : 0.66 + rand() * 0.34;
      pts.push([Math.round(WORLD_W / 2 + Math.cos(a) * rx * r), Math.round(WORLD_H / 2 + Math.sin(a) * ry * r)]);
    }
    let start = 0;
    let straightest = Infinity;
    for (let i = 0; i < n; i++) {
      const [p, q, r] = [pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n]];
      let d = Math.abs(Math.atan2(r[1] - q[1], r[0] - q[0]) - Math.atan2(q[1] - p[1], q[0] - p[0]));
      if (d > Math.PI) d = Math.PI * 2 - d;
      // Straight and long: room for the grid behind the line.
      const score = d - Math.hypot(r[0] - q[0], r[1] - q[1]) / 2000;
      if (score < straightest) {
        straightest = score;
        start = i;
      }
    }
    const def: TrackDef = {
      ...RANDOM_TRACK,
      width,
      theme: THEMES[Math.floor(rand() * THEMES.length)],
      points: [...pts.slice(start), ...pts.slice(0, start)],
    };
    const track = sample(def);
    if (trackProblem(track)) continue;
    found++;
    if (!best || track.length > best.length) best = { def, length: track.length };
  }
  return best?.def ?? { ...TRACKS.ovalo, ...RANDOM_TRACK };
}

const trackCache = new Map<string, Track>();

/** The sampled track; `seed` only matters for `aleatoria`. */
export function getTrack(id: TrackId, seed = 0): Track {
  const key = id === "aleatoria" ? `${id}:${seed}` : id;
  const cached = trackCache.get(key);
  if (cached) return cached;
  const track = sample(id === "aleatoria" ? randomDef(seed) : TRACKS[id] ?? TRACKS.ovalo);
  trackCache.set(key, track);
  return track;
}

interface Nearest {
  seg: number;
  /** Closest point on the centerline. */
  px: number;
  py: number;
  dist: number;
  /** Arc length of that point. */
  s: number;
}

/**
 * Closest centerline point to (x, y), looking only around `hint` (the car's
 * last segment) so parts of the track that pass close by never steal it.
 */
function nearest(track: Track, x: number, y: number, hint: number): Nearest {
  const n = track.xs.length;
  const window = hint < 0 ? n : 40;
  let best: Nearest = { seg: 0, px: track.xs[0], py: track.ys[0], dist: Infinity, s: 0 };
  for (let k = -window; k <= window; k++) {
    const i = hint < 0 ? k + window : (((hint + k) % n) + n) % n;
    if (i < 0 || i >= n) continue;
    const j = (i + 1) % n;
    const ax = track.xs[i];
    const ay = track.ys[i];
    const dx = track.xs[j] - ax;
    const dy = track.ys[j] - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const px = ax + dx * t;
    const py = ay + dy * t;
    const dist = Math.hypot(x - px, y - py);
    if (dist < best.dist) best = { seg: i, px, py, dist, s: track.cum[i] + Math.sqrt(len2) * t };
  }
  return best;
}

// ---- Cars ----------------------------------------------------------------

export const CAR_LENGTH = 34;
export const CAR_WIDTH = 18;
const CAR_RADIUS = 14;

export const MAX_SPEED = 430;
const ACCEL = 320;
const BRAKE = 700;
const MAX_REVERSE = 120;
const ROLL_DRAG = 0.25;
const COAST_DECEL = 160;
const TURN_RATE = 3.1;
/** Below this speed steering is proportionally weaker (no spinning in place). */
const TURN_FULL_SPEED = 140;
const GRIP = 7;
const WALL_BOUNCE = 0.35;
const WALL_SLOWDOWN = 0.75;

export interface CarInput {
  /** -1 (left) … 1 (right). */
  steer: number;
  brake: boolean;
  /** false = foot off the gas (after the finish line); gas is automatic otherwise. */
  gas?: boolean;
}

export interface Car {
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  /** Last centerline segment (search hint). */
  seg: number;
  /** Arc length at the last step, to measure progress. */
  s: number;
  /** Total distance driven along the track since the start line (negative on the grid). */
  progress: number;
  /** Seconds of wall-scrape left, for a spark effect. */
  bump: number;
}

/**
 * Starting grid behind the start line, two cars per row, facing the driving
 * direction. Slot `k` is always the same place, whoever else is racing.
 */
export function gridCar(track: Track, k: number): Car {
  const n = track.xs.length;
  const i = n - 4 - Math.floor(k / 2) * 6;
  const j = (i + 1) % n;
  const heading = Math.atan2(track.ys[j] - track.ys[i], track.xs[j] - track.xs[i]);
  const nx = -Math.sin(heading);
  const ny = Math.cos(heading);
  const side = (k % 2 ? 1 : -1) * Math.min(28, track.def.width / 4);
  const s = track.cum[i];
  return {
    x: track.xs[i] + nx * side,
    y: track.ys[i] + ny * side,
    heading,
    vx: 0,
    vy: 0,
    seg: i,
    s,
    progress: s - track.length,
    bump: 0,
  };
}

function wrapDelta(d: number, length: number): number {
  if (d < -length / 2) return d + length;
  if (d > length / 2) return d - length;
  return d;
}

/** Advances one car by `dt` seconds; returns how hard it hit a wall (speed into it, 0 if it didn't). */
export function stepCar(car: Car, input: CarInput, track: Track, dt: number): number {
  const fx = Math.cos(car.heading);
  const fy = Math.sin(car.heading);
  let forward = car.vx * fx + car.vy * fy;
  let lateral = -car.vx * fy + car.vy * fx;

  if (input.brake) {
    forward = forward > 0 ? Math.max(0, forward - BRAKE * dt) : Math.max(-MAX_REVERSE, forward - ACCEL * 0.5 * dt);
  } else if (input.gas !== false) {
    forward += (forward < 0 ? BRAKE : ACCEL * (1 - Math.max(0, forward) / (MAX_SPEED * 1.05))) * dt;
  } else {
    forward -= Math.sign(forward) * Math.min(Math.abs(forward), COAST_DECEL * dt);
  }
  forward -= forward * ROLL_DRAG * dt;
  forward = Math.min(forward, MAX_SPEED);
  lateral *= Math.exp(-GRIP * dt);

  const steer = Math.max(-1, Math.min(1, input.steer));
  const grip = Math.min(1, Math.abs(forward) / TURN_FULL_SPEED);
  car.heading += steer * TURN_RATE * grip * Math.sign(forward) * dt;

  const nfx = Math.cos(car.heading);
  const nfy = Math.sin(car.heading);
  car.vx = nfx * forward - nfy * lateral;
  car.vy = nfy * forward + nfx * lateral;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Walls: keep the car inside the track, losing the outward speed.
  const near = nearest(track, car.x, car.y, car.seg);
  const limit = track.def.width / 2 - CAR_RADIUS * 0.6;
  let hit = 0;
  if (near.dist > limit) {
    const ox = (car.x - near.px) / near.dist;
    const oy = (car.y - near.py) / near.dist;
    car.x = near.px + ox * limit;
    car.y = near.py + oy * limit;
    const out = car.vx * ox + car.vy * oy;
    if (out > 0) {
      car.vx -= ox * out * (1 + WALL_BOUNCE);
      car.vy -= oy * out * (1 + WALL_BOUNCE);
      const slow = 1 - (1 - WALL_SLOWDOWN) * Math.min(1, out / 200);
      car.vx *= slow;
      car.vy *= slow;
      if (out > 40) car.bump = 0.25;
      hit = out;
    }
  }
  car.bump = Math.max(0, car.bump - dt);

  car.progress += wrapDelta(near.s - car.s, track.length);
  car.s = near.s;
  car.seg = near.seg;
  return hit;
}

/** Pushes overlapping cars apart and trades their speed along the hit; returns the closing speed (0 = no hit). */
export function collideCars(a: Car, b: Car): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const min = CAR_RADIUS * 2;
  if (dist >= min || dist === 0) return 0;
  const nx = dx / dist;
  const ny = dy / dist;
  const push = (min - dist) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel < 0) {
    const j = rel * 0.9;
    a.vx += nx * j;
    a.vy += ny * j;
    b.vx -= nx * j;
    b.vy -= ny * j;
  }
  return Math.max(0, -rel);
}

/**
 * Bumps a car off another one it can't move (a rival driven by another
 * phone): only `car` is pushed and loses the speed going into the other.
 * Returns the closing speed (0 = no hit).
 */
export function collideWithGhost(car: Car, ox: number, oy: number, ovx: number, ovy: number): number {
  const dx = ox - car.x;
  const dy = oy - car.y;
  const dist = Math.hypot(dx, dy);
  const min = CAR_RADIUS * 2;
  if (dist >= min || dist === 0) return 0;
  const nx = dx / dist;
  const ny = dy / dist;
  car.x -= nx * (min - dist);
  car.y -= ny * (min - dist);
  const rel = (car.vx - ovx) * nx + (car.vy - ovy) * ny;
  if (rel > 0) {
    car.vx -= nx * rel * 1.2;
    car.vy -= ny * rel * 1.2;
  }
  return Math.max(0, rel);
}

/** Laps completed (0 until the first crossing after the start). */
export function lapsDone(car: Car, track: Track): number {
  return Math.max(0, Math.floor(car.progress / track.length));
}
