import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { transactState } from "./transact";

/**
 * Generala, the dice classic. By turns, each player rolls five dice up to
 * three times (keeping the ones they like between rolls) and then writes a
 * score in one empty box of their sheet, or crosses one out with 0. After
 * every box is filled, the highest total wins; a generala on the first roll
 * ("servida") wins the game on the spot.
 *
 * Dice are rolled inside the transaction with Math.random by whoever is in
 * turn — as trusted as everything else without a backend.
 */

export const MIN_PLAYERS = 2;
export const MAX_ROLLS = 3;
export const DICE = 5;

export type Category = "c1" | "c2" | "c3" | "c4" | "c5" | "c6" | "esc" | "full" | "poker" | "gen" | "dgen";

export const CATEGORIES: { id: Category; label: string; hint: string }[] = [
  { id: "c1", label: "1", hint: "Suma de los unos" },
  { id: "c2", label: "2", hint: "Suma de los dos" },
  { id: "c3", label: "3", hint: "Suma de los tres" },
  { id: "c4", label: "4", hint: "Suma de los cuatro" },
  { id: "c5", label: "5", hint: "Suma de los cincos" },
  { id: "c6", label: "6", hint: "Suma de los seis" },
  { id: "esc", label: "Escalera", hint: "1-2-3-4-5, 2-3-4-5-6 o 3-4-5-6-1 · 20 (servida 25)" },
  { id: "full", label: "Full", hint: "Tres iguales y dos iguales · 30 (servido 35)" },
  { id: "poker", label: "Póker", hint: "Cuatro iguales · 40 (servido 45)" },
  { id: "gen", label: "Generala", hint: "Cinco iguales · 50 (servida gana la partida)" },
  { id: "dgen", label: "Doble generala", hint: "Otra generala, con la primera ya anotada · 100" },
];

export interface GeneralaMeta {
  game: "generala";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  createdAt: number | object;
}

export type GeneralaStatus = "waiting" | "playing" | "finished";

export interface GeneralaPlayer {
  name: string;
  color: string;
}

export interface GeneralaState {
  status: GeneralaStatus;
  gameNo: number;
  players: Record<string, GeneralaPlayer>;
  /** This game's players in turn order; later joiners watch until the next game. */
  order: string[];
  /** Turns played so far; whose turn it is is `order[turnNo % order.length]`. */
  turnNo: number;
  /** Five digits 1–6, or "" before the first roll of the turn. */
  dice: string;
  /** Five "0"/"1": which dice are kept for the next roll. */
  held: string;
  rolls: number;
  /** Each player's sheet: category → points (0 = crossed out). Missing = still empty. */
  sheets: Record<string, Partial<Record<Category, number>>>;
  /** The last box written, so others see what just happened. */
  lastScore: { by: string; cat: Category | ""; points: number };
  winner: string;
  /** "servida" when someone won with a generala servida. */
  endReason: "" | "total" | "servida";
  wins: Record<string, number>;
}

const NO_HOLD = "0".repeat(DICE);

function normalizeState(raw: Partial<GeneralaState> | null): GeneralaState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    order: raw.order ?? [],
    turnNo: raw.turnNo ?? 0,
    dice: raw.dice ?? "",
    held: raw.held && raw.held.length === DICE ? raw.held : NO_HOLD,
    rolls: raw.rolls ?? 0,
    sheets: raw.sheets ?? {},
    lastScore: {
      by: raw.lastScore?.by ?? "",
      cat: raw.lastScore?.cat ?? "",
      points: raw.lastScore?.points ?? 0,
    },
    winner: raw.winner ?? "",
    endReason: raw.endReason ?? "",
    wins: raw.wins ?? {},
  };
}

export function currentPlayer(state: Pick<GeneralaState, "order" | "turnNo">): string {
  return state.order.length ? state.order[state.turnNo % state.order.length] : "";
}

export function diceValues(dice: string): number[] {
  return [...dice].map(Number);
}

function counts(values: number[]): number[] {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const v of values) c[v]++;
  return c;
}

function isStraight(values: number[]): boolean {
  const key = [...values].sort().join("");
  // 3-4-5-6-1: the 1 counts as the top of the run.
  return key === "12345" || key === "23456" || key === "13456";
}

/**
 * Points `dice` would score in `cat`. `servida` = on the first roll of the
 * turn; `sheet` matters for the doble generala (needs the generala with 50).
 */
export function scoreFor(cat: Category, dice: string, servida: boolean, sheet: Partial<Record<Category, number>>): number {
  if (dice.length !== DICE) return 0;
  const values = diceValues(dice);
  const c = counts(values);
  const max = Math.max(...c);
  switch (cat) {
    case "c1":
    case "c2":
    case "c3":
    case "c4":
    case "c5":
    case "c6": {
      const n = Number(cat.slice(1));
      return c[n] * n;
    }
    case "esc":
      return isStraight(values) ? (servida ? 25 : 20) : 0;
    case "full":
      return c.includes(3) && c.includes(2) ? (servida ? 35 : 30) : 0;
    case "poker":
      return max >= 4 ? (servida ? 45 : 40) : 0;
    case "gen":
      return max === 5 ? 50 : 0;
    case "dgen":
      return max === 5 && sheet.gen === 50 ? 100 : 0;
  }
}

export function sheetTotal(sheet: Partial<Record<Category, number>> | undefined): number {
  if (!sheet) return 0;
  return CATEGORIES.reduce((sum, c) => sum + (sheet[c.id] ?? 0), 0);
}

