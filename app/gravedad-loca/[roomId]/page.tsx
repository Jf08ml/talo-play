import GravedadClient from "./GravedadClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("gravedad", roomId.toUpperCase());
}

export default async function GravedadRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <GravedadClient roomId={roomId.toUpperCase()} />;
}
