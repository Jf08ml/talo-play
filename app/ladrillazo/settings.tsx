"use client";

import { Flag, Swords, Users, Zap } from "lucide-react";
import { BOT_OPTIONS, GOAL_OPTIONS, MODES, createLadriRoom, normalizeMeta, type LadriMode, type LadriSettings } from "@/lib/ladrillazo";
import { CAMPAIGN } from "@/lib/ladrillazoLevels";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

const MODE_ICONS = { carrera: Flag, ataque: Zap, duelo: Swords, coop: Users } as const;

const NOTES: Record<LadriMode, string> = {
  carrera: "Todos juegan el mismo nivel, cada uno en su pantalla. Si te quedás sin pelotas, el nivel vuelve a empezar.",
  ataque: "La pared baja sola y cada combo le manda filas a otro. Si los ladrillos llegan a la línea roja, quedás afuera.",
  duelo: "Uno abajo y otro arriba, con ladrillos en el medio: hacé pasar la pelota por detrás del otro. Si estás solo, jugás contra la compu.",
  coop: "Hasta cuatro, cada uno cuida su parte de abajo. Las vidas son de todos.",
};

export const SETTINGS: GameSettings<LadriSettings> = {
  game: "ladrillazo",
  initial: { mode: "carrera", level: -1, bots: 1, goals: 5 },
  fields: [
    {
      kind: "choice",
      key: "mode",
      label: "Modo",
      layout: 2,
      options: MODES.map((m) => ({ value: m.id, label: m.label, sub: m.sub, icon: MODE_ICONS[m.id] })),
      hint: (v) => NOTES[v.mode],
    },
    {
      kind: "choice",
      key: "level",
      label: "Nivel",
      layout: 2,
      show: (v) => v.mode === "carrera" || v.mode === "coop",
      options: [
        { value: -1, label: "Al azar", sub: "Uno nuevo cada partida" },
        ...CAMPAIGN.map((l, i) => ({ value: i, label: `${i + 1}. ${l.name}`, sub: l.goal === "objetivos" ? "Objetivos rojos" : "Romper todo" })),
      ],
    },
    {
      kind: "choice",
      key: "bots",
      label: "Bots",
      layout: 4,
      show: (v) => v.mode === "carrera" || v.mode === "ataque",
      options: choices(BOT_OPTIONS, (n) => (n ? `${n}` : "Sin bots")),
      hint: (v) => (v.bots ? "Juegan como uno más, cada uno en su tablero." : "Solo los de la sala."),
    },
    {
      kind: "choice",
      key: "goals",
      label: "Goles para ganar",
      show: (v) => v.mode === "duelo",
      options: choices(GOAL_OPTIONS, (n) => `${n}`),
    },
  ],
  create: (v, hostId) => createLadriRoom(hostId, v),
  save: (roomId, v) => saveRoomSettings(roomId, "ladri/state", { ...v }),
  fromMeta: (meta) => {
    const m = normalizeMeta(meta);
    return { mode: m.mode, level: m.level, bots: m.bots, goals: m.goals };
  },
};
