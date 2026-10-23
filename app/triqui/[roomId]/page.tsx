import TriquiClient from "./TriquiClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("triqui", roomId.toUpperCase());
}

export default async function TriquiRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <TriquiClient roomId={roomId.toUpperCase()} />;
}
