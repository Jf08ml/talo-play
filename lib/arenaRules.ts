import { RIVAL_NAMES } from "./boardBot";
import { mulberry32, seededShuffle } from "./random";
import { TEAMS, type TeamId } from "./teams";
import {
  BOT_NAMES,
  MAX_HP,
  POTION_HEAL,
  RESPAWN_PREFIX,
  SPECIAL_MAX,
  START_GEAR,
  WEAPONS,
  roundItems,
  type ArenaItem,
  type Gear,
  type ItemKind,
  type Strike,
  type WeaponId,
} from "./arenaSim";
import { MAP_IDS, getMap, pickMap, type ArenaMapId, type MapChoice } from "./arenaMaps";
import { DEFAULT_LOOK, botLook, validLook, type ArenaLook } from "./arenaProgress";

/**
 * Arena medieval's shared state and its rules, pure (no Firebase): every
 * change is a function `(state, …, now) → next state | null` that
 * lib/arena.ts runs inside a transaction (and the simulation script runs
 * directly). See lib/arena.ts for how the fight is shared between phones.
 *
 * Modes (`mode`, absent = «equipos»): red against blue by rounds; «todos»,
 * each for themselves by rounds (`roster` still says red/blue, alternating,
 * so older clients see two teams; the sides come from `sideOf`); «rey», one
 * long round holding the hill, falling means coming back after
 * `RESPAWN_MS`; «supervivencia», the people (red) against waves of bots
 * (blue) until everyone is down.
 */

export const COUNTDOWN_MS = 3500;
/** A round with nobody winning ends on time: the team with more health left wins it. */
export const ROUND_SECONDS = 150;
/** «Rey de la colina»: one round this long, or until a team holds the hill `HILL_TARGET` seconds. */
export const REY_SECONDS = 180;
export const HILL_TARGET = 45;
/** «Rey de la colina»: back on your feet this long after falling. */
export const RESPAWN_MS = 4000;
/** «Supervivencia»: the pause between waves. */
export const WAVE_PAUSE_MS = 6000;
/** How long the round's result stays on screen. */
export const ROUND_END_MS = 4500;
export const SIZE_OPTIONS = [1, 2, 3] as const;
/** «Todos contra todos»: how many knights. */
export const FFA_OPTIONS = [3, 4, 6, 8] as const;
/** «Supervivencia»: people defending, at most. */
export const SURVIVAL_MAX = 4;
/** Rounds to win the match: best of 3 or 5. */
export const WINS_OPTIONS = [2, 3] as const;
/** A potion comes back to its place this long after being taken. */
export const POTION_RESPAWN_MS = 20000;
/** Regeneration: starts this long after the last hit taken, a few points at a time. */
export const REGEN_DELAY_MS = 6000;
export const REGEN_STEP = 4;
export const REGEN_EVERY_MS = 1000;
/** A fall (or a trap) this soon after someone's blow counts as their knockout. */
export const FALL_CREDIT_MS = 6000;
/** Hits written by the map (traps, falls, arrow rain, the ring), not a fighter. */
export const ENV = "~";

export type ArenaStatus = "waiting" | "fighting" | "roundEnd" | "finished";
export type ArenaMode = "equipos" | "todos" | "rey" | "supervivencia";
export const MODES: ArenaMode[] = ["equipos", "todos", "rey", "supervivencia"];

export const MODE_INFO: Record<ArenaMode, { label: string; hint: string }> = {
  equipos: { label: "Equipos", hint: "Rojo contra azul por rondas: gana la ronda el equipo que queda en pie." },
  todos: { label: "Todos contra todos", hint: "Cada uno por su cuenta (de 3 a 8 caballeros): gana la ronda el último en pie." },
  rey: {
    label: "Rey de la colina",
    hint: `Hay que quedarse en la zona del centro: cada segundo que tu equipo la tiene solo suma un punto. Gana el primero en llegar a ${HILL_TARGET}. Si caes, vuelves a los pocos segundos.`,
  },
  supervivencia: {
    label: "Supervivencia",
    hint: `Todos juntos (hasta ${SURVIVAL_MAX}) contra oleadas de bots cada vez más fuertes. Entre oleadas se cura la vida y vuelven los caídos. ¿Cuántas aguantan?`,
  },
};

export interface ArenaMeta {
  game: "arena";
  hostId?: string;
  /** Fighters per team. */
  size: number;
  /** Rounds to win. */
  wins: number;
  /** Fill empty places with bots. */
  bots: boolean;
  /** Potions on the floor (they come back after a while). */
  potions: boolean;
  regen: boolean;
  /**
   * Where the fight is seen: each on their phone (default), or on a big
   * screen (`/arena-medieval/{id}/pantalla`, the authority) with the phones as pads.
   */
  view: ArenaView;
  /** Mode, map (or a different one each match) and mid-round events (absent on older rooms: equipos, coliseo, no). */
  mode: ArenaMode;
  map: MapChoice;
  events: boolean;
  /** «Todos contra todos»: how many knights. */
  ffa: number;
  /** A public arena (`ONLINE_WORLDS`). */
  online?: boolean;
  createdAt: number | object;
}

export type ArenaView = "telefono" | "pantalla";

export type ArenaSettings = Pick<ArenaMeta, "size" | "wins" | "bots" | "potions" | "regen" | "view" | "mode" | "map" | "events" | "ffa">;

export interface ArenaPlayer {
  name: string;
  color: string;
  /**
   * Optional (absent on older clients): the knight's look and level
   * (lib/arenaProgress.ts), and a hidden skill rating (`DEFAULT_RATING`
   * = new) that public arenas tune their bots to. Never shown.
   */
  look?: ArenaLook;
  lv?: number;
  sk?: number;
}

/** The last hit a fighter took, for its own phone to react (`n` counts them). */
export interface HitNote {
  n: number;
  /** Who: a fighter, or `ENV` (a trap, a fall, the rain, the ring). */
  from: string;
  /** Blocked, and the stamina it costs. */
  b: boolean;
  d: number;
  /** Where the attacker was (pushes the target away from there). */
  x: number;
  z: number;
  /** Server time of the hit (regeneration waits after it). */
  t: number;
  /**
   * Only when they apply (older clients ignore them): I parried it (`b` is
   * set too), a kick, my guard was knocked aside, part of a special, and the
   * knockback (m/s) and stagger (s) when not the usual.
   */
  pr?: 1;
  kk?: 1;
  g?: 1;
  sp?: 1;
  pw?: number;
  st?: number;
}

