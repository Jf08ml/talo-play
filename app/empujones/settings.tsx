"use client";

import { BOT_OPTIONS, TARGET_OPTIONS, createEmpujonesRoom, normalizeMeta, type EmpujonesSettings } from "@/lib/empujonesRoom";
import type { BotLevel } from "@/lib/empujones";
import { roomPath } from "@/lib/games";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

const LEVEL_HINT: Record<BotLevel, string> = {
  facil: "Se distraen y empujan poco: ideales para aprender.",
  normal: "Te buscan y te empujan, pero se les puede ganar.",
  dificil: "Te rodean, apuntan bien y aguantan los empujones.",
};

export const SETTINGS: GameSettings<EmpujonesSettings> = {
  game: "empujones",
  initial: { bots: 3, botLevel: "normal", target: 3 },
  fields: [
    {
      kind: "note",
      only: "create",
      text: "Crea la sala desde la computadora conectada a la tele o al proyector: esa pantalla muestra la isla. Cada uno entra desde su celular con el código, y el celular es el control.",
    },
    {
      kind: "choice",
      key: "bots",
      label: "Bots en la isla",
      layout: 5,
      options: choices(BOT_OPTIONS, (n) => (n ? `${n}` : "No")),
      hint: (v) => (v.bots ? "Se suman a los de la sala (hasta 8 en total) y empujan como uno más." : "Solo los de la sala (si estás solo, se suma uno igual)."),
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
    { kind: "choice", key: "target", label: "Rondas para ganar", options: choices(TARGET_OPTIONS, (n) => `${n}`) },
  ],
  create: (v, hostId) => createEmpujonesRoom(hostId, v),
  // Whoever creates it is on the computer: it opens the screen.
  afterCreate: (roomId) => `${roomPath("empujones", roomId)}/pantalla`,
  createLabel: () => "Crear sala y abrir la isla",
  save: (roomId, v) => saveRoomSettings(roomId, "empujones/state", v, { botCount: v.bots, botLevel: v.botLevel, target: v.target }),
  fromMeta: (meta) => {
    const m = normalizeMeta(meta);
    return { bots: m.bots, botLevel: m.botLevel, target: m.target };
  },
};
