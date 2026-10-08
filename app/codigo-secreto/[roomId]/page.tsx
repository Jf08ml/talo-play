import CodigoClient from "./CodigoClient";

export default async function CodigoRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <CodigoClient roomId={roomId.toUpperCase()} />;
}