// How much the special meter fills (see `SPECIAL_MAX`).
/** Landing a clean blow, per point of damage (arrows: half). */
export const SPECIAL_PER_DAMAGE = 0.7;
/** A blow that landed on a guard, a kick that landed. */
export const SPECIAL_ON_BLOCKED = 3;
export const SPECIAL_ON_KICK = 5;
/** Stopping a blow with your guard, and with a perfect parry. */
export const SPECIAL_BLOCKING = 7;
export const SPECIAL_PARRY = 22;

export interface ArenaState {
  status: ArenaStatus;
  gameNo: number;
  round: number;
  /** Per match: lays out the weapons of each round, the map «al azar», the events. */
  seed: number;
  /** Rounds needed to win this match. */
  need: number;
  players: Record<string, ArenaPlayer>;
  /** Team each person picked in the waiting room (absent = watching; in «todos»/«supervivencia» just «fights»). */
  teams: Record<string, TeamId>;
  /** Fighters of this match (people and bots) and their team. */
  roster: Record<string, TeamId>;
  /** Bot names, by fighter id. */
  bots: Record<string, string>;
  /** Server time the round's fight starts (after the countdown). */
  startedAt: number;
  hp: Record<string, number>;
  gear: Record<string, Gear>;
  items: Record<string, ArenaItem>;
  itemSeq: number;
  /** Potions taken, back at their place at `at` (server time). */
  respawns: Record<string, ArenaItem & { at: number }>;
  /** This match's healing rules (copied from the room's settings). */
  potions: boolean;
  regen: boolean;
  /** Last regeneration tick per fighter (server time). */
  healAt: Record<string, number>;
  hits: Record<string, HitNote>;
  score: Record<TeamId, number>;
  roundWinner: TeamId | "draw" | "";
  roundEndedAt: number;
  winner: TeamId | "";
  /** This match's knockouts per fighter. */
  kills: Record<string, number>;
  /** The special meter per fighter (0–`SPECIAL_MAX`), kept through the rounds of a match. */
  special: Record<string, number>;
  /** Matches won per person. */
  wins: Record<string, number>;
  /**
   * A public arena (`ONLINE_WORLDS`): matches chain by themselves with
   * whoever is there, bots filling the places under people's names.
   */
  online: boolean;
  /** Online: when the next match may start (server time). */
  nextAt: number;

  // Added with the maps and modes (absent on older rooms).
  mode: ArenaMode;
  map: ArenaMapId;
  /** Mid-round events on (lib/arenaMaps.ts `roundEvents`). */
  events: boolean;
  /** «Todos»: rounds won per fighter, this round's winner ("" none) and the match's. */
  fscore: Record<string, number>;
  champ: string;
  champion: string;
  /** Knockouts this round (a «todos» round on time goes to the one with more). */
  rk: Record<string, number>;
  /** «Rey»: seconds each team held the hill alone, and the last second counted. */
  hill: Record<TeamId, number>;
  hillSec: number;
  /** «Rey»: when each fallen fighter fell (server time; back after `RESPAWN_MS`). */
  downAt: Record<string, number>;
  /** «Supervivencia»: the wave and when its bots come (server time). */
  wave: number;
  waveAt: number;
  /** Map damage already applied per fighter and source (the last tick), so each lands once. */
  env: Record<string, Record<string, number>>;
  /** Who last hit each fighter, and when (a fall or a trap soon after is their knockout). */
  by: Record<string, { f: string; t: number }>;
  /** The last event whose weapons already dropped (−1: none). */
  evDrop: number;

  // Added with the match summary and the bots' looks (absent on older rooms and clients).
  /** This match's damage dealt, blows stopped with the guard and perfect parries, per fighter. */
  dmg: Record<string, number>;
  blk: Record<string, number>;
  par: Record<string, number>;
  /** Bots' level (shown on their tag, like people's) and skill (`BotMind.skill`; absent = 1). */
  botLv: Record<string, number>;
  botSk: Record<string, number>;
}

/** A fighter's pose, written by whoever runs it. */
export interface ArenaPose {
  /** Round it belongs to (`roundKey`). */
  k: number;
  x: number;
  y: number;
  z: number;
  yw: number;
  pt: number;
  /** Act index (`ACTS`), the server time it started and how long it lasts, blocking, bow draw, walking speed. */
  a: number;
  at: number;
  al: number;
  /** Swing number in a combo (odd ones come from the other side), and running. */
  cb: number;
  rn: number;
  b: number;
  /** Server time the current block started, when it can still parry (0: it can't). Absent on older clients. */
  bt?: number;
  dr: number;
  sp: number;
  /** Server time of the sample. */
  t: number;
  /** A gesture (lib/arenaLooks.ts `EMOTES` index + 1) and the server time it started. Absent on older clients. */
  em?: number;
  et?: number;
}

/** An arrow in flight, for everyone else to draw. */
export interface ArenaArrow {
  k: number;
  o: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Server time it left the bow. */
  t: number;
}

export function roundKey(state: Pick<ArenaState, "gameNo" | "round">): number {
  return state.gameNo * 1000 + state.round;
}

const isMode = (m: unknown): m is ArenaMode => typeof m === "string" && (MODES as string[]).includes(m);

export function normalizeMeta(raw: Partial<ArenaMeta>): ArenaMeta {
  const map = raw.map === "azar" || (raw.map && (MAP_IDS as string[]).includes(raw.map)) ? raw.map : "coliseo";
  return {
    game: "arena",
    hostId: raw.hostId,
    size: Math.max(1, Math.min(3, raw.size ?? 1)),
    wins: raw.wins === 3 ? 3 : 2,
    bots: raw.bots ?? true,
    potions: raw.potions ?? true,
    regen: raw.regen ?? false,
    view: raw.view === "pantalla" ? "pantalla" : "telefono",
    mode: isMode(raw.mode) ? raw.mode : "equipos",
    map,
    events: raw.events ?? false,
    ffa: (FFA_OPTIONS as readonly number[]).includes(raw.ffa ?? 0) ? raw.ffa! : 4,
    createdAt: raw.createdAt ?? 0,
  };
}

function normalizeGear(raw: Partial<Gear> | undefined): Gear {
  // A weapon this version doesn't know (a newer client's) counts as the dagger.
  return { w: raw?.w && raw.w in WEAPONS ? raw.w : START_GEAR.w, sh: !!raw?.sh };
}

