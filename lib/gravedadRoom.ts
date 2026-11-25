import { get, onValue, ref, runTransaction, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode, PLAYER_COLORS } from "./ids";
import { makeSeed, mulberry32, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { RIVAL_NAMES } from "./boardBot";
import { LEVEL_POOLS, LEVELS } from "./gravedadLevels";
import type { Dir } from "./gravedadSim";

/**
 * Gravedad Loca in a room: a race of a few rounds, one level each. Everyone
 * plays the same level at once on their own phone and sees the others as
 * ghosts (`poses/{rk}/{id}`, ~10 Hz, never collide). Reaching the goal is a
 * transaction (`reportFinish`); the first three score 3/2/1, everyone else who
 * finishes 1. A round closes when everyone finished, `GRACE_MS` after the
 * first, at `endsAt`, or when the rest left.
 *
 * Bots (friends' rooms: `meta.bots`; online: filling to `ONLINE_MIN_RACERS`)
 * are run by the bot host (lowest connected id): they play the level for real
 * with the solver's route (`lib/gravedadSolver.ts`), pausing now and then.
 *
 * Online (`state.online`): public rooms `GRAV01…` (a 0 and a 1, which
 * `generateRoomCode` never makes) chaining one-round games.
 */

export const DIFFICULTIES = [
  { id: "facil", label: "Fácil" },
  { id: "media", label: "Media" },
  { id: "dificil", label: "Difícil" },
] as const;
export type Difficulty = (typeof DIFFICULTIES)[number]["id"];
export const ROUND_OPTIONS = [3, 5] as const;
export const BOT_OPTIONS = [0, 1, 2, 3] as const;

export const COUNTDOWN_MS = 3000;
export const ONLINE_COUNTDOWN_MS = 5000;
export const GRACE_MS = 25_000;
const ROUND_MAX_MS = 3 * 60_000;
export const BETWEEN_MS = 6000;
export const RESULTS_MS = 9000;
export const ONLINE_WORLDS = ["GRAV01", "GRAV02", "GRAV03", "GRAV04"];
export const ONLINE_MAX_PEOPLE = 6;
const ONLINE_MIN_RACERS = 4;
const POINTS = [3, 2, 1];

export interface GravedadMeta {
  game: "gravedad";
  hostId?: string;
  rounds: number;
  difficulty: Difficulty;
  bots: number;
  online: boolean;
  createdAt: number | object;
}

export type GravedadSettings = Pick<GravedadMeta, "rounds" | "difficulty" | "bots">;

export interface GravedadPlayer {
  name: string;
  color: string;
}

export interface RoundResult {
  ms: number;
  deaths: number;
}

export interface GravedadState {
  status: "waiting" | "playing" | "finished";
  online: boolean;
  seed: number;
  gameNo: number;
  round: number;
  rounds: number;
  /** Index into LEVELS for each round. */
  levels: number[];
  phase: "playing" | "roundEnd";
  startedAt: number;
  endsAt: number;
  firstAt: number;
  nextAt: number;
  players: Record<string, GravedadPlayer>;
  bots: Record<string, GravedadPlayer>;
  /** Bots' skill, 0 (clumsy) – 1 (sharp). */
  botSkill: Record<string, number>;
  roster: string[];
  results: Record<string, RoundResult>;
  gained: Record<string, number>;
  scores: Record<string, number>;
  wins: Record<string, number>;
}

export function normalizeMeta(raw: Partial<GravedadMeta>): GravedadMeta {
  return {
    game: "gravedad",
    hostId: raw.hostId,
    rounds: raw.rounds ?? 3,
    difficulty: raw.difficulty ?? "facil",
    bots: raw.bots ?? 0,
    online: raw.online ?? false,
    createdAt: raw.createdAt ?? 0,
  };
}

function normalizeState(raw: Partial<GravedadState> | null): GravedadState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    online: raw.online ?? false,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    round: raw.round ?? 0,
    rounds: raw.rounds ?? 1,
    levels: raw.levels ?? [],
    phase: raw.phase ?? "playing",
    startedAt: raw.startedAt ?? 0,
    endsAt: raw.endsAt ?? 0,
    firstAt: raw.firstAt ?? 0,
    nextAt: raw.nextAt ?? 0,
    players: raw.players ?? {},
    bots: raw.bots ?? {},
    botSkill: raw.botSkill ?? {},
    roster: raw.roster ?? [],
    results: raw.results ?? {},
    gained: raw.gained ?? {},
    scores: raw.scores ?? {},
    wins: raw.wins ?? {},
  };
}

