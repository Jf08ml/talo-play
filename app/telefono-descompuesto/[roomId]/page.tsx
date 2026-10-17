import TelefonoClient from "./TelefonoClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("telefono", roomId.toUpperCase());
}

export default async function TelefonoRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <TelefonoClient roomId={roomId.toUpperCase()} />;
}
