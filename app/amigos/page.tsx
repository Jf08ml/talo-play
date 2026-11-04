import type { Metadata } from "next";
import AmigosClient from "./AmigosClient";

export const metadata: Metadata = {
  title: "Amigos",
  description: "Agregá a tus amigos en Talo con su código e invitalos a jugar directo, sin mandar links.",
  robots: { index: false },
};

// `?agregar=CODIGO` (a shared friend link) fills the "Agregar amigo" box.
export default async function AmigosPage({ searchParams }: { searchParams: Promise<{ agregar?: string | string[] }> }) {
  const { agregar } = await searchParams;
  return <AmigosClient initialCode={typeof agregar === "string" ? agregar : ""} />;
}
