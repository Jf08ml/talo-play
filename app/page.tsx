"use client";

import { isFirebaseConfigured } from "@/lib/firebase";
import { GAMES } from "@/lib/games";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import GameCard from "@/components/GameCard";
import JoinRoomForm from "@/components/JoinRoomForm";
import {
  PuzzleThumbnail,
  MemotestThumbnail,
  TuttiThumbnail,
  DibujoThumbnail,
  ComingSoonThumbnail,
} from "@/components/GameThumbnails";
import PlayerIdentity from "@/components/PlayerIdentity";
import { useClientIdentity } from "@/hooks/useClientIdentity";

export default function GamesHub() {
  const identity = useClientIdentity();
  const configured = isFirebaseConfigured();

  if (!configured) return <FirebaseSetupNotice />;

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-3xl">
        <h1 className="animate-glow-pulse mx-auto flex w-fit items-center gap-2 rounded-2xl px-2 text-center font-display text-3xl font-bold tracking-tight sm:text-5xl">
          <span>🎮</span>
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
            Salón de Juegos
          </span>
        </h1>
        <p className="mt-3 text-center text-slate-400">
          Elegí un juego para jugar en tiempo real con otras personas, en una sala
          compartida.
        </p>

        <div className="mt-6">
          <PlayerIdentity identity={identity} />
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <GameCard
            href={`/${GAMES.rompecabezas.path}`}
            title={`${GAMES.rompecabezas.emoji} ${GAMES.rompecabezas.title}`}
            description="Subí una imagen, convertila en un rompecabezas y armala con quien quieras — de a uno, o por equipos a las apuradas."
            thumbnail={<PuzzleThumbnail />}
          />
          <GameCard
            href={`/${GAMES.memotest.path}`}
            title={`${GAMES.memotest.emoji} ${GAMES.memotest.title}`}
            description="Dá vuelta las cartas y encontrá los pares, por turnos. Si acertás, seguís. Gana quien junte más."
            thumbnail={<MemotestThumbnail />}
          />
          <GameCard
            href={`/${GAMES.tutti.path}`}
            title={`${GAMES.tutti.emoji} ${GAMES.tutti.title}`}
            description="Sale una letra y hay que llenar cada categoría. El primero que termina grita ¡Basta! Después se votan las respuestas."
            thumbnail={<TuttiThumbnail />}
          />
          <GameCard
            href={`/${GAMES.dibujo.path}`}
            title={`${GAMES.dibujo.emoji} ${GAMES.dibujo.title}`}
            description="Uno dibuja una palabra secreta y los demás la adivinan en el chat. Cuanto más rápido, más puntos."
            thumbnail={<DibujoThumbnail />}
          />
          <GameCard
            href="#"
            title="Más juegos"
            description="Estamos sumando nuevos juegos al salón. Volvé pronto."
            thumbnail={<ComingSoonThumbnail />}
            badge="Próximamente"
            disabled
          />
          {identity.name && <JoinRoomForm />}
        </div>
      </div>
    </div>
  );
}
