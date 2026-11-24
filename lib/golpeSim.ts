import {
  CAM_HALF,
  CAM_RANGE,
  GUARD_HALF,
  GUARD_HEAR,
  GUARD_RANGE,
  camAngle,
  guardAt,
  inExit,
  laserOn,
  segDist,
  sees,
  type GolpeMap,
} from "./golpeMap";

/**
 * El gran golpe: a thief's movement and what it takes to get caught, plus the
 * bots' brain. Pure; each phone runs its own thief (and the bot host the bots).
 */

/** Cells per second, empty-handed. */
export const SPEED = 3.3;
export const RADIUS = 0.3;
export const BAG_MAX = 10;
export const PICK_REACH = 0.6;
/** "Robar": how close, how much, and how long until again. */
export const STEAL_REACH = 1.35;
export const STEAL_TAKE = 2;
export const STEAL_COOLDOWN_MS = 3000;
/** After being robbed, nobody can rob you again for this long. */
export const STEAL_SHIELD_MS = 2500;
/** Caught: stuck in handcuffs, then back at your exit and invisible for a moment. */
export const FROZEN_MS = 3000;
export const SAFE_MS = 2500;

/** The bag weighs: the fuller, the slower (down to 65%). */
export const speedFor = (bag: number) => SPEED * (1 - Math.min(0.35, bag * 0.035));

export interface Thief {
  x: number;
  y: number;
  /** Facing (radians). */
  a: number;
  /** 0–1: how close security is to catching you. */
  alert: number;
  /** Server ms: handcuffed until. */
  frozenUntil: number;
  /** Server ms: can't be seen until. */
  safeUntil: number;
  /** Server ms: can rob again at. */
  stealAt: number;
  /** Server ms of the last "Robar", for the lunge. */
  lungeAt: number;
}

export function newThief(x: number, y: number, now: number): Thief {
  return { x, y, a: -Math.PI / 2, alert: 0, frozenUntil: 0, safeUntil: now + SAFE_MS, stealAt: 0, lungeAt: 0 };
}

/** Moves a box of half side `r` and slides it along walls. */
export function moveBox(m: GolpeMap, x: number, y: number, dx: number, dy: number, r = RADIUS): [number, number] {
  const solid = (cx: number, cy: number) => cx < 0 || cy < 0 || cx >= m.w || cy >= m.h || m.wall[cy * m.w + cx] === 1;
  let nx = x + dx;
  if (dx) {
    const y0 = Math.floor(y - r + 0.001);
    const y1 = Math.floor(y + r - 0.001);
    const cx = Math.floor(dx > 0 ? nx + r : nx - r);
    for (let cy = y0; cy <= y1; cy++) {
      if (!solid(cx, cy)) continue;
      nx = dx > 0 ? cx - r - 0.001 : cx + 1 + r + 0.001;
      break;
    }
  }
  let ny = y + dy;
  if (dy) {
    const x0 = Math.floor(nx - r + 0.001);
    const x1 = Math.floor(nx + r - 0.001);
    const cy = Math.floor(dy > 0 ? ny + r : ny - r);
    for (let cx = x0; cx <= x1; cx++) {
      if (!solid(cx, cy)) continue;
      ny = dy > 0 ? cy - r - 0.001 : cy + 1 + r + 0.001;
      break;
    }
  }
  return [nx, ny];
}

/** Steps a thief with a stick (length ≤ 1). Handcuffed thieves don't move. */
export function stepThief(m: GolpeMap, th: Thief, ix: number, iy: number, bag: number, dt: number, now: number, pace = 1) {
  if (now < th.frozenUntil) return;
  const len = Math.hypot(ix, iy);
  if (len < 0.08) return;
  const k = Math.min(1, len) / len;
  const v = speedFor(bag) * pace * dt;
  [th.x, th.y] = moveBox(m, th.x, th.y, ix * k * v, iy * k * v);
  th.a = Math.atan2(iy, ix);
}

export interface Exposure {
  /** Per second the alert fills (0 = nobody sees you). */
  rate: number;
  /** Walked into a laser or into a guard: caught at once. */
  instant: boolean;
  /** What saw you, for the message. */
  by: "guardia" | "camara" | "laser" | null;
}

