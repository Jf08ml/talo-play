import type { MetadataRoute } from "next";
import { GAME_ORDER, GAMES } from "@/lib/games";
import { SITE_URL } from "@/lib/seo";

// Home, the community page and every game lobby. Rooms are temporary and noindex, so they're left out.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: SITE_URL, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/plaza`, lastModified, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/ideas`, lastModified, changeFrequency: "weekly", priority: 0.5 },
    ...GAME_ORDER.map((id) => ({
      url: `${SITE_URL}/${GAMES[id].path}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
