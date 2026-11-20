import type { MetadataRoute } from "next";
import { GAME_ORDER, GAMES } from "@/lib/games";
import { LANDINGS } from "@/lib/landings";
import { SITE_URL } from "@/lib/seo";

// Home, the landing pages (lib/landings.ts), every game lobby and the community page.
// Rooms are temporary and noindex, so they're left out. No `lastModified`: a build date
// on every page says nothing true about when its content changed.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    ...LANDINGS.map((l) => ({ url: `${SITE_URL}/${l.slug}`, changeFrequency: "weekly" as const, priority: 0.9 })),
    ...GAME_ORDER.map((id) => ({ url: `${SITE_URL}/${GAMES[id].path}`, changeFrequency: "monthly" as const, priority: 0.8 })),
    { url: `${SITE_URL}/ideas`, changeFrequency: "weekly", priority: 0.4 },
  ];
}
