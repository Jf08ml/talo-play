import { mulberry32 } from "./random";

/**
 * Arena medieval's progress: experience and levels, looks unlocked by level
 * (only how your knight looks — never an advantage) and three daily
 * challenges. Kept in this browser (`arena.progreso`), so it works without an
 * account; the day's challenges are the same for everyone (seeded by the UTC
 * day). Everything here is pure except `loadProgress`/`saveProgress`.
 */

export interface ArenaLook {
  /** Armor finish, plume color, shield emblem, helmet style and title (ids from the catalogs below). */
  armor: string;
  cape: string;
  trail: string;
  plume: string;
  emblem: string;
  helm: string;
  title: string;
}

export const DEFAULT_LOOK: ArenaLook = { armor: "plata", cape: "ninguna", trail: "ninguna", plume: "equipo", emblem: "ninguno", helm: "yelmo", title: "escudero" };

/** A look item: what it is, how it shows, and the level that unlocks it. */
export interface LookItem {
  id: string;
  label: string;
  level: number;
  /** Plumes: a color ("" = the team's). */
  color?: string;
}

/** Armor finishes unlock separately from team cloth, keeping teams easy to identify. */
export const ARMORS: LookItem[] = [
  { id: "plata", label: "Plata", level: 1, color: "#b8c2cc" },
  { id: "hierro", label: "Hierro oscuro", level: 4, color: "#66717d" },
  { id: "bronce", label: "Bronce", level: 8, color: "#b87542" },
  { id: "jade", label: "Jade", level: 13, color: "#25846f" },
  { id: "obsidiana", label: "Obsidiana", level: 19, color: "#51485e" },
];

export const CAPES: LookItem[] = [
  { id: "ninguna", label: "Sin capa", level: 1 },
  { id: "equipo", label: "Capa del equipo", level: 3 },
  { id: "roja", label: "Capa carmesí", level: 7, color: "#dc2646" },
  { id: "azul", label: "Capa zafiro", level: 11, color: "#2584d8" },
  { id: "dorada", label: "Capa real", level: 16, color: "#e5ae32" },
];

export const TRAILS: LookItem[] = [
  { id: "ninguna", label: "Sin estela", level: 1 },
  { id: "fuego", label: "Chispas de fuego", level: 5, color: "#ff8b32" },
  { id: "hielo", label: "Brillo de hielo", level: 10, color: "#79e5ff" },
  { id: "arcano", label: "Polvo arcano", level: 17, color: "#c084fc" },
];

export const PLUMES: LookItem[] = [
  { id: "equipo", label: "Color del equipo", level: 1, color: "" },
  { id: "blanca", label: "Blanca", level: 2, color: "#f8fafc" },
  { id: "negra", label: "Negra", level: 3, color: "#1f2937" },
  { id: "dorada", label: "Dorada", level: 5, color: "#facc15" },
  { id: "verde", label: "Verde", level: 7, color: "#22c55e" },
  { id: "violeta", label: "Violeta", level: 9, color: "#8b5cf6" },
  { id: "fuego", label: "Fuego", level: 12, color: "#f97316" },
  { id: "hielo", label: "Hielo", level: 15, color: "#67e8f9" },
];

export const EMBLEMS: LookItem[] = [
  { id: "ninguno", label: "Liso", level: 1 },
  { id: "cruz", label: "Cruz", level: 2 },
  { id: "estrella", label: "Estrella", level: 4 },
  { id: "rayo", label: "Rayo", level: 6 },
  { id: "luna", label: "Luna", level: 8 },
  { id: "corona", label: "Corona", level: 11 },
  { id: "dragon", label: "Dragón", level: 14 },
  { id: "calavera", label: "Calavera", level: 18 },
];

export const HELMS: LookItem[] = [
  { id: "yelmo", label: "Yelmo", level: 1 },
  { id: "cresta", label: "Cresta", level: 4 },
  { id: "cuernos", label: "Cuernos", level: 8 },
  { id: "corona", label: "Corona de hierro", level: 13 },
  { id: "alado", label: "Alado", level: 20 },
];

export const TITLES: LookItem[] = [
  { id: "escudero", label: "Escudero", level: 1 },
  { id: "soldado", label: "Soldado", level: 3 },
  { id: "caballero", label: "Caballero", level: 6 },
  { id: "veterano", label: "Veterano", level: 10 },
  { id: "campeon", label: "Campeón", level: 15 },
  { id: "leyenda", label: "Leyenda", level: 20 },
  { id: "rey", label: "Rey de la arena", level: 25 },
];

/** Experience to go from `level` to the next one. */
export const xpToNext = (level: number) => 120 + (level - 1) * 60;

