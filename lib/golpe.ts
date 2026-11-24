import { get, onDisconnect, onValue, push, ref, remove, runTransaction, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode, PLAYER_COLORS } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import type { TeamId } from "./teams";
import { rowsFor } from "./golpeMap";
import { BAG_MAX, BOT_NAMES_GOLPE, STEAL_SHIELD_MS, STEAL_TAKE, type BotLevel } from "./golpeSim";

/**
 * El gran golpe: thieves in a generated building, everyone at once, for a few
 * minutes. Diamonds only count once carried to an exit. No authority, like
 * Viborita: each phone runs its own thief and writes its pose (`poses/{id}`,
 * ~10 Hz); the bot host (the connected person with the lowest id) runs the
 * bots. Security is never sent: it's a function of the seed and the clock
 * (`lib/golpeMap.ts`), and each runner decides when its own thief is caught.
 *
 * - `loot/g{n}/{id}` (`Loot`) is the score: the bag and what's banked, plus
 *   counters of times robbed (`sn`) and caught (`cn`) for everyone's feed. It
 *   only changes by transaction: picking up, banking, robbing, getting caught.
 * - `gems/g{n}/d{i}` = `{n, at}`: diamond i was taken n times, last at `at`;
 *   it lies at `gemAt(map, i, n)` again `GEM_RESPAWN_MS` later.
 * - `drops/g{n}/{key}`: diamonds dropped when someone is caught, for anyone.
 */

export const COUNTDOWN_MS = 3500;
export const CLOSE_GRACE_MS = 1500;
export const GEM_RESPAWN_MS = 9000;
export const MINUTE_OPTIONS = [3, 4, 6] as const;
export const BOT_OPTIONS = [0, 1, 2, 3, 4, 5] as const;
export const MAX_THIEVES = 8;

export type GolpeMode = "todos" | "equipos";

export interface GolpeMeta {
  game: "golpe";
  hostId?: string;
  mode: GolpeMode;
  minutes: number;
  bots: number;
  botLevel: BotLevel;
  createdAt: number | object;
}

export type GolpeSettings = Pick<GolpeMeta, "mode" | "minutes" | "bots" | "botLevel">;

export type GolpeStatus = "waiting" | "playing" | "finished";

export interface GolpePlayer {
  name: string;
  color: string;
}

export interface GolpeState {
  status: GolpeStatus;
  mode: GolpeMode;
  botLevel: BotLevel;
  seed: number;
  gameNo: number;
  /** Building rows (3 or 4), fixed per match. */
  rows: number;
  startedAt: number;
  endsAt: number;
  players: Record<string, GolpePlayer>;
  /** Teams: chosen while waiting, fixed (and filled) at the start. */
  teams: Record<string, TeamId>;
  bots: Record<string, GolpePlayer>;
  /** Exit index (0–3) where each thief appears. */
  slots: Record<string, number>;
  /** Banked diamonds per thief when the match closed. */
  final: Record<string, number>;
  winTeam: TeamId | "";
  /** Matches won per id. */
  wins: Record<string, number>;
}

export interface Loot {
  bag: number;
  bank: number;
  /** Times robbed, who did it last, how many, when (server ms). */
  sn: number;
  by: string;
  k: number;
  sat: number;
  /** Times caught, and how many diamonds fell the last time. */
  cn: number;
  lost: number;
}

export interface GolpePose {
  g: number;
  x: number;
  y: number;
  a: number;
  /** Bit flags: 1 handcuffed, 2 just robbed someone (lunge), 4 safe after coming back. */
  f: number;
  t: number;
}

export interface GemTaken {
  n: number;
  at: number;
}

export interface GolpeDrop {
  x: number;
  y: number;
  v: number;
  at: number;
}

export function normalizeMeta(raw: Partial<GolpeMeta>): GolpeMeta {
  return {
    game: "golpe",
    hostId: raw.hostId,
    mode: raw.mode ?? "todos",
    minutes: raw.minutes ?? 4,
    bots: raw.bots ?? 3,
    botLevel: raw.botLevel ?? "normal",
    createdAt: raw.createdAt ?? 0,
  };
}

