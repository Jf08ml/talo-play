import RoomClient from "@/components/fuego/RoomClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("fuego", roomId.toUpperCase());
}

export default async function FuegoRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <RoomClient roomId={roomId.toUpperCase()} />;
}
