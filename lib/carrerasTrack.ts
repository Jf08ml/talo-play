/**
 * Carreras: tracks and car physics, pure (no Firebase, no DOM). The race's
 * authority (the screen in pantalla mode, each phone in telefono mode) runs it.
 *
 * Each track lives in its own logical world (`def.size`). A track is a closed
 * centerline (Catmull-Rom through `points`) with a fixed width; the walls are
 * its edges. Points may carry a height, so the road climbs and dips; parts of
 * the track may cross if one goes over the other on a bridge. Ramps launch
 * the cars into the air and boost pads give them a burst of speed. Progress
 * along the centerline (arc length) drives laps and positions.
 */

import { mulberry32 } from "./random";

/** Scenery and light of a track (looks only; the physics are the same). */
export type TrackTheme = "campo" | "atardecer" | "desierto" | "nieve" | "noche";
export const THEMES: TrackTheme[] = ["campo", "atardecer", "desierto", "nieve", "noche"];

export type FixedTrackId = "ovalo" | "curvas" | "costa" | "rulos" | "serpentina";
/** `aleatoria` is generated from the race state's `trackSeed`. */
export type TrackId = FixedTrackId | "aleatoria";

/** A control point: x, y and optionally the road's height there. */
export type TrackPoint = [number, number] | [number, number, number];

/** Something on the road (a ramp, a boost pad). */
export interface TrackFeature {
  /** Where it starts: a control point index; a fraction = that part of the way to the next one. */
  at: number;
  /** Across the road, in the driving direction: -1 left edge, 0 middle, 1 right edge. */
  side?: number;
  /** Fraction of the road's width it covers. */
  span?: number;
}

export interface TrackDef {
  label: string;
  hint: string;
  width: number;
  theme: TrackTheme;
  /** World size; the whole track (and its walls) fits inside. */
  size: [number, number];
  /** Control points, in driving order; the start line is at the first one. */
  points: TrackPoint[];
  ramps?: TrackFeature[];
  boosts?: TrackFeature[];
}

/** Ramps: a wedge on the road, rising to its lip and dropping sharply. */
export const RAMP_LENGTH = 85;
export const RAMP_HEIGHT = 30;
export const BOOST_LENGTH = 70;
/** Height difference two parts of the track need to cross (one on a bridge). */
export const BRIDGE_CLEARANCE = 60;
/** Steepest slope allowed on the road (rise per unit driven). */
const MAX_SLOPE = 0.28;

