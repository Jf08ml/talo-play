import MemotestClient from "./MemotestClient";

export default async function MemotestRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <MemotestClient roomId={roomId.toUpperCase()} />;
}
