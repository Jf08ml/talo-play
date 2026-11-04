import TroncoClient from "./TroncoClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("tronco", roomId.toUpperCase());
}

export default async function TroncoRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <TroncoClient roomId={roomId.toUpperCase()} />;
}
