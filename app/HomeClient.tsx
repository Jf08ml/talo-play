"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cleanupOldRooms } from "@/lib/roomCleanup";
import { isFirebaseConfigured } from "@/lib/firebase";
import { CATEGORIES, CONTEXTS, GAME_ORDER, GAMES, type GameId, type PlayContext } from "@/lib/games";
import { normalizeText } from "@/lib/text";
import { Search, X } from "lucide-react";
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
  CuatroThumbnail,
  PalabraThumbnail,
  TriviaThumbnail,
  ImpostorThumbnail,
  NavalThumbnail,
  ProbableThumbnail,
  ConocesThumbnail,
  GeneralaThumbnail,
  EmojisThumbnail,
  VerdadesThumbnail,
  DamasThumbnail,
  CajasThumbnail,
  RetoThumbnail,
  MimicaThumbnail,
  AhorcadoThumbnail,
  SopaThumbnail,
  CarrerasThumbnail,
  Carreras3dThumbnail,
  ArenaThumbnail,
  YoNuncaThumbnail,
  OndaThumbnail,
  TelefonoThumbnail,
  LudoThumbnail,
  LoboThumbnail,
  AjedrezThumbnail,
  ChinchonThumbnail,
  TrucoThumbnail,
  FuegoThumbnail,
  OteloThumbnail,
  BackgammonThumbnail,
  OcaThumbnail,
  DominoThumbnail,
  PasteleriaThumbnail,
} from "@/components/GameThumbnails";
import { useClientIdentity } from "@/hooks/useClientIdentity";

const THUMBNAILS: Record<GameId, ReactNode> = {
  rompecabezas: <PuzzleThumbnail />,
  deslizante: <DeslizanteThumbnail />,
  memotest: <MemotestThumbnail />,
  tutti: <TuttiThumbnail />,
  dibujo: <DibujoThumbnail />,
  codigo: <CodigoThumbnail />,
  cuatro: <CuatroThumbnail />,
  palabra: <PalabraThumbnail />,
  trivia: <TriviaThumbnail />,
  impostor: <ImpostorThumbnail />,
  naval: <NavalThumbnail />,
  probable: <ProbableThumbnail />,
  conoces: <ConocesThumbnail />,
  generala: <GeneralaThumbnail />,
  emojis: <EmojisThumbnail />,
  verdades: <VerdadesThumbnail />,
  damas: <DamasThumbnail />,
  cajas: <CajasThumbnail />,
  reto: <RetoThumbnail />,
  mimica: <MimicaThumbnail />,
  ahorcado: <AhorcadoThumbnail />,
  sopa: <SopaThumbnail />,
  carreras: <CarrerasThumbnail />,
  carreras3d: <Carreras3dThumbnail />,
  arena: <ArenaThumbnail />,
  yonunca: <YoNuncaThumbnail />,
  onda: <OndaThumbnail />,
  telefono: <TelefonoThumbnail />,
  ludo: <LudoThumbnail />,
  lobo: <LoboThumbnail />,
  ajedrez: <AjedrezThumbnail />,
  chinchon: <ChinchonThumbnail />,
  truco: <TrucoThumbnail />,
  fuego: <FuegoThumbnail />,
  otelo: <OteloThumbnail />,
  backgammon: <BackgammonThumbnail />,
  oca: <OcaThumbnail />,
  domino: <DominoThumbnail />,
  pasteleria: <PasteleriaThumbnail />,
};

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

          <div className="mx-auto mt-6 flex max-w-2xl items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/50 px-3 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/30">
            <Search className="h-4 w-4 shrink-0 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Buscar entre ${GAME_ORDER.length} juegos…`}
              aria-label="Buscar juegos"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-slate-100 outline-none placeholder:text-slate-500"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Borrar búsqueda" className="text-slate-500 hover:text-slate-300">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {(selected || q) && (
            <div className="mt-8 flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium uppercase tracking-wide text-slate-500">
                {q
                  ? `${searchResults.length} ${searchResults.length === 1 ? "juego" : "juegos"}${selected ? ` ${selected.label.toLowerCase()}` : ""}`
                  : `Para jugar ${selected!.label.toLowerCase()}`}
              </h3>
              <button
                onClick={() => {
                  setContext(null);
                  setQuery("");
                }}
                className="text-sm text-violet-400 hover:text-violet-300"
              >
                Ver todos
              </button>
            </div>
          )}

          {q ? (
            searchResults.length ? (
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {searchResults.map((id) => (
                  <GameCard key={id} game={GAMES[id]} thumbnail={THUMBNAILS[id]} />
                ))}
              </div>
            ) : (
              <p className="mt-6 text-center text-slate-400">No encontramos juegos con «{query.trim()}».</p>
            )
          ) : (
            CATEGORIES.map((cat) => {
              const ids = cat.games.filter(fits);
              if (!ids.length) return null;
              return (
                <div key={cat.id} className="mt-9">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-lg font-semibold text-slate-100 sm:text-xl">{cat.label}</h3>
                    <span className="text-xs text-slate-500">{ids.length} {ids.length === 1 ? "juego" : "juegos"}</span>
                  </div>
                  <p className="text-sm text-slate-500">{cat.hint}</p>
                  {/* A swipeable shelf on phones; a grid from tablets up. */}
                  <div className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
                    {ids.map((id) => (
                      <div key={id} className="flex w-[78%] shrink-0 snap-start sm:w-auto">
                        <GameCard game={GAMES[id]} thumbnail={THUMBNAILS[id]} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
