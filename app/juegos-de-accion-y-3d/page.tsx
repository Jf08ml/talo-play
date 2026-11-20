import LandingPage from "@/components/LandingPage";
import { landingMetadata } from "@/lib/seo";

export const metadata = landingMetadata("juegos-de-accion-y-3d");

export default function Page() {
  return <LandingPage slug="juegos-de-accion-y-3d" />;
}