/** Level and progress for a total of experience. */
export function levelOf(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  while (left >= xpToNext(level)) {
    left -= xpToNext(level);
    level++;
  }
  return { level, into: left, need: xpToNext(level) };
}

/** What earns experience in a match (counted by the game while you play). */
export interface MatchStats {
  played: boolean;
  won: boolean;
  kos: number;
  blocks: number;
  parries: number;
  kicks: number;
  specials: number;
  potions: number;
  /** Knockouts per weapon in hand (`hacha`, `arco`…). */
  koWith: Record<string, number>;
  damage: number;
}

export const EMPTY_STATS: MatchStats = { played: false, won: false, kos: 0, blocks: 0, parries: 0, kicks: 0, specials: 0, potions: 0, koWith: {}, damage: 0 };

/** Experience for a match. */
export function matchXp(s: MatchStats): number {
  if (!s.played) return 0;
  return 25 + (s.won ? 35 : 0) + s.kos * 12 + Math.min(10, s.blocks) + s.parries * 4 + s.specials * 3 + Math.min(20, Math.floor(s.damage / 20));
}

// ---- Daily challenges ----------------------------------------------------------------

export interface ChallengeDef {
  id: string;
  text: string;
  goal: number;
  xp: number;
  /** How a match adds to it. */
  count: (s: MatchStats) => number;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: "ganar2", text: "Gana 2 batallas", goal: 2, xp: 80, count: (s) => (s.won ? 1 : 0) },
  { id: "jugar4", text: "Juega 4 batallas", goal: 4, xp: 60, count: (s) => (s.played ? 1 : 0) },
  { id: "derribar5", text: "Derriba a 5 caballeros", goal: 5, xp: 80, count: (s) => s.kos },
  { id: "bloquear15", text: "Bloquea 15 golpes", goal: 15, xp: 60, count: (s) => s.blocks },
  { id: "parar3", text: "Haz 3 paradas perfectas", goal: 3, xp: 90, count: (s) => s.parries },
  { id: "patear5", text: "Patea 5 veces a un rival", goal: 5, xp: 60, count: (s) => s.kicks },
  { id: "especial3", text: "Lanza 3 golpes especiales", goal: 3, xp: 80, count: (s) => s.specials },
  { id: "hacha2", text: "Derriba a 2 con el hacha", goal: 2, xp: 90, count: (s) => s.koWith.hacha ?? 0 },
  { id: "arco2", text: "Derriba a 2 con el arco", goal: 2, xp: 100, count: (s) => s.koWith.arco ?? 0 },
  { id: "lanza2", text: "Derriba a 2 con la lanza", goal: 2, xp: 90, count: (s) => s.koWith.lanza ?? 0 },
  { id: "daga1", text: "Derriba a 1 con la daga", goal: 1, xp: 70, count: (s) => s.koWith.daga ?? 0 },
  { id: "pocion3", text: "Toma 3 pociones", goal: 3, xp: 50, count: (s) => s.potions },
  { id: "dano600", text: "Haz 600 de daño", goal: 600, xp: 80, count: (s) => s.damage },
];

