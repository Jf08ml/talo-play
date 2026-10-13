import ProbableClient from "./ProbableClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("probable", roomId.toUpperCase());
}

export default async function ProbableRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <ProbableClient roomId={roomId.toUpperCase()} />;
}
