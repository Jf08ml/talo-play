import { ref, get, onDisconnect, onValue, push, remove, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { TEAMS, type TeamId } from "./teams";
import { MAPS, type MapId, type PickupKind } from "./fuegoMaps";
import { chaosAt } from "./fuegoChaos";
import { ABILITY_IDS, OVERSHIELD, defaultKit, type AbilityId } from "./fuegoAbilities";
import {
  EGG_RESET_MS,
  EGG_TARGET_MS,
  FLAG_CAPS,
  FLAG_RETURN_MS,
  INFECTED,
  INFECTED_COLOR,
  INFECTED_MAX_MIN,
  INFECTED_PER,
  LADDER,
  MODE_ORDER,
  SURVIVORS,
  eggScore,
  flagBase,
  isTeamMode,
  ladderStep,
  type Egg,
  type Flag,
  type FuegoMode,
} from "./fuegoModes";
import { makeSeed } from "./random";
import { MAX_HP, MAX_SHIELD, MEDKIT_HEAL, SHIELD_DELAY_MS, SHIELD_RATE, type BotLevel, type ProjectileKind } from "./fuegoSim";

/**
 * Fuego cruzado: a first-person shooter, free-for-all or red against blue,
 * on three maps. Like Arena medieval there's no authority simulating it:
 *
 * - Each phone runs its own soldier (`lib/fuegoSim.ts`) and publishes its
 *   pose at `fuego/poses/{id}` (~20 Hz, removed on disconnect); the bot host
 *   (the connected person with the lowest id) runs the bots.
 * - Whoever shoots decides what it hits from the poses it sees and writes the
 *   damage with `damage` (a transaction on `fuego/state`). Rockets and
 *   grenades are flown by their owner, published at `fuego/proj` for the
 *   others to draw, and their explosion (`fuego/booms`) does the damage.
 * - Health and shield live in the state. The shield recharges by itself:
 *   it's stored with the time of the last damage and worked out on read
 *   (`shieldOf`), so nobody has to write while it fills.
 * - The dead respawn after RESPAWN_MS: their own phone (or the bot host)
 *   picks the spot and calls `respawn`. Ammo and the weapons carried are
 *   local to each phone; the pickups on the floor are in the state so only
 *   one person gets each, and they come back after a while.
 */

export const COUNTDOWN_MS = 3500;
export const RESPAWN_MS = 3500;
export const SIZE_OPTIONS = [2, 4, 6, 8] as const;
export const GOAL_OPTIONS = [10, 20, 30] as const;
export const MINUTE_OPTIONS = [5, 10] as const;
export const FEED_SIZE = 6;
/** Just back on your feet: nobody can hurt you for this long (no spawn killing). */
export const SPAWN_GUARD_MS = 2000;
/** On a big screen each person gets a quarter of it at most. */
export const SCREEN_MAX_PEOPLE = 4;

/** How long a taken pickup takes to come back. */
export const RESPAWN_ITEM_MS: Record<PickupKind, number> = {
  rifle: 25000,
  pistola: 25000,
  escopeta: 40000,
  francotirador: 60000,
  lanzacohetes: 75000,
  granadas: 20000,
  botiquin: 30000,
};

export type { FuegoMode } from "./fuegoModes";
export type FuegoStatus = "waiting" | "playing" | "finished";
/** Where the match is seen: each on their phone, or a big screen with the phones as controllers. */
export type FuegoView = "telefono" | "pantalla";
/** A fighter's side: a team, or "ffa" in free-for-all. */
export type Side = TeamId | "ffa";

export interface FuegoMeta {
  game: "fuego";
  hostId?: string;
  map: MapId;
  mode: FuegoMode;
  /** Fighters in total (people + bots). */
  size: number;
  /** Kills to win (per player in free-for-all, per team in teams). */
  goal: number;
  minutes: number;
  bots: boolean;
  level: BotLevel;
  view: FuegoView;
  /** Chaos events every minute (lib/fuegoChaos.ts). */
  chaos: boolean;
  createdAt: number | object;
}

export interface FuegoPlayer {
  name: string;
  color: string;
}

export interface FeedEntry {
  k: string;
  v: string;
  /** Weapon (or "granada", "cohete", "golpe"), headshot. */
  w: string;
  h: boolean;
  t: number;
  /** The killer's streak with this kill (absent on older entries and suicides). */
  s?: number;
}

/** The last hit a fighter took, for its own phone (damage direction, flash). */
export interface HitNote {
  n: number;
  from: string;
  x: number;
  z: number;
}

export interface FuegoState {
  status: FuegoStatus;
  gameNo: number;
  /** Chaos on for this match, and the seed its events come from. */
  chaos: boolean;
  seed: number;
  map: MapId;
  mode: FuegoMode;
  goal: number;
  level: BotLevel;
  players: Record<string, FuegoPlayer>;
  /** Teams picked while waiting (teams mode). */
  teams: Record<string, TeamId>;
  /** Each one's ability (picked while waiting; bots get one at the start). */
  kits: Record<string, AbilityId>;
  /** This match's fighters and their side. */
  roster: Record<string, Side>;
  bots: Record<string, string>;
  /** The fight starts after the countdown, and ends on time. */
  startedAt: number;
  endsAt: number;
  hp: Record<string, number>;
  /** Shield at the time of the last damage (it recharges from there, see `shieldOf`). */
  sh: Record<string, number>;
  hitAt: Record<string, number>;
  /** Server time of death; absent or 0 = alive. */
  deadAt: Record<string, number>;
  /** Server time of the last respawn: `SPAWN_GUARD_MS` of protection from there. */
  spawnAt: Record<string, number>;
  hits: Record<string, HitNote>;
  kills: Record<string, number>;
  deaths: Record<string, number>;
  /** Kills in a row without dying, and the best of the match. */
  streak: Record<string, number>;
  best: Record<string, number>;
  score: Record<TeamId, number>;
  items: Record<string, { kind: PickupKind; x: number; z: number }>;
  /** Atrapa la bandera: each team's flag. */
  flags: Partial<Record<TeamId, Flag>>;
  /** El tesoro: the egg, and the time each one has banked holding it (ms). */
  egg: Egg | null;
  held: Record<string, number>;
  respawns: Record<string, { kind: PickupKind; x: number; z: number; at: number }>;
  feed: Record<string, FeedEntry>;
  feedSeq: number;
  /** Winner: a fighter id (free-for-all) or a team; "draw" on a tie. */
  winner: string;
  wins: Record<string, number>;
}

/** A soldier's pose, written by whoever runs it. */
export interface FuegoPose {
  /** Match it belongs to (`gameNo`). */
  k: number;
  x: number;
  y: number;
  z: number;
  yw: number;
  pt: number;
  /** Weapon in hand (`WEAPON_IDS` index), shots fired, end of the last shot, melee and grenade counters, reloading, aiming. */
  w: number;
  f: number;
  sx: number;
  sy: number;
  sz: number;
  m: number;
  g: number;
  r: number;
  a: number;
  /** Walking speed. */
  sp: number;
  t: number;
  /** Abilities used so far (others show the effect when it grows); absent on older clients. */
  h?: number;
}

export interface FuegoProjectile {
  k: number;
  o: string;
  kind: ProjectileKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
}

export interface FuegoBoom {
  k: number;
  kind: ProjectileKind;
  /** Whose balloon (its paint color); absent on older ones. */
  o?: string;
  x: number;
  y: number;
  z: number;
  t: number;
}

export const BOT_NAMES = ["Halcón", "Cobra", "Tormenta", "Lince", "Rayo", "Puma", "Cóndor", "Vértigo"];

export function normalizeMeta(raw: Partial<FuegoMeta>): FuegoMeta {
  return {
    game: "fuego",
    hostId: raw.hostId,
    map: raw.map && raw.map in MAPS ? raw.map : "bunker",
    mode: raw.mode && MODE_ORDER.includes(raw.mode) ? raw.mode : "todos",
    size: Math.max(2, Math.min(8, raw.size ?? 4)),
    goal: raw.goal ?? 20,
    minutes: raw.minutes ?? 10,
    bots: raw.bots ?? true,
    level: raw.level ?? "normal",
    view: raw.view === "pantalla" ? "pantalla" : "telefono",
    chaos: raw.chaos ?? true,
    createdAt: raw.createdAt ?? 0,
  };
}

function normalizeState(raw: Partial<FuegoState> | null): FuegoState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    chaos: raw.chaos ?? false,
    seed: raw.seed ?? 0,
    map: raw.map ?? "bunker",
    mode: raw.mode ?? "todos",
    goal: raw.goal ?? 20,
    level: raw.level ?? "normal",
    players: raw.players ?? {},
    teams: raw.teams ?? {},
    kits: raw.kits ?? {},
    roster: raw.roster ?? {},
    bots: raw.bots ?? {},
    startedAt: raw.startedAt ?? 0,
    endsAt: raw.endsAt ?? 0,
    hp: raw.hp ?? {},
    sh: raw.sh ?? {},
    hitAt: raw.hitAt ?? {},
    deadAt: raw.deadAt ?? {},
    spawnAt: raw.spawnAt ?? {},
    hits: raw.hits ?? {},
    kills: raw.kills ?? {},
    deaths: raw.deaths ?? {},
    streak: raw.streak ?? {},
    best: raw.best ?? {},
    score: { red: raw.score?.red ?? 0, blue: raw.score?.blue ?? 0 },
    items: raw.items ?? {},
    flags: raw.flags ?? {},
    egg: raw.egg ?? null,
    held: raw.held ?? {},
    respawns: raw.respawns ?? {},
    feed: raw.feed ?? {},
    feedSeq: raw.feedSeq ?? 0,
    winner: raw.winner ?? "",
    wins: raw.wins ?? {},
  };
}

