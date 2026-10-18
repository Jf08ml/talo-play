"use client";

import { TARGET_OPTIONS, createTrucoRoom } from "@/lib/truco";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { target: number };

export const SETTINGS: GameSettings<Settings> = {
  game: "truco",
  initial: { target: 30 },
  fields: [
    { kind: "choice", key: "target", label: "Se juega a", layout: 2, options: choices(TARGET_OPTIONS, (n) => `${n} puntos`) },
    {
      kind: "note",
      only: "create",
      text: "Truco argentino sin flor, mano a mano o de a cuatro (dos contra dos). La app cuenta el envido y lleva los porotos.",
    },
  ],
  create: (v, hostId) => createTrucoRoom(v, hostId),
  // The state keeps its own copy of the target.
  save: (roomId, v) => saveRoomSettings(roomId, "truco/state", v, { target: v.target }),
  fromMeta: (meta) => ({ target: Number(meta.target ?? 30) }),
};
