import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Everyone may crawl, AI assistants included (GPTBot, ClaudeBot, PerplexityBot…),
// so they can recommend the games. Room pages aren't blocked here so crawlers can read their noindex.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
