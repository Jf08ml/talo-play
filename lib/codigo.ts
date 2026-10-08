import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { transactState } from "./transact";
import { normalizeText } from "./text";
import { CODIGO_WORDS } from "./codigoWords";
import type { TeamId } from "./teams";

/**
 * Código secreto (Codenames-style). The board words and the key (which word
 * is red / blue / neutral / bomb) both derive from `state.seed`, so only
 * reveals, clues and roles travel over the network. Anyone who reads the code
 * could compute the key — accepted, as there is no backend to hide it.
 */

export const BOARD_SIZE = 25;
export const MAX_CLUE_LENGTH = 30;
export const MAX_CLUE_COUNT = 9;

export type CardRole = TeamId | "neutral" | "bomb";
export type CodigoStatus = "waiting" | "playing" | "finished";
export type CodigoPhase = "clue" | "guess";

export interface CodigoMeta {
  game: "codigo";
  /** Who created the room: starts the game (anyone can if they're away). Absent on older rooms. */
  hostId?: string;
  createdAt: number | object;
}

export interface CodigoPlayer {
  name: string;
  color: string;
  /** "" until they pick a team. */
  team: TeamId | "";
  spymaster: boolean;
}

export interface Clue {
  team: TeamId;
  word: string;
  count: number;
}

export interface CodigoState {
  status: CodigoStatus;
  seed: number;
  gameNo: number;
  players: Record<string, CodigoPlayer>;
  turn: TeamId;
  phase: CodigoPhase;
  /** Guesses left this turn (clue count + 1). */
  guessesLeft: number;
  /** `c{cardIndex}` → true once revealed (string keys: RTDB turns numeric-keyed objects into arrays). */
  revealed: Record<string, boolean>;
  /** Clues given this game, oldest first; the last one is the current clue while guessing. */
  clues: Clue[];
  winner: TeamId | "";
  /** Why the game ended: "cards" (found all) or "bomb". */
  endReason: "" | "cards" | "bomb";
}

function normalizeState(raw: Partial<CodigoState> | null): CodigoState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    turn: raw.turn ?? "red",
    phase: raw.phase ?? "clue",
    guessesLeft: raw.guessesLeft ?? 0,
    revealed: raw.revealed ?? {},
    clues: raw.clues ?? [],
    winner: raw.winner ?? "",
    endReason: raw.endReason ?? "",
  };
}

export function cardKey(i: number): string {
  return `c${i}`;
}

export function otherTeam(team: TeamId): TeamId {
  return team === "red" ? "blue" : "red";
}

/** The team that starts (and gets 9 cards instead of 8). */
export function startingTeam(seed: number): TeamId {
  return seed % 2 === 0 ? "red" : "blue";
}

export interface Board {
  words: string[];
  roles: CardRole[];
}

/** 25 words and their secret roles: 9 for the starting team, 8 for the other, 7 neutral, 1 bomb. */
export function buildBoard(seed: number): Board {
  const first = startingTeam(seed);
  const words = seededShuffle(CODIGO_WORDS, seed).slice(0, BOARD_SIZE);
  const roles = seededShuffle<CardRole>(
    [
      ...Array<CardRole>(9).fill(first),
      ...Array<CardRole>(8).fill(otherTeam(first)),
      ...Array<CardRole>(7).fill("neutral"),
      "bomb",
    ],
    seed + 1
  );
  return { words, roles };
}

export function cardsLeft(board: Board, revealed: Record<string, boolean>, team: TeamId): number {
  return board.roles.filter((r, i) => r === team && !revealed[cardKey(i)]).length;
}

/** What's missing before the game can start, or null if it's ready. */
export function setupProblem(players: Record<string, CodigoPlayer>): string | null {
  for (const team of ["red", "blue"] as TeamId[]) {
    const members = Object.values(players).filter((p) => p.team === team);
    const label = team === "red" ? "Rojo" : "Azul";
    if (!members.some((p) => p.spymaster)) return `Falta el jefe de espías del equipo ${label}.`;
    if (!members.some((p) => !p.spymaster)) return `El equipo ${label} necesita al menos un agente.`;
  }
  return null;
}

