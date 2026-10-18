"use client";

import { MATCH_OPTIONS, createBackgammonRoom } from "@/lib/backgammon";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { matchTo: number };

export const SETTINGS: GameSettings<Settings> = {
  game: "backgammon",
  initial: { matchTo: 3 },
  fields: [
    {
      kind: "choice",
      key: "matchTo",
      label: "Partido a",
      layout: 4,
      options: choices(MATCH_OPTIONS, (n) => `${n} ${n === 1 ? "punto" : "puntos"}`),
    },
    {
      kind: "note",
      only: "create",
      text: "Reglas completas: comer y entrar desde la barra, sacar fichas, cubo de doblaje, gammon y backgammon. La app solo deja hacer jugadas válidas y podés deshacer antes de terminar el turno.",
    },
  ],
  create: (v, hostId) => createBackgammonRoom(v.matchTo, hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "backgammon/state", v, { matchTo: v.matchTo }),
  fromMeta: (meta) => ({ matchTo: meta.matchTo ?? 3 }),
};
