import { sendGAEvent } from "@next/third-parties/google";
import type { GameId } from "./games";

/**
 * Google Analytics events. GA only loads in production builds (`app/layout.tsx`),
 * so this is a no-op in dev. Every event carries `game` so reports can be split by game.
 *
 * - `create_room`: someone created a room from a lobby.
 * - `join_room`: someone reached a room's waiting screen (`host` = it's the creator).
 * - `start_game`: "Empezar partida" was tapped.
 * - `share`: an invite was sent (`method`: whatsapp / nativo / copiar / header).
 */
type Events = {
  create_room: { game: GameId; mode?: string };
  join_room: { game: GameId; host: boolean };
  start_game: { game: GameId; players: number };
  share: { game: GameId; method: "whatsapp" | "nativo" | "copiar" | "header" };
};

export function trackEvent<E extends keyof Events>(name: E, params: Events[E]): void {
  if (process.env.NODE_ENV !== "production") return;
  try {
    sendGAEvent("event", name, params);
  } catch {
    // Analytics must never break a game.
  }
}
