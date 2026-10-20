"use client";

import { LEVELS } from "@/lib/bakery";
import { DUEL_MINUTES, createDuelRoom, duelLevelSummary, normalizeMeta, saveDuelSettings } from "@/lib/bakeryDuel";
import { choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { level: number; minutes: number };

/** The duel's room settings (the solo game has none). */
export const SETTINGS: GameSettings<Settings> = {
  game: "pasteleria",
  initial: { level: 1, minutes: 3 },
  fields: [
    {
      kind: "choice",
      key: "level",
      label: "Dificultad de los pedidos",
      layout: 2,
      options: LEVELS.map((l, i) => ({ value: i, label: l.name })),
      hint: (v) => duelLevelSummary(v.level),
    },
    {
      kind: "choice",
      key: "minutes",
      label: "Duración del turno",
      options: choices(DUEL_MINUTES, (m) => `${m} min`),
    },
  ],
  create: (v, hostId) => createDuelRoom(v, hostId),
  save: (roomId, v) => saveDuelSettings(roomId, v),
  fromMeta: (meta) => normalizeMeta(meta),
};
