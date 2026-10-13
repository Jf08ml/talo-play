import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import type { TeamId } from "./teams";
import { MIMICA_WORDS, type MimicaWord } from "./mimicaWords";

/**
 * Mímica, in person. Two teams take turns: one member (the actor, rotating)
 * sees words on their phone and acts them out against the clock while their
 * team guesses aloud. The rival team sees the word too, to keep it honest.
 * The words are a seeded shuffle of the bank walked by `wordNo`, so no word
 * repeats in a game.
 */

export const MIN_PER_TEAM = 2;
export const SECONDS_OPTIONS = [45, 60, 90] as const;
export const TURN_OPTIONS = [3, 4, 6] as const;

export interface MimicaMeta {
  game: "mimica";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  seconds: number;
  /** Turns per team. */
  turns: number;
  createdAt: number | object;
}

export type MimicaStatus = "waiting" | "ready" | "acting" | "finished";

export interface MimicaPlayer {
  name: string;
  color: string;
  /** "" until they pick a team. */
  team: TeamId | "";
}

export interface MimicaState {
  status: MimicaStatus;
  seed: number;
  gameNo: number;
  players: Record<string, MimicaPlayer>;
  team: TeamId;
  /** Turns played so far (both teams). */
  turnNo: number;
  actor: string;
  /** How many turns each team has acted, to rotate its actors. */
  acted: Record<TeamId, number>;
  wordNo: number;
  startedAt: number;
  /** This turn's guessed and passed words. */
  hits: number;
  passes: number;
  scores: Record<TeamId, number>;
}

function normalizeState(raw: Partial<MimicaState> | null): MimicaState | null {
  if (!raw || !raw.status) return null;
  const players: Record<string, MimicaPlayer> = {};
  for (const [id, p] of Object.entries(raw.players ?? {})) {
    players[id] = { name: p?.name ?? "?", color: p?.color ?? "#64748b", team: p?.team ?? "" };
  }
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    players,
    team: raw.team ?? "red",
    turnNo: raw.turnNo ?? 0,
    actor: raw.actor ?? "",
    acted: { red: raw.acted?.red ?? 0, blue: raw.acted?.blue ?? 0 },
    wordNo: raw.wordNo ?? 0,
    startedAt: raw.startedAt ?? 0,
    hits: raw.hits ?? 0,
    passes: raw.passes ?? 0,
    scores: { red: raw.scores?.red ?? 0, blue: raw.scores?.blue ?? 0 },
  };
}

export function normalizeMeta(raw: Partial<MimicaMeta>): Pick<MimicaMeta, "seconds" | "turns"> {
  return { seconds: raw.seconds ?? 60, turns: raw.turns ?? 4 };
}

export function otherTeam(team: TeamId): TeamId {
  return team === "red" ? "blue" : "red";
}

/** Team members among `connected`, in a stable order. */
export function membersOf(state: Pick<MimicaState, "players">, team: TeamId, connected: string[]): string[] {
  return Object.keys(state.players)
    .filter((id) => state.players[id].team === team && connected.includes(id))
    .sort();
}

/** The word `wordNo` of this game's shuffled bank. */
export function wordFor(seed: number, wordNo: number): MimicaWord {
  const order = seededShuffle(
    MIMICA_WORDS.map((_, i) => i),
    seed
  );
  return MIMICA_WORDS[order[wordNo % order.length]];
}

