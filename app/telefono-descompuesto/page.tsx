"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { createTelefonoRoom, DRAW_OPTIONS } from "@/lib/telefono";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";

export default function TelefonoHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [drawSeconds, setDrawSeconds] = useState<number>(90);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createTelefonoRoom({ drawSeconds }, identity.clientId);
      trackEvent("create_room", { game: "telefono" });
      router.push(roomPath("telefono", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="telefono">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Tiempo para dibujar</p>
          <div className="grid grid-cols-3 gap-1.5">
            {DRAW_OPTIONS.map((s) => (
              <button key={s} type="button" onClick={() => setDrawSeconds(s)} className={chipClass(drawSeconds === s)}>
                {s} s
              </button>
            ))}
          </div>
        </div>

        <p className="text-sm text-slate-400">
          Cuantos más jugadores, más se deforman las frases. Al final miran juntos cómo terminó cada una.
        </p>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
