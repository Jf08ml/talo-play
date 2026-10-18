import { ref, get, onDisconnect, onValue, push, remove, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { TEAMS, type TeamId } from "./teams";
import { MAPS, type MapId, type PickupKind } from "./fuegoMaps";
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

export type FuegoMode = "todos" | "equipos";
export type FuegoStatus = "waiting" | "playing" | "finished";
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
  map: MapId;
  mode: FuegoMode;
  goal: number;
  level: BotLevel;
  players: Record<string, FuegoPlayer>;
  /** Teams picked while waiting (teams mode). */
  teams: Record<string, TeamId>;
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
  hits: Record<string, HitNote>;
  kills: Record<string, number>;
  deaths: Record<string, number>;
  score: Record<TeamId, number>;
  items: Record<string, { kind: PickupKind; x: number; z: number }>;
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
    mode: raw.mode === "equipos" ? "equipos" : "todos",
    size: Math.max(2, Math.min(8, raw.size ?? 4)),
    goal: raw.goal ?? 20,
    minutes: raw.minutes ?? 10,
    bots: raw.bots ?? true,
    level: raw.level ?? "normal",
    createdAt: raw.createdAt ?? 0,
  };
}

function normalizeState(raw: Partial<FuegoState> | null): FuegoState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    map: raw.map ?? "bunker",
    mode: raw.mode ?? "todos",
    goal: raw.goal ?? 20,
    level: raw.level ?? "normal",
    players: raw.players ?? {},
    teams: raw.teams ?? {},
    roster: raw.roster ?? {},
    bots: raw.bots ?? {},
    startedAt: raw.startedAt ?? 0,
    endsAt: raw.endsAt ?? 0,
    hp: raw.hp ?? {},
    sh: raw.sh ?? {},
    hitAt: raw.hitAt ?? {},
    deadAt: raw.deadAt ?? {},
    hits: raw.hits ?? {},
    kills: raw.kills ?? {},
    deaths: raw.deaths ?? {},
    score: { red: raw.score?.red ?? 0, blue: raw.score?.blue ?? 0 },
    items: raw.items ?? {},
    respawns: raw.respawns ?? {},
    feed: raw.feed ?? {},
    feedSeq: raw.feedSeq ?? 0,
    winner: raw.winner ?? "",
    wins: raw.wins ?? {},
  };
}

export const isBot = (id: string) => id.startsWith("bot");

export function fighterName(s: FuegoState, id: string, myId = ""): string {
  if (id === myId) return "Vos";
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

/** The fighters ranked by kills (then fewer deaths). */
export function ranking(s: FuegoState): string[] {
  return Object.keys(s.roster).sort((a, b) => (s.kills[b] ?? 0) - (s.kills[a] ?? 0) || (s.deaths[a] ?? 0) - (s.deaths[b] ?? 0));
}

// ---- Firebase ------------------------------------------------------------------------------

const base = (roomId: string) => `rooms/${roomId}/fuego`;
const statePath = (roomId: string) => `${base(roomId)}/state`;

function mutate(roomId: string, fn: (state: FuegoState) => FuegoState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export type FuegoSettings = Pick<FuegoMeta, "map" | "mode" | "size" | "goal" | "minutes" | "bots" | "level">;

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
 * Starts a match: the connected people (up to `size`), plus bots to fill
 * the places when `bots` is on. Needs two fighters at least.
 */
export function startMatch(roomId: string, settings: FuegoSettings, connected: string[]) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting" && s.status !== "finished") return null;
    const people = connected.filter((id) => s.players[id]).slice(0, settings.size);
    const roster: Record<string, Side> = {};
    const bots: Record<string, string> = {};
    if (settings.mode === "equipos") {
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
      for (const id of people) roster[id] = "ffa";
      if (settings.bots) {
        for (let n = 0; people.length + n < settings.size; n++) {
          roster[`bot${n}`] = "ffa";
          bots[`bot${n}`] = BOT_NAMES[n % BOT_NAMES.length];
        }
      }
    }
    const ids = Object.keys(roster);
    if (ids.length < 2 || !ids.some((id) => !isBot(id))) return null;
    if (settings.mode === "equipos" && (!ids.some((id) => roster[id] === "red") || !ids.some((id) => roster[id] === "blue"))) return null;
    const map = MAPS[settings.map];
    const items: FuegoState["items"] = {};
    map.items.forEach((it, i) => (items[`i${i}`] = it));
    const start = serverNow() + COUNTDOWN_MS;
    return {
      ...s,
      status: "playing",
      gameNo: s.gameNo + 1,
      map: settings.map,
      mode: settings.mode,
      goal: settings.goal,
      level: settings.level,
      roster,
      bots,
      startedAt: start,
      endsAt: start + settings.minutes * 60000,
      hp: Object.fromEntries(ids.map((id) => [id, MAX_HP])),
      sh: Object.fromEntries(ids.map((id) => [id, MAX_SHIELD])),
      hitAt: {},
      deadAt: {},
      hits: {},
      kills: {},
      deaths: {},
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
    if (!playing(s, key) || !(attacker in s.roster)) return null;
    const now = serverNow();
    let next = { ...s, hp: { ...s.hp }, sh: { ...s.sh }, hitAt: { ...s.hitAt }, deadAt: { ...s.deadAt }, hits: { ...s.hits }, kills: { ...s.kills }, deaths: { ...s.deaths }, score: { ...s.score } };
    let changed = false;
    for (const h of hits) {
      const t = h.target;
      if (!isAlive(s, t) || next.deadAt[t]) continue;
      const self = t === attacker;
      if (self && weapon !== "cohete" && weapon !== "granada") continue;
      if (!self && allies(s, attacker, t)) continue;
      changed = true;
      let dmg = Math.max(0, h.damage);
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
        if (!self) {
          next.kills[attacker] = (next.kills[attacker] ?? 0) + 1;
          const side = s.roster[attacker];
          if (side !== "ffa") next.score[side] += 1;
        }
        next = { ...next, ...addFeed(next, { k: attacker, v: t, w: weapon, h: h.head, t: Math.round(now) }) };
      }
    }
    if (!changed) return null;
    // Someone reached the goal?
    if (s.mode === "equipos") {
      const champ = (["red", "blue"] as TeamId[]).find((t) => next.score[t] >= s.goal);
      if (champ) return finish(next, champ);
    } else if ((next.kills[attacker] ?? 0) >= s.goal) {
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
    return { ...s, deadAt, hp: { ...s.hp, [id]: MAX_HP }, sh: { ...s.sh, [id]: MAX_SHIELD }, hitAt: { ...s.hitAt, [id]: 0 } };
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
    if (s.mode === "equipos") {
      return finish(s, s.score.red > s.score.blue ? "red" : s.score.blue > s.score.red ? "blue" : "draw");
    }
    const [first, second] = ranking(s);
    const tie = second !== undefined && (s.kills[first] ?? 0) === (s.kills[second] ?? 0);
    return finish(s, tie ? "draw" : first);
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
