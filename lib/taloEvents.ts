/**
 * The contract between the games and the talos layer (talo-handoff/talo-events.ts).
 *
 * RULE: game engines (lib/{game}.ts) import nothing from here. Screens only
 * feed this PUBLIC events, already shown to everyone and synced through the
 * room; this turns them into expressions and gazes. Switched off, every game
 * works exactly the same.
 *
 * Never send here: secret roles, cards in hand, the secret word, hidden
 * positions, scores not yet revealed, the local player's private info, nor
 * how long someone takes to decide.
 */
import type { TaloExpr } from "@/components/Talo";
import type { GameId } from "./games";

export type PlayerId = string;

export type PublicGameEvent =
  | { type: "player_joined"; playerId: PlayerId }
  | { type: "turn_changed"; playerId: PlayerId }
  | { type: "public_hit"; playerId: PlayerId } // a point, a guessed word, a visible hit
  | { type: "votes_revealed"; mostVoted: PlayerId; voters: PlayerId[] }
  | { type: "roles_revealed"; revealed: PlayerId[] } // only at the end / when the game shows them
  | { type: "round_ended"; winners: PlayerId[]; losers: PlayerId[] }
  | { type: "game_ended"; winner: PlayerId; others: PlayerId[] }
  | { type: "reset" }; // everyone back to "normal"

export interface TaloReaction {
  expr: TaloExpr;
  /** Who they look at. null = straight ahead. */
  lookAt: PlayerId | null;
}

export type TaloState = Record<PlayerId, TaloReaction>;

export const NEUTRAL: TaloReaction = { expr: "normal", lookAt: null };

/** Pure reducer: previous state + public event → the talos' new state. */
export function reduceTalos(players: PlayerId[], prev: TaloState, ev: PublicGameEvent): TaloState {
  const all = (r: TaloReaction): TaloState => Object.fromEntries(players.map((id) => [id, r]));
  switch (ev.type) {
    case "player_joined":
      return Object.fromEntries(
        players.map((id) => [id, id === ev.playerId ? NEUTRAL : { expr: "contento", lookAt: ev.playerId }])
      );
    case "turn_changed":
      return all({ expr: "normal", lookAt: ev.playerId });
    case "public_hit":
      return Object.fromEntries(
        players.map((id) => [
          id,
          id === ev.playerId ? { expr: "contento", lookAt: null } : { ...(prev[id] ?? NEUTRAL), lookAt: ev.playerId },
        ])
      );
    case "votes_revealed":
      return Object.fromEntries(
        players.map((id) => [
          id,
          id === ev.mostVoted ? { expr: "sorprendido", lookAt: null } : { expr: "sospechoso", lookAt: ev.mostVoted },
        ])
      );
    case "roles_revealed":
      return all({ expr: "sorprendido", lookAt: ev.revealed[0] ?? null });
    case "round_ended":
      return Object.fromEntries(
        players.map((id) => [
          id,
          {
            expr: ev.winners.includes(id) ? "contento" : ev.losers.includes(id) ? "triste" : "normal",
            lookAt: null,
          },
        ])
      );
    case "game_ended":
      return Object.fromEntries(
        players.map((id) => [
          id,
          id === ev.winner ? { expr: "ganador", lookAt: null } : { expr: "contento", lookAt: ev.winner },
        ])
      );
    case "reset":
    default:
      return all(NEUTRAL);
  }
}

/**
 * Games with hidden information: while a match is on, only these events are
 * allowed (the rest are ignored and the talos stay neutral).
 */
export const HIDDEN_INFO_GAMES: GameId[] = ["impostor", "lobo", "naval", "truco", "chinchon", "codigo", "palabra", "verdades"];
export const ALLOWED_DURING_HIDDEN: PublicGameEvent["type"][] = ["player_joined", "turn_changed", "reset"];

/** Whether `ev` may reach the talos of `game` right now (`playing` = a match is on). */
export function eventAllowed(game: GameId, playing: boolean, ev: PublicGameEvent): boolean {
  return !playing || !HIDDEN_INFO_GAMES.includes(game) || ALLOWED_DURING_HIDDEN.includes(ev.type);
}
