/**
 * Arena medieval's maps (pure, no DOM): the ground under each fighter, what
 * blocks it, where people start, where the weapons lie, the hill of «Rey de
 * la colina», the traps and the mid-round events. Everything here is a
 * function of the map and the round's seed and clock, so every phone (and the
 * big screen) sees the same battle without sending any of it.
 *
 * Maps are fair for red (−x) and blue (+x): everything is mirrored through
 * the middle, (x, z) → (−x, −z).
 */

import { mulberry32 } from "./random";
import type { ItemKind } from "./arenaSim";

export type ArenaMapId = "coliseo" | "puente" | "patio" | "bosque" | "trampas";
/** Every map (rooms store the id by name, so order doesn't matter for old rooms). */
export const MAP_IDS: ArenaMapId[] = ["coliseo", "puente", "patio", "bosque", "trampas"];
/** The room's choice: a map, or a different one each match. */
export type MapChoice = ArenaMapId | "azar";

/** Highest ledge a fighter walks up without jumping (m). Rails are taller than a jump plus this. */
export const STEP_UP = 0.35;
/** Fighters this far below their ledge fell into the void. */
export const FALL_DEPTH = 2.5;

/** A round thing that blocks: pillars, trunks, rocks. `h` absent = tall (stops arrows at any height). */
export interface Circle {
  x: number;
  z: number;
  r: number;
  h?: number;
}

/**
 * A box on the map: walls, walkways, crates, a bridge's deck, rails. Its top
 * is `h` (a ramp rises from 0 at one end to `h` at the side it names); below
 * `b` there's nothing (under a bridge). A top within `STEP_UP` of your feet is
 * ground you can walk onto; a higher one is a wall.
 */
export interface Block {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h: number;
  b?: number;
  ramp?: "x+" | "x-" | "z+" | "z-";
  /** What it looks like (lib/arena3dMaps.ts). */
  look?: "wall" | "walk" | "crate" | "stack" | "deck" | "rail" | "plat" | "ramp";
}

export type Trap =
  /** A fire grate (a square of `half` m) that burns while on: `on` seconds of every `period`, shifted by `phase`. */
  | { kind: "fuego"; x: number; z: number; half: number; period: number; on: number; phase: number }
  /** A blade that turns around (x, z), `len` m each way, at `speed` rad/s, `top` m high (jump it). */
  | { kind: "cuchilla"; x: number; z: number; len: number; speed: number; top: number };

export interface ArenaMap {
  id: ArenaMapId;
  label: string;
  hint: string;
  bounds: { kind: "circle"; r: number } | { kind: "rect"; hx: number; hz: number };
  /** No floor besides the blocks: off them you fall. */
  chasm?: boolean;
  /** Uneven ground: its height. */
  terrain?: (x: number, z: number) => number;
  circles: Circle[];
  blocks: Block[];
  /** Red's starting line (blue's is its mirror), facing the middle. */
  spawnX: number;
  /** «Todos contra todos»: up to 8 starting spots, in mirrored pairs. */
  ffa: [number, number][];
  /** Weapon spots on red's half (blue's are their mirror), potions, and the heavy one in the middle. */
  items: [number, number][];
  potions: [number, number][];
  center: [number, number];
  hill: { x: number; z: number; r: number };
  traps: Trap[];
  /** «La arena se achica» starts from this radius (0: not on this map). */
  ring: number;
  /** Walking spots for the bots' routes around walls. */
  nav: [number, number][];
  /** Knockback is this much stronger (the bridge: pushes matter). */
  pushMul: number;
  /** How far the map reaches from the middle (cameras). */
  extent: number;
}

const mirror = <T extends { x: number; z: number }>(list: T[]): T[] => [...list, ...list.map((c) => ({ ...c, x: -c.x, z: -c.z }))];
const mirrorBlocks = (list: Block[]): Block[] => [
  ...list,
  ...list.map((b) => ({
    ...b,
    x0: -b.x1,
    x1: -b.x0,
    z0: -b.z1,
    z1: -b.z0,
    ramp: b.ramp ? (({ "x+": "x-", "x-": "x+", "z+": "z-", "z-": "z+" } as const)[b.ramp]) : undefined,
  })),
];
const ring = (r: number, degs: number[]): [number, number][] =>
  degs.map((d) => {
    const a = (d * Math.PI) / 180;
    return [Math.round(Math.cos(a) * r * 100) / 100, Math.round(Math.sin(a) * r * 100) / 100];
  });