function normalizeState(raw: Partial<GolpeState> | null): GolpeState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    mode: raw.mode ?? "todos",
    botLevel: raw.botLevel ?? "normal",
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    rows: raw.rows ?? 3,
    startedAt: raw.startedAt ?? 0,
    endsAt: raw.endsAt ?? 0,
    players: raw.players ?? {},
    teams: raw.teams ?? {},
    bots: raw.bots ?? {},
    slots: raw.slots ?? {},
    final: raw.final ?? {},
    winTeam: raw.winTeam ?? "",
    wins: raw.wins ?? {},
  };
}

export function normalizeLoot(raw: Partial<Loot> | null | undefined): Loot {
  return {
    bag: raw?.bag ?? 0,
    bank: raw?.bank ?? 0,
    sn: raw?.sn ?? 0,
    by: raw?.by ?? "",
    k: raw?.k ?? 0,
    sat: raw?.sat ?? 0,
    cn: raw?.cn ?? 0,
    lost: raw?.lost ?? 0,
  };
}

export const isBot = (id: string) => id.startsWith("bot");

/** Every thief of the match (people with a slot and the bots). */
export function thieves(state: GolpeState): string[] {
  return Object.keys(state.slots).filter((id) => state.players[id] || state.bots[id]);
}

export function thiefInfo(state: GolpeState, id: string): GolpePlayer {
  return state.players[id] ?? state.bots[id] ?? { name: "?", color: "#64748b" };
}

export function teamOf(state: GolpeState, id: string): TeamId | null {
  return state.mode === "equipos" ? (state.teams[id] ?? null) : null;
}

/** Two thieves that can't rob each other. */
export function sameTeam(state: GolpeState, a: string, b: string): boolean {
  const ta = teamOf(state, a);
  return !!ta && ta === teamOf(state, b);
}

// ---- Firebase ------------------------------------------------------------

const base = (roomId: string) => `rooms/${roomId}/golpe`;
const statePath = (roomId: string) => `${base(roomId)}/state`;

function mutate(roomId: string, fn: (state: GolpeState) => GolpeState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createGolpeRoom(hostId: string, settings: GolpeSettings): Promise<string> {
  const roomId = generateRoomCode();
  const meta: GolpeMeta = { game: "golpe", hostId, ...settings, createdAt: serverTimestamp() };
  const state: Partial<GolpeState> = { status: "waiting", mode: settings.mode, botLevel: settings.botLevel, seed: makeSeed(), gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export function subscribeGolpe(roomId: string, cb: (state: GolpeState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

const teamCount = (s: GolpeState, team: TeamId, ids: string[]) => ids.filter((id) => s.teams[id] === team).length;

/** The exit for a new thief: the least used of the ones it may use. */
function freeSlot(s: GolpeState, team: TeamId | null): number {
  const options = team === "red" ? [0, 1] : team === "blue" ? [2, 3] : [0, 3, 1, 2];
  const used = Object.values(s.slots);
  let best = options[0];
  for (const o of options) if (used.filter((u) => u === o).length < used.filter((u) => u === best).length) best = o;
  return best;
}

/** Enters the room; mid-match, a newcomer joins the heist (and the smaller team). */
export function joinGolpe(roomId: string, clientId: string, player: GolpePlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    const joinNow = s.status === "playing" && s.slots[clientId] === undefined && thieves(s).length < MAX_THIEVES;
    if (!joinNow && known?.name === player.name && known?.color === player.color) return null;
    const next = { ...s, players: { ...s.players, [clientId]: player } };
    if (joinNow) {
      let team: TeamId | null = null;
      if (s.mode === "equipos") {
        const ids = thieves(s);
        team = teamCount(s, "red", ids) <= teamCount(s, "blue", ids) ? "red" : "blue";
        next.teams = { ...s.teams, [clientId]: team };
      }
      next.slots = { ...s.slots, [clientId]: freeSlot(s, team) };
    }
    return next;
  });
}

/** Picks a team while waiting (null = no preference). */
export function chooseTeam(roomId: string, clientId: string, team: TeamId | null) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting" || (s.teams[clientId] ?? null) === team) return null;
    const teams = { ...s.teams };
    if (team) teams[clientId] = team;
    else delete teams[clientId];
    return { ...s, teams };
  });
}