export function normalizeState(raw: Partial<ArenaState> | null): ArenaState | null {
  if (!raw || !raw.status) return null;
  const gear: Record<string, Gear> = {};
  for (const [id, g] of Object.entries(raw.gear ?? {})) gear[id] = normalizeGear(g);
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    round: raw.round ?? 0,
    seed: raw.seed ?? 0,
    need: raw.need ?? 2,
    players: raw.players ?? {},
    teams: raw.teams ?? {},
    roster: raw.roster ?? {},
    bots: raw.bots ?? {},
    startedAt: raw.startedAt ?? 0,
    hp: raw.hp ?? {},
    gear,
    items: raw.items ?? {},
    itemSeq: raw.itemSeq ?? 0,
    respawns: raw.respawns ?? {},
    potions: raw.potions ?? false,
    regen: raw.regen ?? false,
    healAt: raw.healAt ?? {},
    hits: raw.hits ?? {},
    score: { red: raw.score?.red ?? 0, blue: raw.score?.blue ?? 0 },
    roundWinner: raw.roundWinner ?? "",
    roundEndedAt: raw.roundEndedAt ?? 0,
    winner: raw.winner ?? "",
    kills: raw.kills ?? {},
    special: raw.special ?? {},
    wins: raw.wins ?? {},
    online: raw.online ?? false,
    nextAt: raw.nextAt ?? 0,
    mode: isMode(raw.mode) ? raw.mode : "equipos",
    map: getMap(raw.map).id,
    events: raw.events ?? false,
    fscore: raw.fscore ?? {},
    champ: raw.champ ?? "",
    champion: raw.champion ?? "",
    rk: raw.rk ?? {},
    hill: { red: raw.hill?.red ?? 0, blue: raw.hill?.blue ?? 0 },
    hillSec: raw.hillSec ?? 0,
    downAt: raw.downAt ?? {},
    wave: raw.wave ?? 0,
    waveAt: raw.waveAt ?? 0,
    env: raw.env ?? {},
    by: raw.by ?? {},
    evDrop: raw.evDrop ?? -1,
    dmg: raw.dmg ?? {},
    blk: raw.blk ?? {},
    par: raw.par ?? {},
    botLv: raw.botLv ?? {},
    botSk: raw.botSk ?? {},
  };
}

export const isBot = (id: string) => id.startsWith("bot");

export function fighterName(state: ArenaState, id: string, myId = ""): string {
  if (id === myId) return "Tú";
  return state.bots[id] ?? state.players[id]?.name ?? "Caballero";
}

/** The side a fighter fights for: its team, or itself in «todos». */
export function sideOf(state: Pick<ArenaState, "mode" | "roster">, id: string): string {
  return state.mode === "todos" ? id : (state.roster[id] ?? "red");
}

/** A team's fighters, people first, in a fixed order (it decides where each one starts). */
export function teamFighters(state: Pick<ArenaState, "roster">, team: TeamId): string[] {
  return Object.keys(state.roster)
    .filter((id) => state.roster[id] === team)
    .sort((a, b) => Number(isBot(a)) - Number(isBot(b)) || a.localeCompare(b));
}

/** Every fighter, people first, in a fixed order («todos»: its starting spot and color). */
export function allFighters(state: Pick<ArenaState, "roster">): string[] {
  return Object.keys(state.roster).sort((a, b) => Number(isBot(a)) - Number(isBot(b)) || a.localeCompare(b));
}

export function alive(state: ArenaState, id: string): boolean {
  return id in state.roster && (state.hp[id] ?? 0) > 0;
}

export const teamInfo = (id: TeamId) => TEAMS.find((t) => t.id === id) ?? TEAMS[0];

/** «Todos contra todos»: each knight's own color (by its place in `allFighters`). */
export const FFA_COLORS = ["#fb3a5d", "#22d3ee", "#facc15", "#4ade80", "#c084fc", "#fb923c", "#f472b6", "#e2e8f0"];

/** The color a fighter is shown with: its team's, or its own in «todos». */
export function fighterColor(state: ArenaState, id: string): string {
  if (state.mode === "todos") {
    const i = allFighters(state).indexOf(id);
    return FFA_COLORS[(i < 0 ? 0 : i) % FFA_COLORS.length];
  }
  return teamInfo(state.roster[id] ?? "red").color;
}

/** How long a round may last (s); «supervivencia» has no clock. */
export function roundSeconds(state: Pick<ArenaState, "mode">): number {
  return state.mode === "rey" ? REY_SECONDS : state.mode === "supervivencia" ? Infinity : ROUND_SECONDS;
}

/** Where a fighter starts the round (or comes back), facing the middle. */
export function spawnOf(state: ArenaState, id: string): { side: string; team: TeamId; index: number; count: number; ffa: boolean } {
  const team = state.roster[id] ?? "red";
  if (state.mode === "todos") {
    const all = allFighters(state);
    return { side: id, team, index: all.indexOf(id), count: all.length, ffa: true };
  }
  const list = teamFighters(state, team);
  return { side: team, team, index: list.indexOf(id), count: list.length, ffa: false };
}

// ---- The waiting room --------------------------------------------------------------

function teamCount(s: ArenaState, team: TeamId): number {
  return Object.values(s.teams).filter((t) => t === team).length;
}

/** Room for one more on `team` (in «todos»/«supervivencia», room in the whole match). */
function hasRoom(s: ArenaState, team: TeamId, meta: Pick<ArenaMeta, "mode" | "size" | "ffa">): boolean {
  const total = Object.keys(s.teams).length;
  if (meta.mode === "todos") return total < meta.ffa;
  if (meta.mode === "supervivencia") return total < SURVIVAL_MAX;
  return teamCount(s, team) < meta.size;
}

/** Registers the player and, before the match, puts them on the team with fewer people (if there's room). */
export function joinState(s: ArenaState, clientId: string, player: ArenaPlayer, meta: Pick<ArenaMeta, "mode" | "size" | "ffa">): ArenaState | null {
  const known = s.players[clientId];
  const red = teamCount(s, "red");
  const blue = teamCount(s, "blue");
  const want: TeamId = meta.mode === "supervivencia" || red <= blue ? "red" : "blue";
  const other: TeamId = want === "red" ? "blue" : "red";
  const team: TeamId | null = hasRoom(s, want, meta) ? want : meta.mode === "supervivencia" ? null : hasRoom(s, other, meta) ? other : null;
  const assign = s.status === "waiting" && !s.teams[clientId] && !known && team;
  const same =
    known?.name === player.name &&
    known?.color === player.color &&
    JSON.stringify(known?.look ?? null) === JSON.stringify(player.look ?? null) &&
    known?.lv === player.lv &&
    known?.sk === player.sk;
  if (!assign && same) return null;
  return {
    ...s,
    players: { ...s.players, [clientId]: player },
    teams: assign ? { ...s.teams, [clientId]: team } : s.teams,
  };
}

