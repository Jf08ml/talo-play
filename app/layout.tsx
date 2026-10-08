import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Baloo_2 } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Rounded, friendly display face used only for branding/headings — everything
// else (forms, buttons, body copy) stays on Geist Sans for readability.
const balooTwo = Baloo_2({
  variable: "--font-display",
  weight: ["600", "700", "800"],
  subsets: ["latin"],
});

const DESCRIPTION =
  "Juegos para jugar juntos, al toque: elegí un juego, mandá el link y ya están jugando. En pareja, con amigos o en grupo, sin registrarse.";

export const metadata: Metadata = {
  // Absolute base for link previews (og:image etc.); override per deploy with NEXT_PUBLIC_SITE_URL.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://talo-play.vercel.app"),
  title: { default: "Talo · Juegos para jugar juntos", template: "%s · Talo" },
  description: DESCRIPTION,
  applicationName: "Talo",
  openGraph: {
    siteName: "Talo",
    title: "Talo · Juegos para jugar juntos",
    description: DESCRIPTION,
    locale: "es_AR",
    type: "website",
  },
};

// The puzzle board has its own pinch-to-zoom; locking the page viewport keeps
// mobile browsers from also zooming the whole page on the same gesture.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#07060d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${balooTwo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
