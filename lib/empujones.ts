/**
 * Empujones: talos on a round island pushing each other into the water.
 * Pure simulation, no Firebase: only the big screen runs it (it's the
 * authority), from the phones' inputs. Units are meters, the island's
 * center is (0, 0) and +y points down the screen.
 */

/** The island's radius at the start, and the smallest it gets before the final shrink. */
export const ISLAND_R = 9;
export const ISLAND_MIN_R = 2.8;
/** The island starts shrinking this long into the round, reaches its minimum at SHRINK_END… */
export const SHRINK_FROM = 12;
export const SHRINK_END = 48;
/** …and from SINK_FROM it sinks to nothing by SINK_END, so every round ends. */
export const SINK_FROM = 62;
export const SINK_END = 78;

export const BODY_R = 0.75;
const ACCEL = 24;
const DRAG = 3.4;
const BRACE_ACCEL = 0.3;
const BRACE_MASS = 3;
/** Speed a dash adds, how long it lasts (strong hits) and when it can be used again. */
const DASH_SPEED = 11;
const DASH_TIME = 0.3;
export const DASH_COOLDOWN = 1.4;
/** Extra push a dash gives on contact, and how long the one hit can't steer. */
const DASH_HIT = 6;
const STUN_TIME = 0.4;
const RESTITUTION = 0.6;
/** Bracing burns grip; with none left you can't brace until it refills a bit. */
export const GRIP_DRAIN = 0.45;
export const GRIP_FILL = 0.22;
export const GRIP_MIN = 0.15;
/** How long a fall takes, from the edge to the splash. */
export const FALL_TIME = 0.7;

export interface PadInput {
  /** Stick, length ≤ 1; +y is down the screen. */
  x: number;
  y: number;
  /** Dash pressed this step. */
  dash: boolean;
  brace: boolean;
}

export const IDLE: PadInput = { x: 0, y: 0, dash: false, brace: false };

export interface Body {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Where it looks (radians, 0 = +x), follows the stick. */
  face: number;
  /** Time left of the dash / of the stun, and until the next dash. */
  dashT: number;
  stunT: number;
  cool: number;
  bracing: boolean;
  grip: number;
  /** 0 on the island; > 0 = seconds since it went over the edge. */
  falling: number;
  out: boolean;
  /** Who touched it last, and when (round time): who gets the credit for a fall. */
  lastBy: string;
  lastAt: number;
  /** Dash hits taken (the screen turns them into a buzz on the phone). */
  hits: number;
}

export interface WorldEvents {
  /** Pairs that bumped this step, with how hard (relative speed). */
  bumps: { a: string; b: string; power: number; dash: boolean; x: number; y: number }[];
  dashes: string[];
  /** Bodies that went over the edge, and those that hit the water. */
  falls: string[];
  splashes: { id: string; x: number; y: number }[];
}

/** The island's radius `t` seconds into the round. */
export function islandRadius(t: number): number {
  if (t <= SHRINK_FROM) return ISLAND_R;
  if (t <= SHRINK_END) return ISLAND_R - ((ISLAND_R - ISLAND_MIN_R) * (t - SHRINK_FROM)) / (SHRINK_END - SHRINK_FROM);
  if (t <= SINK_FROM) return ISLAND_MIN_R;
  return Math.max(0, ISLAND_MIN_R * (1 - (t - SINK_FROM) / (SINK_END - SINK_FROM)));
}

/** Everyone in a circle around the middle, facing it. */
export function spawnBodies(ids: string[]): Body[] {
  const n = ids.length;
  const r = n <= 2 ? ISLAND_R * 0.45 : ISLAND_R * 0.6;
  return ids.map((id, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n);
    return newBody(id, Math.cos(a) * r, Math.sin(a) * r);
  });
}

export function newBody(id: string, x: number, y: number): Body {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    face: Math.atan2(-y, -x),
    dashT: 0,
    stunT: 0,
    cool: 0.6,
    bracing: false,
    grip: 1,
    falling: 0,
    out: false,
    lastBy: "",
    lastAt: -99,
    hits: 0,
  };
}

const massOf = (b: Body) => (b.bracing ? BRACE_MASS : 1);
export const onIsland = (b: Body) => !b.out && b.falling === 0;

/**
 * One step of `dt` seconds at round time `t`: inputs, movement, bumps and
 * falls. `inputs` by id (missing = idle). Mutates the bodies.
 */
