import { get, onValue, ref, runTransaction, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode, PLAYER_COLORS } from "./ids";
import { makeSeed, mulberry32, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { generateHole, type Difficulty } from "./minigolfHoles";
import { MAX_STROKES, simulate, type Hole, type RollEnd } from "./minigolfSim";

/**
 * Minigolf in a room: everyone plays the same hole at the same time, each on
 * their own phone, and sees the others' balls as ghosts. A hole closes when
 * everyone holed out (or gave up at `MAX_STROKES`), the rest left, or time
 * ran out (whoever hadn't finished takes their strokes + 2, capped). Lowest
 * total wins.
 *
 * `golf/state` changes only by transaction (hole results, the hole's end,
 * the next hole). Each ball is a plain write at `golf/balls/{hk}/{id}`: the
 * last shot (start, angle, power, hole time) plus where it ended, so the
 * others replay it with the same physics and snap to the end.
 *
 * Bots (`bot…`, in friends' rooms by `meta.bots`, and online) are run by the
 * bot host (lowest connected id) from their published ball, so another host
 * can pick them up.
 *
 * Online (`state.online`): public rooms `GOLF01…` (a 0 and an O: codes never
 * have them) chaining 3-hole games, bots filling to `ONLINE_MIN_PLAYERS`.
 */

export const HOLE_OPTIONS = [3, 6, 9] as const;
export const BOT_OPTIONS = [0, 1, 2, 3] as const;
export const COUNTDOWN_MS = 3000;
export const ONLINE_COUNTDOWN_MS = 5000;
/** A hole's time limit. */
export const HOLE_MS = 150_000;
/** Between holes (scores shown). */
export const BETWEEN_MS = 7000;
export const RESULTS_MS = 12_000;
export const ONLINE_WORLDS = ["GOLF01", "GOLF02", "GOLF03", "GOLF04"];
export const ONLINE_MAX_PEOPLE = 6;
const ONLINE_MIN_PLAYERS = 4;
const ONLINE_HOLES = 3;

export interface GolfMeta {
  game: "minigolf";
  hostId?: string;
  holes: number;
  difficulty: Difficulty;
  bots: number;
  online: boolean;
  createdAt: number | object;
}

export type GolfSettings = Pick<GolfMeta, "holes" | "difficulty" | "bots">;

export interface GolfPlayer {
  name: string;
  color: string;
}

export interface GolfState {
  status: "waiting" | "playing" | "finished";
  online: boolean;
  seed: number;
  gameNo: number;
  hole: number;
  holes: number;
  difficulty: Difficulty;
  phase: "playing" | "holeEnd";
  startedAt: number;
  endsAt: number;
  nextAt: number;
  players: Record<string, GolfPlayer>;
  bots: Record<string, GolfPlayer>;
  /** Bots' skill 0–1. */
  skill: Record<string, number>;
  roster: string[];
  /** This hole's strokes for those who finished it. */
  done: Record<string, number>;
  /** Strokes per hole so far, "3,4,2". */
  cards: Record<string, string>;
  wins: Record<string, number>;
}

/** A ball, as written by its player after each shot. */
export interface BallPose {
  /** Shots taken (penalties included). */
  s: number;
  /** Shot serial: changes with every shot, so watchers replay it. */
  n: number;
  /** The shot: from (sx, sy) at hole time t, angle a, power p. */
  sx: number;
  sy: number;
  a: number;
  p: number;
  t: number;
  /** Where it ended and how. */
  ex: number;
  ey: number;
  end: RollEnd | "tee";
  /** Holed out or gave up. */
  fin: boolean;
}

export function normalizeMeta(raw: Partial<GolfMeta>): GolfMeta {
  return {
    game: "minigolf",
    hostId: raw.hostId,
    holes: raw.holes ?? 6,
    difficulty: raw.difficulty ?? "media",
    bots: raw.bots ?? 0,
    online: raw.online ?? false,
    createdAt: raw.createdAt ?? 0,
  };
}

function normalizeState(raw: Partial<GolfState> | null): GolfState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    online: raw.online ?? false,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    hole: raw.hole ?? 0,
    holes: raw.holes ?? 1,
    difficulty: raw.difficulty ?? "media",
    phase: raw.phase ?? "playing",
    startedAt: raw.startedAt ?? 0,
    endsAt: raw.endsAt ?? 0,
    nextAt: raw.nextAt ?? 0,
    players: raw.players ?? {},
    bots: raw.bots ?? {},
    skill: raw.skill ?? {},
    roster: raw.roster ?? [],
    done: raw.done ?? {},
    cards: raw.cards ?? {},
    wins: raw.wins ?? {},
  };
}

