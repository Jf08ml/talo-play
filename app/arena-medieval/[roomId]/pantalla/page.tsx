import ArenaScreen from "@/components/arena/Screen";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("arena", roomId.toUpperCase());
}

export default async function ArenaScreenPage({ params }: Props) {
  const { roomId } = await params;
  return <ArenaScreen roomId={roomId.toUpperCase()} />;
}
