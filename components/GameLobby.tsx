"use client";

import { useEffect, type ReactNode } from "react";
import { cleanupOldRooms } from "@/lib/roomCleanup";
import Link from "next/link";
import { isFirebaseConfigured } from "@/lib/firebase";
import { GAMES, playersLabel, type GameId } from "@/lib/games";
import { gameColors } from "@/lib/talos";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import FirebaseSetupNotice from "./FirebaseSetupNotice";
import PlayerIdentity from "./PlayerIdentity";
import SiteHeader, { SiteFooter } from "./SiteHeader";
import GameArt from "./GameArt";
import { ArrowLeft, Clock, Users } from "lucide-react";
import { RulesButton } from "./HowToPlay";

/**
 * Common page to set up a game: what it is (from the catalog), the player's
 * name, the game's own create-room form (`children`) and how to play.
 * Joining by code lives on the home page and in shared links.
 */
export default function GameLobby({ game, children }: { game: GameId; children: ReactNode }) {
  const identity = useClientIdentity();
  const info = GAMES[game];
  const { color, ink } = gameColors(game);

  // Housekeeping: delete a few rooms nobody used in days (see lib/roomCleanup.ts).
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const t = setTimeout(cleanupOldRooms, 3000);
    return () => clearTimeout(t);
  }, []);

  if (!isFirebaseConfigured()) return <FirebaseSetupNotice />;

  return (
    <div className="talo-light flex flex-1 flex-col">
      <section className="overflow-hidden" style={{ background: color, color: ink }}>
        <SiteHeader right={<PlayerIdentity identity={identity} compact />} />
        <div className="mx-auto flex max-w-[1360px] items-end justify-between gap-4 px-5 sm:gap-10 sm:px-10">
          <div className="flex min-w-0 flex-col gap-3 pb-12 pt-2 sm:gap-4 sm:pb-16 sm:pt-6">
            <Link
              href="/#juegos"
              className="inline-flex w-fit items-center gap-1.5 rounded-lg text-[15px] font-bold underline-offset-4 hover:underline"
              style={{ color: ink }}
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.6} /> Todos los juegos
            </Link>
            <h1 className="text-balance font-display text-[44px] leading-none tracking-[-0.02em] sm:text-[clamp(56px,6vw,88px)]">
              {info.title}
            </h1>
            <p className="max-w-xl text-[17px] font-medium leading-[1.4] sm:text-[22px]">{info.tagline}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[15px] font-bold">
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4" strokeWidth={2.4} /> {playersLabel(info)} jugadores
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" strokeWidth={2.4} /> {info.duration}
              </span>
            </div>
          </div>
          {/* The game's own scene, standing on the band's bottom edge. */}
          <GameArt game={game} className="h-[112px] w-[112px] shrink-0 self-end sm:h-[220px] sm:w-[220px] lg:h-[300px] lg:w-[300px]" />
        </div>
      </section>

      {identity.name && (
        <div className="mx-auto grid w-full max-w-[1360px] flex-1 items-start gap-8 px-5 py-10 sm:px-10 sm:py-16 md:grid-cols-[1.4fr_1fr] lg:gap-12">
          {/* The create form shares its controls with the dark rooms, so it sits on an ink panel. */}
          <div className="rounded-[28px] bg-talo-ink p-2 text-slate-100 [color-scheme:dark] sm:p-3">{children}</div>

          <div>
            <h2 className="font-display text-[28px] leading-[1.05] sm:text-[32px]">Cómo se juega</h2>
            <ol className="mt-6 flex flex-col border-t-2 border-talo-ink">
              {info.howTo.map((step, i) => (
                <li key={step} className="flex gap-4 border-b border-talo-line py-4">
                  <span className="w-8 shrink-0 font-display text-[32px] leading-none" style={{ color: color === "#FFC400" ? "#111111" : color }}>
                    {i + 1}
                  </span>
                  <span className="text-[17px] leading-normal text-talo-text-2">{step}</span>
                </li>
              ))}
            </ol>
            <RulesButton
              game={game}
              where="lobby"
              label="Ver las reglas completas"
              className="mt-6 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[14px] border-2 border-talo-ink text-[17px] font-bold text-talo-ink transition hover:bg-talo-surface"
            />
            <p className="mt-5 text-[15px] text-talo-text-3">
              Creás la sala, mandás el link por WhatsApp y los demás entran con un toque.
            </p>
          </div>
        </div>
      )}

      <SiteFooter />
    </div>
  );
}
