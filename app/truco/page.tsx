"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { createTrucoRoom, TARGET_OPTIONS } from "@/lib/truco";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";

export default function TrucoHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [target, setTarget] = useState<number>(30);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createTrucoRoom({ target }, identity.clientId);
      trackEvent("create_room", { game: "truco" });
      router.push(roomPath("truco", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="truco">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Se juega a</p>
          <div className="grid grid-cols-2 gap-1.5">
            {TARGET_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setTarget(n)} className={chipClass(target === n)}>
                {n} puntos
              </button>
            ))}
          </div>
        </div>

        <p className="text-sm text-slate-400">
          Truco argentino sin flor, mano a mano o de a cuatro (dos contra dos). La app cuenta el envido y lleva los porotos.
        </p>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
