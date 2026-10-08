"use client";

import { isFirebaseConfigured } from "@/lib/firebase";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import GameCard from "@/components/GameCard";
import { PuzzleThumbnail, ComingSoonThumbnail } from "@/components/GameThumbnails";
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
          Elegí un juego para armar en tiempo real con otras personas, en una sala
          compartida.
        </p>

        <div className="mt-6">
          <PlayerIdentity identity={identity} />
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <GameCard
            href="/rompecabezas"
            title="🧩 Rompecabezas Colaborativo"
            description="Subí una imagen, convertila en un rompecabezas y armala con quien quieras — de a uno, o por equipos a las apuradas."
            thumbnail={<PuzzleThumbnail />}
          />
          <GameCard
            href="#"
            title="Más juegos"
            description="Estamos sumando nuevos juegos al salón. Volvé pronto."
            thumbnail={<ComingSoonThumbnail />}
            badge="Próximamente"
            disabled
          />
        </div>
      </div>
    </div>
  );
}
