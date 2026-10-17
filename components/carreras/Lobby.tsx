"use client";

import { trackEvent } from "@/lib/analytics";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LAP_OPTIONS, createCarrerasRoom, type CarrerasGame, type CarrerasMode } from "@/lib/carreras";
import { RANDOM_TRACK, TRACKS, TRACK_ORDER, type TrackId } from "@/lib/carrerasTrack";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import TrackPreview from "@/components/carreras/TrackPreview";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";
import { MonitorPlay, Shuffle, Smartphone } from "lucide-react";

const MODES: { id: CarrerasMode; label: string; hint: string; icon: typeof MonitorPlay }[] = [
  {
    id: "pantalla",
    label: "Pantalla grande",
    hint: "Creá la sala desde la compu conectada a la tele o al proyector: esa pantalla muestra la carrera en 3D (dividida, una vista por piloto) y los teléfonos son los volantes.",
    icon: MonitorPlay,
  },
  {
    id: "telefono",
    label: "Cada uno en su teléfono",
    hint: "Sin proyector: cada uno ve la carrera en 3D en su teléfono y maneja desde ahí. Sirve también para jugar a distancia.",
    icon: Smartphone,
  },
];

/** Create-room form for both racing games; only 3D can run on the phones alone. */
export default function CarrerasLobby({ game }: { game: CarrerasGame }) {
  const router = useRouter();
  const identity = useClientIdentity();
  const [mode, setMode] = useState<CarrerasMode>("pantalla");
  const [track, setTrack] = useState<TrackId>("ovalo");
  const [laps, setLaps] = useState(3);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createCarrerasRoom(game, identity.clientId, { mode, track, laps });
      trackEvent("create_room", { game, mode });
      router.push(mode === "pantalla" ? `${roomPath(game, roomId)}/pantalla` : roomPath(game, roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game={game}>
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        {game === "carreras" && (
          <p className="flex gap-2 rounded-lg bg-cyan-500/10 p-3 text-sm text-cyan-100 ring-1 ring-cyan-400/20">
            <MonitorPlay className="mt-0.5 h-4 w-4 shrink-0" />
            Creá la sala desde la compu conectada a la tele o al proyector: esa pantalla muestra la pista desde
            arriba. Los pilotos entran desde el teléfono con el código.
          </p>
        )}

        {game === "carreras3d" && (
        <div>
          <p className={SECTION_LABEL}>Dónde se ve la carrera</p>
          <div className="grid grid-cols-2 gap-1.5">
            {MODES.map((m) => (
              <button key={m.id} type="button" onClick={() => setMode(m.id)} className={`${chipClass(mode === m.id)} flex items-center justify-center gap-1.5 py-2`}>
                <m.icon className="h-4 w-4" />
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">{MODES.find((m) => m.id === mode)!.hint}</p>
        </div>
        )}

        <div>
          <p className={SECTION_LABEL}>Pista</p>
          <div className="grid grid-cols-3 gap-1.5">
            {TRACK_ORDER.map((id) => {
              const info = id === "aleatoria" ? RANDOM_TRACK : TRACKS[id];
              return (
                <button key={id} type="button" onClick={() => setTrack(id)} className={`${chipClass(track === id)} flex flex-col items-center gap-1`}>
                  {id === "aleatoria" ? (
                    <span className="flex h-12 w-full items-center justify-center">
                      <Shuffle className="h-7 w-7" />
                    </span>
                  ) : (
                    <TrackPreview track={id} className="h-12 w-full" />
                  )}
                  {info.label}
                  <span className="text-[10px] font-normal text-slate-500">{info.hint}</span>
                </button>
              );
            })}
          </div>
          {track === "aleatoria" && (
            <p className="mt-1.5 text-xs text-slate-500">Se arma una pista al azar. Si no les gusta, en la sala pueden pedir otra.</p>
          )}
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
          {creating ? "Creando sala…" : mode === "pantalla" ? "Crear sala y abrir la pista" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
