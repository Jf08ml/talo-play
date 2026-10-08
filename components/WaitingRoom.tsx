"use client";

import type { ReactNode } from "react";
import { GAMES, type GameId } from "@/lib/games";
import type { PresenceMap } from "@/lib/presence";
import { Crown } from "lucide-react";
import InviteCard from "./InviteCard";
import GameIcon from "./GameIcon";
import { CARD, PRIMARY_BUTTON } from "./ui";

export interface WaitingPlayer {
  id: string;
  name: string;
  color: string;
}

/**
 * Who may press "Empezar": the host, or anyone when the room has no host
 * (rooms from before hosts existed) or the host isn't connected — so a host
 * closing the tab never strands the room.
 */
export function startPermission(
  hostId: string,
  hostName: string | undefined,
  presence: PresenceMap,
  myId: string
): { canStart: boolean; message: string } {
  // Presence starts empty: until I see myself in it, assume the host is here.
  const loaded = myId in presence;
  if (!hostId) return { canStart: true, message: "Cuando estén todos, cualquiera puede empezar." };
  if (hostId === myId) return { canStart: true, message: "Sos el anfitrión: cuando estén todos, empezá la partida." };
  if (loaded && !(hostId in presence)) {
    return { canStart: true, message: `${hostName ?? "El anfitrión"} no está conectado: podés empezar vos.` };
  }
  return { canStart: false, message: `Esperando a que ${hostName ?? "el anfitrión"} empiece la partida…` };
}

/**
 * The shared pre-game screen: which game, who's in (and who hosts), how to
 * play, how to invite, and who starts.
 */
export default function WaitingRoom({
  game,
  roomId,
  hostId,
  players,
  presence,
  myId,
  summary,
  onStart,
  children,
}: {
  game: GameId;
  roomId: string;
  hostId: string;
  players: WaitingPlayer[];
  presence: PresenceMap;
  myId: string;
  /** The room's settings in a line ("5 rondas · 8 categorías"). */
  summary?: string;
  onStart: () => void;
  /** Game-specific setup shown above the players (e.g. team picking). */
  children?: ReactNode;
}) {
  const info = GAMES[game];
  const online = players.filter((p) => p.id in presence || p.id === myId);
  const host = players.find((p) => p.id === hostId);
  const { canStart, message } = startPermission(hostId, host?.name, presence, myId);
  const fewPlayers = online.length < info.minPlayers;

  return (
    <div className={`${CARD} flex flex-col gap-5`}>
      <div className="text-center">
        <p className="flex items-center justify-center gap-2.5 font-display text-2xl font-semibold text-slate-100">
          <GameIcon game={game} />
          {info.title}
        </p>
        {summary && <p className="mt-1 text-sm text-slate-400">{summary}</p>}
      </div>

      {children}

      <div>
        <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
          En la sala ({online.length})
        </p>
        <ul className="flex flex-wrap justify-center gap-2">
          {online.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-1.5 rounded-full bg-slate-800/80 py-1 pl-1 pr-3 text-sm text-slate-200 ring-1 ring-slate-700"
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: p.color }}
              >
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              {p.name}
              {p.id === myId && <span className="text-slate-500">(vos)</span>}
              {p.id === hostId && <Crown className="h-4 w-4 text-amber-300" aria-label="Anfitrión" />}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm text-slate-300">{message}</p>
        {fewPlayers && (
          <p className="text-xs text-amber-300/90">
            Se juega mejor con {info.minPlayers} o más: ¡invitá a alguien!
          </p>
        )}
        {canStart && (
          <button onClick={onStart} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
            Empezar partida
          </button>
        )}
      </div>

      <InviteCard game={game} roomId={roomId} />

      <details className="group rounded-xl bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
        <summary className="cursor-pointer list-none font-medium text-slate-200">
          <span className="mr-1 inline-block transition group-open:rotate-90">▸</span> Cómo se juega
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-400">
          {info.howTo.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}
