import ChinchonClient from "./ChinchonClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("chinchon", roomId.toUpperCase());
}

export default async function ChinchonRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <ChinchonClient roomId={roomId.toUpperCase()} />;
}
