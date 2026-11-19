import type { Metadata } from "next";
import StatsClient from "./StatsClient";

// Internal: not linked from anywhere, not in the sitemap, not indexed.
export const metadata: Metadata = {
  title: "Estadísticas",
  robots: { index: false, follow: false },
};

export default function StatsPage() {
  return <StatsClient />;
}
