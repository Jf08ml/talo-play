"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createNavalRoom } from "@/lib/naval";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON } from "@/components/ui";

export default function NavalHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createNavalRoom(identity.clientId);
      router.push(roomPath("naval", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="naval">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>
        <p className="text-sm text-slate-400">
          Cada flota tiene un portaaviones (5), un acorazado (4), un crucero (3), un submarino (3) y un destructor
          (2). Creá la sala y mandale el link a tu rival; si entra más gente, mira la batalla.
        </p>
        {createError && <p className="text-sm text-red-400">{createError}</p>}
        <button type="submit" disabled={creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
