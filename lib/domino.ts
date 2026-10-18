import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { transactState } from "./transact";

/**
 * Dominó (double six) for 2–4, as played in Latin America. Seats `a`–`d` go
 * around the table; with four, `a`+`c` play against `b`+`d`. Everyone gets 7
 * tiles; with 2–3 players the rest is the boneyard (`stock`): without a tile
 * that fits you draw until one does, and pass only when it's empty. With four
 * there is no boneyard.
 *
 * The first hand opens whoever has the double six (or the highest double, or
 * the highest tile), and must play it; later hands open the last winner, with
 * any tile. Going out ("dominar") wins the hand; when nobody can play
 * ("tranque") the side with the fewest pips in a hand wins it (a tie scores
 * nothing). The winning side adds the rivals' pips, up to `target`.
 *
 * Tiles are two digits ("36"); hands and the boneyard concatenate them. The
 * line is stored oriented, left to right, so its ends are its first and last
 * digit. Shuffled with Math.random inside the dealing transaction; hands are in
 * the state (readable with DevTools — accepted).
 */

export type Seat = "a" | "b" | "c" | "d";
export const SEATS: Seat[] = ["a", "b", "c", "d"];
/** Who sits first: opposite seats for two players. */
const JOIN_ORDER: Seat[] = ["a", "c", "b", "d"];
export const HAND_SIZE = 7;
export const TARGET_OPTIONS = [50, 100, 150] as const;

export const SEAT_COLOR: Record<Seat, string> = { a: "#f43f5e", b: "#38bdf8", c: "#fb923c", d: "#a78bfa" };

export type DominoStatus = "waiting" | "playing" | "finished";
export type DominoPhase = "play" | "handover";
export type Side = "l" | "r";

export interface DominoMeta {
  game: "domino";
  target: number;
  hostId?: string;
  createdAt: number | object;
}

export interface DominoPlayer {
  name: string;
  color: string;
}

export interface DominoState {
  status: DominoStatus;
  target: number;
  gameNo: number;
  players: Record<string, DominoPlayer>;
  seats: Record<Seat, string>;
  /** Seats playing this match, in turn order. */
  active: string;
  phase: DominoPhase;
  handNo: number;
  hands: Record<Seat, string>;
  stock: string;
  line: string;
  turn: Seat;
  /** Who opened this hand; the tile they must open with ("" = any). */
  opener: Seat;
  mustOpen: string;
  /** Passes in a row (everyone passing = tranque). */
  passes: number;
  /** Points per seat (partners share them). */
  score: Record<Seat, number>;
  moveNo: number;
  last: { seat: Seat | ""; action: "" | "play" | "draw" | "pass"; tile: string; side: Side | "" };
  /** How the last hand ended. */
  result: { winner: Seat | ""; points: number; blocked: boolean };
  /** Match winner (one seat of the winning side). */
  winner: Seat | "";
  wins: Record<string, number>;
}

const NO_LAST: DominoState["last"] = { seat: "", action: "", tile: "", side: "" };
const NO_RESULT: DominoState["result"] = { winner: "", points: 0, blocked: false };

function normalizeState(raw: Partial<DominoState> | null): DominoState | null {
  if (!raw || !raw.status) return null;
  const hands = raw.hands ?? ({} as Partial<Record<Seat, string>>);
  return {
    status: raw.status,
    target: raw.target ?? 100,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    seats: { a: raw.seats?.a ?? "", b: raw.seats?.b ?? "", c: raw.seats?.c ?? "", d: raw.seats?.d ?? "" },
    active: raw.active ?? "",
    phase: raw.phase ?? "play",
    handNo: raw.handNo ?? 0,
    hands: { a: hands.a ?? "", b: hands.b ?? "", c: hands.c ?? "", d: hands.d ?? "" },
    stock: raw.stock ?? "",
    line: raw.line ?? "",
    turn: raw.turn ?? "a",
    opener: raw.opener ?? "a",
    mustOpen: raw.mustOpen ?? "",
    passes: raw.passes ?? 0,
    score: { a: raw.score?.a ?? 0, b: raw.score?.b ?? 0, c: raw.score?.c ?? 0, d: raw.score?.d ?? 0 },
    moveNo: raw.moveNo ?? 0,
    last: { ...NO_LAST, ...raw.last },
    result: { ...NO_RESULT, ...raw.result },
    winner: raw.winner ?? "",
    wins: raw.wins ?? {},
  };
}

