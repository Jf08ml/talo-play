import DuelClient from "./DuelClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("pasteleria", roomId.toUpperCase());
}

export default async function PasteleriaRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <DuelClient roomId={roomId.toUpperCase()} />;
}
