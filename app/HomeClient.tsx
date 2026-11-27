"use client";

import { useEffect, useState } from "react";
import { cleanupOldRooms } from "@/lib/roomCleanup";
import { isFirebaseConfigured } from "@/lib/firebase";
import { GAME_ORDER, type GameId } from "@/lib/games";
import { getPlayStats, mostPlayed } from "@/lib/playStats";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import JoinRoomForm from "@/components/JoinRoomForm";
import PlazaBanner from "@/components/PlazaBanner";
import QuickPlay from "@/components/QuickPlay";
import InstallButton from "@/components/InstallButton";
import RankingTeaser from "@/components/RankingTeaser";
import OpenRoomsList from "@/components/OpenRoomsList";
import PlayerIdentity from "@/components/PlayerIdentity";
import SiteHeader from "@/components/SiteHeader";
import HeroCrowd from "@/components/HeroCrowd";
import { useNewGames } from "@/components/NewBadge";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import GameCatalog from "@/components/GameCatalog";
import GameFeatureCover from "@/components/GameFeatureCover";

// "Los que más se juegan" picks these until there are enough real plays to
// rank (lib/playStats.ts).
const CURATED: GameId[] = ["impostor", "truco", "dibujo", "naval"];

export default function HomeClient() {
  const identity = useClientIdentity();
  const [featured, setFeatured] = useState(CURATED);
  const fresh = useNewGames();

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
              <span className="hidden sm:inline">Elige un juego, manda el link por WhatsApp y en un minuto están jugando. Gratis y sin registrarse.</span>
              <span className="sm:hidden">Manda el link por WhatsApp y en un minuto están jugando.</span>
            </p>
            {/* Alone? Straight into a game with someone (components/QuickPlay.tsx). */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <QuickPlay className="w-full sm:w-auto" />
              <span className="text-[15px] font-semibold sm:max-w-[240px]">¿Solo? Te ponemos a jugar con alguien en segundos.</span>
            </div>
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

      <GameCatalog />

      {/* JUEGOS NUEVOS: only while something came out in the last weeks (lib/newGames.ts). */}
      {fresh.length > 0 && (
        <section className="mx-auto flex max-w-[1360px] flex-col gap-6 px-5 pt-14 sm:gap-8 sm:px-10 sm:pt-24">
          <div className="flex flex-col gap-1.5">
            <h2 className="font-display text-[32px] leading-[1.05] tracking-[-0.01em] sm:text-[44px]">Juegos nuevos</h2>
            <p className="text-[17px] text-talo-text-2">Lo último que sumamos a Talo. ¡Pruébalos!</p>
          </div>
          <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(190px,220px))] sm:gap-4 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
            {fresh.slice(0, 4).map((id) => <GameFeatureCover key={id} game={id} />)}
          </div>
        </section>
      )}

      {/* DESTACADOS */}
      <section className="mx-auto flex max-w-[1360px] flex-col gap-6 px-5 pt-14 sm:gap-8 sm:px-10 sm:pt-24">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-display text-[32px] leading-[1.05] tracking-[-0.01em] sm:text-[44px]">Los que más se juegan</h2>
          <a href="#juegos" className="font-bold underline underline-offset-[5px]">
            Ver los {GAME_ORDER.length} juegos
          </a>
        </div>
        <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(190px,220px))] sm:gap-4 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
          {featured.map((id) => <GameFeatureCover key={id} game={id} />)}
        </div>
      </section>




      {/* LA PLAZA: find people to play with. */}
      <div className="mx-auto max-w-[1360px] px-5 pt-8 sm:px-10 sm:pt-14">
        <PlazaBanner />
        <OpenRoomsList where="inicio" limit={6} title="Salas abiertas ahora" className="mt-6" />
        <RankingTeaser className="mt-6" />
        <InstallButton card className="mt-6" />
      </div>

    </div>
  );
}
