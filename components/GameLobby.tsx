"use client";

import { useEffect, type ReactNode } from "react";
import { cleanupOldRooms } from "@/lib/roomCleanup";
import Link from "next/link";
import { isFirebaseConfigured } from "@/lib/firebase";
import { GAMES, playersLabel, type GameId } from "@/lib/games";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import FirebaseSetupNotice from "./FirebaseSetupNotice";
import PlayerIdentity from "./PlayerIdentity";
import SiteHeader from "./SiteHeader";
import GameCover from "./GameCover";
import GameIcon from "./GameIcon";
import { ChevronLeft, Clock, Users } from "lucide-react";
import { CARD } from "./ui";
import { RulesButton } from "./HowToPlay";

/**
 * Common page to set up a game: what it is (from the catalog), the player's
 * name, the game's own create-room form (`children`) and how to play.
 * Joining by code lives on the home page and in shared links.
 */
export default function GameLobby({ game, children }: { game: GameId; children: ReactNode }) {
  const identity = useClientIdentity();
  const info = GAMES[game];

  // Housekeeping: delete a few rooms nobody used in days (see lib/roomCleanup.ts).
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const t = setTimeout(cleanupOldRooms, 3000);
    return () => clearTimeout(t);
  }, []);

  if (!isFirebaseConfigured()) return <FirebaseSetupNotice />;

  return (
    <>
      <SiteHeader right={<PlayerIdentity identity={identity} compact />} />

      <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" /> Todos los juegos
        </Link>

        <section className="mt-5 grid grid-cols-1 items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div>
            <GameIcon game={game} size="lg" />
            <h1 className="mt-4 text-balance font-display text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
              {info.title}
            </h1>
            <p className="mt-3 max-w-xl text-pretty text-lg leading-relaxed text-slate-400">{info.tagline}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4 text-slate-500" /> {playersLabel(info)} jugadores
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-500" /> {info.duration}
              </span>
            </div>
          </div>
          <div
            aria-hidden="true"
            className="hidden overflow-hidden rounded-2xl border border-white/10 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)] sm:block"
          >
            <div className="aspect-[2/1]">
              <GameCover game={game} />
            </div>
          </div>
        </section>

        {identity.name && (
          <div className="mt-10 grid gap-6 md:grid-cols-[1.4fr_1fr]">
            {children}
            <div className={`${CARD} h-fit`}>
              <h2 className="font-display text-lg font-semibold text-white">Cómo se juega</h2>
              <ol className="mt-4 flex flex-col gap-3 text-sm text-slate-400">
                {info.howTo.map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 text-xs font-semibold text-slate-300">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
              <RulesButton
                game={game}
                where="lobby"
                label="Ver las reglas completas"
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.06]"
              />
              <p className="mt-4 border-t border-white/[0.06] pt-4 text-sm text-slate-500">
                Creás la sala, mandás el link por WhatsApp y los demás entran con un toque.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
