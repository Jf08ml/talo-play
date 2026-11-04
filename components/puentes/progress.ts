// Solo progress, only in this browser: the furthest level reached and
// today's challenge.

const LEVEL_KEY = "puentes.nivel";
const DAY_KEY = "puentes.dia";

export function readLevel(): number {
  try {
    return Math.max(1, Number(localStorage.getItem(LEVEL_KEY)) || 1);
  } catch {
    return 1;
  }
}

export function saveLevel(level: number) {
  try {
    if (level > readLevel()) localStorage.setItem(LEVEL_KEY, String(level));
  } catch {
    // No storage: progress just isn't kept.
  }
}

/** Today's challenge seen but not finished (left halfway). */
export const STARTED = -2;

/** Today's challenge here: ms when solved, −1 when failed, `STARTED`, or null if not played. */
export function readDay(day: string): number | null {
  try {
    const raw = JSON.parse(localStorage.getItem(DAY_KEY) ?? "null") as { day: string; ms: number } | null;
    return raw?.day === day ? raw.ms : null;
  } catch {
    return null;
  }
}

export function saveDay(day: string, ms: number) {
  try {
    localStorage.setItem(DAY_KEY, JSON.stringify({ day, ms }));
  } catch {
    // Same.
  }
}
