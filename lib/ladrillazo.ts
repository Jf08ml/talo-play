import { get, onDisconnect, onValue, push, ref, remove, runTransaction, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode, PLAYER_COLORS } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { BOT_NAMES } from "./ladrillazoSim";

/**
 * Ladrillazo in a room. Four modes:
 *
 * - carrera: everyone plays the same level on their own board; first to
 *   finish wins. Each player writes only `boards/g{n}/{id}` (cells, paddle,
 *   balls) so the others see a live preview.
 * - ataque: everyone on their own board, the wall comes down little by
 *   little and combos send rows of hard bricks to a rival
 *   (`attacks/g{n}/{victim}`). Bricks reaching the line knock you out; the
 *   last one standing wins.
 * - duelo and coop: one shared field (`shared/g{n}`). Nobody is the
 *   authority: the ball is stepped by its owner (`ball.o`), the player it's
 *   heading to, who hands it over by writing it with the next owner. Broken
 *   cells are plain writes (`cells/{i}`), paddles too (`pad/{id}`).
 *
 * Bots (ids `bot…`) are run by the bot host: the connected person with the
 * lowest id. Results, outs, goals and lives only change by transaction on
 * `state`. Online (`state.online`) uses public rooms `LADRI1…` (codes with an
 * I, which `generateRoomCode` never makes) that chain rounds forever.
 */

export type LadriMode = "carrera" | "ataque" | "duelo" | "coop";

export const MODES: { id: LadriMode; label: string; sub: string }[] = [
  { id: "carrera", label: "Carrera", sub: "Mismo nivel, gana el más rápido" },
  { id: "ataque", label: "Ataque", sub: "Mandale ladrillos a los demás" },
  { id: "duelo", label: "Duelo", sub: "Cara a cara, en la misma cancha" },
  { id: "coop", label: "En equipo", sub: "Todos juntos contra un nivel" },
];

export const COUNTDOWN_MS = 3500;
export const ONLINE_COUNTDOWN_MS = 6000;
export const ONLINE_WORLDS = ["LADRI1", "LADRI2", "LADRI3", "LADRI4"];
export const ONLINE_MAX_PEOPLE = 8;
/** Racers per online round, bots included. */
const ONLINE_MIN_RACERS = 4;
/** Results on screen before the next online round. */
export const RESULTS_MS = 10_000;
/** After the first one finishes a race, the rest have this long. */
export const FINISH_GRACE_MS = 30_000;
const RACE_MAX_MS = 5 * 60_000;
const ONLINE_RACE_MAX_MS = 3 * 60_000;
const ATTACK_MAX_MS = 5 * 60_000;
export const MAX_RACERS = 8;
export const COOP_MAX = 4;
export const COOP_LIVES = 5;
export const BOT_OPTIONS = [0, 1, 2, 3] as const;
export const GOAL_OPTIONS = [3, 5, 7] as const;

export interface LadriMeta {
  game: "ladrillazo";
  hostId?: string;
  mode: LadriMode;
  /** Campaign level (0…), or −1 = generated from the game's seed. */
  level: number;
  bots: number;
  /** Duel: goals to win. */
  goals: number;
  online: boolean;
  createdAt: number | object;
}

export type LadriSettings = Pick<LadriMeta, "mode" | "level" | "bots" | "goals">;

export interface LadriPlayer {
  name: string;
  color: string;
}

export type LadriStatus = "waiting" | "playing" | "finished";

export interface LadriState {
  status: LadriStatus;
  online: boolean;
  mode: LadriMode;
  level: number;
  seed: number;
  gameNo: number;
  /** Server time when play begins (after the countdown). */
  startedAt: number;
  /** Server time the game is closed anyway (0 = never). */
  endsAt: number;
  /** First finish of a race. */
  firstAt: number;
  /** Online: when the next round starts. */
  nextAt: number;
  players: Record<string, LadriPlayer>;
  bots: Record<string, LadriPlayer>;
  /** Who plays this game. Duel: [bottom, top]. */
  roster: string[];
  /** Race: ms per finisher. */
  results: Record<string, number>;
  /** Attack: server time each one was knocked out. */
  out: Record<string, number>;
  /** Duel: goals per player; `target` to win. */
  goals: Record<string, number>;
  target: number;
  /** Co-op: shared lives. */
  lives: number;
  /** Last ball serial counted for a goal or a life (so it counts once). */
  lastK: number;
  /** At the end: progress % (race) or points (attack) per player. */
  prog: Record<string, number>;
  /** The winner's id; co-op: "won" / "lost". */
  winner: string;
  wins: Record<string, number>;
}

