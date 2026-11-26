import FuegoScreen from "@/components/fuego/Screen";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("fuego", roomId.toUpperCase());
}

export default async function FuegoScreenPage({ params }: Props) {
  const { roomId } = await params;
  return <FuegoScreen roomId={roomId.toUpperCase()} />;
}
