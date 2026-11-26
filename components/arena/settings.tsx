"use client";

import { Bot, CloudLightning, Crown, FlaskConical, HeartPulse, MonitorPlay, Shield, Shuffle, Smartphone, Swords, Users } from "lucide-react";
import { roomPath } from "@/lib/games";
import { FFA_OPTIONS, MODE_INFO, SIZE_OPTIONS, SURVIVAL_MAX, WINS_OPTIONS, createArenaRoom, normalizeMeta, type ArenaMode, type ArenaSettings } from "@/lib/arena";
import { MAPS, MAP_IDS, type MapChoice } from "@/lib/arenaMaps";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

const MODE_ICONS: Record<ArenaMode, typeof Users> = { equipos: Users, todos: Swords, rey: Crown, supervivencia: Shield };

/** Where it's seen, the mode, the map, team size or knights, rounds, bots, events and how health comes back. */
export const SETTINGS: GameSettings<ArenaSettings> = {
  game: "arena",
  initial: { size: 1, wins: 2, bots: true, potions: true, regen: false, view: "telefono", mode: "equipos", map: "coliseo", events: false, ffa: 4 },
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
          ? "El combate se ve en una computadora conectada a la tele o al proyector, con la pantalla dividida (hasta 4 personas, cada una con su cámara detrás de su caballero). Los celulares son el control: joystick para moverte, arrastrar para mirar y botones grandes, y vibran cuando te pegan."
          : "Cada uno pelea en 3D desde su celular o computadora, en primera o tercera persona. Sirve también para jugar a distancia.",
    },
    {
      kind: "choice",
      key: "mode",
      label: "Modo",
      layout: 2,
      options: (["equipos", "todos", "rey", "supervivencia"] as ArenaMode[]).map((m) => ({ value: m, label: MODE_INFO[m].label, icon: MODE_ICONS[m] })),
      hint: (v) => MODE_INFO[v.mode].hint,
    },
    {
      kind: "choice",
      key: "map",
      label: "Arena",
      layout: 3,
      options: [
        { value: "azar", label: "Al azar", icon: Shuffle, sub: "otra cada partida" },
        ...MAP_IDS.map((id) => ({ value: id as MapChoice, label: MAPS[id].label })),
      ],
      hint: (v) => (v.map === "azar" ? "Cada partida se juega en una arena distinta, elegida al azar." : MAPS[v.map].hint),
    },
    {
      kind: "choice",
      key: "size",
      label: "Combate",
      show: (v) => v.mode === "equipos" || v.mode === "rey",
      options: choices(SIZE_OPTIONS, (n) => `${n} contra ${n}`),
    },
    {
      kind: "choice",
      key: "ffa",
      label: "Caballeros",
      show: (v) => v.mode === "todos",
      layout: 4,
      options: choices(FFA_OPTIONS, (n) => `${n}`),
      hint: () => "Cuántos pelean en total. Si faltan personas, los bots completan.",
    },
    {
      kind: "choice",
      key: "wins",
      label: "Rondas",
      layout: 2,
      show: (v) => v.mode === "equipos" || v.mode === "todos",
      options: (v) => choices(WINS_OPTIONS, (n) => (v.mode === "todos" ? `Gana quien gane ${n}` : `Al mejor de ${n * 2 - 1}`)),
    },
    {
      kind: "note",
      text: (v) =>
        v.mode === "supervivencia"
          ? `Pelean juntos hasta ${SURVIVAL_MAX} personas, contra bots que llegan en oleadas.`
          : v.mode === "rey"
            ? "Una sola ronda de 3 minutos: si caes, vuelves a los pocos segundos."
            : "",
      show: (v) => v.mode === "supervivencia" || v.mode === "rey",
    },
    {
      kind: "toggle",
      key: "bots",
      icon: Bot,
      label: "Completar con bots",
      hint: "Los lugares vacíos los ocupan caballeros de la computadora. Sirve para practicar solo.",
      show: (v) => v.mode !== "supervivencia",
    },
    {
      kind: "toggle",
      key: "events",
      icon: CloudLightning,
      label: "Eventos",
      hint: "De vez en cuando pasa algo en medio de la ronda: lluvia de flechas, la tribuna tira armas, la arena se achica o baja la niebla.",
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
  // With a big screen, whoever creates it is on the computer: it opens the screen.
  afterCreate: (roomId, v) => (v.view === "pantalla" ? `${roomPath("arena", roomId)}/pantalla` : roomPath("arena", roomId)),
  createLabel: (v) => (v.view === "pantalla" ? "Crear sala y abrir la pantalla" : "Crear sala"),
  save: (roomId, v) => saveRoomSettings(roomId, "arena/state", { ...v }),
  fromMeta: (meta) => {
    const m = normalizeMeta(meta);
    return { size: m.size, wins: m.wins, bots: m.bots, potions: m.potions, regen: m.regen, view: m.view, mode: m.mode, map: m.map, events: m.events, ffa: m.ffa };
  },
};
