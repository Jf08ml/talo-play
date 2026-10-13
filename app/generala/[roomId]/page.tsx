import GeneralaClient from "./GeneralaClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("generala", roomId.toUpperCase());
}

export default async function GeneralaRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <GeneralaClient roomId={roomId.toUpperCase()} />;
}
