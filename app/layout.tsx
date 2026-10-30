import type { Metadata, Viewport } from "next";
import { Albert_Sans, Dela_Gothic_One, Geist_Mono, JetBrains_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/seo";
import { VoiceKeeper } from "@/components/VoiceButton";
import "./globals.css";

// Talo's type (talo-handoff/tokens.css): Albert Sans for text and UI, Dela
// Gothic One (a single weight) for titles, the logo and big numbers, and
// JetBrains Mono only for the room-code boxes. Geist Mono stays for the
// games' own monospaced numbers.
const ui = Albert_Sans({
  variable: "--font-ui",
  subsets: ["latin", "latin-ext"],
});

const display = Dela_Gothic_One({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin", "latin-ext"],
});

const code = JetBrains_Mono({
  variable: "--font-code",
  weight: "700",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// GA4 measurement id (public, not a secret). Only loaded in production builds so
// dev servers and tunnels don't pollute the stats.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "G-22BJ9CB5Y7";

export const metadata: Metadata = {
  // Absolute base for link previews (og:image etc.); override per deploy with NEXT_PUBLIC_SITE_URL.
  metadataBase: new URL(SITE_URL),
  title: { default: "Talo · Juegos para jugar juntos", template: "%s · Talo" },
  description: SITE_DESCRIPTION,
  applicationName: "Talo",
  keywords: [
    "juegos online gratis",
    "juegos para jugar con amigos",
    "juegos en pareja",
    "juegos para reuniones",
    "juegos multijugador desde el celular",
    "juegos sin registrarse",
  ],
  openGraph: {
    siteName: "Talo",
    title: "Talo · Juegos para jugar juntos",
    description: SITE_DESCRIPTION,
    locale: "es_AR",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

// The puzzle board has its own pinch-to-zoom; locking the page viewport keeps
// mobile browsers from also zooming the whole page on the same gesture.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#111111",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${ui.variable} ${display.variable} ${code.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <VoiceKeeper />
      </body>
      {process.env.NODE_ENV === "production" && GA_ID && <GoogleAnalytics gaId={GA_ID} />}
    </html>
  );
}
