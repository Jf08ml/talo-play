"use client";

import { VARIANTS, createTriquiRoom, type Variant } from "@/lib/triqui";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { variant: Variant };

export const VARIANT_LABEL: Record<Variant, { label: string; sub: string }> = {
  clasico: { label: "Clásico", sub: "Tablero lleno sin línea = empate" },
  infinito: { label: "Infinito", sub: "Tres marcas cada uno: la más vieja se borra" },
};

export const SETTINGS: GameSettings<Settings> = {
  game: "triqui",
  initial: { variant: "clasico" },
  fields: [
    {
      kind: "choice",
      key: "variant",
      label: "Modo",
      layout: 2,
      options: choices(VARIANTS, (v) => VARIANT_LABEL[v].label, (v) => VARIANT_LABEL[v].sub),
    },
    {
      kind: "note",
      only: "create",
      text: "Partidas cortitas de 3 × 3, una revancha atrás de otra: se cambian X y O en cada una y la app lleva la cuenta.",
    },
  ],
  create: (v, hostId) => createTriquiRoom(v.variant, hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "triqui/state", v, { variant: v.variant }),
  fromMeta: (meta) => ({ variant: meta.variant === "infinito" ? "infinito" : "clasico" }),
};
