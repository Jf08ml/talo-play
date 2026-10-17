import TrucoClient from "./TrucoClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("truco", roomId.toUpperCase());
}

export default async function TrucoRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <TrucoClient roomId={roomId.toUpperCase()} />;
}