const COLISEO: ArenaMap = {
  id: "coliseo",
  label: "Coliseo",
  hint: "La arena redonda de siempre, con columnas para cubrirte.",
  bounds: { kind: "circle", r: 17 },
  circles: ring(8.5, [30, 90, 150, 210, 270, 330]).map(([x, z]) => ({ x, z, r: 0.9 })),
  blocks: [],
  spawnX: 14.5,
  ffa: ring(12.5, [0, 180, 45, 225, 90, 270, 135, 315]),
  items: [
    [-11, 6.5],
    [-11, -6.5],
    [-5.5, 3],
    [-5.5, -3],
    [-4, 11],
    [-4, -11],
  ],
  potions: [
    [-8.5, 0],
    [-1.5, 13.5],
  ],
  center: [0, 0],
  hill: { x: 0, z: 0, r: 3.2 },
  traps: [],
  ring: 17,
  nav: [],
  pushMul: 1,
  extent: 17,
};

const TRAMPAS: ArenaMap = {
  id: "trampas",
  label: "Foso de trampas",
  hint: "Rejillas de fuego que se prenden y se apagan, y una cuchilla que gira en el centro: sáltala.",
  bounds: { kind: "circle", r: 16 },
  circles: [
    { x: -7.5, z: -7.5, r: 0.9 },
    { x: 7.5, z: 7.5, r: 0.9 },
    { x: -7.5, z: 7.5, r: 0.9 },
    { x: 7.5, z: -7.5, r: 0.9 },
  ],
  blocks: [],
  spawnX: 13,
  ffa: ring(13, [30, 210, 150, 330, 90, 270, 0, 180]),
  items: [
    [-11, 6.5],
    [-11, -6.5],
    [-5.5, 4],
    [-5.5, -4],
    [-3, 12],
    [-3, -12],
  ],
  potions: [
    [-12.5, 0],
    [-9.5, 9.5],
  ],
  center: [0, 0],
  hill: { x: 0, z: 0, r: 3 },
  traps: [
    { kind: "cuchilla", x: 0, z: 0, len: 4.2, speed: 1.15, top: 0.6 },
    ...[
      { x: -9, z: 0, phase: 0 },
      { x: 9, z: 0, phase: 0 },
      { x: 0, z: -9, phase: 3.5 },
      { x: 0, z: 9, phase: 3.5 },
      { x: -5, z: 11, phase: 1.75 },
      { x: 5, z: -11, phase: 1.75 },
      { x: 5, z: 11, phase: 5.25 },
      { x: -5, z: -11, phase: 5.25 },
    ].map((g) => ({ kind: "fuego" as const, x: g.x, z: g.z, half: 1.5, period: 7, on: 3, phase: g.phase })),
  ],
  ring: 16,
  nav: [],
  pushMul: 1,
  extent: 16,
};

/** The bridge's rails: pieces with gaps between them, on both sides. */
const RAIL_SPANS: [number, number][] = [
  [-16.2, -12.4],
  [-10, -6.4],
  [-4, -1.2],
  [1.2, 4],
  [6.4, 10],
  [12.4, 16.2],
];

const PUENTE: ArenaMap = {
  id: "puente",
  label: "Puente",
  hint: "Un puente angosto sobre el abismo: la baranda tiene huecos y quien cae por ellos queda afuera. Las patadas empujan más.",
  bounds: { kind: "rect", hx: 27.5, hz: 7.5 },
  chasm: true,
  circles: mirror([
    { x: -18.5, z: 3.8, r: 0.7 },
    { x: -18.5, z: -3.8, r: 0.7 },
  ]),
  blocks: [
    { x0: -16.2, x1: 16.2, z0: -2.5, z1: 2.5, h: 0, b: -1.5, look: "deck" },
    ...RAIL_SPANS.flatMap(([x0, x1]): Block[] => [
      { x0, x1, z0: 2.5, z1: 2.85, h: 1.4, b: -1.5, look: "rail" },
      { x0, x1, z0: -2.85, z1: -2.5, h: 1.4, b: -1.5, look: "rail" },
    ]),
    ...mirrorBlocks([
      { x0: -27, x1: -16, z0: -6, z1: 6, h: 0, b: -4, look: "plat" },
      // Battlements around the platform: the back, the sides, and the front's corners (a hole next to the bridge on each side).
      { x0: -27.1, x1: -26.5, z0: -6, z1: 6, h: 1.4, b: -4, look: "wall" },
      { x0: -27, x1: -16, z0: 5.5, z1: 6.1, h: 1.4, b: -4, look: "wall" },
      { x0: -27, x1: -16, z0: -6.1, z1: -5.5, h: 1.4, b: -4, look: "wall" },
      { x0: -16.5, x1: -16, z0: 4, z1: 6, h: 1.4, b: -4, look: "wall" },
      { x0: -16.5, x1: -16, z0: -6, z1: -4, h: 1.4, b: -4, look: "wall" },
    ]),
  ],
  spawnX: 23.5,
  ffa: [
    [-24, 3.5],
    [24, -3.5],
    [-24, -3.5],
    [24, 3.5],
    [-13, 0],
    [13, 0],
    [-6, 0],
    [6, 0],
  ],
  items: [
    [-22.5, 4.6],
    [-22.5, -4.6],
    [-14, 1.2],
    [-8.5, -1.2],
    [-25.3, 0],
    [-4.5, 1.2],
  ],
  potions: [
    [-19.8, 0],
    [-11, -1.3],
  ],
  center: [0, 0],
  hill: { x: 0, z: 0, r: 2.4 },
  traps: [],
  ring: 0,
  nav: [],
  pushMul: 1.35,
  extent: 27,
};

