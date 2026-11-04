"use client";

import { BOT_OPTIONS, createTroncoRoom, normalizeMeta, type TroncoSettings } from "@/lib/troncoRoom";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

export const PACE_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "rapido", label: "Rápido", sub: "Para los que ya le agarraron la mano" },
];

export const SETTINGS: GameSettings<TroncoSettings> = {
  game: "tronco",
  initial: { bots: 3, pace: "normal" },
  fields: [
    {
      kind: "choice",
      key: "bots",
      label: "Bots en la ronda",
      layout: 5,
      options: choices(BOT_OPTIONS, (n) => (n ? `${n}` : "No")),
      hint: (v) => (v.bots ? "Completan la ronda y juegan como uno más." : "Solo los de la sala (si estás solo, se suma uno igual)."),
    },
    { kind: "choice", key: "pace", label: "Velocidad", layout: 2, options: PACE_OPTIONS },
  ],
  create: (v, hostId) => createTroncoRoom(hostId, v),
  save: (roomId, v) => saveRoomSettings(roomId, "tronco/state", { ...v }),
  fromMeta: (meta) => {
    const m = normalizeMeta(meta);
    return { bots: m.bots, pace: m.pace };
  },
};