/** The day's three challenges (same for everyone that UTC day). */
export function dailyChallenges(day: string): ChallengeDef[] {
  const rand = mulberry32(Number(day) || 1);
  const pool = [...CHALLENGES];
  const out: ChallengeDef[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

// ---- Saved progress --------------------------------------------------------------------

export interface ArenaProgress {
  xp: number;
  look: ArenaLook;
  /** The day (yyyymmdd, UTC) the challenge counters below belong to. */
  day: string;
  challenges: Record<string, number>;
  /** Challenges already paid today. */
  done: string[];
  matches: number;
  wins: number;
  kos: number;
}

const KEY = "arena.progreso";

export const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

export function loadProgress(): ArenaProgress {
  const base: ArenaProgress = { xp: 0, look: { ...DEFAULT_LOOK }, day: today(), challenges: {}, done: [], matches: 0, wins: 0, kos: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<ArenaProgress> | null;
    if (!raw) return base;
    const p: ArenaProgress = { ...base, ...raw, look: { ...DEFAULT_LOOK, ...raw.look } };
    if (p.day !== today()) return { ...p, day: today(), challenges: {}, done: [] };
    return p;
  } catch {
    return base;
  }
}

export function saveProgress(p: ArenaProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

/** Adds a finished match: experience, challenge counters and the ones completed now. */
export function applyMatch(p: ArenaProgress, s: MatchStats): { next: ArenaProgress; gained: number; completed: ChallengeDef[]; levelsUp: number } {
  if (!s.played) return { next: p, gained: 0, completed: [], levelsUp: 0 };
  const day = today();
  const base = p.day === day ? p : { ...p, day, challenges: {}, done: [] };
  const challenges = { ...base.challenges };
  const completed: ChallengeDef[] = [];
  let gained = matchXp(s);
  for (const c of dailyChallenges(day)) {
    challenges[c.id] = Math.min(c.goal, (challenges[c.id] ?? 0) + c.count(s));
    if (challenges[c.id] >= c.goal && !base.done.includes(c.id)) {
      completed.push(c);
      gained += c.xp;
    }
  }
  const before = levelOf(base.xp).level;
  const next: ArenaProgress = {
    ...base,
    xp: base.xp + gained,
    challenges,
    done: [...base.done, ...completed.map((c) => c.id)],
    matches: base.matches + 1,
    wins: base.wins + (s.won ? 1 : 0),
    kos: base.kos + s.kos,
  };
  return { next, gained, completed, levelsUp: levelOf(next.xp).level - before };
}

/** Whether an item is unlocked at `level`. */
export const unlocked = (item: LookItem, level: number) => level >= item.level;

/** A look with anything not unlocked replaced by the default (e.g. after a reset). */
export function validLook(look: ArenaLook, level: number): ArenaLook {
  const ok = (list: LookItem[], id: string, dflt: string) => (list.some((i) => i.id === id && i.level <= level) ? id : dflt);
  return {
    armor: ok(ARMORS, look.armor, DEFAULT_LOOK.armor),
    cape: ok(CAPES, look.cape, DEFAULT_LOOK.cape),
    trail: ok(TRAILS, look.trail, DEFAULT_LOOK.trail),
    plume: ok(PLUMES, look.plume, DEFAULT_LOOK.plume),
    emblem: ok(EMBLEMS, look.emblem, DEFAULT_LOOK.emblem),
    helm: ok(HELMS, look.helm, DEFAULT_LOOK.helm),
    title: ok(TITLES, look.title, DEFAULT_LOOK.title),
  };
}

/** A random look for a bot, plausible for a player of about `level`. */
export function botLook(seed: number, level: number): ArenaLook {
  const rand = mulberry32(seed);
  const pick = (list: LookItem[]) => {
    const open = list.filter((i) => i.level <= level);
    return open[Math.floor(rand() * open.length)]?.id ?? list[0].id;
  };
  return { armor: pick(ARMORS), cape: pick(CAPES), trail: pick(TRAILS), plume: pick(PLUMES), emblem: pick(EMBLEMS), helm: pick(HELMS), title: pick(TITLES) };
}

// ---- Change notices, the hidden rating and the first visit -------------------------------

/** Fired on `window` when the saved progress changes (the room re-sends my look and level). */
export const PROGRESS_EVENT = "arena-progress";

/** Saves and tells the page (the lobby card, the room's player info). */
export function storeProgress(p: ArenaProgress) {
  saveProgress(p);
  try {
    window.dispatchEvent(new Event(PROGRESS_EVENT));
  } catch {}
}

/** Two copies of the progress (this browser's, the account's): the one with more experience wins. */
export function mergeProgress(local: ArenaProgress, remote: Partial<ArenaProgress> | null): ArenaProgress {
  if (!remote || typeof remote.xp !== "number" || remote.xp <= local.xp) return local;
  const day = today();
  const r: ArenaProgress = {
    ...local,
    ...remote,
    xp: remote.xp,
    look: { ...DEFAULT_LOOK, ...remote.look },
    challenges: remote.day === day ? (remote.challenges ?? {}) : local.challenges,
    done: remote.day === day ? (remote.done ?? []) : local.done,
    day,
  };
  return r;
}

const RATING_KEY = "arena.habilidad";

/** My hidden skill rating (never shown; public arenas tune their bots to it). */
export function loadRating(fallback: number): number {
  try {
    const n = Number(localStorage.getItem(RATING_KEY));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

export function saveRating(r: number) {
  try {
    localStorage.setItem(RATING_KEY, String(Math.round(r)));
  } catch {}
}

const FIRST_KEY = "arena.primeraVez";

/** Days since this browser first played Arena (saved on the first call; for the retention metric). */
export function daysSinceFirst(): number {
  try {
    const now = Date.now();
    const saved = Number(localStorage.getItem(FIRST_KEY));
    if (!saved) {
      localStorage.setItem(FIRST_KEY, String(now));
      return 0;
    }
    return Math.max(0, Math.floor((now - saved) / 86400000));
  } catch {
    return 0;
  }
}
