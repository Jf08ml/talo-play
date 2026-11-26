import { mulberry32, seededShuffle } from "./random";
import type { MapDef } from "./fuegoMaps";
import type { WeaponId } from "./fuegoSim";

/**
 * Fuego cruzado's "caos": every minute an event changes the match for
 * everyone for a while (low gravity, only eyes visible, paint balloons
 * falling…). Nothing is sent over the network: the schedule comes from the
 * match's `seed` and its clock, so every phone works out the same event at
 * the same time. Pure; changing the order or timings changes live matches.
 */

export type ChaosId = "gravedad" | "turbo" | "ojos" | "salpicadoras" | "infinita" | "fantasmas" | "lluvia" | "doble";

/** APPEND-ONLY order (the shuffle for each match comes from it). */
export const CHAOS_IDS: ChaosId[] = ["gravedad", "turbo", "ojos", "salpicadoras", "infinita", "fantasmas", "lluvia", "doble"];

export const CHAOS_INFO: Record<ChaosId, { label: string; hint: string; color: string }> = {
  gravedad: { label: "Gravedad baja", hint: "Saltas altísimo y caes despacio", color: "#8A4DFF" },
  turbo: { label: "Turbo", hint: "Todos corren mucho más rápido", color: "#FF7A1A" },
  ojos: { label: "Ojos saltones", hint: "Ojos gigantes: tiros a la cabeza más fáciles", color: "#FFC400" },
  salpicadoras: { label: "Solo salpicadoras", hint: "Todos con salpicadora y munición infinita", color: "#00B26B" },
  infinita: { label: "Munición infinita", hint: "No hace falta recargar", color: "#2D5BFF" },
  fantasmas: { label: "Fantasmas", hint: "Solo se ven los ojos… hasta que disparan", color: "#94A3B8" },
  lluvia: { label: "Lluvia de globos", hint: "Caen globos de pintura del cielo: ¡muévete!", color: "#FF5FA2" },
  doble: { label: "Bajas dobles", hint: "Cada baja vale dos", color: "#EF4444" },
};

/** The first event starts this long after the match, then one every `EVERY_MS`, each lasting `LASTS_MS`. */
export const FIRST_MS = 40000;
export const EVERY_MS = 60000;
export const LASTS_MS = 25000;
/** It's announced this long before it starts. */
export const WARN_MS = 4000;

export interface ChaosSlot {
  id: ChaosId;
  /** Which event of the match (0, 1, …), and when it starts and ends (server ms). */
  n: number;
  start: number;
  end: number;
}

interface ChaosClock {
  chaos: boolean;
  seed: number;
  startedAt: number;
}

/** The n-th event of a match: the seed shuffles the list, and it goes round without repeating until all came out. */
export function chaosSlot(s: ChaosClock, n: number): ChaosSlot {
  const round = Math.floor(n / CHAOS_IDS.length);
  const order = seededShuffle(CHAOS_IDS, (s.seed + round * 7919) >>> 0);
  const start = s.startedAt + FIRST_MS + n * EVERY_MS;
  return { id: order[n % CHAOS_IDS.length], n, start, end: start + LASTS_MS };
}

/** The event on now, or null. */
export function chaosAt(s: ChaosClock, now: number): ChaosSlot | null {
  if (!s.chaos || !s.startedAt || now < s.startedAt + FIRST_MS) return null;
  const slot = chaosSlot(s, Math.floor((now - s.startedAt - FIRST_MS) / EVERY_MS));
  return now < slot.end ? slot : null;
}

/** The next event (to announce it), or null. */
export function nextChaos(s: ChaosClock, now: number): ChaosSlot | null {
  if (!s.chaos || !s.startedAt) return null;
  const n = Math.max(0, Math.ceil((now - s.startedAt - FIRST_MS) / EVERY_MS));
  return chaosSlot(s, n);
}

/** What an event changes in the simulation. */
export interface ChaosMods {
  gravity: number;
  jump: number;
  speed: number;
  /** Head hitbox scale (and how big the eyes are drawn). */
  head: number;
  infinite: boolean;
  weapon: WeaponId | null;
  ghosts: boolean;
  rain: boolean;
  double: boolean;
}

export const NO_MODS: ChaosMods = { gravity: 1, jump: 1, speed: 1, head: 1, infinite: false, weapon: null, ghosts: false, rain: false, double: false };

export function chaosMods(id: ChaosId | null | undefined): ChaosMods {
  switch (id) {
    case "gravedad":
      return { ...NO_MODS, gravity: 0.35, jump: 1.25 };
    case "turbo":
      return { ...NO_MODS, speed: 1.6 };
    case "ojos":
      return { ...NO_MODS, head: 1.9 };
    case "salpicadoras":
      return { ...NO_MODS, weapon: "escopeta", infinite: true };
    case "infinita":
      return { ...NO_MODS, infinite: true };
    case "fantasmas":
      return { ...NO_MODS, ghosts: true };
    case "lluvia":
      return { ...NO_MODS, rain: true };
    case "doble":
      return { ...NO_MODS, double: true };
    default:
      return NO_MODS;
  }
}

/** Paint balloons falling during "lluvia": one lands every `RAIN_EVERY_MS`. */
export const RAIN_EVERY_MS = 450;
/** How long each one is seen falling before it lands (s), and from how high. */
export const RAIN_FALL_S = 1.4;
export const RAIN_HEIGHT = 22;
/** A rain balloon hurts less than a thrown one. */
export const RAIN_DAMAGE = 0.6;

export interface RainDrop {
  /** Its key (event + index) and where/when it lands. */
  key: string;
  x: number;
  z: number;
  t: number;
}

/** The balloons of a "lluvia" event whose fall is under way at `now` (or landed within `pastMs`). */
export function rainDrops(slot: ChaosSlot, seed: number, map: Pick<MapDef, "hx" | "hz">, now: number, pastMs = 0): RainDrop[] {
  const out: RainDrop[] = [];
  const first = Math.max(0, Math.floor((now - pastMs - slot.start) / RAIN_EVERY_MS));
  const last = Math.floor((now + RAIN_FALL_S * 1000 - slot.start) / RAIN_EVERY_MS);
  for (let i = first; i <= last; i++) {
    const t = slot.start + (i + 1) * RAIN_EVERY_MS;
    if (t > slot.end) break;
    const rand = mulberry32((seed ^ (slot.n * 104729 + i * 7907)) >>> 0);
    out.push({ key: `${slot.n}:${i}`, x: (rand() * 2 - 1) * (map.hx - 2), z: (rand() * 2 - 1) * (map.hz - 2), t });
  }
  return out;
}
