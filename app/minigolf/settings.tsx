"use client";

import { BOT_OPTIONS, HOLE_OPTIONS, createGolfRoom, normalizeMeta, type GolfSettings } from "@/lib/minigolf";
import { DIFFICULTIES } from "@/lib/minigolfHoles";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

export const SETTINGS: GameSettings<GolfSettings> = {
  game: "minigolf",
  initial: { holes: 6, difficulty: "media", bots: 0 },
  fields: [
    { kind: "choice", key: "holes", label: "Hoyos", options: choices(HOLE_OPTIONS, (n) => `${n}`) },
    {
      kind: "choice",
      key: "difficulty",
      label: "Dificultad",
      options: DIFFICULTIES.map((d) => ({ value: d.id, label: d.label })),
      hint: (v) =>
        v.difficulty === "facil"
          ? "Recorridos cortos con pendientes, arena y bumpers."
          : v.difficulty === "media"
            ? "Más largos, con agua y molinos."
            : "Largos y angostos, con todo junto.",
    },
    {
      kind: "choice",
      key: "bots",
      label: "Bots",
      options: choices(BOT_OPTIONS, (n) => (n === 0 ? "Sin bots" : `${n}`)),
      hint: () => "Juegan con ustedes, cada uno con su puntería.",
    },
  ],
  create: (v, hostId) => createGolfRoom(hostId, v),
  save: (roomId, v) => saveRoomSettings(roomId, "golf/state", { ...v }),
  fromMeta: (meta) => {
    const m = normalizeMeta(meta);
    return { holes: m.holes, difficulty: m.difficulty, bots: m.bots };
  },
};
