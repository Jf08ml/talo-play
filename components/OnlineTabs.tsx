"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Globe, Loader2, Users } from "lucide-react";
import type { Opponent } from "@/lib/boardBot";
import { searchMatch } from "@/lib/matchmaking";
import { roomPath, type GameId } from "@/lib/games";
import { trackEvent } from "@/lib/analytics";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, segmentClass } from "./ui";

/**
 * A one-on-one game's lobby: «En línea» (find a rival and play at once; see
 * `lib/matchmaking.ts`) or «Con amigos» (`friends`, the usual create form).
 * `create(hostId, vs)` makes the room against `vs` and returns its code;
 * `queue` separates rivals by variant when a game has them.
 */
export default function OnlineTabs({
  game,
  queue = game,
  text,
  extra,
  create,
  friends,
}: {
  game: GameId;
  queue?: string;
  text: string;
  /** Choices that split the queue (e.g. a game mode), above the button. */
  extra?: ReactNode;
  create: (hostId: string, vs: Opponent) => Promise<string>;
  friends: ReactNode;
}) {
  const router = useRouter();
  const identity = useClientIdentity();
  const [tab, setTab] = useState<"online" | "amigos">("online");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelRef.current?.(), []);

  const search = () => {
    if (!identity.clientId || !identity.name) return;
    setSearching(true);
    setError(null);
    cancelRef.current = searchMatch(
      queue,
      { clientId: identity.clientId, name: identity.name, color: identity.color },
      (vs) => create(identity.clientId, vs),
      (found) => {
        cancelRef.current = null;
        if (found.created) trackEvent("create_room", { game, mode: found.bot ? "online_bot" : "online" });
        router.push(roomPath(game, found.roomId));
      },
      (err) => {
        console.error(err);
        cancelRef.current = null;
        setSearching(false);
        setError("No se pudo buscar rival. Prueba de nuevo.");
      }
    );
  };

  const cancel = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    setSearching(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/80 p-1 ring-1 ring-slate-700/60">
        <button onClick={() => setTab("online")} className={`flex items-center justify-center gap-1.5 ${segmentClass(tab === "online")}`}>
          <Globe className="h-4 w-4" /> En línea
        </button>
        <button
          onClick={() => {
            cancel();
            setTab("amigos");
          }}
          className={`flex items-center justify-center gap-1.5 ${segmentClass(tab === "amigos")}`}
        >
          <Users className="h-4 w-4" /> Con amigos
        </button>
      </div>
      {tab === "amigos" ? (
        friends
      ) : (
        <div className={`${CARD} flex flex-col gap-4`}>
          <div>
            <h2 className="font-display text-lg text-slate-100">Juega con alguien ahora</h2>
            <p className="mt-1 text-sm text-slate-400">{text}</p>
          </div>
          {!searching && extra}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {searching ? (
            <>
              <p className="flex items-center justify-center gap-2 py-2 text-sm font-semibold text-slate-200" role="status">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando rival…
              </p>
              <button onClick={cancel} className={SECONDARY_BUTTON}>
                Cancelar
              </button>
            </>
          ) : (
            <button onClick={search} disabled={!identity.clientId || !identity.name} className={PRIMARY_BUTTON}>
              Buscar rival
            </button>
          )}
        </div>
      )}
    </div>
  );
}
