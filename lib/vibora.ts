import { get, onDisconnect, onValue, push, ref, remove, runTransaction, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode, PLAYER_COLORS } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { BOT_NAMES, CUT_COOLDOWN_MS, NET_SEG, SEG, arenaRadius, bodyOf, foodCount, type Snake } from "./viboraSim";

/**
 * Viborita: snakes in a round arena, everyone at once, for a few minutes.
 * The biggest at the end wins. No authority, like the arena: each phone runs
 * its own snake and writes its pose (`poses/{id}`, ~10 Hz); the bot host (the
 * connected person with the lowest id) runs the extra snakes.
 *
 * - Pellets are seeded (`pelletAt`); `food/g{gameNo}/f{i}` counts how many
 *   times pellet i was eaten, and eating is a transaction on that count.
 * - A cut is a transaction on `cuts/g{gameNo}/{victim}` (`{n, keep, by, gain}`)
 *   by the cutter, who adds `gain`; the victim's runner trims to `keep`.
 * - `state` only holds the match: the players, the extra snakes, the clock
 *   and, once any client closes it, the `final` sizes.
 *
 * Two ways to play: a friends' room (a timed match, bots optional) or online
 * (`state.online`): public worlds `MUNDO1…` (codes with an O, which
 * `generateRoomCode` never makes) that never end, where the bot host lets
 * bots come and go so the map always has company, and a daily top
 * (`top/d{day}` in the first world) instead of a winner.
 */

export const COUNTDOWN_MS = 3500;
export const ONLINE_WORLDS = ["MUNDO1", "MUNDO2", "MUNDO3", "MUNDO4", "MUNDO5", "MUNDO6"];
/** People per world before the next one opens. */
export const ONLINE_MAX_PEOPLE = 10;
/** Snakes the bot host aims for in a world, people included. */
export const ONLINE_CROWD = [7, 12] as const;
const ONLINE_SIZE = 14;
const TOP_SIZE = 10;
/** After the clock, how long until any client closes the match. */
export const CLOSE_GRACE_MS = 1200;
export const MINUTE_OPTIONS = [2, 3, 5] as const;
/** Snakes on the map: 0 = just the people in the room. */
export const SNAKE_OPTIONS = [0, 6, 8, 10] as const;

export interface ViboraMeta {
  game: "vibora";
  hostId?: string;
  minutes: number;
  snakes: number;
  /** A public world (no host, no clock). */
  online: boolean;
  createdAt: number | object;
}

export type ViboraSettings = Pick<ViboraMeta, "minutes" | "snakes">;

export type ViboraStatus = "waiting" | "playing" | "finished";

export interface ViboraPlayer {
  name: string;
  color: string;
}

export interface ViboraState {
  status: ViboraStatus;
  /** A public world: always playing, no clock. */
  online: boolean;
  seed: number;
  gameNo: number;
  startedAt: number;
  endsAt: number;
  radius: number;
  pellets: number;
  players: Record<string, ViboraPlayer>;
  /** The extra snakes of this match (ids `bot…`). */
  bots: Record<string, ViboraPlayer>;
  /** Mass per snake when the match closed. */
  final: Record<string, number>;
  /** Matches won per id. */
  wins: Record<string, number>;
}

/** What each runner publishes about its snake. */
export interface ViboraPose {
  /** Game number, so a pose from the last match is ignored. */
  g: number;
  x: number;
  y: number;
  a: number;
  m: number;
  /** Boosting (1) / burning on the edge (2), bit flags. */
  f: number;
  /** Body points after the head, every NET_SEG: "x,y,x,y…". */
  p: string;
  /** Server time until which it can't be cut. */
  sh: number;
  /** Last cut it applied (`cuts/…/n`). */
  c: number;
  /** Server time it was sent. */
  t: number;
}

export interface ViboraCut {
  n: number;
  /** Length the victim keeps. */
  keep: number;
  by: string;
  gain: number;
  /** Server time. */
  at: number;
}