export const isBot = (id: string) => id.startsWith("bot");

/** Who the sky's balloons (chaos "lluvia") are, in the kill feed. */
export const SKY = "cielo";

export function fighterName(s: FuegoState, id: string, myId = ""): string {
  if (id === myId) return "Tú";
  if (id === SKY) return "La lluvia";
  return s.bots[id] ?? s.players[id]?.name ?? "Soldado";
}

export function isAlive(s: FuegoState, id: string): boolean {
  return id in s.roster && !s.deadAt[id];
}

/** Are a and b on the same side? (Never in free-for-all.) */
export function allies(s: Pick<FuegoState, "roster">, a: string, b: string): boolean {
  const sa = s.roster[a];
  return sa !== undefined && sa !== "ffa" && sa === s.roster[b];
}

/** The shield right now: what it had at the last damage, plus what it recharged since. */
export function shieldOf(s: Pick<FuegoState, "sh" | "hitAt">, id: string, now: number): number {
  const base = s.sh[id] ?? MAX_SHIELD;
  const since = now - (s.hitAt[id] ?? 0) - SHIELD_DELAY_MS;
  return since <= 0 ? base : Math.min(MAX_SHIELD, base + (since / 1000) * SHIELD_RATE);
}

export const teamInfo = (id: TeamId) => TEAMS.find((t) => t.id === id)!;

