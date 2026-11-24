"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { GAMES, type GameId } from "@/lib/games";
import { gameColors } from "@/lib/talos";
import { gameToAnnounce, markAnnounced } from "@/lib/newGames";
import GameArt from "./GameArt";

const DELAY_MS = 2500;

/**
 * "Nuevo en Talo": once per new game, for people who played before, a small
 * card over the Ideas button on the light pages (rendered by `SiteHeader`).
 * Closing it, opening the game or visiting its lobby hides it for good.
 */
export default function NewGameBubble() {
  const path = usePathname();
  const [game, setGame] = useState<GameId | null>(null);

  useEffect(() => {
    const id = gameToAnnounce();
    if (!id) return;
    // Already on its page: that's the news, no need to tell.
    if (path === `/${GAMES[id].path}`) {
      markAnnounced(id);
      return;
    }
    const t = setTimeout(() => setGame(id), DELAY_MS);
    return () => clearTimeout(t);
  }, [path]);

  if (!game) return null;
  const close = () => {
    markAnnounced(game);
    setGame(null);
  };
  const { color } = gameColors(game);

  return (
    <div
      role="status"
      className="fixed bottom-[76px] right-4 z-[60] flex w-[min(320px,calc(100vw-32px))] items-center gap-3 rounded-2xl border-2 border-talo-ink bg-white p-3 pr-10 text-talo-ink shadow-[4px_4px_0_#111] sm:bottom-[92px] sm:right-6"
    >
      <button
        onClick={close}
        aria-label="Cerrar"
        className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-lg text-talo-text-3 hover:bg-talo-surface"
      >
        <X className="h-4 w-4" />
      </button>
      <span className="h-16 w-16 shrink-0 overflow-hidden rounded-[14px]" style={{ background: color }}>
        <GameArt game={game} className="h-full w-full" />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-[13px] font-extrabold uppercase tracking-wide text-talo-text-3">Nuevo en Talo</span>
        <span className="text-[17px] font-bold leading-tight">{GAMES[game].title}</span>
        <Link
          href={`/${GAMES[game].path}`}
          onClick={() => markAnnounced(game)}
          className="mt-1 inline-flex min-h-9 items-center self-start rounded-xl bg-talo-ink px-3 text-[14px] font-bold text-white hover:bg-black"
        >
          Pruébalo
        </Link>
      </span>
    </div>
  );
}
