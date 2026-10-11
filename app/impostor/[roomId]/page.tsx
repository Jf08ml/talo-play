import ImpostorClient from "./ImpostorClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("impostor", roomId.toUpperCase());
}

export default async function ImpostorRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <ImpostorClient roomId={roomId.toUpperCase()} />;
}
