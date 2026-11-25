import { useEffect } from "react";
import { awardMatch, type MatchOutcome } from "@/lib/rank";
import type { GameId } from "@/lib/games";

/**
 * Adds my ranking points (lib/rank.ts) once a match ends: pass the outcome
 * when the end screen shows (null before, or when I didn't play it). The
 * award happens once per `matchKey` in this browser, so re-renders and
 * reloads are safe.
 */
export function useAwardMatch(game: GameId, roomId: string, matchKey: string | number, outcome: MatchOutcome | null) {
  const place = outcome?.place ?? null;
  const players = outcome?.players ?? 0;
  const botsOnly = !!outcome?.vsBotsOnly;
  const ready = !!outcome;
  useEffect(() => {
    if (!ready) return;
    awardMatch(game, roomId, matchKey, { place, players, vsBotsOnly: botsOnly });
  }, [ready, game, roomId, matchKey, place, players, botsOnly]);
}

/** My place in a final ranking (ties share the place), 0 if I'm not in it. */
export function placeIn(ranking: { id: string; score: number }[], myId: string, higherWins = true): number {
  const me = ranking.find((r) => r.id === myId);
  if (!me) return 0;
  return ranking.filter((r) => (higherWins ? r.score > me.score : r.score < me.score)).length + 1;
}
