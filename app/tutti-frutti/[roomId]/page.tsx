import TuttiClient from "./TuttiClient";

export default async function TuttiRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <TuttiClient roomId={roomId.toUpperCase()} />;
}
