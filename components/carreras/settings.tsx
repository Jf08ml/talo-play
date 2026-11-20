"use client";

import { MonitorPlay, Shuffle, Smartphone } from "lucide-react";
import { LAP_OPTIONS, MAX_BOTS, createCarrerasRoom, normalizeMeta, type CarrerasGame, type CarrerasMode } from "@/lib/carreras";
import { RANDOM_TRACK, TRACKS, tracksFor, type BotLevel, type TrackId } from "@/lib/carrerasTrack";
import { roomPath } from "@/lib/games";
import { saveRoomSettings } from "@/lib/roomSettings";
import TrackPreview from "@/components/carreras/TrackPreview";
import { choices, type GameSettings } from "@/components/RoomSettings";
import { SECTION_LABEL, chipClass } from "@/components/ui";

type Settings = { mode: CarrerasMode; track: TrackId; laps: number; bots: number; botLevel: BotLevel };

const MODE_HINT: Record<CarrerasMode, string> = {
  pantalla:
    "La carrera se ve en la compu conectada a la tele o al proyector, en 3D y dividida (una vista por piloto); los teléfonos son los volantes.",
  telefono: "Sin proyector: cada uno ve la carrera en 3D en su teléfono y maneja desde ahí. Sirve también para jugar a distancia.",
};

const LEVEL_HINT: Record<BotLevel, string> = {
  facil: "Manejan tranquilos: ideales para aprender las pistas.",
  normal: "Pelean la carrera, pero se les puede ganar.",
  dificil: "Van al límite y usan todos los turbos.",
};

/** Settings for both racing games; only 3D can run on the phones alone, and only 3D has the long tracks. */
export function carrerasSettings(game: CarrerasGame): GameSettings<Settings> {
  const is3d = game === "carreras3d";
  const fix = (v: Settings): Settings => ({ ...v, mode: is3d ? v.mode : "pantalla" });
  return {
    game,
    initial: { mode: "pantalla", track: "ovalo", laps: 3, bots: 0, botLevel: "normal" },
    fields: [
      {
        kind: "note",
        show: () => !is3d,
        only: "create",
        text: "Creá la sala desde la compu conectada a la tele o al proyector: esa pantalla muestra la pista desde arriba. Los pilotos entran desde el teléfono con el código.",
      },
      {
        kind: "choice",
        key: "mode",
        label: "Dónde se ve la carrera",
        layout: 2,
        show: () => is3d,
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
              {tracksFor(is3d).map((id) => {
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
      {
        kind: "choice",
        key: "bots",
        label: "Bots",
        layout: 4,
        options: choices(
          Array.from({ length: MAX_BOTS + 1 }, (_, n) => n),
          (n) => (n === 0 ? "Sin bots" : `${n}`)
        ),
        hint: (v) =>
          v.bots === 0
            ? "Solo corren personas."
            : v.bots === 1
              ? "Si queda un auto libre, lo maneja la compu. Si entra alguien más, se lo deja."
              : `Hasta ${v.bots} autos libres los maneja la compu. Si entra más gente, les dejan el lugar.`,
      },
      {
        kind: "choice",
        key: "botLevel",
        label: "Cómo manejan los bots",
        show: (v) => v.bots > 0,
        options: [
          { value: "facil", label: "Fácil" },
          { value: "normal", label: "Normal" },
          { value: "dificil", label: "Difícil" },
        ],
        hint: (v) => LEVEL_HINT[v.botLevel],
      },
    ],
    create: (v, hostId) => createCarrerasRoom(game, hostId, fix(v)),
    afterCreate: (roomId, v) => (!is3d || v.mode === "pantalla" ? `${roomPath(game, roomId)}/pantalla` : roomPath(game, roomId)),
    createLabel: (v) => (!is3d || v.mode === "pantalla" ? "Crear sala y abrir la pista" : "Crear sala"),
    save: (roomId, v) => saveRoomSettings(roomId, "carreras/state", fix(v), { botCount: v.bots, botLevel: v.botLevel }),
    fromMeta: (meta) => {
      const m = normalizeMeta(meta);
      return { mode: m.mode, track: m.track, laps: m.laps, bots: m.bots, botLevel: m.botLevel };
    },
  };
}
