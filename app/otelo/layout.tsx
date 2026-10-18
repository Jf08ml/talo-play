import JsonLd from "@/components/JsonLd";
import { gameJsonLd, gameMetadata } from "@/lib/seo";

export const metadata = gameMetadata("otelo");

export default function OteloLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <JsonLd data={gameJsonLd("otelo")} />
    </>
  );
}