export function shuffleTeams(roomId: string, connected: string[]) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting") return null;
    const ids = seededShuffle(
      connected.filter((id) => s.players[id]),
      makeSeed()
    );
    const teams: Record<string, TeamId> = {};
    ids.forEach((id, i) => (teams[id] = i % 2 ? "blue" : "red"));
    return { ...s, teams };
  });
}

/** A fresh match: who plays, the teams (bots even them out), the exits and the clock. */
function newMatch(s: GolpeState, meta: GolpeSettings, connected: string[], gameNo: number): GolpeState {
  const seed = makeSeed();
  const people = connected.filter((id) => s.players[id]).slice(0, MAX_THIEVES);
  const botCount = Math.max(people.length < 2 ? 1 : 0, Math.min(meta.bots, MAX_THIEVES - people.length));
  const taken = new Set(people.map((id) => s.players[id].name.trim().toLowerCase()));
  const names = seededShuffle(BOT_NAMES_GOLPE, seed).filter((n) => !taken.has(n.toLowerCase()));
  const colors = seededShuffle([...PLAYER_COLORS, "#06b6d4", "#a3e635", "#f43f5e", "#d946ef"], seed + 1);
  const bots: Record<string, GolpePlayer> = {};
  for (let i = 0; i < botCount; i++) bots[`bot${i}`] = { name: names[i % names.length], color: colors[i % colors.length] };

  const teams: Record<string, TeamId> = {};
  const slots: Record<string, number> = {};
  const all = [...people, ...Object.keys(bots)];
  if (meta.mode === "equipos") {
    // People keep the team they picked; the rest (and then the bots) go to the smaller one.
    const count = (t: TeamId) => Object.values(teams).filter((x) => x === t).length;
    for (const id of people) if (s.teams[id]) teams[id] = s.teams[id];
    for (const id of all) {
      if (teams[id]) continue;
      teams[id] = count("red") <= count("blue") ? "red" : "blue";
    }
    const seen: Record<TeamId, number> = { red: 0, blue: 0 };
    for (const id of all) {
      const t = teams[id];
      slots[id] = (t === "red" ? 0 : 2) + (seen[t]++ % 2);
    }
  } else {
    const order = [0, 3, 1, 2];
    all.forEach((id, i) => (slots[id] = order[i % 4]));
  }
  const startedAt = serverNow() + COUNTDOWN_MS;
  return {
    ...s,
    status: "playing",
    mode: meta.mode,
    botLevel: meta.botLevel,
    seed,
    gameNo,
    rows: rowsFor(all.length),
    startedAt,
    endsAt: startedAt + meta.minutes * 60_000,
    teams: meta.mode === "equipos" ? teams : s.teams,
    bots,
    slots,
    final: {},
    winTeam: "",
  };
}

export function startGolpe(roomId: string, meta: GolpeSettings, connected: string[]) {
  return mutate(roomId, (s) => (s.status === "waiting" ? newMatch(s, meta, connected, s.gameNo) : null)).then((res) => {
    if (res.committed) clearOld(roomId, (res.snapshot.val() as GolpeState).gameNo);
    return res;
  });
}

export function playAgain(roomId: string, expectedGame: number, meta: GolpeSettings, connected: string[]) {
  return mutate(roomId, (s) =>
    s.status === "finished" && s.gameNo === expectedGame ? newMatch(s, meta, connected, s.gameNo + 1) : null
  ).then((res) => {
    if (res.committed) clearOld(roomId, (res.snapshot.val() as GolpeState).gameNo);
    return res;
  });
}