/** Picks a team (null = just watch), while waiting, if it has room. */
export function chooseTeamState(s: ArenaState, clientId: string, team: TeamId | null, meta: Pick<ArenaMeta, "mode" | "size" | "ffa">): ArenaState | null {
  if (s.status !== "waiting" || s.teams[clientId] === (team ?? undefined)) return null;
  const without = { ...s, teams: { ...s.teams } };
  delete without.teams[clientId];
  if (team && !hasRoom(without, team, meta)) return null;
  const teams = without.teams;
  if (team) teams[clientId] = team;
  return { ...s, teams };
}

/** Everyone connected, split into two even teams at random. */
export function shuffleState(s: ArenaState, connected: string[], size: number, rand: () => number = Math.random): ArenaState | null {
  if (s.status !== "waiting") return null;
  const ids = connected.filter((id) => s.players[id]).sort(() => rand() - 0.5).slice(0, size * 2);
  const teams: Record<string, TeamId> = {};
  ids.forEach((id, i) => (teams[id] = i % 2 ? "blue" : "red"));
  return { ...s, teams };
}

// ---- Rounds --------------------------------------------------------------------------

/** «Supervivencia»: the bots of wave `w` for `people` defenders: more and better armed each time. */
const WAVE_NAMES = ["Bandido", "Saqueador", "Mercenario", "Bárbaro", "Desertor", "Caballero negro"];
export function waveSize(w: number, people: number): number {
  return Math.max(1, Math.min(8, people + w - 2));
}
export function waveHp(w: number): number {
  return Math.min(MAX_HP, 40 + w * 12);
}
/** How sharp a wave's bots are (`BotMind.skill`). */
export function waveSkill(w: number): number {
  return Math.min(1, 0.35 + w * 0.13);
}
function waveGear(w: number, i: number, rand: () => number): Gear {
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  if (w <= 1) return { w: "daga", sh: false };
  if (w === 2) return { w: i % 3 === 2 ? "lanza" : "espada", sh: false };
  const archer = i % 4 === 3;
  if (archer) return { w: "arco", sh: false };
  const heavy: WeaponId[] = w >= 5 ? ["hacha", "martillo", "mangual", "maza"] : ["espada", "maza", "lanza", "mangual"];
  return { w: pick(heavy), sh: w >= 4 && rand() < 0.5 };
}

/** The bots of the next wave come in (the fallen ones leave); people heal, and the fallen get up. */
function addWave(s: ArenaState, wave: number, now: number, first = false): ArenaState {
  const roster = { ...s.roster };
  const hp = { ...s.hp };
  const gear = { ...s.gear };
  const bots = { ...s.bots };
  for (const id of Object.keys(roster)) {
    if (roster[id] === "blue" && (hp[id] ?? 0) <= 0) {
      delete roster[id];
      delete hp[id];
      delete gear[id];
      delete bots[id];
    }
  }
  const people = Object.keys(roster).filter((id) => roster[id] === "red");
  if (!first) {
    for (const id of people) hp[id] = (hp[id] ?? 0) > 0 ? Math.min(MAX_HP, hp[id] + 30) : 50;
  }
  const rand = mulberry32((s.seed ^ Math.imul(wave + 3, 0x45d9f3b)) >>> 0);
  const n = waveSize(wave, people.length);
  for (let i = 0; i < n; i++) {
    const id = `bot${wave}w${i}`;
    roster[id] = "blue";
    hp[id] = waveHp(wave);
    gear[id] = waveGear(wave, i, rand);
    bots[id] = WAVE_NAMES[(wave + i) % WAVE_NAMES.length];
  }
  return { ...s, roster, hp, gear, bots, wave, waveAt: first ? s.startedAt : now + WAVE_PAUSE_MS, downAt: {} };
}

export function setupRound(s: ArenaState, round: number, now: number): ArenaState {
  const hp: Record<string, number> = {};
  const gear: Record<string, Gear> = {};
  for (const id of Object.keys(s.roster)) {
    hp[id] = MAX_HP;
    gear[id] = { ...START_GEAR };
  }
  const next: ArenaState = {
    ...s,
    status: "fighting",
    round,
    startedAt: now + COUNTDOWN_MS,
    hp,
    gear,
    items: roundItems(s.seed, round, s.potions, getMap(s.map)),
    itemSeq: 0,
    respawns: {},
    healAt: {},
    hits: {},
    roundWinner: "",
    roundEndedAt: 0,
    champ: "",
    rk: {},
    hill: { red: 0, blue: 0 },
    hillSec: 0,
    downAt: {},
    env: {},
    by: {},
    evDrop: -1,
  };
  return next.mode === "supervivencia" ? addWave(next, 1, now, true) : next;
}

/**
 * Starts a match. «equipos»/«rey»: the connected people on each team (at
 * most `size` each) plus bots to fill the places when `bots` is on; each
 * team needs somebody. «todos»: everyone fighting (up to `ffa`) plus bots up
 * to `ffa`. «supervivencia»: everyone fighting (up to `SURVIVAL_MAX`) against
 * the first wave. At least one person has to fight.
 */
export function startMatchState(s: ArenaState, settings: ArenaSettings, connected: string[], now: number, seed: number): ArenaState | null {
  if (s.status !== "waiting" && s.status !== "finished") return null;
  const roster: Record<string, TeamId> = {};
  const bots: Record<string, string> = {};
  const mode = settings.mode ?? "equipos";
  const fighting = Object.keys(s.teams).filter((id) => connected.includes(id)).sort();
  if (mode === "todos") {
    const people = fighting.slice(0, settings.ffa);
    people.forEach((id, i) => (roster[id] = i % 2 ? "blue" : "red"));
    const total = settings.bots ? Math.max(settings.ffa, people.length) : people.length;
    for (let k = people.length; k < total; k++) {
      const id = `bot${k - people.length}`;
      bots[id] = BOT_NAMES[(k - people.length) % BOT_NAMES.length];
      roster[id] = k % 2 ? "blue" : "red";
    }
    if (!people.length || Object.keys(roster).length < 2) return null;
  } else if (mode === "supervivencia") {
    for (const id of fighting.slice(0, SURVIVAL_MAX)) roster[id] = "red";
    if (!Object.keys(roster).length) return null;
  } else {
    let botNo = 0;
    for (const team of ["red", "blue"] as TeamId[]) {
      const people = Object.keys(s.teams)
        .filter((id) => s.teams[id] === team && connected.includes(id))
        .slice(0, settings.size);
      for (const id of people) roster[id] = team;
      if (settings.bots) {
        for (let k = people.length; k < settings.size; k++) {
          const id = `bot${botNo}`;
          bots[id] = BOT_NAMES[botNo % BOT_NAMES.length];
          roster[id] = team;
          botNo++;
        }
      }
    }
    const ids = Object.keys(roster);
    if (!ids.some((id) => !isBot(id)) || !ids.some((id) => roster[id] === "red") || !ids.some((id) => roster[id] === "blue")) return null;
  }
  const next: ArenaState = {
    ...s,
    gameNo: s.gameNo + 1,
    seed,
    need: mode === "rey" || mode === "supervivencia" ? 1 : settings.wins,
    potions: settings.potions,
    regen: settings.regen,
    roster,
    bots,
    score: { red: 0, blue: 0 },
    kills: {},
    special: {},
    dmg: {},
    blk: {},
    par: {},
    botLv: botLevels(Object.keys(bots), seed, 1, 12),
    botSk: {},
    winner: "",
    mode,
    map: pickMap(settings.map, seed),
    events: !!settings.events,
    fscore: {},
    champion: "",
    wave: 0,
    waveAt: 0,
  };
  return setupRound(next, 1, now);
}

