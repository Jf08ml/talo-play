import OcaClient from "./OcaClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("oca", roomId.toUpperCase());
}

export default async function OcaRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <OcaClient roomId={roomId.toUpperCase()} />;
}
