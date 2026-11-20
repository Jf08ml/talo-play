import type { Metadata } from "next";
import PlazaClient from "./PlazaClient";

export const metadata: Metadata = {
  title: "La Plaza: encontrá gente para jugar",
  description: "El chat de Talo: saludá, mirá quién está y sumate a las salas que buscan jugadores.",
  alternates: { canonical: "/plaza" },
};

export default function PlazaPage() {
  return <PlazaClient />;
}
