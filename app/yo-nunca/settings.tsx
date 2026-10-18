"use client";

import { QUESTION_OPTIONS, createYoNuncaRoom, normalizeMeta } from "@/lib/yonunca";
import { YONUNCA_LEVELS, type YoNuncaLevel } from "@/lib/yonuncaPrompts";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { levels: YoNuncaLevel[]; questions: number };

export const SETTINGS: GameSettings<Settings> = {
  game: "yonunca",
  initial: { levels: ["tranqui"], questions: 25 },
  fields: [
    {
      kind: "multi",
      key: "levels",
      label: "Nivel",
      layout: "list",
      options: YONUNCA_LEVELS.map((l) => ({ value: l.id, label: `${l.emoji} ${l.label}`, sub: l.hint })),
    },
    { kind: "choice", key: "questions", label: "Frases", options: choices(QUESTION_OPTIONS, (n) => `${n}`) },
    {
      kind: "note",
      only: "create",
      text: "Nadie ve tu respuesta hasta que contestan todos. Sirve en persona o por videollamada.",
    },
  ],
  problem: (v) => (v.levels.length === 0 ? "Elegí al menos un nivel." : null),
  create: (v, hostId) => createYoNuncaRoom(v, hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "yonunca/state", v),
  fromMeta: (meta) => normalizeMeta(meta),
};
