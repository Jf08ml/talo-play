"use client";

import { trackEvent } from "@/lib/analytics";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ROUND_OPTIONS, createConocesRoom } from "@/lib/conoces";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";

export default function ConocesHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [rounds, setRounds] = useState<number>(3);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createConocesRoom({ rounds }, identity.clientId);
      trackEvent("create_room", { game: "conoces" });
      router.push(roomPath("conoces", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="conoces">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Preguntas para cada uno</p>
          <div className="grid grid-cols-3 gap-1.5">
            {ROUND_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setRounds(n)} className={chipClass(rounds === n)}>
                {n} preguntas
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            De a dos es ideal para parejas; en grupo, descubren quién conoce mejor a quién.
          </p>
        </div>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
