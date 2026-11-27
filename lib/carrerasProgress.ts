import { mulberry32 } from "./random";
import { levelOf, today, type LookItem } from "./arenaProgress";

/**
 * Carreras' progress (both racing games): experience and levels (Arena's
 * curve), looks unlocked by level — only how your car looks, never how it
 * drives — and three daily missions. Kept in this browser
 * (`carreras.progreso`), on the account too when signed in
 * (lib/carrerasProgressSync.ts). Pure except load/save/store.
 */

export { levelOf, today };
export type { LookItem };

/** How your car is dressed: ids from the catalogs below, and a race number (0 = the seat's). */
export interface CarLookIds {
  paint: string;
  stripes: string;
  rims: string;
  boost: string;
  neon: string;
  title: string;
  number: number;
}

export const DEFAULT_CAR_LOOK: CarLookIds = { paint: "asiento", stripes: "auto", rims: "plata", boost: "fuego", neon: "ninguno", title: "novato", number: 0 };

/** Paint: "asiento" keeps the seat's color (the one its tags and the minimap use). `metal` shines like chrome. */
export const PAINTS: (LookItem & { metal?: boolean })[] = [
  { id: "asiento", label: "Color del auto", level: 1, color: "" },
  { id: "perla", label: "Blanco perla", level: 2, color: "#f1f5f9" },
  { id: "noche", label: "Negro noche", level: 3, color: "#1e2230" },
  { id: "sol", label: "Amarillo sol", level: 4, color: "#facc15" },
  { id: "lima", label: "Verde lima", level: 6, color: "#84cc16" },
  { id: "uva", label: "Morado uva", level: 8, color: "#7c3aed" },
  { id: "chicle", label: "Rosa chicle", level: 10, color: "#ec4899" },
  { id: "naranja", label: "Naranja", level: 12, color: "#f97316" },
  { id: "oro", label: "Oro", level: 15, color: "#e5ae32", metal: true },
  { id: "cromo", label: "Cromo", level: 20, color: "#cbd5e1", metal: true },
];

/** Stripes and wing: "auto" is white or ink, whatever reads on the paint. */
export const STRIPES: LookItem[] = [
  { id: "auto", label: "Automáticas", level: 1, color: "" },
  { id: "blancas", label: "Blancas", level: 2, color: "#f8fafc" },
  { id: "negras", label: "Negras", level: 3, color: "#111111" },
  { id: "doradas", label: "Doradas", level: 7, color: "#e5ae32" },
  { id: "fuego", label: "Fuego", level: 11, color: "#f97316" },
  { id: "cian", label: "Cian", level: 14, color: "#22d3ee" },
];

export const RIMS: LookItem[] = [
  { id: "plata", label: "Plata", level: 1, color: "#d8dee8" },
  { id: "negras", label: "Negras", level: 4, color: "#1f2430" },
  { id: "doradas", label: "Doradas", level: 9, color: "#e5ae32" },
  { id: "neon", label: "Neón", level: 16, color: "#67e8f9" },
];

/** The boost flames: two colors each. */
export const BOOSTS: (LookItem & { colors: [string, string] })[] = [
  { id: "fuego", label: "Fuego", level: 1, color: "#fb923c", colors: ["#fb923c", "#fde047"] },
  { id: "azul", label: "Llama azul", level: 5, color: "#60a5fa", colors: ["#60a5fa", "#e0f2fe"] },
  { id: "verde", label: "Plasma verde", level: 11, color: "#4ade80", colors: ["#4ade80", "#d9f99d"] },
  { id: "violeta", label: "Violeta", level: 17, color: "#c084fc", colors: ["#c084fc", "#f5d0fe"] },
];

/** A glow under the car (shows best at night). */
export const NEONS: LookItem[] = [
  { id: "ninguno", label: "Sin neón", level: 1 },
  { id: "cian", label: "Cian", level: 7, color: "#22d3ee" },
  { id: "magenta", label: "Magenta", level: 13, color: "#e879f9" },
  { id: "lima", label: "Lima", level: 18, color: "#a3e635" },
];

