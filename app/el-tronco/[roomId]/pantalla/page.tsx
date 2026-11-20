import ScreenClient from "./ScreenClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("tronco", roomId.toUpperCase());
}

/** The big screen (a computer on a TV): the ring for everyone, the phones are the controllers. */
export default async function TroncoScreenPage({ params }: Props) {
  const { roomId } = await params;
  return <ScreenClient roomId={roomId.toUpperCase()} />;
}
