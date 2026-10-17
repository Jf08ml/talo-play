"use client";

import { trackEvent } from "@/lib/analytics";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createPalabraRoom } from "@/lib/palabra";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON } from "@/components/ui";

export default function PalabraHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createPalabraRoom(identity.clientId);
      trackEvent("create_room", { game: "palabra" });
      router.push(roomPath("palabra", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="palabra">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>
        <p className="text-sm text-slate-400">
          No hay nada que configurar: creá la sala y mandá el link. Podés jugar solo o con quien quieras; cada
          carrera es una palabra nueva.
        </p>
        {createError && <p className="text-sm text-red-400">{createError}</p>}
        <button type="submit" disabled={creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
