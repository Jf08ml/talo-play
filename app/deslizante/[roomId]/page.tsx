import DeslizanteClient from "./DeslizanteClient";

export default async function DeslizanteRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <DeslizanteClient roomId={roomId.toUpperCase()} />;
}
