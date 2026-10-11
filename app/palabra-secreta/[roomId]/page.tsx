import PalabraClient from "./PalabraClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("palabra", roomId.toUpperCase());
}

export default async function PalabraRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <PalabraClient roomId={roomId.toUpperCase()} />;
}
