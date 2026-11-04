import { get, onValue, ref, runTransaction, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode, PLAYER_COLORS } from "./ids";
import { makeSeed, mulberry32, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { generatePuzzle, totalCrossings, type Puzzle } from "./puentes";

/**
 * Puentes in a room: a race of a few rounds. Every round everyone gets the
 * same generated map (from `seed` + round) and solves it on their own phone;
 * the first right answers score (3, 2, then 1). A wrong "no se puede" scores
 * nothing that round. Each player writes only `prog/{rk}/{id}` (bridges
 * crossed, never which ones); results and rounds go through transactions.
 *
 * Online (`state.online`): public rooms `PUENT1…` (codes with a 1, which
 * `generateRoomCode` never makes) chaining one-round games, with bots that
 * "finish" at a time drawn from the map's size.
 */

export const DIFFICULTIES = [
  { id: "facil", label: "Fácil", level: 3 },
  { id: "media", label: "Media", level: 7 },
  { id: "dificil", label: "Difícil", level: 12 },
] as const;
export type Difficulty = (typeof DIFFICULTIES)[number]["id"];
export const ROUND_OPTIONS = [3, 5, 7] as const;

export const COUNTDOWN_MS = 3000;
export const ONLINE_COUNTDOWN_MS = 5000;
/** After the first right answer, the rest have this long. */
export const GRACE_MS = 40_000;
const ROUND_MAX_MS = 4 * 60_000;
/** Between rounds (the solution is shown). */
export const BETWEEN_MS = 8000;
export const RESULTS_MS = 10_000;
export const ONLINE_WORLDS = ["PUENT1", "PUENT2", "PUENT3", "PUENT4"];
export const ONLINE_MAX_PEOPLE = 8;
const ONLINE_MIN_RACERS = 3;
const POINTS = [3, 2];

export interface PuentesMeta {
  game: "puentes";
  hostId?: string;
  rounds: number;
  difficulty: Difficulty;
  /** One-way, double and impossible maps. */
  tricks: boolean;
  online: boolean;
  createdAt: number | object;
}

export type PuentesSettings = Pick<PuentesMeta, "rounds" | "difficulty" | "tricks">;

export interface PuentesPlayer {
  name: string;
  color: string;
}

export interface RoundResult {
  ms: number;
  /** Solved, or rightly said it can't be done. */
  ok: boolean;
  /** Said "no se puede". */
  claim: boolean;
}

export interface PuentesState {
  status: "waiting" | "playing" | "finished";
  online: boolean;
  seed: number;
  gameNo: number;
  round: number;
  rounds: number;
  /** The map's level for each round. */
  levels: number[];
  tricks: boolean;
  phase: "playing" | "roundEnd";
  startedAt: number;
  endsAt: number;
  firstAt: number;
  nextAt: number;
  players: Record<string, PuentesPlayer>;
  bots: Record<string, PuentesPlayer>;
  roster: string[];
  results: Record<string, RoundResult>;
  /** Points this round, kept for the round's screen. */
  gained: Record<string, number>;
  scores: Record<string, number>;
  wins: Record<string, number>;
}

export function normalizeMeta(raw: Partial<PuentesMeta>): PuentesMeta {
  return {
    game: "puentes",
    hostId: raw.hostId,
    rounds: raw.rounds ?? 5,
    difficulty: raw.difficulty ?? "media",
    tricks: raw.tricks ?? true,
    online: raw.online ?? false,
    createdAt: raw.createdAt ?? 0,
  };
}

function normalizeState(raw: Partial<PuentesState> | null): PuentesState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    online: raw.online ?? false,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    round: raw.round ?? 0,
    rounds: raw.rounds ?? 1,
    levels: raw.levels ?? [],
    tricks: raw.tricks ?? true,
    phase: raw.phase ?? "playing",
    startedAt: raw.startedAt ?? 0,
    endsAt: raw.endsAt ?? 0,
    firstAt: raw.firstAt ?? 0,
    nextAt: raw.nextAt ?? 0,
    players: raw.players ?? {},
    bots: raw.bots ?? {},
    roster: raw.roster ?? [],
    results: raw.results ?? {},
    gained: raw.gained ?? {},
    scores: raw.scores ?? {},
    wins: raw.wins ?? {},
  };
}

