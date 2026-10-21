"use client";

import { MINUTE_OPTIONS, SNAKE_OPTIONS, createViboraRoom, normalizeMeta, type ViboraSettings } from "@/lib/vibora";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

/** How long a match lasts and how many snakes share the map. */
export const SETTINGS: GameSettings<ViboraSettings> = {
  game: "vibora",
  initial: { minutes: 3, snakes: 8 },
  fields: [
    { kind: "choice", key: "minutes", label: "Duración", options: choices(MINUTE_OPTIONS, (n) => `${n} min`) },
    {
      kind: "choice",
      key: "snakes",
      label: "Bots",
      options: choices(SNAKE_OPTIONS, (n) => (n ? `Hasta ${n}` : "Sin bots")),
      hint: (v) =>
        v.snakes
          ? `Completan el mapa hasta ${v.snakes} víboras. En la partida no se distinguen de los demás.`
          : "Solo las víboras de los que están en la sala.",
    },
  ],
  create: (v, hostId) => createViboraRoom(hostId, v),
  save: (roomId, v) => saveRoomSettings(roomId, "vibora/state", { ...v }),
  fromMeta: (meta) => {
    const m = normalizeMeta(meta);
    return { minutes: m.minutes, snakes: m.snakes };
  },
};
