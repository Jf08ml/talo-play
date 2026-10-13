import VerdadesClient from "./VerdadesClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("verdades", roomId.toUpperCase());
}

export default async function VerdadesRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <VerdadesClient roomId={roomId.toUpperCase()} />;
}
