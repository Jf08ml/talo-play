import OndaClient from "./OndaClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("onda", roomId.toUpperCase());
}

export default async function OndaRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <OndaClient roomId={roomId.toUpperCase()} />;
}