export const TITLES: LookItem[] = [
  { id: "novato", label: "Novato", level: 1 },
  { id: "piloto", label: "Piloto", level: 3 },
  { id: "corredor", label: "Corredor", level: 6 },
  { id: "as", label: "As del volante", level: 10 },
  { id: "campeon", label: "Campeón", level: 15 },
  { id: "leyenda", label: "Leyenda", level: 20 },
  { id: "rey", label: "Rey del asfalto", level: 25 },
];

/** Numbers anyone can pick (0 = the seat's). */
export const MAX_NUMBER = 99;

// ---- What a race counts --------------------------------------------------------------

/** Counted while racing, per car (short keys: they travel in the room). */
export interface RaceStats {
  /** Boost pads taken. */
  b: number;
  /** Jumps (more than a moment in the air). */
  j: number;
  /** Seconds in the air, all told. */
  air: number;
  /** Hard hits against the walls. */
  w: number;
  /** Cars passed. */
  p: number;
  /** Laps completed. */
  l: number;
}

export const EMPTY_RACE: RaceStats = { b: 0, j: 0, air: 0, w: 0, p: 0, l: 0 };

/** A race as it ended for me. */
export interface RaceSummary {
  played: boolean;
  /** 1 = won. */
  place: number;
  players: number;
  /** Crossed the finish line (not closed out by the clock). */
  finished: boolean;
  stats: RaceStats;
}

/** Experience for a race: taking part, the podium, and what you did on the way. */
export function raceXp(r: RaceSummary): number {
  if (!r.played) return 0;
  const podium = r.players > 1 ? ([0, 35, 20, 10][r.place] ?? 0) : 0;
  const s = r.stats;
  return 20 + podium + (r.finished ? 5 : 0) + Math.min(15, s.p * 3) + Math.min(10, s.j * 2) + Math.min(10, s.b) + (r.finished && s.w === 0 ? 10 : 0);
}

// ---- Daily missions ----------------------------------------------------------------

export interface MissionDef {
  id: string;
  text: string;
  goal: number;
  xp: number;
  count: (r: RaceSummary) => number;
}

/** Append-only would be kind (ids are saved with the day's counters); order only seeds the pick. */
export const MISSIONS: MissionDef[] = [
  { id: "ganar2", text: "Gana 2 carreras", goal: 2, xp: 90, count: (r) => (r.place === 1 && r.players > 1 ? 1 : 0) },
  { id: "podio3", text: "Sube al podio 3 veces", goal: 3, xp: 70, count: (r) => (r.players > 1 && r.place <= 3 ? 1 : 0) },
  { id: "correr4", text: "Corre 4 carreras", goal: 4, xp: 60, count: (r) => (r.played ? 1 : 0) },
  { id: "turbos15", text: "Pasa por 15 turbos", goal: 15, xp: 70, count: (r) => r.stats.b },
  { id: "saltos10", text: "Salta 10 veces", goal: 10, xp: 70, count: (r) => r.stats.j },
  { id: "vuelo8", text: "Vuela 8 segundos en total", goal: 8, xp: 80, count: (r) => r.stats.air },
  { id: "adelantar8", text: "Adelanta 8 autos", goal: 8, xp: 80, count: (r) => r.stats.p },
  { id: "limpia1", text: "Termina una carrera sin chocar contra la pared", goal: 1, xp: 90, count: (r) => (r.finished && r.stats.w === 0 ? 1 : 0) },
  { id: "vueltas12", text: "Completa 12 vueltas", goal: 12, xp: 60, count: (r) => r.stats.l },
];