// ---- Tiles -----------------------------------------------------------------

export const splitTiles = (s: string): string[] => s.match(/../g) ?? [];
export const pips = (tile: string) => Number(tile[0]) + Number(tile[1]);
export const isDouble = (tile: string) => tile[0] === tile[1];
const handPips = (hand: string) => splitTiles(hand).reduce((n, t) => n + pips(t), 0);

export function fullSet(): string[] {
  const out: string[] = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) out.push(`${a}${b}`);
  return out;
}

export function ends(line: string): [number, number] | null {
  return line ? [Number(line[0]), Number(line[line.length - 1])] : null;
}

/** The sides `tile` fits on (both when the line is empty). */
export function fits(line: string, tile: string): Side[] {
  const e = ends(line);
  if (!e) return ["l", "r"];
  const [x, y] = [Number(tile[0]), Number(tile[1])];
  const out: Side[] = [];
  if (x === e[0] || y === e[0]) out.push("l");
  if (x === e[1] || y === e[1]) out.push("r");
  return out;
}

function place(line: string, tile: string, side: Side): string {
  if (!line) return tile;
  const [x, y] = tile;
  if (side === "l") return (y === line[0] ? `${x}${y}` : `${y}${x}`) + line;
  return line + (x === line[line.length - 1] ? `${x}${y}` : `${y}${x}`);
}

export function activeSeats(s: Pick<DominoState, "active">): Seat[] {
  return s.active.split("").filter((x): x is Seat => SEATS.includes(x as Seat));
}

/** In pairs, a seat's partner; otherwise itself. */
export function partnerOf(s: Pick<DominoState, "active">, seat: Seat): Seat {
  if (s.active.length !== 4) return seat;
  return ({ a: "c", b: "d", c: "a", d: "b" } as const)[seat];
}

export const sameSide = (s: Pick<DominoState, "active">, x: Seat, y: Seat) => x === y || partnerOf(s, x) === y;

/** Tiles of `seat` that can be played now (with the opening rule). */
export function playable(s: DominoState, seat: Seat): string[] {
  const hand = splitTiles(s.hands[seat]);
  if (!s.line) return s.mustOpen ? hand.filter((t) => t === s.mustOpen) : hand;
  return hand.filter((t) => fits(s.line, t).length > 0);
}

export function seatOf(state: Pick<DominoState, "seats">, clientId: string): Seat | null {
  if (!clientId) return null;
  return SEATS.find((s) => state.seats[s] === clientId) ?? null;
}

