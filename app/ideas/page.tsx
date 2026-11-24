import type { Metadata } from "next";
import IdeasClient from "./IdeasClient";

export const metadata: Metadata = {
  title: "Ideas y sugerencias",
  description: "Vota qué juego sumamos a Talo y mándanos tus ideas, mejoras o lo que anda mal.",
  alternates: { canonical: "/ideas" },
};

export default function IdeasPage() {
  return <IdeasClient />;
}
