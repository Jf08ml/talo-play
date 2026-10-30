// How much each game is played, for the home's "Los que más se juegan".
//
// `rooms/_stats/plays/{game}` counts people entering a room of that game:
// once per browser and room (remembered in localStorage), by transaction.
// It lives under `rooms/` because that's what the database rules open; like
// `_index`, a key with "_" can't clash with a room code and the cleanup skips
// it (lib/roomCleanup.ts).

import { get, ref, runTransaction } from "firebase/database";
import { getDb } from "./firebase";
import { GAME_ORDER, type GameId } from "./games";

const STATS = "rooms/_stats/plays";

/** Counts this browser entering `roomId` (a no-op after the first time). */
export function countPlay(game: GameId, roomId: string) {
  const key = `talo.jugada.${roomId}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    return; // no storage: don't count, rather than count every visit
  }
  runTransaction(ref(getDb(), `${STATS}/${game}`), (n: number | null) => (n ?? 0) + 1).catch(() => {});
}

export type PlayStats = Partial<Record<GameId, number>>;

export async function getPlayStats(): Promise<PlayStats> {
  const snap = await get(ref(getDb(), STATS));
  return (snap.val() as PlayStats | null) ?? {};
}

/** Below this many plays in total the ranking says little: the curated picks stay. */
export const MIN_PLAYS = 30;

/**
 * The `n` most played games. Until there are `MIN_PLAYS` plays in all, it's
 * `fallback`; ties keep the catalog's order.
 */
export function mostPlayed(stats: PlayStats, n: number, fallback: GameId[]): GameId[] {
  const total = Object.values(stats).reduce((a, b) => a + (b ?? 0), 0);
  if (total < MIN_PLAYS) return fallback;
  return [...GAME_ORDER].sort((a, b) => (stats[b] ?? 0) - (stats[a] ?? 0)).slice(0, n);
}
