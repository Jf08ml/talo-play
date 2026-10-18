"use client";

import { CLUE_ROUND_OPTIONS, createImpostorRoom, normalizeMeta, type ClueMode } from "@/lib/impostor";
import { IMPOSTOR_CATEGORIES, type ImpostorCategory } from "@/lib/impostorWords";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { categories: ImpostorCategory[]; clueMode: ClueMode; clueRounds: number; impostorHint: boolean };

export const SETTINGS: GameSettings<Settings> = {
  game: "impostor",
  initial: { categories: IMPOSTOR_CATEGORIES.map((c) => c.id), clueMode: "app", clueRounds: 2, impostorHint: true },
  fields: [
    {
      kind: "choice",
      key: "clueMode",
      label: "¿Dónde dan las pistas?",
      layout: "segment",
      options: [
        { value: "app", label: "En la app" },
        { value: "voz", label: "En voz alta" },
      ],
      hint: (v) =>
        v.clueMode === "app"
          ? "Por turnos, cada uno escribe su pista. Ideal a distancia."
          : "Están juntos: la app reparte las cartas y organiza la votación.",
    },
    {
      kind: "choice",
      key: "clueRounds",
      label: "Vueltas de pistas antes de votar",
      options: choices(CLUE_ROUND_OPTIONS, (n) => `${n}`),
      show: (v) => v.clueMode === "app",
    },
    {
      kind: "multi",
      key: "categories",
      label: "Categorías",
      options: IMPOSTOR_CATEGORIES.map((c) => ({ value: c.id, label: `${c.emoji} ${c.label}` })),
    },
    { kind: "toggle", key: "impostorHint", label: "El impostor sabe la categoría", hint: "Más fácil para él." },
  ],
  problem: (v) => (v.categories.length === 0 ? "Elegí al menos una categoría." : null),
  create: (v, hostId) => createImpostorRoom(v, hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "impostor/state", v),
  fromMeta: (meta) => normalizeMeta(meta),
};
