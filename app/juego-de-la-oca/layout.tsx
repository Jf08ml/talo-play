import JsonLd from "@/components/JsonLd";
import { gameJsonLd, gameMetadata } from "@/lib/seo";

export const metadata = gameMetadata("oca");

export default function OcaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <JsonLd data={gameJsonLd("oca")} />
    </>
  );
}
