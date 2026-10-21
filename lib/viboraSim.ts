import { mulberry32 } from "./random";

/**
 * Viborita's simulation, pure (no Firebase, no DOM). Each snake is a head
 * that moves at a fixed speed and turns towards where the player points; its
 * body is the trail the head left, as long as its mass allows
 * (`lengthOf`). Mass is the score: pellets add to it, boosting spends it.
 *
 * A head that crosses another snake's body behind its neck (the length it
 * has at mass 0, `NECK`) cuts it there: the victim keeps the front part and
 * the cutter eats the mass of the rest (`findCut`). Snakes never die; the
 * arena's edge is a wall that burns mass while you touch it.
 *
 * Online it's for keeps: head and neck are hard, so a head that runs into
 * them crashes (`findCrash`; head on, the smaller one), and so does one that
 * touches the edge. What's lost falls as remains anyone can eat (`spreadDrops`):
 * all of a crashed snake, and half of a cut tail (the cutter eats the rest
 * at once), so trading cuts back and forth doesn't pay.
 */

export const START_MASS = 10;
/** Body length at mass 0: the uncuttable neck. */
export const NECK = 90;
/** Body length per point of mass. */
export const LEN_PER_MASS = 5;
/** Spacing of the local trail. */
export const SEG = 8;
/** Spacing of the points sent over the network (a multiple of SEG). */
export const NET_SEG = 24;
export const SPEED = 150;
export const BOOST_SPEED = 285;
/** Mass spent per second while boosting, and the least you need to boost. */
export const BOOST_COST = 6;
export const BOOST_MIN = 10;
/** Mass lost per second while touching the edge. */
export const EDGE_BURN = 10;
/** After spawning nobody can cut you for this long. */
export const SPAWN_SHIELD_MS = 2500;
/** After being cut, the victim can't be cut again for this long. */
export const CUT_COOLDOWN_MS = 1500;

export const lengthOf = (mass: number) => NECK + Math.max(0, mass) * LEN_PER_MASS;
export const massForLength = (len: number) => Math.max(0, Math.floor((len - NECK) / LEN_PER_MASS));
export const radiusOf = (mass: number) => 8 + Math.min(12, Math.sqrt(Math.max(0, mass)) * 0.55);
/** Big snakes turn wider. */
export const turnRateOf = (mass: number) => 3.8 / (1 + Math.max(0, mass) / 900);

/** Arena radius and pellets for a number of snakes. */
export function arenaRadius(snakes: number): number {
  return 1000 + 95 * Math.max(4, snakes);
}
export function foodCount(snakes: number): number {
  return 70 + 26 * Math.max(4, snakes);
}

// ---- Snakes ----------------------------------------------------------------

export interface Snake {
  x: number;
  y: number;
  /** Heading, radians (0 = +x). */
  a: number;
  mass: number;
  /** Points the head left behind, head first, flat [x0, y0, x1, y1…], every SEG. */
  trail: number[];
  boosting: boolean;
  /** Touching the edge this frame. */
  burning: boolean;
  /** Server time until which nobody can cut it. */
  shieldUntil: number;
}

/** A new snake somewhere in the arena, away from the edge and the given heads. */
export function spawnSnake(radius: number, heads: { x: number; y: number }[], now: number, rand = Math.random): Snake {
  let best = { x: 0, y: 0, d: -1 };
  for (let i = 0; i < 12; i++) {
    const r = Math.sqrt(rand()) * radius * 0.72;
    const t = rand() * Math.PI * 2;
    const x = Math.cos(t) * r;
    const y = Math.sin(t) * r;
    const d = Math.min(1e9, ...heads.map((h) => Math.hypot(h.x - x, h.y - y)));
    if (d > best.d) best = { x, y, d };
  }
  // Facing the center, with the body trailing behind.
  const a = Math.atan2(-best.y, -best.x) + (rand() - 0.5);
  const trail: number[] = [];
  for (let k = 1; k * SEG <= lengthOf(START_MASS); k++) trail.push(best.x - Math.cos(a) * k * SEG, best.y - Math.sin(a) * k * SEG);
  return { x: best.x, y: best.y, a, mass: START_MASS, trail, boosting: false, burning: false, shieldUntil: now + SPAWN_SHIELD_MS };
}

