import MemotestClient from "./MemotestClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("memotest", roomId.toUpperCase());
}

export default async function MemotestRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <MemotestClient roomId={roomId.toUpperCase()} />;
}
