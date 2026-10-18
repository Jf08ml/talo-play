import OteloClient from "./OteloClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("otelo", roomId.toUpperCase());
}

export default async function OteloRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <OteloClient roomId={roomId.toUpperCase()} />;
}
