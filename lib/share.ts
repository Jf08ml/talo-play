import { GAMES, roomPath, type GameId } from "./games";

// Invites: the room's game URL (so the preview names the game) plus a
// ready-to-send message.

export function inviteUrl(game: GameId, roomId: string): string {
  return `${window.location.origin}${roomPath(game, roomId)}`;
}

export function inviteText(game: GameId, roomId: string): string {
  return `¡Vení a jugar ${GAMES[game].title} conmigo en Talo! 🎲 Sala ${roomId}`;
}

export function whatsappUrl(game: GameId, roomId: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${inviteText(game, roomId)}\n${inviteUrl(game, roomId)}`)}`;
}

export function canNativeShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * Opens the phone's share sheet when there is one, otherwise copies the link.
 * Resolves to what happened ("cancelled" if the user closed the sheet).
 */
export async function shareInvite(game: GameId, roomId: string): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  const url = inviteUrl(game, roomId);
  if (canNativeShare()) {
    try {
      await navigator.share({ title: "Talo", text: inviteText(game, roomId), url });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }
  return copyInvite(game, roomId);
}

export async function copyInvite(game: GameId, roomId: string): Promise<"copied" | "failed"> {
  try {
    await navigator.clipboard.writeText(inviteUrl(game, roomId));
    return "copied";
  } catch {
    return "failed";
  }
}
