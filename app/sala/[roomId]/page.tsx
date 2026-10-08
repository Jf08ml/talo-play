import SalaRedirect from "./SalaRedirect";
import { inviteMetadata } from "@/lib/inviteMetadata";

export async function generateMetadata({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return inviteMetadata(null, roomId.toUpperCase());
}

// Game-agnostic entry point for a room code: old shared links (/sala/X were
// always puzzles) and the "Unirse" form land here and get sent to the room's game.
export default async function SalaPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <SalaRedirect roomId={roomId.toUpperCase()} />;
}
