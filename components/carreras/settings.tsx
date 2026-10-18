"use client";

import { MonitorPlay, Shuffle, Smartphone } from "lucide-react";
import { LAP_OPTIONS, createCarrerasRoom, normalizeMeta, type CarrerasGame, type CarrerasMode } from "@/lib/carreras";
import { RANDOM_TRACK, TRACKS, TRACK_ORDER, type TrackId } from "@/lib/carrerasTrack";
import { roomPath } from "@/lib/games";
import { saveRoomSettings } from "@/lib/roomSettings";
import TrackPreview from "@/components/carreras/TrackPreview";
import { choices, type GameSettings } from "@/components/RoomSettings";
import { SECTION_LABEL, chipClass } from "@/components/ui";

type Settings = { mode: CarrerasMode; track: TrackId; laps: number };

const MODE_HINT: Record<CarrerasMode, string> = {
  pantalla:
    "La carrera se ve en la compu conectada a la tele o al proyector, en 3D y dividida (una vista por piloto); los teléfonos son los volantes.",
  telefono: "Sin proyector: cada uno ve la carrera en 3D en su teléfono y maneja desde ahí. Sirve también para jugar a distancia.",
};

/** Settings for both racing games; only 3D can run on the phones alone. */
export function carrerasSettings(game: CarrerasGame): GameSettings<Settings> {
  return {
    game,
    initial: { mode: "pantalla", track: "ovalo", laps: 3 },
    fields: [
      {
        kind: "note",
        show: () => game === "carreras",
        only: "create",
        text: "Creá la sala desde la compu conectada a la tele o al proyector: esa pantalla muestra la pista desde arriba. Los pilotos entran desde el teléfono con el código.",
      },
      {
        kind: "choice",
        key: "mode",
        label: "Dónde se ve la carrera",
        layout: 2,
        show: () => game === "carreras3d",
        options: [
          { value: "pantalla", label: "Pantalla grande", icon: MonitorPlay },
          { value: "telefono", label: "Cada uno en su teléfono", icon: Smartphone },
        ],
        hint: (v) => MODE_HINT[v.mode],
      },
      {
        kind: "custom",
        render: (v, set) => (
          <div>
            <p className={SECTION_LABEL}>Pista</p>
            <div className="grid grid-cols-3 gap-1.5">
              {TRACK_ORDER.map((id) => {
                const info = id === "aleatoria" ? RANDOM_TRACK : TRACKS[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => set({ track: id })}
                    aria-pressed={v.track === id}
                    className={`${chipClass(v.track === id)} flex flex-col items-center gap-1`}
                  >
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
            {v.track === "aleatoria" && (
              <p className="mt-1.5 text-xs text-slate-500">Se arma una pista al azar. Si no les gusta, en la sala pueden pedir otra.</p>
            )}
          </div>
        ),
      },
      { kind: "choice", key: "laps", label: "Vueltas", options: choices(LAP_OPTIONS, (n) => `${n} vueltas`) },
    ],
    create: (v, hostId) => createCarrerasRoom(game, hostId, { ...v, mode: game === "carreras" ? "pantalla" : v.mode }),
    afterCreate: (roomId, v) => (game === "carreras" || v.mode === "pantalla" ? `${roomPath(game, roomId)}/pantalla` : roomPath(game, roomId)),
    createLabel: (v) => (game === "carreras" || v.mode === "pantalla" ? "Crear sala y abrir la pista" : "Crear sala"),
    save: (roomId, v) =>
      saveRoomSettings(roomId, "carreras/state", { ...v, mode: game === "carreras" ? "pantalla" : v.mode }),
    fromMeta: (meta) => {
      const m = normalizeMeta(meta);
      return { mode: m.mode, track: m.track, laps: m.laps };
    },
  };
}
