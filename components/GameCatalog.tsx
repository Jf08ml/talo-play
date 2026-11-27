"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { CATEGORIES, CONTEXTS, GAME_ORDER, GAMES, type GameId, type PlayContext } from "@/lib/games";
import { CATEGORY_COLORS, gameColors } from "@/lib/talos";
import { shelfLanding } from "@/lib/landings";
import GameArt from "@/components/GameArt";
import NewBadge from "@/components/NewBadge";

export default function GameCatalog() {
  const [query, setQuery] = useState("");
  const [context, setContext] = useState<PlayContext | null>(null);
  const [category, setCategory] = useState(-1);

  const games = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    const source = category < 0 ? GAME_ORDER : CATEGORIES[category].games;
    return source.filter((id) => {
      const game = GAMES[id];
      const matchesContext = !context || game.contexts.includes(context);
      const matchesQuery = !normalized || `${game.title} ${game.tagline} ${CATEGORIES.find((c) => c.games.includes(id))?.label ?? ""}`.toLocaleLowerCase("es").includes(normalized);
      return matchesContext && matchesQuery;
    });
  }, [category, context, query]);

  const modes: { id: PlayContext | null; label: string }[] = [{ id: null, label: "Cualquiera" }, ...CONTEXTS];

  return (
    <section id="juegos" className="mx-auto flex w-full max-w-[1360px] scroll-mt-4 flex-col gap-6 px-5 pb-12 pt-12 sm:gap-8 sm:px-10 sm:pb-16 sm:pt-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-2 text-sm font-extrabold uppercase tracking-[0.12em] text-talo-text-3">Explora el catálogo</p>
          <h2 className="font-display text-[32px] leading-[1.05] tracking-[-0.01em] sm:text-[44px]">¿A qué jugamos?</h2>
        </div>
        <span className="text-sm font-semibold text-talo-text-3">{games.length} {games.length === 1 ? "juego" : "juegos"}</span>
      </div>

      <label className="flex min-h-14 items-center gap-3 rounded-2xl border-2 border-talo-ink bg-white px-4 shadow-[4px_4px_0_#111] focus-within:shadow-[4px_4px_0_#2d5bff] sm:max-w-[620px]">
        <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-talo-text-3" />
        <span className="sr-only">Buscar juego</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busca por nombre o tipo de juego" className="min-w-0 flex-1 bg-transparent text-base font-semibold text-talo-ink outline-none placeholder:font-medium placeholder:text-talo-text-3" />
        {query && <button type="button" onClick={() => setQuery("")} className="rounded-lg px-2 py-1 text-sm font-bold underline underline-offset-4">Borrar</button>}
      </label>

      <div className="flex flex-col gap-3">
        <div role="group" aria-label="Filtrar por compañía" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="flex shrink-0 items-center pr-1 text-sm font-bold text-talo-text-3">Para jugar</span>
          {modes.map((mode) => {
            const selected = context === mode.id;
            return <button key={mode.label} type="button" aria-pressed={selected} onClick={() => setContext(mode.id)} className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-bold transition-colors ${selected ? "border-talo-ink bg-talo-ink text-white" : "border-talo-line bg-white hover:border-talo-ink"}`}>{mode.label}</button>;
          })}
        </div>
        <div role="group" aria-label="Filtrar por categoría" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
          <button type="button" aria-pressed={category < 0} onClick={() => setCategory(-1)} className={`inline-flex min-h-11 shrink-0 items-center rounded-xl px-4 text-sm font-bold ${category < 0 ? "bg-talo-hero text-talo-ink" : "bg-talo-surface hover:bg-talo-line"}`}>Todos</button>
          {CATEGORIES.map((item, index) => {
            const selected = category === index;
            return <button key={item.id} type="button" aria-pressed={selected} onClick={() => setCategory(index)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-bold ${selected ? "bg-talo-hero text-talo-ink" : "bg-talo-surface hover:bg-talo-line"}`}><span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: CATEGORY_COLORS[item.id].color }} />{item.label}</button>;
          })}
        </div>
      </div>

      {category >= 0 && !query && <p className="-mt-2 text-sm text-talo-text-3">{CATEGORIES[category].hint} · <Link href={`/${shelfLanding(CATEGORIES[category].id).slug}`} className="font-bold text-talo-ink underline underline-offset-4">Ver esta colección</Link></p>}

      {games.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {games.map((id: GameId) => {
            const game = GAMES[id];
            const colors = gameColors(id);
            const players = game.minPlayers === game.maxPlayers
              ? `${game.minPlayers} ${game.minPlayers === 1 ? "jugador" : "jugadores"}`
              : `${game.minPlayers}+ jugadores`;
            return <Link key={id} href={`/${game.path}`} aria-label={`${game.title}, ${players}`} className="group relative block aspect-[9/16] min-w-0 overflow-hidden rounded-[20px] border-2 border-talo-ink bg-white shadow-[3px_3px_0_#111] transition duration-200 hover:-translate-y-1 hover:shadow-[5px_6px_0_#111] focus-visible:shadow-[5px_6px_0_#111] sm:rounded-[24px]">
              <NewBadge game={id} className="absolute left-2 top-2 z-20 shadow-[2px_2px_0_#111] sm:left-3 sm:top-3" />
              <span className="absolute inset-x-0 top-0 h-[72%] overflow-hidden" style={{ background: colors.color }}>
                <span aria-hidden="true" className="absolute -right-[20%] -top-[8%] h-[76%] aspect-square rounded-full border-[14px] border-white/20 sm:border-[18px]" />
                <span aria-hidden="true" className="absolute -bottom-[28%] -left-[20%] h-[72%] aspect-square rounded-full bg-black/10" />
                <GameArt game={id} className="absolute inset-0 h-full w-full scale-[1.12] drop-shadow-[0_7px_0_rgba(17,17,17,0.12)] transition-transform duration-300 group-hover:scale-[1.2]" />
              </span>
              <span className="absolute inset-x-0 bottom-0 flex h-[28%] flex-col justify-center gap-1.5 border-t-2 border-talo-ink bg-white px-2.5 py-2 sm:px-3 sm:py-2.5">
                <span className="flex flex-wrap items-center gap-1.5 font-extrabold leading-[1.05] text-talo-ink [font-size:clamp(14px,1.35vw,19px)]">{game.title}</span>
                <span className="flex items-center gap-1.5 text-xs font-bold text-talo-text-3 sm:text-sm">
                  <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: colors.color }} />
                  {players}
                </span>
              </span>
            </Link>;
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-talo-line bg-talo-surface px-5 py-10 text-center">
          <p className="text-lg font-extrabold">No encontramos juegos con esos filtros.</p>
          <p className="mt-1 text-sm text-talo-text-2">Prueba otra búsqueda o muestra todo el catálogo.</p>
          <button type="button" onClick={() => { setQuery(""); setContext(null); setCategory(-1); }} className="mt-4 rounded-full bg-talo-ink px-4 py-2.5 text-sm font-bold text-white">Ver todos los juegos</button>
        </div>
      )}
    </section>
  );
}
