"use client";

import { trackEvent } from "@/lib/analytics";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SIZE_OPTIONS, createCajasRoom } from "@/lib/cajas";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";

export default function CajasHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [size, setSize] = useState<number>(4);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createCajasRoom({ size }, identity.clientId);
      trackEvent("create_room", { game: "cajas" });
      router.push(roomPath("cajas", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="cajas">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Tamaño del tablero</p>
          <div className="grid grid-cols-4 gap-1.5">
            {SIZE_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setSize(n)} className={chipClass(size === n)}>
                {n} × {n}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {size} × {size} = {size * size} cuadrados. Más chico, partida más rápida.
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
