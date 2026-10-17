import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";

/**
 * Hombre lobo. The app is the narrator: it deals secret roles and runs the
 * nights and days. At night every living player picks someone on their phone
 * (wolves their victim, the seer who to inspect, the medic who to protect,
 * villagers a decoy suspicion), so nobody gives their role away by tapping.
 * By day the dawn news is out and the living vote who to eliminate (the
 * discussion happens out loud or on a call). Villagers win when no wolf is
 * left; wolves when they are as many as the rest.
 *
 * Roles live in the state (readable with DevTools — accepted, no backend).
 */

export const MIN_PLAYERS = 5;
export const NIGHT_SECONDS = 60;
export const DAY_OPTIONS = [120, 180, 300] as const;
/** Day vote target meaning "nobody is eliminated". */
export const NOBODY = "-";

export type Role = "lobo" | "vidente" | "medico" | "aldeano";

export const ROLES: Record<Role, { label: string; emoji: string; team: "lobos" | "pueblo"; goal: string; night: string }> = {
  lobo: {
    label: "Hombre lobo",
    emoji: "🐺",
    team: "lobos",
    goal: "Cada noche, con los otros lobos, elegí a quién atacar. De día, hacete pasar por aldeano.",
    night: "¿A quién atacan esta noche?",
  },
  vidente: {
    label: "Vidente",
    emoji: "🔮",
    team: "pueblo",
    goal: "Cada noche podés descubrir si alguien es lobo. Usá lo que sabés sin delatarte.",
    night: "¿A quién querés investigar?",
  },
  medico: {
    label: "Médico",
    emoji: "🩺",
    team: "pueblo",
    goal: "Cada noche protegés a alguien (podés ser vos) del ataque. No al mismo dos noches seguidas.",
    night: "¿A quién protegés esta noche?",
  },
  aldeano: {
    label: "Aldeano",
    emoji: "🧑‍🌾",
    team: "pueblo",
    goal: "No tenés poderes: descubrí a los lobos charlando y votando de día.",
    night: "¿De quién sospechás? (es para disimular: nadie se entera)",
  },
};

export interface LoboMeta {
  game: "lobo";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  daySeconds: number;
  createdAt: number | object;
}

export type LoboStatus = "waiting" | "night" | "day" | "dusk" | "finished";

export interface LoboPlayer {
  name: string;
  color: string;
}

export interface LoboState {
  status: LoboStatus;
  gameNo: number;
  players: Record<string, LoboPlayer>;
  /** Roles of this game's players (whoever joins later only watches). */
  roles: Record<string, Role>;
  alive: Record<string, boolean>;
  /** Night number, from 1. */
  round: number;
  phaseStartedAt: number;
  /** Night picks of the living: player → target. */
  actions: Record<string, string>;
  /** Who the medic protected last night (can't repeat). */
  lastProtected: string;
  /** What the village learns at dawn. */
  dawn: { killed: string; saved: boolean };
  /** Day votes: voter → target, or NOBODY. */
  votes: Record<string, string>;
  /** The day's result. */
  lynch: { id: string; tie: boolean };
  /** Seer's inspections by night: `r{n}` → target. */
  seerLog: Record<string, string>;
  winner: "lobos" | "pueblo" | "";
}

function normalizeState(raw: Partial<LoboState> | null): LoboState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    roles: raw.roles ?? {},
    alive: raw.alive ?? {},
    round: raw.round ?? 0,
    phaseStartedAt: raw.phaseStartedAt ?? 0,
    actions: raw.actions ?? {},
    lastProtected: raw.lastProtected ?? "",
    dawn: { killed: raw.dawn?.killed ?? "", saved: raw.dawn?.saved ?? false },
    votes: raw.votes ?? {},
    lynch: { id: raw.lynch?.id ?? "", tie: raw.lynch?.tie ?? false },
    seerLog: raw.seerLog ?? {},
    winner: raw.winner ?? "",
  };
}

export function wolvesFor(players: number): number {
  return players <= 6 ? 1 : players <= 9 ? 2 : players <= 12 ? 3 : 4;
}

export function living(s: Pick<LoboState, "roles" | "alive">): string[] {
  return Object.keys(s.roles).filter((id) => s.alive[id]);
}

export function winnerOf(s: Pick<LoboState, "roles" | "alive">): LoboState["winner"] {
  const alive = living(s);
  const wolves = alive.filter((id) => s.roles[id] === "lobo").length;
  if (wolves === 0) return "pueblo";
  if (wolves >= alive.length - wolves) return "lobos";
  return "";
}

