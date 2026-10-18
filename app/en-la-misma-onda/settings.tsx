"use client";

import { ROUND_OPTIONS, createOndaRoom } from "@/lib/onda";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { rounds: number };

export const SETTINGS: GameSettings<Settings> = {
  game: "onda",
  initial: { rounds: 2 },
  fields: [
    { kind: "choice", key: "rounds", label: "Vueltas (veces que cada uno da la pista)", options: choices(ROUND_OPTIONS, (n) => `${n}`) },
    {
      kind: "note",
      only: "create",
      text: "En pareja es ideal para ver si piensan igual; en grupo, cada uno adivina por su cuenta y compiten por puntos.",
    },
  ],
  create: (v, hostId) => createOndaRoom(v, hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "onda/state", v),
  fromMeta: (meta) => ({ rounds: Number(meta.rounds ?? 2) }),
};