/** Who sees the point at time `t` (match seconds). */
export function exposure(m: GolpeMap, x: number, y: number, t: number): Exposure {
  for (const l of m.lasers) {
    if (laserOn(l, t) && segDist(x, y, l.x1, l.y1, l.x2, l.y2) < RADIUS + 0.08) return { rate: 0, instant: true, by: "laser" };
  }
  let rate = 0;
  let by: Exposure["by"] = null;
  for (const g of m.guards) {
    const p = guardAt(g, t);
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < GUARD_HEAR) return { rate: 0, instant: true, by: "guardia" };
    if (sees(m, p.x, p.y, p.a, GUARD_RANGE, GUARD_HALF, x, y)) {
      // Closer = faster: from ~0.7 s at the edge of the light to ~0.3 s up close.
      const r = 1.4 + 2.2 * (1 - d / GUARD_RANGE);
      if (r > rate) {
        rate = r;
        by = "guardia";
      }
    }
  }
  for (const c of m.cams) {
    if (sees(m, c.x, c.y, camAngle(c, t), CAM_RANGE, CAM_HALF, x, y) && 1.25 > rate) {
      rate = 1.25;
      by = "camara";
    }
  }
  return { rate, instant: false, by };
}

/** Fills or drains the alert; true when it's full (caught). */
export function watch(th: Thief, e: Exposure, dt: number, now: number): boolean {
  if (now < th.safeUntil || now < th.frozenUntil) {
    th.alert = 0;
    return false;
  }
  if (e.instant) return true;
  if (e.rate > 0) th.alert = Math.min(1, th.alert + e.rate * dt);
  else th.alert = Math.max(0, th.alert - dt * 0.9);
  return th.alert >= 1;
}

// ---- Bots ------------------------------------------------------------------------

export type BotLevel = "facil" | "normal" | "dificil";

export const BOT_NAMES_GOLPE = ["Gato", "Sombra", "Zorro", "Pantera", "Bigote", "Ratón", "Fantasma", "Garra", "Lince", "Humo", "Sigilo", "Antifaz"];

export interface BotBrain {
  /** Cells to walk (index), next first. */
  path: number[];
  nextThink: number;
  /** Goal: "gem" / "bank" / "hide". */
  goal: string;
  level: BotLevel;
}

export function newBrain(level: BotLevel): BotBrain {
  return { path: [], nextThink: 0, goal: "", level };
}

const LEVEL = {
  facil: { bankAt: 3, pace: 0.82, lookAhead: false, careless: 0.35, steal: 0.25 },
  normal: { bankAt: 5, pace: 0.92, lookAhead: true, careless: 0.18, steal: 0.55 },
  dificil: { bankAt: 7, pace: 1, lookAhead: true, careless: 0, steal: 0.9 },
} as const;

export const botPace = (level: BotLevel) => LEVEL[level].pace;

export interface BotWorld {
  m: GolpeMap;
  /** Match seconds now. */
  t: number;
  /** Seconds left in the match. */
  left: number;
  bag: number;
  exits: number[];
  /** Diamonds (and dropped ones) lying on the floor now. */
  loot: { x: number; y: number; v: number }[];
}

/** Is the cell's center risky at time t? (With some margin: bots keep away from the light's edge.) */
function risky(m: GolpeMap, cell: number, t: number, careless: boolean): boolean {
  const x = (cell % m.w) + 0.5;
  const y = Math.floor(cell / m.w) + 0.5;
  for (const l of m.lasers) {
    if (segDist(x, y, l.x1, l.y1, l.x2, l.y2) > 1.1) continue;
    if (laserOn(l, t - 0.3) || laserOn(l, t) || laserOn(l, t + 0.35) || laserOn(l, t + 0.7)) return true;
  }
  for (const g of m.guards) {
    const p = guardAt(g, t);
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < GUARD_HEAR + 0.8) return true;
    if (sees(m, p.x, p.y, p.a, GUARD_RANGE + 0.6, GUARD_HALF + 0.15, x, y)) return true;
  }
  if (careless) return false;
  for (const c of m.cams) if (sees(m, c.x, c.y, camAngle(c, t), CAM_RANGE + 0.4, CAM_HALF + 0.12, x, y)) return true;
  return false;
}

/**
 * Plans where a bot walks: a breadth-first search over cells where each cell
 * is checked at the time the bot would get there (or now, for easy bots), so
 * it slips behind guards instead of into their light. Picks the best diamond
 * by value and distance, or the nearest exit once the bag is full enough or
 * time is short. With no safe way, it waits where it is.
 */
