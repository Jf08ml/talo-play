"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { GAMES, type GameId } from "@/lib/games";
import { shareInvite } from "@/lib/share";
import { trackEvent } from "@/lib/analytics";
import { TaloMark } from "./TaloLogo";
import GameIcon from "./GameIcon";
import { RulesButton } from "./HowToPlay";
import { Check, Share2 } from "lucide-react";

/**
 * Top bar shared by every game's room: back to Talo, which game, room code
 * and an always-visible "Invitar" and "Reglas". `badges` go after the code (e.g. mode);
 * `right` is the game's own status area (progress, players…).
 */
export default function RoomHeader({
  game,
  roomId,
  badges,
  right,
}: {
  game: GameId;
  roomId: string;
  badges?: ReactNode;
  right?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const invite = async () => {
    trackEvent("share", { game, method: "header" });
    if ((await shareInvite(game, roomId)) === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-violet-500/15 bg-slate-900/80 px-3 py-2.5 shadow-[0_1px_20px_rgba(139,92,246,0.08)] backdrop-blur sm:px-4 sm:py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/" aria-label="Volver a Talo" className="flex items-center gap-1.5 hover:opacity-80">
          <TaloMark className="h-6 w-6" />
        </Link>
        <span className="flex items-center gap-1.5 font-display text-sm font-semibold text-slate-200">
          <GameIcon game={game} size="sm" /> <span className="hidden sm:inline">{GAMES[game].title}</span>
        </span>
        <span className="text-slate-700">·</span>
        <span className="rounded-md border border-violet-500/20 bg-slate-800 px-2 py-1 font-mono text-sm font-semibold text-violet-200">
          {roomId}
        </span>
        {badges}
        <button
          onClick={invite}
          aria-label="Invitar"
          className="flex h-7 items-center gap-1.5 rounded-md bg-cyan-500/15 px-2 text-xs font-semibold text-cyan-200 ring-1 ring-cyan-400/30 transition hover:bg-cyan-500/25 active:scale-95 sm:px-2.5"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
          {/* On a phone the label only shows as feedback, so the bar fits one line. */}
          <span className={copied ? "" : "hidden sm:inline"}>{copied ? "¡Link copiado!" : "Invitar"}</span>
        </button>
        <RulesButton game={game} where="partida" compact />
      </div>

      {right && <div className="ml-auto flex items-center justify-end gap-4">{right}</div>}
    </header>
  );
}