/** Whether the round is over (by the mode's rules); if so, its result. */
function checkRoundEnd(s: ArenaState, now: number): ArenaState {
  if (s.status !== "fighting") return s;
  const ids = Object.keys(s.roster);
  const up = (id: string) => (s.hp[id] ?? 0) > 0;
  if (s.mode === "todos") {
    const standing = ids.filter(up);
    if (standing.length > 1) return s;
    return endFfaRound(s, standing[0] ?? "", now);
  }
  if (s.mode === "rey") return s;
  const red = ids.some((id) => s.roster[id] === "red" && up(id));
  const blue = ids.some((id) => s.roster[id] === "blue" && up(id));
  if (s.mode === "supervivencia") {
    if (!red) return endRound(s, "blue", now);
    if (!blue) return addWave(s, s.wave + 1, now);
    return s;
  }
  if (red && blue) return s;
  return endRound(s, red ? "red" : blue ? "blue" : "draw", now);
}

function endRound(s: ArenaState, winner: TeamId | "draw", now: number): ArenaState {
  const score = { ...s.score };
  if (winner !== "draw") score[winner] += 1;
  return { ...s, status: "roundEnd", roundWinner: winner, roundEndedAt: now, score };
}

/** «Todos»: `champ` (or nobody) takes the round. `roundWinner` gets its roster color, for older clients. */
function endFfaRound(s: ArenaState, champ: string, now: number): ArenaState {
  const fscore = { ...s.fscore };
  if (champ) fscore[champ] = (fscore[champ] ?? 0) + 1;
  return { ...s, status: "roundEnd", roundWinner: champ ? s.roster[champ] : "draw", champ, roundEndedAt: now, fscore };
}

/** Drops what a fallen (or switching) fighter carried as items at (x, z). */
function dropGear(s: ArenaState, items: Record<string, ArenaItem>, gear: Gear, x: number, z: number): number {
  let seq = s.itemSeq;
  const drop = (kind: ItemKind, dx: number) => {
    items[`d${seq++}`] = { kind, x: Math.round((x + dx) * 100) / 100, z: Math.round(z * 100) / 100 };
  };
  if (gear.w !== "daga") drop(gear.w, -0.4);
  if (gear.sh) drop("escudo", 0.4);
  return seq;
}

export function inRound(s: ArenaState, key: number, now: number): boolean {
  return s.status === "fighting" && roundKey(s) === key && now >= s.startedAt - 300;
}

/** «Supervivencia»: the next wave's bots wait at their gate, untouchable, until it starts. */
function resting(s: ArenaState, id: string, now: number): boolean {
  return s.mode === "supervivencia" && s.roster[id] === "blue" && now < s.waveAt;
}

/**
 * `id` falls: its health to 0, a knockout for `killer` (if an enemy), the time
 * («rey»: it comes back later, unless `stays`), and its weapons on the floor
 * at `drop` (none when it fell into the void).
 */
function knockOut(s: ArenaState, id: string, killer: string | null, now: number, drop: { x: number; z: number } | null, stays = false): ArenaState {
  const hp = { ...s.hp, [id]: 0 };
  let { kills, rk, downAt, items, itemSeq } = s;
  if (killer && killer !== id && killer in s.roster && sideOf(s, killer) !== sideOf(s, id)) {
    kills = { ...kills, [killer]: (kills[killer] ?? 0) + 1 };
    rk = { ...rk, [killer]: (rk[killer] ?? 0) + 1 };
  }
  if (s.mode === "rey" && !stays) downAt = { ...downAt, [id]: now };
  if (drop) {
    items = { ...items };
    itemSeq = dropGear(s, items, s.gear[id] ?? START_GEAR, drop.x, drop.z);
  }
  return { ...s, hp, kills, rk, downAt, items, itemSeq };
}

/** Whoever hit `id` last, if it was recent enough to count a fall or a trap as theirs. */
function creditFor(s: ArenaState, id: string, now: number): string | null {
  const b = s.by[id];
  return b && now - b.t < FALL_CREDIT_MS ? b.f : null;
}

/**
 * `attacker`'s swing (or arrow) hit these targets. Each one must still be
 * standing and on another side; `where` is where each target was (to drop
 * its weapons if it falls).
 */
