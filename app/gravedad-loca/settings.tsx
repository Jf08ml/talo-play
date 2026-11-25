"use client";

import { BOT_OPTIONS, DIFFICULTIES, ROUND_OPTIONS, createGravedadRoom, normalizeMeta, type GravedadSettings } from "@/lib/gravedadRoom";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

export const SETTINGS: GameSettings<GravedadSettings> = {
  game: "gravedad",
  initial: { rounds: 3, difficulty: "facil", bots: 0 },
  fields: [
    { kind: "choice", key: "rounds", label: "Carreras", options: choices(ROUND_OPTIONS, (n) => `${n}`) },
    {
      kind: "choice",
      key: "difficulty",
      label: "Niveles",
      options: DIFFICULTIES.map((d) => ({ value: d.id, label: d.label })),
      hint: () => "Cada carrera es un nivel distinto: todos lo juegan a la vez y se ven como fantasmas.",
    },
    {
      kind: "choice",
      key: "bots",
      label: "Bots",
      options: choices(BOT_OPTIONS, (n) => (n ? `${n}` : "No")),
      hint: (v) => (v.bots ? "Corren con ustedes como uno más." : "Si juegas solo, se suma uno igual."),
    },
  ],
  create: (v, hostId) => createGravedadRoom(hostId, v),
  save: (roomId, v) => saveRoomSettings(roomId, "gravedad/state", { ...v }),
  fromMeta: (meta) => {
    const m = normalizeMeta(meta);
    return { rounds: m.rounds, difficulty: m.difficulty, bots: m.bots };
  },
};
