"use client";

import { DIFFICULTIES, ROUND_OPTIONS, createPuentesRoom, normalizeMeta, type PuentesSettings } from "@/lib/puentesRoom";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

export const SETTINGS: GameSettings<PuentesSettings> = {
  game: "puentes",
  initial: { rounds: 5, difficulty: "media", tricks: true },
  fields: [
    { kind: "choice", key: "rounds", label: "Rondas", options: choices(ROUND_OPTIONS, (n) => `${n}`) },
    {
      kind: "choice",
      key: "difficulty",
      label: "Dificultad",
      options: DIFFICULTIES.map((d) => ({ value: d.id, label: d.label })),
      hint: () => "Cada ronda es un mapa nuevo, un poco más difícil que el anterior.",
    },
    {
      kind: "toggle",
      key: "tricks",
      label: "Con trampas",
      hint: "Puentes de una mano, puentes dobles y mapas que no tienen solución (hay que darse cuenta y tocar «No se puede»).",
    },
  ],
  create: (v, hostId) => createPuentesRoom(hostId, v),
  save: (roomId, v) => saveRoomSettings(roomId, "puentes/state", { ...v }),
  fromMeta: (meta) => {
    const m = normalizeMeta(meta);
    return { rounds: m.rounds, difficulty: m.difficulty, tricks: m.tricks };
  },
};