export function strikeState(
  s0: ArenaState,
  key: number,
  attacker: string,
  attackerAt: { x: number; z: number },
  strikes: (Strike & { x: number; z: number })[],
  ranged: boolean,
  now: number
): ArenaState | null {
  if (!inRound(s0, key, now)) return null;
  // An arrow still counts if its shooter fell while it flew.
  if (!(attacker in s0.roster) || (!ranged && !alive(s0, attacker))) return null;
  let s: ArenaState = { ...s0, hp: { ...s0.hp }, hits: { ...s0.hits }, special: { ...s0.special }, by: { ...s0.by }, dmg: { ...s0.dmg }, blk: { ...s0.blk }, par: { ...s0.par } };
  const fill = (id: string, amount: number) => {
    if (amount > 0) s.special[id] = Math.min(SPECIAL_MAX, Math.round((s.special[id] ?? 0) + amount));
  };
  let changed = false;
  for (const st of strikes) {
    const t = st.target;
    if (!alive(s, t) || sideOf(s, t) === sideOf(s, attacker) || resting(s, t, now)) continue;
    changed = true;
    const damage = st.parried ? 0 : Math.max(0, Math.round(st.damage));
    const left = Math.max(0, (s.hp[t] ?? 0) - damage);
    const took = (s.hp[t] ?? 0) - left;
    if (took > 0) s.dmg[attacker] = (s.dmg[attacker] ?? 0) + took;
    if (st.parried) s.par[t] = (s.par[t] ?? 0) + 1;
    else if (st.blocked) s.blk[t] = (s.blk[t] ?? 0) + 1;
    s.hp[t] = left;
    const note: HitNote = {
      n: (s.hits[t]?.n ?? 0) + 1,
      from: attacker,
      b: st.blocked || !!st.parried,
      d: st.parried ? 0 : Math.round(st.drain),
      x: Math.round(attackerAt.x * 100) / 100,
      z: Math.round(attackerAt.z * 100) / 100,
      t: Math.round(now),
    };
    // Only the fields that apply (the database takes no undefined).
    if (st.parried) note.pr = 1;
    if (st.kick) note.kk = 1;
    if (st.guardBreak) note.g = 1;
    if (st.special) note.sp = 1;
    if (st.push !== undefined) note.pw = Math.round(st.push * 10) / 10;
    if (st.stagger !== undefined) note.st = Math.round(st.stagger * 100) / 100;
    s.hits[t] = note;
    if (!st.parried) s.by[t] = { f: attacker, t: Math.round(now) };
    // The meter: the defender for a guard or a parry, the attacker for what it landed (specials don't count).
    if (st.parried) fill(t, SPECIAL_PARRY);
    else if (st.blocked) fill(t, SPECIAL_BLOCKING);
    if (!st.special && !st.parried) {
      if (st.kick) fill(attacker, SPECIAL_ON_KICK);
      else if (st.blocked) fill(attacker, SPECIAL_ON_BLOCKED);
      else fill(attacker, damage * SPECIAL_PER_DAMAGE * (ranged ? 0.5 : 1));
    }
    if (left === 0) s = knockOut(s, t, attacker, now, { x: st.x, z: st.z });
  }
  if (!changed) return null;
  return checkRoundEnd(s, now);
}

/** A special starts: its meter must be full, and empties. */
export function spendSpecialState(s: ArenaState, key: number, id: string, now: number): ArenaState | null {
  if (!inRound(s, key, now) || !alive(s, id) || (s.special[id] ?? 0) < SPECIAL_MAX) return null;
  return { ...s, special: { ...s.special, [id]: 0 } };
}

/** A fighter whose player left falls where it was (its weapons stay there; in «rey» it doesn't come back). */
export function forfeitState(s: ArenaState, key: number, id: string, x: number, z: number, now: number): ArenaState | null {
  if (s.status !== "fighting" || roundKey(s) !== key || !alive(s, id)) return null;
  return checkRoundEnd(knockOut(s, id, null, now, { x, z }, true), now);
}

/**
 * Damage from the map (a trap, the arrow rain, outside the ring), written by
 * whoever runs that fighter: once per source `src` and tick `tag` (the
 * guard keeps the last tag), as a hit from `ENV`. A knockout counts for
 * whoever hit it last, if recent.
 */
export function envHitState(s: ArenaState, key: number, id: string, src: string, tag: number, damage: number, x: number, z: number, now: number): ArenaState | null {
  if (!inRound(s, key, now) || now < s.startedAt || !alive(s, id) || resting(s, id, now)) return null;
  const mine = s.env[id] ?? {};
  if ((mine[src] ?? -Infinity) >= tag) return null;
  const left = Math.max(0, (s.hp[id] ?? 0) - Math.max(0, Math.round(damage)));
  const note: HitNote = { n: (s.hits[id]?.n ?? 0) + 1, from: ENV, b: false, d: 0, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, t: Math.round(now) };
  let next: ArenaState = { ...s, hp: { ...s.hp, [id]: left }, hits: { ...s.hits, [id]: note }, env: { ...s.env, [id]: { ...mine, [src]: tag } } };
  if (left === 0) next = knockOut(next, id, creditFor(s, id, now), now, { x, z });
  return checkRoundEnd(next, now);
}

/** `id` fell off the map (the bridge): out (a knockout for whoever hit it last, if recent); its weapons are lost. */
export function fallState(s: ArenaState, key: number, id: string, now: number): ArenaState | null {
  if (!inRound(s, key, now) || !alive(s, id)) return null;
  return checkRoundEnd(knockOut(s, id, creditFor(s, id, now), now, null), now);
}

/** «Rey»: `id` gets up again (full health, a dagger) `RESPAWN_MS` after falling. */
export function respawnState(s: ArenaState, key: number, id: string, now: number): ArenaState | null {
  if (s.mode !== "rey" || !inRound(s, key, now) || !(id in s.roster) || (s.hp[id] ?? 0) > 0) return null;
  const at = s.downAt[id];
  if (at === undefined || now < at + RESPAWN_MS) return null;
  const downAt = { ...s.downAt };
  delete downAt[id];
  return { ...s, hp: { ...s.hp, [id]: MAX_HP }, gear: { ...s.gear, [id]: { ...START_GEAR } }, downAt };
}

/** «Rey»: second `sec` of the round, `holder` (a team) had the hill alone: a point (each second counts once). */
export function hillTickState(s: ArenaState, key: number, sec: number, holder: string, now: number): ArenaState | null {
  if (s.mode !== "rey" || !inRound(s, key, now) || now < s.startedAt || sec <= s.hillSec) return null;
  if (holder !== "red" && holder !== "blue") return null;
  const hill = { ...s.hill, [holder]: s.hill[holder] + 1 };
  const next = { ...s, hill, hillSec: sec };
  return hill[holder] >= HILL_TARGET ? endRound(next, holder, now) : next;
}

/** «La tribuna tira armas»: event `n`'s weapons land (once). */
export function eventItemsState(s: ArenaState, key: number, n: number, drop: Record<string, ArenaItem>, now: number): ArenaState | null {
  if (!inRound(s, key, now) || s.evDrop >= n) return null;
  return { ...s, items: { ...s.items, ...drop }, evDrop: n };
}

/**
 * Picks up an item: a shield goes in the other hand, a weapon replaces the
 * one in hand (which is left on the floor at (x, z), unless it's the dagger),
 * a potion is drunk on the spot (only when hurt) and comes back later.
 */
export function pickItemState(s: ArenaState, key: number, id: string, itemId: string, x: number, z: number, now: number): ArenaState | null {
  if (!inRound(s, key, now) || !alive(s, id)) return null;
  const item = s.items[itemId];
  if (!item) return null;
  const gear = s.gear[id] ?? START_GEAR;
  const items = { ...s.items };
  delete items[itemId];
  let itemSeq = s.itemSeq;
  if (item.kind === "pocion") {
    const hp = s.hp[id] ?? 0;
    if (hp >= MAX_HP) return null;
    const respawns = itemId.startsWith(RESPAWN_PREFIX) ? { ...s.respawns, [itemId]: { ...item, at: now + POTION_RESPAWN_MS } } : s.respawns;
    return { ...s, items, respawns, hp: { ...s.hp, [id]: Math.min(MAX_HP, hp + POTION_HEAL) } };
  }
  let next: Gear;
  if (item.kind === "escudo") {
    if (gear.sh) return null;
    next = { ...gear, sh: true };
  } else {
    if (gear.w !== "daga") itemSeq = dropGear(s, items, { w: gear.w, sh: false }, x, z);
    next = { ...gear, w: item.kind };
  }
  return { ...s, items, itemSeq, gear: { ...s.gear, [id]: next } };
}