/** Still protected after respawning? */
export function guarded(s: Pick<FuegoState, "spawnAt">, id: string, now: number): boolean {
  return now - (s.spawnAt[id] ?? 0) < SPAWN_GUARD_MS;
}

/** A fighter's color: their team's, or their own in free-for-all. */
export function fighterColor(s: FuegoState, id: string): string {
  const side = s.roster[id];
  if (s.mode === "infectados" && side) return side === INFECTED ? INFECTED_COLOR : teamInfo("blue").color;
  return side === "red" || side === "blue" ? teamInfo(side).color : (s.players[id]?.color ?? "#f97316");
}

/** The fighters ranked by kills (then fewer deaths). */
export function ranking(s: FuegoState): string[] {
  if (s.mode === "tesoro") {
    const now = serverNow();
    return Object.keys(s.roster).sort((a, b) => eggScore(s, b, now) - eggScore(s, a, now) || (s.kills[b] ?? 0) - (s.kills[a] ?? 0));
  }
  return Object.keys(s.roster).sort((a, b) => (s.kills[b] ?? 0) - (s.kills[a] ?? 0) || (s.deaths[a] ?? 0) - (s.deaths[b] ?? 0));
}

/** What a fighter's score is in this mode (kills, or the egg's seconds). */
export function scoreOf(s: FuegoState, id: string, now: number): number {
  return s.mode === "tesoro" ? Math.floor(eggScore(s, id, now) / 1000) : (s.kills[id] ?? 0);
}

// ---- Firebase ------------------------------------------------------------------------------

const base = (roomId: string) => `rooms/${roomId}/fuego`;
const statePath = (roomId: string) => `${base(roomId)}/state`;

