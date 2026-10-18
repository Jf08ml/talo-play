"use client";

import { createOcaRoom } from "@/lib/oca";
import { saveRoomSettings } from "@/lib/roomSettings";
import type { GameSettings } from "@/components/RoomSettings";

type Settings = { dice: number };

export const SETTINGS: GameSettings<Settings> = {
  game: "oca",
  initial: { dice: 2 },
  fields: [
    {
      kind: "choice",
      key: "dice",
      label: "Dados",
      layout: "segment",
      options: [
        { value: 2, label: "Dos dados" },
        { value: 1, label: "Un dado" },
      ],
      hint: (v) =>
        v.dice === 2
          ? "Como el original: más rápido, y si en la primera tirada sacás 6 y 3 o 4 y 5, saltás a los dados."
          : "Partidas más largas y tranquilas, ideal con chicos.",
    },
    {
      kind: "note",
      only: "create",
      text: "Juegan de 2 a 6. La app mueve la ficha y aplica las casillas: ocas, puentes, posada, pozo, laberinto, cárcel y la calavera.",
    },
  ],
  create: (v, hostId) => createOcaRoom(v.dice, hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "oca/state", v, { dice: v.dice }),
  fromMeta: (meta) => ({ dice: meta.dice === 1 ? 1 : 2 }),
};
