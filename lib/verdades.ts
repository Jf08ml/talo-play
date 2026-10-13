import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";

/**
 * Dos verdades y una mentira. Everyone writes three statements about
 * themselves and marks the lie; then, one player at a time, the rest vote
 * which one is the lie. A right vote is a point for the voter; each voter
 * fooled is a point for the author.
 *
 * Statements (lie included) live in the shared state, readable with DevTools
 * — accepted, there is no backend.
 */

export const MIN_PLAYERS = 3;
/** Players with statements needed to start voting. */
export const MIN_AUTHORS = 2;
export const VOTE_SECONDS = 45;
export const MAX_STATEMENT_LENGTH = 120;

export interface VerdadesMeta {
  game: "verdades";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  createdAt: number | object;
}

export type VerdadesStatus = "waiting" | "writing" | "voting" | "reveal" | "finished";

export interface VerdadesPlayer {
  name: string;
  color: string;
}

export interface Statements {
  s: string[];
  /** Which of the three is the lie (0–2). */
  lie: number;
}

export interface VerdadesState {
  status: VerdadesStatus;
  gameNo: number;
  players: Record<string, VerdadesPlayer>;
  statements: Record<string, Statements>;
  /** Whose statements are voted, in order; fixed when voting starts. */
  order: string[];
  turnNo: number;
  phaseStartedAt: number;
  /** voter → statement index they think is the lie, for the current author. */
  votes: Record<string, number>;
  scores: Record<string, number>;
}

function normalizeState(raw: Partial<VerdadesState> | null): VerdadesState | null {
  if (!raw || !raw.status) return null;
  const statements: Record<string, Statements> = {};
  for (const [id, st] of Object.entries(raw.statements ?? {})) {
    statements[id] = { s: [0, 1, 2].map((i) => st?.s?.[i] ?? ""), lie: st?.lie ?? 0 };
  }
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    statements,
    order: raw.order ?? [],
    turnNo: raw.turnNo ?? 0,
    phaseStartedAt: raw.phaseStartedAt ?? 0,
    votes: raw.votes ?? {},
    scores: raw.scores ?? {},
  };
}

export function authorOf(state: Pick<VerdadesState, "order" | "turnNo">): string {
  return state.order[state.turnNo] ?? "";
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/verdades/state`;

function mutate(roomId: string, fn: (state: VerdadesState) => VerdadesState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createVerdadesRoom(hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: VerdadesMeta = { game: "verdades", hostId, createdAt: serverTimestamp() };
  const state: Partial<VerdadesState> = { status: "waiting", gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getVerdadesMeta(roomId: string): Promise<Partial<VerdadesMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeVerdades(roomId: string, cb: (state: VerdadesState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinVerdades(roomId: string, clientId: string, player: VerdadesPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

const toWriting = (s: VerdadesState): VerdadesState => ({
  ...s,
  status: "writing",
  statements: {},
  order: [],
  turnNo: 0,
  votes: {},
  scores: {},
  phaseStartedAt: serverNow(),
});

/** Everyone goes to write their statements. */
export function startVerdades(roomId: string, connected: number) {
  return mutate(roomId, (s) => (s.status === "waiting" && connected >= MIN_PLAYERS ? toWriting(s) : null));
}

/** Saves (or rewrites) my three statements, while writing. */
export function submitStatements(roomId: string, clientId: string, statements: string[], lie: number) {
  const s3 = statements.map((x) => x.trim().slice(0, MAX_STATEMENT_LENGTH));
  return mutate(roomId, (s) => {
    if (s.status !== "writing" || !s.players[clientId]) return null;
    if (s3.length !== 3 || s3.some((x) => !x) || lie < 0 || lie > 2) return null;
    return { ...s, statements: { ...s.statements, [clientId]: { s: s3, lie } } };
  });
}

/** Back to editing my statements before voting starts. */
export function withdrawStatements(roomId: string, clientId: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "writing" || !s.statements[clientId]) return null;
    const statements = { ...s.statements };
    delete statements[clientId];
    return { ...s, statements };
  });
}

/** Voting starts with whoever wrote, in a random order. */
export function startVoting(roomId: string) {
  return mutate(roomId, (s) => {
    const authors = Object.keys(s.statements);
    if (s.status !== "writing" || authors.length < MIN_AUTHORS) return null;
    return {
      ...s,
      status: "voting",
      order: seededShuffle(authors.sort(), makeSeed()),
      turnNo: 0,
      votes: {},
      phaseStartedAt: serverNow(),
    };
  });
}

function reveal(s: VerdadesState): VerdadesState {
  const author = authorOf(s);
  const lie = s.statements[author]?.lie ?? 0;
  const scores = { ...s.scores };
  for (const [voter, choice] of Object.entries(s.votes)) {
    if (voter === author) continue;
    if (choice === lie) scores[voter] = (scores[voter] ?? 0) + 1;
    else scores[author] = (scores[author] ?? 0) + 1;
  }
  return { ...s, status: "reveal", scores, phaseStartedAt: serverNow() };
}

/**
 * My vote on the current author's lie (it can change until everyone voted).
 * When `votersNeeded` players (the connected ones but the author) voted, it's revealed.
 */
export function castVote(roomId: string, expectedTurn: number, voter: string, choice: number, votersNeeded: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "voting" || s.turnNo !== expectedTurn || authorOf(s) === voter || !s.players[voter]) return null;
    if (choice < 0 || choice > 2 || s.votes[voter] === choice) return null;
    const next = { ...s, votes: { ...s.votes, [voter]: choice } };
    return Object.keys(next.votes).length >= votersNeeded ? reveal(next) : next;
  });
}

export function closeVote(roomId: string, expectedTurn: number) {
  return mutate(roomId, (s) => (s.status === "voting" && s.turnNo === expectedTurn ? reveal(s) : null));
}

export function nextAuthor(roomId: string, expectedTurn: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "reveal" || s.turnNo !== expectedTurn) return null;
    if (s.turnNo + 1 >= s.order.length) return { ...s, status: "finished", phaseStartedAt: serverNow() };
    return { ...s, status: "voting", turnNo: s.turnNo + 1, votes: {}, phaseStartedAt: serverNow() };
  });
}

/** New statements from everyone; points back to zero. */
export function playAgain(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) =>
    s.status === "finished" && s.gameNo === expectedGame ? { ...toWriting(s), gameNo: s.gameNo + 1 } : null
  );
}
