"use client";

import { useEffect, useState } from "react";
import type { GameId } from "@/lib/games";
import { isNew, newGames } from "@/lib/newGames";

/** The new games, worked out in the browser (empty on the server and the first render). */
export function useNewGames(): GameId[] {
  const [ids, setIds] = useState<GameId[]>([]);
  useEffect(() => {
    // After mount, so the static HTML never carries the build day's list.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIds(newGames());
  }, []);
  return ids;
}

/** A yellow "Nuevo" tag for a game released in the last NEW_DAYS days (nothing otherwise). */
export default function NewBadge({ game, className = "" }: { game: GameId; className?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(isNew(game));
  }, [game]);
  if (!show) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border-2 border-talo-ink bg-talo-hero px-2 py-0.5 text-[12px] font-extrabold uppercase leading-none tracking-wide text-talo-ink ${className}`}
    >
      Nuevo
    </span>
  );
}