/** Loot, diamonds and drops of earlier matches aren't needed anymore. */
function clearOld(roomId: string, gameNo: number) {
  const patch: Record<string, null> = {};
  for (let g = Math.max(0, gameNo - 3); g < gameNo; g++) {
    for (const k of ["loot", "gems", "drops"]) patch[`${base(roomId)}/${k}/g${g}`] = null;
  }
  update(ref(getDb()), patch).catch(console.error);
}

/** Team totals from the banked diamonds. */
export function teamTotals(state: GolpeState, bank: Record<string, number>): Record<TeamId, number> {
  const out: Record<TeamId, number> = { red: 0, blue: 0 };
  for (const id of thieves(state)) {
    const t = state.teams[id];
    if (t) out[t] += bank[id] ?? 0;
  }
  return out;
}

/** Closes the match with the loot this client sees (it's the synced score, so every closer agrees). */
export function closeGolpe(roomId: string, gameNo: number, loot: Record<string, Loot>) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.gameNo !== gameNo || serverNow() < s.endsAt) return null;
    const final: Record<string, number> = {};
    for (const id of thieves(s)) final[id] = loot[id]?.bank ?? 0;
    const wins = { ...s.wins };
    let winTeam: TeamId | "" = "";
    if (s.mode === "equipos") {
      const tot = teamTotals(s, final);
      winTeam = tot.red > tot.blue ? "red" : tot.blue > tot.red ? "blue" : "";
      if (winTeam) for (const id of thieves(s)) if (s.teams[id] === winTeam) wins[id] = (wins[id] ?? 0) + 1;
    } else {
      const best = Math.max(0, ...Object.values(final));
      const top = Object.keys(final).filter((id) => final[id] === best);
      if (top.length === 1 && best > 0) wins[top[0]] = (wins[top[0]] ?? 0) + 1;
    }
    return { ...s, status: "finished", final, winTeam, wins };
  });
}

// ---- Loot ------------------------------------------------------------------------

const lootRef = (roomId: string, gameNo: number, id: string) => ref(getDb(), `${base(roomId)}/loot/g${gameNo}/${id}`);

export function subscribeLoot(roomId: string, gameNo: number, cb: (loot: Record<string, Loot>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/loot/g${gameNo}`), (snap) => {
    const raw = (snap.val() ?? {}) as Record<string, Partial<Loot>>;
    const out: Record<string, Loot> = {};
    for (const [id, l] of Object.entries(raw)) out[id] = normalizeLoot(l);
    cb(out);
  });
}

/** Adds to a bag (up to BAG_MAX); resolves how many went in. */
async function addToBag(roomId: string, gameNo: number, id: string, v: number): Promise<number> {
  let added = 0;
  await runTransaction(lootRef(roomId, gameNo, id), (cur: Partial<Loot> | null) => {
    const l = normalizeLoot(cur);
    added = Math.min(v, BAG_MAX - l.bag);
    if (added <= 0) return undefined;
    return { ...l, bag: l.bag + added };
  });
  return added;
}

export function subscribeGems(roomId: string, gameNo: number, cb: (gems: Record<string, GemTaken>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/gems/g${gameNo}`), (snap) => cb(snap.val() ?? {}));
}

/** Takes diamond i in its `gen`-th life; resolves how many went into the bag (0 = someone was first). */
export async function takeGem(roomId: string, gameNo: number, id: string, i: number, gen: number, value: number): Promise<number> {
  const res = await runTransaction(ref(getDb(), `${base(roomId)}/gems/g${gameNo}/d${i}`), (cur: GemTaken | null) => {
    if ((cur?.n ?? 0) !== gen) return undefined;
    if (cur && serverNow() < cur.at + GEM_RESPAWN_MS) return undefined;
    return { n: gen + 1, at: serverNow() };
  });
  if (!res.committed) return 0;
  return addToBag(roomId, gameNo, id, value);
}