/** A player's board as the rest see it. */
export interface RemoteBoard {
  /** Cells (sent only when they change). */
  c?: string;
  /** Paddle center and half width. */
  p: number;
  w: number;
  /** Balls "x,y,…". */
  b: string;
  l: number;
  s: number;
  /** Progress 0…1. */
  pr: number;
  t: number;
  /** Attack: the last incoming attack applied (push key), so a new bot host doesn't apply it again. */
  a?: string;
  /** Race: times the level was started over. */
  r?: number;
}

export interface SharedBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  sp: number;
  /** Owner: who steps it now. */
  o: string;
  /** Serial: bumps on each serve, so a goal or a lost life counts once. */
  k: number;
  /** Resting on the owner's paddle (1) before the serve. */
  st: number;
  off: number;
  /** Server time of the auto serve. */
  sa: number;
  /** Last paddle that touched it. */
  lh: string;
  /** Server time of this snapshot. */
  t: number;
}

export function normalizeMeta(raw: Partial<LadriMeta>): LadriMeta {
  return {
    game: "ladrillazo",
    hostId: raw.hostId,
    mode: raw.mode ?? "carrera",
    level: raw.level ?? -1,
    bots: raw.bots ?? 0,
    goals: raw.goals ?? 5,
    online: raw.online ?? false,
    createdAt: raw.createdAt ?? 0,
  };
}

function normalizeState(raw: Partial<LadriState> | null): LadriState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    online: raw.online ?? false,
    mode: raw.mode ?? "carrera",
    level: raw.level ?? -1,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    startedAt: raw.startedAt ?? 0,
    endsAt: raw.endsAt ?? 0,
    firstAt: raw.firstAt ?? 0,
    nextAt: raw.nextAt ?? 0,
    players: raw.players ?? {},
    bots: raw.bots ?? {},
    roster: raw.roster ?? [],
    results: raw.results ?? {},
    out: raw.out ?? {},
    goals: raw.goals ?? {},
    target: raw.target ?? 5,
    lives: raw.lives ?? 0,
    lastK: raw.lastK ?? 0,
    prog: raw.prog ?? {},
    winner: raw.winner ?? "",
    wins: raw.wins ?? {},
  };
}

export const isBot = (id: string) => id.startsWith("bot");

export function playerInfo(state: LadriState, id: string): LadriPlayer {
  return state.players[id] ?? state.bots[id] ?? { name: "?", color: "#64748b" };
}

/** The connected person who runs the bots (and a ball whose owner left). */
export function botHost(connected: string[]): string {
  return [...connected].sort()[0] ?? "";
}

// ---- Firebase ------------------------------------------------------------

const base = (roomId: string) => `rooms/${roomId}/ladri`;
const statePath = (roomId: string) => `${base(roomId)}/state`;

