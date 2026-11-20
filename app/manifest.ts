import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION } from "@/lib/seo";

/**
 * Talo as an app on the home screen ("Agregar a inicio" / "Instalar"): it
 * opens without the browser's bars. That's also the only full screen an
 * iPhone gives a page (`components/FullscreenButton.tsx` explains it there).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Talo · Juegos para jugar juntos",
    short_name: "Talo",
    description: SITE_DESCRIPTION,
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Android can go further and hide the status bar too.
    display_override: ["fullscreen", "standalone"],
    background_color: "#FFD400",
    theme_color: "#111111",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
