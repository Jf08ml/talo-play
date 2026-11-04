import { mulberry32 } from "./random";

/**
 * El tronco, the engine (pure): players stand in a ring and a log turns
 * around the middle like a clock hand. When it reaches you, jump it or kick
 * it back (it turns the other way); miss and it knocks you down. The last
 * one standing wins.
 *
 * The log is never sent over the network: its angle at any moment follows
 * from the game's start, its seed and the list of kicks (server times). It
 * speeds up with time and, now and then, turns around on its own
 * (`reversals`, from the seed), shaking a moment before. Every phone draws
 * it from the same timeline, so everyone sees the same log.
 */

/** Radius of the ring where the players stand. */
export const RING = 4.2;
export const LOG_LENGTH = RING + 1.3;
const BASE_SPEED = 1.35;
const ACCEL = 0.032;
export const MAX_SPEED = 4.3;
/** A jump clears the log between these seconds after the press. */
export const JUMP_FROM = 0.05;
export const JUMP_TO = 0.45;
export const JUMP_LEN = 0.72;
/** A kick works when the log is at most this many seconds away. */
export const KICK_REACH = 0.26;
/** After a kick (good or whiffed) you can't do anything for a moment. */
export const KICK_RECOVER = 0.42;
/** The log shakes this long before turning around on its own. */
export const SHAKE_S = 0.7;

export interface Timeline {
  startedAt: number;
  seed: number;
  /** Server times of the kicks, in order. */
  kicks: number[];
  /** Speed multiplier (rápido = 1.25). */
  pace: number;
}

/** Radians of the log so far since the start (∫ speed), capped speed. */
function travelled(tl: Timeline, t: number): number {
  const s = Math.max(0, (t - tl.startedAt) / 1000);
  const cap = (MAX_SPEED - BASE_SPEED) / ACCEL; // seconds until top speed
  const a = Math.min(s, cap);
  let d = BASE_SPEED * a + (ACCEL * a * a) / 2;
  if (s > cap) d += MAX_SPEED * (s - cap);
  return d * tl.pace;
}

export function speedAt(tl: Timeline, t: number): number {
  const s = Math.max(0, (t - tl.startedAt) / 1000);
  return Math.min(MAX_SPEED, BASE_SPEED + ACCEL * s) * tl.pace;
}

/** When the log turns around on its own (server times), up to `until`. */
export function reversals(tl: Timeline, until: number): number[] {
  const rand = mulberry32(tl.seed ^ 0x51ed);
  const out: number[] = [];
  let t = tl.startedAt + 9000 + rand() * 6000;
  while (t < until) {
    out.push(t);
    t += 7000 + rand() * 9000;
  }
  return out;
}

function startAngle(tl: Timeline): number {
  return mulberry32(tl.seed)() * Math.PI * 2;
}

/** The log's angle and direction (1 counterclockwise, −1 clockwise) at time t. */
export function logAt(tl: Timeline, t: number): { angle: number; dir: 1 | -1 } {
  const events = [...tl.kicks.filter((k) => k < t), ...reversals(tl, t)].sort((a, b) => a - b);
  let angle = startAngle(tl);
  let dir: 1 | -1 = mulberry32(tl.seed + 1)() < 0.5 ? 1 : -1;
  if (t <= tl.startedAt) return { angle, dir };
  let prev = tl.startedAt;
  for (const e of events) {
    if (e <= tl.startedAt) continue;
    angle += dir * (travelled(tl, e) - travelled(tl, prev));
    dir = dir === 1 ? -1 : 1;
    prev = e;
  }
  angle += dir * (travelled(tl, t) - travelled(tl, prev));
  return { angle, dir };
}

/** Is the log about to turn around on its own (it shakes)? */
export function shaking(tl: Timeline, t: number): boolean {
  return reversals(tl, t + SHAKE_S * 1000).some((r) => r > t);
}

const TAU = Math.PI * 2;
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;
/** −π…π */
const wrapPi = (a: number) => wrap(a + Math.PI) - Math.PI;

/** Where each seat is (angle), for n seats. Seat 0 at the front. */
export function seatAngle(i: number, n: number): number {
  return Math.PI / 2 + (TAU * i) / n;
}

/** Seconds until the log reaches angle θ going the way it goes now (ignoring kicks to come). */
export function timeToReach(tl: Timeline, t: number, theta: number): number {
  const { angle, dir } = logAt(tl, t);
  const gap = wrap((theta - angle) * dir);
  return gap / Math.max(0.1, speedAt(tl, t));
}

/** Times the log passed over angle θ between t1 and t2 (sampled every 4 ms). */
export function crossings(tl: Timeline, theta: number, t1: number, t2: number): number[] {
  const out: number[] = [];
  let prev = wrapPi(logAt(tl, t1).angle - theta);
  for (let t = t1 + 4; t <= t2; t += 4) {
    const d = wrapPi(logAt(tl, t).angle - theta);
    if (Math.abs(d) < 0.6 && Math.abs(prev) < 0.6 && Math.sign(d) !== Math.sign(prev) && d !== prev) out.push(t);
    prev = d;
  }
  return out;
}

/** Does a kick at time t by the player at θ count (the log is coming and close)? */
export function kickWorks(tl: Timeline, t: number, theta: number): boolean {
  if (t < tl.startedAt) return false;
  return timeToReach(tl, t, theta) <= KICK_REACH;
}

/** Was the player in the air at time t (last jump pressed at `jumpAt`)? */
export function airborne(jumpAt: number, t: number): boolean {
  const s = (t - jumpAt) / 1000;
  return s >= JUMP_FROM && s <= JUMP_TO;
}

/** Height of a jump s seconds after the press (for drawing). */
export function jumpHeight(s: number): number {
  if (s < 0 || s > JUMP_LEN) return 0;
  const p = s / JUMP_LEN;
  return 4 * 1.25 * p * (1 - p);
}

// ---- Bots ------------------------------------------------------------------

export interface BotMind {
  /** The approach it already decided on (log arrival time, rounded), so it decides once per pass. */
  plan: number;
  action: "jump" | "kick" | "none";
  /** Seconds before arrival it acts. */
  lead: number;
}

export function newMind(): BotMind {
  return { plan: -1, action: "none", lead: 0 };
}

/**
 * What a bot does now: decides once per approach (jump, kick, or freeze —
 * more often as the log gets faster) and acts at its chosen moment.
 */
export function botAct(mind: BotMind, tl: Timeline, t: number, theta: number, skill: number): "jump" | "kick" | null {
  const ttc = timeToReach(tl, t, theta);
  if (ttc > 1.2) return null;
  const arrival = Math.round((t + ttc * 1000) / 150);
  if (mind.plan !== arrival) {
    mind.plan = arrival;
    const speed = speedAt(tl, t);
    const fumble = Math.max(0.02, 0.05 + (speed - 1.5) * 0.045 - skill * 0.05);
    const r = Math.random();
    mind.action = r < fumble ? "none" : r < fumble + (1 - fumble) * 0.45 ? "kick" : "jump";
    // Jumps a little early, kicks late; the error grows with speed.
    const jitter = (Math.random() - 0.5) * 0.08 * (1 + speed / 3);
    mind.lead = mind.action === "kick" ? Math.max(0.03, 0.14 + jitter) : Math.max(0.0, 0.2 + jitter);
  }
  if (mind.action !== "none" && ttc <= mind.lead) {
    const a = mind.action;
    mind.action = "none";
    return a;
  }
  return null;
}
