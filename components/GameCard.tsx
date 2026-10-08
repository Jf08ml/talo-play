"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Clock, Users } from "lucide-react";
import { playersLabel, type GameInfo } from "@/lib/games";
import GameIcon from "./GameIcon";

/** A game on the home page: cover art, name, one line, and who/how long it's for. */
export default function GameCard({ game, thumbnail }: { game: GameInfo; thumbnail: ReactNode }) {
  return (
    <Link
      href={`/${game.path}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-violet-500/15 bg-slate-900/60 shadow-[0_0_25px_rgba(139,92,246,0.08)] backdrop-blur transition hover:-translate-y-0.5 hover:border-violet-400/40 hover:shadow-[0_0_35px_rgba(139,92,246,0.2)]"
    >
      <div className="aspect-[2/1] w-full overflow-hidden">{thumbnail}</div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-slate-100">
          <GameIcon game={game.id} size="sm" />
          {game.title}
        </h3>
        <p className="flex-1 text-sm text-slate-400">{game.tagline}</p>
        <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5">
            <Users className="h-3.5 w-3.5" /> {playersLabel(game)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5">
            <Clock className="h-3.5 w-3.5" /> {game.duration}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 font-medium text-violet-300 transition group-hover:translate-x-0.5">
            Jugar <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
