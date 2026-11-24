import { mulberry32 } from "./random";

/**
 * El gran golpe: the building, generated from the room's seed, and its
 * security as a pure function of time. Nothing here is sent over the network:
 * every phone builds the same map from `seed` + `rows` and computes where each
 * guard is, where each camera points and which lasers are on from the
 * match's clock (seconds since `startedAt`), like El tronco's log.
 *
 * Units are cells (a cell is 1×1; walls are whole cells). The building is a
 * grid of RX × rows rooms of ROOM × ROOM cells with one-cell walls, mirrored
 * left/right so both teams get the same building: rooms, doors, guards,
 * cameras, lasers and diamond spots on the right are the left's mirror.
 *
 * Changing the generator changes every room's map: rooms keep only the seed.
 */

export const ROOM = 6;
export const RX = 4;
const STEP = ROOM + 1;

export type RoomKind = "entrada" | "sala" | "boveda";

export interface RoomInfo {
  rx: number;
  ry: number;
  /** First interior cell. */
  x0: number;
  y0: number;
  kind: RoomKind;
}

/** An escape zone: 2×2 cells in an entrance room's outer corner. Exits 0–1 are on the left, 2–3 on the right. */
export interface Exit {
  x: number;
  y: number;
  /** Where people of this exit appear. */
  sx: number;
  sy: number;
}

export interface Door {
  /** Its two cells (top-left first). */
  x: number;
  y: number;
  /** The wall it cuts is vertical (the door is crossed left↔right). */
  vertical: boolean;
}

interface Seg {
  t0: number;
  t1: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  a0: number;
  a1: number;
}

/** A guard walking a closed path at a steady pace, stopping to look at each corner. */
export interface Guard {
  segs: Seg[];
  period: number;
  phase: number;
}

/** A camera on a corner, sweeping back and forth. */
export interface Cam {
  x: number;
  y: number;
  base: number;
  amp: number;
  period: number;
  phase: number;
}

/** A laser across a door, on part of each period. */
export interface Laser {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  period: number;
  on: number;
  phase: number;
}

/** A diamond's slot: it always lies in `room`; where in it depends on how many times it was taken. */
export interface GemDef {
  room: number;
  value: number;
  /** Pair index (a diamond and its mirror share the dice). */
  k: number;
  mirror: boolean;
}

export interface GolpeMap {
  w: number;
  h: number;
  rows: number;
  /** 1 = wall. */
  wall: Uint8Array;
  /** Room index per cell (-1 wall, -2 door). */
  room: Int16Array;
  rooms: RoomInfo[];
  doors: Door[];
  exits: Exit[];
  guards: Guard[];
  cams: Cam[];
  lasers: Laser[];
  gems: GemDef[];
  seed: number;
}

export const GUARD_SPEED = 1.5;
const GUARD_PAUSE = 1.1;
export const GUARD_RANGE = 4.3;
export const GUARD_HALF = 0.6;
/** A guard notices whoever is this close, looking or not. */
export const GUARD_HEAR = 0.95;
export const CAM_RANGE = 5.6;
export const CAM_HALF = 0.34;
export const BIG_GEM = 3;

export const rowsFor = (people: number) => (people > 4 ? 4 : 3);

const angleLerp = (a: number, b: number, k: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

function makeGuard(pts: [number, number][], phase: number): Guard {
  const segs: Seg[] = [];
  let t = 0;
  const n = pts.length;
  const dir = (i: number) => {
    const [ax, ay] = pts[i % n];
    const [bx, by] = pts[(i + 1) % n];
    return Math.atan2(by - ay, bx - ax);
  };
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % n];
    const a = dir(i);
    const walk = Math.hypot(bx - ax, by - ay) / GUARD_SPEED;
    segs.push({ t0: t, t1: t + walk, ax, ay, bx, by, a0: a, a1: a });
    t += walk;
    // At the corner: stop and turn slowly to the next leg, looking around.
    segs.push({ t0: t, t1: t + GUARD_PAUSE, ax: bx, ay: by, bx, by, a0: a, a1: dir(i + 1) });
    t += GUARD_PAUSE;
  }
  return { segs, period: t, phase: phase * t };
}

