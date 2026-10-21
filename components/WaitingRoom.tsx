"use client";

import { useEffect, type ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";
import { GAMES, type GameId } from "@/lib/games";
import type { PresenceMap } from "@/lib/presence";
import { ChevronRight, Crown, Play, UserPlus } from "lucide-react";
import InviteCard from "./InviteCard";
import GameIcon from "./GameIcon";
import { CARD, PRIMARY_BUTTON } from "./ui";
import { GuideBody } from "./HowToPlay";

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
  settings,
  minToStart = 0,
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
  /**
   * The settings editor (`RoomSettingsEditor`), shown to whoever may start;
   * the rest see the summary, which updates when it's saved.
   */
  settings?: ReactNode;
  /** Connected players the game needs to start at all (below it, "Empezar" is off). */
  minToStart?: number;
  onStart: () => void;
  /** Game-specific setup shown above the players (e.g. team picking). */
  children?: ReactNode;
}) {
  const info = GAMES[game];
  const online = players.filter((p) => p.id in presence || p.id === myId);
  const host = players.find((p) => p.id === hostId);
  const { canStart, message } = startPermission(hostId, host?.name, presence, myId);
  const missing = Math.max(0, minToStart - online.length);
  const fewPlayers = !missing && online.length < info.minPlayers;
  // Open seats drawn after the players, up to what the game needs or plays best with.
  const openSeats = Math.max(0, Math.max(minToStart, info.minPlayers, 2) - online.length);
  // While the room is (nearly) empty, inviting is the main thing to do: the invite goes first.
  const inviteFirst = missing > 0 || online.length < 2;
  const isHost = hostId === myId;

  useEffect(() => {
    trackEvent("join_room", { game, host: isHost });
  }, [game, roomId, isHost]);

  const start = () => {
    trackEvent("start_game", { game, players: online.length });
    onStart();
  };

  const invite = <InviteCard game={game} roomId={roomId} />;

  return (
    <div className={`${CARD} flex flex-col gap-5`}>
      <div className="text-center">
        <p className="flex items-center justify-center gap-2.5 font-display text-2xl font-semibold text-slate-100">
          <GameIcon game={game} />
          {info.title}
        </p>
        {summary && <p className="mt-1 text-sm text-slate-400">{summary}</p>}
        {settings && !canStart && (
          <p className="mt-1 text-xs text-slate-500">El anfitrión puede cambiar la configuración antes de empezar.</p>
        )}
      </div>

      {settings && canStart && settings}

      {children}

      {inviteFirst && invite}

      <div>
        <p className="mb-2.5 flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          En la sala · {online.length}
          {info.maxPlayers > info.minPlayers && <span className="normal-case text-slate-600">(hasta {info.maxPlayers})</span>}
        </p>
        <ul className="flex flex-wrap justify-center gap-2">
          {online.map((p) => (
            <li
              key={p.id}
              className={`animate-pop-in flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-sm text-slate-200 ring-1 ${
                p.id === myId ? "bg-violet-500/10 ring-violet-400/40" : "bg-slate-800/80 ring-slate-700"
              }`}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: p.color, boxShadow: `0 0 10px ${p.color}66` }}
              >
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="max-w-[9rem] truncate">{p.name}</span>
              {p.id === myId && <span className="text-slate-500">(vos)</span>}
              {p.id === hostId && <Crown className="h-4 w-4 text-amber-300" aria-label="Anfitrión" />}
            </li>
          ))}
          {Array.from({ length: openSeats }, (_, i) => (
            <li
              key={`open-${i}`}
              className="flex items-center gap-1.5 rounded-full border border-dashed border-slate-700 py-1 pl-1 pr-3 text-sm text-slate-500"
            >
              <span className="flex h-7 w-7 animate-pulse items-center justify-center rounded-full border border-dashed border-slate-600">
                <UserPlus className="h-3.5 w-3.5" />
              </span>
              Esperando…
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        {missing > 0 ? (
          <p className="text-sm font-medium text-amber-300/90">
            {missing === 1 ? "Falta 1 jugador" : `Faltan ${missing} jugadores`} para empezar: ¡mandá el link!
          </p>
        ) : (
          <p className="text-sm text-slate-300">{message}</p>
        )}
        {fewPlayers && (
          <p className="text-xs text-amber-300/90">
            Se juega mejor con {info.minPlayers} o más: ¡invitá a alguien!
          </p>
        )}
        {canStart && (
          <button onClick={start} disabled={missing > 0} className={`flex w-full max-w-xs items-center justify-center gap-2 ${PRIMARY_BUTTON}`}>
            <Play className="h-4 w-4 fill-current" />
            {missing > 0 ? `Esperando ${missing === 1 ? "1 jugador" : `${missing} jugadores`}` : "Empezar partida"}
          </button>
        )}
      </div>

      {!inviteFirst && invite}

      <details className="group rounded-xl bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-slate-200">
          <ChevronRight className="h-4 w-4 transition group-open:rotate-90" /> Cómo se juega
        </summary>
        <div className="mt-3">
          <GuideBody game={game} />
        </div>
      </details>
    </div>
  );
}
