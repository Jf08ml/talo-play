import JsonLd from "@/components/JsonLd";
import { gameJsonLd, gameMetadata } from "@/lib/seo";

export const metadata = gameMetadata("backgammon");

export default function BackgammonLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <JsonLd data={gameJsonLd("backgammon")} />
    </>
  );
}