function mutate(roomId: string, fn: (state: FuegoState) => FuegoState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export type FuegoSettings = Pick<FuegoMeta, "map" | "mode" | "size" | "goal" | "minutes" | "bots" | "level" | "view" | "chaos">;

export async function createFuegoRoom(hostId: string, settings: FuegoSettings): Promise<string> {
  const roomId = generateRoomCode();
  const meta: FuegoMeta = { game: "fuego", hostId, ...settings, createdAt: serverTimestamp() };
  const state: Partial<FuegoState> = { status: "waiting", gameNo: 0, map: settings.map, mode: settings.mode };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getFuegoMeta(roomId: string): Promise<Partial<FuegoMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeFuego(roomId: string, cb: (state: FuegoState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

function teamCount(s: FuegoState, team: TeamId): number {
  return Object.values(s.teams).filter((t) => t === team).length;
}

/** Registers the player; in teams mode, before the match, on the team with fewer people. */
export function joinFuego(roomId: string, clientId: string, player: FuegoPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    const team: TeamId = teamCount(s, "red") <= teamCount(s, "blue") ? "red" : "blue";
    const assign = s.status === "waiting" && !s.teams[clientId] && !known;
    if (!assign && known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player }, teams: assign ? { ...s.teams, [clientId]: team } : s.teams };
  });
}

/** Picks your ability (while waiting). */
export function chooseKit(roomId: string, clientId: string, kit: AbilityId) {
  return mutate(roomId, (s) => (s.status !== "playing" && s.kits[clientId] !== kit ? { ...s, kits: { ...s.kits, [clientId]: kit } } : null));
}

/** The ability a fighter has. */
export const kitOf = (s: Pick<FuegoState, "kits">, id: string): AbilityId => s.kits[id] ?? defaultKit(id);

/** Ability "burbuja": the shield full and some extra (it lasts until the shield would start recharging). */
export function popBubble(roomId: string, key: number, id: string) {
  return mutate(roomId, (s) => {
    if (!playing(s, key) || !isAlive(s, id) || kitOf(s, id) !== "burbuja") return null;
    const now = Math.round(serverNow());
    return { ...s, sh: { ...s.sh, [id]: MAX_SHIELD + OVERSHIELD }, hitAt: { ...s.hitAt, [id]: now } };
  });
}

export function chooseTeam(roomId: string, clientId: string, team: TeamId) {
  return mutate(roomId, (s) => (s.status === "waiting" && s.teams[clientId] !== team ? { ...s, teams: { ...s.teams, [clientId]: team } } : null));
}

export function shuffleTeams(roomId: string, connected: string[]) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting") return null;
    const ids = connected.filter((id) => s.players[id]).sort(() => Math.random() - 0.5);
    const teams: Record<string, TeamId> = {};
    ids.forEach((id, i) => (teams[id] = i % 2 ? "blue" : "red"));
    return { ...s, teams };
  });
}

/**
 * Starts a match: the connected people (up to `size`, and up to
 * `SCREEN_MAX_PEOPLE` on a big screen), plus bots to fill the places when
 * `bots` is on. Needs two fighters at least.
 */
export function startMatch(roomId: string, settings: FuegoSettings, connected: string[]) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting" && s.status !== "finished") return null;
    const most = settings.view === "pantalla" ? Math.min(settings.size, SCREEN_MAX_PEOPLE) : settings.size;
    const people = connected.filter((id) => s.players[id]).slice(0, most);
    const roster: Record<string, Side> = {};
    const bots: Record<string, string> = {};
    if (isTeamMode(settings.mode)) {
      const half = Math.ceil(settings.size / 2);
      const count = { red: 0, blue: 0 };
      for (const id of people) {
        let team = s.teams[id] ?? "red";
        if (count[team] >= half) team = team === "red" ? "blue" : "red";
        roster[id] = team;
        count[team]++;
      }
      if (settings.bots) {
        let n = 0;
        for (const team of ["red", "blue"] as TeamId[]) {
          for (let k = count[team]; k < half; k++, n++) {
            roster[`bot${n}`] = team;
            bots[`bot${n}`] = BOT_NAMES[n % BOT_NAMES.length];
          }
        }
      }
    } else {
      // Infectados: everyone starts as a survivor, then a few are picked as the first infected.
      const side: Side = settings.mode === "infectados" ? SURVIVORS : "ffa";
      for (const id of people) roster[id] = side;
      if (settings.bots) {
        for (let n = 0; people.length + n < settings.size; n++) {
          roster[`bot${n}`] = side;
          bots[`bot${n}`] = BOT_NAMES[n % BOT_NAMES.length];
        }
      }
      if (settings.mode === "infectados") {
        const all = Object.keys(roster).sort(() => Math.random() - 0.5);
        const n = Math.max(1, Math.floor(all.length / INFECTED_PER));
        for (const id of all.slice(0, Math.min(n, all.length - 1))) roster[id] = INFECTED;
      }
    }
    const ids = Object.keys(roster);
    if (ids.length < 2 || !ids.some((id) => !isBot(id))) return null;
    // Bots get an ability at random; people keep theirs.
    const kits = { ...s.kits };
    for (const id of ids) if (isBot(id)) kits[id] = ABILITY_IDS[Math.floor(Math.random() * ABILITY_IDS.length)];
    if (isTeamMode(settings.mode) && (!ids.some((id) => roster[id] === "red") || !ids.some((id) => roster[id] === "blue"))) return null;
    const map = MAPS[settings.map];
    const items: FuegoState["items"] = {};
    map.items.forEach((it, i) => (items[`i${i}`] = it));
    const start = serverNow() + COUNTDOWN_MS;
    return {
      ...s,
      status: "playing",
      gameNo: s.gameNo + 1,
      chaos: settings.chaos,
      seed: makeSeed(),
      map: settings.map,
      mode: settings.mode,
      goal: settings.goal,
      level: settings.level,
      roster,
      bots,
      kits,
      startedAt: start,
      endsAt: start + (settings.mode === "infectados" ? Math.min(settings.minutes, INFECTED_MAX_MIN) : settings.minutes) * 60000,
      flags:
        settings.mode === "bandera"
          ? Object.fromEntries((["red", "blue"] as TeamId[]).map((t) => [t, { st: "base", by: "", ...flagBase(map, t), at: 0 } satisfies Flag]))
          : {},
      egg: settings.mode === "tesoro" ? { by: "", x: 0, z: 0, at: start } : null,
      held: {},
      hp: Object.fromEntries(ids.map((id) => [id, MAX_HP])),
      sh: Object.fromEntries(ids.map((id) => [id, MAX_SHIELD])),
      hitAt: {},
      deadAt: {},
      spawnAt: {},
      hits: {},
      kills: {},
      deaths: {},
      streak: {},
      best: {},
      score: { red: 0, blue: 0 },
      items,
      respawns: {},
      feed: {},
      feedSeq: 0,
      winner: "",
    };
  });
}

