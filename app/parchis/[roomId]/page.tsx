import LudoClient from "./LudoClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("ludo", roomId.toUpperCase());
}

export default async function LudoRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <LudoClient roomId={roomId.toUpperCase()} />;
}
