import ConocesClient from "./ConocesClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("conoces", roomId.toUpperCase());
}

export default async function ConocesRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <ConocesClient roomId={roomId.toUpperCase()} />;
}
