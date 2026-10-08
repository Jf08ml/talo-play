import type { Metadata } from "next";
import { GAMES, type GameId } from "./games";

/** Title/description for a room link, so a pasted invite previews as an invitation. */
export function inviteMetadata(game: GameId | null, roomId: string): Metadata {
  const title = game ? `¡Te invitaron a jugar ${GAMES[game].title}!` : "¡Te invitaron a jugar!";
  const description = `${game ? GAMES[game].tagline : "Juegos para jugar juntos."} Tocá el link, poné tu nombre y entrás a la sala ${roomId}.`;
  return {
    title,
    description,
    // A page's openGraph replaces the layout's whole object, image included, so it's repeated here.
    openGraph: { title: `${title} · Talo`, description, images: ["/opengraph-image"] },
  };
}