export const isBot = (id: string) => id.startsWith("bot");
export const roundKey = (s: Pick<GravedadState, "gameNo" | "round">) => `g${s.gameNo}r${s.round}`;
export const roundLevel = (s: Pick<GravedadState, "levels" | "round">) => LEVELS[s.levels[s.round] ?? 0] ?? LEVELS[0];

export function playerInfo(s: GravedadState, id: string): GravedadPlayer {
  return s.players[id] ?? s.bots[id] ?? { name: "?", color: "#64748b" };
}

export function botHost(connected: string[]): string {
  return [...connected].sort()[0] ?? "";
}

const base = (roomId: string) => `rooms/${roomId}/gravedad`;
const statePath = (roomId: string) => `${base(roomId)}/state`;

function mutate(roomId: string, fn: (s: GravedadState) => GravedadState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createGravedadRoom(hostId: string, settings: GravedadSettings): Promise<string> {
  const roomId = generateRoomCode();
  const meta: GravedadMeta = { game: "gravedad", hostId, ...settings, online: false, createdAt: serverTimestamp() };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: { status: "waiting", seed: makeSeed(), gameNo: 0 },
  });
  return roomId;
}

export async function getGravedadMeta(roomId: string): Promise<Partial<GravedadMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeGravedad(roomId: string, cb: (s: GravedadState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinGravedad(roomId: string, id: string, player: GravedadPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[id];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [id]: player } };
  });
}

function makeBots(s: GravedadState, people: string[], count: number, seed: number) {
  const taken = new Set(people.map((id) => s.players[id]?.name.trim().toLowerCase()));
  const free = seededShuffle(RIVAL_NAMES, seed).filter((n) => !taken.has(n.toLowerCase()));
  const colors = seededShuffle(PLAYER_COLORS, seed + 1);
  const rand = mulberry32(seed + 2);
  const bots: Record<string, GravedadPlayer> = {};
  const botSkill: Record<string, number> = {};
  for (let i = 0; i < count; i++) {
    bots[`bot${i}`] = { name: free[i % free.length], color: colors[i % colors.length] };
    botSkill[`bot${i}`] = Math.round(rand() * 100) / 100;
  }
  return { bots, botSkill };
}

function newGame(s: GravedadState, settings: GravedadSettings, connected: string[], gameNo: number): GravedadState {
  const seed = makeSeed();
  const people = connected.filter((id) => s.players[id]);
  const botCount = s.online ? Math.max(0, ONLINE_MIN_RACERS - people.length) : Math.max(settings.bots, people.length < 2 ? 1 : 0);
  const { bots, botSkill } = makeBots(s, people, botCount, seed);
  const pool = s.online ? [...LEVEL_POOLS.facil, ...LEVEL_POOLS.media, ...LEVEL_POOLS.dificil] : [...LEVEL_POOLS[settings.difficulty]];
  const levels = seededShuffle([...new Set(pool)], seed).slice(0, settings.rounds);
  const startedAt = serverNow() + (s.online ? ONLINE_COUNTDOWN_MS : COUNTDOWN_MS);
  return {
    ...s,
    status: "playing",
    seed,
    gameNo,
    round: 0,
    rounds: levels.length,
    levels,
    phase: "playing",
    startedAt,
    endsAt: startedAt + ROUND_MAX_MS,
    firstAt: 0,
    nextAt: 0,
    bots,
    botSkill,
    roster: [...people, ...Object.keys(bots)],
    results: {},
    gained: {},
    scores: {},
  };
}

export function startGravedad(roomId: string, settings: GravedadSettings, connected: string[]) {
  return mutate(roomId, (s) => (s.status === "waiting" ? newGame(s, settings, connected, s.gameNo) : null));
}

export function playAgain(roomId: string, expected: number, settings: GravedadSettings, connected: string[]) {
  return mutate(roomId, (s) => (s.status === "finished" && s.gameNo === expected ? newGame(s, settings, connected, s.gameNo + 1) : null));
}

