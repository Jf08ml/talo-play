import { ref, get, onValue, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, mulberry32, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import type { TeamId } from "./teams";
import { LEGACY_COUNT, ONDA_DECKS, ONDA_SPECTRA, type OndaDeck } from "./ondaSpectra";

/**
 * En la misma onda (Wavelength-style). Each turn one player, the psychic, sees
 * where a hidden target sits on a scale (0–100, e.g. "Frío ↔ Caliente") and
 * gives a one-line clue; the rest place a needle. The closer, the more points.
 *
 * Three modes (`meta.mode`; rooms from before have none = "cada"):
 * - `cada`: everyone places their own needle in secret; each guesser scores,
 *   the psychic gets the guessers' average. Works from two players.
 * - `juntos`: one shared needle (`onda/live`, plain writes while dragging)
 *   that everyone moves and anyone locks; the group scores together and ends
 *   with its "sintonía" (points over the most possible).
 * - `equipos`: red vs blue, turns alternate. The psychic's team moves the
 *   shared needle and locks it; the other team bets whether the target is
 *   left or right of it (+1 if right).
 *
 * The psychic of each turn is picked when it starts (`psychic`): the connected
 * player who gave the fewest clues (in equipos, from the team whose turn it
 * is), so people arriving late also get to give clues. The game ends when
 * everyone connected gave `rounds` clues (and, in equipos, both teams had as
 * many turns).
 *
 * Scale and target derive from the seed and the turn (`spectrumFor`,
 * `targetFor`), so they're readable with DevTools — accepted, it's a party game.
 */

export const MIN_PLAYERS = 2;
export const MIN_PER_TEAM = 2;
export const ROUND_OPTIONS = [1, 2, 3] as const;
export const SECOND_OPTIONS = [0, 60, 90] as const;
export const BET_SECONDS = 30;
export const MAX_CLUE_LENGTH = 60;
export const MAX_CUSTOM_SPECTRA = 40;
const MAX_TURNS = 80;

/** Points by distance to the target: within 3 → 4, 8 → 3, 13 → 2. */
export const BANDS: { within: number; points: number }[] = [
  { within: 3, points: 4 },
  { within: 8, points: 3 },
  { within: 13, points: 2 },
];
export const TOP_POINTS = BANDS[0].points;

export type OndaMode = "cada" | "juntos" | "equipos";

export interface OndaMeta {
  game: "onda";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  /** Times each player is the psychic. */
  rounds: number;
  mode?: OndaMode;
  /** Absent in rooms from before the decks: the first LEGACY_COUNT scales. */
  decks?: OndaDeck[];
  /** The room's own scales, "Left|Right". */
  customSpectra?: string[];
  /** Seconds to guess (0 = no clock). */
  seconds?: number;
  createdAt: number | object;
}

export type OndaStatus = "waiting" | "clue" | "guessing" | "betting" | "reveal" | "finished";

export interface OndaPlayer {
  name: string;
  color: string;
}

/** One turn, for the end-of-game recap. */
export interface OndaLog {
  /** Turn and skips, to rebuild its scale. */
  k: number;
  sk: number;
  /** Psychic, clue, target. */
  p: string;
  c: string;
  t: number;
  /** The needle (the group's, or the closest guess) and the turn's points. */
  g: number;
  pts: number;
  team?: TeamId;
}

export interface OndaState {
  status: OndaStatus;
  mode: OndaMode;
  rounds: number;
  seconds: number;
  seed: number;
  gameNo: number;
  players: Record<string, OndaPlayer>;
  teams: Record<string, TeamId>;
  /** Everyone taking part, in the order they joined the game (ties when picking psychics). */
  order: string[];
  psychic: string;
  /** Equipos: whose turn it is. */
  turnTeam: TeamId | "";
  turnNo: number;
  /** Scales the psychics skipped this game: shifts which scale comes up. */
  skips: number;
  clue: string;
  /** Cada: needle per guesser for the current turn (0–100). */
  guesses: Record<string, number>;
  /** Juntos/equipos: the locked shared needle (-1 = not yet). */
  shared: number;
  /** Equipos: the rival team's bet and whether it was right. */
  bet: "" | "izq" | "der";
  betWon: boolean;
  /** Server ms when the current phase started (for the clock). */
  phaseAt: number;
  /** Clues given per player this game. */
  gave: Record<string, number>;
  teamTurns: Record<TeamId, number>;
  /** Cada: points per player. */
  scores: Record<string, number>;
  /** Juntos: "grupo"; equipos: "red"/"blue". */
  teamScores: Record<string, number>;
  log: OndaLog[];
}

function asArray<T>(v: T[] | Record<string, T> | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v.filter(Boolean) : Object.values(v);
}

function normalizeState(raw: Partial<OndaState> | null): OndaState | null {
  if (!raw || !raw.status) return null;
  const order = asArray(raw.order as string[] | undefined);
  const turnNo = raw.turnNo ?? 0;
  return {
    status: raw.status,
    mode: raw.mode ?? "cada",
    rounds: raw.rounds ?? 2,
    seconds: raw.seconds ?? 0,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    teams: raw.teams ?? {},
    order,
    // Games started before `psychic` existed rotate through the order.
    psychic: raw.psychic ?? (order.length ? order[turnNo % order.length] : ""),
    turnTeam: raw.turnTeam ?? "",
    turnNo,
    skips: raw.skips ?? 0,
    clue: raw.clue ?? "",
    guesses: raw.guesses ?? {},
    shared: raw.shared ?? -1,
    bet: raw.bet ?? "",
    betWon: raw.betWon ?? false,
    phaseAt: raw.phaseAt ?? 0,
    gave: raw.gave ?? {},
    teamTurns: { red: 0, blue: 0, ...(raw.teamTurns ?? {}) },
    scores: raw.scores ?? {},
    teamScores: raw.teamScores ?? {},
    log: asArray(raw.log as OndaLog[] | undefined),
  };
}

export function normalizeMeta(raw: Partial<OndaMeta>) {
  return {
    hostId: raw.hostId ?? "",
    rounds: Number(raw.rounds ?? 2),
    mode: (raw.mode ?? "cada") as OndaMode,
    decks: raw.decks ? asArray(raw.decks as OndaDeck[]) : null,
    customSpectra: asArray(raw.customSpectra as string[] | undefined),
    seconds: Number(raw.seconds ?? 0),
  };
}

export type OndaConfig = ReturnType<typeof normalizeMeta>;

export function psychicOf(s: Pick<OndaState, "psychic">): string {
  return s.psychic;
}

/** The scales this room plays with. */
export function spectrumPool(meta: Pick<OndaConfig, "decks" | "customSpectra">): [string, string][] {
  const base: [string, string][] = meta.decks
    ? ONDA_SPECTRA.filter((s) => meta.decks!.includes(s[2] ?? "clasicas")).map((s) => [s[0], s[1]])
    : ONDA_SPECTRA.slice(0, LEGACY_COUNT).map((s) => [s[0], s[1]]);
  const own = meta.customSpectra
    .map((line) => line.split("|").map((x) => x.trim()))
    .filter((p) => p.length === 2 && p[0] && p[1]) as [string, string][];
  const pool = [...base, ...own];
  return pool.length ? pool : ONDA_SPECTRA.slice(0, LEGACY_COUNT).map((s) => [s[0], s[1]]);
}

/** The scale of a turn: a seeded shuffle of the pool, moved on by the skips. */
export function spectrumFor(s: Pick<OndaState, "seed" | "turnNo" | "skips">, pool: [string, string][]): [string, string] {
  const order = seededShuffle(
    pool.map((_, i) => i),
    s.seed
  );
  return pool[order[(s.turnNo + s.skips) % order.length]];
}

/** The hidden target of a turn, 4–96 so the best band always fits on the dial. */
export function targetFor(s: Pick<OndaState, "seed" | "turnNo" | "skips">): number {
  const rand = mulberry32((s.seed ^ Math.imul(s.turnNo + 1, 0x9e3779b1) ^ Math.imul(s.skips + 1, 0x85ebca6b)) >>> 0);
  return 4 + Math.floor(rand() * 93);
}

export function pointsFor(guess: number, target: number): number {
  const d = Math.abs(guess - target);
  return BANDS.find((b) => d <= b.within)?.points ?? 0;
}

/** A clue can't be a position. */
export function clueProblem(clue: string): string | null {
  if (/\d/.test(clue)) return "Sin números: la pista tiene que ser una cosa, una palabra o un personaje.";
  return null;
}

/** Who may move / lock the shared needle now. */
export function canSteer(s: OndaState, id: string): boolean {
  if (s.status !== "guessing" || id === s.psychic || !s.players[id]) return false;
  if (s.mode === "juntos") return true;
  if (s.mode === "equipos") return s.teams[id] === s.turnTeam;
  return false;
}

export function canBet(s: OndaState, id: string): boolean {
  return s.status === "betting" && !!s.teams[id] && s.teams[id] !== s.turnTeam;
}

/** "Sintonía": the group's points over the most it could have made. */
export function harmony(s: Pick<OndaState, "teamScores" | "log">): number {
  if (!s.log.length) return 0;
  return Math.round(((s.teamScores.grupo ?? 0) / (s.log.length * TOP_POINTS)) * 100);
}

/** About how many turns the game has, for "Turno 3 de 8". */
export function turnsEstimate(s: OndaState, connected: string[]): number {
  const here = s.order.filter((id) => connected.includes(id));
  if (s.mode === "equipos") {
    const red = here.filter((id) => s.teams[id] === "red").length;
    const blue = here.filter((id) => s.teams[id] === "blue").length;
    return Math.max(s.turnNo + 1, 2 * s.rounds * Math.max(red, blue, 1));
  }
  return Math.max(s.turnNo + 1, s.rounds * Math.max(here.length, 1));
}

// ---- Turn flow (pure, run inside the transactions) ------------------------------

const other = (t: TeamId): TeamId => (t === "red" ? "blue" : "red");

/** Next psychic among the connected: fewest clues given, then join order. */
function pickPsychic(s: OndaState, connected: string[], team: TeamId | ""): string {
  const pool = s.order.filter((id) => connected.includes(id) && s.players[id] && (!team || s.teams[id] === team));
  let best = "";
  for (const id of pool) if (!best || (s.gave[id] ?? 0) < (s.gave[best] ?? 0)) best = id;
  return best;
}

/** Starts turn `turnNo` (or ends the game when everyone connected gave their clues). */
function beginTurn(s: OndaState, connected: string[], turnNo: number): OndaState {
  const here = s.order.filter((id) => connected.includes(id) && s.players[id]);
  const owing = here.some((id) => (s.gave[id] ?? 0) < s.rounds);
  const even = s.mode !== "equipos" || s.teamTurns.red === s.teamTurns.blue;
  if (turnNo > 0 && ((!owing && even) || turnNo >= MAX_TURNS || here.length < 2)) return { ...s, status: "finished" };
  let team: TeamId | "" = "";
  let psychic = "";
  if (s.mode === "equipos") {
    team = s.turnTeam ? other(s.turnTeam) : Math.random() < 0.5 ? "red" : "blue";
    psychic = pickPsychic(s, connected, team);
    if (!psychic) {
      team = other(team);
      psychic = pickPsychic(s, connected, team);
    }
  } else {
    psychic = pickPsychic(s, connected, "");
  }
  if (!psychic) return { ...s, status: "finished" };
  return {
    ...s,
    status: "clue",
    turnNo,
    psychic,
    turnTeam: team,
    clue: "",
    guesses: {},
    shared: -1,
    bet: "",
    betWon: false,
    phaseAt: serverNow(),
    gave: { ...s.gave, [psychic]: (s.gave[psychic] ?? 0) + 1 },
    teamTurns: team ? { ...s.teamTurns, [team]: s.teamTurns[team] + 1 } : s.teamTurns,
  };
}

/** Scores the turn and shows the target. */
function reveal(s: OndaState): OndaState {
  const target = targetFor(s);
  const entry: OndaLog = { k: s.turnNo, sk: s.skips, p: s.psychic, c: s.clue, t: target, g: -1, pts: 0 };
  const next: OndaState = { ...s, status: "reveal", phaseAt: serverNow() };
  if (s.mode === "cada") {
    const scores = { ...s.scores };
    const earned: number[] = [];
    let closest = -1;
    for (const [id, g] of Object.entries(s.guesses)) {
      const p = pointsFor(g, target);
      scores[id] = (scores[id] ?? 0) + p;
      earned.push(p);
      if (closest < 0 || Math.abs(g - target) < Math.abs(closest - target)) closest = g;
    }
    const avg = earned.length ? Math.round(earned.reduce((a, b) => a + b, 0) / earned.length) : 0;
    if (earned.length) scores[s.psychic] = (scores[s.psychic] ?? 0) + avg;
    entry.g = closest;
    entry.pts = avg;
    next.scores = scores;
  } else {
    const pts = s.shared >= 0 ? pointsFor(s.shared, target) : 0;
    entry.g = s.shared;
    entry.pts = pts;
    const ts = { ...s.teamScores };
    if (s.mode === "juntos") ts.grupo = (ts.grupo ?? 0) + pts;
    else if (s.turnTeam) {
      entry.team = s.turnTeam;
      ts[s.turnTeam] = (ts[s.turnTeam] ?? 0) + pts;
      const side = target < s.shared ? "izq" : target > s.shared ? "der" : "";
      next.betWon = !!s.bet && s.bet === side;
      if (next.betWon) ts[other(s.turnTeam)] = (ts[other(s.turnTeam)] ?? 0) + 1;
    }
    next.teamScores = ts;
  }
  next.log = [...s.log, entry];
  return next;
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/onda/state`;
const livePath = (roomId: string) => `rooms/${roomId}/onda/live`;

function mutate(roomId: string, fn: (state: OndaState) => OndaState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export interface OndaParams {
  rounds: number;
  mode: OndaMode;
  decks: OndaDeck[];
  customSpectra: string[];
  seconds: number;
}

export async function createOndaRoom(params: OndaParams, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: OndaMeta = { game: "onda", hostId, ...params, createdAt: serverTimestamp() };
  const state: Partial<OndaState> = { status: "waiting", mode: params.mode, seed: makeSeed(), gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getOndaMeta(roomId: string): Promise<Partial<OndaMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeOnda(roomId: string, cb: (state: OndaState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

const teamCount = (s: OndaState, t: TeamId, ids = s.order) => ids.filter((id) => s.teams[id] === t).length;

/** Enters the room; mid-game, a newcomer joins the game (and, in equipos, the smaller team). */
export function joinOnda(roomId: string, clientId: string, player: OndaPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    const playing = s.status !== "waiting" && s.status !== "finished";
    const joinOrder = playing && !s.order.includes(clientId);
    const needTeam = playing && s.mode === "equipos" && !s.teams[clientId];
    if (!joinOrder && !needTeam && known?.name === player.name && known?.color === player.color) return null;
    const next = { ...s, players: { ...s.players, [clientId]: player } };
    if (joinOrder) next.order = [...s.order, clientId];
    if (needTeam) next.teams = { ...s.teams, [clientId]: teamCount(s, "red") <= teamCount(s, "blue") ? "red" : "blue" };
    return next;
  });
}

export function chooseTeam(roomId: string, clientId: string, team: TeamId) {
  return mutate(roomId, (s) => (s.status !== "waiting" || s.teams[clientId] === team ? null : { ...s, teams: { ...s.teams, [clientId]: team } }));
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

/** Teams as they'd start: those without one go to the smaller team. */
export function teamsAtStart(s: Pick<OndaState, "teams" | "players">, connected: string[]): Record<string, TeamId> {
  const ids = connected.filter((id) => s.players[id]);
  const teams: Record<string, TeamId> = {};
  for (const id of ids) if (s.teams[id]) teams[id] = s.teams[id];
  const count = (t: TeamId) => Object.values(teams).filter((x) => x === t).length;
  for (const id of ids) if (!teams[id]) teams[id] = count("red") <= count("blue") ? "red" : "blue";
  return teams;
}

/** Why the game can't start yet (null = it can). */
export function startProblem(s: OndaState, mode: OndaMode, connected: string[]): string | null {
  if (mode !== "equipos") return null;
  const teams = teamsAtStart(s, connected);
  const red = Object.values(teams).filter((t) => t === "red").length;
  const blue = Object.values(teams).filter((t) => t === "blue").length;
  if (red < MIN_PER_TEAM || blue < MIN_PER_TEAM) return `Hacen falta al menos ${MIN_PER_TEAM} por equipo: uno da la pista y el resto adivina.`;
  return null;
}

/** Starts with the connected players, in a random order. */
export function startOnda(roomId: string, connected: string[], meta: OndaConfig) {
  return mutate(roomId, (s) => {
    const ids = connected.filter((id) => s.players[id]);
    if (s.status !== "waiting" || ids.length < MIN_PLAYERS || startProblem(s, meta.mode, connected)) return null;
    const base: OndaState = {
      ...s,
      mode: meta.mode,
      rounds: meta.rounds,
      seconds: meta.seconds,
      teams: meta.mode === "equipos" ? teamsAtStart(s, connected) : s.teams,
      order: seededShuffle(ids, makeSeed()),
      turnTeam: "",
      skips: 0,
      gave: {},
      teamTurns: { red: 0, blue: 0 },
      scores: {},
      teamScores: {},
      log: [],
    };
    return beginTurn(base, connected, 0);
  });
}

/** The psychic asks for another scale (before giving the clue). */
export function skipSpectrum(roomId: string, clientId: string, expectedTurn: number) {
  return mutate(roomId, (s) =>
    s.status === "clue" && s.turnNo === expectedTurn && s.psychic === clientId ? { ...s, skips: s.skips + 1 } : null
  );
}

export function giveClue(roomId: string, clientId: string, expectedTurn: number, clue: string) {
  const text = clue.trim().slice(0, MAX_CLUE_LENGTH);
  return mutate(roomId, (s) => {
    if (s.status !== "clue" || s.turnNo !== expectedTurn || s.psychic !== clientId || !text || clueProblem(text)) return null;
    return { ...s, status: "guessing", clue: text, guesses: {}, shared: -1, phaseAt: serverNow() };
  });
}

/** Cada: a guesser locks their needle; when `needed` guessers did, the target is revealed. */
export function submitGuess(roomId: string, clientId: string, expectedTurn: number, value: number, needed: number) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return mutate(roomId, (s) => {
    if (s.mode !== "cada" || s.status !== "guessing" || s.turnNo !== expectedTurn) return null;
    if (!s.players[clientId] || s.psychic === clientId || clientId in s.guesses) return null;
    const next = { ...s, guesses: { ...s.guesses, [clientId]: v } };
    return Object.keys(next.guesses).length >= needed ? reveal(next) : next;
  });
}

/** Cada: reveal with the guesses there are (someone is slow, left, or time's up). */
export function revealNow(roomId: string, expectedTurn: number, evenEmpty = false) {
  return mutate(roomId, (s) => {
    if (s.mode !== "cada" || s.status !== "guessing" || s.turnNo !== expectedTurn) return null;
    if (!evenEmpty && Object.keys(s.guesses).length === 0) return null;
    return reveal(s);
  });
}

/** Juntos/equipos: lock the shared needle (juntos reveals; equipos goes to the rival's bet). */
export function lockNeedle(roomId: string, clientId: string | null, expectedTurn: number, value: number) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return mutate(roomId, (s) => {
    if (s.status !== "guessing" || s.turnNo !== expectedTurn || s.mode === "cada") return null;
    // null = the clock ran out (any client).
    if (clientId !== null && !canSteer(s, clientId)) return null;
    const locked = { ...s, shared: v };
    return s.mode === "juntos" ? reveal(locked) : { ...locked, status: "betting", phaseAt: serverNow() };
  });
}

/** Equipos: the rival team bets left or right of the needle (null side = time's up, no bet). */
export function placeBet(roomId: string, clientId: string | null, expectedTurn: number, side: "izq" | "der" | null) {
  return mutate(roomId, (s) => {
    if (s.status !== "betting" || s.turnNo !== expectedTurn) return null;
    if (clientId !== null && !canBet(s, clientId)) return null;
    return reveal({ ...s, bet: side ?? "" });
  });
}

export function nextTurn(roomId: string, expectedTurn: number, connected: string[]) {
  return mutate(roomId, (s) => (s.status === "reveal" && s.turnNo === expectedTurn ? beginTurn(s, connected, s.turnNo + 1) : null));
}

/** The psychic left before the reveal: give the clue back and on to the next one. */
export function skipTurn(roomId: string, expectedTurn: number, connected: string[]) {
  return mutate(roomId, (s) => {
    if ((s.status !== "clue" && s.status !== "guessing" && s.status !== "betting") || s.turnNo !== expectedTurn) return null;
    const gave = { ...s.gave, [s.psychic]: Math.max(0, (s.gave[s.psychic] ?? 1) - 1) };
    const teamTurns = s.turnTeam ? { ...s.teamTurns, [s.turnTeam]: Math.max(0, s.teamTurns[s.turnTeam] - 1) } : s.teamTurns;
    // The skipped turn's team keeps the next one.
    const turnTeam = s.turnTeam ? other(s.turnTeam) : s.turnTeam;
    return beginTurn({ ...s, gave, teamTurns, turnTeam }, connected, s.turnNo + 1);
  });
}

/** Back to the waiting room with a new seed, so whoever is here now plays (teams kept). */
export function playAgain(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    return {
      ...s,
      status: "waiting",
      seed: makeSeed(),
      gameNo: s.gameNo + 1,
      order: [],
      psychic: "",
      turnTeam: "",
      turnNo: 0,
      skips: 0,
      clue: "",
      guesses: {},
      shared: -1,
      bet: "",
      gave: {},
      teamTurns: { red: 0, blue: 0 },
      scores: {},
      teamScores: {},
      log: [],
    };
  });
}

// ---- The shared needle, live ------------------------------------------------------

export interface LiveNeedle {
  v: number;
  /** Which turn ("g{gameNo}t{turnNo}") and who moved it last. */
  k: string;
  by: string;
}

export const liveKey = (s: Pick<OndaState, "gameNo" | "turnNo">) => `g${s.gameNo}t${s.turnNo}`;

export function subscribeLive(roomId: string, cb: (n: LiveNeedle | null) => void): Unsubscribe {
  return onValue(ref(getDb(), livePath(roomId)), (snap) => cb(snap.val()));
}

export function sendLive(roomId: string, n: LiveNeedle) {
  return set(ref(getDb(), livePath(roomId)), n).catch(console.error);
}

export const deckLabel = (id: OndaDeck) => ONDA_DECKS.find((d) => d.id === id)?.label ?? id;
