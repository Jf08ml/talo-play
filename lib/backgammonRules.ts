/**
 * Backgammon rules, pure. The board is `points[0..23]` for points 1–24 seen
 * from seat `a`: positive counts are `a`'s checkers, negative `b`'s. `a`
 * moves 24 → 1 and bears off from 1–6; `b` the other way.
 *
 * Moves are reasoned about in each seat's own coordinate `q` (1–24, where
 * `q` = the point for `a` and 25 − point for `b`): everybody moves `q → q − die`,
 * home is `q` 1–6, the bar is `q` = 25 and borne off is `q` ≤ 0.
 *
 * You must use as many dice as possible; if only one of two different dice
 * can be used, it must be the larger one when that is possible.
 */

import type { Seat2 } from "./twoSeats";

export type Seat = Seat2;
export const CHECKERS = 15;
export const BAR = 25;
export const OFF = 0;

export interface Position {
  points: number[];
  bar: Record<Seat, number>;
  off: Record<Seat, number>;
}

export interface Step {
  /** Own coordinate the checker leaves (25 = bar). */
  from: number;
  /** Own coordinate it lands on (0 = borne off). */
  to: number;
  die: number;
  hit: boolean;
}

export function initialPosition(): Position {
  const points = Array<number>(24).fill(0);
  const put = (point: number, n: number) => (points[point - 1] = n);
  put(24, 2);
  put(13, 5);
  put(8, 3);
  put(6, 5);
  put(1, -2);
  put(12, -5);
  put(17, -3);
  put(19, -5);
  return { points, bar: { a: 0, b: 0 }, off: { a: 0, b: 0 } };
}

/** Physical point (1–24) of seat's own coordinate q. */
export const pointOf = (seat: Seat, q: number) => (seat === "a" ? q : 25 - q);

/** Seat's own checkers at own coordinate q. */
export function ownAt(pos: Position, seat: Seat, q: number): number {
  const v = pos.points[pointOf(seat, q) - 1];
  return seat === "a" ? Math.max(v, 0) : Math.max(-v, 0);
}

/** Rival checkers at seat's own coordinate q. */
export function rivalAt(pos: Position, seat: Seat, q: number): number {
  const v = pos.points[pointOf(seat, q) - 1];
  return seat === "a" ? Math.max(-v, 0) : Math.max(v, 0);
}

const other = (s: Seat): Seat => (s === "a" ? "b" : "a");

function allHome(pos: Position, seat: Seat): boolean {
  if (pos.bar[seat] > 0) return false;
  for (let q = 7; q <= 24; q++) if (ownAt(pos, seat, q) > 0) return false;
  return true;
}

/** Legal single steps with one die, ignoring the use-all-dice rule. */
export function stepsWithDie(pos: Position, seat: Seat, die: number): Step[] {
  if (pos.bar[seat] > 0) {
    const to = BAR - die;
    const rivals = rivalAt(pos, seat, to);
    return rivals >= 2 ? [] : [{ from: BAR, to, die, hit: rivals === 1 }];
  }
  const out: Step[] = [];
  const home = allHome(pos, seat);
  for (let q = 24; q >= 1; q--) {
    if (ownAt(pos, seat, q) === 0) continue;
    const t = q - die;
    if (t >= 1) {
      const rivals = rivalAt(pos, seat, t);
      if (rivals < 2) out.push({ from: q, to: t, die, hit: rivals === 1 });
    } else if (home) {
      // Exact, or a higher die when no checker sits further back.
      let further = false;
      for (let h = q + 1; h <= 6; h++) if (ownAt(pos, seat, h) > 0) further = true;
      if (t === 0 || !further) out.push({ from: q, to: OFF, die, hit: false });
    }
  }
  return out;
}

export function applyStep(pos: Position, seat: Seat, step: Step): Position {
  const points = [...pos.points];
  const bar = { ...pos.bar };
  const off = { ...pos.off };
  const sign = seat === "a" ? 1 : -1;
  if (step.from === BAR) bar[seat]--;
  else points[pointOf(seat, step.from) - 1] -= sign;
  if (step.to === OFF) off[seat]++;
  else {
    const i = pointOf(seat, step.to) - 1;
    if (step.hit) {
      points[i] = 0;
      bar[other(seat)]++;
    }
    points[i] += sign;
  }
  return { points, bar, off };
}

const withoutOne = (dice: number[], d: number) => {
  const i = dice.indexOf(d);
  return [...dice.slice(0, i), ...dice.slice(i + 1)];
};

/** Most dice that can still be used from here. */
function maxUsable(pos: Position, seat: Seat, dice: number[]): number {
  if (dice.length === 0 || pos.off[seat] === CHECKERS) return 0;
  let best = 0;
  for (const d of new Set(dice)) {
    for (const step of stepsWithDie(pos, seat, d)) {
      best = Math.max(best, 1 + maxUsable(applyStep(pos, seat, step), seat, withoutOne(dice, d)));
      if (best === dice.length) return best;
    }
  }
  return best;
}

/** The steps that can be played now with the remaining dice, all rules applied. */
export function legalSteps(pos: Position, seat: Seat, dice: number[]): Step[] {
  if (dice.length === 0 || pos.off[seat] === CHECKERS) return [];
  const scored: { step: Step; used: number }[] = [];
  for (const d of new Set(dice)) {
    for (const step of stepsWithDie(pos, seat, d)) {
      scored.push({ step, used: 1 + maxUsable(applyStep(pos, seat, step), seat, withoutOne(dice, d)) });
    }
  }
  const best = Math.max(0, ...scored.map((s) => s.used));
  let steps = scored.filter((s) => s.used === best).map((s) => s.step);
  // Only one of two different dice can be used: the larger one if possible.
  if (best === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const high = Math.max(...dice);
    if (steps.some((s) => s.die === high)) steps = steps.filter((s) => s.die === high);
  }
  return steps;
}

/** Pips each side still has to travel. */
export function pipCount(pos: Position, seat: Seat): number {
  let n = pos.bar[seat] * BAR;
  for (let q = 1; q <= 24; q++) n += ownAt(pos, seat, q) * q;
  return n;
}

/** 1 simple, 2 gammon, 3 backgammon, for `winner` having borne everything off. */
export function winKind(pos: Position, winner: Seat): 1 | 2 | 3 {
  const loser = other(winner);
  if (pos.off[loser] > 0) return 1;
  if (pos.bar[loser] > 0) return 3;
  // Loser checkers in the winner's home board are the loser's q 19–24.
  for (let q = 19; q <= 24; q++) if (ownAt(pos, loser, q) > 0) return 3;
  return 2;
}

export function encodePosition(pos: Position): string {
  return [pos.points.join(","), pos.bar.a, pos.bar.b, pos.off.a, pos.off.b].join("|");
}

export function decodePosition(s: string | undefined): Position {
  const parts = (s ?? "").split("|");
  const points = (parts[0] ?? "").split(",").map(Number);
  if (parts.length !== 5 || points.length !== 24 || points.some((n) => !Number.isInteger(n))) return initialPosition();
  const [, ba, bb, oa, ob] = parts.map(Number);
  return { points, bar: { a: ba, b: bb }, off: { a: oa, b: ob } };
}
