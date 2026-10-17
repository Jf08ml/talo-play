import YoNuncaClient from "./YoNuncaClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("yonunca", roomId.toUpperCase());
}

export default async function YoNuncaRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <YoNuncaClient roomId={roomId.toUpperCase()} />;
}