/** The map of the current round, the same on every phone. */
export function roundPuzzle(s: Pick<PuentesState, "seed" | "round" | "levels" | "tricks">): Puzzle {
  return generatePuzzle(s.seed + s.round * 7919, s.levels[s.round] ?? 6, s.tricks);
}

export const isBot = (id: string) => id.startsWith("bot");
export const roundKey = (s: Pick<PuentesState, "gameNo" | "round">) => `g${s.gameNo}r${s.round}`;

export function playerInfo(s: PuentesState, id: string): PuentesPlayer {
  return s.players[id] ?? s.bots[id] ?? { name: "?", color: "#64748b" };
}

export function botHost(connected: string[]): string {
  return [...connected].sort()[0] ?? "";
}

const base = (roomId: string) => `rooms/${roomId}/puentes`;
const statePath = (roomId: string) => `${base(roomId)}/state`;

function mutate(roomId: string, fn: (s: PuentesState) => PuentesState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createPuentesRoom(hostId: string, settings: PuentesSettings): Promise<string> {
  const roomId = generateRoomCode();
  const meta: PuentesMeta = { game: "puentes", hostId, ...settings, online: false, createdAt: serverTimestamp() };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: { status: "waiting", seed: makeSeed(), gameNo: 0 },
  });
  return roomId;
}

export async function getPuentesMeta(roomId: string): Promise<Partial<PuentesMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribePuentes(roomId: string, cb: (s: PuentesState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinPuentes(roomId: string, id: string, player: PuentesPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[id];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [id]: player } };
  });
}

function makeBots(s: PuentesState, people: string[], count: number, seed: number): Record<string, PuentesPlayer> {
  const names = ["Mati", "Sofi", "Nico", "Cami", "Juli", "Lucho", "Flor", "Tomi", "Agus", "Male", "Fede", "Rochi", "Santi", "Pili", "Facu", "Vicky"];
  const taken = new Set(people.map((id) => s.players[id]?.name.trim().toLowerCase()));
  const free = seededShuffle(names, seed).filter((n) => !taken.has(n.toLowerCase()));
  const colors = seededShuffle(PLAYER_COLORS, seed + 1);
  const bots: Record<string, PuentesPlayer> = {};
  for (let i = 0; i < count; i++) bots[`bot${i}`] = { name: free[i % free.length], color: colors[i % colors.length] };
  return bots;
}

function newGame(s: PuentesState, settings: PuentesSettings, connected: string[], gameNo: number): PuentesState {
  const seed = makeSeed();
  const people = connected.filter((id) => s.players[id]);
  const bots = s.online ? makeBots(s, people, Math.max(0, ONLINE_MIN_RACERS - people.length), seed) : {};
  const rand = mulberry32(seed);
  const base = DIFFICULTIES.find((d) => d.id === settings.difficulty)?.level ?? 7;
  // Each round a bit harder than the last; online, anything from medium to hard.
  const levels = Array.from({ length: settings.rounds }, (_, r) => (s.online ? 6 + Math.floor(rand() * 7) : base + r));
  const startedAt = serverNow() + (s.online ? ONLINE_COUNTDOWN_MS : COUNTDOWN_MS);
  return {
    ...s,
    status: "playing",
    seed,
    gameNo,
    round: 0,
    rounds: settings.rounds,
    levels,
    tricks: settings.tricks,
    phase: "playing",
    startedAt,
    endsAt: startedAt + ROUND_MAX_MS,
    firstAt: 0,
    nextAt: 0,
    bots,
    roster: [...people, ...Object.keys(bots)],
    results: {},
    gained: {},
    scores: {},
  };
}

export function startPuentes(roomId: string, settings: PuentesSettings, connected: string[]) {
  return mutate(roomId, (s) => (s.status === "waiting" ? newGame(s, settings, connected, s.gameNo) : null));
}

export function playAgain(roomId: string, expected: number, settings: PuentesSettings, connected: string[]) {
  return mutate(roomId, (s) => (s.status === "finished" && s.gameNo === expected ? newGame(s, settings, connected, s.gameNo + 1) : null));
}