/** A clue can't be one of the visible board words. */
export function clueProblem(clue: string, board: Board, revealed: Record<string, boolean>): string | null {
  const c = normalizeText(clue);
  if (!c) return "Escribí una pista.";
  if (c.includes(" ")) return "La pista tiene que ser una sola palabra.";
  const clash = board.words.some((w, i) => !revealed[cardKey(i)] && normalizeText(w) === c);
  return clash ? "No vale usar una palabra del tablero." : null;
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/codigo/state`;

function mutate(roomId: string, fn: (state: CodigoState) => CodigoState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createCodigoRoom(hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: CodigoMeta = { game: "codigo", hostId, createdAt: serverTimestamp() };
  const seed = makeSeed();
  const state: Partial<CodigoState> = { status: "waiting", seed, gameNo: 0, turn: startingTeam(seed), phase: "clue" };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getCodigoMeta(roomId: string): Promise<Partial<CodigoMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeCodigo(roomId: string, cb: (state: CodigoState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

/** Registers the player (no team yet) and keeps their name/color fresh. */
export function joinCodigo(roomId: string, clientId: string, info: { name: string; color: string }) {
  return mutate(roomId, (s) => {
    const p = s.players[clientId];
    if (p && p.name === info.name && p.color === info.color) return null;
    return {
      ...s,
      players: {
        ...s.players,
        [clientId]: { team: p?.team ?? "", spymaster: p?.spymaster ?? false, ...info },
      },
    };
  });
}

/**
 * Picks a team (and role). Each team has at most one spymaster; during a game
 * only new players (no team yet) can pick, and only as agents.
 */
export function chooseRole(roomId: string, clientId: string, team: TeamId, spymaster: boolean) {
  return mutate(roomId, (s) => {
    const p = s.players[clientId];
    if (!p) return null;
    if (s.status === "playing" && (p.team || spymaster)) return null;
    if (s.status === "finished") return null;
    if (spymaster && Object.entries(s.players).some(([id, o]) => id !== clientId && o.team === team && o.spymaster)) {
      return null;
    }
    if (p.team === team && p.spymaster === spymaster) return null;
    return { ...s, players: { ...s.players, [clientId]: { ...p, team, spymaster } } };
  });
}

export function startCodigo(roomId: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting" || setupProblem(s.players)) return null;
    return {
      ...s,
      status: "playing",
      turn: startingTeam(s.seed),
      phase: "clue",
      guessesLeft: 0,
      revealed: {},
      clues: [],
      winner: "",
      endReason: "",
    };
  });
}

export function giveClue(roomId: string, clientId: string, word: string, count: number) {
  return mutate(roomId, (s) => {
    const p = s.players[clientId];
    if (s.status !== "playing" || s.phase !== "clue" || !p?.spymaster || p.team !== s.turn) return null;
    const n = Math.max(1, Math.min(MAX_CLUE_COUNT, Math.round(count)));
    return {
      ...s,
      phase: "guess",
      guessesLeft: n + 1,
      clues: [...s.clues, { team: s.turn, word: word.trim().slice(0, MAX_CLUE_LENGTH), count: n }],
    };
  });
}

function passTurn(s: CodigoState): CodigoState {
  return { ...s, turn: otherTeam(s.turn), phase: "clue", guessesLeft: 0 };
}

/**
 * An agent of the team in turn reveals a card. Own color: keep guessing
 * (while guesses last). Neutral or rival: the turn passes. Bomb: you lose.
 * Revealing a team's last card wins it the game — even if it was the rival's.
 */
export function revealCard(roomId: string, clientId: string, card: number, board: Board) {
  return mutate(roomId, (s) => {
    const p = s.players[clientId];
    if (s.status !== "playing" || s.phase !== "guess") return null;
    if (!p || p.spymaster || p.team !== s.turn || s.revealed[cardKey(card)]) return null;

    const revealed = { ...s.revealed, [cardKey(card)]: true };
    const role = board.roles[card];
    const next = { ...s, revealed };

    if (role === "bomb") return { ...next, status: "finished", winner: otherTeam(s.turn), endReason: "bomb" };
    if (role === "red" || role === "blue") {
      if (cardsLeft(board, revealed, role) === 0) return { ...next, status: "finished", winner: role, endReason: "cards" };
    }
    if (role === s.turn) {
      const guessesLeft = s.guessesLeft - 1;
      return guessesLeft > 0 ? { ...next, guessesLeft } : passTurn(next);
    }
    return passTurn(next);
  });
}

/** An agent of the team in turn stops guessing; `expectedClues` keeps a late click from ending the next turn. */
export function endGuessing(roomId: string, clientId: string, expectedClues: number) {
  return mutate(roomId, (s) => {
    const p = s.players[clientId];
    if (s.status !== "playing" || s.phase !== "guess" || s.clues.length !== expectedClues) return null;
    if (!p || p.spymaster || p.team !== s.turn) return null;
    return passTurn(s);
  });
}

/** Back to team setup with a new board; teams and roles are kept. */
export function newCodigoGame(roomId: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished") return null;
    const seed = makeSeed();
    return {
      ...s,
      status: "waiting",
      seed,
      gameNo: s.gameNo + 1,
      turn: startingTeam(seed),
      phase: "clue",
      guessesLeft: 0,
      revealed: {},
      clues: [],
      winner: "",
      endReason: "",
    };
  });
}
