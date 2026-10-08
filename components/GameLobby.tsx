"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { isFirebaseConfigured } from "@/lib/firebase";
import { GAMES, type GameId } from "@/lib/games";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import FirebaseSetupNotice from "./FirebaseSetupNotice";
import PlayerIdentity from "./PlayerIdentity";
import JoinRoomForm from "./JoinRoomForm";

/**
 * Common lobby page for a game: title, player name, and "create" next to
 * "join". Each game only supplies its own create-room form as `children`.
 */
export default function GameLobby({
  game,
  description,
  children,
}: {
  game: GameId;
  description: string;
  children: ReactNode;
}) {
  const identity = useClientIdentity();
  const info = GAMES[game];

  if (!isFirebaseConfigured()) return <FirebaseSetupNotice />;

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-3xl">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-violet-300"
        >
          ← Salón de juegos
        </Link>

        <h1 className="animate-glow-pulse mx-auto flex w-fit items-center gap-2 rounded-2xl px-2 text-center font-display text-3xl font-bold tracking-tight sm:text-5xl">
          <span>{info.emoji}</span>
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
            {info.title}
          </span>
        </h1>
        <p className="mt-3 text-center text-slate-400">{description}</p>

        <div className="mt-6">
          <PlayerIdentity identity={identity} />
        </div>

        {identity.name && (
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {children}
            <JoinRoomForm />
          </div>
        )}
      </div>
    </div>
  );
}
