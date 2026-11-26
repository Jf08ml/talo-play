import QuienClient from "./QuienClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("quiensoy", roomId.toUpperCase());
}

export default async function QuienSoyRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <QuienClient roomId={roomId.toUpperCase()} />;
}
