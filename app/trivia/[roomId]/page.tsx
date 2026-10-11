import TriviaClient from "./TriviaClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("trivia", roomId.toUpperCase());
}

export default async function TriviaRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <TriviaClient roomId={roomId.toUpperCase()} />;
}
