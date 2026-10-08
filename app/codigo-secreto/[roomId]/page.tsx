import CodigoClient from "./CodigoClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("codigo", roomId.toUpperCase());
}

export default async function CodigoRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <CodigoClient roomId={roomId.toUpperCase()} />;
}