function addFeed(s: FuegoState, e: FeedEntry): Pick<FuegoState, "feed" | "feedSeq"> {
  const feed = { ...s.feed, [`f${s.feedSeq}`]: e };
  delete feed[`f${s.feedSeq - FEED_SIZE}`];
  return { feed, feedSeq: s.feedSeq + 1 };
}

function finish(s: FuegoState, winner: string): FuegoState {
  const wins = { ...s.wins };
  for (const id of Object.keys(s.roster)) {
    if (isBot(id)) continue;
    if (id === winner || (s.roster[id] !== "ffa" && s.roster[id] === winner)) wins[id] = (wins[id] ?? 0) + 1;
  }
  return { ...s, status: "finished", winner, wins };
}

function playing(s: FuegoState, key: number): boolean {
  return s.status === "playing" && s.gameNo === key && serverNow() >= s.startedAt - 300;
}

export interface DamageHit {
  target: string;
  damage: number;
  head: boolean;
}

/**
 * `attacker`'s bullets, blast or punch hit these targets (`weapon` names it
 * for the kill feed). Allies are spared; your own explosion can hurt you.
 */
export function damage(roomId: string, key: number, attacker: string, from: { x: number; z: number }, weapon: string, hits: DamageHit[]) {
  return mutate(roomId, (s) => {
    if (!playing(s, key) || !(attacker in s.roster || attacker === SKY)) return null;
    const now = serverNow();
    const worth = chaosAt(s, now)?.id === "doble" ? 2 : 1;
    let next = {
      ...s,
      hp: { ...s.hp },
      sh: { ...s.sh },
      hitAt: { ...s.hitAt },
      deadAt: { ...s.deadAt },
      hits: { ...s.hits },
      kills: { ...s.kills },
      deaths: { ...s.deaths },
      streak: { ...s.streak },
      best: { ...s.best },
      score: { ...s.score },
    };
    let changed = false;
    for (const h of hits) {
      const t = h.target;
      if (!isAlive(s, t) || next.deadAt[t]) continue;
      const self = t === attacker;
      if (self && weapon !== "cohete" && weapon !== "granada") continue;
      if (attacker === SKY && weapon !== "granada") continue;
      if (!self && allies(s, attacker, t)) continue;
      if (!self && guarded(s, t, now)) continue;
      changed = true;
      // An infected's punch infects at once; the last step of escalada knocks out too.
      const knockout =
        weapon === "golpe" && ((s.mode === "infectados" && s.roster[attacker] === INFECTED) || (s.mode === "escalada" && ladderStep(s.kills[attacker] ?? 0) === "golpe"));
      let dmg = knockout ? 999 : Math.max(0, h.damage);
      const shield = shieldOf(next, t, now);
      const absorbed = Math.min(shield, dmg);
      dmg -= absorbed;
      next.sh[t] = Math.round(shield - absorbed);
      next.hp[t] = Math.max(0, Math.round((next.hp[t] ?? MAX_HP) - dmg));
      next.hitAt[t] = Math.round(now);
      next.hits[t] = { n: (s.hits[t]?.n ?? 0) + 1, from: attacker, x: Math.round(from.x * 10) / 10, z: Math.round(from.z * 10) / 10 };
      if (next.hp[t] === 0) {
        next.deadAt[t] = Math.round(now);
        next.deaths[t] = (next.deaths[t] ?? 0) + 1;
        delete next.streak[t];
        let streak = 0;
        if (!self && attacker !== SKY) {
          next.kills[attacker] = (next.kills[attacker] ?? 0) + worth;
          streak = (next.streak[attacker] ?? 0) + 1;
          next.streak[attacker] = streak;
          next.best[attacker] = Math.max(next.best[attacker] ?? 0, streak);
          const side = s.roster[attacker];
          if (s.mode === "equipos" && side !== "ffa") next.score[side] += worth;
        }
        // What the fallen one carried drops; a fallen survivor joins the infected.
        if (s.mode === "bandera") {
          for (const team of ["red", "blue"] as TeamId[]) {
            const f = next.flags[team];
            if (f?.st === "carried" && f.by === t) next.flags = { ...next.flags, [team]: { ...f, st: "dropped", at: Math.round(now) } };
          }
        }
        if (s.mode === "tesoro" && next.egg?.by === t) {
          next.held = { ...next.held, [t]: Math.round(eggScore(next, t, now)) };
          next.egg = { ...next.egg, by: "", at: Math.round(now), last: t };
        }
        if (s.mode === "infectados" && next.roster[t] === SURVIVORS) next.roster = { ...next.roster, [t]: INFECTED };
        const entry: FeedEntry = { k: attacker, v: t, w: weapon, h: h.head, t: Math.round(now) };
        if (streak) entry.s = streak;
        next = { ...next, ...addFeed(next, entry) };
      }
    }
    if (!changed) return null;
    // Someone reached the goal?
    if (s.mode === "equipos") {
      const champ = (["red", "blue"] as TeamId[]).find((t) => next.score[t] >= s.goal);
      if (champ) return finish(next, champ);
    } else if (s.mode === "infectados") {
      if (!Object.values(next.roster).includes(SURVIVORS)) return finish(next, INFECTED);
    } else if (s.mode === "escalada") {
      if (attacker !== SKY && (next.kills[attacker] ?? 0) >= LADDER.length) return finish(next, attacker);
    } else if (s.mode === "todos" && attacker !== SKY && (next.kills[attacker] ?? 0) >= s.goal) {
      return finish(next, attacker);
    }
    return next;
  });
}

