"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LAP_OPTIONS, createCarrerasRoom } from "@/lib/carreras";
import { TRACKS, TRACK_ORDER, type TrackId } from "@/lib/carrerasTrack";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import TrackPreview from "@/components/carreras/TrackPreview";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";
import { MonitorPlay } from "lucide-react";

export default function CarrerasHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [track, setTrack] = useState<TrackId>("ovalo");
  const [laps, setLaps] = useState(5);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createCarrerasRoom(identity.clientId, track, laps);
      router.push(`${roomPath("carreras", roomId)}/pantalla`);
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="carreras">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <p className="flex gap-2 rounded-lg bg-cyan-500/10 p-3 text-sm text-cyan-100 ring-1 ring-cyan-400/20">
          <MonitorPlay className="mt-0.5 h-4 w-4 shrink-0" />
          Creá la sala desde la compu conectada a la tele o al proyector: esta pantalla se convierte en la pista.
          Los jugadores entran desde el teléfono con el código.
        </p>

        <div>
          <p className={SECTION_LABEL}>Pista</p>
          <div className="grid grid-cols-3 gap-1.5">
            {TRACK_ORDER.map((id) => (
              <button key={id} type="button" onClick={() => setTrack(id)} className={`${chipClass(track === id)} flex flex-col items-center gap-1`}>
                <TrackPreview track={id} className="h-12 w-full" />
                {TRACKS[id].label}
                <span className="text-[10px] font-normal text-slate-500">{TRACKS[id].hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={SECTION_LABEL}>Vueltas</p>
          <div className="grid grid-cols-3 gap-1.5">
            {LAP_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setLaps(n)} className={chipClass(laps === n)}>
                {n} vueltas
              </button>
            ))}
          </div>
        </div>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala y abrir la pista"}
        </button>
      </form>
    </GameLobby>
  );
}
