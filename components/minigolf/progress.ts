// Solo minigolf, kept only in this browser: the best course per difficulty
// (strokes against par) and today's holes.

import type { Difficulty } from "@/lib/minigolfHoles";

const RECORD_KEY = "minigolf.record";
const DAY_KEY = "minigolf.dia";

/** Best score against par per difficulty (−3 = three under). */
export function readRecords(): Partial<Record<Difficulty, number>> {
  try {
    return JSON.parse(localStorage.getItem(RECORD_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

/** Saves it if it's a new best; returns whether it was. */
export function saveRecord(d: Difficulty, toPar: number): boolean {
  try {
    const all = readRecords();
    if (all[d] !== undefined && all[d]! <= toPar) return false;
    localStorage.setItem(RECORD_KEY, JSON.stringify({ ...all, [d]: toPar }));
    return true;
  } catch {
    return false;
  }
}

/** Today's holes seen but not finished. */
export const STARTED = -1;

/** Today's round here: total strokes, `STARTED`, or null if not played. */
export function readDay(day: string): number | null {
  try {
    const raw = JSON.parse(localStorage.getItem(DAY_KEY) ?? "null") as { day: string; strokes: number } | null;
    return raw?.day === day ? raw.strokes : null;
  } catch {
    return null;
  }
}

export function saveDay(day: string, strokes: number) {
  try {
    localStorage.setItem(DAY_KEY, JSON.stringify({ day, strokes }));
  } catch {
    // No storage: it just isn't kept.
  }
}
