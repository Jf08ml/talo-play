import { llmsText } from "@/lib/seo";

// Site summary for AI assistants (https://llmstxt.org), built from the game catalog.
export const dynamic = "force-static";

export function GET() {
  return new Response(llmsText(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
