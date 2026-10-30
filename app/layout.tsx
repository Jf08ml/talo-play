import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Bricolage_Grotesque } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/seo";
import { VoiceKeeper } from "@/components/VoiceButton";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face with some character, used only for branding/headings —
// everything else (forms, buttons, body copy) stays on Geist Sans.
const display = Bricolage_Grotesque({
  variable: "--font-display",
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
  themeColor: "#0b0c10",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <VoiceKeeper />
      </body>
      {process.env.NODE_ENV === "production" && GA_ID && <GoogleAnalytics gaId={GA_ID} />}
    </html>
  );
}