function mutate(roomId: string, fn: (state: LadriState) => LadriState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createLadriRoom(hostId: string, settings: LadriSettings): Promise<string> {
  const roomId = generateRoomCode();
  const meta: LadriMeta = { game: "ladrillazo", hostId, ...settings, online: false, createdAt: serverTimestamp() };
  const state: Partial<LadriState> = { status: "waiting", mode: settings.mode, seed: makeSeed(), gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getLadriMeta(roomId: string): Promise<Partial<LadriMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeLadri(roomId: string, cb: (state: LadriState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinLadri(roomId: string, clientId: string, player: LadriPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

function makeBots(s: LadriState, people: string[], count: number, seed: number): Record<string, LadriPlayer> {
  const taken = new Set(people.map((id) => s.players[id]?.name.trim().toLowerCase()));
  const names = seededShuffle(BOT_NAMES, seed).filter((n) => !taken.has(n.toLowerCase()));
  const colors = seededShuffle([...PLAYER_COLORS, "#06b6d4", "#a3e635", "#f43f5e", "#d946ef"], seed + 1);
  const bots: Record<string, LadriPlayer> = {};
  for (let i = 0; i < count; i++) bots[`bot${i}`] = { name: names[i % names.length], color: colors[i % colors.length] };
  return bots;
}

/** A fresh game with the connected players (the rest watch). */
function newGame(s: LadriState, settings: LadriSettings, connected: string[], gameNo: number): LadriState {
  const seed = makeSeed();
  const people = seededShuffle(
    connected.filter((id) => s.players[id]),
    seed
  );
  const mode = settings.mode;
  let roster: string[];
  let bots: Record<string, LadriPlayer> = {};
  if (mode === "duelo") {
    roster = people.slice(0, 2);
    if (roster.length < 2) {
      bots = makeBots(s, people, 1, seed);
      roster.push("bot0");
    }
  } else if (mode === "coop") {
    roster = people.slice(0, COOP_MAX);
  } else {
    roster = people.slice(0, MAX_RACERS);
    const want = s.online ? Math.max(0, ONLINE_MIN_RACERS - roster.length) : Math.min(settings.bots, MAX_RACERS - roster.length);
    bots = makeBots(s, people, want, seed);
    roster = [...roster, ...Object.keys(bots)];
  }
  const startedAt = serverNow() + (s.online ? ONLINE_COUNTDOWN_MS : COUNTDOWN_MS);
  const cap = mode === "carrera" ? (s.online ? ONLINE_RACE_MAX_MS : RACE_MAX_MS) : mode === "ataque" ? ATTACK_MAX_MS : 0;
  return {
    ...s,
    status: "playing",
    mode,
    level: settings.level,
    seed,
    gameNo,
    startedAt,
    endsAt: cap ? startedAt + cap : 0,
    firstAt: 0,
    nextAt: 0,
    bots,
    roster,
    results: {},
    out: {},
    goals: {},
    target: settings.goals,
    lives: COOP_LIVES,
    lastK: 0,
    prog: {},
    winner: "",
  };
}

export function startLadri(roomId: string, settings: LadriSettings, connected: string[]) {
  return mutate(roomId, (s) => (s.status === "waiting" ? newGame(s, settings, connected, s.gameNo) : null)).then((res) => {
    if (res.committed) clearOld(roomId, (res.snapshot.val() as LadriState).gameNo);
    return res;
  });
}

export function playAgain(roomId: string, expectedGame: number, settings: LadriSettings, connected: string[]) {
  return mutate(roomId, (s) =>
    s.status === "finished" && s.gameNo === expectedGame ? newGame(s, settings, connected, s.gameNo + 1) : null
  ).then((res) => {
    if (res.committed) clearOld(roomId, (res.snapshot.val() as LadriState).gameNo);
    return res;
  });
}

/** Boards, attacks and shared fields of earlier games aren't needed anymore. */
function clearOld(roomId: string, gameNo: number) {
  const patch: Record<string, null> = {};
  for (let g = Math.max(0, gameNo - 3); g < gameNo; g++) {
    for (const part of ["boards", "attacks", "shared"]) patch[`${base(roomId)}/${part}/g${g}`] = null;
  }
  update(ref(getDb()), patch).catch(console.error);
}

function finish(s: LadriState, winner: string, prog: Record<string, number>): LadriState {
  const wins = { ...s.wins };
  if (winner && winner !== "lost") {
    for (const id of winner === "won" ? s.roster : [winner]) wins[id] = (wins[id] ?? 0) + 1;
  }
  return { ...s, status: "finished", winner, prog, wins, nextAt: s.online ? serverNow() + RESULTS_MS : 0 };
}

/** Race: my time (once); the first one starts the grace period. */
export function reportFinish(roomId: string, gameNo: number, id: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.gameNo !== gameNo || s.mode !== "carrera" || s.results[id] !== undefined) return null;
    const now = serverNow();
    return { ...s, results: { ...s.results, [id]: Math.max(0, now - s.startedAt) }, firstAt: s.firstAt || now };
  });
}

/** Attack: knocked out (once). */
export function reportOut(roomId: string, gameNo: number, id: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.gameNo !== gameNo || s.mode !== "ataque" || s.out[id]) return null;
    return { ...s, out: { ...s.out, [id]: serverNow() } };
  });
}

