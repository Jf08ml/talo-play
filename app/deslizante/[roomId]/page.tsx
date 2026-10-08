import DeslizanteClient from "./DeslizanteClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("deslizante", roomId.toUpperCase());
}

export default async function DeslizanteRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <DeslizanteClient roomId={roomId.toUpperCase()} />;
}
