import GolpeClient from "./GolpeClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("golpe", roomId.toUpperCase());
}

export default async function GolpeRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <GolpeClient roomId={roomId.toUpperCase()} />;
}
