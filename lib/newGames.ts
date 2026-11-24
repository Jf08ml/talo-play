import { GAME_ORDER, GAMES, type GameId } from "./games";

/**
 * "Juegos nuevos": a game is new for NEW_DAYS after its catalog `addedAt`.
 * Pure data + the clock, so it ends by itself; call it from the browser
 * (after mount) so static pages don't freeze the build day's answer.
 */

export const NEW_DAYS = 21;
const DAY_MS = 86_400_000;

/** Midnight of the release day in Argentina (UTC−3). */
const releaseMs = (day: string) => Date.parse(`${day}T00:00:00-03:00`);

export function isNew(game: GameId, now = Date.now()): boolean {
  const day = GAMES[game].addedAt;
  return !!day && now - releaseMs(day) < NEW_DAYS * DAY_MS && now >= releaseMs(day);
}

/** The new games, newest first (same day: the one placed later in GAME_ORDER, usually the latest added). */
export function newGames(now = Date.now()): GameId[] {
  return GAME_ORDER.filter((id) => isNew(id, now))
    .reverse()
    .sort((a, b) => releaseMs(GAMES[b].addedAt!) - releaseMs(GAMES[a].addedAt!));
}

/** "Llegó hoy", "ayer", "hace 5 días". */
export function arrivedText(game: GameId, now = Date.now()): string {
  const day = GAMES[game].addedAt;
  if (!day) return "";
  const days = Math.floor((now - releaseMs(day)) / DAY_MS);
  return days <= 0 ? "Llegó hoy" : days === 1 ? "Llegó ayer" : `Llegó hace ${days} días`;
}

// ---- "Nuevo en Talo" notice (lib side, shared with IdeasButton) ----

/** The newest game this browser was told about. */
const SEEN_KEY = "talo.nuevo.visto";
/** Someone who played before (has a name): only they get the notice. */
const NAME_KEY = "salon.playerName";

/** The newest game to announce to this browser, or null. First visits are quietly marked. */
export function gameToAnnounce(): GameId | null {
  try {
    const newest = newGames()[0];
    if (!newest) return null;
    const seen = localStorage.getItem(SEEN_KEY);
    if (seen === newest) return null;
    if (!seen && !localStorage.getItem(NAME_KEY)) {
      // A first visit: everything is new to them, the home shows it already.
      localStorage.setItem(SEEN_KEY, newest);
      return null;
    }
    return newest;
  } catch {
    return null;
  }
}

export function markAnnounced(game: GameId) {
  try {
    localStorage.setItem(SEEN_KEY, game);
  } catch {
    // Private mode: it may show again.
  }
}
