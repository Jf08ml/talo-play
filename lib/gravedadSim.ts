/**
 * Gravedad Loca, the simulation (pure and deterministic: same level, same
 * inputs, same result on every phone — only + − × ÷, no Math.sin, so float
 * results don't differ between browsers).
 *
 * A level is a grid of 1×1 tiles (`Level.rows`, see `TILE`). The player is a
 * square box that falls toward its gravity, one of four directions. The view
 * turns so that gravity always points down on screen, so the controls are
 * relative: walk left/right along the floor you're on, jump away from it, and
 * send gravity to the ceiling or to the left/right wall. Changing gravity
 * needs a charge, given back by touching any surface (or a gravity tile).
 *
 * Moving platforms follow a triangle wave of the level clock `t` (seconds
 * since the start, the same for everyone), so they're where everybody sees
 * them. Some levels also flip everyone's gravity every `pulse` seconds.
 */

export const DT = 1 / 120;
export const HALF = 0.38;
const G = 38;
const MAX_FALL = 19;
const WALK = 7.5;
const ACC_GROUND = 70;
const ACC_AIR = 38;
const JUMP = 12.6;
const COYOTE = 0.09;
const JUMP_BUFFER = 0.12;
const GRAV_COOLDOWN = 0.12;
/** After changing gravity, the speed left over (the rest is lost in the turn). */
const GRAV_KEEP = 0.35;
const EPS = 1e-6;
export const RESPAWN_S = 0.6;
const CRUMBLE_S = 0.45;
const CRUMBLE_BACK_S = 3;

/** Gravity directions: 0 down, 1 left, 2 up, 3 right (world, y down). */
export type Dir = 0 | 1 | 2 | 3;
export const DIR_VEC: readonly [number, number][] = [
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 0],
];
/** The camera turn that makes gravity `d` point down on screen. */
export const DIR_ANGLE = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

/**
 * Tiles: `#` wall, `.` air, `S` start, `G` goal, `^` spikes (deadly from
 * any side), `C` checkpoint, `B` a block that crumbles a moment after you
 * stand on it (and comes back), and the gravity tiles `d` `l` `u` `r`, which
 * set gravity down/left/up/right as you pass through and give the charge back.
 */
export const TILE = {
  wall: "#",
  start: "S",
  goal: "G",
  spike: "^",
  checkpoint: "C",
  crumble: "B",
} as const;
const GRAV_TILES: Record<string, Dir> = { d: 0, l: 1, u: 2, r: 3 };

export interface Mover {
  /** Top-left at the start of the path, size, and where it goes (relative). */
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
  /** Seconds for a round trip. */
  period: number;
  /** Fraction of the period it starts at (0–1). */
  phase?: number;
}

export interface LevelDef {
  name: string;
  rows: string[];
  /** Starting gravity (default down). */
  gravity?: Dir;
  movers?: Mover[];
  /** Everyone's gravity flips every this many seconds. */
  pulse?: number;
  /** A line of help shown while playing (first levels). */
  hint?: string;
  /** Seconds for three stars. */
  par: number;
}

export interface Level extends LevelDef {
  w: number;
  h: number;
  start: { x: number; y: number };
  crumbles: number[];
}

export function parseLevel(def: LevelDef): Level {
  const h = def.rows.length;
  const w = Math.max(...def.rows.map((r) => r.length));
  const rows = def.rows.map((r) => r.padEnd(w, "."));
  let start = { x: 1.5, y: 1.5 };
  const crumbles: number[] = [];
  rows.forEach((r, y) => {
    for (let x = 0; x < w; x++) {
      if (r[x] === TILE.start) start = { x: x + 0.5, y: y + 0.5 };
      if (r[x] === TILE.crumble) crumbles.push(y * w + x);
    }
  });
  return { ...def, rows, w, h, start, crumbles };
}

export const tileAt = (lv: Level, x: number, y: number): string =>
  x < 0 || y < 0 || x >= lv.w || y >= lv.h ? "." : lv.rows[y][x];

/** Where a moving platform is at time `t` (triangle wave: there and back, linear). */
export function moverAt(m: Mover, t: number): { x: number; y: number } {
  const p = (((t / m.period + (m.phase ?? 0)) % 1) + 1) % 1;
  const k = p < 0.5 ? p * 2 : 2 - p * 2;
  return { x: m.x + m.dx * k, y: m.y + m.dy * k };
}

/** Gravity after the level's pulses up to time `t` (each pulse flips it). */
export const pulsesBy = (lv: Level, t: number) => (lv.pulse ? Math.floor(Math.max(0, t) / lv.pulse) : 0);

