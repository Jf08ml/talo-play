import LandingPage from "@/components/LandingPage";
import { landingMetadata } from "@/lib/seo";

export const metadata = landingMetadata("juegos-para-grupos");

export default function Page() {
  return <LandingPage slug="juegos-para-grupos" />;
}
