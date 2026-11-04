import { get, onValue, ref, runTransaction, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode, PLAYER_COLORS } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { kickWorks, seatAngle, type Timeline } from "./tronco";

/**
 * El tronco in a room. The state holds the ring (`roster`, seat = index),
 * the start, the seed, the kicks (server times, in order) and who fell.
 * The log itself is computed by every phone from those (`lib/tronco.ts`).
 *
 * - A kick is a transaction that checks, with the timeline as the server
 *   has it, that the log was really coming at the kicker; a kick that lost
 *   the race to another one is rejected and the kicker's phone undoes it.
 * - Each phone judges its own player (and the bot host, the bots): when the
 *   log passed over them and they weren't in the air, `reportOut`. Jumps
 *   are only drawn by the others (`act/g{n}/{id}`), they don't need a check.
 * - Online: public rooms `TRONC1…` (an O and a 1: never generated codes)
 *   chaining matches, bots filling the ring.
 */

export const COUNTDOWN_MS = 4000;
export const ONLINE_COUNTDOWN_MS = 6000;
export const RESULTS_MS = 9000;
export const MAX_RING = 8;
export const BOT_OPTIONS = [0, 1, 3, 5, 7] as const;
export const ONLINE_WORLDS = ["TRONC1", "TRONC2", "TRONC3", "TRONC4"];
export const ONLINE_MAX_PEOPLE = 8;
const ONLINE_RING = 6;
export const PACES = { normal: 1, rapido: 1.25 } as const;
export type Pace = keyof typeof PACES;

export interface TroncoMeta {
  game: "tronco";
  hostId?: string;
  bots: number;
  pace: Pace;
  online: boolean;
  /** Made from "Contra bots": starts by itself, no waiting room. */
  solo: boolean;
  createdAt: number | object;
}

export type TroncoSettings = Pick<TroncoMeta, "bots" | "pace">;

export interface TroncoPlayer {
  name: string;
  color: string;
}

export interface TroncoState {
  status: "waiting" | "playing" | "finished";
  online: boolean;
  seed: number;
  gameNo: number;
  startedAt: number;
  pace: number;
  players: Record<string, TroncoPlayer>;
  bots: Record<string, TroncoPlayer>;
  roster: string[];
  kicks: number[];
  kickBy: string[];
  /** Server time each one fell. */
  out: Record<string, number>;
  winner: string;
  wins: Record<string, number>;
  nextAt: number;
}

/** What the others need to draw a player: last jump and kick (server times). */
export interface Act {
  j: number;
  k: number;
}

export function normalizeMeta(raw: Partial<TroncoMeta>): TroncoMeta {
  return {
    game: "tronco",
    hostId: raw.hostId,
    bots: raw.bots ?? 3,
    pace: raw.pace ?? "normal",
    online: raw.online ?? false,
    solo: raw.solo ?? false,
    createdAt: raw.createdAt ?? 0,
  };
}

function normalizeState(raw: Partial<TroncoState> | null): TroncoState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    online: raw.online ?? false,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    startedAt: raw.startedAt ?? 0,
    pace: raw.pace ?? 1,
    players: raw.players ?? {},
    bots: raw.bots ?? {},
    roster: raw.roster ?? [],
    kicks: raw.kicks ?? [],
    kickBy: raw.kickBy ?? [],
    out: raw.out ?? {},
    winner: raw.winner ?? "",
    wins: raw.wins ?? {},
    nextAt: raw.nextAt ?? 0,
  };
}

export const isBot = (id: string) => id.startsWith("bot");

export function playerInfo(s: TroncoState, id: string): TroncoPlayer {
  return s.players[id] ?? s.bots[id] ?? { name: "?", color: "#64748b" };
}

export function timelineOf(s: Pick<TroncoState, "startedAt" | "seed" | "kicks" | "pace">, extraKicks: number[] = []): Timeline {
  const kicks = extraKicks.length ? [...s.kicks, ...extraKicks].sort((a, b) => a - b) : s.kicks;
  return { startedAt: s.startedAt, seed: s.seed, kicks, pace: s.pace };
}

export function seatOf(s: Pick<TroncoState, "roster">, id: string): number {
  return seatAngle(s.roster.indexOf(id), s.roster.length);
}

export function botHost(connected: string[]): string {
  return [...connected].sort()[0] ?? "";
}

const base = (roomId: string) => `rooms/${roomId}/tronco`;
const statePath = (roomId: string) => `${base(roomId)}/state`;

function mutate(roomId: string, fn: (s: TroncoState) => TroncoState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createTroncoRoom(hostId: string, settings: TroncoSettings, solo = false): Promise<string> {
  const roomId = generateRoomCode();
  const meta: TroncoMeta = { game: "tronco", hostId, ...settings, online: false, solo, createdAt: serverTimestamp() };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: { status: "waiting", seed: makeSeed(), gameNo: 0 },
  });
  return roomId;
}

export async function getTroncoMeta(roomId: string): Promise<Partial<TroncoMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeTronco(roomId: string, cb: (s: TroncoState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinTronco(roomId: string, id: string, player: TroncoPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[id];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [id]: player } };
  });
}

