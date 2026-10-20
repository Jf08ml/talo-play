import BakeryGame from "@/components/bakery/BakeryGame";

// The solo game runs on this page (no room, no sign-in); its start screen
// also creates duel rooms, played at /pasteleria/[roomId].
export default function PasteleriaPage() {
  return <BakeryGame />;
}
