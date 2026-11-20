import LandingPage from "@/components/LandingPage";
import { landingMetadata } from "@/lib/seo";

export const metadata = landingMetadata("juegos-de-puzzles-y-memoria");

export default function Page() {
  return <LandingPage slug="juegos-de-puzzles-y-memoria" />;
}
