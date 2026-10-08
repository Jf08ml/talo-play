"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { isFirebaseConfigured } from "@/lib/firebase";
import { GAMES, playersLabel, type GameId } from "@/lib/games";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import FirebaseSetupNotice from "./FirebaseSetupNotice";
import PlayerIdentity from "./PlayerIdentity";
import { TaloMark } from "./TaloLogo";
import GameIcon from "./GameIcon";
import { ChevronLeft, Clock, Users } from "lucide-react";
import { CARD } from "./ui";

/**
 * Common page to set up a game: what it is (from the catalog), the player's
 * name, the game's own create-room form (`children`) and how to play.
 * Joining by code lives on the home page and in shared links.
 */
export default function GameLobby({ game, children }: { game: GameId; children: ReactNode }) {
  const identity = useClientIdentity();
  const info = GAMES[game];

  if (!isFirebaseConfigured()) return <FirebaseSetupNotice />;

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-8">
      <div className="w-full max-w-3xl">
        <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-300">
          <ChevronLeft className="h-4 w-4" /> <TaloMark className="h-5 w-5" /> Volver a Talo
        </Link>

        <div className="text-center">
          <h1 className="flex items-center justify-center gap-3 font-display text-3xl font-bold tracking-tight text-slate-100 sm:text-4xl">
            <GameIcon game={game} size="lg" />
            {info.title}
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-slate-400">{info.tagline}</p>
          <div className="mt-3 flex justify-center gap-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-1">
              <Users className="h-3.5 w-3.5" /> {playersLabel(info)} jugadores
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-1">
              <Clock className="h-3.5 w-3.5" /> {info.duration}
            </span>
          </div>
        </div>

        <div className="mt-5">
          <PlayerIdentity identity={identity} />
        </div>

        {identity.name && (
          <div className="mt-6 grid gap-6 md:grid-cols-[1.4fr_1fr]">
            {children}
            <div className={`${CARD} h-fit`}>
              <h2 className="font-display text-lg font-semibold text-slate-100">Cómo se juega</h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-400">
                {info.howTo.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="mt-4 text-sm text-slate-500">
                Creás la sala, mandás el link por WhatsApp y los demás entran con un toque.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
