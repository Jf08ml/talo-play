import LoboClient from "./LoboClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("lobo", roomId.toUpperCase());
}

export default async function LoboRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <LoboClient roomId={roomId.toUpperCase()} />;
}