/** The current hole, the same on every phone. */
export function roomHole(s: Pick<GolfState, "seed" | "hole" | "difficulty">): Hole {
  return generateHole((s.seed + s.hole * 7919) >>> 0, s.difficulty);
}

export const isBot = (id: string) => id.startsWith("bot");
export const holeKey = (s: Pick<GolfState, "gameNo" | "hole">) => `g${s.gameNo}h${s.hole}`;

export function playerInfo(s: GolfState, id: string): GolfPlayer {
  return s.players[id] ?? s.bots[id] ?? { name: "?", color: "#64748b" };
}

export function botHost(connected: string[]): string {
  return [...connected].sort()[0] ?? "";
}

export function cardOf(s: GolfState, id: string): number[] {
  const c = s.cards[id];
  return c ? c.split(",").map(Number) : [];
}

export function totalOf(s: GolfState, id: string): number {
  return cardOf(s, id).reduce((a, b) => a + b, 0);
}

const base = (roomId: string) => `rooms/${roomId}/golf`;
const statePath = (roomId: string) => `${base(roomId)}/state`;

function mutate(roomId: string, fn: (s: GolfState) => GolfState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createGolfRoom(hostId: string, settings: GolfSettings): Promise<string> {
  const roomId = generateRoomCode();
  const meta: GolfMeta = { game: "minigolf", hostId, ...settings, online: false, createdAt: serverTimestamp() };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: { status: "waiting", seed: makeSeed(), gameNo: 0 },
  });
  return roomId;
}

export async function getGolfMeta(roomId: string): Promise<Partial<GolfMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeGolf(roomId: string, cb: (s: GolfState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinGolf(roomId: string, id: string, player: GolfPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[id];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [id]: player } };
  });
}

const BOT_NAMES = ["Mati", "Sofi", "Nico", "Cami", "Juli", "Lucho", "Flor", "Tomi", "Agus", "Male", "Fede", "Rochi", "Santi", "Pili", "Facu", "Vicky"];

function makeBots(s: GolfState, people: string[], count: number, seed: number) {
  const taken = new Set(people.map((id) => s.players[id]?.name.trim().toLowerCase()));
  const free = seededShuffle(BOT_NAMES, seed).filter((n) => !taken.has(n.toLowerCase()));
  const usedColors = new Set(people.map((id) => s.players[id]?.color));
  const colors = seededShuffle(PLAYER_COLORS, seed + 1).filter((c) => !usedColors.has(c));
  const rand = mulberry32(seed + 2);
  const bots: Record<string, GolfPlayer> = {};
  const skill: Record<string, number> = {};
  for (let i = 0; i < count; i++) {
    bots[`bot${i}`] = { name: free[i % free.length], color: colors[i % colors.length] ?? PLAYER_COLORS[i] };
    skill[`bot${i}`] = Math.round((0.15 + rand() * 0.5) * 100) / 100;
  }
  return { bots, skill };
}

