import AjedrezClient from "./AjedrezClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("ajedrez", roomId.toUpperCase());
}

export default async function AjedrezRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <AjedrezClient roomId={roomId.toUpperCase()} />;
}
