import LandingPage from "@/components/LandingPage";
import { landingMetadata } from "@/lib/seo";

export const metadata = landingMetadata("juegos-de-cartas-y-dados");

export default function Page() {
  return <LandingPage slug="juegos-de-cartas-y-dados" />;
}
