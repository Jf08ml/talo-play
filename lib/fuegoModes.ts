import type { MapDef } from "./fuegoMaps";
import type { WeaponId } from "./fuegoSim";
import type { TeamId } from "./teams";

/**
 * Fuego cruzado's party modes, besides kills (free-for-all or teams):
 *
 * - infectados: a few start infected (green, faster, unarmed: one punch
 *   infects); whoever falls joins them. Survivors win if any is left when
 *   time's up. Sides: red = infected, blue = survivors.
 * - escalada: each kill moves you to the next weapon of `LADDER`; the last
 *   step is the bare-handed punch, and a kill with it wins.
 * - bandera: red against blue, a flag at each base (`flagBase`); bring the
 *   rival's to yours while yours is home. `FLAG_CAPS` captures win.
 * - tesoro: one golden egg; holding it adds up time (`eggScore`), first to
 *   `EGG_TARGET_MS` wins.
 *
 * Pure; the rules that change the room's state are in lib/fuego.ts.
 */

export type FuegoMode = "todos" | "equipos" | "infectados" | "escalada" | "bandera" | "tesoro";

export const MODE_ORDER: FuegoMode[] = ["todos", "equipos", "infectados", "escalada", "bandera", "tesoro"];

export const MODE_INFO: Record<FuegoMode, { label: string; hint: string }> = {
  todos: { label: "Todos contra todos", hint: "Gana quien llega primero a las bajas pedidas." },
  equipos: { label: "Rojos contra azules", hint: "Dos equipos: gana el que suma primero las bajas pedidas." },
  infectados: {
    label: "Infectados",
    hint: "Unos pocos empiezan infectados: no disparan, pero son rápidos y contagian de un manotazo. Quien cae se infecta. Los sobrevivientes ganan si aguanta alguno hasta el final.",
  },
  escalada: {
    label: "Escalada",
    hint: "Cada baja te cambia el arma por la siguiente de la lista. La última es el manotazo: una baja con él y ganas.",
  },
  bandera: {
    label: "Atrapa la bandera",
    hint: "Rojos contra azules: lleva la bandera rival a tu base mientras la tuya está en casa. Gana el primero en hacer 3 capturas.",
  },
  tesoro: {
    label: "El tesoro",
    hint: "Hay un huevo dorado: mientras lo tienes, sumas segundos. Gana quien junte 60 (si te eliminan, lo sueltas).",
  },
};

/** Red against blue (team picking in the waiting room, team colors). */
export const isTeamMode = (m: FuegoMode) => m === "equipos" || m === "bandera";
/** Modes won by kills (the room's `goal` applies). */
export const usesKillGoal = (m: FuegoMode) => m === "todos" || m === "equipos";
/** Modes where weapons on the floor can't be picked up (the mode decides your weapon). */
export const fixedWeapons = (m: FuegoMode) => m === "escalada";

// ---- Infectados ------------------------------------------------------------------------------

export const INFECTED: TeamId = "red";
export const SURVIVORS: TeamId = "blue";
/** Infected's color, faster run and higher jump. */
export const INFECTED_COLOR = "#65A30D";
export const INFECTED_SPEED = 1.22;
export const INFECTED_JUMP = 1.15;
/** One infected per this many fighters (at least one). */
export const INFECTED_PER = 5;
/** An infected match lasts at most this long. */
export const INFECTED_MAX_MIN = 3;

// ---- Escalada --------------------------------------------------------------------------------

/** Each kill moves you one step; "golpe" is the bare-handed last one. */
export const LADDER: (WeaponId | "golpe")[] = ["rifle", "escopeta", "pistola", "francotirador", "lanzacohetes", "escopeta", "pistola", "golpe"];

export function ladderStep(kills: number): WeaponId | "golpe" {
  return LADDER[Math.min(LADDER.length - 1, Math.max(0, kills))];
}

// ---- Bandera ---------------------------------------------------------------------------------

export const FLAG_CAPS = 3;
/** A dropped flag goes home by itself after this long. */
export const FLAG_RETURN_MS = 20000;
/** How close you have to be to take, return or capture a flag (m). */
export const FLAG_REACH = 1.6;

/**
 * Where a team's flag stands: its spawn farthest from the middle (maps
 * without team spawns use the spawn farthest to that side).
 */
export function flagBase(map: Pick<MapDef, "spawns">, team: TeamId): { x: number; z: number } {
  const own = map.spawns.filter((s) => s.team === team);
  if (own.length) {
    const far = own.reduce((a, b) => (Math.hypot(b.x, b.z) > Math.hypot(a.x, a.z) ? b : a));
    return { x: far.x, z: far.z };
  }
  const pick = map.spawns.reduce((a, b) => (team === "red" ? (b.x < a.x ? b : a) : b.x > a.x ? b : a));
  return { x: pick.x, z: pick.z };
}

// ---- Tesoro ----------------------------------------------------------------------------------

export const EGG_TARGET_MS = 60000;
/** An egg left on the floor goes back to the middle after this long. */
export const EGG_RESET_MS = 20000;
export const EGG_REACH = 1.4;

export interface Egg {
  /** Who holds it ("" = on the floor), where it lies, and when that last changed (server ms). */
  by: string;
  x: number;
  z: number;
  at: number;
  /** Who dropped it last (their phone tells where). */
  last?: string;
}

/** Time a fighter has held the egg (banked + the current hold). */
export function eggScore(s: { egg?: Egg | null; held: Record<string, number> }, id: string, now: number): number {
  return (s.held[id] ?? 0) + (s.egg && s.egg.by === id ? Math.max(0, now - s.egg.at) : 0);
}

// ---- Flags -----------------------------------------------------------------------------------

export interface Flag {
  /** At its base, carried (by a rival) or dropped somewhere. */
  st: "base" | "carried" | "dropped";
  /** Who carries it, or who dropped it last. */
  by: string;
  x: number;
  z: number;
  at: number;
}