function newGame(s: GolfState, settings: GolfSettings, connected: string[], gameNo: number): GolfState {
  const seed = makeSeed();
  const people = connected.filter((id) => s.players[id]);
  const botCount = s.online ? Math.max(0, ONLINE_MIN_PLAYERS - people.length) : settings.bots;
  const { bots, skill } = makeBots(s, people, botCount, seed);
  const startedAt = serverNow() + (s.online ? ONLINE_COUNTDOWN_MS : COUNTDOWN_MS);
  return {
    ...s,
    status: "playing",
    seed,
    gameNo,
    hole: 0,
    holes: settings.holes,
    difficulty: settings.difficulty,
    phase: "playing",
    startedAt,
    endsAt: startedAt + HOLE_MS,
    nextAt: 0,
    bots,
    skill,
    roster: [...people, ...Object.keys(bots)],
    done: {},
    cards: {},
  };
}

export function startGolf(roomId: string, settings: GolfSettings, connected: string[]) {
  return mutate(roomId, (s) => (s.status === "waiting" ? newGame(s, settings, connected, s.gameNo) : null));
}

export function playAgain(roomId: string, expected: number, settings: GolfSettings, connected: string[]) {
  return mutate(roomId, (s) => (s.status === "finished" && s.gameNo === expected ? newGame(s, settings, connected, s.gameNo + 1) : null));
}

/** Closes the hole: everyone's strokes go on their card (unfinished: strokes + 2, capped). */
function endHole(s: GolfState, strokes: Record<string, number>): GolfState {
  const cards = { ...s.cards };
  for (const id of s.roster) {
    const n = s.done[id] ?? Math.min(MAX_STROKES, (strokes[id] ?? 0) + 2);
    cards[id] = s.cards[id] ? `${s.cards[id]},${n}` : `${n}`;
  }
  const last = s.hole >= s.holes - 1;
  const next: GolfState = { ...s, cards, phase: "holeEnd", nextAt: serverNow() + (last ? RESULTS_MS : BETWEEN_MS) };
  if (!last) return next;
  const totals = s.roster.map((id) => ({ id, t: cards[id].split(",").reduce((a, b) => a + Number(b), 0) }));
  const best = Math.min(...totals.map((t) => t.t));
  const top = totals.filter((t) => t.t === best);
  const wins = { ...s.wins };
  if (top.length === 1) wins[top[0].id] = (wins[top[0].id] ?? 0) + 1;
  return { ...next, status: "finished", wins };
}

/** My strokes on this hole, once (holed out or gave up). */
export function finishHole(roomId: string, gameNo: number, hole: number, id: string, strokes: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.phase !== "playing" || s.gameNo !== gameNo || s.hole !== hole || s.done[id] !== undefined) return null;
    const next = { ...s, done: { ...s.done, [id]: Math.min(MAX_STROKES, strokes) } };
    return s.roster.every((p) => next.done[p] !== undefined) ? endHole(next, {}) : next;
  });
}

/**
 * Closes the hole when time's up or everyone still playing left (`gone`).
 * `strokes`: the shots each one had taken, as this client sees them.
 */
export function closeHole(roomId: string, gameNo: number, hole: number, gone: string[], strokes: Record<string, number>) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.phase !== "playing" || s.gameNo !== gameNo || s.hole !== hole) return null;
    const settled = s.roster.every((p) => s.done[p] !== undefined || gone.includes(p));
    return settled || serverNow() > s.endsAt ? endHole(s, strokes) : null;
  });
}

export function nextHole(roomId: string, gameNo: number, hole: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.phase !== "holeEnd" || s.gameNo !== gameNo || s.hole !== hole || serverNow() < s.nextAt) return null;
    const startedAt = serverNow() + COUNTDOWN_MS;
    return { ...s, hole: s.hole + 1, phase: "playing", startedAt, endsAt: startedAt + HOLE_MS, done: {} };
  });
}

// ---- Balls ---------------------------------------------------------------------

export function sendBall(roomId: string, hk: string, id: string, pose: BallPose) {
  return set(ref(getDb(), `${base(roomId)}/balls/${hk}/${id}`), pose).catch(console.error);
}

