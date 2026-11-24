import EmpujonesScreen from "@/components/empujones/Screen";
import { inviteMetadata } from "@/lib/inviteMetadata";

type Props = { params: Promise<{ roomId: string }> };

export async function generateMetadata({ params }: Props) {
  const { roomId } = await params;
  return inviteMetadata("empujones", roomId.toUpperCase());
}

/** The big screen (a computer on a TV): the island for everyone, the phones are the controllers. */
export default async function EmpujonesScreenPage({ params }: Props) {
  const { roomId } = await params;
  return <EmpujonesScreen roomId={roomId.toUpperCase()} />;
}
