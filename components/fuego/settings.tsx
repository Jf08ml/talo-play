"use client";

import { Bot, Egg, Flag, MonitorPlay, Skull, Smartphone, Swords, TrendingUp, Users, Zap } from "lucide-react";
import { MODE_INFO, MODE_ORDER, isTeamMode, usesKillGoal, type FuegoMode } from "@/lib/fuegoModes";
import { roomPath } from "@/lib/games";
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

const MODE_ICONS: Record<FuegoMode, typeof Users> = { todos: Swords, equipos: Users, infectados: Skull, escalada: TrendingUp, bandera: Flag, tesoro: Egg };

/** Where it's seen, map, mode, how many fighters, kills to win, time and bots. */
export const SETTINGS: GameSettings<FuegoSettings> = {
  game: "fuego",
  initial: { map: "bunker", mode: "todos", size: 4, goal: 20, minutes: 10, bots: true, level: "normal", view: "telefono", chaos: true },
  fields: [
    {
      kind: "choice",
      key: "view",
      label: "Dónde se ve",
      layout: 2,
      options: [
        { value: "telefono", label: "Cada uno en su celular", icon: Smartphone },
        { value: "pantalla", label: "En una pantalla grande", icon: MonitorPlay },
      ],
      hint: (v) =>
        v.view === "pantalla"
          ? "La partida se ve en una computadora conectada a la tele o al proyector, con la pantalla dividida: hasta 4 personas, cada una en primera persona. Los celulares son el control (joystick, arrastrar para mirar y botones grandes) y vibran cuando te pegan. Los bots completan el resto."
          : "Cada uno juega en 3D desde su celular o su computadora con mouse y teclado. Sirve también para jugar a distancia.",
    },
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
      layout: 2,
      options: MODE_ORDER.map((m) => ({ value: m, label: MODE_INFO[m].label, icon: MODE_ICONS[m] })),
      hint: (v) => MODE_INFO[v.mode].hint,
    },
    {
      kind: "choice",
      key: "size",
      label: "Jugadores en total",
      layout: 4,
      options: (v) =>
        SIZE_OPTIONS.map((n) => ({
          value: n,
          label: isTeamMode(v.mode) ? `${n / 2} vs ${n / 2}` : `${n}`,
          disabled: n > MAPS[v.map].maxPlayers,
        })),
    },
    { kind: "choice", key: "goal", label: "Bajas para ganar", show: (v) => usesKillGoal(v.mode), options: choices(GOAL_OPTIONS, (n) => `${n}`) },
    { kind: "choice", key: "minutes", label: "Tiempo", layout: 2, options: choices(MINUTE_OPTIONS, (n) => `${n} min`) },
    {
      kind: "toggle",
      key: "chaos",
      icon: Zap,
      label: "Caos cada minuto",
      hint: "Cada minuto pasa algo por 25 segundos: gravedad baja, turbo, ojos saltones, solo salpicadoras, munición infinita, fantasmas, lluvia de globos o bajas dobles.",
    },
    {
      kind: "toggle",
      key: "bots",
      icon: Bot,
      label: "Completar con bots",
      hint: "Los lugares libres los ocupan soldados de la computadora. Sirve para practicar solo.",
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
  afterCreate: (roomId, v) => (v.view === "pantalla" ? `${roomPath("fuego", roomId)}/pantalla` : roomPath("fuego", roomId)),
  createLabel: (v) => (v.view === "pantalla" ? "Crear sala y abrir la pantalla" : "Crear sala"),
  // The state keeps its own copy of the map and mode.
  save: (roomId, v) => saveRoomSettings(roomId, "fuego/state", { ...v }, { map: v.map, mode: v.mode }),
  fromMeta: (meta) => {
    const m = normalizeMeta(meta);
    return { map: m.map, mode: m.mode, size: m.size, goal: m.goal, minutes: m.minutes, bots: m.bots, level: m.level, view: m.view, chaos: m.chaos };
  },
};
