"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Globe, Megaphone } from "lucide-react";
import { GAMES, roomPath, type GameId } from "@/lib/games";
import { isFirebaseConfigured } from "@/lib/firebase";
import { subscribeListedRooms, type ListedRoom } from "@/lib/openRooms";
import { trackEvent } from "@/lib/analytics";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import GameIcon from "./GameIcon";

export function useListedRooms(game?: GameId): ListedRoom[] {
  const [rooms, setRooms] = useState<ListedRoom[]>([]);
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    return subscribeListedRooms(setRooms);
  }, []);
  return game ? rooms.filter((r) => r.game === game) : rooms;
}

function statusOf(r: ListedRoom): string {
  const full = r.count >= GAMES[r.game].maxPlayers;
  if (r.playing) return full ? "En partida · completa" : "En partida";
  return full ? "Esperando · completa" : "Esperando gente";
}

/**
 * "Salas abiertas" (light pages and the Plaza): rooms anyone can walk into —
 * open rooms (also mid-game) and waiting rooms asking the Plaza for people.
 * Renders nothing when there are none, unless `empty` says what to show.
 */
export default function OpenRoomsList({
  game,
  where,
  limit = 8,
  title,
  empty,
  onJoin,
  className = "",
}: {
  game?: GameId;
  where: "inicio" | "lobby" | "plaza";
  limit?: number;
  title?: string;
  empty?: ReactNode;
  onJoin?: () => void;
  className?: string;
}) {
  const rooms = useListedRooms(game);
  const { clientId } = useClientIdentity();
  if (!rooms.length && !empty) return null;
  const shown = rooms.slice(0, limit);

  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      <h2 className="flex items-center gap-2 text-[15px] font-extrabold sm:text-[17px]">
        <span className="relative flex h-2.5 w-2.5">
          {rooms.length > 0 && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />}
          <span className={`relative h-2.5 w-2.5 rounded-full ${rooms.length ? "bg-emerald-500" : "bg-black/25"}`} />
        </span>
        {title ?? "Salas abiertas"}
        {rooms.length > 0 && ` (${rooms.length})`}
      </h2>
      {!rooms.length ? (
        empty
      ) : (
        <ul className="grid gap-2 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {shown.map((r) => {
            const mine = r.by === clientId;
            return (
              <li key={r.room} className="flex min-w-0 items-center gap-3 rounded-2xl border-2 border-talo-ink bg-white p-2 text-talo-ink">
                <GameIcon game={r.game} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-bold">
                    {r.kind === "abierta" ? (
                      <Globe className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Sala abierta" />
                    ) : (
                      <Megaphone className="h-3.5 w-3.5 shrink-0" aria-label="Busca gente" />
                    )}
                    <span className="truncate">{game ? `Sala de ${r.name}` : GAMES[r.game].title}</span>
                  </p>
                  <p className="truncate text-[13px] text-black/60">
                    {game ? "" : `${r.name} · `}
                    {r.count === 1 ? "1 adentro" : `${r.count} adentro`} · {statusOf(r)}
                  </p>
                </div>
                <Link
                  href={roomPath(r.game, r.room)}
                  onClick={() => {
                    trackEvent("open_room_join", { game: r.game, where });
                    onJoin?.();
                  }}
                  className="shrink-0 rounded-xl bg-talo-ink px-3.5 py-2 text-sm font-bold text-talo-hero"
                >
                  {mine ? "Volver" : r.playing ? "Entrar" : "Unirme"}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {rooms.length > shown.length && <p className="text-sm font-semibold text-black/60">y {rooms.length - shown.length} más en la Plaza</p>}
    </section>
  );
}
