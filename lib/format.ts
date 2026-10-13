/** Milliseconds as m:ss. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Milliseconds as m:ss.d (race times). */
export function formatRaceTime(ms: number): string {
  const tenths = Math.max(0, Math.floor(ms / 100));
  return `${formatClock(tenths * 100)}.${tenths % 10}`;
}