/** Back on its feet after RESPAWN_MS (its phone picks where). */
export function respawn(roomId: string, key: number, id: string) {
  return mutate(roomId, (s) => {
    if (!playing(s, key) || !(id in s.roster) || !s.deadAt[id] || serverNow() < s.deadAt[id] + RESPAWN_MS - 300) return null;
    const deadAt = { ...s.deadAt };
    delete deadAt[id];
    return {
      ...s,
      deadAt,
      hp: { ...s.hp, [id]: MAX_HP },
      sh: { ...s.sh, [id]: MAX_SHIELD },
      hitAt: { ...s.hitAt, [id]: 0 },
      spawnAt: { ...s.spawnAt, [id]: Math.round(serverNow()) },
    };
  });
}

/** Takes a pickup (one person gets it); a medkit only when hurt. It comes back after a while. */
export function pickItem(roomId: string, key: number, id: string, itemId: string) {
  return mutate(roomId, (s) => {
    if (!playing(s, key) || !isAlive(s, id)) return null;
    const item = s.items[itemId];
    if (!item) return null;
    if (item.kind === "botiquin" && (s.hp[id] ?? 0) >= MAX_HP) return null;
    const items = { ...s.items };
    delete items[itemId];
    const respawns = { ...s.respawns, [itemId]: { ...item, at: Math.round(serverNow() + RESPAWN_ITEM_MS[item.kind]) } };
    const hp = item.kind === "botiquin" ? { ...s.hp, [id]: Math.min(MAX_HP, (s.hp[id] ?? 0) + MEDKIT_HEAL) } : s.hp;
    return { ...s, items, respawns, hp };
  });
}

/** Pickups whose time came are back at their places. */
export function respawnItems(roomId: string, key: number) {
  return mutate(roomId, (s) => {
    if (!playing(s, key)) return null;
    const now = serverNow();
    const due = Object.entries(s.respawns).filter(([, r]) => r.at <= now);
    if (!due.length) return null;
    const items = { ...s.items };
    const respawns = { ...s.respawns };
    for (const [id, { kind, x, z }] of due) {
      items[id] = { kind, x, z };
      delete respawns[id];
    }
    return { ...s, items, respawns };
  });
}

/** Out of time: most kills (or team points) wins. */
export function timeUp(roomId: string, key: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.gameNo !== key || serverNow() < s.endsAt) return null;
    if (s.mode === "equipos" || s.mode === "bandera") {
      return finish(s, s.score.red > s.score.blue ? "red" : s.score.blue > s.score.red ? "blue" : "draw");
    }
    if (s.mode === "infectados") return finish(s, Object.values(s.roster).includes(SURVIVORS) ? SURVIVORS : INFECTED);
    const now = serverNow();
    const [first, second] = ranking(s);
    const tie = second !== undefined && scoreOf(s, first, now) === scoreOf(s, second, now) && (s.mode === "tesoro" || (s.kills[first] ?? 0) === (s.kills[second] ?? 0));
    return finish(s, tie ? "draw" : first);
  });
}

// ---- Atrapa la bandera ------------------------------------------------------------------------

