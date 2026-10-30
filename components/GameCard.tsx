"use client";

import Link from "next/link";
import { ArrowUpRight, Clock, Users } from "lucide-react";
import { playersLabel, type GameInfo } from "@/lib/games";
import GameCover from "./GameCover";
import GameIcon from "./GameIcon";

/** A game on the home page: cover art, name, one line, and who/how long it's for. */
export default function GameCard({ game }: { game: GameInfo }) {
  return (
    <Link
      href={`/${game.path}`}
      className="group flex w-full flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-slate-900/40 transition duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:bg-slate-900/70 hover:shadow-[0_16px_32px_-16px_rgba(0,0,0,0.8)]"
    >
      <div className="relative aspect-[2/1] w-full overflow-hidden border-b border-white/[0.06]">
        <div className="h-full w-full transition duration-500 group-hover:scale-[1.04]">
          <GameCover game={game.id} />
        </div>
        <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="flex items-center gap-2 font-display text-[17px] font-semibold tracking-tight text-slate-50">
          <GameIcon game={game.id} size="sm" />
          {game.title}
        </h3>
        <p className="flex-1 text-sm leading-snug text-slate-400">{game.tagline}</p>
        <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {playersLabel(game)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {game.duration}
          </span>
        </div>
      </div>
    </Link>
  );
}
