import type { Metadata } from "next";
import RankingClient from "./RankingClient";

export const metadata: Metadata = {
  title: "Ranking",
  description: "Los jugadores de Talo con más puntos de la semana y de siempre. Suma jugando partidas con amigos o en línea, y más si ganas.",
};

export default function RankingPage() {
  return <RankingClient />;
}