const PATIO: ArenaMap = {
  id: "patio",
  label: "Patio del castillo",
  hint: "Muros altos, cajas para cubrirte (las bajas se pueden saltar) y pasarelas a las que se sube por rampas.",
  bounds: { kind: "rect", hx: 18, hz: 14 },
  circles: [],
  blocks: mirrorBlocks([
    // The walkway along the north wall (its mirror is the south one) and its two ramps.
    { x0: -18, x1: 0, z0: -14, z1: -10, h: 1.8, look: "walk" },
    { x0: 0, x1: 18, z0: -14, z1: -10, h: 1.8, look: "walk" },
    { x0: -12, x1: -10, z0: -10, z1: -5.5, h: 1.8, ramp: "z-", look: "ramp" },
    { x0: 10, x1: 12, z0: -10, z1: -5.5, h: 1.8, ramp: "z-", look: "ramp" },
    // Crates: low ones you jump on, tall stacks you hide behind.
    { x0: -6.7, x1: -5.3, z0: -3.2, z1: -1.8, h: 0.95, look: "crate" },
    { x0: -6.7, x1: -5.3, z0: 3.8, z1: 5.2, h: 0.95, look: "crate" },
    { x0: -11.7, x1: -10.3, z0: 1.3, z1: 2.7, h: 0.95, look: "crate" },
    { x0: -3.8, x1: -2.2, z0: -6.3, z1: -4.7, h: 2.1, look: "stack" },
    { x0: -14.5, x1: -13.1, z0: -7.7, z1: -6.3, h: 2.1, look: "stack" },
  ]),
  spawnX: 15.5,
  ffa: [
    [-15, -3],
    [15, 3],
    [-15, 4],
    [15, -4],
    [-6, -12],
    [6, 12],
    [0, -7],
    [0, 7],
  ],
  items: [
    [-15, -12],
    [-6, -12],
    [-9, 0],
    [-6, 7.5],
    [-13.5, 6],
    [-2.5, -2.5],
  ],
  potions: [
    [-16, 12],
    [-8, -7.5],
  ],
  center: [0, 0],
  hill: { x: 0, z: 0, r: 3.2 },
  traps: [],
  ring: 0,
  nav: [
    [0, 0],
    [-7.5, 0],
    [7.5, 0],
    [-14, 0],
    [14, 0],
    [0, -7.5],
    [0, 7.5],
    [-11, -4.7],
    [11, -4.7],
    [-11, 4.7],
    [11, 4.7],
    [-11, -11.5],
    [11, -11.5],
    [-11, 11.5],
    [11, 11.5],
    [-16, -12],
    [16, -12],
    [-16, 12],
    [16, 12],
    [-5, -12],
    [5, -12],
    [-5, 12],
    [5, 12],
    [0, -12],
    [0, 12],
  ],
  pushMul: 1,
  extent: 18,
};

/** The forest's uneven ground: soft bumps, rising toward the edge. Symmetric through the middle. */
function forestGround(x: number, z: number): number {
  const r = Math.hypot(x, z);
  return 0.35 * Math.cos(0.28 * x) * Math.cos(0.23 * z) + 0.25 * Math.sin(0.19 * x) * Math.sin(0.27 * z) + 0.9 * Math.max(0, r - 14) / 4 - 0.2;
}

