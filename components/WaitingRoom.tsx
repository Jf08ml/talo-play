"use client";

import { useEffect, type ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";
import { GAMES, type GameId } from "@/lib/games";
import type { PresenceMap } from "@/lib/presence";
import { ChevronDown } from "lucide-react";
import { categoryOf, gameColors } from "@/lib/talos";
import InviteCard from "./InviteCard";
import TaloTable from "./TaloTable";
import { PRIMARY_BUTTON } from "./ui";
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
 * The shared pre-game screen (talo-handoff Sala.dc.html): which game, who's
 * at the table as talos (and who hosts), how to invite, how to play, and who
 * starts.
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
  blocked,
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
  /** Why the game can't start yet (e.g. teams not set): shown instead and "Empezar" is off. */
  blocked?: string;
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

  const { color, ink } = gameColors(game);

  return (
    <div className="overflow-hidden rounded-[28px] bg-[#1c1c1c] ring-1 ring-white/[0.08]">
      {/* The table, in the shelf's color: who's in, as talos. */}
      <section className="flex flex-col gap-4 px-5 pb-6 pt-5" style={{ background: color, color: ink }}>
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] font-bold">{categoryOf(game).label}</span>
          <span className="text-balance font-display text-2xl sm:text-[28px]">{info.title}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-extrabold">En la mesa</h2>
          <span className="text-[15px] font-bold">
            {online.length} jugando
            {info.maxPlayers > info.minPlayers && <span className="font-medium opacity-75"> · hasta {info.maxPlayers}</span>}
          </span>
        </div>
        <TaloTable players={online} hostId={hostId} myId={myId} open={openSeats} tagInk={ink} />
      </section>

      <div className="flex flex-col gap-6 p-5">
        {summary && <p className="text-[15px] font-medium text-white/80">{summary}</p>}
        {settings && !canStart && (
          <p className="-mt-4 text-sm text-white/50">El anfitrión puede cambiar la configuración antes de empezar.</p>
        )}

        {settings && canStart && settings}

        {children}

        {inviteFirst && invite}

        <div className="flex flex-col items-center gap-2.5 text-center">
          {canStart && (
            <button
              onClick={start}
              disabled={missing > 0 || !!blocked}
              className={`min-h-[62px] w-full font-display text-[22px] ${PRIMARY_BUTTON}`}
            >
              {missing > 0 ? `Esperando ${missing === 1 ? "1 jugador" : `${missing} jugadores`}` : "Empezar partida"}
            </button>
          )}
          {missing > 0 ? (
            <p className="text-sm font-bold text-talo-hero">
              {missing === 1 ? "Falta 1 jugador" : `Faltan ${missing} jugadores`} para empezar: ¡mandá el link!
            </p>
          ) : blocked ? (
            <p className="text-sm font-bold text-talo-hero">{blocked}</p>
          ) : (
            <p className="text-sm text-white/70">{message}</p>
          )}
          {fewPlayers && (
            <p className="text-sm text-white/70">Se juega mejor con {info.minPlayers} o más: ¡invitá a alguien!</p>
          )}
        </div>

        {!inviteFirst && invite}

        <details className="group border-t border-white/10 pt-4 text-sm text-white/80">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-base font-bold text-white [&::-webkit-details-marker]:hidden">
            Cómo se juega
            <ChevronDown className="h-5 w-5 transition-transform group-open:rotate-180" strokeWidth={2.4} />
          </summary>
          <div className="mt-3">
            <GuideBody game={game} />
          </div>
        </details>
      </div>
    </div>
  );
}
