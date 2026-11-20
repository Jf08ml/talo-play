import LandingPage from "@/components/LandingPage";
import { landingMetadata } from "@/lib/seo";

export const metadata = landingMetadata("juegos-de-mesa-online");

export default function Page() {
  return <LandingPage slug="juegos-de-mesa-online" />;
}