export function subscribeDrops(roomId: string, gameNo: number, cb: (drops: Record<string, GolpeDrop>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/drops/g${gameNo}`), (snap) => cb(snap.val() ?? {}));
}

/** Picks up a dropped diamond; resolves how many went into the bag. */
export async function takeDrop(roomId: string, gameNo: number, id: string, key: string): Promise<number> {
  let v = 0;
  const res = await runTransaction(ref(getDb(), `${base(roomId)}/drops/g${gameNo}/${key}`), (cur: GolpeDrop | null) => {
    if (!cur) return undefined;
    v = cur.v;
    return null;
  });
  if (!res.committed || !v) return 0;
  return addToBag(roomId, gameNo, id, v);
}

/** Empties the bag into the exit; resolves how many were banked. */
export async function bankBag(roomId: string, gameNo: number, id: string): Promise<number> {
  let banked = 0;
  await runTransaction(lootRef(roomId, gameNo, id), (cur: Partial<Loot> | null) => {
    const l = normalizeLoot(cur);
    banked = l.bag;
    if (!banked) return undefined;
    return { ...l, bag: 0, bank: l.bank + l.bag };
  });
  return banked;
}

/** Robs up to STEAL_TAKE from `victim`'s bag into `by`'s; resolves how many. */
export async function robThief(roomId: string, gameNo: number, victim: string, by: string, room: number): Promise<number> {
  let k = 0;
  const res = await runTransaction(lootRef(roomId, gameNo, victim), (cur: Partial<Loot> | null) => {
    const l = normalizeLoot(cur);
    const now = serverNow();
    k = Math.min(STEAL_TAKE, l.bag, room);
    if (k <= 0 || now - l.sat < STEAL_SHIELD_MS) return undefined;
    return { ...l, bag: l.bag - k, sn: l.sn + 1, by, k, sat: now };
  });
  if (!res.committed || k <= 0) return 0;
  return addToBag(roomId, gameNo, by, k);
}

/** A thief got caught: half its bag (rounded up) falls; resolves how many. */
export async function getCaught(roomId: string, gameNo: number, id: string): Promise<number> {
  let lost = 0;
  await runTransaction(lootRef(roomId, gameNo, id), (cur: Partial<Loot> | null) => {
    const l = normalizeLoot(cur);
    lost = Math.ceil(l.bag / 2);
    return { ...l, bag: l.bag - lost, cn: l.cn + 1, lost };
  });
  return lost;
}

/** Leaves fallen diamonds on the floor, in one write. */
export function dropDiamonds(roomId: string, gameNo: number, drops: { x: number; y: number }[]) {
  if (!drops.length) return Promise.resolve();
  const at = serverNow();
  const patch: Record<string, GolpeDrop> = {};
  for (const d of drops) {
    const key = push(ref(getDb(), `${base(roomId)}/drops/g${gameNo}`)).key!;
    patch[`${base(roomId)}/drops/g${gameNo}/${key}`] = { x: Math.round(d.x * 100) / 100, y: Math.round(d.y * 100) / 100, v: 1, at };
  }
  return update(ref(getDb()), patch).catch(console.error);
}

// ---- Poses ---------------------------------------------------------------------

/** This client's own pose; removed when it disconnects. */
export function openPose(roomId: string, id: string) {
  const r = ref(getDb(), `${base(roomId)}/poses/${id}`);
  onDisconnect(r).remove().catch(console.error);
  return {
    send: (pose: GolpePose) => set(r, pose).catch(console.error),
    close: () => {
      onDisconnect(r).cancel().catch(console.error);
      remove(r).catch(console.error);
    },
  };
}

/** The bot host's poses, in one write; they stay for the next bot host. */
export function sendBotPoses(roomId: string, poses: Record<string, GolpePose>) {
  const patch: Record<string, GolpePose> = {};
  for (const [id, p] of Object.entries(poses)) patch[`${base(roomId)}/poses/${id}`] = p;
  return update(ref(getDb()), patch).catch(console.error);
}

export function subscribePoses(roomId: string, cb: (poses: Record<string, GolpePose>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/poses`), (snap) => cb(snap.val() ?? {}));
}

export async function getGolpeMeta(roomId: string): Promise<Partial<GolpeMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}
