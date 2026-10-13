import MimicaClient from "./MimicaClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("mimica", roomId.toUpperCase());
}

export default async function MimicaRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <MimicaClient roomId={roomId.toUpperCase()} />;
}
