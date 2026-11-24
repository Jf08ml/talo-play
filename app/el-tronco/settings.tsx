"use client";

import { MonitorPlay, Smartphone } from "lucide-react";
import { BOT_OPTIONS, createTroncoRoom, normalizeMeta, type TroncoSettings, type TroncoView } from "@/lib/troncoRoom";
import { roomPath } from "@/lib/games";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

export const PACE_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "rapido", label: "Rápido", sub: "Para los que ya le agarraron la mano" },
];

const VIEW_HINT: Record<TroncoView, string> = {
  telefono: "Cada uno ve la ronda en 3D en su celular, desde atrás de su talo. Sirve también para jugar a distancia.",
  pantalla:
    "La ronda se ve en una computadora conectada a la tele o al proyector, y los celulares son el control: dos botones grandes y vibran cuando el tronco se acerca.",
};

export const SETTINGS: GameSettings<TroncoSettings> = {
  game: "tronco",
  initial: { bots: 3, pace: "normal", view: "telefono" },
  fields: [
    {
      kind: "choice",
      key: "view",
      label: "Dónde se ve",
      layout: 2,
      options: [
        { value: "telefono", label: "Cada uno en su celular", icon: Smartphone },
        { value: "pantalla", label: "En una pantalla grande", icon: MonitorPlay },
      ],
      hint: (v) => VIEW_HINT[v.view],
    },
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
  // With a big screen, whoever creates it is on the computer: it opens the screen.
  afterCreate: (roomId, v) => (v.view === "pantalla" ? `${roomPath("tronco", roomId)}/pantalla` : roomPath("tronco", roomId)),
  createLabel: (v) => (v.view === "pantalla" ? "Crear sala y abrir la pantalla" : "Crear sala"),
  save: (roomId, v) => saveRoomSettings(roomId, "tronco/state", { ...v }),
  fromMeta: (meta) => {
    const m = normalizeMeta(meta);
    return { bots: m.bots, pace: m.pace, view: m.view };
  },
};
