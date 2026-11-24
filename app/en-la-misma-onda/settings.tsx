"use client";

import {
  MAX_CUSTOM_SPECTRA,
  ROUND_OPTIONS,
  SECOND_OPTIONS,
  createOndaRoom,
  normalizeMeta,
  type OndaMode,
  type OndaParams,
} from "@/lib/onda";
import { ONDA_DECKS, type OndaDeck } from "@/lib/ondaSpectra";
import { saveRoomSettings } from "@/lib/roomSettings";
import { SettingsTextArea, choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { mode: OndaMode; rounds: number; decks: OndaDeck[]; spectraText: string; seconds: number };

/** One scale per line, its two ends split by "|", "/", "-" or "↔". */
export function parseSpectra(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.split(/\s*(?:\||↔|\/|\s-\s)\s*/).map((x) => x.trim().slice(0, 40)))
    .filter((p) => p.length === 2 && p[0] && p[1])
    .map(([a, b]) => `${a}|${b}`)
    .slice(0, MAX_CUSTOM_SPECTRA);
}

const toParams = (v: Settings): OndaParams => ({
  mode: v.mode,
  rounds: v.rounds,
  decks: v.decks,
  customSpectra: parseSpectra(v.spectraText),
  seconds: v.seconds,
});

const MODE_HINT: Record<OndaMode, string> = {
  cada: "Cada uno mueve su aguja en secreto y suma sus puntos. Ideal de a dos o para competir.",
  juntos: "Una sola aguja para todos: la discuten, la mueven entre todos y suman juntos. Al final, ¿qué tan en la misma onda están?",
  equipos: "Rojo contra azul, turnos alternados. Tu equipo ubica la aguja y el otro apuesta si el objetivo está más a la izquierda o a la derecha. Desde 4 jugadores.",
};

export const SETTINGS: GameSettings<Settings> = {
  game: "onda",
  initial: { mode: "cada", rounds: 2, decks: ["clasicas", "pareja"], spectraText: "", seconds: 0 },
  fields: [
    {
      kind: "choice",
      key: "mode",
      label: "Cómo se juega",
      layout: "list",
      options: [
        { value: "cada", label: "Cada uno por su cuenta" },
        { value: "juntos", label: "Todos juntos" },
        { value: "equipos", label: "Rojo contra azul" },
      ],
      hint: (v) => MODE_HINT[v.mode],
    },
    { kind: "choice", key: "rounds", label: "Vueltas (veces que cada uno da la pista)", options: choices(ROUND_OPTIONS, (n) => `${n}`) },
    {
      kind: "multi",
      key: "decks",
      label: "Escalas",
      layout: "list",
      options: ONDA_DECKS.map((d) => ({ value: d.id, label: d.label, sub: d.hint })),
    },
    {
      kind: "custom",
      render: (v, set) => {
        const n = parseSpectra(v.spectraText).length;
        return (
          <SettingsTextArea
            label="Escalas propias (opcional)"
            value={v.spectraText}
            onChange={(spectraText) => set({ spectraText })}
            placeholder={"Una por línea, los dos extremos separados por |\nPlan aburrido | Plan ideal\nComida de la abuela fea | Comida de la abuela rica"}
            footer={n > 0 && <p className="mt-1 text-xs text-white/50">{n} propias</p>}
          />
        );
      },
    },
    {
      kind: "choice",
      key: "seconds",
      label: "Tiempo para adivinar",
      options: choices(SECOND_OPTIONS, (n) => (n ? `${n} s` : "Sin límite")),
    },
  ],
  problem: (v) => (v.decks.length === 0 && parseSpectra(v.spectraText).length < 3 ? "Elegí al menos un grupo de escalas o escribí 3 propias." : null),
  create: (v, hostId) => createOndaRoom(toParams(v), hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "onda/state", { ...toParams(v) }, { mode: v.mode }),
  fromMeta: (meta) => {
    const m = normalizeMeta(meta);
    return {
      mode: m.mode,
      rounds: m.rounds,
      // Rooms from before the decks played the classic list.
      decks: m.decks ?? ["clasicas"],
      spectraText: m.customSpectra.map((s) => s.replace("|", " | ")).join("\n"),
      seconds: m.seconds,
    };
  },
};
