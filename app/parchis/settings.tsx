"use client";

import { createLudoRoom, type LudoRules } from "@/lib/ludo";
import { saveRoomSettings } from "@/lib/roomSettings";
import type { GameSettings } from "@/components/RoomSettings";

type Settings = { rules: LudoRules };

const RULES_TEXT: Record<LudoRules, string> = {
  parchis:
    "El parchís de siempre: salís con un 5, el 6 repite, dos fichas juntas forman barrera, comer cuenta 20 y llegar cuenta 10. Hay seguros donde no se come.",
  ludo: "La versión más simple: salís con un 6, no hay barreras y caer sobre una rival fuera de las estrellas la manda a su base.",
};

export const SETTINGS: GameSettings<Settings> = {
  game: "ludo",
  initial: { rules: "parchis" },
  fields: [
    {
      kind: "choice",
      key: "rules",
      label: "Reglas",
      layout: "segment",
      options: [
        { value: "parchis", label: "Parchís" },
        { value: "ludo", label: "Ludo clásico" },
      ],
      hint: (v) => RULES_TEXT[v.rules],
    },
    { kind: "note", only: "create", text: "Juegan de 2 a 4; si entra más gente, mira la partida y puede jugar la próxima." },
  ],
  create: (v, hostId) => createLudoRoom(hostId, v.rules),
  // The state keeps its own copy of the rules.
  save: (roomId, v) => saveRoomSettings(roomId, "ludo/state", v, { rules: v.rules }),
  fromMeta: (meta) => ({ rules: meta.rules === "parchis" ? "parchis" : "ludo" }),
};
