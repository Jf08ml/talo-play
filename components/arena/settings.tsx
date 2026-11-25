"use client";

import { Bot, FlaskConical, HeartPulse, MonitorPlay, Smartphone } from "lucide-react";
import { roomPath } from "@/lib/games";
import { SIZE_OPTIONS, WINS_OPTIONS, createArenaRoom, normalizeMeta, type ArenaSettings } from "@/lib/arena";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

/** Team size, how many rounds, bots to fill the places and how health comes back. */
export const SETTINGS: GameSettings<ArenaSettings> = {
  game: "arena",
  initial: { size: 1, wins: 2, bots: true, potions: true, regen: false, view: "telefono" },
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
          ? "El combate se ve en una computadora conectada a la tele o al proyector, con la pantalla dividida (hasta 4 personas, cada una con su cámara detrás de su caballero). Los celulares son el control: joystick y botones grandes, y vibran cuando te pegan."
          : "Cada uno pelea en 3D desde su celular o computadora, en primera o tercera persona. Sirve también para jugar a distancia.",
    },
    { kind: "choice", key: "size", label: "Combate", options: choices(SIZE_OPTIONS, (n) => `${n} contra ${n}`) },
    { kind: "choice", key: "wins", label: "Rondas", layout: 2, options: choices(WINS_OPTIONS, (n) => `Al mejor de ${n * 2 - 1}`) },
    {
      kind: "toggle",
      key: "bots",
      icon: Bot,
      label: "Completar con bots",
      hint: "Los lugares vacíos los ocupan caballeros de la computadora. Sirve para practicar solo.",
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
    return { size: m.size, wins: m.wins, bots: m.bots, potions: m.potions, regen: m.regen, view: m.view };
  },
};
