"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { cleanupOldRooms } from "@/lib/roomCleanup";
import { isFirebaseConfigured } from "@/lib/firebase";
import { CATEGORIES, CONTEXTS, GAME_ORDER, GAMES, playersLabel, type GameId, type PlayContext } from "@/lib/games";
import { CATEGORY_COLORS, gameColors } from "@/lib/talos";
import { getPlayStats, mostPlayed } from "@/lib/playStats";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import JoinRoomForm from "@/components/JoinRoomForm";
import PlayerIdentity from "@/components/PlayerIdentity";
import SiteHeader from "@/components/SiteHeader";
import HeroCrowd from "@/components/HeroCrowd";
import GameArt from "@/components/GameArt";
import { useClientIdentity } from "@/hooks/useClientIdentity";

// "Los que más se juegan" picks these until there are enough real plays to
// rank (lib/playStats.ts).
const CURATED: GameId[] = ["impostor", "truco", "dibujo", "naval"];

/** A category's little face: a tile in its color with two white eyes. */
function CategoryFace({ color, size }: { color: string; size: "sm" | "md" }) {
  const s = size === "md" ? "h-7 w-7 rounded-lg" : "h-6 w-6 rounded-[7px]";
  const eye = size === "md" ? "h-2 w-2" : "h-[7px] w-[7px]";
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center gap-0.5 ${s}`} style={{ background: color }}>
      <span className={`rounded-full bg-white ${eye}`} />
      <span className={`rounded-full bg-white ${eye}`} />
    </span>
  );
}

export default function HomeClient() {
  const identity = useClientIdentity();
  const [context, setContext] = useState<PlayContext | null>(null);
  const [cat, setCat] = useState(0);
  const [featured, setFeatured] = useState(CURATED);

  // Housekeeping: delete a few rooms nobody used in days (see lib/roomCleanup.ts).
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const t = setTimeout(cleanupOldRooms, 3000);
    return () => clearTimeout(t);
  }, []);

  // The real top four by plays (the curated ones until there's enough data).
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    getPlayStats()
      .then((stats) => setFeatured(mostPlayed(stats, 4, CURATED)))
      .catch(() => {});
  }, []);

  if (!isFirebaseConfigured()) return <FirebaseSetupNotice />;

  const fits = (id: GameId) => !context || GAMES[id].contexts.includes(context);
  const current = CATEGORIES[cat];
  const currentColor = CATEGORY_COLORS[current.id].color;
  const games = current.games.filter(fits);
  const modes: { id: PlayContext | null; label: string }[] = [{ id: null, label: "Todos" }, ...CONTEXTS];

  return (
    <div className="talo-light">
      {/* HERO */}
      <section className="overflow-hidden bg-talo-hero">
        <SiteHeader right={<PlayerIdentity identity={identity} requireName={false} compact />} />

        <div className="mx-auto flex max-w-[1360px] flex-wrap items-end gap-x-10 px-5 pt-2 sm:px-10 sm:pt-10">
          <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-4 sm:gap-7 sm:pb-[72px]">
            <h1 className="font-display text-[44px] leading-none tracking-[-0.02em] sm:text-[clamp(56px,7vw,108px)] sm:leading-[0.98]">
              Juegos para jugar juntos.
            </h1>
            <p className="max-w-[500px] text-[17px] font-medium leading-[1.4] sm:text-[22px]">
              <span className="hidden sm:inline">Elegí un juego, mandá el link por WhatsApp y en un minuto están jugando. Gratis y sin registrarse.</span>
              <span className="sm:hidden">Mandá el link por WhatsApp y en un minuto están jugando.</span>
            </p>
            <div className="mt-2 hidden self-start rounded-[20px] bg-white p-5 sm:block">
              <JoinRoomForm id="code-desk" />
            </div>
          </div>

          {/* Full size from tablets up; on phones they peek over the bottom edge. */}
          <div className="relative -mx-5 h-[132px] w-[calc(100%+40px)] overflow-hidden sm:mx-0 sm:h-[420px] sm:w-[640px] sm:max-w-full sm:flex-none sm:overflow-visible">
            <div className="absolute bottom-[-46px] left-1/2 origin-bottom -translate-x-1/2 scale-[0.52] sm:bottom-0 sm:left-0 sm:translate-x-0 sm:scale-100">
              <HeroCrowd />
            </div>
          </div>
        </div>
      </section>

      {/* Phones: the code goes right under the hero. */}
      <div className="px-5 pt-5 sm:hidden">
        <JoinRoomForm id="code-mob" />
      </div>

      {/* DESTACADOS */}
      <section className="mx-auto flex max-w-[1360px] flex-col gap-6 px-5 pt-14 sm:gap-8 sm:px-10 sm:pt-24">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-display text-[32px] leading-[1.05] tracking-[-0.01em] sm:text-[44px]">Los que más se juegan</h2>
          <a href="#juegos" className="font-bold underline underline-offset-[5px]">
            Ver los {GAME_ORDER.length} juegos
          </a>
        </div>
        <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(280px,1fr))] sm:gap-5 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
          {featured.map((id) => {
            const { color, ink } = gameColors(id);
            return (
              <Link
                key={id}
                href={`/${GAMES[id].path}`}
                className="relative flex h-[380px] w-[80%] shrink-0 snap-start flex-col gap-2.5 overflow-hidden rounded-[28px] p-7 transition-transform duration-200 hover:-translate-y-1.5 sm:h-[420px] sm:w-auto"
                style={{ background: color, color: ink }}
              >
                <span className="font-display text-[34px] leading-none tracking-[-0.01em] sm:text-[38px]">{GAMES[id].title}</span>
                <span className="line-clamp-4 max-w-[260px] text-[16px] font-medium leading-[1.35]">{GAMES[id].tagline}</span>
                <GameArt game={id} className="absolute -bottom-3 left-1/2 h-[220px] w-[220px] -translate-x-1/2 sm:h-[240px] sm:w-[240px]" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* CATÁLOGO */}
      <section id="juegos" className="mx-auto flex max-w-[1360px] scroll-mt-4 flex-col gap-5 px-5 pb-20 pt-16 sm:gap-8 sm:px-10 sm:pb-[120px] sm:pt-28">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <h2 className="font-display text-[32px] leading-[1.05] tracking-[-0.01em] sm:text-[44px]">Todos los juegos</h2>
          <div
            role="group"
            aria-label="¿Con quién jugás?"
            className="-mx-5 flex max-w-[calc(100%+40px)] items-center gap-1 overflow-x-auto px-5 text-base [scrollbar-width:none] sm:mx-0 sm:max-w-full sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
          >
            <span className="mr-1.5 shrink-0 font-medium text-talo-text-3">Para jugar</span>
            {modes.map((m) => {
              const on = context === m.id;
              return (
                <button
                  key={m.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setContext(m.id)}
                  className={`min-h-11 shrink-0 rounded-lg px-3 py-2 decoration-talo-hero decoration-[3px] underline-offset-8 ${
                    on ? "font-extrabold underline" : "font-medium hover:underline hover:decoration-talo-line"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Categorías"
          className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-2 [&::-webkit-scrollbar]:hidden"
        >
          {CATEGORIES.map((c, i) => {
            const on = cat === i;
            const count = c.games.filter(fits).length;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="catalogo"
                onClick={() => setCat(i)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl py-2 pl-2 pr-3.5 text-[15px] font-bold sm:min-h-[52px] sm:gap-2.5 sm:rounded-[14px] sm:py-2.5 sm:pl-3 sm:pr-[18px] sm:text-[17px] ${
                  on ? "bg-talo-ink text-white" : "bg-talo-surface text-talo-ink hover:bg-talo-line"
                }`}
              >
                <CategoryFace color={CATEGORY_COLORS[c.id].color} size="md" />
                {c.label}
                <span className="font-medium opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        <div id="catalogo" role="tabpanel" aria-label={current.label}>
          <p className="mb-3 text-[15px] text-talo-text-3">{current.hint}</p>
          {games.length ? (
            <div className="grid grid-cols-1 border-t-2 border-talo-ink sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] sm:gap-x-6">
              {games.map((id) => {
                const g = GAMES[id];
                return (
                  <Link
                    key={id}
                    href={`/${g.path}`}
                    className="group flex min-h-16 items-center gap-3.5 border-b border-talo-line px-0.5 py-3 transition-colors hover:bg-talo-surface sm:min-h-[76px] sm:gap-4 sm:px-2.5 sm:py-3.5"
                  >
                    <span className="h-14 w-14 shrink-0 overflow-hidden rounded-[14px] sm:h-16 sm:w-16" style={{ background: currentColor }}>
                      <GameArt game={id} className="h-full w-full" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[17px] font-bold leading-tight sm:text-[19px]">{g.title}</span>
                      <span className="text-sm text-talo-text-3">
                        {playersLabel(g)} jugadores · {g.duration}
                      </span>
                    </span>
                    <ChevronRight className="h-[18px] w-[18px] shrink-0 sm:hidden" strokeWidth={2.4} />
                    <ArrowRight
                      className="hidden h-5 w-5 shrink-0 -translate-x-1.5 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:opacity-100 sm:block"
                      strokeWidth={2.4}
                    />
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="border-t-2 border-talo-ink py-8 text-talo-text-2">
              No hay juegos de esta categoría para jugar {CONTEXTS.find((c) => c.id === context)?.label.toLowerCase()}.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
