"use client";

import { TARGET_OPTIONS, createDominoRoom } from "@/lib/domino";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { target: number };

export const SETTINGS: GameSettings<Settings> = {
  game: "domino",
  initial: { target: 100 },
  fields: [
    { kind: "choice", key: "target", label: "Se juega a", options: choices(TARGET_OPTIONS, (n) => `${n} puntos`) },
    {
      kind: "note",
      only: "create",
      text: "Dominó doble seis. De a cuatro se juega en parejas (los de enfrente son compañeros); de a dos o tres, se roba del pozo cuando no tenés ficha. La app cuenta los puntos y detecta el tranque.",
    },
  ],
  create: (v, hostId) => createDominoRoom(v.target, hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "domino/state", v, { target: v.target }),
  fromMeta: (meta) => ({ target: meta.target ?? 100 }),
};
