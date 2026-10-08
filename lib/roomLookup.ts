import { ref, get } from "firebase/database";
import { getDb } from "./firebase";
import { GAMES, type GameId } from "./games";

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

/** The room's host (whoever created it), or "" for rooms from before hosts existed. */
export async function getRoomHost(roomId: string): Promise<string> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta/hostId`));
  return (snap.val() as string | null) ?? "";
}