const BOSQUE: ArenaMap = {
  id: "bosque",
  label: "Bosque",
  hint: "Un claro entre troncos gruesos y rocas, con el suelo desparejo. Ideal para emboscadas.",
  bounds: { kind: "circle", r: 18 },
  terrain: forestGround,
  circles: mirror([
    { x: -8, z: 4, r: 0.7 },
    { x: -11.5, z: -6.5, r: 0.6 },
    { x: -6, z: -8.5, r: 0.75 },
    { x: -3.5, z: 6.5, r: 0.6 },
    { x: -14, z: 8.5, r: 0.7 },
    { x: -9, z: 12, r: 0.65 },
    { x: -4.5, z: 13.8, r: 0.6 },
    { x: -1.5, z: -11, r: 0.7 },
    { x: -12.8, z: 1.4, r: 0.55 },
    { x: -15.5, z: -8.5, r: 0.7 },
    // Rocks: low, a bow shoots over them.
    { x: -7, z: -2.5, r: 1.2, h: 1.1 },
    { x: -10.5, z: 8.5, r: 1.0, h: 1.0 },
    { x: -3, z: -5.8, r: 1.1, h: 1.1 },
  ]),
  blocks: [],
  spawnX: 15,
  ffa: ring(13, [20, 200, 110, 290, 65, 245, 155, 335]),
  items: [
    [-12, 4.5],
    [-12, -3.8],
    [-6, 0.8],
    [-4, 10],
    [-4.5, -10],
    [-9.5, -11.5],
  ],
  potions: [
    [-8.5, 7.5],
    [-1, -15],
  ],
  center: [0, 0],
  hill: { x: 0, z: 0, r: 3.2 },
  traps: [],
  ring: 18,
  nav: [],
  pushMul: 1,
  extent: 18,
};

export const MAPS: Record<ArenaMapId, ArenaMap> = { coliseo: COLISEO, puente: PUENTE, patio: PATIO, bosque: BOSQUE, trampas: TRAMPAS };

/** A map by id (an unknown one — a newer client's — is the coliseum). */
export function getMap(id: string | undefined): ArenaMap {
  return MAPS[id as ArenaMapId] ?? COLISEO;
}

/** «Al azar»: the match's map from its seed. */
export function pickMap(choice: MapChoice | undefined, seed: number): ArenaMapId {
  if (choice && choice !== "azar" && choice in MAPS) return choice;
  return MAP_IDS[Math.floor(mulberry32(seed ^ 0x5bd1e995)() * MAP_IDS.length)];
}

// ---- Ground and walls ----------------------------------------------------------

function blockTop(b: Block, x: number, z: number): number {
  if (!b.ramp) return b.h;
  const cx = Math.max(b.x0, Math.min(b.x1, x));
  const cz = Math.max(b.z0, Math.min(b.z1, z));
  const k =
    b.ramp === "x+" ? (cx - b.x0) / (b.x1 - b.x0) : b.ramp === "x-" ? (b.x1 - cx) / (b.x1 - b.x0) : b.ramp === "z+" ? (cz - b.z0) / (b.z1 - b.z0) : (b.z1 - cz) / (b.z1 - b.z0);
  return b.h * k;
}

/** The ground's height with no blocks (−∞ over a chasm). */
export function baseGround(map: ArenaMap, x: number, z: number): number {
  if (map.chasm) return -Infinity;
  return map.terrain ? map.terrain(x, z) : 0;
}

/** What holds up someone whose feet are at `y` over (x, z): the highest ground within a step of them (−∞: the void). */
export function supportAt(map: ArenaMap, x: number, z: number, y: number): number {
  let best = baseGround(map, x, z);
  for (const b of map.blocks) {
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    const top = blockTop(b, x, z);
    if (top <= y + STEP_UP && top > best) best = top;
  }
  return best;
}

/** The highest ground at (x, z), whatever the height (where something dropped from the sky lands). */
export function topAt(map: ArenaMap, x: number, z: number): number {
  return supportAt(map, x, z, 1000);
}

/** Does a block stop a fighter of radius `r` at (x, z) with its feet at `y`? */
export function blockedAt(map: ArenaMap, x: number, z: number, y: number, r: number): boolean {
  for (const b of map.blocks) {
    if (x <= b.x0 - r || x >= b.x1 + r || z <= b.z0 - r || z >= b.z1 + r) continue;
    if (b.b !== undefined && b.b >= y + 1.8) continue;
    if (blockTop(b, x, z) > y + STEP_UP) return true;
  }
  return false;
}

/** Keeps a point inside the map's edge (a wall, or the void's invisible limit) and out of the round things. */
export function clampToMap(map: ArenaMap, p: { x: number; z: number }, r: number, circles: { x: number; z: number; r: number }[] = map.circles) {
  if (map.bounds.kind === "circle") {
    const limit = map.bounds.r - r;
    const d = Math.hypot(p.x, p.z);
    if (d > limit) {
      p.x *= limit / d;
      p.z *= limit / d;
    }
  } else {
    p.x = Math.max(-map.bounds.hx + r, Math.min(map.bounds.hx - r, p.x));
    p.z = Math.max(-map.bounds.hz + r, Math.min(map.bounds.hz - r, p.z));
  }
  for (const s of circles) {
    const dx = p.x - s.x;
    const dz = p.z - s.z;
    const dist = Math.hypot(dx, dz);
    const min = s.r + r;
    if (dist < min && dist > 1e-6) {
      p.x = s.x + (dx / dist) * min;
      p.z = s.z + (dz / dist) * min;
    }
  }
}