export const TRACKS: Record<FixedTrackId, TrackDef> = {
  ovalo: {
    label: "Óvalo",
    hint: "Fácil",
    width: 135,
    theme: "campo",
    size: [2000, 1125],
    points: [
      [1000, 960], [700, 960], [420, 920], [230, 780], [170, 560], [230, 340, 10],
      [420, 200, 30], [700, 160, 55], [1000, 160, 60], [1300, 160, 55], [1580, 200, 30], [1770, 340, 10],
      [1830, 560], [1770, 780], [1580, 920], [1300, 960],
    ],
    ramps: [{ at: 7.75 }],
    boosts: [{ at: 0.35, side: 0.55, span: 0.45 }, { at: 14.4, side: -0.55, span: 0.45 }],
  },
  curvas: {
    label: "Curvas",
    hint: "Media · puente",
    width: 115,
    theme: "atardecer",
    size: [2400, 1350],
    points: [
      [560, 1150], [330, 1120], [170, 960], [150, 700], [220, 420], [400, 230],
      [650, 180], [880, 260], [1040, 450], [1200, 675], [1360, 900], [1560, 1110],
      [1820, 1170], [2080, 1060, 20], [2240, 820, 40], [2230, 520, 55], [2060, 260, 70], [1800, 170, 80],
      [1530, 260, 80], [1360, 450, 78], [1200, 675, 75], [1040, 900, 55], [900, 1080, 12], [740, 1150],
    ],
    ramps: [{ at: 6.2, side: -0.5, span: 0.55 }],
    boosts: [{ at: 0.3 }, { at: 17.4, side: 0.5, span: 0.5 }],
  },
  costa: {
    label: "Costa",
    hint: "Rápida · dunas",
    width: 125,
    theme: "desierto",
    size: [2600, 1460],
    points: [
      [1400, 1300], [1000, 1310], [600, 1290], [300, 1200], [170, 1000, 20], [200, 760, 60],
      [380, 620, 20], [620, 640], [820, 560, 40], [860, 360, 80], [1000, 200, 60], [1300, 150, 30],
      [1650, 160], [2000, 170], [2300, 260, 30], [2420, 480, 60], [2330, 700, 40], [2100, 780],
      [1880, 880], [1900, 1120, 20], [1750, 1280],
    ],
    ramps: [{ at: 11.55 }, { at: 1.6, side: 0.5, span: 0.55 }],
    boosts: [{ at: 0.6, side: -0.5, span: 0.5 }, { at: 7.1 }, { at: 12.6 }],
  },
  rulos: {
    label: "Rulos",
    hint: "Difícil · puente",
    width: 105,
    theme: "noche",
    size: [2400, 1350],
    points: [
      [1100, 1220], [700, 1220], [360, 1160], [180, 960], [200, 700], [360, 520],
      [560, 560], [760, 680], [980, 760], [1200, 780, 10], [1400, 700, 30], [1440, 500, 55],
      [1300, 360, 70], [1100, 380, 80], [1000, 540, 85], [980, 760, 85], [1000, 980, 60], [1180, 1060, 30],
      [1500, 1000, 10], [1800, 880], [1900, 640], [1990, 400], [2090, 200], [2260, 190],
      [2290, 480], [2240, 880], [2080, 1160], [1700, 1240],
    ],
    ramps: [{ at: 1.2, side: -0.5, span: 0.55 }, { at: 19.3 }],
    boosts: [{ at: 11.4 }, { at: 26.4, side: 0.5, span: 0.5 }],
  },
  serpentina: {
    label: "Serpentina",
    hint: "Técnica · montaña",
    width: 105,
    theme: "nieve",
    size: [2400, 1350],
    points: [
      [1140, 1245], [720, 1245], [375, 1200], [195, 1020, 10], [255, 810, 25], [480, 750, 40],
      [645, 600, 55], [525, 420, 70], [300, 330, 85], [345, 150, 100], [630, 120, 110], [870, 255, 110],
      [960, 480, 95], [1140, 630, 80], [1320, 480, 90], [1380, 255, 105], [1590, 135, 120], [1860, 165, 120],
      [1950, 375, 100], [1800, 555, 80], [1845, 750, 60], [2100, 780, 40], [2220, 975, 20], [2100, 1185],
      [1650, 1245],
    ],
    ramps: [{ at: 16.05 }, { at: 20.4, side: 0.5, span: 0.55 }],
    boosts: [{ at: 1 }, { at: 14.5, side: -0.5, span: 0.5 }],
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

/** A stretch of road: from arc length `s0`, `len` long, between lateral offsets `lo` and `hi` (+ = right). */
export interface Zone {
  s0: number;
  len: number;
  lo: number;
  hi: number;
}

export interface Track {
  def: TrackDef;
  /** Sampled centerline, closed (the last point connects to the first). */
  xs: Float64Array;
  ys: Float64Array;
  /** Road height at each sample (hills; ramps are on top, see `groundAt`). */
  hs: Float64Array;
  /** Arc length at each sample. */
  cum: Float64Array;
  length: number;
  worldW: number;
  worldH: number;
  ramps: Zone[];
  boosts: Zone[];
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
  const hs: number[] = [];
  const firstSample: number[] = [];
  for (let i = 0; i < n; i++) {
    const [a, b, c, d] = [P[(i - 1 + n) % n], P[i], P[(i + 1) % n], P[(i + 2) % n]];
    const steps = Math.max(4, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / SAMPLE_STEP));
    firstSample.push(xs.length);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      xs.push(catmull(a[0], b[0], c[0], d[0], t));
      ys.push(catmull(a[1], b[1], c[1], d[1], t));
      hs.push(Math.max(0, catmull(a[2] ?? 0, b[2] ?? 0, c[2] ?? 0, d[2] ?? 0, t)));
    }
  }
  const cum = new Float64Array(xs.length);
  let length = 0;
  for (let i = 0; i < xs.length; i++) {
    cum[i] = length;
    const j = (i + 1) % xs.length;
    length += Math.hypot(xs[j] - xs[i], ys[j] - ys[i]);
  }
  // A feature's `at` (control point + fraction) as arc length.
  const sAt = (at: number) => {
    const i = Math.floor(at);
    const a = cum[firstSample[((i % n) + n) % n]];
    const b = (i + 1) % n === 0 ? length : cum[firstSample[(i + 1) % n]];
    return (a + (b - a) * (at - i)) % length;
  };
  const half = def.width / 2;
  const zones = (list: TrackFeature[] | undefined, len: number, span: number): Zone[] =>
    (list ?? []).map((f) => {
      const w = Math.min(1, f.span ?? span) * half;
      const c = Math.max(-1, Math.min(1, f.side ?? 0)) * (half - w);
      return { s0: sAt(f.at), len, lo: c - w, hi: c + w };
    });
  return {
    def,
    xs: Float64Array.from(xs),
    ys: Float64Array.from(ys),
    hs: Float64Array.from(hs),
    cum,
    length,
    worldW: def.size[0],
    worldH: def.size[1],
    ramps: zones(def.ramps, RAMP_LENGTH, 1),
    boosts: zones(def.boosts, BOOST_LENGTH, 0.5),
  };
}

