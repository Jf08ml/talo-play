"use client";

import { LEVELS, createSopaRoom, normalizeMeta, type SopaLevel } from "@/lib/sopa";
import { SOPA_THEME_OPTIONS, type SopaTheme } from "@/lib/sopaWords";
import { saveRoomSettings } from "@/lib/roomSettings";
import type { GameSettings } from "@/components/RoomSettings";

type Settings = { theme: SopaTheme; level: SopaLevel };

const LEVEL_IDS = Object.keys(LEVELS) as SopaLevel[];

export const SETTINGS: GameSettings<Settings> = {
  game: "sopa",
  initial: { theme: "mezcla", level: "normal" },
  fields: [
    {
      kind: "choice",
      key: "theme",
      label: "Tema",
      layout: 2,
      options: SOPA_THEME_OPTIONS.map((t) => ({ value: t.id, label: `${t.emoji} ${t.label}` })),
    },
    {
      kind: "choice",
      key: "level",
      label: "Dificultad",
      options: LEVEL_IDS.map((id) => ({ value: id, label: LEVELS[id].label })),
      hint: (v) => `${LEVELS[v.level].words} palabras · ${LEVELS[v.level].hint}`,
    },
  ],
  create: (v, hostId) => createSopaRoom(v, hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "sopa/state", v),
  fromMeta: (meta) => normalizeMeta(meta),
};
