"use client";

import { createQuienRoom, normalizeMeta, type QuienSettings } from "@/lib/quiensoy";
import { QUIEN_DECKS } from "@/lib/quiensoyCards";
import { saveRoomSettings } from "@/lib/roomSettings";
import type { GameSettings } from "@/components/RoomSettings";

/** How questions are asked, where the characters come from, and which decks. */
export const SETTINGS: GameSettings<QuienSettings> = {
  game: "quiensoy",
  initial: { askMode: "voz", source: "mazo", decks: QUIEN_DECKS.map((d) => d.id) },
  fields: [
    {
      kind: "choice",
      key: "askMode",
      label: "¿Cómo se pregunta?",
      layout: "segment",
      options: [
        { value: "voz", label: "En voz alta" },
        { value: "app", label: "Escribiendo" },
      ],
      hint: (v) =>
        v.askMode === "voz"
          ? "Están juntos o en llamada: preguntas en voz alta y los demás responden con botones."
          : "Escribes la pregunta en la app y los demás responden con botones. Ideal a distancia.",
    },
    {
      kind: "choice",
      key: "source",
      label: "¿Quién elige los personajes?",
      layout: "segment",
      options: [
        { value: "mazo", label: "La app" },
        { value: "postit", label: "Ustedes" },
      ],
      hint: (v) =>
        v.source === "mazo"
          ? "La app reparte un personaje a cada uno de los mazos que elijan."
          : "Como en las fiestas: cada uno escribe el personaje del que le toca, sin que lo vea.",
    },
    {
      kind: "multi",
      key: "decks",
      label: "Mazos",
      show: (v) => v.source === "mazo",
      options: QUIEN_DECKS.map((d) => ({ value: d.id, label: `${d.emoji} ${d.label}` })),
    },
  ],
  problem: (v) => (v.source === "mazo" && v.decks.length === 0 ? "Elige al menos un mazo." : null),
  create: (v, hostId) => createQuienRoom(v, hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "quiensoy/state", v),
  fromMeta: (meta) => normalizeMeta(meta),
};