export function normalizeMeta(raw: Partial<ViboraMeta>): ViboraMeta {
  return {
    game: "vibora",
    hostId: raw.hostId,
    minutes: raw.minutes ?? 3,
    snakes: raw.snakes ?? 8,
    online: raw.online ?? false,
    createdAt: raw.createdAt ?? 0,
  };
}

function normalizeState(raw: Partial<ViboraState> | null): ViboraState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    online: raw.online ?? false,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    startedAt: raw.startedAt ?? 0,
    endsAt: raw.endsAt ?? 0,
    radius: raw.radius ?? arenaRadius(4),
    pellets: raw.pellets ?? foodCount(4),
    players: raw.players ?? {},
    bots: raw.bots ?? {},
    final: raw.final ?? {},
    wins: raw.wins ?? {},
  };
}

export const isBot = (id: string) => id.startsWith("bot");

/** Name and color of any snake of the match. */
export function snakeInfo(state: ViboraState, id: string): ViboraPlayer {
  return state.players[id] ?? state.bots[id] ?? { name: "?", color: "#64748b" };
}

export function encodeBody(s: Snake): string {
  const body = bodyOf(s, NET_SEG / SEG);
  const out: number[] = [];
  for (let i = 2; i < body.length; i++) out.push(Math.round(body[i]));
  return out.join(",");
}

export function decodeBody(p: string): number[] {
  if (!p) return [];
  return p.split(",").map(Number);
}

// ---- Firebase ------------------------------------------------------------

const base = (roomId: string) => `rooms/${roomId}/vibora`;
const statePath = (roomId: string) => `${base(roomId)}/state`;

