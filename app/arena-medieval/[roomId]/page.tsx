import RoomClient from "@/components/arena/RoomClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("arena", roomId.toUpperCase());
}

export default async function RoomPage({ params }: Props) {
  const { roomId } = await params;
  return <RoomClient roomId={roomId.toUpperCase()} />;
}
