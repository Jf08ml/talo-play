import { get, onDisconnect, onValue, ref, remove, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode, PLAYER_COLORS } from "./ids";
import { makeSeed, mulberry32, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { BOT_LEVELS, type BotLevel } from "./empujones";

/**
 * Empujones in a room. Like Carreras' `pantalla` mode, the big screen
 * (`/empujones/{id}/pantalla`) is the authority: it simulates every talo
 * from the phones' inputs (`empujones/input/{clientId}`), decides who fell
 * and reports each round's winner (`reportRound`). Phones are controllers;
 * the screen tells them what happened through `empujones/live`.
 *
 * `empujones/state` only changes by transaction: the match's `roster`
 * (people + bots, fixed at the start), the round and its countdown,
 * rounds won (`score`) and matches won (`wins`).
 */

export const COUNTDOWN_MS = 3000;
/** The round's result stays on screen this long before the next countdown. */
export const BETWEEN_MS = 3500;
export const MAX_PLAYERS = 8;
export const BOT_OPTIONS = [0, 1, 3, 5, 7] as const;
export const TARGET_OPTIONS = [2, 3, 5] as const;

const BOT_NAMES = ["Coco", "Lola", "Toto", "Nina", "Beto", "Mimí", "Pancho"];

export interface EmpujonesMeta {
  game: "empujones";
  hostId?: string;
  bots: number;
  botLevel: BotLevel;
  /** Rounds to win the match. */
  target: number;
  createdAt: number | object;
}

export type EmpujonesSettings = Pick<EmpujonesMeta, "bots" | "botLevel" | "target">;

export interface EmpPlayer {
  name: string;
  color: string;
}

export interface EmpujonesState {
  status: "waiting" | "playing" | "finished";
  seed: number;
  gameNo: number;
  players: Record<string, EmpPlayer>;
  /** People who'd rather watch (they don't get a talo). */
  watching: Record<string, boolean>;
  /** Copied from the meta when the match starts (the start only sees the state). */
  botCount: number;
  botLevel: BotLevel;
  target: number;
  /** Everyone in the match, people and bots (`bot0`…), in spawn order. */
  roster: string[];
  bots: Record<string, EmpPlayer>;
  /** Each one's color in this match (people keep theirs unless someone has it already). */
  colors: Record<string, string>;
  round: number;
  /** Server time the current round's talos may move (end of its countdown). */
  startedAt: number;
  /** Rounds won in this match. */
  score: Record<string, number>;
  /** The round that just ended and who won it ("" = nobody, all fell together). */
  lastRound: number;
  lastWinner: string;
  winner: string;
  /** Matches won per id. */
  wins: Record<string, number>;
}

/** What the phones send: stick (+y down the screen), dash presses so far, bracing. */
export interface PadWire {
  x: number;
  y: number;
  d: number;
  b: boolean;
}

/** What the screen tells the phones: who fell (comma list) and dash hits taken. */
export interface EmpLive {
  g: number;
  r: number;
  out: string;
  hits: Record<string, number>;
}

const levelOf = (raw: unknown): BotLevel => (BOT_LEVELS.includes(raw as BotLevel) ? (raw as BotLevel) : "normal");
const targetOf = (raw: unknown): number => (TARGET_OPTIONS.includes(raw as 2) ? (raw as number) : 3);
const botsOf = (raw: unknown): number => Math.max(0, Math.min(MAX_PLAYERS - 1, typeof raw === "number" ? raw : 3));

export function normalizeMeta(raw: Partial<EmpujonesMeta>): EmpujonesMeta {
  return {
    game: "empujones",
    hostId: raw.hostId,
    bots: botsOf(raw.bots),
    botLevel: levelOf(raw.botLevel),
    target: targetOf(raw.target),
    createdAt: raw.createdAt ?? 0,
  };
}

function normalizeState(raw: Partial<EmpujonesState> | null): EmpujonesState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    watching: raw.watching ?? {},
    botCount: botsOf(raw.botCount),
    botLevel: levelOf(raw.botLevel),
    target: targetOf(raw.target),
    roster: raw.roster ?? [],
    bots: raw.bots ?? {},
    colors: raw.colors ?? {},
    round: raw.round ?? 0,
    startedAt: raw.startedAt ?? 0,
    score: raw.score ?? {},
    lastRound: raw.lastRound ?? -1,
    lastWinner: raw.lastWinner ?? "",
    winner: raw.winner ?? "",
    wins: raw.wins ?? {},
  };
}

export const isBot = (id: string) => id.startsWith("bot");

/** Name and color of anyone in the match (or in the room). */
export function playerInfo(s: EmpujonesState, id: string): EmpPlayer {
  const p = s.players[id] ?? s.bots[id];
  return {
    name: p ? (isBot(id) ? `${p.name} (bot)` : p.name) : "?",
    color: s.colors[id] ?? p?.color ?? "#94a3b8",
  };
}

/** Connected people who said their name and want to play, in a stable order. */
export function playersIn(s: EmpujonesState, connected: string[]): string[] {
  return connected.filter((id) => s.players[id] && !s.watching[id]).sort();
}

// ---- Firebase ------------------------------------------------------------

const base = (roomId: string) => `rooms/${roomId}/empujones`;
const statePath = (roomId: string) => `${base(roomId)}/state`;