export interface Input {
  /** Walk along the floor: −1 left, 1 right (as seen on screen). */
  move: -1 | 0 | 1;
  /** Jump pressed this step (edge). */
  jump: boolean;
  /** Gravity change pressed this step: toward the ceiling, or the left/right wall (as seen). */
  grav: "" | "up" | "left" | "right";
}

export const NO_INPUT: Input = { move: 0, jump: false, grav: "" };

export interface Runner {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: Dir;
  grounded: boolean;
  charge: boolean;
  coyote: number;
  jumpBuf: number;
  gravCool: number;
  /** Facing on screen (for drawing): −1 / 1. */
  face: -1 | 1;
  /** Respawn countdown after dying (0 = alive). */
  dead: number;
  deaths: number;
  cp: { x: number; y: number; g: Dir };
  /** Crumble tiles: index → time it was stepped on (−1 idle), or gone until. */
  crumble: Record<number, number>;
  pulses: number;
  finished: boolean;
  t: number;
}

export function newRunner(lv: Level, t = 0): Runner {
  const g = (lv.gravity ?? 0) as Dir;
  return {
    x: lv.start.x,
    y: lv.start.y,
    vx: 0,
    vy: 0,
    g: pulsesBy(lv, t) % 2 ? flip(g) : g,
    grounded: false,
    charge: true,
    coyote: 0,
    jumpBuf: 0,
    gravCool: 0,
    face: 1,
    dead: 0,
    deaths: 0,
    cp: { x: lv.start.x, y: lv.start.y, g },
    crumble: {},
    pulses: pulsesBy(lv, t),
    finished: false,
    t,
  };
}

export const cloneRunner = (r: Runner): Runner => ({ ...r, cp: { ...r.cp }, crumble: { ...r.crumble } });

const flip = (d: Dir): Dir => ((d + 2) % 4) as Dir;
/** The direction that is "right" on screen when gravity is `d`. */
export const rightOf = (d: Dir): Dir => ((d + 3) % 4) as Dir;
export const leftOf = (d: Dir): Dir => ((d + 1) % 4) as Dir;

/** Gravity after a relative change. */
export function turnGravity(d: Dir, to: Input["grav"]): Dir {
  if (to === "up") return flip(d);
  if (to === "right") return rightOf(d);
  if (to === "left") return leftOf(d);
  return d;
}

function crumbleSolid(lv: Level, r: Runner, idx: number): boolean {
  const at = r.crumble[idx];
  if (at === undefined || at < 0) return true;
  // Stepped on at `at`: still there for CRUMBLE_S, then gone until it comes back.
  return r.t < at + CRUMBLE_S || r.t >= at + CRUMBLE_S + CRUMBLE_BACK_S;
}