/**
 * Closes a race or an attack with what this client sees: `prog` (progress %
 * or points per player) and who is `gone` (people who left mid-game).
 */
export function closeRound(roomId: string, gameNo: number, prog: Record<string, number>, gone: string[]) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.gameNo !== gameNo) return null;
    let winner = "";
    if (s.mode === "carrera") {
      const done = Object.entries(s.results).sort((a, b) => a[1] - b[1]);
      winner = done[0]?.[0] ?? [...s.roster].sort((a, b) => (prog[b] ?? 0) - (prog[a] ?? 0))[0] ?? "";
    } else {
      const alive = s.roster.filter((id) => !s.out[id] && !gone.includes(id));
      if (alive.length) winner = alive.sort((a, b) => (prog[b] ?? 0) - (prog[a] ?? 0))[0];
      else winner = Object.entries(s.out).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    }
    const clean: Record<string, number> = {};
    for (const id of s.roster) clean[id] = Math.round(prog[id] ?? 0);
    return finish(s, winner, clean);
  });
}

/** Duel: a goal for `scorer`, counted once per ball serial `k`. */
export function scoreGoal(roomId: string, gameNo: number, scorer: string, k: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.gameNo !== gameNo || k <= s.lastK) return null;
    const goals = { ...s.goals, [scorer]: (s.goals[scorer] ?? 0) + 1 };
    const next = { ...s, goals, lastK: k };
    return goals[scorer] >= s.target ? finish(next, scorer, goals) : next;
  });
}

/** Duel: the rival left; the one still here wins. */
export function forfeit(roomId: string, gameNo: number, winner: string) {
  return mutate(roomId, (s) => (s.status !== "playing" || s.gameNo !== gameNo ? null : finish(s, winner, s.goals)));
}

/** Co-op: a ball lost, counted once per serial `k`. */
export function loseLife(roomId: string, gameNo: number, k: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.gameNo !== gameNo || k <= s.lastK) return null;
    const next = { ...s, lives: s.lives - 1, lastK: k };
    return next.lives <= 0 ? finish(next, "lost", {}) : next;
  });
}

export function coopWon(roomId: string, gameNo: number) {
  return mutate(roomId, (s) => (s.status !== "playing" || s.gameNo !== gameNo ? null : finish(s, "won", {})));
}

// ---- Boards (race and attack) ------------------------------------------------

export function subscribeBoards(roomId: string, gameNo: number, cb: (boards: Record<string, RemoteBoard>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/boards/g${gameNo}`), (snap) => cb(snap.val() ?? {}));
}

/** My board's moving parts; `cells` only when they changed. */
export function sendBoard(roomId: string, gameNo: number, id: string, board: Omit<RemoteBoard, "c">, cells?: string) {
  const path = `${base(roomId)}/boards/g${gameNo}/${id}`;
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(board)) patch[`${path}/${k}`] = v;
  if (cells !== undefined) patch[`${path}/c`] = cells;
  return update(ref(getDb()), patch).catch(console.error);
}

export interface Attack {
  r: number;
  by: string;
}

export function sendAttack(roomId: string, gameNo: number, victim: string, by: string, rows: number) {
  return push(ref(getDb(), `${base(roomId)}/attacks/g${gameNo}/${victim}`), { r: rows, by }).catch(console.error);
}

export function subscribeAttacks(roomId: string, gameNo: number, cb: (attacks: Record<string, Record<string, Attack>>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/attacks/g${gameNo}`), (snap) => cb(snap.val() ?? {}));
}

// ---- The shared field (duel and co-op) ------------------------------------------

export interface SharedField {
  ball: SharedBall | null;
  cells: Record<string, string>;
  pads: Record<string, number>;
}

