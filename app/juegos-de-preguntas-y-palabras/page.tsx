import LandingPage from "@/components/LandingPage";
import { landingMetadata } from "@/lib/seo";

export const metadata = landingMetadata("juegos-de-preguntas-y-palabras");

export default function Page() {
  return <LandingPage slug="juegos-de-preguntas-y-palabras" />;
}