export function subscribeBalls(roomId: string, hk: string, cb: (b: Record<string, BallPose>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/balls/${hk}`), (snap) => cb(snap.val() ?? {}));
}

// ---- Online ------------------------------------------------------------------

async function ensureWorld(roomId: string) {
  const db = getDb();
  await runTransaction(ref(db, `rooms/${roomId}/meta`), (cur: Partial<GolfMeta> | null) =>
    cur ? undefined : { game: "minigolf", holes: ONLINE_HOLES, difficulty: "media", bots: 0, online: true, createdAt: serverNow() }
  );
  await runTransaction(ref(db, statePath(roomId)), (cur: Partial<GolfState> | null) =>
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

export function nextOnlineGame(roomId: string, connected: string[]) {
  return mutate(roomId, (s) => {
    if (!s.online || s.status === "playing" || serverNow() < s.nextAt) return null;
    const difficulty: Difficulty = (["facil", "media", "media", "dificil"] as const)[s.gameNo % 4];
    return newGame(s, { holes: ONLINE_HOLES, difficulty, bots: 0 }, connected, s.gameNo + 1);
  });
}

// ---- Today's holes: top 10 -----------------------------------------------------------

export interface DailyEntry {
  name: string;
  color: string;
  strokes: number;
  ms: number;
}

const dailyRef = (day: string) => ref(getDb(), `rooms/_minigolf/dia/d${day}`);

const better = (a: DailyEntry, b: DailyEntry) => a.strokes - b.strokes || a.ms - b.ms;

export async function getDaily(day: string): Promise<DailyEntry[]> {
  const snap = await get(dailyRef(day));
  return Object.values((snap.val() ?? {}) as Record<string, DailyEntry>).sort(better);
}

/** My round today, if it makes the top 10 (fewest strokes, then fastest). */
export function submitDaily(day: string, id: string, player: GolfPlayer, strokes: number, ms: number) {
  return runTransaction(dailyRef(day), (cur: Record<string, DailyEntry> | null) => {
    const top = { ...(cur ?? {}) };
    const mine = { name: player.name, color: player.color, strokes, ms };
    if (top[id] && better(top[id], mine) <= 0) return undefined;
    top[id] = mine;
    const keep = Object.entries(top)
      .sort((a, b) => better(a[1], b[1]))
      .slice(0, 10);
    if (!keep.some(([k]) => k === id)) return undefined;
    return Object.fromEntries(keep);
  });
}

// ---- A shot ----------------------------------------------------------------------

/** Where a ball stands: from its last pose, or the tee. */
export function ballAt(hole: Hole, pose: BallPose | null | undefined): { x: number; y: number; s: number; n: number; fin: boolean } {
  return pose ? { x: pose.ex, y: pose.ey, s: pose.s, n: pose.n, fin: pose.fin } : { x: hole.tee.x, y: hole.tee.y, s: 0, n: 0, fin: false };
}

/** The ball at the tee, published when a hole starts so the others see it there. */
export function teePose(hole: Hole): BallPose {
  return { s: 0, n: 0, sx: hole.tee.x, sy: hole.tee.y, a: 0, p: 0, t: 0, ex: hole.tee.x, ey: hole.tee.y, end: "tee", fin: false };
}

/**
 * A shot from where the ball stands, worked out to the end: water costs a
 * stroke and puts the ball back where it was hit from; not holed by the
 * second-to-last stroke ends the hole at `MAX_STROKES`.
 */
export function shotPose(hole: Hole, from: { x: number; y: number; s: number; n: number }, t: number, angle: number, power: number): { pose: BallPose; elapsed: number } {
  const res = simulate(hole, from.x, from.y, t, angle, power);
  const strokes = from.s + 1 + (res.end === "water" ? 1 : 0);
  const holed = res.end === "in";
  const outOf = !holed && strokes >= MAX_STROKES - 1;
  const water = res.end === "water";
  return {
    elapsed: res.elapsed,
    pose: {
      s: holed ? Math.min(strokes, MAX_STROKES) : outOf ? MAX_STROKES : strokes,
      n: from.n + 1,
      sx: from.x,
      sy: from.y,
      a: angle,
      p: power,
      t,
      ex: water ? from.x : res.x,
      ey: water ? from.y : res.y,
      end: res.end,
      fin: holed || outOf,
    },
  };
}