export function insideBounds(map: ArenaMap, x: number, z: number, margin = 0): boolean {
  return map.bounds.kind === "circle" ? Math.hypot(x, z) < map.bounds.r - margin : Math.abs(x) < map.bounds.hx - margin && Math.abs(z) < map.bounds.hz - margin;
}

/** Is there something tall between two points (pillars, trunks, walls), seen at height `y`? */
export function sightBlocked(map: ArenaMap, ax: number, az: number, bx: number, bz: number, y = 0): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  for (const c of map.circles) {
    if (c.h !== undefined && c.h < y + 1.0) continue;
    const t = Math.max(0, Math.min(1, ((c.x - ax) * dx + (c.z - az) * dz) / len2));
    if (Math.hypot(ax + dx * t - c.x, az + dz * t - c.z) < c.r * 0.8) return true;
  }
  for (const b of map.blocks) {
    if (blockTop(b, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2) < y + 1.2 || b.ramp) continue;
    // Slab test of the segment against the box (a little smaller).
    let t0 = 0;
    let t1 = 1;
    const m = 0.1;
    const slabs: [number, number, number, number][] = [
      [ax, dx, b.x0 + m, b.x1 - m],
      [az, dz, b.z0 + m, b.z1 - m],
    ];
    let hit = true;
    for (const [o, d, lo, hi] of slabs) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) hit = false;
        continue;
      }
      let ta = (lo - o) / d;
      let tb = (hi - o) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
    }
    if (hit && t0 <= t1) return true;
  }
  return false;
}

/** Does something flying through (x, y, z) hit the map (ground, a wall, a pillar, the edge)? */
export function solidAt(map: ArenaMap, x: number, y: number, z: number): boolean {
  if (y < -30) return true;
  if (!map.chasm && !insideBounds(map, x, z)) return true;
  if (map.chasm && !insideBounds(map, x, z, -6)) return true;
  if (y <= baseGround(map, x, z)) return true;
  for (const b of map.blocks) {
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    if (y <= blockTop(b, x, z) && (b.b === undefined || y >= b.b)) return true;
  }
  for (const c of map.circles) if (y < (c.h ?? 99) && Math.hypot(x - c.x, z - c.z) < c.r) return true;
  return false;
}

/** Is (x, z) over the void for someone at `y` (or a big drop)? */
export function isVoid(map: ArenaMap, x: number, z: number, y: number): boolean {
  const s = supportAt(map, x, z, y);
  return !Number.isFinite(s) || y - s > FALL_DEPTH;
}

// ---- Spawns and items --------------------------------------------------------------

const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);

/** Where fighter `i` of a team of `n` starts (side −1 red, 1 blue), facing the middle: rows of four. */
export function teamSpawn(map: ArenaMap, side: -1 | 1, i: number, n: number): { x: number; z: number; yaw: number } {
  const row = Math.floor(i / 4);
  const inRow = Math.min(4, n - row * 4);
  const z = ((i % 4) - (inRow - 1) / 2) * 2.4 * side;
  return { x: side * (map.spawnX - row * 2.2), z, yaw: yawTo(-side, 0) };
}

/** «Todos contra todos»: fighter `i` starts at its own spot, facing the middle. */
export function ffaSpawn(map: ArenaMap, i: number): { x: number; z: number; yaw: number } {
  const [x, z] = map.ffa[i % map.ffa.length];
  // More than 8 (never, but just in case): a little to the side.
  const off = Math.floor(i / map.ffa.length) * 1.2;
  return { x: x + off, z, yaw: yawTo(-x, -z) };
}

// ---- Walking routes (bots) -----------------------------------------------------------

/** Can a fighter walk straight from a to b (no wall, no void; drops are fine)? */
export function canWalk(map: ArenaMap, ax: number, az: number, ay: number, bx: number, bz: number, r = 0.38): boolean {
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(d / 0.35));
  let y = ay;
  for (let k = 1; k <= steps; k++) {
    const x = ax + ((bx - ax) * k) / steps;
    const z = az + ((bz - az) * k) / steps;
    if (blockedAt(map, x, z, y, r)) return false;
    const s = supportAt(map, x, z, y);
    if (!Number.isFinite(s) || y - s > FALL_DEPTH) return false;
    y = s;
  }
  return true;
}

interface Nav {
  nodes: { x: number; z: number; y: number }[];
  /** Directed: from i you can walk to j (dist), or −1. */
  dist: number[][];
}
const navCache = new Map<ArenaMapId, Nav>();

