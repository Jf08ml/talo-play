import EmojisClient from "./EmojisClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("emojis", roomId.toUpperCase());
}

export default async function EmojisRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <EmojisClient roomId={roomId.toUpperCase()} />;
}
