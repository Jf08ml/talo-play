"use client";

import { useState, type ReactNode } from "react";
import { isFirebaseConfigured } from "@/lib/firebase";
import { CONTEXTS, GAME_ORDER, GAMES, type GameId, type PlayContext } from "@/lib/games";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import GameCard from "@/components/GameCard";
import JoinRoomForm from "@/components/JoinRoomForm";
import TaloLogo from "@/components/TaloLogo";
import PlayerIdentity from "@/components/PlayerIdentity";
import { CONTEXT_ICONS } from "@/components/GameIcon";
import {
  PuzzleThumbnail,
  MemotestThumbnail,
  TuttiThumbnail,
  DibujoThumbnail,
  CodigoThumbnail,
  DeslizanteThumbnail,
} from "@/components/GameThumbnails";
import { useClientIdentity } from "@/hooks/useClientIdentity";

const THUMBNAILS: Record<GameId, ReactNode> = {
  rompecabezas: <PuzzleThumbnail />,
  deslizante: <DeslizanteThumbnail />,
  memotest: <MemotestThumbnail />,
  tutti: <TuttiThumbnail />,
  dibujo: <DibujoThumbnail />,
  codigo: <CodigoThumbnail />,
};

export default function Home() {
  const identity = useClientIdentity();
  const [context, setContext] = useState<PlayContext | null>(null);

  if (!isFirebaseConfigured()) return <FirebaseSetupNotice />;

  const games = GAME_ORDER.map((id) => GAMES[id]).filter((g) => !context || g.contexts.includes(context));
  const selected = CONTEXTS.find((c) => c.id === context);

  return (
    <div className="flex flex-1 flex-col items-center px-4 pb-12 pt-8 sm:pt-12">
      <div className="w-full max-w-4xl">
        <header className="flex flex-col items-center text-center">
          <TaloLogo size="lg" />
          <h1 className="mt-5 font-display text-2xl font-semibold text-slate-100 sm:text-3xl">
            Juegos para jugar juntos
          </h1>
          <p className="mt-2 max-w-md text-slate-400">
            Elegí un juego, mandá el link y en un minuto están jugando. Sin registrarse ni descargar nada.
          </p>
          <div className="mt-4">
            <PlayerIdentity identity={identity} requireName={false} />
          </div>
        </header>

        <div className="mx-auto mt-6 max-w-xl">
          <JoinRoomForm />
        </div>

        <section className="mt-10">
          <h2 className="text-center font-display text-xl font-semibold text-slate-100">¿Con quién vas a jugar?</h2>
          <div className="mx-auto mt-4 grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">
            {CONTEXTS.map((c) => {
              const active = context === c.id;
              const Icon = CONTEXT_ICONS[c.id];
              return (
                <button
                  key={c.id}
                  onClick={() => setContext(active ? null : c.id)}
                  aria-pressed={active}
                  className={`flex flex-col items-center gap-0.5 rounded-2xl border px-3 py-3 transition ${
                    active
                      ? "border-fuchsia-400/60 bg-fuchsia-500/15 shadow-[0_0_20px_rgba(217,70,239,0.25)]"
                      : "border-slate-700/80 bg-slate-900/50 hover:border-slate-500"
                  }`}
                >
                  <Icon className={`h-6 w-6 ${active ? "text-fuchsia-300" : "text-slate-300"}`} />
                  <span className="font-semibold text-slate-100">{c.label}</span>
                  <span className="text-xs text-slate-500">{c.hint}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-8 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-medium uppercase tracking-wide text-slate-500">
              {selected ? `Para jugar ${selected.label.toLowerCase()}` : "Todos los juegos"}
            </h3>
            {selected && (
              <button onClick={() => setContext(null)} className="text-sm text-violet-400 hover:text-violet-300">
                Ver todos
              </button>
            )}
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((g) => (
              <GameCard key={g.id} game={g} thumbnail={THUMBNAILS[g.id]} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