function flagHome(s: FuegoState, team: TeamId): Flag {
  return { st: "base", by: "", ...flagBase(MAPS[s.map], team), at: Math.round(serverNow()) };
}

/**
 * `id` touches `team`'s flag: a rival takes it (from its base or the floor);
 * a teammate sends it home if it was dropped.
 */
export function touchFlag(roomId: string, key: number, id: string, team: TeamId) {
  return mutate(roomId, (s) => {
    if (!playing(s, key) || s.mode !== "bandera" || !isAlive(s, id)) return null;
    const f = s.flags[team];
    if (!f) return null;
    if (s.roster[id] === team) return f.st === "dropped" ? { ...s, flags: { ...s.flags, [team]: flagHome(s, team) } } : null;
    if (f.st === "carried") return null;
    return { ...s, flags: { ...s.flags, [team]: { ...f, st: "carried", by: id, at: Math.round(serverNow()) } } };
  });
}

/** `id` brought the rival's flag to its base while its own is home: a capture. */
export function captureFlag(roomId: string, key: number, id: string) {
  return mutate(roomId, (s) => {
    if (!playing(s, key) || s.mode !== "bandera" || !isAlive(s, id)) return null;
    const side = s.roster[id];
    if (side !== "red" && side !== "blue") return null;
    const rival: TeamId = side === "red" ? "blue" : "red";
    const theirs = s.flags[rival];
    if (theirs?.st !== "carried" || theirs.by !== id || s.flags[side]?.st !== "base") return null;
    const score = { ...s.score, [side]: s.score[side] + 1 };
    const next: FuegoState = {
      ...s,
      score,
      flags: { ...s.flags, [rival]: flagHome(s, rival) },
      ...addFeed(s, { k: id, v: "", w: "captura", h: false, t: Math.round(serverNow()) }),
    };
    return score[side] >= FLAG_CAPS ? finish(next, side) : next;
  });
}

/** The phone of whoever dropped a flag or the egg says where it fell (the state only knew where it was taken). */
export function placeDropped(roomId: string, key: number, id: string, x: number, z: number) {
  return mutate(roomId, (s) => {
    if (!playing(s, key)) return null;
    const now = serverNow();
    const pos = { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
    let changed = false;
    const flags = { ...s.flags };
    for (const team of ["red", "blue"] as TeamId[]) {
      const f = flags[team];
      if (f?.st === "dropped" && f.by === id && now - f.at < 5000 && (f.x !== pos.x || f.z !== pos.z)) {
        flags[team] = { ...f, ...pos };
        changed = true;
      }
    }
    let egg = s.egg;
    if (egg && !egg.by && egg.last === id && now - egg.at < 5000 && (egg.x !== pos.x || egg.z !== pos.z)) {
      egg = { ...egg, ...pos };
      changed = true;
    }
    return changed ? { ...s, flags, egg } : null;
  });
}

/** Dropped flags left alone go home; an egg left alone goes back to the middle. */
export function tidyObjectives(roomId: string, key: number) {
  return mutate(roomId, (s) => {
    if (!playing(s, key)) return null;
    const now = serverNow();
    let changed = false;
    const flags = { ...s.flags };
    for (const team of ["red", "blue"] as TeamId[]) {
      if (flags[team]?.st === "dropped" && now - flags[team]!.at > FLAG_RETURN_MS) {
        flags[team] = flagHome(s, team);
        changed = true;
      }
    }
    let egg = s.egg;
    if (egg && !egg.by && now - egg.at > EGG_RESET_MS && (egg.x !== 0 || egg.z !== 0)) {
      egg = { by: "", x: 0, z: 0, at: Math.round(now) };
      changed = true;
    }
    return changed ? { ...s, flags, egg } : null;
  });
}

// ---- El tesoro ----------------------------------------------------------------------------

export function takeEgg(roomId: string, key: number, id: string) {
  return mutate(roomId, (s) => {
    if (!playing(s, key) || s.mode !== "tesoro" || !s.egg || s.egg.by || !isAlive(s, id)) return null;
    return { ...s, egg: { ...s.egg, by: id, at: Math.round(serverNow()) } };
  });
}

/** Held long enough: the match is won. */
export function claimEgg(roomId: string, key: number, id: string) {
  return mutate(roomId, (s) => {
    if (!playing(s, key) || s.mode !== "tesoro" || eggScore(s, id, serverNow()) < EGG_TARGET_MS) return null;
    return finish(s, id);
  });
}

export function backToWaiting(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => (s.status !== "waiting" && s.gameNo === expectedGame ? { ...s, status: "waiting", roster: {}, bots: {} } : null));
}

// ---- Poses, projectiles and explosions ------------------------------------------------------

