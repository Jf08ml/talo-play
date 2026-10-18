"use client";

import { LIMIT_OPTIONS, createChinchonRoom } from "@/lib/chinchon";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { limit: number };

export const SETTINGS: GameSettings<Settings> = {
  game: "chinchon",
  initial: { limit: 100 },
  fields: [
    { kind: "choice", key: "limit", label: "Se juega a", layout: 2, options: choices(LIMIT_OPTIONS, (n) => `${n} puntos`) },
    {
      kind: "note",
      only: "create",
      text: "Mazo de 48 cartas con dos comodines. Quien pasa el límite queda afuera; gana el último que queda. Un chinchón (siete seguidas del mismo palo) gana en el acto.",
    },
  ],
  create: (v, hostId) => createChinchonRoom(v, hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "chinchon/state", v),
  fromMeta: (meta) => ({ limit: Number(meta.limit ?? 100) }),
};