/** The day's three missions (same for everyone that UTC day; not the same three as Arena's day). */
export function dailyMissions(day: string): MissionDef[] {
  const rand = mulberry32((Number(day) || 1) * 7 + 3);
  const pool = [...MISSIONS];
  const out: MissionDef[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

// ---- Saved progress --------------------------------------------------------------------

export interface CarrerasProgress {
  xp: number;
  look: CarLookIds;
  day: string;
  missions: Record<string, number>;
  done: string[];
  races: number;
  wins: number;
}

const KEY = "carreras.progreso";

export function loadCarProgress(): CarrerasProgress {
  const base: CarrerasProgress = { xp: 0, look: { ...DEFAULT_CAR_LOOK }, day: today(), missions: {}, done: [], races: 0, wins: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<CarrerasProgress> | null;
    if (!raw) return base;
    const p: CarrerasProgress = { ...base, ...raw, look: { ...DEFAULT_CAR_LOOK, ...raw.look } };
    if (p.day !== today()) return { ...p, day: today(), missions: {}, done: [] };
    return p;
  } catch {
    return base;
  }
}

/** Fired on `window` when the saved progress changes (the room re-sends my look and level). */
export const CAR_PROGRESS_EVENT = "carreras-progress";

export function storeCarProgress(p: CarrerasProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    window.dispatchEvent(new Event(CAR_PROGRESS_EVENT));
  } catch {}
}

/** Two copies (this browser's, the account's): the one with more experience wins. */
export function mergeCarProgress(local: CarrerasProgress, remote: Partial<CarrerasProgress> | null): CarrerasProgress {
  if (!remote || typeof remote.xp !== "number" || remote.xp <= local.xp) return local;
  const day = today();
  return {
    ...local,
    ...remote,
    xp: remote.xp,
    look: { ...DEFAULT_CAR_LOOK, ...remote.look },
    missions: remote.day === day ? (remote.missions ?? {}) : local.missions,
    done: remote.day === day ? (remote.done ?? []) : local.done,
    day,
  };
}

/** Adds a finished race: experience, the day's mission counters and the ones completed now. */
export function applyRace(p: CarrerasProgress, r: RaceSummary): { next: CarrerasProgress; gained: number; completed: MissionDef[]; levelsUp: number } {
  if (!r.played) return { next: p, gained: 0, completed: [], levelsUp: 0 };
  const day = today();
  const base = p.day === day ? p : { ...p, day, missions: {}, done: [] };
  const missions = { ...base.missions };
  const completed: MissionDef[] = [];
  let gained = raceXp(r);
  for (const m of dailyMissions(day)) {
    missions[m.id] = Math.min(m.goal, (missions[m.id] ?? 0) + m.count(r));
    if (missions[m.id] >= m.goal && !base.done.includes(m.id)) {
      completed.push(m);
      gained += m.xp;
    }
  }
  const before = levelOf(base.xp).level;
  const next: CarrerasProgress = {
    ...base,
    xp: base.xp + gained,
    missions,
    done: [...base.done, ...completed.map((m) => m.id)],
    races: base.races + 1,
    wins: base.wins + (r.place === 1 && r.players > 1 ? 1 : 0),
  };
  return { next, gained, completed, levelsUp: levelOf(next.xp).level - before };
}

/** A look with anything not unlocked replaced by the default (and a sane number). */
export function validCarLook(look: Partial<CarLookIds> | undefined, level: number): CarLookIds {
  const l = { ...DEFAULT_CAR_LOOK, ...look };
  const ok = (list: LookItem[], id: string, dflt: string) => (list.some((i) => i.id === id && i.level <= level) ? id : dflt);
  const n = Math.floor(Number(l.number) || 0);
  return {
    paint: ok(PAINTS, l.paint, DEFAULT_CAR_LOOK.paint),
    stripes: ok(STRIPES, l.stripes, DEFAULT_CAR_LOOK.stripes),
    rims: ok(RIMS, l.rims, DEFAULT_CAR_LOOK.rims),
    boost: ok(BOOSTS, l.boost, DEFAULT_CAR_LOOK.boost),
    neon: ok(NEONS, l.neon, DEFAULT_CAR_LOOK.neon),
    title: ok(TITLES, l.title, DEFAULT_CAR_LOOK.title),
    number: n >= 1 && n <= MAX_NUMBER ? n : 0,
  };
}

/** A random look for a bot of about `level` (seeded, so every screen dresses it the same). */
export function botCarLook(seed: number, level: number): CarLookIds {
  const rand = mulberry32(seed);
  const pick = (list: LookItem[]) => {
    const open = list.filter((i) => i.level <= level);
    return open[Math.floor(rand() * open.length)]?.id ?? list[0].id;
  };
  // Bots mostly keep the seat's paint, so their cars stay easy to tell apart.
  const paint = rand() < 0.6 ? "asiento" : pick(PAINTS);
  return { paint, stripes: pick(STRIPES), rims: pick(RIMS), boost: pick(BOOSTS), neon: pick(NEONS), title: pick(TITLES), number: 0 };
}

/** What the 3D car needs from a look (colors resolved; the seat's for "asiento"/"auto"). */
export interface CarPaint {
  color: string;
  accent?: string;
  metal: boolean;
  rims: string;
  rimGlow: boolean;
  neon: string;
  flames: [string, string];
  number: number;
}

export function carPaint(look: CarLookIds, seatColor: string, seatAccent: string | undefined, seatNumber: number): CarPaint {
  const paint = PAINTS.find((i) => i.id === look.paint);
  const color = paint?.color || seatColor;
  const stripes = STRIPES.find((i) => i.id === look.stripes)?.color;
  // Automatic stripes: the seat's own on its paint, else white or ink by how light the paint is.
  const accent = stripes || (paint?.color ? (lightness(color) > 0.6 ? "#111111" : "#f8fafc") : seatAccent);
  return {
    color,
    accent,
    metal: !!paint?.metal,
    rims: RIMS.find((i) => i.id === look.rims)?.color ?? RIMS[0].color!,
    rimGlow: look.rims === "neon",
    neon: NEONS.find((i) => i.id === look.neon)?.color ?? "",
    flames: (BOOSTS.find((i) => i.id === look.boost) ?? BOOSTS[0]).colors,
    number: look.number || seatNumber,
  };
}

function lightness(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(n)) return 0.5;
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

// ---- Counting a race while it runs ----------------------------------------------------------

/** Below this hit speed a wall is a brush, not a crash; and one crash isn't counted twice. */
const WALL_HIT = 60;
const WALL_GAP = 0.6;
/** Less time than this in the air is a bump, not a jump. */
const JUMP_MIN = 0.25;
/** Seconds of racing before passes count. */
const PASS_FROM = 3;

interface Tracked {
  stats: RaceStats;
  boost: number;
  air: number;
  place: number;
  wallAt: number;
  t: number;
}

/**
 * Counts each car's race from what its runner already simulates (the phone
 * for its own car, the big screen for all): call `step` after `stepCar` with
 * the wall hit it returned, `place` with its standing, `lap` with laps done.
 */
export class RaceStatsTracker {
  private cars = new Map<string, Tracked>();

  private of(key: string): Tracked {
    let c = this.cars.get(key);
    if (!c) {
      c = { stats: { ...EMPTY_RACE }, boost: 0, air: 0, place: 0, wallAt: -9, t: 0 };
      this.cars.set(key, c);
    }
    return c;
  }

  step(key: string, car: { boost: number; air: number }, wallHit: number, dt: number) {
    const c = this.of(key);
    c.t += dt;
    // A pad sets the boost back up (once per pass).
    if (car.boost > c.boost + 0.1) c.stats.b++;
    c.boost = car.boost;
    if (car.air > 0) c.stats.air += dt;
    else if (c.air >= JUMP_MIN) c.stats.j++;
    c.air = car.air;
    if (wallHit > WALL_HIT && c.t - c.wallAt > WALL_GAP) {
      c.stats.w++;
      c.wallAt = c.t;
    }
  }

  /** Its standing now: moving up counts the cars passed (not in the first seconds, while the grid sorts itself out). */
  place(key: string, place: number) {
    const c = this.of(key);
    if (c.place && place < c.place && c.t > PASS_FROM) c.stats.p += c.place - place;
    c.place = place;
  }

  lap(key: string, laps: number) {
    const c = this.of(key);
    c.stats.l = Math.max(c.stats.l, laps);
  }

  get(key: string): RaceStats {
    const s = this.of(key).stats;
    return { ...s, air: Math.round(s.air * 10) / 10 };
  }
}