function angleDiff(to: number, from: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Moves a snake `dt` seconds: turns towards `target` (null = straight on),
 * boosts if asked and it can, keeps it inside the arena and trims the trail
 * to its length.
 */
export function stepSnake(s: Snake, target: number | null, boost: boolean, dt: number, radius: number) {
  if (target !== null) {
    const turn = turnRateOf(s.mass) * dt;
    s.a += Math.max(-turn, Math.min(turn, angleDiff(target, s.a)));
  }
  s.boosting = boost && s.mass >= BOOST_MIN;
  if (s.boosting) s.mass = Math.max(0, s.mass - BOOST_COST * dt);
  const speed = s.boosting ? BOOST_SPEED : SPEED;
  s.x += Math.cos(s.a) * speed * dt;
  s.y += Math.sin(s.a) * speed * dt;

  // The edge is a wall: slide along it, losing mass.
  const r = radiusOf(s.mass);
  const d = Math.hypot(s.x, s.y);
  s.burning = d > radius - r;
  if (s.burning) {
    const k = (radius - r) / d;
    s.x *= k;
    s.y *= k;
    s.mass = Math.max(0, s.mass - EDGE_BURN * dt);
    // Turn along the wall so it doesn't stay stuck facing out.
    const tangent = Math.atan2(s.y, s.x) + (angleDiff(s.a, Math.atan2(s.y, s.x)) > 0 ? Math.PI / 2 : -Math.PI / 2);
    s.a += angleDiff(tangent, s.a) * Math.min(1, dt * 6);
  }

  const lx = s.trail.length ? s.trail[0] : s.x - Math.cos(s.a) * SEG;
  const ly = s.trail.length ? s.trail[1] : s.y - Math.sin(s.a) * SEG;
  const moved = Math.hypot(s.x - lx, s.y - ly);
  if (moved >= SEG) {
    // Fill in whole steps so the spacing stays even when a frame is long.
    const n = Math.floor(moved / SEG);
    const add: number[] = [];
    for (let k = n; k >= 1; k--) add.push(lx + ((s.x - lx) * k * SEG) / moved, ly + ((s.y - ly) * k * SEG) / moved);
    s.trail.unshift(...add);
  }
  const keep = Math.ceil(lengthOf(s.mass) / SEG) + 1;
  if (s.trail.length > keep * 2) s.trail.length = keep * 2;
}

/** The body to draw and hit: the head, then the trail, every `step` trail points. */
export function bodyOf(s: Snake, step = 1): number[] {
  const out = [s.x, s.y];
  const n = s.trail.length / 2;
  for (let i = step - 1; i < n; i += step) out.push(s.trail[i * 2], s.trail[i * 2 + 1]);
  if (n && (n - 1) % step !== step - 1) out.push(s.trail[(n - 1) * 2], s.trail[(n - 1) * 2 + 1]);
  return out;
}

/**
 * Where a head of radius `headR` at (x, y) cuts `body` (flat, head first),
 * as the length the victim keeps, or null. The neck can't be cut, and a cut
 * must take something.
 */
export function findCut(x: number, y: number, headR: number, body: number[], bodyR: number, bodyMass: number): number | null {
  const reach = headR * 0.7 + bodyR * 0.8;
  let acc = 0;
  for (let i = 2; i + 1 < body.length; i += 2) {
    const ax = body[i - 2];
    const ay = body[i - 1];
    const bx = body[i];
    const by = body[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const start = acc;
    acc += len;
    if (acc <= NECK || len === 0) continue;
    // Closest point of the segment to the head.
    let t = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (len * len);
    t = Math.max(0, Math.min(1, t));
    const px = ax + (bx - ax) * t;
    const py = ay + (by - ay) * t;
    if (Math.hypot(x - px, y - py) > reach) continue;
    const keep = Math.max(NECK, start + len * t);
    return bodyMass - massForLength(keep) >= 1 ? keep : null;
  }
  return null;
}

/** Cuts a snake's own trail to `keep` length (the victim's side of a cut). */
export function applyCut(s: Snake, keep: number) {
  s.mass = Math.min(s.mass, massForLength(keep));
  const n = Math.ceil(keep / SEG) + 1;
  if (s.trail.length > n * 2) s.trail.length = n * 2;
}

/**
 * Whether a head at (x, y) crashes into `other`'s head or neck (online).
 * Head on, the smaller one crashes (both on a tie); each runner checks its own.
 */
export function findCrash(x: number, y: number, r: number, mass: number, other: { body: number[]; r: number; mass: number }): boolean {
  const b = other.body;
  if (b.length < 2) return false;
  const headGap = Math.hypot(x - b[0], y - b[1]);
  if (headGap < (r + other.r) * 0.85) return mass <= other.mass;
  // The neck, past the head itself.
  let acc = 0;
  for (let i = 2; i + 1 < b.length && acc < NECK; i += 2) {
    const ax = b[i - 2];
    const ay = b[i - 1];
    const bx = b[i];
    const by = b[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    acc += len;
    if (len === 0) continue;
    let t = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (len * len);
    t = Math.max(0, Math.min(1, t));
    const px = ax + (bx - ax) * t;
    const py = ay + (by - ay) * t;
    if (Math.hypot(px - b[0], py - b[1]) < other.r * 1.2) continue;
    if (Math.hypot(x - px, y - py) < r * 0.6 + other.r * 0.8) return true;
  }
  return false;
}

/** `value` mass as up to `max` remains spread along `points` (flat), with a little scatter. */
export function spreadDrops(points: number[], value: number, max: number): { x: number; y: number; v: number }[] {
  const n = Math.min(max, Math.floor(points.length / 2), Math.floor(value));
  if (n <= 0) return [];
  const v = Math.max(1, Math.round((value / n) * 10) / 10);
  const step = points.length / 2 / n;
  return Array.from({ length: n }, (_, k) => {
    const i = Math.min(points.length / 2 - 1, Math.floor(k * step)) * 2;
    return { x: points[i] + (Math.random() - 0.5) * 24, y: points[i + 1] + (Math.random() - 0.5) * 24, v };
  });
}

// ---- Food ------------------------------------------------------------------

export interface Pellet {
  x: number;
  y: number;
  /** Mass it gives. */
  v: number;
  hue: number;
}

/** Pellet `i` of the arena in its `gen`-th life: same on every client. */
export function pelletAt(seed: number, i: number, gen: number, radius: number): Pellet {
  const rand = mulberry32((seed ^ Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(gen + 1, 0x85ebca6b)) >>> 0);
  const r = Math.sqrt(rand()) * (radius - 40);
  const t = rand() * Math.PI * 2;
  const roll = rand();
  return { x: Math.cos(t) * r, y: Math.sin(t) * r, v: roll < 0.05 ? 6 : roll < 0.3 ? 2 : 1, hue: Math.floor(rand() * 360) };
}

/** Reach to eat a pellet: a little more than touching it. */
export const pelletRadius = (v: number) => 4 + v * 1.6;
export const eatReach = (snakeR: number, v: number) => snakeR + pelletRadius(v) + 10;

// ---- Bots -----------------------------------------------------------------

export interface BotBrain {
  /** Current heading goal and when to think again (local ms). */
  target: number;
  boost: boolean;
  nextThink: number;
  /** 0–1: how much it goes after other snakes' tails. */
  aggression: number;
  /** Random wander offset, so they don't all beeline. */
  wobble: number;
  /** How far ahead it watches for heads and the edge: the careless ones crash. */
  caution: number;
  nextDanger: number;
}

export function newBrain(id: string): BotBrain {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const rand = mulberry32(h >>> 0);
  return {
    target: 0,
    boost: false,
    nextThink: 0,
    aggression: 0.15 + rand() * 0.45,
    wobble: (rand() - 0.5) * 0.6,
    caution: 60 + rand() * 140,
    nextDanger: 0,
  };
}

export interface BotView {
  id: string;
  body: number[];
  mass: number;
  r: number;
  shielded: boolean;
}

/**
 * A bot's decision, re-taken every few hundred ms like a person's reaction:
 * stay off the edge, chase a reachable tail if it's in the mood, else go for
 * the best pellet nearby. Some noise keeps it human.
 */
export function thinkBot(
  bot: Snake,
  brain: BotBrain,
  id: string,
  others: BotView[],
  pellets: Pellet[],
  radius: number,
  nowMs: number
) {
  // Danger first, checked more often than the plan: the edge and heads ahead.
  if (nowMs >= brain.nextDanger) {
    brain.nextDanger = nowMs + 90 + Math.random() * 90;
    const look = brain.caution + (bot.boosting ? 90 : 40);
    const ahead = { x: bot.x + Math.cos(bot.a) * look, y: bot.y + Math.sin(bot.a) * look };
    if (Math.hypot(ahead.x, ahead.y) > radius - radiusOf(bot.mass) - 10) {
      brain.target = Math.atan2(-bot.y, -bot.x) + brain.wobble;
      brain.boost = false;
      brain.nextThink = nowMs + 500;
      return;
    }
    for (const o of others) {
      if (o.id === id || o.shielded || o.body.length < 2) continue;
      const dx = o.body[0] - bot.x;
      const dy = o.body[1] - bot.y;
      const dist = Math.hypot(dx, dy);
      if (dist > look + o.r) continue;
      const side = angleDiff(Math.atan2(dy, dx), bot.a);
      if (Math.abs(side) > 1.1) continue;
      brain.target = bot.a - Math.sign(side || 1) * 1.5;
      brain.boost = false;
      brain.nextThink = nowMs + 350;
      return;
    }
  }
  if (nowMs < brain.nextThink) return;
  brain.nextThink = nowMs + 220 + Math.random() * 380;
  brain.boost = false;
  const d = Math.hypot(bot.x, bot.y);
  if (d > radius - 240) {
    brain.target = Math.atan2(-bot.y, -bot.x) + brain.wobble;
    return;
  }

  // A tail to cut: a cuttable point of a rival close in front.
  if (Math.random() < brain.aggression) {
    let best: { a: number; d: number } | null = null;
    for (const o of others) {
      if (o.id === id || o.shielded || o.mass < 12) continue;
      let acc = 0;
      for (let i = 2; i + 1 < o.body.length; i += 2) {
        acc += Math.hypot(o.body[i] - o.body[i - 2], o.body[i + 1] - o.body[i - 1]);
        if (acc < NECK + 40) continue;
        const dx = o.body[i] - bot.x;
        const dy = o.body[i + 1] - bot.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 380) continue;
        const a = Math.atan2(dy, dx);
        if (Math.abs(angleDiff(a, bot.a)) > 1.6) continue;
        // Cutting closer to the head takes more.
        const score = dist - (o.body.length - i) * 2;
        if (!best || score < best.d) best = { a, d: score };
      }
    }
    if (best) {
      brain.target = best.a + (Math.random() - 0.5) * 0.15;
      brain.boost = bot.mass > 35 && Math.random() < 0.45;
      return;
    }
  }

  let bestP: { a: number; s: number } | null = null;
  for (const p of pellets) {
    const dx = p.x - bot.x;
    const dy = p.y - bot.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 700) continue;
    const a = Math.atan2(dy, dx);
    // Pellets behind need a full turn: worth less.
    const s = (p.v * 60) / (dist + 40) - Math.abs(angleDiff(a, bot.a)) * 0.08;
    if (!bestP || s > bestP.s) bestP = { a, s };
  }
  brain.target = bestP ? bestP.a + (Math.random() - 0.5) * 0.2 : bot.a + brain.wobble;
}

/** Names for the extra snakes: they look like anyone else's. */
export const BOT_NAMES = [
  "Sofi", "Tincho", "Lu", "Mati", "Caro", "Nacho", "Juli", "Fede", "Agus", "Cami", "Pato", "Belu",
  "Santi", "Flor", "Maxi", "Rocío", "Toto", "Vale", "Lean", "Mica", "Gonza", "Ani", "Joaco", "Pau",
  "Facu", "Meli", "Tomi", "Euge", "Rami", "Sol", "Bruno", "Lola",
];
