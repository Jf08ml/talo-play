import JsonLd from "@/components/JsonLd";
import { gameJsonLd, gameMetadata } from "@/lib/seo";

export const metadata = gameMetadata("domino");

export default function DominoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <JsonLd data={gameJsonLd("domino")} />
    </>
  );
}
