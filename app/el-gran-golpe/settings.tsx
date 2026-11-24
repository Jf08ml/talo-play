"use client";

import { BOT_OPTIONS, MINUTE_OPTIONS, createGolpeRoom, normalizeMeta, type GolpeSettings } from "@/lib/golpe";
import type { BotLevel } from "@/lib/golpeSim";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

const LEVEL_HINT: Record<BotLevel, string> = {
  facil: "Se dejan ver seguido y roban poco: ideales para aprender.",
  normal: "Esquivan a los guardias y te roban si te descuidas.",
  dificil: "Se mueven entre las luces, cargan mucho y roban siempre que pueden.",
};

/** Everyone for themselves or two teams, how long, and how many bots. */
export const SETTINGS: GameSettings<GolpeSettings> = {
  game: "golpe",
  initial: { mode: "todos", minutes: 4, bots: 3, botLevel: "normal" },
  fields: [
    {
      kind: "choice",
      key: "mode",
      label: "Cómo se juega",
      layout: "segment",
      options: [
        { value: "todos", label: "Todos contra todos" },
        { value: "equipos", label: "Rojo contra azul" },
      ],
      hint: (v) =>
        v.mode === "equipos"
          ? "Cada equipo sale por sus dos salidas y suma lo que pone a salvo. Entre compañeros no se roba."
          : "Cada uno para sí: gana el que más diamantes pone a salvo.",
    },
    { kind: "choice", key: "minutes", label: "Duración", options: choices(MINUTE_OPTIONS, (n) => `${n} min`) },
    {
      kind: "choice",
      key: "bots",
      label: "Bots",
      layout: 6,
      options: choices(BOT_OPTIONS, (n) => (n ? `${n}` : "No")),
      hint: (v) => (v.bots ? "Se suman a los de la sala (hasta 8 ladrones). En equipos, completan el más chico." : "Solo los de la sala (si estás solo, se suma uno igual)."),
    },
    {
      kind: "choice",
      key: "botLevel",
      label: "Cómo juegan los bots",
      show: (v) => v.bots > 0,
      options: [
        { value: "facil", label: "Fácil" },
        { value: "normal", label: "Normal" },
        { value: "dificil", label: "Difícil" },
      ],
      hint: (v) => LEVEL_HINT[v.botLevel],
    },
  ],
  create: (v, hostId) => createGolpeRoom(hostId, v),
  save: (roomId, v) => saveRoomSettings(roomId, "golpe/state", { ...v }, { mode: v.mode, botLevel: v.botLevel }),
  fromMeta: (meta) => {
    const m = normalizeMeta(meta);
    return { mode: m.mode, minutes: m.minutes, bots: m.bots, botLevel: m.botLevel };
  },
};
