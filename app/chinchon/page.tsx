"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { createChinchonRoom, LIMIT_OPTIONS } from "@/lib/chinchon";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";

export default function ChinchonHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [limit, setLimit] = useState<number>(100);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createChinchonRoom({ limit }, identity.clientId);
      trackEvent("create_room", { game: "chinchon" });
      router.push(roomPath("chinchon", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="chinchon">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Se juega a</p>
          <div className="grid grid-cols-2 gap-1.5">
            {LIMIT_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setLimit(n)} className={chipClass(limit === n)}>
                {n} puntos
              </button>
            ))}
          </div>
        </div>

        <p className="text-sm text-slate-400">
          Mazo de 48 cartas con dos comodines. Quien pasa el límite queda afuera; gana el último que queda. Un chinchón (siete seguidas del mismo palo) gana en el acto.
        </p>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
