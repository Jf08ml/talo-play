import DibujoClient from "./DibujoClient";

export default async function DibujoRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <DibujoClient roomId={roomId.toUpperCase()} />;
}