function mutate(roomId: string, fn: (s: EmpujonesState) => EmpujonesState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createEmpujonesRoom(hostId: string, settings: EmpujonesSettings): Promise<string> {
  const roomId = generateRoomCode();
  const meta: EmpujonesMeta = { game: "empujones", hostId, ...settings, createdAt: serverTimestamp() };
  const state: Partial<EmpujonesState> = {
    status: "waiting",
    seed: makeSeed(),
    gameNo: 0,
    botCount: settings.bots,
    botLevel: settings.botLevel,
    target: settings.target,
  };
  await update(ref(getDb()), { [`rooms/${roomId}/meta`]: meta, [statePath(roomId)]: state });
  return roomId;
}

export async function getEmpujonesMeta(roomId: string): Promise<Partial<EmpujonesMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeEmpujones(roomId: string, cb: (s: EmpujonesState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinEmpujones(roomId: string, clientId: string, player: EmpPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

/** Play or just watch (only between matches). */
export function setWatching(roomId: string, clientId: string, watching: boolean) {
  return mutate(roomId, (s) => {
    if (s.status === "playing" || !!s.watching[clientId] === watching) return null;
    const next = { ...s.watching };
    if (watching) next[clientId] = true;
    else delete next[clientId];
    return { ...s, watching: next };
  });
}

/** A new match with the connected people (`connected`, the caller's view) plus bots. */
function matchFrom(s: EmpujonesState, connected: string[]): EmpujonesState | null {
  const people = playersIn(s, connected).slice(0, MAX_PLAYERS);
  if (!people.length) return null;
  // Alone and with no bots, one joins anyway (or the round would be won at once).
  const botN = Math.min(MAX_PLAYERS - people.length, Math.max(s.botCount, people.length === 1 ? 1 : 0));
  const rand = mulberry32(s.seed + s.gameNo * 7919);
  const names = seededShuffle(BOT_NAMES, s.seed + s.gameNo);
  const bots: Record<string, EmpPlayer> = {};
  const botIds = Array.from({ length: botN }, (_, i) => `bot${i}`);
  // People keep their color unless someone before them has it; bots take what's left.
  const colors: Record<string, string> = {};
  const used = new Set<string>();
  for (const id of people) {
    const own = s.players[id].color;
    const c = !used.has(own) ? own : PLAYER_COLORS.find((p) => !used.has(p)) ?? own;
    colors[id] = c;
    used.add(c);
  }
  botIds.forEach((id, i) => {
    const c = PLAYER_COLORS.find((p) => !used.has(p)) ?? PLAYER_COLORS[i % PLAYER_COLORS.length];
    used.add(c);
    colors[id] = c;
    bots[id] = { name: names[i % names.length], color: c };
  });
  const roster = seededShuffle([...people, ...botIds], Math.floor(rand() * 1e9));
  return {
    ...s,
    status: "playing",
    roster,
    bots,
    colors,
    round: 0,
    startedAt: serverNow() + COUNTDOWN_MS,
    score: {},
    lastRound: -1,
    lastWinner: "",
    winner: "",
  };
}

export function startMatch(roomId: string, connected: string[]) {
  return mutate(roomId, (s) => (s.status === "waiting" ? matchFrom(s, connected) : null));
}

/** Another match with whoever is here now, right away. */
export function playAgain(roomId: string, expectedGame: number, connected: string[]) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    return matchFrom({ ...s, gameNo: s.gameNo + 1, seed: makeSeed() }, connected);
  });
}

/** The screen saw round `round` end: `winner` is the last one standing ("" = nobody). */
export function reportRound(roomId: string, expectedGame: number, round: number, winner: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.gameNo !== expectedGame || s.round !== round) return null;
    const ok = !!winner && s.roster.includes(winner);
    const score = ok ? { ...s.score, [winner]: (s.score[winner] ?? 0) + 1 } : s.score;
    const base = { ...s, score, lastRound: round, lastWinner: ok ? winner : "" };
    if (ok && score[winner] >= s.target) {
      return { ...base, status: "finished", winner, wins: { ...s.wins, [winner]: (s.wins[winner] ?? 0) + 1 } };
    }
    return { ...base, round: round + 1, startedAt: serverNow() + BETWEEN_MS + COUNTDOWN_MS };
  });
}

// ---- Inputs (phone → screen) -------------------------------------------

export function openPad(roomId: string, clientId: string) {
  const r = ref(getDb(), `${base(roomId)}/input/${clientId}`);
  onDisconnect(r).remove().catch(console.error);
  return {
    send: (w: PadWire) => set(r, w).catch(console.error),
    close: () => {
      onDisconnect(r).cancel().catch(console.error);
      remove(r).catch(console.error);
    },
  };
}

export function subscribePads(roomId: string, cb: (pads: Record<string, PadWire>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/input`), (snap) => cb(snap.val() ?? {}));
}

// ---- Live (screen → phones) -------------------------------------------------

export function writeLive(roomId: string, live: EmpLive) {
  return set(ref(getDb(), `${base(roomId)}/live`), live).catch(console.error);
}

export function subscribeLive(roomId: string, cb: (live: EmpLive | null) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/live`), (snap) => {
    const raw = snap.val() as Partial<EmpLive> | null;
    cb(raw ? { g: raw.g ?? 0, r: raw.r ?? 0, out: raw.out ?? "", hits: raw.hits ?? {} } : null);
  });
}