export function guardAt(g: Guard, t: number): { x: number; y: number; a: number } {
  let tt = (t + g.phase) % g.period;
  if (tt < 0) tt += g.period;
  for (const s of g.segs) {
    if (tt > s.t1) continue;
    const k = s.t1 > s.t0 ? (tt - s.t0) / (s.t1 - s.t0) : 1;
    // Ease the turn so the look-around reads as a look.
    const e = k * k * (3 - 2 * k);
    return { x: s.ax + (s.bx - s.ax) * k, y: s.ay + (s.by - s.ay) * k, a: angleLerp(s.a0, s.a1, e) };
  }
  const s = g.segs[0];
  return { x: s.ax, y: s.ay, a: s.a0 };
}

export function camAngle(c: Cam, t: number): number {
  return c.base + c.amp * Math.sin(((t + c.phase) / c.period) * Math.PI * 2);
}

export function laserOn(l: Laser, t: number): boolean {
  let tt = (t + l.phase) % l.period;
  if (tt < 0) tt += l.period;
  return tt < l.on;
}

/** Seconds until the laser turns on (0 when on). */
export function laserSoon(l: Laser, t: number): number {
  let tt = (t + l.phase) % l.period;
  if (tt < 0) tt += l.period;
  return tt < l.on ? 0 : l.period - tt;
}

export const isWall = (m: GolpeMap, x: number, y: number) => {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  return cx < 0 || cy < 0 || cx >= m.w || cy >= m.h || m.wall[cy * m.w + cx] === 1;
};

/** Nothing solid between two points. */
export function lineClear(m: GolpeMap, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.ceil(d / 0.2);
  for (let i = 1; i < n; i++) {
    const k = i / n;
    if (isWall(m, ax + (bx - ax) * k, ay + (by - ay) * k)) return false;
  }
  return true;
}

/** How far a ray goes before a wall (up to `max`). */
export function rayLength(m: GolpeMap, x: number, y: number, a: number, max: number): number {
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  for (let d = 0.1; d < max; d += 0.1) if (isWall(m, x + dx * d, y + dy * d)) return d;
  return max;
}

/** A viewer at (x, y) looking at `a` sees the point. */
export function sees(m: GolpeMap, x: number, y: number, a: number, range: number, half: number, px: number, py: number): boolean {
  const dx = px - x;
  const dy = py - y;
  const d = Math.hypot(dx, dy);
  if (d > range) return false;
  let diff = Math.atan2(dy, dx) - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) > half + Math.min(0.5, 0.25 / Math.max(0.3, d))) return false;
  return lineClear(m, x, y, px, py);
}

/** Distance from a point to a segment. */
export function segDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const k = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - (x1 + vx * k), py - (y1 + vy * k));
}

export function inExit(e: Exit, x: number, y: number): boolean {
  return x >= e.x && x <= e.x + 2 && y >= e.y && y <= e.y + 2;
}

/** Which exits someone may use: all of them, or their team's side. */
export function exitsFor(team: "red" | "blue" | null): number[] {
  return team === "red" ? [0, 1] : team === "blue" ? [2, 3] : [0, 1, 2, 3];
}

/** Where diamond `i` lies after being taken `gen` times. */
export function gemAt(m: GolpeMap, i: number, gen: number): { x: number; y: number } {
  const g = m.gems[i];
  // `room` is the left one; the mirror lands on the same cell seen from the other side.
  const r = m.rooms[g.room];
  const rnd = mulberry32((m.seed ^ Math.imul(g.k + 1, 0x9e3779b1) ^ Math.imul(gen + 1, 0x85ebca6b)) >>> 0);
  // Somewhere inside the room, off its edges; the pair's dice pick both cells.
  const cx = r.x0 + 1 + Math.floor(rnd() * (ROOM - 2));
  const cy = r.y0 + 1 + Math.floor(rnd() * (ROOM - 2));
  const x = cx + 0.5;
  return { x: g.mirror ? m.w - x : x, y: cy + 0.5 };
}

const mirrorRoom = (m: GolpeMap, i: number) => {
  const r = m.rooms[i];
  return r.ry * RX + (RX - 1 - r.rx);
};

// ---- Generation ----------------------------------------------------------------

