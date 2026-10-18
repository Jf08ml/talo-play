"use client";

import { DRAW_OPTIONS, createTelefonoRoom } from "@/lib/telefono";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { drawSeconds: number };

export const SETTINGS: GameSettings<Settings> = {
  game: "telefono",
  initial: { drawSeconds: 90 },
  fields: [
    { kind: "choice", key: "drawSeconds", label: "Tiempo para dibujar", options: choices(DRAW_OPTIONS, (s) => `${s} s`) },
    {
      kind: "note",
      only: "create",
      text: "Cuantos más jugadores, más se deforman las frases. Al final miran juntos cómo terminó cada una.",
    },
  ],
  create: (v, hostId) => createTelefonoRoom(v, hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "telefono/state", v),
  fromMeta: (meta) => ({ drawSeconds: Number(meta.drawSeconds ?? 90) }),
};