function mutate(roomId: string, fn: (state: ViboraState) => ViboraState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createViboraRoom(hostId: string, settings: ViboraSettings): Promise<string> {
  const roomId = generateRoomCode();
  const meta: ViboraMeta = { game: "vibora", hostId, ...settings, online: false, createdAt: serverTimestamp() };
  const state: Partial<ViboraState> = { status: "waiting", seed: makeSeed(), gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getViboraMeta(roomId: string): Promise<Partial<ViboraMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeVibora(roomId: string, cb: (state: ViboraState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinVibora(roomId: string, clientId: string, player: ViboraPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

/** A fresh match: the clock, the arena's size and the extra snakes to reach `meta.snakes`. */
function newMatch(s: ViboraState, meta: ViboraSettings, connected: string[], gameNo: number): ViboraState {
  const people = connected.filter((id) => s.players[id]);
  const seed = makeSeed();
  const taken = new Set(people.map((id) => s.players[id].name.trim().toLowerCase()));
  const names = seededShuffle(BOT_NAMES, seed).filter((n) => !taken.has(n.toLowerCase()));
  const colors = seededShuffle([...PLAYER_COLORS, "#06b6d4", "#a3e635", "#f43f5e", "#d946ef"], seed + 1);
  const bots: Record<string, ViboraPlayer> = {};
  for (let i = 0; i < Math.max(0, meta.snakes - people.length); i++) {
    bots[`bot${i}`] = { name: names[i % names.length], color: colors[i % colors.length] };
  }
  const total = people.length + Object.keys(bots).length;
  const startedAt = serverNow() + COUNTDOWN_MS;
  return {
    ...s,
    status: "playing",
    seed,
    gameNo,
    startedAt,
    endsAt: startedAt + meta.minutes * 60_000,
    radius: arenaRadius(total),
    pellets: foodCount(total),
    bots,
    final: {},
  };
}

export function startVibora(roomId: string, meta: ViboraSettings, connected: string[]) {
  return mutate(roomId, (s) => (s.status === "waiting" ? newMatch(s, meta, connected, s.gameNo) : null)).then((res) => {
    if (res.committed) clearOld(roomId, (res.snapshot.val() as ViboraState).gameNo);
    return res;
  });
}

export function playAgain(roomId: string, expectedGame: number, meta: ViboraSettings, connected: string[]) {
  return mutate(roomId, (s) =>
    s.status === "finished" && s.gameNo === expectedGame ? newMatch(s, meta, connected, s.gameNo + 1) : null
  ).then((res) => {
    if (res.committed) clearOld(roomId, (res.snapshot.val() as ViboraState).gameNo);
    return res;
  });
}

/** Pellets and cuts of earlier matches aren't needed anymore. */
function clearOld(roomId: string, gameNo: number) {
  const patch: Record<string, null> = {};
  for (let g = Math.max(0, gameNo - 3); g < gameNo; g++) {
    patch[`${base(roomId)}/food/g${g}`] = null;
    patch[`${base(roomId)}/cuts/g${g}`] = null;
  }
  update(ref(getDb()), patch).catch(console.error);
}

/** Closes the match with the sizes this client sees (the first to close wins). */
export function closeVibora(roomId: string, gameNo: number, sizes: Record<string, number>) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.gameNo !== gameNo || serverNow() < s.endsAt) return null;
    const final: Record<string, number> = {};
    for (const [id, m] of Object.entries(sizes)) final[id] = Math.floor(m);
    const best = Math.max(0, ...Object.values(final));
    const top = Object.keys(final).filter((id) => final[id] === best);
    const wins = { ...s.wins };
    if (top.length === 1 && best > 0) wins[top[0]] = (wins[top[0]] ?? 0) + 1;
    return { ...s, status: "finished", final, wins };
  });
}

// ---- Pellets, cuts and poses ---------------------------------------------------

export function subscribeFood(roomId: string, gameNo: number, cb: (eaten: Record<string, number>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/food/g${gameNo}`), (snap) => cb(snap.val() ?? {}));
}

/** Eats pellet `i` in its `gen`-th life; resolves true if this client got it. */
export async function eatPellet(roomId: string, gameNo: number, i: number, gen: number): Promise<boolean> {
  const res = await runTransaction(ref(getDb(), `${base(roomId)}/food/g${gameNo}/f${i}`), (cur: number | null) =>
    (cur ?? 0) === gen ? gen + 1 : undefined
  );
  return res.committed;
}

export function subscribeCuts(roomId: string, gameNo: number, cb: (cuts: Record<string, ViboraCut>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/cuts/g${gameNo}`), (snap) => cb(snap.val() ?? {}));
}

/** Cuts `victim` keeping `keep` of its length; resolves true if this cut counted. */
export async function cutSnake(roomId: string, gameNo: number, victim: string, by: string, keep: number, gain: number): Promise<boolean> {
  const res = await runTransaction(ref(getDb(), `${base(roomId)}/cuts/g${gameNo}/${victim}`), (cur: ViboraCut | null) => {
    const now = serverNow();
    if (cur && now - cur.at < CUT_COOLDOWN_MS) return undefined;
    return { n: (cur?.n ?? 0) + 1, keep: Math.round(keep), by, gain, at: now };
  });
  return res.committed;
}

/** This client's own pose; removed when it disconnects. */
export function openPose(roomId: string, id: string) {
  const r = ref(getDb(), `${base(roomId)}/poses/${id}`);
  onDisconnect(r).remove().catch(console.error);
  return {
    send: (pose: ViboraPose) => set(r, pose).catch(console.error),
    /** Off the map for now (crashed), still removed on disconnect. */
    clear: () => remove(r).catch(console.error),
    close: () => {
      onDisconnect(r).cancel().catch(console.error);
      remove(r).catch(console.error);
    },
  };
}

/** The bot host's poses, in one write; they stay for the next bot host. */
export function sendBotPoses(roomId: string, poses: Record<string, ViboraPose>) {
  const patch: Record<string, ViboraPose> = {};
  for (const [id, p] of Object.entries(poses)) patch[`${base(roomId)}/poses/${id}`] = p;
  return update(ref(getDb()), patch).catch(console.error);
}

export function subscribePoses(roomId: string, cb: (poses: Record<string, ViboraPose>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/poses`), (snap) => cb(snap.val() ?? {}));
}

// ---- Online worlds -------------------------------------------------------------

/** Makes sure a public world exists (its meta and an always-on state). */
async function ensureWorld(roomId: string) {
  const db = getDb();
  await runTransaction(ref(db, `rooms/${roomId}/meta`), (cur: Partial<ViboraMeta> | null) =>
    cur ? undefined : { game: "vibora", minutes: 0, snakes: 0, online: true, createdAt: serverNow() }
  );
  await runTransaction(ref(db, statePath(roomId)), (cur: Partial<ViboraState> | null) =>
    cur
      ? undefined
      : {
          status: "playing",
          online: true,
          seed: makeSeed(),
          gameNo: 0,
          startedAt: 0,
          endsAt: 0,
          radius: arenaRadius(ONLINE_SIZE),
          pellets: foodCount(ONLINE_SIZE),
        }
  );
}

/** People connected per world (worlds nobody opened yet count 0). */
async function worldCrowds(): Promise<{ id: string; people: number; bots: number }[]> {
  const db = getDb();
  return Promise.all(
    ONLINE_WORLDS.map(async (id) => {
      const [presence, bots] = await Promise.all([
        get(ref(db, `rooms/${id}/presence`)),
        get(ref(db, `${statePath(id)}/bots`)),
      ]);
      return { id, people: presence.size, bots: bots.size };
    })
  );
}

/** Snakes moving in the worlds right now, for the lobby. */
export async function onlineCount(): Promise<number> {
  const crowds = await worldCrowds();
  return crowds.reduce((sum, w) => sum + (w.people ? w.people + w.bots : 0), 0);
}

/** The world to join: the busiest one with room left, so people meet each other. */
export async function enterOnline(): Promise<string> {
  const crowds = await worldCrowds();
  const open = crowds.filter((w) => w.people < ONLINE_MAX_PEOPLE).sort((a, b) => b.people - a.people);
  const id = open[0]?.id ?? ONLINE_WORLDS[0];
  await ensureWorld(id);
  return id;
}

/** The bot host lets one more snake in, with a name nobody has right now. */
export function addOnlineBot(roomId: string, busyNames: string[]) {
  return mutate(roomId, (s) => {
    if (!s.online) return null;
    const taken = new Set([...busyNames, ...Object.values(s.bots).map((b) => b.name)].map((n) => n.trim().toLowerCase()));
    const free = BOT_NAMES.filter((n) => !taken.has(n.toLowerCase()));
    if (!free.length) return null;
    const colors = [...PLAYER_COLORS, "#06b6d4", "#a3e635", "#f43f5e", "#d946ef"];
    const id = `bot${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
    const bot = { name: free[Math.floor(Math.random() * free.length)], color: colors[Math.floor(Math.random() * colors.length)] };
    return { ...s, bots: { ...s.bots, [id]: bot } };
  });
}

/** A bot "leaves" the world: out of the state and its pose gone. */
export async function removeOnlineBot(roomId: string, id: string) {
  const res = await mutate(roomId, (s) => {
    if (!s.online || !s.bots[id]) return null;
    const bots = { ...s.bots };
    delete bots[id];
    return { ...s, bots };
  });
  if (res.committed) {
    await update(ref(getDb()), {
      [`${base(roomId)}/poses/${id}`]: null,
      [`${base(roomId)}/cuts/g0/${id}`]: null,
    });
  }
}

// ---- Today's top (online) ----------------------------------------------------------

export interface TopEntry extends ViboraPlayer {
  best: number;
}

/** Today in Argentina (UTC−3), so the top resets at midnight there. */
function today(): string {
  return new Date(serverNow() - 3 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
}

const topRef = () => ref(getDb(), `${base(ONLINE_WORLDS[0])}/top/d${today()}`);

export function subscribeTop(cb: (top: TopEntry[]) => void): Unsubscribe {
  return onValue(topRef(), (snap) => {
    const raw = (snap.val() ?? {}) as Record<string, TopEntry>;
    cb(Object.values(raw).sort((a, b) => b.best - a.best));
  });
}

export async function getTop(): Promise<TopEntry[]> {
  const snap = await get(topRef());
  return Object.values((snap.val() ?? {}) as Record<string, TopEntry>).sort((a, b) => b.best - a.best);
}

/** Records a size if it's this snake's best today and makes the top 10. */
export function submitBest(id: string, player: ViboraPlayer, best: number) {
  return runTransaction(topRef(), (cur: Record<string, TopEntry> | null) => {
    const top = { ...(cur ?? {}) };
    if ((top[id]?.best ?? 0) >= best) return undefined;
    top[id] = { name: player.name, color: player.color, best };
    const keep = Object.entries(top)
      .sort((a, b) => b[1].best - a[1].best)
      .slice(0, TOP_SIZE);
    if (!keep.some(([k]) => k === id)) return undefined;
    return Object.fromEntries(keep);
  });
}

// ---- Crashes and remains (online) ------------------------------------------------

/** Remains last this long on the floor. */
export const DROP_LIFE_MS = 45_000;
/** Share of a crashed snake that falls as remains, and of a cut tail. */
export const CRASH_DROP_SHARE = 0.8;
export const CUT_DROP_SHARE = 0.5;

export interface ViboraDeath {
  n: number;
  name: string;
  /** Who it crashed into ("" = the edge), and their name. */
  by: string;
  byName: string;
  /** Its size when it crashed. */
  m: number;
  at: number;
}

export interface ViboraDrop {
  x: number;
  y: number;
  v: number;
  /** The color of the snake it came from. */
  c: string;
  at: number;
}

/** A snake's runner says it crashed. */
export function reportCrash(roomId: string, gameNo: number, id: string, name: string, by: string, byName: string, mass: number) {
  return runTransaction(ref(getDb(), `${base(roomId)}/deaths/g${gameNo}/${id}`), (cur: ViboraDeath | null) => ({
    n: (cur?.n ?? 0) + 1,
    name,
    by,
    byName,
    m: Math.floor(mass),
    at: serverNow(),
  }));
}

export function subscribeCrashes(roomId: string, gameNo: number, cb: (deaths: Record<string, ViboraDeath>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/deaths/g${gameNo}`), (snap) => cb(snap.val() ?? {}));
}

/** Leaves remains on the floor, in one write. */
export function dropRemains(roomId: string, drops: { x: number; y: number; v: number }[], color: string) {
  if (!drops.length) return Promise.resolve();
  const at = serverNow();
  const patch: Record<string, ViboraDrop> = {};
  for (const d of drops) {
    const key = push(ref(getDb(), `${base(roomId)}/drops`)).key!;
    patch[`${base(roomId)}/drops/${key}`] = { x: Math.round(d.x), y: Math.round(d.y), v: d.v, c: color, at };
  }
  return update(ref(getDb()), patch).catch(console.error);
}

export function subscribeDrops(roomId: string, cb: (drops: Record<string, ViboraDrop>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/drops`), (snap) => cb(snap.val() ?? {}));
}

/** Eats a remain; resolves true if this client got it. */
export async function eatDrop(roomId: string, key: string): Promise<boolean> {
  const res = await runTransaction(ref(getDb(), `${base(roomId)}/drops/${key}`), (cur: ViboraDrop | null) => (cur ? null : undefined));
  return res.committed;
}

/** Sweeps away remains nobody ate in time. */
export function clearDrops(roomId: string, keys: string[]) {
  if (!keys.length) return;
  const patch: Record<string, null> = {};
  for (const k of keys) patch[`${base(roomId)}/drops/${k}`] = null;
  update(ref(getDb()), patch).catch(console.error);
}
