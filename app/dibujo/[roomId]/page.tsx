import DibujoClient from "./DibujoClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("dibujo", roomId.toUpperCase());
}

export default async function DibujoRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <DibujoClient roomId={roomId.toUpperCase()} />;
}
