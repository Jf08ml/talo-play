"use client";

import { SECONDS_OPTIONS, TURN_OPTIONS, createMimicaRoom, normalizeMeta } from "@/lib/mimica";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { seconds: number; turns: number };

export const SETTINGS: GameSettings<Settings> = {
  game: "mimica",
  initial: { seconds: 60, turns: 4 },
  fields: [
    { kind: "choice", key: "seconds", label: "Tiempo por turno", options: choices(SECONDS_OPTIONS, (n) => `${n} s`) },
    { kind: "choice", key: "turns", label: "Turnos por equipo", options: choices(TURN_OPTIONS, (n) => `${n}`) },
    {
      kind: "note",
      only: "create",
      text: "Se juega en persona: todos entran a la sala desde su celular, pero el que actúa es el único de su equipo que ve la palabra.",
    },
  ],
  create: (v, hostId) => createMimicaRoom(v, hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "mimica/state", v),
  fromMeta: (meta) => normalizeMeta(meta),
};
