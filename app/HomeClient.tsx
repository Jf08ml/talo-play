"use client";

import { useEffect, useState } from "react";
import { cleanupOldRooms } from "@/lib/roomCleanup";
import { isFirebaseConfigured } from "@/lib/firebase";
import { CATEGORIES, CONTEXTS, GAME_ORDER, GAMES, type GameId, type PlayContext } from "@/lib/games";
import { normalizeText } from "@/lib/text";
import { Check, LayoutGrid, Search, X } from "lucide-react";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import GameCard from "@/components/GameCard";
import GameCover from "@/components/GameCover";
import JoinRoomForm from "@/components/JoinRoomForm";
import PlayerIdentity from "@/components/PlayerIdentity";
import SiteHeader from "@/components/SiteHeader";
import { CONTEXT_ICONS } from "@/components/GameIcon";
import { useClientIdentity } from "@/hooks/useClientIdentity";

// The hero's collage: a few covers that show the range (party, drawing, cards, 3D).
const HERO_GAMES: { id: GameId; tilt: string }[] = [
  { id: "impostor", tilt: "-rotate-3 translate-y-3" },
  { id: "dibujo", tilt: "rotate-2" },
  { id: "truco", tilt: "rotate-1 -translate-y-1" },
  { id: "carreras3d", tilt: "-rotate-2 translate-y-2" },
];

const PERKS = ["Gratis", "Sin registrarse", "Desde el celular"];

function pillClass(active: boolean) {
  return `flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
    active
      ? "border-white bg-white text-slate-950"
      : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
  }`;
}

export default function HomeClient() {
  const identity = useClientIdentity();
  const [context, setContext] = useState<PlayContext | null>(null);
  const [query, setQuery] = useState("");

  // Housekeeping: delete a few rooms nobody used in days (see lib/roomCleanup.ts).
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const t = setTimeout(cleanupOldRooms, 3000);
    return () => clearTimeout(t);
  }, []);

  if (!isFirebaseConfigured()) return <FirebaseSetupNotice />;

  const q = normalizeText(query);
  const fits = (id: GameId) =>
    (!context || GAMES[id].contexts.includes(context)) &&
    (!q || normalizeText(`${GAMES[id].title} ${GAMES[id].tagline}`).includes(q));
  const searchResults = GAME_ORDER.filter(fits);
  const selected = CONTEXTS.find((c) => c.id === context);

  return (
    <>
      <SiteHeader right={<PlayerIdentity identity={identity} requireName={false} compact />} />

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <section className="grid grid-cols-1 items-center gap-10 pb-12 pt-10 sm:pt-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14 lg:pb-16 lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {GAME_ORDER.length} juegos para jugar online
            </p>
            <h1 className="mt-5 text-balance font-display text-[2.6rem] font-bold leading-[1.02] tracking-[-0.035em] text-white sm:text-6xl lg:text-[4.25rem]">
              Juegos para jugar <span className="text-violet-400">juntos</span>.
            </h1>
            <p className="mt-5 max-w-lg text-pretty text-base leading-relaxed text-slate-400 sm:text-lg">
              Elegí un juego, mandá el link por WhatsApp y en un minuto están jugando. En pareja, con amigos o en
              la previa.
            </p>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
              {PERKS.map((p) => (
                <li key={p} className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-emerald-400" /> {p}
                </li>
              ))}
            </ul>
            <div className="mt-8 max-w-md">
              <JoinRoomForm />
            </div>
          </div>

          <div aria-hidden="true" className="relative hidden lg:block">
            <div className="absolute inset-8 rounded-full bg-violet-600/20 blur-3xl" />
            <div className="relative grid grid-cols-2 gap-4">
              {HERO_GAMES.map(({ id, tilt }) => (
                <div
                  key={id}
                  className={`overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-[0_24px_48px_-20px_rgba(0,0,0,0.9)] ${tilt}`}
                >
                  <div className="aspect-[4/3]">
                    <GameCover game={id} />
                  </div>
                  <p className="border-t border-white/[0.06] px-3 py-2 font-display text-sm font-semibold text-slate-200">
                    {GAMES[id].title}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section id="juegos" className="w-full scroll-mt-14 pb-16">
        {/* Filters stay at hand while scrolling the shelves (from tablets up). */}
        <div className="border-y border-white/[0.06] bg-[#0b0c10]/85 backdrop-blur-md sm:sticky sm:top-14 sm:z-30">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-6">
            <div
              role="group"
              aria-label="¿Con quién vas a jugar?"
              className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
            >
              <button onClick={() => setContext(null)} aria-pressed={!context} className={pillClass(!context)}>
                <LayoutGrid className="h-4 w-4" /> Todos
              </button>
              {CONTEXTS.map((c) => {
                const active = context === c.id;
                const Icon = CONTEXT_ICONS[c.id];
                return (
                  <button
                    key={c.id}
                    onClick={() => setContext(active ? null : c.id)}
                    aria-pressed={active}
                    title={c.hint}
                    className={pillClass(active)}
                  >
                    <Icon className="h-4 w-4" /> {c.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/60 px-3.5 transition focus-within:border-violet-400/70 focus-within:ring-4 focus-within:ring-violet-500/15 sm:ml-auto sm:w-64">
              <Search className="h-4 w-4 shrink-0 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Buscar entre ${GAME_ORDER.length} juegos`}
                aria-label="Buscar juegos"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Borrar búsqueda" className="text-slate-500 hover:text-slate-300">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          {(selected || q) && (
            <div className="mt-8 flex items-baseline justify-between gap-3">
              <p className="text-sm text-slate-400">
                {q
                  ? `${searchResults.length} ${searchResults.length === 1 ? "juego" : "juegos"}${selected ? ` ${selected.label.toLowerCase()}` : ""}`
                  : `Juegos para jugar ${selected!.label.toLowerCase()} · ${selected!.hint}`}
              </p>
              <button
                onClick={() => {
                  setContext(null);
                  setQuery("");
                }}
                className="text-sm font-medium text-slate-300 underline-offset-4 hover:text-white hover:underline"
              >
                Limpiar filtros
              </button>
            </div>
          )}

          {q ? (
            searchResults.length ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {searchResults.map((id) => (
                  <GameCard key={id} game={GAMES[id]} />
                ))}
              </div>
            ) : (
              <p className="mt-10 text-center text-slate-400">No encontramos juegos con «{query.trim()}».</p>
            )
          ) : (
            CATEGORIES.map((cat) => {
              const ids = cat.games.filter(fits);
              if (!ids.length) return null;
              return (
                <div key={cat.id} className="mt-12 first:mt-10">
                  <div className="flex items-end justify-between gap-3 border-b border-white/[0.06] pb-3">
                    <div>
                      <h2 className="font-display text-xl font-semibold tracking-tight text-white sm:text-2xl">{cat.label}</h2>
                      <p className="mt-0.5 text-sm text-slate-400">{cat.hint}</p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">
                      {ids.length} {ids.length === 1 ? "juego" : "juegos"}
                    </span>
                  </div>
                  {/* A swipeable shelf on phones; a grid from tablets up. */}
                  <div className="-mx-4 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
                    {ids.map((id) => (
                      <div key={id} className="flex w-[78%] shrink-0 snap-start sm:w-auto">
                        <GameCard game={GAMES[id]} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </>
  );
}