function pickActor(s: MimicaState, team: TeamId, connected: string[], skip = 0): string {
  const members = membersOf(s, team, connected);
  return members.length ? members[(s.acted[team] + skip) % members.length] : "";
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/mimica/state`;

function mutate(roomId: string, fn: (state: MimicaState) => MimicaState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createMimicaRoom(params: { seconds: number; turns: number }, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: MimicaMeta = { game: "mimica", hostId, ...params, createdAt: serverTimestamp() };
  const state: Partial<MimicaState> = { status: "waiting", seed: makeSeed(), gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getMimicaMeta(roomId: string): Promise<Partial<MimicaMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeMimica(roomId: string, cb: (state: MimicaState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinMimica(roomId: string, clientId: string, player: { name: string; color: string }) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: { ...player, team: known?.team ?? "" } } };
  });
}

/** Joins a team (any time; mid-game too, to act in later turns). */
export function chooseTeam(roomId: string, clientId: string, team: TeamId) {
  return mutate(roomId, (s) => {
    const p = s.players[clientId];
    if (!p || p.team === team || clientId === s.actor) return null;
    return { ...s, players: { ...s.players, [clientId]: { ...p, team } } };
  });
}

/** Splits the connected players into two random teams. */
export function shuffleTeams(roomId: string, connected: string[]) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting") return null;
    const ids = seededShuffle(
      connected.filter((id) => s.players[id]),
      makeSeed()
    );
    const players = { ...s.players };
    ids.forEach((id, i) => (players[id] = { ...players[id], team: i % 2 === 0 ? "red" : "blue" }));
    return { ...s, players };
  });
}

export function canStart(state: Pick<MimicaState, "players">, connected: string[]): boolean {
  return membersOf(state, "red", connected).length >= MIN_PER_TEAM && membersOf(state, "blue", connected).length >= MIN_PER_TEAM;
}

function firstTurn(s: MimicaState, connected: string[], seed: number): MimicaState {
  const base: MimicaState = {
    ...s,
    status: "ready",
    seed,
    team: "red",
    turnNo: 0,
    acted: { red: 0, blue: 0 },
    wordNo: 0,
    hits: 0,
    passes: 0,
    scores: { red: 0, blue: 0 },
  };
  return { ...base, actor: pickActor(base, "red", connected) };
}

export function startMimica(roomId: string, connected: string[]) {
  return mutate(roomId, (s) => (s.status === "waiting" && canStart(s, connected) ? firstTurn(s, connected, s.seed) : null));
}

/** The actor starts the clock. */
export function startActing(roomId: string, clientId: string, expectedTurn: number) {
  return mutate(roomId, (s) =>
    s.status === "ready" && s.turnNo === expectedTurn && s.actor === clientId
      ? { ...s, status: "acting", startedAt: serverNow(), hits: 0, passes: 0 }
      : null
  );
}

/** The actor's team guessed the word (`hit`) or the actor passes it. */
export function nextWord(roomId: string, clientId: string, expectedWord: number, hit: boolean) {
  return mutate(roomId, (s) => {
    if (s.status !== "acting" || s.actor !== clientId || s.wordNo !== expectedWord) return null;
    return {
      ...s,
      wordNo: s.wordNo + 1,
      hits: s.hits + (hit ? 1 : 0),
      passes: s.passes + (hit ? 0 : 1),
      scores: hit ? { ...s.scores, [s.team]: s.scores[s.team] + 1 } : s.scores,
    };
  });
}

/** Time's up: the other team's turn, or the end. Guarded by the turn number. */
export function endTurn(roomId: string, expectedTurn: number, totalTurns: number, connected: string[]) {
  return mutate(roomId, (s) => {
    if (s.status !== "acting" || s.turnNo !== expectedTurn) return null;
    const acted = { ...s.acted, [s.team]: s.acted[s.team] + 1 };
    // The word on screen when time ran out isn't spent: the next actor gets it.
    const next = { ...s, acted, turnNo: s.turnNo + 1 };
    if (next.turnNo >= totalTurns) return { ...next, status: "finished" };
    const team = otherTeam(s.team);
    return { ...next, status: "ready", team, actor: pickActor(next, team, connected) };
  });
}

/** The actor isn't here (or doesn't want to): the next member of the team acts. */
export function changeActor(roomId: string, expectedTurn: number, connected: string[]) {
  return mutate(roomId, (s) => {
    if (s.status !== "ready" || s.turnNo !== expectedTurn) return null;
    const members = membersOf(s, s.team, connected);
    if (members.length === 0) return null;
    const i = members.indexOf(s.actor);
    return { ...s, actor: members[(i + 1) % members.length] };
  });
}

export function playAgain(roomId: string, expectedGame: number, connected: string[]) {
  return mutate(roomId, (s) =>
    s.status === "finished" && s.gameNo === expectedGame && canStart(s, connected)
      ? { ...firstTurn(s, connected, makeSeed()), gameNo: s.gameNo + 1 }
      : null
  );
}
