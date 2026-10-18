import BackgammonClient from "./BackgammonClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("backgammon", roomId.toUpperCase());
}

export default async function BackgammonRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <BackgammonClient roomId={roomId.toUpperCase()} />;
}
