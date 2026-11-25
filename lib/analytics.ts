import { sendGAEvent } from "@next/third-parties/google";
import type { GameId } from "./games";
import { countDailyRoom } from "./dailyStats";

/**
 * Google Analytics events. GA only loads in production builds (`app/layout.tsx`),
 * so this is a no-op in dev. Every event carries `game` so reports can be split by game.
 *
 * - `create_room`: someone created a room from a lobby.
 * - `join_room`: someone reached a room's waiting screen (`host` = it's the creator).
 * - `enter_room`: someone entered a room (once per browser and room, `lib/playStats.ts`): the
 *   best "people playing" count, rooms without a waiting room (puzzle, online worlds) included.
 * - `start_game`: "Empezar partida" was tapped.
 * - `share`: an invite was sent (`method`: whatsapp / nativo / copiar / header / amigo).
 * - `login`: someone signed in to an account; `add_friend`: a friend request was sent or accepted.
 * - `edit_room`: the host saved new settings from the waiting room.
 * - `open_rules`: someone opened a game's full instructions (`where`: lobby / sala / partida).
 * - `feedback`: someone sent an idea from the community page (`kind`: juego / mejora / error / otro).
 * - `plaza_message` / `plaza_call` / `plaza_join`: a message in the Plaza (`kind`: frase / texto), a waiting room asking it for players, someone joining a room from it.
 * - `open_room_join`: someone entered a room from a list of open rooms (`where`: inicio / lobby / plaza).
 * - `page_not_found`: a 404 (`path` = the broken URL).
 * - `install_app`: the «Instalar Talo» button (`step`: prompt / ios / accepted).
 * - `push_toggle`: notifications turned on or off on a device.
 * - `quick_play`: a game picked in the home's «Jugar ya» (`random` = from «Sorpréndeme»).
 *
 * `create_room` also counts the room in our own per-day stats (lib/dailyStats.ts).
 * Page views are sent by `PageViews` (components/PageViews.tsx), not here.
 */
type Events = {
  create_room: { game: GameId; mode?: string };
  join_room: { game: GameId; host: boolean };
  enter_room: { game: GameId };
  start_game: { game: GameId; players: number };
  share: { game: GameId; method: "whatsapp" | "nativo" | "copiar" | "header" | "amigo" };
  login: { method: "google" };
  add_friend: { result: string };
  edit_room: { game: GameId };
  open_rules: { game: GameId; where: "lobby" | "sala" | "partida" };
  feedback: { kind: string };
  plaza_message: { kind: "frase" | "texto" };
  plaza_call: { game: GameId };
  plaza_join: { game: GameId };
  open_room_join: { game: GameId; where: "inicio" | "lobby" | "plaza" };
  plaza_open: { where: "boton" | "inicio" | "sala" | "link" };
  page_not_found: { path: string };
  quick_play: { game: GameId; random: boolean };
  install_app: { step: "prompt" | "ios" | "accepted" };
  push_toggle: { on: boolean };
};

export function trackEvent<E extends keyof Events>(name: E, params: Events[E]): void {
  if (process.env.NODE_ENV !== "production") return;
  if (name === "create_room") countDailyRoom((params as Events["create_room"]).game);
  try {
    sendGAEvent("event", name, params);
  } catch {
    // Analytics must never break a game.
  }
}
