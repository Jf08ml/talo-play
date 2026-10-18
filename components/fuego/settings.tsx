"use client";

import { Bot } from "lucide-react";
import { GOAL_OPTIONS, MINUTE_OPTIONS, SIZE_OPTIONS, createFuegoRoom, normalizeMeta, type FuegoSettings } from "@/lib/fuego";
import { MAPS, MAP_ORDER } from "@/lib/fuegoMaps";
import type { BotLevel } from "@/lib/fuegoSim";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

const LEVELS: { id: BotLevel; label: string }[] = [
  { id: "facil", label: "Fáciles" },
  { id: "normal", label: "Normales" },
  { id: "dificil", label: "Difíciles" },
];

/** Map, mode, how many fighters, kills to win, time and bots. */
export const SETTINGS: GameSettings<FuegoSettings> = {
  game: "fuego",
  initial: { map: "bunker", mode: "todos", size: 4, goal: 20, minutes: 10, bots: true, level: "normal" },
  fields: [
    {
      kind: "choice",
      key: "map",
      label: "Mapa",
      layout: "list",
      options: MAP_ORDER.map((id) => ({ value: id, label: `${MAPS[id].name} · ${MAPS[id].size}`, sub: MAPS[id].hint })),
      // A smaller map holds fewer fighters.
      onPick: (map, v) => ({ size: Math.min(v.size, MAPS[map as FuegoSettings["map"]].maxPlayers) }),
    },
    {
      kind: "choice",
      key: "mode",
      label: "Modo",
      layout: "segment",
      options: [
        { value: "todos", label: "Todos contra todos" },
        { value: "equipos", label: "Rojos contra azules" },
      ],
    },
    {
      kind: "choice",
      key: "size",
      label: "Jugadores en total",
      layout: 4,
      options: (v) =>
        SIZE_OPTIONS.map((n) => ({
          value: n,
          label: v.mode === "equipos" ? `${n / 2} vs ${n / 2}` : `${n}`,
          disabled: n > MAPS[v.map].maxPlayers,
        })),
    },
    { kind: "choice", key: "goal", label: "Bajas para ganar", options: choices(GOAL_OPTIONS, (n) => `${n}`) },
    { kind: "choice", key: "minutes", label: "Tiempo", layout: 2, options: choices(MINUTE_OPTIONS, (n) => `${n} min`) },
    {
      kind: "toggle",
      key: "bots",
      icon: Bot,
      label: "Completar con bots",
      hint: "Los lugares libres los ocupan soldados de la compu. Sirve para practicar solo.",
    },
    {
      kind: "choice",
      key: "level",
      label: "Nivel de los bots",
      show: (v) => v.bots,
      options: LEVELS.map((l) => ({ value: l.id, label: l.label })),
    },
  ],
  create: (v, hostId) => createFuegoRoom(hostId, v),
  // The state keeps its own copy of the map and mode.
  save: (roomId, v) => saveRoomSettings(roomId, "fuego/state", { ...v }, { map: v.map, mode: v.mode }),
  fromMeta: (meta) => {
    const m = normalizeMeta(meta);
    return { map: m.map, mode: m.mode, size: m.size, goal: m.goal, minutes: m.minutes, bots: m.bots, level: m.level };
  },
};