function nextSeat(s: DominoState, seat: Seat): Seat {
  const seats = activeSeats(s);
  return seats[(seats.indexOf(seat) + 1) % seats.length];
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/domino/state`;

function mutate(roomId: string, fn: (state: DominoState) => DominoState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createDominoRoom(target: number, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: DominoMeta = { game: "domino", target, hostId, createdAt: serverTimestamp() };
  const state: Partial<DominoState> = { status: "waiting", target, gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getDominoMeta(roomId: string): Promise<Partial<DominoMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeDomino(roomId: string, cb: (state: DominoState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

/** Registers the player and, before the game, sits them in a free seat. */
export function joinDomino(roomId: string, clientId: string, player: DominoPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    const free = JOIN_ORDER.find((seat) => !s.seats[seat]) ?? null;
    const sit = s.status === "waiting" && !seatOf(s, clientId) && free;
    if (!sit && known?.name === player.name && known?.color === player.color) return null;
    return {
      ...s,
      players: { ...s.players, [clientId]: player },
      seats: sit ? { ...s.seats, [sit]: clientId } : s.seats,
    };
  });
}

/** A free seat, or one whose player left (mid-game: only a playing seat, by a spectator). */
export function takeSeat(roomId: string, clientId: string, seat: Seat, expectedOccupant: string) {
  return mutate(roomId, (s) => {
    if (s.seats[seat] !== expectedOccupant || s.seats[seat] === clientId) return null;
    const mine = seatOf(s, clientId);
    if (s.status !== "waiting" && (mine || !expectedOccupant || !s.active.includes(seat))) return null;
    const seats = { ...s.seats, [seat]: clientId };
    if (mine) seats[mine] = "";
    return { ...s, seats };
  });
}

export function leaveSeat(roomId: string, clientId: string) {
  return mutate(roomId, (s) => {
    const mine = seatOf(s, clientId);
    if (s.status !== "waiting" || !mine) return null;
    return { ...s, seats: { ...s.seats, [mine]: "" } };
  });
}

/** Deals a new hand. `opener` "" = the first hand's rule (highest double). */
function deal(s: DominoState, opener: Seat | ""): DominoState {
  const tiles = fullSet();
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  const seats = activeSeats(s);
  const hands = { a: "", b: "", c: "", d: "" };
  seats.forEach((seat, i) => (hands[seat] = tiles.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE).join("")));
  const stock = seats.length < 4 ? tiles.slice(seats.length * HAND_SIZE).join("") : "";

  let first: Seat = opener || seats[0];
  let mustOpen = "";
  if (!opener) {
    // Highest double dealt; if none, the highest tile.
    const rank = (t: string) => (isDouble(t) ? 100 : 0) + pips(t) * 10 + Number(t[1]);
    let best = -1;
    for (const seat of seats) {
      for (const t of splitTiles(hands[seat])) {
        if (rank(t) > best) {
          best = rank(t);
          first = seat;
          mustOpen = t;
        }
      }
    }
  }
  return {
    ...s,
    status: "playing",
    phase: "play",
    hands,
    stock,
    line: "",
    turn: first,
    opener: first,
    mustOpen,
    passes: 0,
    moveNo: s.moveNo + 1,
    last: NO_LAST,
    result: NO_RESULT,
  };
}

export function startDomino(roomId: string) {
  return mutate(roomId, (s) => {
    const active = SEATS.filter((seat) => s.seats[seat]).join("");
    if (s.status !== "waiting" || active.length < 2) return null;
    return deal({ ...s, active, handNo: 0, score: { a: 0, b: 0, c: 0, d: 0 }, winner: "" }, "");
  });
}

/** Ends the hand: `winner`'s side scores `points`; the match may be over. */
function endHand(s: DominoState, winner: Seat | "", points: number, blocked: boolean): DominoState {
  const score = { ...s.score };
  if (winner) {
    for (const seat of activeSeats(s)) if (sameSide(s, seat, winner)) score[seat] += points;
  }
  const base: DominoState = { ...s, score, phase: "handover", result: { winner, points, blocked }, moveNo: s.moveNo + 1 };
  if (!winner || score[winner] < s.target) return base;
  const wins = { ...s.wins };
  for (const seat of activeSeats(s)) {
    const id = s.seats[seat];
    if (sameSide(s, seat, winner) && id) wins[id] = (wins[id] ?? 0) + 1;
  }
  return { ...base, status: "finished", winner, wins };
}

/** Pips the other side holds (in pairs, both rivals; alone, everyone else). */
function rivalPips(s: DominoState, winner: Seat): number {
  return activeSeats(s)
    .filter((seat) => !sameSide(s, seat, winner))
    .reduce((n, seat) => n + handPips(s.hands[seat]), 0);
}

/** Nobody can play: fewest pips in a hand wins (a tie between sides scores nothing). */
function tranque(s: DominoState): DominoState {
  const seats = activeSeats(s);
  const low = Math.min(...seats.map((seat) => handPips(s.hands[seat])));
  const lowest = seats.filter((seat) => handPips(s.hands[seat]) === low);
  const tied = lowest.some((x) => lowest.some((y) => !sameSide(s, x, y)));
  if (tied) return endHand(s, "", 0, true);
  return endHand(s, lowest[0], rivalPips(s, lowest[0]), true);
}

function applyPlay(s: DominoState, seat: Seat, tile: string, side: Side): DominoState {
  const hand = splitTiles(s.hands[seat]);
  hand.splice(hand.indexOf(tile), 1);
  const next: DominoState = {
    ...s,
    hands: { ...s.hands, [seat]: hand.join("") },
    line: place(s.line, tile, side),
    mustOpen: "",
    passes: 0,
    moveNo: s.moveNo + 1,
    last: { seat, action: "play", tile, side },
  };
  if (hand.length === 0) return endHand(next, seat, rivalPips(next, seat), false);
  return { ...next, turn: nextSeat(s, seat) };
}

function applyPass(s: DominoState, seat: Seat): DominoState {
  const passes = s.passes + 1;
  const next: DominoState = { ...s, passes, moveNo: s.moveNo + 1, last: { seat, action: "pass", tile: "", side: "" } };
  if (passes >= activeSeats(s).length) return tranque(next);
  return { ...next, turn: nextSeat(s, seat) };
}

function applyDraw(s: DominoState, seat: Seat): DominoState {
  const stock = splitTiles(s.stock);
  const tile = stock.pop()!;
  return {
    ...s,
    stock: stock.join(""),
    hands: { ...s.hands, [seat]: s.hands[seat] + tile },
    moveNo: s.moveNo + 1,
    last: { seat, action: "draw", tile: "", side: "" },
  };
}

function guard(s: DominoState, clientId: string, expectedMove: number) {
  return s.status === "playing" && s.phase === "play" && s.seats[s.turn] === clientId && s.moveNo === expectedMove;
}

export function playTile(roomId: string, clientId: string, tile: string, side: Side, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (!guard(s, clientId, expectedMove)) return null;
    if (!playable(s, s.turn).includes(tile) || !fits(s.line, tile).includes(side)) return null;
    return applyPlay(s, s.turn, tile, side);
  });
}

/** Takes one tile from the boneyard (only without a playable tile). */
export function drawTile(roomId: string, clientId: string, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (!guard(s, clientId, expectedMove) || !s.stock || playable(s, s.turn).length > 0) return null;
    return applyDraw(s, s.turn);
  });
}

/** Passes (only without a playable tile and with the boneyard empty). */
export function passTurn(roomId: string, clientId: string, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (!guard(s, clientId, expectedMove) || s.stock || playable(s, s.turn).length > 0) return null;
    return applyPass(s, s.turn);
  });
}

/** The player in turn left: plays their first fitting tile, or draws until one fits, or passes. */
export function playForAbsent(roomId: string, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.phase !== "play" || s.moveNo !== expectedMove) return null;
    let next = s;
    for (;;) {
      const tile = playable(next, next.turn)[0];
      if (tile) return applyPlay(next, next.turn, tile, fits(next.line, tile)[0]);
      if (!next.stock) return applyPass(next, next.turn);
      next = applyDraw(next, next.turn);
    }
  });
}

/** Next hand: the last winner opens (after a tied tranque, the seat after the last opener). */
export function nextHand(roomId: string, expectedHand: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.phase !== "handover" || s.handNo !== expectedHand) return null;
    const opener = s.result.winner || nextSeat(s, s.opener);
    return deal({ ...s, handNo: s.handNo + 1 }, opener);
  });
}

/** New match with whoever sits now. */
export function rematch(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    const active = SEATS.filter((seat) => s.seats[seat]).join("");
    if (active.length < 2) return { ...s, status: "waiting", gameNo: s.gameNo + 1 };
    return deal({ ...s, gameNo: s.gameNo + 1, active, handNo: 0, score: { a: 0, b: 0, c: 0, d: 0 }, winner: "" }, "");
  });
}