/** Potions whose time came are back at their places. */
export function respawnItemsState(s: ArenaState, key: number, now: number): ArenaState | null {
  if (!inRound(s, key, now)) return null;
  const due = Object.entries(s.respawns).filter(([, r]) => r.at <= now);
  if (!due.length) return null;
  const items = { ...s.items };
  const respawns = { ...s.respawns };
  for (const [id, { kind, x, z }] of due) {
    items[id] = { kind, x, z };
    delete respawns[id];
  }
  return { ...s, items, respawns };
}

/** Regeneration (when the match has it): a few points back, if `id` hasn't been hit for a while. */
export function regenerateState(s: ArenaState, key: number, id: string, now: number): ArenaState | null {
  if (!s.regen || !inRound(s, key, now) || !alive(s, id)) return null;
  const hp = s.hp[id] ?? 0;
  if (hp >= MAX_HP || now - (s.hits[id]?.t ?? 0) < REGEN_DELAY_MS || now - (s.healAt[id] ?? 0) < REGEN_EVERY_MS - 100) return null;
  return { ...s, hp: { ...s.hp, [id]: Math.min(MAX_HP, hp + REGEN_STEP) }, healAt: { ...s.healAt, [id]: now } };
}

/**
 * Out of time. «equipos»: the team with more health left (equal = nobody);
 * «todos»: whoever standing knocked out more this round, then more health;
 * «rey»: more time on the hill (then health).
 */
export function timeoutState(s: ArenaState, key: number, now: number): ArenaState | null {
  if (s.status !== "fighting" || roundKey(s) !== key || now < s.startedAt + roundSeconds(s) * 1000) return null;
  const ids = Object.keys(s.roster);
  if (s.mode === "todos") {
    const standing = ids.filter((id) => (s.hp[id] ?? 0) > 0);
    const rank = (id: string) => (s.rk[id] ?? 0) * 1000 + (s.hp[id] ?? 0);
    standing.sort((a, b) => rank(b) - rank(a));
    const best = standing[0] ?? "";
    const tie = standing.length > 1 && rank(standing[1]) === rank(best);
    return endFfaRound(s, tie ? "" : best, now);
  }
  const total = (team: TeamId) => ids.filter((id) => s.roster[id] === team).reduce((sum, id) => sum + (s.hp[id] ?? 0), 0);
  if (s.mode === "rey" && s.hill.red !== s.hill.blue) return endRound(s, s.hill.red > s.hill.blue ? "red" : "blue", now);
  const red = total("red");
  const blue = total("blue");
  return endRound(s, red > blue ? "red" : blue > red ? "blue" : "draw", now);
}

/** After a round's result: the next round, or the end of the match. */
export function nextRoundState(s: ArenaState, key: number, now: number, onlineNextMs: number): ArenaState | null {
  if (s.status !== "roundEnd" || roundKey(s) !== key || now < s.roundEndedAt + ROUND_END_MS - 300) return null;
  if (s.mode === "todos") {
    const champ = Object.keys(s.fscore).find((id) => s.fscore[id] >= s.need && id in s.roster);
    if (!champ) return setupRound(s, s.round + 1, now);
    const wins = { ...s.wins };
    if (!isBot(champ)) wins[champ] = (wins[champ] ?? 0) + 1;
    return { ...s, status: "finished", winner: s.roster[champ], champion: champ, wins, nextAt: now + onlineNextMs };
  }
  const champion = (["red", "blue"] as TeamId[]).find((t) => s.score[t] >= s.need);
  if (!champion) return setupRound(s, s.round + 1, now);
  const wins = { ...s.wins };
  if (s.mode !== "supervivencia") {
    for (const id of Object.keys(s.roster)) {
      if (s.roster[id] === champion && !isBot(id)) wins[id] = (wins[id] ?? 0) + 1;
    }
  }
  return { ...s, status: "finished", winner: champion, wins, nextAt: now + onlineNextMs };
}

/** «Supervivencia»: waves survived (the one that beat them doesn't count). */
export function wavesSurvived(s: ArenaState): number {
  return Math.max(0, s.wave - 1);
}

/** «Todos»: the final ranking, best first (rounds won, then knockouts), with shared places. */
export function ffaRanking(s: ArenaState): { id: string; place: number }[] {
  const score = (id: string) => (s.fscore[id] ?? 0) * 1000 + (s.kills[id] ?? 0);
  const ids = Object.keys(s.roster).sort((a, b) => score(b) - score(a) || a.localeCompare(b));
  return ids.map((id) => ({ id, place: ids.filter((o) => score(o) > score(id)).length + 1 }));
}

/**
 * My result for the ranking once the match is over (null before, or if I
 * didn't fight). Teams: 1st or 2nd of two; «todos»: my place among
 * everyone; «supervivencia»: no place (co-op).
 */
export function awardOutcome(s: ArenaState, myId: string): { place: number | null; players: number; vsBotsOnly: boolean } | null {
  if (s.status !== "finished" || !(myId in s.roster)) return null;
  const ids = Object.keys(s.roster);
  // Public arenas' bots pass for people: they count like anyone there.
  const rivalsBots = (rivals: string[]) => !s.online && rivals.every(isBot);
  if (s.mode === "supervivencia") {
    return { place: null, players: ids.filter((id) => !isBot(id)).length, vsBotsOnly: !s.online };
  }
  if (s.mode === "todos") {
    const me = ffaRanking(s).find((r) => r.id === myId);
    return { place: me?.place ?? null, players: ids.length, vsBotsOnly: rivalsBots(ids.filter((id) => id !== myId)) };
  }
  if (!s.winner) return null;
  const team = s.roster[myId];
  return { place: team === s.winner ? 1 : 2, players: 2, vsBotsOnly: rivalsBots(ids.filter((id) => s.roster[id] !== team)) };
}

// ---- Public arenas -------------------------------------------------------------------

/** After a public match, the results show this long before the next one. */
export const ONLINE_NEXT_MS = 9000;
export const ONLINE_MAX_PEOPLE = 6;
const ONLINE_WINS = 2;

