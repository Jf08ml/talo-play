import JsonLd from "@/components/JsonLd";
import { gameJsonLd, gameMetadata } from "@/lib/seo";

export const metadata = gameMetadata("ajedrez");

export default function AjedrezLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <JsonLd data={gameJsonLd("ajedrez")} />
    </>
  );
}
