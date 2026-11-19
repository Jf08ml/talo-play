import MinigolfClient from "./MinigolfClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("minigolf", roomId.toUpperCase());
}

export default async function MinigolfRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <MinigolfClient roomId={roomId.toUpperCase()} />;
}
