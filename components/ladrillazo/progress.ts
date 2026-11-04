import { CAMPAIGN } from "@/lib/ladrillazoLevels";

// Solo progress, only in this browser: stars per campaign level and the
// infinite mode's record.

const STARS_KEY = "ladrillazo.estrellas";
const RECORD_KEY = "ladrillazo.record";

export function readStars(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STARS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.map((n) => Number(n) || 0) : [];
  } catch {
    return [];
  }
}

export function saveStars(index: number, stars: number) {
  try {
    const all = readStars();
    all[index] = Math.max(all[index] ?? 0, stars);
    localStorage.setItem(STARS_KEY, JSON.stringify(Array.from({ length: CAMPAIGN.length }, (_, i) => all[i] ?? 0)));
  } catch {
    // No storage: progress just isn't kept.
  }
}

/** The first level not passed yet is the last one open. */
export function unlockedUpTo(stars: number[]): number {
  let i = 0;
  while (i < CAMPAIGN.length - 1 && (stars[i] ?? 0) > 0) i++;
  return i;
}

export function readRecord(): number {
  try {
    return Number(localStorage.getItem(RECORD_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveRecord(score: number) {
  try {
    if (score > readRecord()) localStorage.setItem(RECORD_KEY, String(score));
  } catch {
    // Same.
  }
}
