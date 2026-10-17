"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { createOndaRoom, ROUND_OPTIONS } from "@/lib/onda";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";

export default function OndaHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [rounds, setRounds] = useState<number>(2);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createOndaRoom({ rounds }, identity.clientId);
      trackEvent("create_room", { game: "onda" });
      router.push(roomPath("onda", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="onda">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Vueltas (veces que cada uno da la pista)</p>
          <div className="grid grid-cols-3 gap-1.5">
            {ROUND_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setRounds(n)} className={chipClass(rounds === n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <p className="text-sm text-slate-400">
          En pareja es ideal para ver si piensan igual; en grupo, cada uno adivina por su cuenta y compiten por puntos.
        </p>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
