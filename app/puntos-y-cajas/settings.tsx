"use client";

import { SIZE_OPTIONS, createCajasRoom, normalizeMeta } from "@/lib/cajas";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { size: number };

export const SETTINGS: GameSettings<Settings> = {
  game: "cajas",
  initial: { size: 4 },
  fields: [
    {
      kind: "choice",
      key: "size",
      label: "Tamaño del tablero",
      layout: 4,
      options: choices(SIZE_OPTIONS, (n) => `${n} × ${n}`),
      hint: (v) => `${v.size} × ${v.size} = ${v.size * v.size} cuadrados. Más chico, partida más rápida.`,
    },
  ],
  create: (v, hostId) => createCajasRoom(v, hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "cajas/state", v),
  fromMeta: (meta) => normalizeMeta(meta),
};
