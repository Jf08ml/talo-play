"use client";

import { createRetoRoom, normalizeMeta } from "@/lib/reto";
import { RETO_LEVELS, type RetoLevel } from "@/lib/retoPrompts";
import { saveRoomSettings } from "@/lib/roomSettings";
import type { GameSettings } from "@/components/RoomSettings";

type Settings = { levels: RetoLevel[] };

export const SETTINGS: GameSettings<Settings> = {
  game: "reto",
  initial: { levels: ["tranqui"] },
  fields: [
    {
      kind: "multi",
      key: "levels",
      label: "Nivel",
      layout: "list",
      options: RETO_LEVELS.map((l) => ({ value: l.id, label: `${l.emoji} ${l.label}`, sub: l.hint })),
    },
    {
      kind: "note",
      only: "create",
      text: "Se juega mejor en persona, pero también por videollamada. No tiene final: jueguen hasta que quieran.",
    },
    { kind: "note", only: "edit", text: "No tiene final, así que el nivel se puede cambiar también en medio de la partida." },
  ],
  problem: (v) => (v.levels.length === 0 ? "Elegí al menos un nivel." : null),
  create: (v, hostId) => createRetoRoom(v, hostId),
  // Endless: the next cards use the new levels.
  save: (roomId, v) => saveRoomSettings(roomId, "reto/state", v, {}, { anyStatus: true }),
  fromMeta: (meta) => normalizeMeta(meta),
  anytime: true,
};
