import ViboraClient from "./ViboraClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("vibora", roomId.toUpperCase());
}

export default async function ViboritaRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <ViboraClient roomId={roomId.toUpperCase()} />;
}
