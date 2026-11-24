"use client";

import { useEffect, type ReactNode } from "react";
import { cleanupOldRooms } from "@/lib/roomCleanup";
import Link from "next/link";
import { isFirebaseConfigured } from "@/lib/firebase";
import { GAMES, playersLabel, type GameId } from "@/lib/games";
import { categoryOf, gameColors } from "@/lib/talos";
import { gameFaq } from "@/lib/seo";
import { shelfLanding } from "@/lib/landings";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import FirebaseSetupNotice from "./FirebaseSetupNotice";
import PlayerIdentity from "./PlayerIdentity";
import OpenRoomsList from "./OpenRoomsList";
import SiteHeader, { SiteFooter } from "./SiteHeader";
import GameArt from "./GameArt";
import NewBadge from "./NewBadge";
import { GuideBody } from "./HowToPlay";
import { ArrowLeft, ArrowRight, ChevronDown, Clock, Users } from "lucide-react";

const H2 = "font-display text-[28px] leading-[1.05] sm:text-[36px]";

/** "Reglas del truco"-style heading: "El impostor" → "Reglas del impostor". */
function rulesHeading(title: string): string {
  return title.startsWith("El ") ? `Reglas del ${title.slice(3)}` : `Reglas de ${title}`;
}

/**
 * Common page to set up a game: what it is (from the catalog), the player's
 * name, the game's own create-room form (`children`), how to play, the full
 * rules, questions and similar games. Everything but the form is always
 * rendered (also on the server), so search engines read the whole page; the
 * name is only asked to create a room. Joining by code lives on the home
 * page and in shared links.
 */
export default function GameLobby({ game, children }: { game: GameId; children: ReactNode }) {
  const identity = useClientIdentity();
  const info = GAMES[game];
  const { color, ink } = gameColors(game);
  const accent = color === "#FFC400" ? "#111111" : color;
  const shelf = categoryOf(game);
  const shelfPage = shelfLanding(shelf.id);
  const related = shelf.games.filter((g) => g !== game).slice(0, 6);
  const faq = gameFaq(game);

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
            <nav aria-label="Ruta" className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold">
              <Link href="/#juegos" className="inline-flex items-center gap-1.5 rounded-lg underline-offset-4 hover:underline" style={{ color: ink }}>
                <ArrowLeft className="h-4 w-4" strokeWidth={2.6} /> Todos los juegos
              </Link>
              <span aria-hidden="true">·</span>
              <Link href={`/${shelfPage.slug}`} className="underline-offset-4 hover:underline" style={{ color: ink }}>
                {shelfPage.label}
              </Link>
            </nav>
            <NewBadge game={game} className="self-start" />
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

      <div className="mx-auto grid w-full max-w-[1360px] items-start gap-8 px-5 py-10 sm:px-10 sm:py-16 md:grid-cols-[1.4fr_1fr] lg:gap-12">
        <OpenRoomsList game={game} where="lobby" title={`Salas abiertas de ${info.title}`} className="md:col-span-2" />
        {/* The create form shares its controls with the dark rooms, so it sits on an ink panel. */}
        <div className="rounded-[28px] bg-talo-ink p-2 text-slate-100 [color-scheme:dark] sm:p-3">
          {identity.name ? (
            children
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-6 text-center">
              <p className="font-display text-[24px] text-white">Arma una sala</p>
              <p className="max-w-sm text-[15px] text-white/70">Pon tu nombre para crear la sala y mandarles el link a los demás.</p>
            </div>
          )}
        </div>

        <div>
          <h2 className={H2}>Cómo se juega</h2>
          <ol className="mt-6 flex flex-col border-t-2 border-talo-ink">
            {info.howTo.map((step, i) => (
              <li key={step} className="flex gap-4 border-b border-talo-line py-4">
                <span className="w-8 shrink-0 font-display text-[32px] leading-none" style={{ color: accent }}>
                  {i + 1}
                </span>
                <span className="text-[17px] leading-normal text-talo-text-2">{step}</span>
              </li>
            ))}
          </ol>
          <a
            href="#reglas"
            className="mt-6 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[14px] border-2 border-talo-ink text-[17px] font-bold text-talo-ink transition hover:bg-talo-surface"
          >
            Ver las reglas completas <ChevronDown className="h-5 w-5" />
          </a>
          <p className="mt-5 text-[15px] text-talo-text-3">Creas la sala, mandas el link por WhatsApp y los demás entran con un toque.</p>
        </div>
      </div>

      {/* The full rules: what searches like "reglas del truco" land on. */}
      <section id="reglas" className="scroll-mt-4 border-t-2 border-talo-ink bg-white">
        <div className="mx-auto grid w-full max-w-[1360px] gap-8 px-5 py-12 sm:px-10 sm:py-16 md:grid-cols-[1fr_1.4fr] lg:gap-12">
          <div>
            <h2 className={H2}>{rulesHeading(info.title)}</h2>
            <p className="mt-4 text-[17px] text-talo-text-2">
              Todo lo que hay que saber para jugar {info.title} online: el objetivo, cómo es una partida y algunos consejos.
            </p>
          </div>
          <GuideBody game={game} light />
        </div>
      </section>

      <section className="bg-talo-surface">
        <div className="mx-auto grid w-full max-w-[1360px] gap-8 px-5 py-12 sm:px-10 sm:py-16 md:grid-cols-[1fr_1.4fr] lg:gap-12">
          <h2 className={H2}>Preguntas frecuentes</h2>
          <div className="flex flex-col border-t-2 border-talo-ink">
            {faq.map(({ q, a }) => (
              <details key={q} className="group border-b border-talo-line py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[18px] font-bold [&::-webkit-details-marker]:hidden">
                  <h3>{q}</h3>
                  <ChevronDown className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-[17px] leading-relaxed text-talo-text-2">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="mx-auto w-full max-w-[1360px] px-5 py-12 sm:px-10 sm:py-16">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className={H2}>Más juegos: {shelfPage.label.toLowerCase()}</h2>
            <Link href={`/${shelfPage.slug}`} className="inline-flex items-center gap-1.5 font-bold underline underline-offset-[5px]">
              Ver todos <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
            {related.map((id) => (
              <li key={id}>
                <Link
                  href={`/${GAMES[id].path}`}
                  className="flex h-full flex-col overflow-hidden rounded-[20px] transition-transform duration-200 hover:-translate-y-1"
                  style={{ background: color, color: ink }}
                >
                  <GameArt game={id} className="mx-auto h-24 w-24 sm:h-28 sm:w-28" />
                  <span className="px-3 pb-3 font-display text-[18px] leading-tight">{GAMES[id].title}</span>
                  <NewBadge game={id} className="mx-3 mb-3 -mt-1 self-start" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SiteFooter />
    </div>
  );
}
