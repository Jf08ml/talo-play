"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { GAMES, type GameId } from "@/lib/games";
import { shareInvite } from "@/lib/share";
import { TaloMark } from "./TaloLogo";

/**
 * Top bar shared by every game's room: back to Talo, which game, room code
 * and an always-visible "Invitar". `badges` go after the code (e.g. mode);
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
    if ((await shareInvite(game, roomId)) === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <header className="flex flex-col gap-2.5 border-b border-violet-500/15 bg-slate-900/80 px-4 py-3 shadow-[0_1px_20px_rgba(139,92,246,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/" aria-label="Volver a Talo" className="flex items-center gap-1.5 hover:opacity-80">
          <TaloMark className="h-6 w-6" />
        </Link>
        <span className="font-display text-sm font-semibold text-slate-200">
          {GAMES[game].emoji} <span className="hidden sm:inline">{GAMES[game].title}</span>
        </span>
        <span className="text-slate-700">·</span>
        <span className="rounded-md border border-violet-500/20 bg-slate-800 px-2 py-1 font-mono text-sm font-semibold text-violet-200">
          {roomId}
        </span>
        {badges}
        <button
          onClick={invite}
          className="rounded-md bg-cyan-500/15 px-2.5 py-1 text-xs font-semibold text-cyan-200 ring-1 ring-cyan-400/30 transition hover:bg-cyan-500/25"
        >
          {copied ? "¡Link copiado!" : "📤 Invitar"}
        </button>
      </div>

      {right && (
        <div className="flex items-center justify-between gap-4 sm:justify-end">{right}</div>
      )}
    </header>
  );
}