/**
 * A public arena's next match with the people `connected` now: a mode
 * (mostly «equipos», «todos» or «rey»; alone, sometimes «supervivencia») and
 * a map at random, events on, bots under people's names filling the places.
 */
export function nextOnlineState(s: ArenaState, connected: string[], now: number, seed: number): ArenaState | null {
  if (!s.online) return null;
  // A battle in progress only gives way when none of its people is still here (only bots left fighting).
  const inProgress = s.status === "fighting" || s.status === "roundEnd";
  if (inProgress && Object.keys(s.roster).some((id) => !isBot(id) && connected.includes(id))) return null;
  if (s.status === "finished" && now < s.nextAt) return null;
  const people = seededShuffle(connected.filter((id) => s.players[id] && !isBot(id)), seed).slice(0, ONLINE_MAX_PEOPLE);
  if (!people.length) return null;
  const rand = mulberry32(seed ^ 0x2545f491);
  const r = rand();
  const mode: ArenaMode = people.length === 1 && r < 0.15 ? "supervivencia" : r < 0.5 ? "equipos" : r < 0.78 ? "todos" : "rey";
  const map = MAP_IDS[Math.floor(rand() * MAP_IDS.length)];
  // Bots under people's names, never the name of someone here.
  const taken = new Set(people.map((id) => s.players[id]?.name.trim().toLowerCase()));
  const names = seededShuffle(RIVAL_NAMES, seed + 1).filter((n) => !taken.has(n.toLowerCase()));
  const roster: Record<string, TeamId> = {};
  const bots: Record<string, string> = {};
  if (mode === "supervivencia") {
    for (const id of people) roster[id] = "red";
  } else if (mode === "todos") {
    const total = Math.max(4, Math.min(6, people.length + 2));
    people.forEach((id, i) => (roster[id] = i % 2 ? "blue" : "red"));
    for (let k = people.length; k < total; k++) {
      const id = `bot${k - people.length}`;
      bots[id] = names[(k - people.length) % names.length];
      roster[id] = k % 2 ? "blue" : "red";
    }
  } else {
    const size = Math.max(2, Math.min(3, Math.ceil(people.length / 2)));
    people.forEach((id, i) => (roster[id] = i % 2 ? "blue" : "red"));
    let botNo = 0;
    for (const team of ["red", "blue"] as TeamId[]) {
      const have = Object.values(roster).filter((t) => t === team).length;
      for (let k = have; k < size; k++) {
        const id = `bot${botNo}`;
        bots[id] = names[botNo % names.length];
        roster[id] = team;
        botNo++;
      }
    }
  }
  const next: ArenaState = {
    ...s,
    gameNo: s.gameNo + 1,
    seed,
    need: mode === "rey" || mode === "supervivencia" ? 1 : ONLINE_WINS,
    potions: true,
    regen: false,
    roster,
    bots,
    score: { red: 0, blue: 0 },
    kills: {},
    special: {},
    dmg: {},
    blk: {},
    par: {},
    ...onlineBots(s, people, Object.keys(bots), seed),
    winner: "",
    mode,
    map,
    events: true,
    fscore: {},
    champion: "",
    wave: 0,
    waveAt: 0,
  };
  return setupRound(next, 1, now);
}

// ---- Looks, levels and the bots' hidden skill -------------------------------------------

/** A new player's hidden rating (see `nextRating`). */
export const DEFAULT_RATING = 1000;

/** A rating as a bot's `skill` (0.3 easy … 1 the sharpest): a new player meets bots at about 0.6. */
export function skillFor(rating: number): number {
  return Math.max(0.3, Math.min(1, 0.3 + (rating - 700) / 1000));
}

/**
 * My rating after a match: up when I win and knock out more than I fall,
 * down otherwise, in small steps (a couple of bad matches soften the next
 * bots, a good run toughens them).
 */
export function nextRating(rating: number, won: boolean, kos: number, falls: number): number {
  const delta = (won ? 22 : -16) + Math.max(-12, Math.min(12, (kos - falls) * 4));
  return Math.max(400, Math.min(2000, Math.round(rating + delta)));
}

function hashId(seed: number, id: string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** Bots' levels for a match: from `min` to `max`, seeded. */
function botLevels(ids: string[], seed: number, min: number, max: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = min + (hashId(seed, id) % Math.max(1, max - min + 1));
  return out;
}

/**
 * A public arena's bots: levels around the people's (so they pass for
 * people) and skill around the people's ratings, each a bit different.
 */
function onlineBots(s: ArenaState, people: string[], botIds: string[], seed: number): Pick<ArenaState, "botLv" | "botSk"> {
  const avg = (xs: number[], d: number) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : d);
  const lv = avg(people.map((id) => s.players[id]?.lv ?? 1), 3);
  const sk = skillFor(avg(people.map((id) => s.players[id]?.sk ?? DEFAULT_RATING), DEFAULT_RATING));
  const botLv: Record<string, number> = {};
  const botSk: Record<string, number> = {};
  for (const id of botIds) {
    const r = mulberry32(hashId(seed, id))();
    botLv[id] = Math.max(1, Math.round(lv + (r - 0.45) * 8));
    botSk[id] = Math.round(Math.max(0.25, Math.min(1, sk + (r - 0.5) * 0.18)) * 100) / 100;
  }
  return { botLv, botSk };
}

/**
 * How a fighter looks and its level (0 = none shown): people's own (only
 * what their level unlocks), bots' made up from the match's seed. A wave's
 * bandits («supervivencia») have no level.
 */
export function fighterLook(state: ArenaState, id: string): { look: ArenaLook; lv: number } {
  if (isBot(id)) {
    if (state.mode === "supervivencia") return { look: DEFAULT_LOOK, lv: 0 };
    const lv = state.botLv[id] ?? 1 + (hashId(state.seed, id) % 10);
    return { look: botLook(hashId(state.seed + 7, id), lv), lv };
  }
  const p = state.players[id];
  const lv = Math.max(0, Math.floor(p?.lv ?? 0));
  return { look: p?.look ? validLook({ ...DEFAULT_LOOK, ...p.look }, Math.max(1, lv)) : DEFAULT_LOOK, lv };
}

/**
 * The match's best: most knockouts, then damage dealt (null if nobody did
 * anything). «Supervivencia» only counts the people.
 */
export function matchMvp(state: ArenaState): string | null {
  const ids = Object.keys(state.roster).filter((id) => !(state.mode === "supervivencia" && isBot(id)));
  const score = (id: string) => (state.kills[id] ?? 0) * 100000 + (state.dmg[id] ?? 0);
  const best = ids.sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0];
  return best && score(best) > 0 ? best : null;
}
