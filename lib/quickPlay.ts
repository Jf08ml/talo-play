import type { GameId } from "./games";
import type { Opponent } from "./boardBot";

/**
 * «Jugar ya» (home): the games that start in seconds without friends. Duels
 * go through «Jugar en línea» (`lib/matchmaking.ts`: a person or a bot);
 * worlds are the public online rooms some games already keep. Each game's
 * module is imported only when picked, so the home stays light.
 */

export type QuickKind = "duelo" | "mundo";

export interface QuickGame {
  game: GameId;
  kind: QuickKind;
  /** The matchmaking queue (duels); the same one the game's lobby uses. */
  queue?: string;
}

export const QUICK_GAMES: QuickGame[] = [
  { game: "vibora", kind: "mundo" },
  { game: "ajedrez", kind: "duelo" },
  { game: "cuatro", kind: "duelo" },
  { game: "ladrillazo", kind: "mundo" },
  { game: "damas", kind: "duelo" },
  { game: "naval", kind: "duelo" },
  { game: "minigolf", kind: "mundo" },
  { game: "domino", kind: "duelo" },
  { game: "otelo", kind: "duelo" },
  { game: "tronco", kind: "mundo" },
  { game: "triqui", kind: "duelo", queue: "triqui-clasico" },
  { game: "backgammon", kind: "duelo" },
  { game: "puentes", kind: "mundo" },
  { game: "gravedad", kind: "mundo" },
];

/** Makes a duel's room against `vs` (same settings as the lobby's «En línea»). */
export async function createDuel(game: GameId, hostId: string, vs: Opponent): Promise<string> {
  switch (game) {
    case "triqui":
      return (await import("./triqui")).createTriquiRoom("clasico", hostId, vs);
    case "cuatro":
      return (await import("./cuatro")).createCuatroRoom(hostId, vs);
    case "otelo":
      return (await import("./otelo")).createOteloRoom(hostId, vs);
    case "damas":
      return (await import("./damas")).createDamasRoom(hostId, vs);
    case "ajedrez":
      return (await import("./ajedrez")).createAjedrezRoom(hostId, vs);
    case "naval":
      return (await import("./naval")).createNavalRoom(hostId, vs);
    case "backgammon":
      return (await import("./backgammon")).createBackgammonRoom(3, hostId, vs);
    case "domino":
      return (await import("./domino")).createDominoRoom(100, hostId, vs);
    default:
      throw new Error(`${game} is not a duel`);
  }
}

/** Enters a world game's busiest public room and returns its code. */
export async function enterWorld(game: GameId): Promise<string> {
  switch (game) {
    case "vibora":
      return (await import("./vibora")).enterOnline();
    case "ladrillazo":
      return (await import("./ladrillazo")).enterOnline();
    case "minigolf":
      return (await import("./minigolf")).enterOnline();
    case "puentes":
      return (await import("./puentesRoom")).enterOnline();
    case "tronco":
      return (await import("./troncoRoom")).enterOnline();
    case "gravedad":
      return (await import("./gravedadRoom")).enterOnline();
    default:
      throw new Error(`${game} has no online world`);
  }
}
