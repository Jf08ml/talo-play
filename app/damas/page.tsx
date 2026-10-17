"use client";

import { trackEvent } from "@/lib/analytics";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createDamasRoom } from "@/lib/damas";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON } from "@/components/ui";

export default function DamasHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createDamasRoom(identity.clientId);
      trackEvent("create_room", { game: "damas" });
      router.push(roomPath("damas", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="damas">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>
        <p className="text-sm text-slate-400">
          Tablero de 8 × 8, doce fichas por lado. Comer es obligatorio y las damas coronadas se mueven varias
          casillas. Creá la sala y mandale el link a tu rival; si entra más gente, mira la partida.
        </p>
        {createError && <p className="text-sm text-red-400">{createError}</p>}
        <button type="submit" disabled={creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
