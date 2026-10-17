import RoomClient from "@/components/carreras/RoomClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("carreras", roomId.toUpperCase());
}

export default async function RoomPage({ params }: Props) {
  const { roomId } = await params;
  return <RoomClient game="carreras" roomId={roomId.toUpperCase()} />;
}
