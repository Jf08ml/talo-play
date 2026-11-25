import {
  applyStep,
  encodePosition,
  ownAt,
  pipCount,
  rivalAt,
  stepsWithDie,
  type Position,
  type Seat,
  type Step,
} from "./backgammonRules";
import { mulberry32 } from "./random";
import type { BotLevel } from "./boardBot";

/**
 * Backgammon's computer rival. For a roll it lists every way to play the dice
 * (all the rules: as many dice as possible, the larger one when only one
 * fits), scores each final position and plays the best one step by step —
 * the room asks for one step at a time, and the same roll gives the same
 * plan, so the steps follow one plan. Lower levels judge worse and add noise
 * (seeded by the turn and each end position, so the plan doesn't change mid-turn).
 */

const other = (s: Seat): Seat => (s === "a" ? "b" : "a");

/** Whether any of `seat`'s checkers still has a rival checker ahead of it. */
function contact(pos: Position, seat: Seat): boolean {
  let back = 0;
  if (pos.bar[seat] > 0) back = 25;
  else for (let q = 24; q >= 1; q--) if (ownAt(pos, seat, q) > 0) { back = q; break; }
  // Rival checkers sit at my q = 25 − their q; any of them below my last checker is in the way.
  for (let q = 1; q < back; q++) if (rivalAt(pos, seat, q) > 0) return true;
  return pos.bar[other(seat)] > 0 && back > 0;
}

/**
 * How much a lone checker of mine at `q` can be hit: rival checkers 1–12 pips
 * before it. Rivals move up my coordinates (their bar is my 0).
 */
function exposure(pos: Position, me: Seat, q: number): number {
  let shots = 0;
  for (let d = 1; d <= 12; d++) {
    const from = q - d;
    if (from < 0) break;
    const rivals = from === 0 ? pos.bar[other(me)] : rivalAt(pos, me, from);
    if (rivals > 0) shots += d <= 6 ? 3 : 1;
  }
  return shots;
}

function evaluate(pos: Position, me: Seat, level: BotLevel): number {
  const rival = other(me);
  let s = (pipCount(pos, rival) - pipCount(pos, me)) * 1.2 + pos.off[me] * 4;
  if (!contact(pos, me)) return s;
  s += pos.bar[rival] * 14 - pos.bar[me] * 14;
  for (let q = 1; q <= 24; q++) {
    const n = ownAt(pos, me, q);
    if (n >= 2) s += q <= 7 ? (level === "facil" ? 3 : 8) : q >= 18 ? 5 : 3;
    if (n === 1) s -= level === "facil" ? 2 : 2 + exposure(pos, me, q) * (q <= 6 ? 2.5 : 1.5);
    if (n > 3) s -= (n - 3) * 1.5; // stacks waste checkers
  }
  // Primes: points made in a row in front of the rival.
  let run = 0;
  for (let q = 1; q <= 12; q++) {
    run = ownAt(pos, me, q) >= 2 ? run + 1 : 0;
    if (run >= 3) s += level === "dificil" ? run * 2 : run;
  }
  return s;
}

interface Plan {
  steps: Step[];
  pos: Position;
}

/** Every distinct end position for these dice, with the steps reaching it (the use-all-dice rules applied). */
function plans(pos: Position, seat: Seat, dice: number[]): Plan[] {
  const finals = new Map<string, Plan & { used: number; high: boolean }>();
  const seen = new Set<string>();
  const high = Math.max(...dice);
  const walk = (p: Position, left: number[], steps: Step[]) => {
    const key = `${encodePosition(p)}#${[...left].sort().join("")}`;
    if (seen.has(key)) return;
    seen.add(key);
    let moved = false;
    for (const d of new Set(left)) {
      for (const step of stepsWithDie(p, seat, d)) {
        moved = true;
        const i = left.indexOf(d);
        walk(applyStep(p, seat, step), [...left.slice(0, i), ...left.slice(i + 1)], [...steps, step]);
      }
    }
    if (!moved || left.length === 0 || p.off[seat] === 15) {
      // Kept apart by whether the larger die was used: the same end may be reached either way, and that rule tells them apart.
      const usedHigh = steps.some((x) => x.die === high);
      const k = `${encodePosition(p)}#${usedHigh}`;
      if (!finals.has(k)) finals.set(k, { steps, pos: p, used: steps.length, high: usedHigh });
    }
  };
  walk(pos, dice, []);
  const list = [...finals.values()];
  const most = Math.max(...list.map((x) => x.used));
  let best = list.filter((x) => x.used === most);
  if (most === 1 && dice.length === 2 && dice[0] !== dice[1] && best.some((x) => x.high)) best = best.filter((x) => x.high);
  return best;
}

/**
 * The next step of the bot's best play for `dice` (null if it can't move).
 * `turnKey` identifies the turn (its start and roll) for the noise.
 */
export function backgammonBotStep(pos: Position, seat: Seat, dice: number[], level: BotLevel, turnKey: string): Step | null {
  if (!dice.length) return null;
  const options = plans(pos, seat, dice).filter((p) => p.steps.length > 0);
  if (!options.length) return null;
  const noise = level === "facil" ? 25 : level === "normal" ? 6 : 0;
  let best = options[0];
  let bestScore = -Infinity;
  for (const p of options) {
    const jitter = noise ? (mulberry32(hash(`${turnKey}|${encodePosition(p.pos)}`))() - 0.5) * 2 * noise : 0;
    const score = evaluate(p.pos, seat, level) + jitter;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best.steps[0];
}

/** Whether the bot takes a double: unless it's well behind in the race or on the bar a lot. */
export function backgammonBotTakes(pos: Position, seat: Seat): boolean {
  const mine = pipCount(pos, seat);
  const theirs = pipCount(pos, other(seat));
  return mine <= theirs * 1.22 + 8 && pos.bar[seat] < 2;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