export function stepWorld(bodies: Body[], inputs: Record<string, PadInput | undefined>, t: number, dt: number, radius: number): WorldEvents {
  const ev: WorldEvents = { bumps: [], dashes: [], falls: [], splashes: [] };

  for (const b of bodies) {
    if (b.out) continue;
    if (b.falling > 0) {
      // Over the edge: it keeps drifting out and sinks.
      b.falling += dt;
      b.x += b.vx * dt * 0.5;
      b.y += b.vy * dt * 0.5;
      if (b.falling >= FALL_TIME) {
        b.out = true;
        ev.splashes.push({ id: b.id, x: b.x, y: b.y });
      }
      continue;
    }
    const raw = inputs[b.id] ?? IDLE;
    const stunned = b.stunT > 0;
    const inp = stunned ? IDLE : raw;
    let sx = inp.x;
    let sy = inp.y;
    const len = Math.hypot(sx, sy);
    if (len > 1) {
      sx /= len;
      sy /= len;
    }
    if (len > 0.15) b.face = Math.atan2(sy, sx);

    // Grip: bracing burns it, it refills when you let go.
    const wantsBrace = inp.brace && b.dashT <= 0;
    b.bracing = wantsBrace && (b.bracing ? b.grip > 0 : b.grip > GRIP_MIN);
    b.grip = b.bracing ? Math.max(0, b.grip - GRIP_DRAIN * dt) : Math.min(1, b.grip + GRIP_FILL * dt);

    b.cool = Math.max(0, b.cool - dt);
    b.stunT = Math.max(0, b.stunT - dt);
    b.dashT = Math.max(0, b.dashT - dt);
    if (inp.dash && b.cool <= 0 && !b.bracing) {
      const dx = len > 0.15 ? sx / Math.min(1, len) : Math.cos(b.face);
      const dy = len > 0.15 ? sy / Math.min(1, len) : Math.sin(b.face);
      const n = Math.hypot(dx, dy) || 1;
      b.vx += (dx / n) * DASH_SPEED;
      b.vy += (dy / n) * DASH_SPEED;
      b.face = Math.atan2(dy, dx);
      b.dashT = DASH_TIME;
      b.cool = DASH_COOLDOWN;
      ev.dashes.push(b.id);
    }

    const accel = ACCEL * (b.bracing ? BRACE_ACCEL : 1);
    b.vx += sx * accel * dt;
    b.vy += sy * accel * dt;
    // Drag; a stunned body slides further.
    const drag = Math.exp(-(stunned ? DRAG * 0.45 : b.bracing ? DRAG * 2 : DRAG) * dt);
    b.vx *= drag;
    b.vy *= drag;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  // Bumps between everyone still on the island.
  const live = bodies.filter(onIsland);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= BODY_R * 2 || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      const ma = massOf(a);
      const mb = massOf(b);
      // Pull them apart, the lighter one more.
      const overlap = BODY_R * 2 - d;
      a.x -= nx * overlap * (mb / (ma + mb));
      a.y -= ny * overlap * (mb / (ma + mb));
      b.x += nx * overlap * (ma / (ma + mb));
      b.y += ny * overlap * (ma / (ma + mb));
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn >= 0) continue;
      const jImp = (-(1 + RESTITUTION) * vn) / (1 / ma + 1 / mb);
      a.vx -= (jImp / ma) * nx;
      a.vy -= (jImp / ma) * ny;
      b.vx += (jImp / mb) * nx;
      b.vy += (jImp / mb) * ny;
      // A dash hit sends the other one flying (less if it's bracing) and stuns it.
      let dash = false;
      for (const [hitter, hit, sign] of [[a, b, 1], [b, a, -1]] as const) {
        if (hitter.dashT <= 0) continue;
        const toward = ((hitter.vx * nx + hitter.vy * ny) * sign) > 0;
        if (!toward) continue;
        dash = true;
        const push = DASH_HIT / massOf(hit);
        hit.vx += nx * sign * push;
        hit.vy += ny * sign * push;
        hit.stunT = hit.bracing ? STUN_TIME * 0.3 : STUN_TIME;
        hit.hits += 1;
        hitter.dashT = 0;
      }
      a.lastBy = b.id;
      a.lastAt = t;
      b.lastBy = a.id;
      b.lastAt = t;
      ev.bumps.push({ a: a.id, b: b.id, power: -vn, dash, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
  }

  // Over the edge: the center left the island.
  for (const b of live) {
    if (Math.hypot(b.x, b.y) > radius) {
      b.falling = 1e-6;
      b.bracing = false;
      ev.falls.push(b.id);
    }
  }
  return ev;
}

/** Who pushed `b` off, if someone touched it in the last seconds. */
export function pusherOf(b: Body, t: number): string {
  return b.lastBy && t - b.lastAt < 3 ? b.lastBy : "";
}

// ---- Bots ---------------------------------------------------------------

export type BotLevel = "facil" | "normal" | "dificil";
export const BOT_LEVELS: BotLevel[] = ["facil", "normal", "dificil"];

const LEVELS: Record<BotLevel, { react: number; aim: number; dash: number; brace: number; care: number; speed: number }> = {
  facil: { react: 0.45, aim: 0.45, dash: 0.35, brace: 0.15, care: 1.4, speed: 0.7 },
  normal: { react: 0.28, aim: 0.22, dash: 0.7, brace: 0.45, care: 2, speed: 0.9 },
  dificil: { react: 0.16, aim: 0.1, dash: 0.95, brace: 0.8, care: 2.4, speed: 1 },
};

export interface BotBrain {
  level: BotLevel;
  /** Time left until it thinks again, and what it decided. */
  wait: number;
  input: PadInput;
  /** Its favorite target, for a while. */
  target: string;
  rng: () => number;
}

export function newBrain(level: BotLevel, rng: () => number): BotBrain {
  return { level, wait: rng() * 0.3, input: { ...IDLE }, target: "", rng };
}

/**
 * A bot's input this step. It thinks every `react` seconds: back to the
 * middle when close to the edge; otherwise it picks someone, goes around to
 * the middle's side of them and dashes when the push points to the water.
 */
export function botInput(me: Body, bodies: Body[], brain: BotBrain, radius: number, dt: number): PadInput {
  const L = LEVELS[brain.level];
  // A dash is pressed for one step only.
  brain.input.dash = false;
  brain.wait -= dt;
  if (brain.wait > 0) return brain.input;
  brain.wait = L.react * (0.7 + brain.rng() * 0.6);
  const rnd = brain.rng;
  const d = Math.hypot(me.x, me.y);
  const others = bodies.filter((b) => b.id !== me.id && onIsland(b));
  const steer = (x: number, y: number, k = 1) => {
    const n = Math.hypot(x, y) || 1;
    return { x: (x / n) * k * L.speed, y: (y / n) * k * L.speed };
  };

  // Someone dashing at me, close: brace (sometimes).
  const threat = others.find((o) => {
    const dx = me.x - o.x;
    const dy = me.y - o.y;
    const dist = Math.hypot(dx, dy);
    return o.dashT > 0 && dist < 3 && (o.vx * dx + o.vy * dy) / (dist || 1) > 6;
  });
  if (threat && me.grip > GRIP_MIN && rnd() < L.brace) {
    const s = steer(-me.x, -me.y, 0.6);
    brain.input = { x: s.x, y: s.y, dash: false, brace: true };
    return brain.input;
  }

  // Too close to the edge: back to the middle (dashing if it's going out fast).
  const margin = Math.min(L.care, radius * 0.45);
  if (d > radius - margin) {
    const out = (me.vx * me.x + me.vy * me.y) / (d || 1);
    const s = steer(-me.x, -me.y);
    const dashBack = out > 3 && me.cool <= 0 && rnd() < L.dash;
    brain.input = { x: s.x, y: s.y, dash: dashBack, brace: false };
    return brain.input;
  }

  if (!others.length) {
    const s = steer(-me.x, -me.y, d > 1 ? 0.5 : 0);
    brain.input = { x: s.x, y: s.y, dash: false, brace: false };
    return brain.input;
  }

  // Keep a target for a while; prefer those close to me and to the edge.
  let target = others.find((o) => o.id === brain.target);
  if (!target || rnd() < 0.08) {
    let best = Infinity;
    for (const o of others) {
      const score = Math.hypot(o.x - me.x, o.y - me.y) - (Math.hypot(o.x, o.y) / Math.max(1, radius)) * 3 + rnd() * 1.5;
      if (score < best) {
        best = score;
        target = o;
      }
    }
    brain.target = target!.id;
  }
  const t = target!;
  const td = Math.hypot(t.x, t.y);
  // The way out for them: from the middle through them (or from me through them, in the middle).
  const ux = td > 0.8 ? t.x / td : (t.x - me.x) / (Math.hypot(t.x - me.x, t.y - me.y) || 1);
  const uy = td > 0.8 ? t.y / td : (t.y - me.y) / (Math.hypot(t.x - me.x, t.y - me.y) || 1);
  const behindX = t.x - ux * 1.8;
  const behindY = t.y - uy * 1.8;
  const tx = t.x - me.x;
  const ty = t.y - me.y;
  const dist = Math.hypot(tx, ty);
  // Lined up: me → them points to the water.
  const lined = (tx * ux + ty * uy) / (dist || 1) > 0.8;
  if (lined && dist < 3.4 && me.cool <= 0 && rnd() < L.dash) {
    const err = (rnd() - 0.5) * 2 * L.aim;
    const a = Math.atan2(ty, tx) + err;
    brain.input = { x: Math.cos(a), y: Math.sin(a), dash: true, brace: false };
    return brain.input;
  }
  const goX = lined ? tx : behindX - me.x;
  const goY = lined ? ty : behindY - me.y;
  const err = (rnd() - 0.5) * L.aim;
  const a = Math.atan2(goY, goX) + err;
  const s = steer(Math.cos(a), Math.sin(a));
  brain.input = { x: s.x, y: s.y, dash: false, brace: false };
  return brain.input;
}