export function thinkBot(b: BotBrain, th: Thief, w: BotWorld) {
  const { m } = w;
  const L = LEVEL[b.level];
  const careless = Math.random() < L.careless;
  const cellTime = 1 / (speedFor(w.bag) * L.pace);
  const start = Math.floor(th.y) * m.w + Math.floor(th.x);
  const dist = new Int32Array(m.w * m.h).fill(-1);
  const prev = new Int32Array(m.w * m.h).fill(-1);
  const queue = [start];
  dist[start] = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi];
    const d = dist[c];
    const cx = c % m.w;
    const cy = Math.floor(c / m.w);
    const at = L.lookAhead ? w.t + (d + 1) * cellTime : w.t;
    for (const [nx, ny] of [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
      const n = ny * m.w + nx;
      if (dist[n] >= 0 || m.wall[n]) continue;
      if (risky(m, n, at, careless) || (L.lookAhead && risky(m, n, at + 0.35, careless))) continue;
      dist[n] = d + 1;
      prev[n] = c;
      queue.push(n);
    }
  }
  const cellOf = (x: number, y: number) => Math.floor(y) * m.w + Math.floor(x);
  let goal = -1;
  let kind = "";
  // Bank: full enough, bag full, or the clock says go home now.
  let exitCell = -1;
  let exitDist = Infinity;
  for (const i of w.exits) {
    const e = m.exits[i];
    const c = cellOf(e.x + 1, e.y + 1);
    if (dist[c] >= 0 && dist[c] < exitDist) {
      exitDist = dist[c];
      exitCell = c;
    }
  }
  const homeBy = exitDist === Infinity ? 0 : exitDist * cellTime + 6;
  const wantBank = w.bag >= BAG_MAX || (w.bag >= L.bankAt) || (w.bag > 0 && w.left < homeBy + 4);
  if (wantBank && exitCell >= 0) {
    goal = exitCell;
    kind = "bank";
  } else if (w.bag < BAG_MAX && w.left > 3) {
    let best = -Infinity;
    for (const g of w.loot) {
      const c = cellOf(g.x, g.y);
      if (dist[c] < 0) continue;
      const score = (g.v + 0.6) / (dist[c] + 3);
      if (score > best) {
        best = score;
        goal = c;
      }
    }
    if (goal >= 0) kind = "gem";
  }
  if (goal < 0 && w.bag > 0 && exitCell >= 0) {
    goal = exitCell;
    kind = "bank";
  }
  // Nowhere safe to go: hide in the nearest spot that stays dark for a while.
  // Easy bots just wait (and get caught more).
  const stays = (c: number, at: number) => !risky(m, c, at, careless) && !risky(m, c, at + 0.8, careless) && !risky(m, c, at + 1.6, careless);
  if (goal < 0 && b.level !== "facil") {
    for (const c of queue) {
      if (stays(c, w.t + dist[c] * cellTime)) {
        goal = c;
        kind = "hide";
        break;
      }
    }
  }
  const path: number[] = [];
  if (goal >= 0) {
    for (let c = goal; c !== start && c >= 0; c = prev[c]) path.push(c);
    path.reverse();
  } else if (b.level !== "facil" && risky(m, start, w.t + 0.4, careless)) {
    // Cornered: run through the light to the closest cell that will be dark.
    path.push(...escapeRoute(m, start, w.t, cellTime, careless));
    kind = "hide";
  }
  b.path = path;
  b.goal = goal < 0 && !path.length ? "wait" : kind;
}

/** The shortest way (ignoring the light on the way) to a cell that will be dark when reached. */
function escapeRoute(m: GolpeMap, start: number, t: number, cellTime: number, careless: boolean): number[] {
  const dist = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  const queue = [start];
  for (let qi = 0; qi < queue.length && qi < 200; qi++) {
    const c = queue[qi];
    const d = dist.get(c)!;
    if (d > 0 && !risky(m, c, t + d * cellTime, careless) && !risky(m, c, t + d * cellTime + 1, careless)) {
      const out: number[] = [];
      for (let x = c; x !== start; x = prev.get(x)!) out.push(x);
      return out.reverse();
    }
    for (const n of [c + 1, c - 1, c + m.w, c - m.w]) {
      if (n < 0 || n >= m.wall.length || m.wall[n] || dist.has(n)) continue;
      dist.set(n, d + 1);
      prev.set(n, c);
      queue.push(n);
    }
  }
  return [];
}

/** The stick for a bot this frame: toward the next cell of its path. */
export function botStick(b: BotBrain, th: Thief, m: GolpeMap): [number, number] {
  while (b.path.length) {
    const c = b.path[0];
    const tx = (c % m.w) + 0.5;
    const ty = Math.floor(c / m.w) + 0.5;
    const dx = tx - th.x;
    const dy = ty - th.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.18) {
      b.path.shift();
      continue;
    }
    return [dx / d, dy / d];
  }
  return [0, 0];
}

/** Bots rob a rival they bump into, more or less often by level. */
export function botWantsSteal(level: BotLevel): boolean {
  return Math.random() < LEVEL[level].steal;
}

/** Inside one of these exits. */
export function atExit(m: GolpeMap, exits: number[], x: number, y: number): boolean {
  return exits.some((i) => inExit(m.exits[i], x, y));
}