/** A pose this client writes; people's are removed when they disconnect, bots' stay for the next bot host. */
export function openPose(roomId: string, id: string, owned: boolean) {
  const r = ref(getDb(), `${base(roomId)}/poses/${id}`);
  if (owned) onDisconnect(r).remove().catch(console.error);
  return {
    send: (pose: FuegoPose) => set(r, pose).catch(console.error),
    close: () => {
      if (!owned) return;
      onDisconnect(r).cancel().catch(console.error);
      remove(r).catch(console.error);
    },
  };
}

export function subscribePoses(roomId: string, cb: (poses: Record<string, FuegoPose>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/poses`), (snap) => cb(snap.val() ?? {}));
}

/** Publishes a rocket or grenade; returns a function that takes it down. */
export function throwProjectile(roomId: string, p: FuegoProjectile): () => void {
  const r = push(ref(getDb(), `${base(roomId)}/proj`));
  onDisconnect(r).remove().catch(console.error);
  set(r, p).catch(console.error);
  return () => {
    onDisconnect(r).cancel().catch(console.error);
    remove(r).catch(console.error);
  };
}

export function subscribeProjectiles(roomId: string, cb: (list: Record<string, FuegoProjectile>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/proj`), (snap) => cb(snap.val() ?? {}));
}

/** An explosion for everyone to see; it's removed a moment later. Returns its key. */
export function publishBoom(roomId: string, b: FuegoBoom): string {
  const r = push(ref(getDb(), `${base(roomId)}/booms`));
  onDisconnect(r).remove().catch(console.error);
  set(r, b).catch(console.error);
  setTimeout(() => {
    onDisconnect(r).cancel().catch(console.error);
    remove(r).catch(console.error);
  }, 2500);
  return r.key!;
}

export function subscribeBooms(roomId: string, cb: (list: Record<string, FuegoBoom>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/booms`), (snap) => cb(snap.val() ?? {}));
}

// ---- Big screen: the phones' pads and what the screen tells each phone ---------------------

/**
 * A phone's pad when the match is on a big screen (`fuego/input/{clientId}`,
 * removed on disconnect): the stick (`x` strafe, `y` forward, −1…1), the look
 * dragged so far (`lx`/`ly`, accumulated radians), the trigger held (`f`) and
 * aiming (`a`, toggled on the phone). Presses are counters, so none is lost
 * between two reads: `ft` trigger presses (a tap shorter than a frame still
 * shoots), `j` jump, `r` reload, `q` switch weapon, `g` grenade, `m` melee,
 * `p` pick up. `sid` is random per page load: when it changes (the phone
 * reloaded and its counters and look started again) the screen resyncs
 * instead of reading it as presses or a drag. The screen turns it into the
 * soldier's input (`lib/fuegoPad.ts`).
 */
export interface FuegoPad {
  sid: number;
  /** Wants auto-fire (the screen shoots for them while the crosshair is on a rival). */
  af?: number;
  /** Ability presses. */
  h: number;
  x: number;
  y: number;
  lx: number;
  ly: number;
  f: number;
  a: number;
  ft: number;
  j: number;
  r: number;
  q: number;
  g: number;
  m: number;
  p: number;
}

export const NO_PAD: FuegoPad = { sid: 0, h: 0, x: 0, y: 0, lx: 0, ly: 0, f: 0, a: 0, ft: 0, j: 0, r: 0, q: 0, g: 0, m: 0, p: 0 };

export function openPad(roomId: string, clientId: string) {
  const r = ref(getDb(), `${base(roomId)}/input/${clientId}`);
  onDisconnect(r).remove().catch(console.error);
  return {
    send: (pad: FuegoPad) => set(r, pad).catch(console.error),
    close: () => {
      onDisconnect(r).cancel().catch(console.error);
      remove(r).catch(console.error);
    },
  };
}

export function subscribePads(roomId: string, cb: (pads: Record<string, FuegoPad>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/input`), (snap) => cb(snap.val() ?? {}));
}

/**
 * What only the big screen knows about each person (ammo and weapons are
 * local to whoever runs the soldier), written to `fuego/live/{id}` when it
 * changes so the phone can show it: weapon in hand and the other one
 * (`WEAPON_IDS` index, −1 none), magazine and reserve, grenades, the weapon
 * on the floor in reach (`n`, a label or ""), reloading and aiming.
 */
export interface FuegoLive {
  /** The ability's readiness, 0–100 (100 = ready). */
  c: number;
  w: number;
  o: number;
  m: number;
  r: number;
  g: number;
  n: string;
  l: number;
  z: number;
}

export function publishLive(roomId: string, patch: Record<string, FuegoLive>) {
  if (!Object.keys(patch).length) return;
  update(ref(getDb(), `${base(roomId)}/live`), patch).catch(console.error);
}

export function subscribeLive(roomId: string, id: string, cb: (live: FuegoLive | null) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/live/${id}`), (snap) => cb(snap.val()));
}