export function sheetFull(sheet: Partial<Record<Category, number>> | undefined): boolean {
  return !!sheet && CATEGORIES.every((c) => sheet[c.id] !== undefined);
}

function rollDie(): string {
  return String(1 + Math.floor(Math.random() * 6));
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/generala/state`;

function mutate(roomId: string, fn: (state: GeneralaState) => GeneralaState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createGeneralaRoom(hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: GeneralaMeta = { game: "generala", hostId, createdAt: serverTimestamp() };
  const state: Partial<GeneralaState> = { status: "waiting", gameNo: 0, held: NO_HOLD };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getGeneralaMeta(roomId: string): Promise<Partial<GeneralaMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeGenerala(roomId: string, cb: (state: GeneralaState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinGenerala(roomId: string, clientId: string, player: GeneralaPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

function newGame(s: GeneralaState, participants: string[]): GeneralaState {
  return {
    ...s,
    status: "playing",
    order: seededShuffle(participants, makeSeed()),
    turnNo: 0,
    dice: "",
    held: NO_HOLD,
    rolls: 0,
    sheets: {},
    lastScore: { by: "", cat: "", points: 0 },
    winner: "",
    endReason: "",
  };
}

/** Starts with `participants` (the connected players) in a random order. */
export function startGenerala(roomId: string, participants: string[]) {
  return mutate(roomId, (s) => {
    const ids = participants.filter((id) => s.players[id]);
    if (s.status !== "waiting" || ids.length < 1) return null;
    return newGame(s, ids);
  });
}

/** Another game with whoever is connected now; wins are kept. */
export function playAgain(roomId: string, expectedGame: number, participants: string[]) {
  return mutate(roomId, (s) => {
    const ids = participants.filter((id) => s.players[id]);
    if (s.status !== "finished" || s.gameNo !== expectedGame || ids.length < 1) return null;
    return { ...newGame(s, ids), gameNo: s.gameNo + 1 };
  });
}

/** Rolls the dice that aren't held; `expectedRolls` keeps a double tap from rolling twice. */
export function rollDice(roomId: string, clientId: string, expectedTurn: number, expectedRolls: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || currentPlayer(s) !== clientId) return null;
    if (s.turnNo !== expectedTurn || s.rolls !== expectedRolls || s.rolls >= MAX_ROLLS) return null;
    let dice = "";
    for (let i = 0; i < DICE; i++) dice += s.rolls > 0 && s.held[i] === "1" ? s.dice[i] : rollDie();
    return { ...s, dice, rolls: s.rolls + 1 };
  });
}

export function toggleHold(roomId: string, clientId: string, expectedTurn: number, index: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || currentPlayer(s) !== clientId || s.turnNo !== expectedTurn) return null;
    if (s.rolls === 0 || s.rolls >= MAX_ROLLS || index < 0 || index >= DICE) return null;
    const held = s.held.slice(0, index) + (s.held[index] === "1" ? "0" : "1") + s.held.slice(index + 1);
    return { ...s, held };
  });
}

function nextTurn(s: GeneralaState, sheets: GeneralaState["sheets"], lastScore: GeneralaState["lastScore"]): GeneralaState {
  const next = { ...s, sheets, lastScore, turnNo: s.turnNo + 1, dice: "", held: NO_HOLD, rolls: 0 };
  if (!s.order.every((id) => sheetFull(sheets[id]))) return next;
  const best = [...s.order].sort((a, b) => sheetTotal(sheets[b]) - sheetTotal(sheets[a]))[0];
  const tie = s.order.filter((id) => sheetTotal(sheets[id]) === sheetTotal(sheets[best])).length > 1;
  return {
    ...next,
    status: "finished",
    endReason: "total",
    // A tie at the top is recorded with no winner.
    winner: tie ? "" : best,
    wins: tie ? s.wins : { ...s.wins, [best]: (s.wins[best] ?? 0) + 1 },
  };
}

/** Writes this turn's dice in an empty box (0 if they don't fit it = crossed out) and passes the turn. */
export function scoreCategory(roomId: string, clientId: string, expectedTurn: number, cat: Category) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || currentPlayer(s) !== clientId || s.turnNo !== expectedTurn) return null;
    if (s.rolls === 0 || !CATEGORIES.some((c) => c.id === cat)) return null;
    const sheet = s.sheets[clientId] ?? {};
    if (sheet[cat] !== undefined) return null;
    const servida = s.rolls === 1;
    const points = scoreFor(cat, s.dice, servida, sheet);
    const sheets = { ...s.sheets, [clientId]: { ...sheet, [cat]: points } };
    const lastScore = { by: clientId, cat, points };
    if (cat === "gen" && points > 0 && servida) {
      return {
        ...s,
        sheets,
        lastScore,
        status: "finished",
        endReason: "servida",
        winner: clientId,
        wins: { ...s.wins, [clientId]: (s.wins[clientId] ?? 0) + 1 },
      };
    }
    return nextTurn(s, sheets, lastScore);
  });
}

/**
 * The player in turn left: anyone crosses out their first empty box so the
 * game goes on. Guarded by the turn number.
 */
export function skipTurn(roomId: string, expectedTurn: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.turnNo !== expectedTurn) return null;
    const id = currentPlayer(s);
    const sheet = s.sheets[id] ?? {};
    const empty = CATEGORIES.find((c) => sheet[c.id] === undefined);
    if (!empty) return nextTurn(s, s.sheets, s.lastScore);
    return nextTurn(s, { ...s.sheets, [id]: { ...sheet, [empty.id]: 0 } }, { by: id, cat: empty.id, points: 0 });
  });
}