/** The building for a seed: `rows` = 3 (up to 4 thieves) or 4. */
export function generateMap(seed: number, rows: number): GolpeMap {
  const rnd = mulberry32(seed);
  const RY = rows;
  const w = RX * STEP + 1;
  const h = RY * STEP + 1;
  const wall = new Uint8Array(w * h).fill(1);
  const room = new Int16Array(w * h).fill(-1);
  const rooms: RoomInfo[] = [];
  const vaultRow = RY === 3 ? 1 : 1 + Math.floor(rnd() * 2);
  for (let ry = 0; ry < RY; ry++) {
    for (let rx = 0; rx < RX; rx++) {
      const corner = (rx === 0 || rx === RX - 1) && (ry === 0 || ry === RY - 1);
      const kind: RoomKind = corner ? "entrada" : (rx === 1 || rx === 2) && ry === vaultRow ? "boveda" : "sala";
      const x0 = rx * STEP + 1;
      const y0 = ry * STEP + 1;
      rooms.push({ rx, ry, x0, y0, kind });
      for (let y = y0; y < y0 + ROOM; y++) {
        for (let x = x0; x < x0 + ROOM; x++) {
          wall[y * w + x] = 0;
          room[y * w + x] = ry * RX + rx;
        }
      }
    }
  }
  const ri = (rx: number, ry: number) => ry * RX + rx;

  // Door classes: an edge on the left half and its mirror, or the middle edge alone.
  type Edge = { a: number; b: number; vertical: boolean; rx: number; ry: number };
  const classes: Edge[] = [];
  for (let ry = 0; ry < RY; ry++) {
    classes.push({ a: ri(0, ry), b: ri(1, ry), vertical: true, rx: 0, ry });
    classes.push({ a: ri(1, ry), b: ri(2, ry), vertical: true, rx: 1, ry });
  }
  for (let ry = 0; ry < RY - 1; ry++) {
    for (let rx = 0; rx < 2; rx++) classes.push({ a: ri(rx, ry), b: ri(rx, ry + 1), vertical: false, rx, ry });
  }
  const parent = rooms.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    parent[ra] = rb;
    return true;
  };
  const mirrorOf = (i: number) => mirrorRoom({ rooms } as GolpeMap, i);
  const order = classes.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const used = new Set<number>();
  for (const i of order) {
    const e = classes[i];
    const a = join(e.a, e.b);
    const b = join(mirrorOf(e.a), mirrorOf(e.b));
    if (a || b) used.add(i);
  }
  // A few loops, so there's more than one way around a guard.
  for (const i of order) if (!used.has(i) && rnd() < 0.45) used.add(i);

  const doors: Door[] = [];
  const carve = (x: number, y: number) => {
    wall[y * w + x] = 0;
    room[y * w + x] = -2;
  };
  const doorEdges: { door: Door; a: number; b: number }[] = [];
  for (const i of [...used].sort((p, q) => p - q)) {
    const e = classes[i];
    const off = 1 + Math.floor(rnd() * (ROOM - 3));
    let d: Door;
    if (e.vertical) d = { x: (e.rx + 1) * STEP, y: e.ry * STEP + 1 + off, vertical: true };
    else d = { x: e.rx * STEP + 1 + off, y: (e.ry + 1) * STEP, vertical: false };
    const list: { door: Door; a: number; b: number }[] = [{ door: d, a: e.a, b: e.b }];
    const self = e.vertical && e.rx === 1;
    if (!self) {
      const md: Door = d.vertical ? { x: w - 1 - d.x, y: d.y, vertical: true } : { x: w - 2 - d.x, y: d.y, vertical: false };
      list.push({ door: md, a: mirrorOf(e.a), b: mirrorOf(e.b) });
    }
    for (const it of list) {
      carve(it.door.x, it.door.y);
      if (it.door.vertical) carve(it.door.x, it.door.y + 1);
      else carve(it.door.x + 1, it.door.y);
      doors.push(it.door);
      doorEdges.push(it);
    }
  }

  // Exits in the entrance rooms' outer corners: left top, left bottom, right top, right bottom.
  const exitOf = (rx: number, ry: number): Exit => {
    const r = rooms[ri(rx, ry)];
    const x = rx === 0 ? r.x0 : r.x0 + ROOM - 2;
    const y = ry === 0 ? r.y0 : r.y0 + ROOM - 2;
    return { x, y, sx: x + 1, sy: y + 1 };
  };
  const exits = [exitOf(0, 0), exitOf(0, RY - 1), exitOf(RX - 1, 0), exitOf(RX - 1, RY - 1)];

  // Security and diamonds, on the left rooms and mirrored.
  const guards: Guard[] = [];
  const cams: Cam[] = [];
  const lasers: Laser[] = [];
  const gems: GemDef[] = [];
  const mx = (x: number) => w - x;
  const addGuard = (pts: [number, number][], phase: number, mirrorToo = true) => {
    guards.push(makeGuard(pts, phase));
    if (mirrorToo) guards.push(makeGuard(pts.map(([x, y]) => [mx(x), y] as [number, number]), phase));
  };
  const addCam = (c: Cam) => {
    cams.push(c);
    cams.push({ ...c, x: mx(c.x), base: Math.PI - c.base, amp: -c.amp });
  };
  const loopIn = (r: RoomInfo): [number, number][] => {
    const a = r.x0 + 1.5;
    const b = r.x0 + ROOM - 1.5;
    const c = r.y0 + 1.5;
    const d = r.y0 + ROOM - 1.5;
    const pts: [number, number][] = [
      [a, c],
      [b, c],
      [b, d],
      [a, d],
    ];
    const start = Math.floor(rnd() * 4);
    const rot = [...pts.slice(start), ...pts.slice(0, start)];
    return rnd() < 0.5 ? rot : rot.reverse();
  };
  const camIn = (r: RoomInfo) => {
    const corner = Math.floor(rnd() * 4);
    const x = r.x0 + (corner & 1 ? ROOM - 0.3 : 0.3);
    const y = r.y0 + (corner & 2 ? ROOM - 0.3 : 0.3);
    const cx = r.x0 + ROOM / 2;
    const cy = r.y0 + ROOM / 2;
    return { x, y, base: Math.atan2(cy - y, cx - x), amp: 0.72, period: 5 + rnd() * 3, phase: rnd() * 8 };
  };
  let k = 0;
  const addGems = (i: number, n: number, value: number) => {
    for (let j = 0; j < n; j++) {
      gems.push({ room: i, value, k, mirror: false });
      gems.push({ room: i, value, k, mirror: true });
      k++;
    }
  };
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (r.rx > 1 || r.kind === "entrada") continue;
    if (r.kind === "boveda") {
      addGuard(loopIn(r), rnd());
      addCam(camIn(r));
      addGems(i, 2, BIG_GEM);
      continue;
    }
    const roll = rnd();
    if (roll < 0.4) addGuard(loopIn(r), rnd());
    else if (roll < 0.75) addCam(camIn(r));
    else if (roll < 0.92) {
      addGuard(loopIn(r), rnd());
      addCam(camIn(r));
    }
    addGems(i, 3, 1);
  }
  // Guards that walk between two rooms through their door (left half only, mirrored).
  for (const { door, a, b } of doorEdges) {
    const ra = rooms[a];
    const rb = rooms[b];
    if (ra.kind !== "sala" || rb.kind !== "sala" || ra.rx > 1 || rb.rx > 1) continue;
    if (rnd() > 0.4) continue;
    const dx = door.vertical ? door.x + 0.5 : door.x + 1;
    const dy = door.vertical ? door.y + 1 : door.y + 0.5;
    const ca: [number, number] = [ra.x0 + ROOM / 2, ra.y0 + ROOM / 2];
    const cb: [number, number] = [rb.x0 + ROOM / 2, rb.y0 + ROOM / 2];
    addGuard([ca, [dx, dy], cb, [dx, dy]], rnd());
  }
  // Lasers: every vault door, and some others away from the entrances.
  for (const { door, a, b } of doorEdges) {
    if (door.x > w / 2) continue;
    const ka = rooms[a].kind;
    const kb = rooms[b].kind;
    if (ka === "entrada" || kb === "entrada") continue;
    if (ka !== "boveda" && kb !== "boveda" && rnd() > 0.3) continue;
    const l: Laser = door.vertical
      ? { x1: door.x + 0.5, y1: door.y, x2: door.x + 0.5, y2: door.y + 2, period: 3.4 + rnd() * 1.6, on: 0, phase: rnd() * 5 }
      : { x1: door.x, y1: door.y + 0.5, x2: door.x + 2, y2: door.y + 0.5, period: 3.4 + rnd() * 1.6, on: 0, phase: rnd() * 5 };
    l.on = l.period * 0.5;
    lasers.push(l);
    // The middle door (on the axis) is its own mirror.
    if (!(door.vertical && door.x * 2 === w - 1)) lasers.push({ ...l, x1: mx(l.x1), x2: mx(l.x2) });
  }

  return { w, h, rows: RY, wall, room, rooms, doors, exits, guards, cams, lasers, gems, seed };
}