function navOf(map: ArenaMap): Nav | null {
  if (!map.nav.length) return null;
  let nav = navCache.get(map.id);
  if (!nav) {
    const nodes = map.nav.map(([x, z]) => ({ x, z, y: topAt(map, x, z) }));
    const dist = nodes.map((a) => nodes.map((b) => (a === b ? 0 : canWalk(map, a.x, a.z, a.y, b.x, b.z) ? Math.hypot(b.x - a.x, b.z - a.z) : -1)));
    nav = { nodes, dist };
    navCache.set(map.id, nav);
  }
  return nav;
}

/**
 * Where to head to reach (tx, tz) from (fx, fz) at height fy: null when the
 * way is straight, else the next spot of the shortest route through the
 * map's walking spots (around walls, up the ramps).
 */
export function routeStep(map: ArenaMap, fx: number, fz: number, fy: number, tx: number, tz: number, ty: number): [number, number] | null {
  if (canWalk(map, fx, fz, fy, tx, tz)) return null;
  const nav = navOf(map);
  if (!nav) return null;
  const n = nav.nodes.length;
  const best = new Array<number>(n).fill(Infinity);
  const first = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const a = nav.nodes[i];
    if (Math.abs(a.y - fy) > 2.6 && a.y > fy) continue;
    if (canWalk(map, fx, fz, fy, a.x, a.z)) {
      best[i] = Math.hypot(a.x - fx, a.z - fz);
      first[i] = i;
    }
  }
  const done = new Array<boolean>(n).fill(false);
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && best[i] < Infinity && (u < 0 || best[i] < best[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      const d = nav.dist[u][v];
      if (d < 0 || done[v]) continue;
      if (best[u] + d < best[v]) {
        best[v] = best[u] + d;
        first[v] = first[u];
      }
    }
  }
  let pick = -1;
  let pickCost = Infinity;
  for (let i = 0; i < n; i++) {
    if (best[i] === Infinity) continue;
    const a = nav.nodes[i];
    const rest = Math.hypot(tx - a.x, tz - a.z);
    const cost = best[i] + rest + (canWalk(map, a.x, a.z, a.y, tx, tz) && Math.abs(a.y - ty) < 1 ? 0 : 30);
    if (cost < pickCost) {
      pickCost = cost;
      pick = i;
    }
  }
  if (pick < 0 || first[pick] < 0) return null;
  const f = nav.nodes[first[pick]];
  // Already there: aim for the next one along.
  if (Math.hypot(f.x - fx, f.z - fz) < 0.8 && pick !== first[pick]) return [nav.nodes[pick].x, nav.nodes[pick].z];
  return [f.x, f.z];
}

// ---- Traps -------------------------------------------------------------------------

/** Damage a fire grate does every `GRATE_TICK` seconds you stand on it while it burns. */
export const GRATE_DAMAGE = 7;
export const GRATE_TICK = 0.5;
/** A grate glows this long before it lights up. */
export const GRATE_WARN = 1.2;
/** The blade: damage per touch (at most one a second) and its push. */
export const BLADE_DAMAGE = 16;
export const BLADE_PUSH = 9;

/** Is a grate burning `t` seconds into the round (and is it about to)? */
export function grateState(g: Extract<Trap, { kind: "fuego" }>, t: number): { on: boolean; warn: boolean; k: number } {
  if (t < 0) return { on: false, warn: false, k: 0 };
  const c = (((t + g.phase) % g.period) + g.period) % g.period;
  const on = c < g.on;
  const warn = !on && c > g.period - GRATE_WARN;
  return { on, warn, k: on ? c / g.on : warn ? (c - (g.period - GRATE_WARN)) / GRATE_WARN : 0 };
}

export function bladeAngle(b: Extract<Trap, { kind: "cuchilla" }>, t: number): number {
  return Math.max(0, t) * b.speed;
}

export interface TrapHit {
  /** Source key (one damage per source and tick). */
  src: string;
  /** The tick it belongs to (increasing). */
  tag: number;
  damage: number;
  /** Push away (m/s), for the blade. */
  push?: [number, number];
}

/** What hurts someone at (x, y, z) `t` seconds into the round (feet height above the ground in `lift`). */
export function trapHits(map: ArenaMap, t: number, x: number, z: number, lift: number, r: number): TrapHit[] {
  const out: TrapHit[] = [];
  if (t < 0) return out;
  map.traps.forEach((tr, i) => {
    if (tr.kind === "fuego") {
      if (lift > 0.3 || Math.abs(x - tr.x) > tr.half || Math.abs(z - tr.z) > tr.half) return;
      if (grateState(tr, t).on) out.push({ src: `t${i}`, tag: Math.floor(t / GRATE_TICK), damage: GRATE_DAMAGE });
    } else {
      if (lift > tr.top) return;
      const dx = x - tr.x;
      const dz = z - tr.z;
      const d = Math.hypot(dx, dz);
      if (d > tr.len + r) return;
      const a = bladeAngle(tr, t);
      // Distance to the blade's line (both arms).
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      const across = Math.abs(dx * -uz + dz * ux);
      if (across > r + 0.2) return;
      const n = d || 1;
      out.push({ src: `t${i}`, tag: Math.floor(t), damage: BLADE_DAMAGE, push: [(dx / n) * BLADE_PUSH, (dz / n) * BLADE_PUSH] });
    }
  });
  return out;
}