function newGame(s: TroncoState, settings: TroncoSettings, connected: string[], gameNo: number): TroncoState {
  const seed = makeSeed();
  const people = connected.filter((id) => s.players[id]).slice(0, MAX_RING);
  const want = s.online ? Math.max(0, ONLINE_RING - people.length) : Math.min(settings.bots, MAX_RING - people.length);
  // Never alone in the ring.
  const count = Math.max(want, people.length < 2 ? 2 - people.length : 0);
  const names = ["Mati", "Sofi", "Nico", "Cami", "Juli", "Lucho", "Flor", "Tomi", "Agus", "Male", "Fede", "Rochi", "Santi", "Pili"];
  const taken = new Set(people.map((id) => s.players[id]?.name.trim().toLowerCase()));
  const free = seededShuffle(names, seed).filter((n) => !taken.has(n.toLowerCase()));
  const colors = seededShuffle([...PLAYER_COLORS, "#06b6d4", "#a3e635", "#f43f5e", "#d946ef"], seed + 1);
  const bots: Record<string, TroncoPlayer> = {};
  for (let i = 0; i < count; i++) bots[`bot${i}`] = { name: free[i % free.length], color: colors[i % colors.length] };
  return {
    ...s,
    status: "playing",
    seed,
    gameNo,
    startedAt: serverNow() + (s.online ? ONLINE_COUNTDOWN_MS : COUNTDOWN_MS),
    pace: PACES[settings.pace] ?? 1,
    bots,
    // People and bots mixed around the ring.
    roster: seededShuffle([...people, ...Object.keys(bots)], seed + 2),
    kicks: [],
    kickBy: [],
    out: {},
    winner: "",
    nextAt: 0,
  };
}

export function startTronco(roomId: string, settings: TroncoSettings, connected: string[]) {
  return mutate(roomId, (s) => (s.status === "waiting" ? newGame(s, settings, connected, s.gameNo) : null));
}

export function playAgain(roomId: string, expected: number, settings: TroncoSettings, connected: string[]) {
  return mutate(roomId, (s) => (s.status === "finished" && s.gameNo === expected ? newGame(s, settings, connected, s.gameNo + 1) : null));
}

/** A kick at server time t; rejected if the log wasn't coming (or another kick got there first). */
export function kick(roomId: string, gameNo: number, id: string, t: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.gameNo !== gameNo || s.out[id] || !s.roster.includes(id)) return null;
    if (t <= (s.kicks[s.kicks.length - 1] ?? 0)) return null;
    if (!kickWorks(timelineOf(s), t, seatOf(s, id))) return null;
    return { ...s, kicks: [...s.kicks, t], kickBy: [...s.kickBy, id] };
  });
}

/** Knocked down (once); the last one standing wins. */
export function reportOut(roomId: string, gameNo: number, id: string, t: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.gameNo !== gameNo || s.out[id] || !s.roster.includes(id)) return null;
    const out = { ...s.out, [id]: t };
    const standing = s.roster.filter((p) => !out[p]);
    if (standing.length > 1) return { ...s, out };
    // The last one standing, or (both fell at once) the one who fell last.
    const winner = standing[0] ?? Object.entries(out).sort((a, b) => b[1] - a[1])[0][0];
    const wins = { ...s.wins, [winner]: (s.wins[winner] ?? 0) + 1 };
    return { ...s, out, status: "finished", winner, wins, nextAt: s.online ? serverNow() + RESULTS_MS : 0 };
  });
}

export function sendAct(roomId: string, gameNo: number, id: string, act: Act) {
  return set(ref(getDb(), `${base(roomId)}/act/g${gameNo}/${id}`), act).catch(console.error);
}

export function subscribeActs(roomId: string, gameNo: number, cb: (acts: Record<string, Act>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/act/g${gameNo}`), (snap) => cb(snap.val() ?? {}));
}

// ---- Online ------------------------------------------------------------------

async function ensureWorld(roomId: string) {
  const db = getDb();
  await runTransaction(ref(db, `rooms/${roomId}/meta`), (cur: Partial<TroncoMeta> | null) =>
    cur ? undefined : { game: "tronco", bots: 0, pace: "normal", online: true, solo: false, createdAt: serverNow() }
  );
  await runTransaction(ref(db, statePath(roomId)), (cur: Partial<TroncoState> | null) =>
    cur ? undefined : { status: "finished", online: true, seed: makeSeed(), gameNo: 0, nextAt: 0 }
  );
}

async function worldCrowds() {
  const db = getDb();
  return Promise.all(ONLINE_WORLDS.map(async (id) => ({ id, people: (await get(ref(db, `rooms/${id}/presence`))).size })));
}

export async function onlineCount(): Promise<number> {
  return (await worldCrowds()).reduce((s, w) => s + w.people, 0);
}

export async function enterOnline(): Promise<string> {
  const crowds = await worldCrowds();
  const open = crowds.filter((w) => w.people < ONLINE_MAX_PEOPLE).sort((a, b) => b.people - a.people);
  const id = open[0]?.id ?? ONLINE_WORLDS[0];
  await ensureWorld(id);
  return id;
}

export function nextOnlineRound(roomId: string, connected: string[]) {
  return mutate(roomId, (s) => {
    if (!s.online || s.status === "playing" || serverNow() < s.nextAt) return null;
    return newGame(s, { bots: 0, pace: "normal" }, connected, s.gameNo + 1);
  });
}
