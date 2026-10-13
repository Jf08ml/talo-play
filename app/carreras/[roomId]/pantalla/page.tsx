import PantallaClient from "./PantallaClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("carreras", roomId.toUpperCase());
}

export default async function CarrerasScreenPage({ params }: Props) {
  const { roomId } = await params;
  return <PantallaClient roomId={roomId.toUpperCase()} />;
}
