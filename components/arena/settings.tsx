"use client";

import { Bot, FlaskConical, HeartPulse } from "lucide-react";
import { SIZE_OPTIONS, WINS_OPTIONS, createArenaRoom, normalizeMeta, type ArenaSettings } from "@/lib/arena";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

/** Team size, how many rounds, bots to fill the places and how health comes back. */
export const SETTINGS: GameSettings<ArenaSettings> = {
  game: "arena",
  initial: { size: 1, wins: 2, bots: true, potions: true, regen: false },
  fields: [
    { kind: "choice", key: "size", label: "Combate", options: choices(SIZE_OPTIONS, (n) => `${n} contra ${n}`) },
    { kind: "choice", key: "wins", label: "Rondas", layout: 2, options: choices(WINS_OPTIONS, (n) => `Al mejor de ${n * 2 - 1}`) },
    {
      kind: "toggle",
      key: "bots",
      icon: Bot,
      label: "Completar con bots",
      hint: "Los lugares vacíos los ocupan caballeros de la compu. Sirve para practicar solo.",
    },
    {
      kind: "toggle",
      key: "potions",
      icon: FlaskConical,
      label: "Pociones en la arena",
      hint: "Curan 40 de vida y vuelven a aparecer al rato en su lugar.",
    },
    {
      kind: "toggle",
      key: "regen",
      icon: HeartPulse,
      label: "Regenerar vida",
      hint: "Si nadie te pega por unos segundos, la vida se recupera de a poco.",
    },
  ],
  create: (v, hostId) => createArenaRoom(hostId, v),
  save: (roomId, v) => saveRoomSettings(roomId, "arena/state", { ...v }),
  fromMeta: (meta) => {
    const m = normalizeMeta(meta);
    return { size: m.size, wins: m.wins, bots: m.bots, potions: m.potions, regen: m.regen };
  },
};
