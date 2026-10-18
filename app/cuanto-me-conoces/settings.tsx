"use client";

import { ROUND_OPTIONS, createConocesRoom, normalizeMeta } from "@/lib/conoces";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { rounds: number };

export const SETTINGS: GameSettings<Settings> = {
  game: "conoces",
  initial: { rounds: 3 },
  fields: [
    {
      kind: "choice",
      key: "rounds",
      label: "Preguntas para cada uno",
      options: choices(ROUND_OPTIONS, (n) => `${n} preguntas`),
      hint: () => "De a dos es ideal para parejas; en grupo, descubren quién conoce mejor a quién.",
    },
  ],
  create: (v, hostId) => createConocesRoom(v, hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "conoces/state", v),
  fromMeta: (meta) => normalizeMeta(meta),
};
