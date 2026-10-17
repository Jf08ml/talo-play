"use client";

import { trackEvent } from "@/lib/analytics";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SECONDS_OPTIONS, TURN_OPTIONS, createMimicaRoom } from "@/lib/mimica";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";

export default function MimicaHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [seconds, setSeconds] = useState<number>(60);
  const [turns, setTurns] = useState<number>(4);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createMimicaRoom({ seconds, turns }, identity.clientId);
      trackEvent("create_room", { game: "mimica" });
      router.push(roomPath("mimica", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="mimica">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Tiempo por turno</p>
          <div className="grid grid-cols-3 gap-1.5">
            {SECONDS_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setSeconds(n)} className={chipClass(seconds === n)}>
                {n} s
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={SECTION_LABEL}>Turnos por equipo</p>
          <div className="grid grid-cols-3 gap-1.5">
            {TURN_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setTurns(n)} className={chipClass(turns === n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <p className="text-sm text-slate-400">
          Se juega en persona: todos entran a la sala desde su celular, pero el que actúa es el único de su equipo
          que ve la palabra.
        </p>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
