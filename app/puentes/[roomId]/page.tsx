import PuentesClient from "./PuentesClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("puentes", roomId.toUpperCase());
}

export default async function PuentesRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <PuentesClient roomId={roomId.toUpperCase()} />;
}
