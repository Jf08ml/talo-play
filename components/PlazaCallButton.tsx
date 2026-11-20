"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import type { GameId } from "@/lib/games";
import { removeCall, sendCall, subscribeCall, updateCallCount, waitToPost, type Me } from "@/lib/plaza";
import { trackEvent } from "@/lib/analytics";
import { useServerNow } from "@/hooks/useServerNow";

/**
 * "Buscar gente en la Plaza" (waiting rooms): posts the room as a card in
 * `/plaza` with its game and how many are in, so people there join with one
 * tap. The one who posted keeps the head count current and takes the card
 * down when the waiting room closes (the game started or they left).
 */
export default function PlazaCallButton({ game, roomId, count, me }: { game: GameId; roomId: string; count: number; me: Me | null }) {
  const [call, setCall] = useState<{ by: string; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useServerNow(!!call, 30000);
  const postedByMe = !!me && call?.by === me.clientId;
  const mine = useRef(false);

  useEffect(() => subscribeCall(roomId, setCall), [roomId]);

  useEffect(() => {
    mine.current = postedByMe;
    if (postedByMe) updateCallCount(roomId, count);
  }, [postedByMe, roomId, count]);

  // Leaving the waiting room (the game starts, or I go): the card goes too.
  useEffect(
    () => () => {
      if (mine.current) removeCall(roomId);
    },
    [roomId]
  );

  const ask = () => {
    if (!me) return;
    const wait = waitToPost();
    if (wait > 0) return setError(`Esperá ${Math.ceil(wait / 1000)} s.`);
    setError(null);
    sendCall(me, game, roomId, count)
      .then(() => trackEvent("plaza_call", { game }))
      .catch(() => setError("No se pudo publicar. Probá de nuevo en unos segundos."));
  };

  const minutes = call ? Math.max(0, Math.floor((now - call.at) / 60000)) : 0;
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
      <div className="flex items-start gap-3">
        <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-talo-hero" />
        <div className="min-w-0 flex-1 text-sm text-white/80">
          {call ? (
            <p>
              <b className="text-white">Esta sala está en la Plaza</b> ({minutes < 1 ? "recién" : `hace ${minutes} min`}): la gente que
              entra puede sumarse con un toque.
            </p>
          ) : (
            <p>
              <b className="text-white">¿Faltan jugadores?</b> Publicá la sala en{" "}
              <Link href="/plaza" target="_blank" className="font-semibold text-talo-hero underline underline-offset-4">
                la Plaza
              </Link>{" "}
              y que se sume gente de Talo.
            </p>
          )}
        </div>
      </div>
      <button
        onClick={ask}
        disabled={!me}
        className="min-h-11 rounded-xl border-2 border-talo-hero px-4 text-sm font-bold text-talo-hero hover:bg-talo-hero hover:text-talo-ink disabled:opacity-40"
      >
        {call ? "Volver a avisar en la Plaza" : "Buscar gente en la Plaza"}
      </button>
      {error && <p className="text-xs font-semibold text-amber-300">{error}</p>}
    </div>
  );
}