function solidTile(lv: Level, r: Runner, x: number, y: number): boolean {
  const ch = tileAt(lv, x, y);
  if (ch === TILE.wall) return true;
  if (ch === TILE.crumble) return crumbleSolid(lv, r, y * lv.w + x);
  return false;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlap = (a: Box, b: Box) => a.x0 < b.x1 - EPS && a.x1 > b.x0 + EPS && a.y0 < b.y1 - EPS && a.y1 > b.y0 + EPS;

function moverBoxes(lv: Level, t: number): Box[] {
  return (lv.movers ?? []).map((m) => {
    const p = moverAt(m, t);
    return { x0: p.x, y0: p.y, x1: p.x + m.w, y1: p.y + m.h };
  });
}

/** Moves the runner along one axis, stopping at walls; returns whether it hit something. */
function sweep(lv: Level, r: Runner, axis: 0 | 1, d: number, movers: Box[]): boolean {
  if (d === 0) return false;
  if (axis === 0) r.x += d;
  else r.y += d;
  const box: Box = { x0: r.x - HALF, y0: r.y - HALF, x1: r.x + HALF, y1: r.y + HALF };
  let hit = false;
  const fix = (b: Box) => {
    if (!overlap(box, b)) return;
    hit = true;
    if (axis === 0) {
      r.x = d > 0 ? b.x0 - HALF - EPS : b.x1 + HALF + EPS;
      box.x0 = r.x - HALF;
      box.x1 = r.x + HALF;
    } else {
      r.y = d > 0 ? b.y0 - HALF - EPS : b.y1 + HALF + EPS;
      box.y0 = r.y - HALF;
      box.y1 = r.y + HALF;
    }
  };
  for (let ty = Math.floor(box.y0); ty <= Math.floor(box.y1); ty++)
    for (let tx = Math.floor(box.x0); tx <= Math.floor(box.x1); tx++) if (solidTile(lv, r, tx, ty)) fix({ x0: tx, y0: ty, x1: tx + 1, y1: ty + 1 });
  for (const m of movers) fix(m);
  return hit;
}

/** The tile under the runner's feet (toward gravity), for crumbling blocks. */
function feetTiles(lv: Level, r: Runner): number[] {
  const [gx, gy] = DIR_VEC[r.g];
  const out: number[] = [];
  const px = r.x + gx * (HALF + 0.05);
  const py = r.y + gy * (HALF + 0.05);
  const spread = gx === 0 ? [[-HALF + 0.02, 0], [HALF - 0.02, 0]] : [[0, -HALF + 0.02], [0, HALF - 0.02]];
  for (const [sx, sy] of spread) {
    const tx = Math.floor(px + sx);
    const ty = Math.floor(py + sy);
    if (tileAt(lv, tx, ty) === TILE.crumble) out.push(ty * lv.w + tx);
  }
  return out;
}

export interface StepEvents {
  jumped?: boolean;
  turned?: boolean;
  landed?: boolean;
  died?: boolean;
  checkpoint?: boolean;
  finished?: boolean;
  pulsed?: boolean;
}

/** Advances the runner one `DT` with `input`. Mutates `r`; returns what happened. */
export function step(lv: Level, r: Runner, input: Input): StepEvents {
  const ev: StepEvents = {};
  if (r.finished) return ev;
  const t0 = r.t;
  r.t += DT;
  if (r.dead > 0) {
    r.dead -= DT;
    if (r.dead <= 0) {
      r.dead = 0;
      r.x = r.cp.x;
      r.y = r.cp.y;
      r.vx = r.vy = 0;
      r.g = r.cp.g;
      r.charge = true;
      r.crumble = {};
    }
    return ev;
  }

  // Level-wide pulses flip gravity.
  const pulses = pulsesBy(lv, r.t);
  if (pulses !== r.pulses) {
    r.pulses = pulses;
    r.g = flip(r.g);
    r.vx *= GRAV_KEEP;
    r.vy *= GRAV_KEEP;
    r.charge = true;
    ev.pulsed = true;
  }

  r.gravCool = Math.max(0, r.gravCool - DT);
  if (input.grav && r.charge && r.gravCool === 0) {
    r.g = turnGravity(r.g, input.grav);
    r.charge = false;
    r.gravCool = GRAV_COOLDOWN;
    r.vx *= GRAV_KEEP;
    r.vy *= GRAV_KEEP;
    r.grounded = false;
    r.coyote = 0;
    ev.turned = true;
  }

  const [gx, gy] = DIR_VEC[r.g];
  const [rx, ry] = DIR_VEC[rightOf(r.g)];
  if (input.move) r.face = input.move;

  // Split the speed into "fall" (along gravity) and "walk" (along the floor).
  let fall = r.vx * gx + r.vy * gy;
  let walk = r.vx * rx + r.vy * ry;
  fall = Math.min(MAX_FALL, fall + G * DT);
  const target = input.move * WALK;
  const acc = (r.grounded ? ACC_GROUND : ACC_AIR) * DT;
  walk = walk < target ? Math.min(target, walk + acc) : Math.max(target, walk - acc);

  r.jumpBuf = input.jump ? JUMP_BUFFER : Math.max(0, r.jumpBuf - DT);
  r.coyote = r.grounded ? COYOTE : Math.max(0, r.coyote - DT);
  if (r.jumpBuf > 0 && r.coyote > 0) {
    fall = -JUMP;
    r.jumpBuf = 0;
    r.coyote = 0;
    ev.jumped = true;
  }
  r.vx = gx * fall + rx * walk;
  r.vy = gy * fall + ry * walk;

  // Riding a platform: move with it first.
  const movers = moverBoxes(lv, r.t);
  if (r.grounded && lv.movers?.length) {
    const before = moverBoxes(lv, t0);
    const feet: Box = {
      x0: r.x - HALF + gx * 0.1,
      y0: r.y - HALF + gy * 0.1,
      x1: r.x + HALF + gx * 0.1,
      y1: r.y + HALF + gy * 0.1,
    };
    before.forEach((b, i) => {
      if (!overlap(feet, b)) return;
      sweep(lv, r, 0, movers[i].x0 - b.x0, []);
      sweep(lv, r, 1, movers[i].y0 - b.y0, []);
    });
  }

  const wasGrounded = r.grounded;
  const hitX = sweep(lv, r, 0, r.vx * DT, movers);
  if (hitX) r.vx = 0;
  const hitY = sweep(lv, r, 1, r.vy * DT, movers);
  if (hitY) r.vy = 0;
  // Grounded = something solid right under the feet (toward gravity).
  r.grounded = touching(lv, r, movers);
  if (r.grounded) {
    r.charge = true;
    if (!wasGrounded) ev.landed = true;
    for (const idx of feetTiles(lv, r)) if (r.crumble[idx] === undefined || r.crumble[idx] < 0 || r.t >= r.crumble[idx] + CRUMBLE_S + CRUMBLE_BACK_S) r.crumble[idx] = r.t;
  }

  // What the runner is touching.
  const inner: Box = { x0: r.x - HALF * 0.7, y0: r.y - HALF * 0.7, x1: r.x + HALF * 0.7, y1: r.y + HALF * 0.7 };
  for (let ty = Math.floor(inner.y0); ty <= Math.floor(inner.y1); ty++) {
    for (let tx = Math.floor(inner.x0); tx <= Math.floor(inner.x1); tx++) {
      const ch = tileAt(lv, tx, ty);
      if (ch === TILE.spike) {
        die(r);
        ev.died = true;
        return ev;
      }
      if (ch === TILE.goal) {
        r.finished = true;
        ev.finished = true;
        return ev;
      }
      if (ch === TILE.checkpoint && (r.cp.x !== tx + 0.5 || r.cp.y !== ty + 0.5)) {
        r.cp = { x: tx + 0.5, y: ty + 0.5, g: r.g };
        ev.checkpoint = true;
      }
      const gt = GRAV_TILES[ch];
      if (gt !== undefined) {
        if (r.g !== gt) {
          r.g = gt;
          ev.turned = true;
        }
        r.charge = true;
      }
    }
  }
  // Fell out of the level.
  if (r.x < -3 || r.y < -3 || r.x > lv.w + 3 || r.y > lv.h + 3) {
    die(r);
    ev.died = true;
  }
  return ev;
}

/** Whether something solid is right under the feet (toward gravity). */
function touching(lv: Level, r: Runner, movers: Box[]): boolean {
  const [gx, gy] = DIR_VEC[r.g];
  const probe: Box = {
    x0: r.x - HALF + gx * 0.02,
    y0: r.y - HALF + gy * 0.02,
    x1: r.x + HALF + gx * 0.02,
    y1: r.y + HALF + gy * 0.02,
  };
  for (let ty = Math.floor(probe.y0); ty <= Math.floor(probe.y1); ty++)
    for (let tx = Math.floor(probe.x0); tx <= Math.floor(probe.x1); tx++)
      if (solidTile(lv, r, tx, ty) && overlap(probe, { x0: tx, y0: ty, x1: tx + 1, y1: ty + 1 })) return true;
  return movers.some((m) => overlap(probe, m));
}

function die(r: Runner) {
  r.dead = RESPAWN_S;
  r.deaths++;
  r.vx = r.vy = 0;
}

/** Tile distances to the goal (4-neighbors through anything but walls): progress bars and the bots' guide. */
export function distanceField(lv: Level): Int32Array {
  const d = new Int32Array(lv.w * lv.h).fill(-1);
  const queue: number[] = [];
  for (let y = 0; y < lv.h; y++)
    for (let x = 0; x < lv.w; x++)
      if (lv.rows[y][x] === TILE.goal) {
        d[y * lv.w + x] = 0;
        queue.push(y * lv.w + x);
      }
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    const x = c % lv.w;
    const y = (c - x) / lv.w;
    for (const [dx, dy] of DIR_VEC) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= lv.w || ny >= lv.h) continue;
      const n = ny * lv.w + nx;
      if (d[n] >= 0 || lv.rows[ny][nx] === TILE.wall) continue;
      d[n] = d[c] + 1;
      queue.push(n);
    }
  }
  return d;
}

/** How far along the runner is, 0–1, by the distance field. */
export function progressOf(lv: Level, field: Int32Array, x: number, y: number): number {
  const start = field[Math.floor(lv.start.y) * lv.w + Math.floor(lv.start.x)];
  const here = field[Math.max(0, Math.min(lv.h - 1, Math.floor(y))) * lv.w + Math.max(0, Math.min(lv.w - 1, Math.floor(x)))];
  if (start <= 0 || here < 0) return 0;
  return Math.max(0, Math.min(1, 1 - here / start));
}
