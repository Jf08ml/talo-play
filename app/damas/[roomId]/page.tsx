import DamasClient from "./DamasClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("damas", roomId.toUpperCase());
}

export default async function DamasRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <DamasClient roomId={roomId.toUpperCase()} />;
}
