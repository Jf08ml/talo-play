import TuttiClient from "./TuttiClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("tutti", roomId.toUpperCase());
}

export default async function TuttiRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <TuttiClient roomId={roomId.toUpperCase()} />;
}
