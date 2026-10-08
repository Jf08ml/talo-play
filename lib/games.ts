import { ref, get } from "firebase/database";
import { getDb } from "./firebase";

/**
 * Catalog of the salón's games. Every room stores its game in
 * `rooms/{id}/meta/game`; room codes are global, so one code is enough to
 * find (and redirect to) any game's room.
 */
export type GameId = "rompecabezas" | "memotest" | "tutti";

export interface GameInfo {
  id: GameId;
  emoji: string;
  title: string;
  /** URL segment: the lobby lives at `/{path}` and rooms at `/{path}/{roomId}`. */
  path: string;
}

export const GAMES: Record<GameId, GameInfo> = {
  rompecabezas: {
    id: "rompecabezas",
    emoji: "🧩",
    title: "Rompecabezas Colaborativo",
    path: "rompecabezas",
  },
  memotest: {
    id: "memotest",
    emoji: "🃏",
    title: "Memotest",
    path: "memotest",
  },
  tutti: {
    id: "tutti",
    emoji: "📝",
    title: "Tutti Frutti",
    path: "tutti-frutti",
  },
};

export function roomPath(game: GameId, roomId: string): string {
  return `/${GAMES[game].path}/${roomId}`;
}

/**
 * Which game a room belongs to, or null if the room doesn't exist. Rooms
 * created before `game` existed are always puzzles.
 */
export async function getRoomGame(roomId: string): Promise<GameId | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  if (!snap.exists()) return null;
  const game = (snap.val() as { game?: string }).game;
  return game && game in GAMES ? (game as GameId) : "rompecabezas";
}
