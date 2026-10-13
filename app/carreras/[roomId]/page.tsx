import CarrerasClient from "./CarrerasClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("carreras", roomId.toUpperCase());
}

export default async function CarrerasRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <CarrerasClient roomId={roomId.toUpperCase()} />;
}