/** Votes per target, most voted first. */
export function tally(votes: Record<string, string>): [string, number][] {
  const counts = new Map<string, number>();
  for (const t of Object.values(votes)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** Who may pick `target` at night, for a player with `role`. */
export function canTarget(s: LoboState, me: string, role: Role, target: string): boolean {
  if (!s.alive[target]) return false;
  if (role === "lobo") return s.roles[target] !== "lobo";
  if (role === "medico") return target !== s.lastProtected;
  return target !== me;
}

function resolveNight(s: LoboState): LoboState {
  const wolfVotes: Record<string, string> = {};
  for (const [id, t] of Object.entries(s.actions)) if (s.roles[id] === "lobo" && s.alive[id]) wolfVotes[id] = t;
  const rows = tally(wolfVotes);
  const top = rows.filter(([, n]) => n === rows[0]?.[1]).map(([id]) => id);
  const victim = top.length ? top[Math.floor(Math.random() * top.length)] : "";
  const medic = Object.keys(s.roles).find((id) => s.roles[id] === "medico" && s.alive[id]);
  const protectedId = medic ? (s.actions[medic] ?? "") : "";
  const seer = Object.keys(s.roles).find((id) => s.roles[id] === "vidente" && s.alive[id]);
  const seerLog = seer && s.actions[seer] ? { ...s.seerLog, [`r${s.round}`]: s.actions[seer] } : s.seerLog;
  const saved = !!victim && victim === protectedId;
  const killed = victim && !saved ? victim : "";
  const alive = killed ? { ...s.alive, [killed]: false } : s.alive;
  const next: LoboState = {
    ...s,
    alive,
    seerLog,
    lastProtected: protectedId,
    dawn: { killed, saved },
    votes: {},
    lynch: { id: "", tie: false },
    phaseStartedAt: serverNow(),
  };
  const winner = winnerOf(next);
  return winner ? { ...next, status: "finished", winner } : { ...next, status: "day" };
}

function resolveDay(s: LoboState): LoboState {
  const rows = tally(s.votes);
  const tie = rows.length > 1 && rows[0][1] === rows[1][1];
  const top = rows[0]?.[0] ?? NOBODY;
  const id = !tie && top !== NOBODY ? top : "";
  const alive = id ? { ...s.alive, [id]: false } : s.alive;
  const next: LoboState = { ...s, alive, lynch: { id, tie }, phaseStartedAt: serverNow() };
  const winner = winnerOf(next);
  return winner ? { ...next, status: "finished", winner } : { ...next, status: "dusk" };
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/lobo/state`;

function mutate(roomId: string, fn: (state: LoboState) => LoboState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createLoboRoom(params: { daySeconds: number }, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: LoboMeta = { game: "lobo", hostId, ...params, createdAt: serverTimestamp() };
  const state: Partial<LoboState> = { status: "waiting", gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getLoboMeta(roomId: string): Promise<Partial<LoboMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeLobo(roomId: string, cb: (state: LoboState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinLobo(roomId: string, clientId: string, player: LoboPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

/** Deals the roles to the connected players and starts the first night. */
export function startLobo(roomId: string, connected: string[]) {
  return mutate(roomId, (s) => {
    const ids = connected.filter((id) => s.players[id]);
    if (s.status !== "waiting" || ids.length < MIN_PLAYERS) return null;
    const shuffled = seededShuffle(ids, makeSeed());
    const wolves = wolvesFor(ids.length);
    const roles: Record<string, Role> = {};
    shuffled.forEach((id, i) => {
      roles[id] = i < wolves ? "lobo" : i === wolves ? "vidente" : i === wolves + 1 ? "medico" : "aldeano";
    });
    return {
      ...s,
      status: "night",
      roles,
      alive: Object.fromEntries(ids.map((id) => [id, true])),
      round: 1,
      phaseStartedAt: serverNow(),
      actions: {},
      lastProtected: "",
      dawn: { killed: "", saved: false },
      votes: {},
      lynch: { id: "", tie: false },
      seerLog: {},
      winner: "",
    };
  });
}

/** My night pick; the night ends once every living player in `needed` picked. */
export function nightAction(roomId: string, clientId: string, expectedRound: number, target: string, needed: string[]) {
  return mutate(roomId, (s) => {
    if (s.status !== "night" || s.round !== expectedRound || !s.alive[clientId]) return null;
    const role = s.roles[clientId];
    if (!role || s.actions[clientId] || !canTarget(s, clientId, role, target)) return null;
    const next = { ...s, actions: { ...s.actions, [clientId]: target } };
    return needed.every((id) => !next.alive[id] || next.actions[id]) ? resolveNight(next) : next;
  });
}

/** Time's up (or someone left): dawn comes with the picks there are. */
export function closeNight(roomId: string, expectedRound: number) {
  return mutate(roomId, (s) => (s.status === "night" && s.round === expectedRound ? resolveNight(s) : null));
}

/** My day vote (it can change until everyone voted). */
export function dayVote(roomId: string, clientId: string, expectedRound: number, target: string, needed: string[]) {
  return mutate(roomId, (s) => {
    if (s.status !== "day" || s.round !== expectedRound || !s.alive[clientId]) return null;
    if (target !== NOBODY && !s.alive[target]) return null;
    if (s.votes[clientId] === target) return null;
    const next = { ...s, votes: { ...s.votes, [clientId]: target } };
    return needed.every((id) => !next.alive[id] || next.votes[id]) ? resolveDay(next) : next;
  });
}

export function closeDay(roomId: string, expectedRound: number) {
  return mutate(roomId, (s) => (s.status === "day" && s.round === expectedRound ? resolveDay(s) : null));
}

/** After the day's result: on to the next night. */
export function nextNight(roomId: string, expectedRound: number) {
  return mutate(roomId, (s) =>
    s.status === "dusk" && s.round === expectedRound
      ? { ...s, status: "night", round: s.round + 1, actions: {}, phaseStartedAt: serverNow() }
      : null
  );
}

/** Back to the waiting room so whoever is here plays with new roles. */
export function playAgain(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    return {
      ...s,
      status: "waiting",
      gameNo: s.gameNo + 1,
      roles: {},
      alive: {},
      round: 0,
      actions: {},
      votes: {},
      seerLog: {},
      winner: "",
    };
  });
}
