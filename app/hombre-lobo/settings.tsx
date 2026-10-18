"use client";

import { DAY_OPTIONS, createLoboRoom } from "@/lib/lobo";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { daySeconds: number };

export const SETTINGS: GameSettings<Settings> = {
  game: "lobo",
  initial: { daySeconds: 180 },
  fields: [
    { kind: "choice", key: "daySeconds", label: "Tiempo para discutir de día", options: choices(DAY_OPTIONS, (s) => `${s / 60} min`) },
    {
      kind: "note",
      only: "create",
      text: "La app hace de narrador y reparte los roles según cuántos sean: 1 lobo con 5–6 jugadores, 2 hasta 9, 3 hasta 12 y 4 desde 13, más una vidente y un médico. Se juega en persona o por videollamada.",
    },
  ],
  create: (v, hostId) => createLoboRoom(v, hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "lobo/state", v),
  fromMeta: (meta) => ({ daySeconds: Number(meta.daySeconds ?? 180) }),
};