/** For bots: is (x, z) dangerous now or within `ahead` seconds (a grate about to burn, the blade's sweep unless `jumpBlade`)? */
export function trapDanger(map: ArenaMap, t: number, x: number, z: number, ahead = 1.2, jumpBlade = false): boolean {
  for (const tr of map.traps) {
    if (tr.kind === "fuego") {
      if (Math.abs(x - tr.x) > tr.half + 0.5 || Math.abs(z - tr.z) > tr.half + 0.5) continue;
      if (grateState(tr, t).on || grateState(tr, t + ahead).on) return true;
    } else if (!jumpBlade) {
      const dx = x - tr.x;
      const dz = z - tr.z;
      const d = Math.hypot(dx, dz);
      if (d > tr.len + 0.9) continue;
      // The arm sweeping toward this spot soon.
      for (const dt of [0, ahead * 0.5, ahead]) {
        const a = bladeAngle(tr, t + dt);
        if (Math.abs(dx * -Math.sin(a) + dz * Math.cos(a)) < 1.2) return true;
      }
    }
  }
  return false;
}

/** For bots: the blade is about to sweep through (x, z) — time to jump. */
export function bladeIncoming(map: ArenaMap, t: number, x: number, z: number, within = 0.32): boolean {
  for (const tr of map.traps) {
    if (tr.kind !== "cuchilla") continue;
    const dx = x - tr.x;
    const dz = z - tr.z;
    if (Math.hypot(dx, dz) > tr.len + 0.6) continue;
    for (const dt of [0.12, within * 0.6, within]) {
      const a = bladeAngle(tr, t + dt);
      if (Math.abs(dx * -Math.sin(a) + dz * Math.cos(a)) < 0.75) return true;
    }
  }
  return false;
}

// ---- «Rey de la colina» --------------------------------------------------------------

/** Who holds the hill: the side alone in it, "contest" if more than one, "" if nobody. */
export function hillHolder(map: ArenaMap, fighters: { side: string; x: number; z: number; y: number; alive: boolean }[]): string {
  const h = map.hill;
  const ground = topAt(map, h.x, h.z);
  let side = "";
  for (const f of fighters) {
    if (!f.alive || Math.hypot(f.x - h.x, f.z - h.z) > h.r || f.y - ground > 1.5) continue;
    if (side && side !== f.side) return "contest";
    side = f.side;
  }
  return side;
}

// ---- Mid-round events ------------------------------------------------------------------

export type EventKind = "lluvia" | "armas" | "achica" | "niebla";

export const EVENT_INFO: Record<EventKind, { title: string; sub: string }> = {
  lluvia: { title: "¡Lluvia de flechas!", sub: "Sal de los círculos rojos (un escudo levantado te cubre)" },
  armas: { title: "¡La tribuna tira armas!", sub: "Corre a buscarlas" },
  achica: { title: "¡La arena se achica!", sub: "Afuera del anillo de fuego pierdes vida" },
  niebla: { title: "¡Niebla!", sub: "No se ve más allá de unos metros" },
};

export interface ArenaEvent {
  /** Index in the round (event items and rain use it). */
  n: number;
  kind: EventKind;
  /** Seconds into the round it starts, and how long it lasts. */
  at: number;
  len: number;
}

/** The banner shows this long before an event starts (and rain circles too). */
export const EVENT_LEAD = 3;
const LEN: Record<EventKind, number> = { lluvia: 10, armas: 4, achica: 36, niebla: 22 };

/**
 * The events of a round, from its seed: the first 25–35 s in, then one every
 * 30–45 s, never the same twice in a row; the ring only on round maps and
 * once per round.
 */
export function roundEvents(map: ArenaMap, seed: number, key: number, seconds: number): ArenaEvent[] {
  const rand = mulberry32((seed ^ Math.imul(key + 7, 0x27d4eb2f)) >>> 0);
  const out: ArenaEvent[] = [];
  let t = 25 + rand() * 10;
  let last: EventKind | null = null;
  let ringDone = false;
  while (t < seconds - 12 && out.length < 40) {
    const options = (["lluvia", "armas", "achica", "niebla"] as EventKind[]).filter(
      (k) => k !== last && (k !== "achica" || (map.ring > 0 && !ringDone && t + LEN.achica < seconds))
    );
    const kind = options[Math.floor(rand() * options.length)];
    if (kind === "achica") ringDone = true;
    out.push({ n: out.length, kind, at: Math.round(t * 10) / 10, len: LEN[kind] });
    last = kind;
    t += LEN[kind] + 22 + rand() * 15;
  }
  return out;
}