export function subscribeShared(roomId: string, gameNo: number, cb: (field: SharedField) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/shared/g${gameNo}`), (snap) => {
    const raw = (snap.val() ?? {}) as Partial<SharedField>;
    cb({ ball: raw.ball ?? null, cells: raw.cells ?? {}, pads: raw.pads ?? {} });
  });
}

export function sendBall(roomId: string, gameNo: number, ball: SharedBall) {
  return set(ref(getDb(), `${base(roomId)}/shared/g${gameNo}/ball`), ball).catch(console.error);
}

/** The first serve: only if nobody wrote a ball yet. */
export function initBall(roomId: string, gameNo: number, ball: SharedBall) {
  return runTransaction(ref(getDb(), `${base(roomId)}/shared/g${gameNo}/ball`), (cur: SharedBall | null) => (cur ? undefined : ball));
}

export function sendCells(roomId: string, gameNo: number, cells: Record<number, string>) {
  const patch: Record<string, string> = {};
  for (const [i, ch] of Object.entries(cells)) patch[`${base(roomId)}/shared/g${gameNo}/cells/c${i}`] = ch;
  return update(ref(getDb()), patch).catch(console.error);
}

/** My paddle on the shared field; removed when I disconnect. */
export function openPad(roomId: string, gameNo: number, id: string) {
  const r = ref(getDb(), `${base(roomId)}/shared/g${gameNo}/pads/${id}`);
  onDisconnect(r).remove().catch(console.error);
  return {
    send: (x: number) => set(r, Math.round(x * 100) / 100).catch(console.error),
    close: () => {
      onDisconnect(r).cancel().catch(console.error);
      remove(r).catch(console.error);
    },
  };
}

export function sendPad(roomId: string, gameNo: number, id: string, x: number) {
  return set(ref(getDb(), `${base(roomId)}/shared/g${gameNo}/pads/${id}`), Math.round(x * 100) / 100).catch(console.error);
}

// ---- Online ------------------------------------------------------------------

async function ensureWorld(roomId: string) {
  const db = getDb();
  await runTransaction(ref(db, `rooms/${roomId}/meta`), (cur: Partial<LadriMeta> | null) =>
    cur ? undefined : { game: "ladrillazo", mode: "carrera", level: -1, bots: 0, goals: 5, online: true, createdAt: serverNow() }
  );
  await runTransaction(ref(db, statePath(roomId)), (cur: Partial<LadriState> | null) =>
    cur ? undefined : { status: "finished", online: true, mode: "carrera", level: -1, seed: makeSeed(), gameNo: 0, nextAt: 0 }
  );
}

async function worldCrowds(): Promise<{ id: string; people: number }[]> {
  const db = getDb();
  return Promise.all(
    ONLINE_WORLDS.map(async (id) => {
      const presence = await get(ref(db, `rooms/${id}/presence`));
      return { id, people: presence.size };
    })
  );
}

export async function onlineCount(): Promise<number> {
  const crowds = await worldCrowds();
  return crowds.reduce((sum, w) => sum + w.people, 0);
}

/** The busiest world with room left, so people meet each other. */
export async function enterOnline(): Promise<string> {
  const crowds = await worldCrowds();
  const open = crowds.filter((w) => w.people < ONLINE_MAX_PEOPLE).sort((a, b) => b.people - a.people);
  const id = open[0]?.id ?? ONLINE_WORLDS[0];
  await ensureWorld(id);
  return id;
}

/** Online: the next round, once the results were shown. Races, and every third round an attack. */
export function nextOnlineRound(roomId: string, connected: string[]) {
  return mutate(roomId, (s) => {
    if (!s.online || s.status === "playing" || serverNow() < s.nextAt) return null;
    const mode: LadriMode = s.gameNo % 3 === 2 ? "ataque" : "carrera";
    return newGame(s, { mode, level: -1, bots: 0, goals: 5 }, connected, s.gameNo + 1);
  }).then((res) => {
    if (res.committed) clearOld(roomId, (res.snapshot.val() as LadriState).gameNo);
    return res;
  });
}
