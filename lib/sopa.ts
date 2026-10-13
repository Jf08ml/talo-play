import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, mulberry32, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { SOPA_THEMES, type SopaTheme } from "./sopaWords";

/**
 * Sopa de letras race. Everyone gets the same board, `buildSoup(seed, …)`,
 * generated locally; each word belongs to whoever marks it first
 * (`claimWord`, a transaction on `found`). When every word is found, the
 * one with the most wins.
 */

export const COUNTDOWN_MS = 3000;

export type SopaLevel = "facil" | "normal" | "dificil";

export const LEVELS: Record<SopaLevel, { label: string; size: number; words: number; hint: string; dirs: [number, number][] }> = {
  facil: {
    label: "Fácil",
    size: 10,
    words: 7,
    hint: "10 × 10 · hacia la derecha, abajo y en diagonal",
    dirs: [
      [0, 1],
      [1, 0],
      [1, 1],
    ],
  },
  normal: {
    label: "Normal",
    size: 12,
    words: 9,
    hint: "12 × 12 · también en diagonal hacia arriba",
    dirs: [
      [0, 1],
      [1, 0],
      [1, 1],
      [-1, 1],
    ],
  },
  dificil: {
    label: "Difícil",
    size: 14,
    words: 12,
    hint: "14 × 14 · en cualquier dirección, también al revés",
    dirs: [
      [0, 1],
      [1, 0],
      [1, 1],
      [-1, 1],
      [0, -1],
      [-1, 0],
      [-1, -1],
      [1, -1],
    ],
  },
};

const ALPHABET = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";

export interface SoupWord {
  word: string;
  cells: number[];
}

export interface Soup {
  size: number;
  letters: string[];
  words: SoupWord[];
}

/** The board for a seed: same input, same board on every client. */
export function buildSoup(seed: number, theme: SopaTheme, level: SopaLevel): Soup {
  const { size, words: count, dirs } = LEVELS[level];
  const rand = mulberry32(seed);
  const source = theme === "mezcla" ? SOPA_THEMES.flatMap((t) => t.words) : (SOPA_THEMES.find((t) => t.id === theme)?.words ?? []);
  const pool = seededShuffle(
    [...new Set(source)].filter((w) => [...w].length <= size),
    seed
  );
  const grid: string[] = Array(size * size).fill("");
  const placed: SoupWord[] = [];

  for (const word of pool) {
    if (placed.length >= count) break;
    const letters = [...word];
    for (let tries = 0; tries < 150; tries++) {
      const [dr, dc] = dirs[Math.floor(rand() * dirs.length)];
      const r0 = Math.floor(rand() * size);
      const c0 = Math.floor(rand() * size);
      const r1 = r0 + dr * (letters.length - 1);
      const c1 = c0 + dc * (letters.length - 1);
      if (r1 < 0 || r1 >= size || c1 < 0 || c1 >= size) continue;
      const cells = letters.map((_, k) => (r0 + dr * k) * size + (c0 + dc * k));
      if (cells.some((cell, k) => grid[cell] && grid[cell] !== letters[k])) continue;
      cells.forEach((cell, k) => (grid[cell] = letters[k]));
      placed.push({ word, cells });
      break;
    }
  }
  for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return { size, letters: grid, words: placed };
}

/** Cells of the straight line from `a` to `b` (row, column or diagonal), or null. */
export function lineBetween(size: number, a: number, b: number): number[] | null {
  const r0 = Math.floor(a / size);
  const c0 = a % size;
  const dr = Math.floor(b / size) - r0;
  const dc = (b % size) - c0;
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
  const n = Math.max(Math.abs(dr), Math.abs(dc));
  const sr = Math.sign(dr);
  const sc = Math.sign(dc);
  return Array.from({ length: n + 1 }, (_, k) => (r0 + sr * k) * size + (c0 + sc * k));
}

/** The word a marked line covers exactly (either way), if any. */
export function wordAt(soup: Soup, cells: number[]): SoupWord | null {
  const key = cells.join(",");
  const rev = [...cells].reverse().join(",");
  return soup.words.find((w) => w.cells.join(",") === key || w.cells.join(",") === rev) ?? null;
}

export interface SopaMeta {
  game: "sopa";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  theme: SopaTheme;
  level: SopaLevel;
  createdAt: number | object;
}

export type SopaStatus = "waiting" | "playing" | "finished";

export interface SopaPlayer {
  name: string;
  color: string;
}

export interface SopaState {
  status: SopaStatus;
  seed: number;
  gameNo: number;
  /** Server time when marking opens (after the countdown). */
  startedAt: number;
  players: Record<string, SopaPlayer>;
  /** word → who found it. */
  found: Record<string, string>;
  /** Games won per client id. */
  wins: Record<string, number>;
}

function normalizeState(raw: Partial<SopaState> | null): SopaState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    startedAt: raw.startedAt ?? 0,
    players: raw.players ?? {},
    found: raw.found ?? {},
    wins: raw.wins ?? {},
  };
}

export function normalizeMeta(raw: Partial<SopaMeta>): Pick<SopaMeta, "theme" | "level"> {
  return { theme: raw.theme ?? "mezcla", level: raw.level ?? "normal" };
}

/** Words found per player. */
export function foundCounts(found: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.values(found)) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/** The players with the most words (several on a tie). */
export function leaders(found: Record<string, string>): string[] {
  const counts = foundCounts(found);
  const best = Math.max(0, ...Object.values(counts));
  return Object.keys(counts).filter((id) => counts[id] === best && best > 0);
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/sopa/state`;

function mutate(roomId: string, fn: (state: SopaState) => SopaState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createSopaRoom(params: { theme: SopaTheme; level: SopaLevel }, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: SopaMeta = { game: "sopa", hostId, ...params, createdAt: serverTimestamp() };
  const state: Partial<SopaState> = { status: "waiting", seed: makeSeed(), gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getSopaMeta(roomId: string): Promise<Partial<SopaMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeSopa(roomId: string, cb: (state: SopaState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinSopa(roomId: string, clientId: string, player: SopaPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

export function startSopa(roomId: string) {
  return mutate(roomId, (s) =>
    s.status === "waiting" ? { ...s, status: "playing", startedAt: serverNow() + COUNTDOWN_MS, found: {} } : null
  );
}

/** Marks `word` as mine if nobody did yet; the last word ends the game. */
export function claimWord(roomId: string, clientId: string, word: string, totalWords: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.found[word] || !s.players[clientId] || serverNow() < s.startedAt) return null;
    const found = { ...s.found, [word]: clientId };
    if (Object.keys(found).length < totalWords) return { ...s, found };
    const top = leaders(found);
    const wins = { ...s.wins };
    if (top.length === 1) wins[top[0]] = (wins[top[0]] ?? 0) + 1;
    return { ...s, found, status: "finished", wins };
  });
}

/** A new board for everyone. */
export function playAgain(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) =>
    s.status === "finished" && s.gameNo === expectedGame
      ? { ...s, status: "playing", seed: makeSeed(), gameNo: s.gameNo + 1, startedAt: serverNow() + COUNTDOWN_MS, found: {} }
      : null
  );
}
