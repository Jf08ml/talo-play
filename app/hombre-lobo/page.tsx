"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { createLoboRoom, DAY_OPTIONS } from "@/lib/lobo";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";

export default function LoboHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [daySeconds, setDaySeconds] = useState<number>(180);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createLoboRoom({ daySeconds }, identity.clientId);
      trackEvent("create_room", { game: "lobo" });
      router.push(roomPath("lobo", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="lobo">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Tiempo para discutir de día</p>
          <div className="grid grid-cols-3 gap-1.5">
            {DAY_OPTIONS.map((s) => (
              <button key={s} type="button" onClick={() => setDaySeconds(s)} className={chipClass(daySeconds === s)}>
                {s / 60} min
              </button>
            ))}
          </div>
        </div>

        <p className="text-sm text-slate-400">
          La app hace de narrador y reparte los roles según cuántos sean: 1 lobo con 5–6 jugadores, 2 hasta 9, 3 hasta 12 y
          4 desde 13, más una vidente y un médico. Se juega en persona o por videollamada.
        </p>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
