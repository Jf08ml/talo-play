import LadrillazoClient from "./LadrillazoClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("ladrillazo", roomId.toUpperCase());
}

export default async function LadrillazoRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <LadrillazoClient roomId={roomId.toUpperCase()} />;
}