function endRound(s: GravedadState): GravedadState {
  const done = Object.entries(s.results).sort((a, b) => a[1].ms - b[1].ms);
  const gained: Record<string, number> = {};
  done.forEach(([id], k) => (gained[id] = POINTS[k] ?? 1));
  const scores = { ...s.scores };
  for (const [id, p] of Object.entries(gained)) scores[id] = (scores[id] ?? 0) + p;
  const last = s.round >= s.rounds - 1;
  const next: GravedadState = { ...s, phase: "roundEnd", gained, scores, nextAt: serverNow() + (last ? RESULTS_MS : BETWEEN_MS) };
  if (!last) return next;
  const best = Math.max(0, ...Object.values(scores));
  const top = Object.keys(scores).filter((id) => scores[id] === best);
  const wins = { ...s.wins };
  if (best > 0 && top.length === 1) wins[top[0]] = (wins[top[0]] ?? 0) + 1;
  return { ...next, status: "finished", wins };
}

/** I reached the goal (once per round). */
export function reportFinish(roomId: string, gameNo: number, round: number, id: string, deaths: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.phase !== "playing" || s.gameNo !== gameNo || s.round !== round || s.results[id]) return null;
    const now = serverNow();
    const results = { ...s.results, [id]: { ms: Math.max(0, now - s.startedAt), deaths } };
    const next = { ...s, results, firstAt: s.firstAt || now };
    return s.roster.every((p) => results[p]) ? endRound(next) : next;
  });
}

/** Closes the round when time's up or the rest left (`gone`: people who did). */
export function closeRound(roomId: string, gameNo: number, round: number, gone: string[]) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.phase !== "playing" || s.gameNo !== gameNo || s.round !== round) return null;
    const now = serverNow();
    const done = s.roster.every((p) => s.results[p] || gone.includes(p));
    const late = now > s.endsAt || (s.firstAt > 0 && now > s.firstAt + GRACE_MS);
    return done || late ? endRound(s) : null;
  });
}

export function nextRound(roomId: string, gameNo: number, round: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.phase !== "roundEnd" || s.gameNo !== gameNo || s.round !== round || serverNow() < s.nextAt) return null;
    const startedAt = serverNow() + COUNTDOWN_MS;
    return { ...s, round: s.round + 1, phase: "playing", startedAt, endsAt: startedAt + ROUND_MAX_MS, firstAt: 0, results: {}, gained: {} };
  });
}

// ---- Ghosts -------------------------------------------------------------------

export interface Pose {
  x: number;
  y: number;
  g: Dir;
  face: -1 | 1;
  dead: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function sendPose(roomId: string, rk: string, id: string, p: Pose) {
  return set(ref(getDb(), `${base(roomId)}/poses/${rk}/${id}`), `${r2(p.x)},${r2(p.y)},${p.g},${p.face},${p.dead ? 1 : 0}`).catch(() => {});
}

export function parsePose(s: unknown): Pose | null {
  if (typeof s !== "string") return null;
  const [x, y, g, face, dead] = s.split(",").map(Number);
  if (![x, y, g].every(Number.isFinite)) return null;
  return { x, y, g: ((g | 0) & 3) as Dir, face: face < 0 ? -1 : 1, dead: dead === 1 };
}

export function subscribePoses(roomId: string, rk: string, cb: (poses: Record<string, Pose>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/poses/${rk}`), (snap) => {
    const out: Record<string, Pose> = {};
    for (const [id, v] of Object.entries((snap.val() ?? {}) as Record<string, unknown>)) {
      const p = parsePose(v);
      if (p) out[id] = p;
    }
    cb(out);
  });
}

// ---- Online ----------------------------------------------------------------------

async function ensureWorld(roomId: string) {
  const db = getDb();
  await runTransaction(ref(db, `rooms/${roomId}/meta`), (cur: Partial<GravedadMeta> | null) =>
    cur ? undefined : { game: "gravedad", rounds: 1, difficulty: "media", bots: 0, online: true, createdAt: serverNow() }
  );
  await runTransaction(ref(db, statePath(roomId)), (cur: Partial<GravedadState> | null) =>
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
    return newGame(s, { rounds: 1, difficulty: "media", bots: 0 }, connected, s.gameNo + 1);
  });
}
