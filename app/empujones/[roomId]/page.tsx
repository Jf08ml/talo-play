import EmpujonesClient from "./EmpujonesClient";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("empujones", roomId.toUpperCase());
}

export default async function EmpujonesRoomPage({ params }: Props) {
  const { roomId } = await params;
  return <EmpujonesClient roomId={roomId.toUpperCase()} />;
}
