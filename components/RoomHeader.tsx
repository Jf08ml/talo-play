"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { GAMES, type GameId } from "@/lib/games";

/**
 * Top bar shared by every game's room: back to the salón, room code, copy
 * link. `badges` go after the code (e.g. mode); `right` is the game's own
 * status area (progress, players…).
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

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be unavailable; ignore silently.
    }
  };

  return (
    <header className="flex flex-col gap-2.5 border-b border-violet-500/15 bg-slate-900/80 px-4 py-3 shadow-[0_1px_20px_rgba(139,92,246,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/"
          className="font-display flex items-center gap-1 text-sm font-semibold text-violet-400 hover:text-violet-300"
        >
          {GAMES[game].emoji} <span className="hidden sm:inline">Inicio</span>
        </Link>
        <span className="text-slate-700">·</span>
        <span className="text-xs uppercase tracking-wide text-slate-500">Sala</span>
        <span className="rounded-md border border-violet-500/20 bg-slate-800 px-2 py-1 font-mono text-sm font-semibold text-violet-200">
          {roomId}
        </span>
        {badges}
        <button
          onClick={copyLink}
          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          {copied ? "¡Copiado!" : "Copiar enlace"}
        </button>
      </div>

      {right && (
        <div className="flex items-center justify-between gap-4 sm:justify-end">{right}</div>
      )}
    </header>
  );
}
