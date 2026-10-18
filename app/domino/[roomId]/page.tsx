import DominoClient from "./DominoClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("domino", roomId.toUpperCase());
}

export default async function DominoRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <DominoClient roomId={roomId.toUpperCase()} />;
}
