import ScreenClient from "@/components/carreras/ScreenClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("carreras", roomId.toUpperCase());
}

export default async function ScreenPage({ params }: Props) {
  const { roomId } = await params;
  return <ScreenClient game="carreras" roomId={roomId.toUpperCase()} />;
}