/** How far past a zone's start `s` is, along the track (wraps around the start line). */
export function intoZone(track: Track, zone: Zone, s: number): number {
  const d = s - zone.s0;
  return d < 0 ? d + track.length : d;
}

/** Index of the sample at or before arc length `s`. */
function sampleAt(track: Track, s: number): number {
  const { cum } = track;
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The centerline at arc length `s`: position, height and unit direction. */
export function frameAt(track: Track, s: number): { x: number; y: number; h: number; dx: number; dy: number } {
  const n = track.xs.length;
  const sw = ((s % track.length) + track.length) % track.length;
  const i = sampleAt(track, sw);
  const j = (i + 1) % n;
  const segLen = (j === 0 ? track.length : track.cum[j]) - track.cum[i] || 1;
  const t = (sw - track.cum[i]) / segLen;
  const dx = (track.xs[j] - track.xs[i]) / segLen;
  const dy = (track.ys[j] - track.ys[i]) / segLen;
  return {
    x: track.xs[i] + (track.xs[j] - track.xs[i]) * t,
    y: track.ys[i] + (track.ys[j] - track.ys[i]) * t,
    h: track.hs[i] + (track.hs[j] - track.hs[i]) * t,
    dx,
    dy,
  };
}

/** The road's surface height at arc length `s`, `lat` off the centerline: hills plus any ramp there. */
export function groundAt(track: Track, s: number, lat: number, seg = sampleAt(track, s)): number {
  const n = track.xs.length;
  const j = (seg + 1) % n;
  const segLen = (j === 0 ? track.length : track.cum[j]) - track.cum[seg] || 1;
  const t = Math.max(0, Math.min(1, (s - track.cum[seg]) / segLen));
  let h = track.hs[seg] + (track.hs[j] - track.hs[seg]) * t;
  let ramp = 0;
  for (const r of track.ramps) {
    if (lat < r.lo || lat > r.hi) continue;
    const d = intoZone(track, r, s);
    if (d < r.len) ramp = Math.max(ramp, (RAMP_HEIGHT * d) / r.len);
  }
  h += ramp;
  return h;
}

/**
 * Why a track can't be raced or drawn well, or null if it's fine: parts of it
 * closer than its width at about the same height (roads overlapping instead
 * of crossing on a bridge), curves tighter than the road (the inner edge
 * folds over), slopes too steep, hills at the start, out of the world, or too
 * short.
 */
export function trackProblem(track: Track): string | null {
  const { xs, ys, hs, cum, length, def, worldW, worldH } = track;
  const n = xs.length;
  const w = def.width;
  if (length < 2600) return "short";
  for (let i = 0; i < n; i++) {
    if (xs[i] < w / 2 + 20 || xs[i] > worldW - w / 2 - 20 || ys[i] < w / 2 + 10 || ys[i] > worldH - w / 2 - 10) {
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
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const run = Math.hypot(xs[j] - xs[i], ys[j] - ys[i]) || 1;
    if (Math.abs(hs[j] - hs[i]) / run > MAX_SLOPE) return "steep";
    // Flat around the start: the grid, the gantry and the stands.
    const fromStart = Math.min(cum[i], length - cum[i]);
    if (fromStart < 200 && hs[i] > 2) return "start";
  }
  // Separation between parts of the track that aren't neighbors along it.
  const minGap = w + 34;
  for (let i = 0; i < n; i += 2) {
    for (let j = i + 2; j < n; j += 2) {
      let along = Math.abs(cum[j] - cum[i]);
      along = Math.min(along, length - along);
      if (along < minGap * 2.2) continue;
      if (Math.hypot(xs[j] - xs[i], ys[j] - ys[i]) < minGap && Math.abs(hs[j] - hs[i]) < BRIDGE_CLEARANCE) return "overlap";
    }
  }
  return null;
}

const RANDOM_SIZE: [number, number] = [2400, 1350];

/**
 * A random closed track: points around the center at uneven radii, in angle
 * order (so it never crosses itself), some of them up on hills. Of the first
 * few that `trackProblem` accepts it keeps the longest, which is the one with
 * the most bends. The start line goes on the straightest stretch; ramps and
 * boost pads go on other straight ones.
 */
function randomDef(seed: number): TrackDef {
  const [W, H] = RANDOM_SIZE;
  let best: { def: TrackDef; length: number } | null = null;
  let found = 0;
  for (let attempt = 0; attempt < 160 && found < 6; attempt++) {
    const rand = mulberry32((seed ^ Math.imul(attempt + 1, 0x9e3779b1)) >>> 0);
    const n = 10 + Math.floor(rand() * 6);
    const width = 105 + Math.round(rand() * 25);
    const rx = W / 2 - width / 2 - 40;
    const ry = H / 2 - width / 2 - 25;
    const turn = rand() < 0.5 ? 1 : -1;
    const phase = rand() * Math.PI * 2;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = phase + turn * ((i + (rand() - 0.5) * 0.55) / n) * Math.PI * 2;
      // Now and then a point pulled well inside, for a pocket or a hairpin.
      const r = rand() < 0.32 ? 0.22 + rand() * 0.33 : 0.66 + rand() * 0.34;
      pts.push([Math.round(W / 2 + Math.cos(a) * rx * r), Math.round(H / 2 + Math.sin(a) * ry * r)]);
    }
    // How much the road bends at each point (0 = straight).
    const bend = pts.map((q, i) => {
      const p = pts[(i - 1 + n) % n];
      const r = pts[(i + 1) % n];
      let d = Math.abs(Math.atan2(r[1] - q[1], r[0] - q[0]) - Math.atan2(q[1] - p[1], q[0] - p[0]));
      if (d > Math.PI) d = Math.PI * 2 - d;
      return d;
    });
    let start = 0;
    let straightest = Infinity;
    for (let i = 0; i < n; i++) {
      // Straight and long: room for the grid behind the line.
      const r = pts[(i + 1) % n];
      const score = bend[i] - Math.hypot(r[0] - pts[i][0], r[1] - pts[i][1]) / 2000;
      if (score < straightest) {
        straightest = score;
        start = i;
      }
    }
    const order = [...pts.slice(start), ...pts.slice(0, start)];
    const bends = [...bend.slice(start), ...bend.slice(0, start)];
    // Hills: flat around the start, elsewhere about half the points up high.
    const points: TrackPoint[] = order.map(([x, y], i) => {
      if (i <= 1 || i === n - 1) return [x, y];
      return rand() < 0.5 ? [x, y] : [x, y, Math.round(25 + rand() * 70)];
    });
    // Ramps and boosts on the straightest of the remaining points, never two on one.
    const spots = Array.from({ length: n }, (_, i) => i)
      .filter((i) => i >= 2 && i <= n - 2 && bends[(i + 1) % n] < 1.3)
      .sort((a, b) => bends[a] + bends[(a + 1) % n] - bends[b] - bends[(b + 1) % n]);
    const ramps: TrackFeature[] = [];
    const boosts: TrackFeature[] = [];
    const nRamps = 1 + Math.floor(rand() * 2);
    spots.forEach((i, k) => {
      const side = rand() < 0.5 ? 0 : rand() < 0.5 ? -0.5 : 0.5;
      const f: TrackFeature = side ? { at: i + 0.3, side, span: 0.55 } : { at: i + 0.3 };
      if (k < nRamps) ramps.push(f);
      else if (k < nRamps + 3) boosts.push(side ? f : { ...f, at: i + 0.2 });
    });
    const def: TrackDef = {
      ...RANDOM_TRACK,
      width,
      theme: THEMES[Math.floor(rand() * THEMES.length)],
      size: RANDOM_SIZE,
      points,
      ramps,
      boosts: [{ at: 0.4, side: rand() < 0.5 ? -0.5 : 0.5, span: 0.5 }, ...boosts],
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
  /** Signed distance from the centerline (+ = right of the driving direction). */
  lat: number;
}

/**
 * Closest centerline point to (x, y), looking only around `hint` (the car's
 * last segment) so parts of the track that pass close by (or under a bridge)
 * never steal it.
 */
function nearest(track: Track, x: number, y: number, hint: number): Nearest {
  const n = track.xs.length;
  const window = hint < 0 ? n : 40;
  let best: Nearest = { seg: 0, px: track.xs[0], py: track.ys[0], dist: Infinity, s: 0, lat: 0 };
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
    if (dist < best.dist) {
      const len = Math.sqrt(len2);
      best = { seg: i, px, py, dist, s: track.cum[i] + len * t, lat: ((x - px) * -dy + (y - py) * dx) / len };
    }
  }
  return best;
}

// ---- Cars ----------------------------------------------------------------

export const CAR_LENGTH = 34;
export const CAR_WIDTH = 18;
const CAR_RADIUS = 14;
/** Cars this far apart in height don't touch (one on a bridge, one in the air). */
const CAR_HEIGHT = 16;

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

export const GRAVITY = 950;
/** How much steering is left in the air. */
const AIR_STEER = 0.35;
/** Speed lost per second climbing a slope of 1 (gained going down). */
const SLOPE_PULL = 280;
/** Ground that falls away more than this below where the car would fly launches it. */
const LIFT_OFF = 0.05;
export const BOOST_SECONDS = 1.1;
/** Top speed while boosting, as a multiple of `MAX_SPEED`. */
export const BOOST_TOP = 1.32;
const BOOST_ACCEL = 900;
/** A boost pad gets the car to at least this fraction of top speed at once. */
const BOOST_KICK = 1.12;

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
  /** Height of the car's bottom. */
  z: number;
  heading: number;
  vx: number;
  vy: number;
  vz: number;
  /** Height of the road under the car. */
  ground: number;
  /** Seconds in the air so far (0 = on the road). */
  air: number;
  /** Seconds of boost left. */
  boost: number;
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
    z: track.hs[i],
    heading,
    vx: 0,
    vy: 0,
    vz: 0,
    ground: track.hs[i],
    air: 0,
    boost: 0,
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
  const flying = car.air > 0;

  if (!flying) {
    if (input.brake) {
      forward = forward > 0 ? Math.max(0, forward - BRAKE * dt) : Math.max(-MAX_REVERSE, forward - ACCEL * 0.5 * dt);
    } else if (input.gas !== false) {
      forward += (forward < 0 ? BRAKE : ACCEL * (1 - Math.max(0, forward) / (MAX_SPEED * 1.05))) * dt;
    } else {
      forward -= Math.sign(forward) * Math.min(Math.abs(forward), COAST_DECEL * dt);
    }
    if (car.boost > 0 && !input.brake && forward > 0) {
      forward += BOOST_ACCEL * Math.max(0, 1 - forward / (MAX_SPEED * BOOST_TOP)) * dt;
    }
    // Hills: the slope along the way the car points.
    const n = track.xs.length;
    const i = car.seg;
    const j = (i + 1) % n;
    const run = Math.hypot(track.xs[j] - track.xs[i], track.ys[j] - track.ys[i]) || 1;
    const along = ((track.xs[j] - track.xs[i]) * fx + (track.ys[j] - track.ys[i]) * fy) / run;
    forward -= SLOPE_PULL * ((track.hs[j] - track.hs[i]) / run) * along * dt;
  }
  forward -= forward * ROLL_DRAG * dt;
  forward = Math.min(forward, MAX_SPEED * BOOST_TOP);
  lateral *= Math.exp(-GRIP * dt);

  const steer = Math.max(-1, Math.min(1, input.steer));
  const grip = Math.min(1, Math.abs(forward) / TURN_FULL_SPEED) * (flying ? AIR_STEER : 1);
  car.heading += steer * TURN_RATE * grip * Math.sign(forward) * dt;

  const nfx = Math.cos(car.heading);
  const nfy = Math.sin(car.heading);
  car.vx = nfx * forward - nfy * lateral;
  car.vy = nfy * forward + nfx * lateral;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Walls: keep the car inside the track, losing the outward speed.
  let near = nearest(track, car.x, car.y, car.seg);
  const limit = track.def.width / 2 - CAR_RADIUS * 0.6;
  let hit = 0;
  if (near.dist > limit) {
    const ox = (car.x - near.px) / near.dist;
    const oy = (car.y - near.py) / near.dist;
    car.x = near.px + ox * limit;
    car.y = near.py + oy * limit;
    near = { ...near, lat: Math.sign(near.lat) * limit };
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

  // Height: follow the road, unless it drops away faster than the car falls.
  const ground = groundAt(track, near.s, near.lat, near.seg);
  car.ground = ground;
  if (flying) {
    car.vz -= GRAVITY * dt;
    car.z += car.vz * dt;
    if (car.z <= ground) {
      car.z = ground;
      car.vz = 0;
      car.air = 0;
    } else {
      car.air += dt;
    }
  } else {
    const ballistic = car.z + car.vz * dt - (GRAVITY * dt * dt) / 2;
    if (ballistic > ground + LIFT_OFF) {
      car.z = ballistic;
      car.vz -= GRAVITY * dt;
      car.air = dt;
    } else {
      car.vz = (ground - car.z) / dt;
      car.z = ground;
    }
  }

  // Boost pads, only touching the road.
  car.boost = Math.max(0, car.boost - dt);
  if (car.air === 0) {
    for (const b of track.boosts) {
      if (near.lat < b.lo || near.lat > b.hi || intoZone(track, b, near.s) >= b.len) continue;
      if (car.boost < BOOST_SECONDS - 0.2) {
        const fwd = car.vx * nfx + car.vy * nfy;
        const kick = Math.max(0, MAX_SPEED * BOOST_KICK - fwd);
        car.vx += nfx * kick;
        car.vy += nfy * kick;
      }
      car.boost = BOOST_SECONDS;
    }
  }

  car.progress += wrapDelta(near.s - car.s, track.length);
  car.s = near.s;
  car.seg = near.seg;
  return hit;
}

/** Pushes overlapping cars apart and trades their speed along the hit; returns the closing speed (0 = no hit). */
export function collideCars(a: Car, b: Car): number {
  if (Math.abs(a.z - b.z) > CAR_HEIGHT) return 0;
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
 * phone, at `o`): only `car` is pushed and loses the speed going into the
 * other. Returns the closing speed (0 = no hit).
 */
export function collideWithGhost(car: Car, o: { x: number; y: number; z: number; vx: number; vy: number }): number {
  if (Math.abs(car.z - o.z) > CAR_HEIGHT) return 0;
  const dx = o.x - car.x;
  const dy = o.y - car.y;
  const dist = Math.hypot(dx, dy);
  const min = CAR_RADIUS * 2;
  if (dist >= min || dist === 0) return 0;
  const nx = dx / dist;
  const ny = dy / dist;
  car.x -= nx * (min - dist);
  car.y -= ny * (min - dist);
  const rel = (car.vx - o.vx) * nx + (car.vy - o.vy) * ny;
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
