import CajasClient from "./CajasClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("cajas", roomId.toUpperCase());
}

export default async function CajasRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <CajasClient roomId={roomId.toUpperCase()} />;
}