/** Points for the round's right answers by arrival, then the round's end. */
function endRound(s: PuentesState): PuentesState {
  const right = Object.entries(s.results)
    .filter(([, r]) => r.ok)
    .sort((a, b) => a[1].ms - b[1].ms);
  const gained: Record<string, number> = {};
  right.forEach(([id], k) => (gained[id] = POINTS[k] ?? 1));
  const scores = { ...s.scores };
  for (const [id, p] of Object.entries(gained)) scores[id] = (scores[id] ?? 0) + p;
  const last = s.round >= s.rounds - 1;
  const next: PuentesState = { ...s, phase: "roundEnd", gained, scores, nextAt: serverNow() + (last ? RESULTS_MS : BETWEEN_MS) };
  if (!last) return next;
  const best = Math.max(0, ...Object.values(scores));
  const wins = { ...s.wins };
  const top = Object.keys(scores).filter((id) => scores[id] === best);
  if (best > 0 && top.length === 1) wins[top[0]] = (wins[top[0]] ?? 0) + 1;
  return { ...next, status: "finished", wins };
}

/** My answer for this round (once): solved, or "no se puede". */
export function submitResult(roomId: string, gameNo: number, round: number, id: string, result: { ok: boolean; claim: boolean }) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.phase !== "playing" || s.gameNo !== gameNo || s.round !== round || s.results[id]) return null;
    const now = serverNow();
    const results = { ...s.results, [id]: { ms: Math.max(0, now - s.startedAt), ...result } };
    const next = { ...s, results, firstAt: s.firstAt || (result.ok ? now : 0) };
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

// ---- Progress (bridges crossed, never which) ----------------------------------

export function sendProgress(roomId: string, rk: string, id: string, crossed: number) {
  return set(ref(getDb(), `${base(roomId)}/prog/${rk}/${id}`), crossed).catch(console.error);
}

export function subscribeProgress(roomId: string, rk: string, cb: (p: Record<string, number>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/prog/${rk}`), (snap) => cb(snap.val() ?? {}));
}

// ---- Bots (online) ---------------------------------------------------------------

/**
 * When a bot answers this round and what, like a person would: it solves it
 * (or rightly says it can't be done), says "no se puede" when it could, or
 * never gets there (`answers` false: it keeps trying until the round closes).
 */
export function botPlan(s: PuentesState, id: string, pz: Puzzle): { ms: number; ok: boolean; claim: boolean; answers: boolean } {
  const rand = mulberry32(s.seed + s.round * 131 + id.charCodeAt(id.length - 1) * 977);
  const base = 9000 + totalCrossings(pz) * 3200;
  const ms = Math.round(base * (0.7 + rand() * 1.1));
  if (rand() < 0.85) return { ms, ok: true, claim: pz.impossible, answers: true };
  const wrongClaim = !pz.impossible && rand() < 0.5;
  return { ms, ok: false, claim: wrongClaim, answers: wrongClaim };
}

// ---- Online ------------------------------------------------------------------

async function ensureWorld(roomId: string) {
  const db = getDb();
  await runTransaction(ref(db, `rooms/${roomId}/meta`), (cur: Partial<PuentesMeta> | null) =>
    cur ? undefined : { game: "puentes", rounds: 1, difficulty: "media", tricks: true, online: true, createdAt: serverNow() }
  );
  await runTransaction(ref(db, statePath(roomId)), (cur: Partial<PuentesState> | null) =>
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
    return newGame(s, { rounds: 1, difficulty: "media", tricks: true }, connected, s.gameNo + 1);
  });
}

// ---- Daily challenge top ---------------------------------------------------------

export interface DailyEntry {
  name: string;
  color: string;
  ms: number;
}

const dailyRef = (day: string) => ref(getDb(), `rooms/_puentes/dia/d${day}`);

export async function getDaily(day: string): Promise<DailyEntry[]> {
  const snap = await get(dailyRef(day));
  return Object.values((snap.val() ?? {}) as Record<string, DailyEntry>).sort((a, b) => a.ms - b.ms);
}

/** My time today, if it's my best and makes the top 10. */
export function submitDaily(day: string, id: string, player: PuentesPlayer, ms: number) {
  return runTransaction(dailyRef(day), (cur: Record<string, DailyEntry> | null) => {
    const top = { ...(cur ?? {}) };
    if (top[id] && top[id].ms <= ms) return undefined;
    top[id] = { name: player.name, color: player.color, ms };
    const keep = Object.entries(top)
      .sort((a, b) => a[1].ms - b[1].ms)
      .slice(0, 10);
    if (!keep.some(([k]) => k === id)) return undefined;
    return Object.fromEntries(keep);
  });
}
