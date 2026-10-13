import NavalClient from "./NavalClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("naval", roomId.toUpperCase());
}

export default async function NavalRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <NavalClient roomId={roomId.toUpperCase()} />;
}