/** The event on at `t` (or about to start, within `EVENT_LEAD`), if any. */
export function eventAt(events: ArenaEvent[], t: number, lead = 0): ArenaEvent | null {
  for (const e of events) if (t >= e.at - lead && t < e.at + e.len) return e;
  return null;
}

/** A random spot where people can stand, from `rand`. */
function standSpot(map: ArenaMap, rand: () => number): [number, number] {
  for (let k = 0; k < 40; k++) {
    let x: number;
    let z: number;
    if (map.bounds.kind === "circle") {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * (map.bounds.r - 1.5);
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    } else {
      x = (rand() * 2 - 1) * (map.bounds.hx - 1.5);
      z = (rand() * 2 - 1) * (map.bounds.hz - 1.5);
    }
    const top = topAt(map, x, z);
    if (!Number.isFinite(top) || top > 2) continue;
    if (map.circles.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 0.8)) continue;
    return [Math.round(x * 10) / 10, Math.round(z * 10) / 10];
  }
  return [0, 0];
}

/** Arrow rain: where and when each volley lands (seconds into the round). Three volleys, five circles each. */
export const RAIN_R = 2.3;
export const RAIN_DAMAGE = 22;
export interface RainDrop {
  x: number;
  z: number;
  /** When it lands (s into the round); its circle shows `EVENT_LEAD` before. */
  t: number;
}

export function rainDrops(map: ArenaMap, seed: number, ev: ArenaEvent): RainDrop[] {
  const rand = mulberry32((seed ^ Math.imul(ev.n + 31, 0x9e3779b1)) >>> 0);
  const out: RainDrop[] = [];
  for (let v = 0; v < 3; v++) {
    const t = ev.at + 2 + v * 3;
    for (let i = 0; i < 5; i++) {
      const [x, z] = standSpot(map, rand);
      out.push({ x, z, t: Math.round(t * 10) / 10 + i * 0.08 });
    }
  }
  return out;
}

/** «La arena se achica»: the ring's radius `t` s into the round (null: no ring). It closes in 16 s, holds, and opens again in 4. */
export const RING_DAMAGE = 5;
export const RING_MIN = 6.5;
export function ringRadius(map: ArenaMap, events: ArenaEvent[], t: number): number | null {
  const e = events.find((x) => x.kind === "achica" && t >= x.at && t < x.at + x.len);
  if (!e || !map.ring) return null;
  const into = t - e.at;
  const full = map.ring + 0.5;
  const closing = Math.min(1, into / 16);
  const opening = Math.max(0, (into - (e.len - 4)) / 4);
  const k = closing * (1 - opening);
  return full - (full - RING_MIN) * (k * k * (3 - 2 * k));
}

/** «Niebla»: how thick (0–1) `t` s into the round, rolling in and out over 3 s. */
export function fogAt(events: ArenaEvent[], t: number): number {
  const e = events.find((x) => x.kind === "niebla" && t >= x.at && t < x.at + x.len);
  if (!e) return 0;
  const into = t - e.at;
  return Math.min(1, into / 3, (e.len - into) / 3);
}

/** «La tribuna tira armas»: two mirrored pairs of good weapons (ids `e{n}…`). */
export function eventItems(map: ArenaMap, seed: number, ev: ArenaEvent): Record<string, { kind: ItemKind; x: number; z: number }> {
  const rand = mulberry32((seed ^ Math.imul(ev.n + 101, 0x85ebca6b)) >>> 0);
  const pool: ItemKind[] = ["hacha", "martillo", "mangual", "lanza", "arco", "escudo", "maza", "espada", "pocion"];
  const out: Record<string, { kind: ItemKind; x: number; z: number }> = {};
  for (let i = 0; i < 2; i++) {
    const kind = pool[Math.floor(rand() * pool.length)];
    let [x, z] = standSpot(map, rand);
    // On red's half (its mirror on blue's), not right at the middle.
    if (x > 0) [x, z] = [-x, -z];
    if (x > -1.5) x = -1.5 - rand() * 3;
    const top = topAt(map, x, z);
    if (!Number.isFinite(top) || blockedAt(map, x, z, top, 0.3)) [x, z] = [map.items[i][0] + 1.2, map.items[i][1]];
    out[`e${ev.n}x${i}r`] = { kind, x, z };
    out[`e${ev.n}x${i}b`] = { kind, x: -x, z: -z };
  }
  return out;
}
