import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { transactState } from "./transact";
import { deck, rankOf, shuffle, splitCards, suitOf } from "./baraja";

/**
 * Truco argentino, sin flor, 1 contra 1 or 2 contra 2, to 15 or 30 points.
 * Seats `a`, `b`, `c`, `d` play in that order around the table; `a`/`c` are
 * team 0 ("nosotros" for them) and `b`/`d` team 1. With two players only `a`
 * and `b` play.
 *
 * Each hand: 3 cards each (40-card deck, shuffled with Math.random in the
 * dealing transaction), up to three bazas. Envido (envido, real envido, falta
 * envido) may be sung during the first baza by whoever is about to play, or by
 * the team answering a truco ("el envido está primero"); truco, retruco and
 * vale cuatro by whoever is about to play, if their team holds the right to
 * raise. While a song waits for an answer nobody plays a card. Cards are never
 * hidden from DevTools (no backend) — accepted.
 */

export type Seat = "a" | "b" | "c" | "d";
export type Team = 0 | 1;
export const SEATS: Seat[] = ["a", "b", "c", "d"];
export const TARGET_OPTIONS = [15, 30] as const;

export const teamOf = (s: Seat): Team => (s === "a" || s === "c" ? 0 : 1);

/** Truco strength: higher wins. 1 de espada > 1 de basto > 7 de espada > 7 de oro > 3 > 2 > 1 falso > 12 > 11 > 10 > 7 falso > 6 > 5 > 4. */
export function strength(code: string): number {
  const r = rankOf(code);
  const s = suitOf(code);
  if (r === 1 && s === "e") return 14;
  if (r === 1 && s === "b") return 13;
  if (r === 7 && s === "e") return 12;
  if (r === 7 && s === "o") return 11;
  if (r === 3) return 10;
  if (r === 2) return 9;
  if (r === 1) return 8;
  if (r === 12) return 7;
  if (r === 11) return 6;
  if (r === 10) return 5;
  if (r === 7) return 4;
  return r - 3; // 6 → 3, 5 → 2, 4 → 1
}

/** Envido of a hand: two of the same suit = 20 + both values (figures count 0); otherwise the highest card. */
export function envidoOf(cards: string[]): number {
  const val = (c: string) => (rankOf(c) >= 10 ? 0 : rankOf(c));
  let best = Math.max(...cards.map(val));
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      if (suitOf(cards[i]) === suitOf(cards[j])) best = Math.max(best, 20 + val(cards[i]) + val(cards[j]));
  return best;
}

/** Envido songs: E envido (2), R real envido (3), F falta envido. */
export type EnvidoCall = "E" | "R" | "F";
export const ENVIDO_LABEL: Record<EnvidoCall, string> = { E: "Envido", R: "Real envido", F: "Falta envido" };
export const TRUCO_LABEL: Record<number, string> = { 2: "Truco", 3: "Retruco", 4: "Vale cuatro" };

/** Can `call` follow the songs so far? (E, E, R, F in that order, each optional.) */
export function canRaiseEnvido(chain: string, call: EnvidoCall): boolean {
  if (chain.includes("F")) return false;
  if (call === "F") return true;
  if (call === "R") return !chain.includes("R");
  return !chain.includes("R") && chain.split("").filter((x) => x === "E").length < 2;
}

/** Points of a sung-and-accepted chain; `falta` = what the leader lacks to win. */
export function envidoPoints(chain: string, falta: number): number {
  if (chain.includes("F")) return falta;
  return chain.split("").reduce((a, c) => a + (c === "E" ? 2 : 3), 0);
}

/** Points for a refused chain: the accepted part before the last song, or 1. */
export function envidoRefused(chain: string, falta: number): number {
  return chain.length <= 1 ? 1 : envidoPoints(chain.slice(0, -1), falta);
}

/** Who wins the hand from the bazas so far ("0", "1" or "p" parda each), or null if it goes on. */
export function handWinner(bazas: string, manoTeam: Team): Team | null {
  const b = bazas.split("");
  const w0 = b.filter((x) => x === "0").length;
  const w1 = b.filter((x) => x === "1").length;
  if (w0 >= 2) return 0;
  if (w1 >= 2) return 1;
  if (b.length < 2) return null;
  const firstWon = b.find((x) => x !== "p");
  if (b.length === 2) {
    // A parda in either of the first two decides by the other one.
    if (b[0] === "p" && b[1] !== "p") return Number(b[1]) as Team;
    if (b[0] !== "p" && b[1] === "p") return Number(b[0]) as Team;
    return null;
  }
  if (b[2] === "p") return firstWon !== undefined ? (Number(firstWon) as Team) : manoTeam;
  return Number(b[2]) as Team;
}

export interface TrucoMeta {
  game: "truco";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  target: number;
  createdAt: number | object;
}

export type TrucoStatus = "waiting" | "playing" | "handEnd" | "finished";

export interface TrucoPlayer {
  name: string;
  color: string;
}

export interface TrucoState {
  status: TrucoStatus;
  gameNo: number;
  players: Record<string, TrucoPlayer>;
  /** Client id in each seat, "" if empty. */
  seats: Record<Seat, string>;
  /** Seats playing this game, in table order ("ab" or "abcd"). */
  active: string;
  target: number;
  /** Team points: [team 0, team 1]. */
  score0: number;
  score1: number;
  handNo: number;
  /** Who is mano this hand (plays first, wins envido ties and the triple parda). */
  mano: Seat;
  /** The three cards dealt to each seat (for the envido), and the ones played, in order. */
  hands: Record<Seat, string>;
  played: Record<Seat, string>;
  /** Result of each finished baza: "0", "1" or "p". */
  bazas: string;
  /** Who led the current baza. */
  leader: Seat;
  turn: Seat;
  /** Accepted truco level: 1 nothing, 2 truco, 3 retruco, 4 vale cuatro. */
  trucoLevel: number;
  /** Team holding the right to raise the truco ("" = whoever plays). */
  trucoOwner: "" | "0" | "1";
  /** A truco song waiting for an answer: the level asked and who sang it. */
  trucoAsk: { level: number; by: Seat | "" };
  /** Envido songs waiting for an answer ("" = none) and who sang the last one. */
  envidoAsk: { chain: string; by: Seat | "" };
  envidoDone: boolean;
  /** The envido's outcome, for everyone to see: team values, winner, points. */
  envidoResult: { winner: "" | "0" | "1"; points: number; v0: number; v1: number; accepted: boolean };
  /** How the last hand ended. */
  handResult: { winner: "" | "0" | "1"; points: number; reason: string };
  /** Recent songs and plays, newest last. */
  log: string;
  moveNo: number;
  winner: "" | "0" | "1";
  wins: Record<string, number>;
}

const EMPTY_SEATS: Record<Seat, string> = { a: "", b: "", c: "", d: "" };

function normalizeState(raw: Partial<TrucoState> | null): TrucoState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    seats: { ...EMPTY_SEATS, ...(raw.seats ?? {}) },
    active: raw.active ?? "",
    target: raw.target ?? 30,
    score0: raw.score0 ?? 0,
    score1: raw.score1 ?? 0,
    handNo: raw.handNo ?? 0,
    mano: raw.mano ?? "a",
    hands: { ...EMPTY_SEATS, ...(raw.hands ?? {}) },
    played: { ...EMPTY_SEATS, ...(raw.played ?? {}) },
    bazas: raw.bazas ?? "",
    leader: raw.leader ?? "a",
    turn: raw.turn ?? "a",
    trucoLevel: raw.trucoLevel ?? 1,
    trucoOwner: raw.trucoOwner ?? "",
    trucoAsk: { level: raw.trucoAsk?.level ?? 0, by: raw.trucoAsk?.by ?? "" },
    envidoAsk: { chain: raw.envidoAsk?.chain ?? "", by: raw.envidoAsk?.by ?? "" },
    envidoDone: raw.envidoDone ?? false,
    envidoResult: {
      winner: raw.envidoResult?.winner ?? "",
      points: raw.envidoResult?.points ?? 0,
      v0: raw.envidoResult?.v0 ?? 0,
      v1: raw.envidoResult?.v1 ?? 0,
      accepted: raw.envidoResult?.accepted ?? false,
    },
    handResult: { winner: raw.handResult?.winner ?? "", points: raw.handResult?.points ?? 0, reason: raw.handResult?.reason ?? "" },
    log: raw.log ?? "",
    moveNo: raw.moveNo ?? 0,
    winner: raw.winner ?? "",
    wins: raw.wins ?? {},
  };
}

export function activeSeats(s: Pick<TrucoState, "active">): Seat[] {
  return s.active.split("") as Seat[];
}

export function seatOf(s: Pick<TrucoState, "seats">, clientId: string): Seat | null {
  if (!clientId) return null;
  return SEATS.find((x) => s.seats[x] === clientId) ?? null;
}

export function scoreOf(s: Pick<TrucoState, "score0" | "score1">, t: Team): number {
  return t === 0 ? s.score0 : s.score1;
}

/** Cards a seat still holds. */
export function inHand(s: Pick<TrucoState, "hands" | "played">, seat: Seat): string[] {
  const played = splitCards(s.played[seat]);
  return splitCards(s.hands[seat]).filter((c) => !played.includes(c));
}

/** The card a seat played in baza `i`, if any. */
export function playedIn(s: Pick<TrucoState, "played">, seat: Seat, i: number): string {
  return splitCards(s.played[seat])[i] ?? "";
}

function nextSeat(s: TrucoState, seat: Seat): Seat {
  const seats = activeSeats(s);
  return seats[(seats.indexOf(seat) + 1) % seats.length];
}

/** Falta envido: what the team ahead lacks to win. */
export function faltaPoints(s: Pick<TrucoState, "score0" | "score1" | "target">): number {
  return Math.max(1, s.target - Math.max(s.score0, s.score1));
}

function addLog(s: TrucoState, line: string): string {
  return [...(s.log ? s.log.split("\n") : []), line].slice(-8).join("\n");
}

function name(s: TrucoState, seat: Seat): string {
  return s.players[s.seats[seat]]?.name ?? "?";
}

function addPoints(s: TrucoState, team: Team, points: number): TrucoState {
  const next = team === 0 ? { ...s, score0: s.score0 + points } : { ...s, score1: s.score1 + points };
  const score = scoreOf(next, team);
  if (score < s.target) return next;
  // Game over: every player of the winning team gets the win.
  const wins = { ...s.wins };
  for (const seat of activeSeats(s)) if (teamOf(seat) === team && s.seats[seat]) wins[s.seats[seat]] = (wins[s.seats[seat]] ?? 0) + 1;
  return { ...next, [team === 0 ? "score0" : "score1"]: Math.min(score, s.target), status: "finished", winner: String(team) as "0" | "1", wins };
}

function endHand(s: TrucoState, team: Team, points: number, reason: string): TrucoState {
  const scored = addPoints({ ...s, handResult: { winner: String(team) as "0" | "1", points, reason }, trucoAsk: { level: 0, by: "" }, envidoAsk: { chain: "", by: "" } }, team, points);
  return scored.status === "finished" ? scored : { ...scored, status: "handEnd" };
}

function deal(s: TrucoState, mano: Seat): TrucoState {
  const cards = shuffle(deck(false));
  const hands = { ...EMPTY_SEATS };
  activeSeats(s).forEach((seat, i) => (hands[seat] = cards.slice(i * 3, i * 3 + 3).join("")));
  return {
    ...s,
    status: "playing",
    handNo: s.handNo + 1,
    mano,
    hands,
    played: { ...EMPTY_SEATS },
    bazas: "",
    leader: mano,
    turn: mano,
    trucoLevel: 1,
    trucoOwner: "",
    trucoAsk: { level: 0, by: "" },
    envidoAsk: { chain: "", by: "" },
    envidoDone: false,
    envidoResult: { winner: "", points: 0, v0: 0, v1: 0, accepted: false },
    handResult: { winner: "", points: 0, reason: "" },
    log: "",
    moveNo: s.moveNo + 1,
  };
}

/** Is anyone waiting for an answer? */
export function pendingSong(s: Pick<TrucoState, "trucoAsk" | "envidoAsk">): "envido" | "truco" | null {
  if (s.envidoAsk.chain) return "envido";
  if (s.trucoAsk.level) return "truco";
  return null;
}

/** The team that has to answer the pending song. */
export function answeringTeam(s: Pick<TrucoState, "trucoAsk" | "envidoAsk">): Team | null {
  const p = pendingSong(s);
  if (p === "envido") return (1 - teamOf(s.envidoAsk.by as Seat)) as Team;
  if (p === "truco") return (1 - teamOf(s.trucoAsk.by as Seat)) as Team;
  return null;
}

/** Can `seat` sing envido now? */
export function canSingEnvido(s: TrucoState, seat: Seat): boolean {
  if (s.status !== "playing" || s.envidoDone || s.bazas.length > 0 || playedIn(s, seat, 0)) return false;
  if (s.envidoAsk.chain) return false;
  // As the answer to a truco in the first baza ("el envido está primero")…
  if (s.trucoAsk.level) return answeringTeam(s) === teamOf(seat) && s.trucoLevel === 1;
  // …or when it's your turn to play, before any truco was accepted.
  return s.turn === seat && s.trucoLevel === 1;
}

export function canSingTruco(s: TrucoState, seat: Seat): boolean {
  if (s.status !== "playing" || pendingSong(s) || s.turn !== seat || s.trucoLevel >= 4) return false;
  return s.trucoOwner === "" || s.trucoOwner === String(teamOf(seat));
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/truco/state`;

function mutate(roomId: string, fn: (state: TrucoState) => TrucoState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createTrucoRoom(params: { target: number }, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: TrucoMeta = { game: "truco", hostId, ...params, createdAt: serverTimestamp() };
  const state: Partial<TrucoState> = { status: "waiting", gameNo: 0, target: params.target };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getTrucoMeta(roomId: string): Promise<Partial<TrucoMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeTruco(roomId: string, cb: (state: TrucoState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

/** Registers the player and, before the game, sits them in the first free seat. */
export function joinTruco(roomId: string, clientId: string, player: TrucoPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    const free = SEATS.find((x) => !s.seats[x]) ?? null;
    const sit = s.status === "waiting" && !seatOf(s, clientId) && free;
    if (!sit && known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player }, seats: sit ? { ...s.seats, [sit]: clientId } : s.seats };
  });
}

/** Takes a free seat, or one whose player left (`expectedOccupant` is who I saw there). */
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

/** Starts 1 vs 1 (seats a, b) or 2 vs 2 (all four seats). */
export function startTruco(roomId: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting") return null;
    const filled = SEATS.filter((x) => s.seats[x]);
    const active = filled.length === 4 ? "abcd" : s.seats.a && s.seats.b && filled.length === 2 ? "ab" : "";
    if (!active) return null;
    return deal({ ...s, active, score0: 0, score1: 0, handNo: 0, winner: "" }, "a");
  });
}

export function playCard(roomId: string, clientId: string, code: string, expectedMove: number) {
  return mutate(roomId, (s) => {
    const seat = seatOf(s, clientId);
    if (!seat || s.moveNo !== expectedMove) return null;
    return playCardFor(s, seat, code);
  });
}

function playCardFor(s: TrucoState, seat: Seat, code: string): TrucoState | null {
  if (s.status !== "playing" || s.turn !== seat || pendingSong(s)) return null;
  if (!inHand(s, seat).includes(code)) return null;
  const baza = s.bazas.length;
  let next: TrucoState = {
    ...s,
    played: { ...s.played, [seat]: s.played[seat] + code },
    moveNo: s.moveNo + 1,
  };
  const seats = activeSeats(s);
  const everyonePlayed = seats.every((x) => playedIn(next, x, baza));
  if (!everyonePlayed) return { ...next, turn: nextSeat(s, seat) };

  // Baza over: the strongest card wins it; equal strength across teams is parda.
  const ranked = seats.map((x) => ({ seat: x, st: strength(playedIn(next, x, baza)) }));
  const top = Math.max(...ranked.map((r) => r.st));
  const best = ranked.filter((r) => r.st === top);
  const teams = new Set(best.map((r) => teamOf(r.seat)));
  const result = teams.size > 1 ? "p" : String(teamOf(best[0].seat));
  // The winner leads the next baza; after a parda, whoever led it leads again.
  const leader = result === "p" ? s.leader : best.find((r) => r.seat === s.leader)?.seat ?? best[0].seat;
  next = { ...next, bazas: s.bazas + result, leader, turn: leader };
  const winner = handWinner(next.bazas, teamOf(s.mano));
  if (winner === null) return next;
  return endHand(next, winner, s.trucoLevel, "bazas");
}

export function singTruco(roomId: string, clientId: string, expectedMove: number) {
  return mutate(roomId, (s) => {
    const seat = seatOf(s, clientId);
    if (!seat || s.moveNo !== expectedMove || !canSingTruco(s, seat)) return null;
    const level = s.trucoLevel + 1;
    return { ...s, trucoAsk: { level, by: seat }, moveNo: s.moveNo + 1, log: addLog(s, `${name(s, seat)}: ¡${TRUCO_LABEL[level]}!`) };
  });
}

export function singEnvido(roomId: string, clientId: string, call: EnvidoCall, expectedMove: number) {
  return mutate(roomId, (s) => {
    const seat = seatOf(s, clientId);
    if (!seat || s.moveNo !== expectedMove || !canSingEnvido(s, seat)) return null;
    return { ...s, envidoAsk: { chain: call, by: seat }, moveNo: s.moveNo + 1, log: addLog(s, `${name(s, seat)}: ¡${ENVIDO_LABEL[call]}!`) };
  });
}

export type Answer = "quiero" | "noquiero" | EnvidoCall | "raise";

/** Applies an answer to the pending song by `seat` (of the answering team), or null if it isn't valid. */
function applyAnswer(s: TrucoState, seat: Seat, ans: Answer): TrucoState | null {
  const pending = pendingSong(s);
  if (s.status !== "playing" || !pending || answeringTeam(s) !== teamOf(seat)) return null;
  const base = { ...s, moveNo: s.moveNo + 1 };
  const said = ans === "quiero" ? "¡Quiero!" : ans === "noquiero" ? "No quiero" : "";

  if (pending === "envido") {
    const chain = s.envidoAsk.chain;
    const singer = teamOf(s.envidoAsk.by as Seat);
    if (ans === "E" || ans === "R" || ans === "F") {
      if (!canRaiseEnvido(chain, ans)) return null;
      return { ...base, envidoAsk: { chain: chain + ans, by: seat }, log: addLog(s, `${name(s, seat)}: ¡${ENVIDO_LABEL[ans]}!`) };
    }
    if (ans === "raise") return null;
    const falta = faltaPoints(s);
    const next: TrucoState = { ...base, envidoAsk: { chain: "", by: "" }, envidoDone: true, log: addLog(s, `${name(s, seat)}: ${said}`) };
    if (ans === "noquiero") {
      const points = envidoRefused(chain, falta);
      return addPoints({ ...next, envidoResult: { winner: String(singer) as "0" | "1", points, v0: 0, v1: 0, accepted: false } }, singer, points);
    }
    // Quiero: compare each team's best envido; ties go to the one closest to mano.
    const seats = activeSeats(s);
    const fromMano = [...seats.slice(seats.indexOf(s.mano)), ...seats.slice(0, seats.indexOf(s.mano))];
    const values = fromMano.map((x) => ({ seat: x, v: envidoOf(splitCards(s.hands[x])) }));
    const v0 = Math.max(...values.filter((x) => teamOf(x.seat) === 0).map((x) => x.v));
    const v1 = Math.max(...values.filter((x) => teamOf(x.seat) === 1).map((x) => x.v));
    const top = Math.max(v0, v1);
    const winnerTeam = teamOf(values.find((x) => x.v === top)!.seat);
    const points = envidoPoints(chain, falta);
    return addPoints({ ...next, envidoResult: { winner: String(winnerTeam) as "0" | "1", points, v0, v1, accepted: true } }, winnerTeam, points);
  }

  // Truco.
  const ask = s.trucoAsk;
  const singer = teamOf(ask.by as Seat);
  if (ans === "E" || ans === "R" || ans === "F") {
    // El envido está primero: answer a truco with an envido during the first baza.
    if (!canSingEnvido(s, seat)) return null;
    return { ...base, envidoAsk: { chain: ans, by: seat }, log: addLog(s, `${name(s, seat)}: ¡El envido está primero! ¡${ENVIDO_LABEL[ans]}!`) };
  }
  if (ans === "noquiero") {
    return endHand({ ...base, log: addLog(s, `${name(s, seat)}: No quiero`) }, singer, ask.level - 1, "noquiero");
  }
  if (ans === "quiero") {
    return {
      ...base,
      trucoLevel: ask.level,
      trucoOwner: String(teamOf(seat)) as "0" | "1",
      trucoAsk: { level: 0, by: "" },
      // Once a truco is accepted the envido can't be sung anymore.
      envidoDone: true,
      log: addLog(s, `${name(s, seat)}: ¡Quiero!`),
    };
  }
  // Raise: accept and ask for more.
  if (ask.level >= 4) return null;
  return {
    ...base,
    trucoLevel: ask.level,
    trucoAsk: { level: ask.level + 1, by: seat },
    envidoDone: true,
    log: addLog(s, `${name(s, seat)}: ¡${TRUCO_LABEL[ask.level + 1]}!`),
  };
}

/** Answer to the pending song by a player of the answering team. */
export function answer(roomId: string, clientId: string, ans: Answer, expectedMove: number) {
  return mutate(roomId, (s) => {
    const seat = seatOf(s, clientId);
    if (!seat || s.moveNo !== expectedMove) return null;
    return applyAnswer(s, seat, ans);
  });
}

/** Gives up the hand: the rivals score the truco as it stands (or the refused song). */
export function goToDeck(roomId: string, clientId: string, expectedMove: number) {
  return mutate(roomId, (s) => {
    const seat = seatOf(s, clientId);
    if (s.status !== "playing" || !seat || s.moveNo !== expectedMove || s.envidoAsk.chain) return null;
    const rival = (1 - teamOf(seat)) as Team;
    const pendingAgainstMe = s.trucoAsk.level && teamOf(s.trucoAsk.by as Seat) === rival;
    const points = pendingAgainstMe ? s.trucoAsk.level - 1 : s.trucoLevel;
    return endHand({ ...s, moveNo: s.moveNo + 1, log: addLog(s, `${name(s, seat)} se fue al mazo`) }, rival, points, "mazo");
  });
}

/**
 * A needed player left: if the song is waiting on a team, it's refused; else
 * the player in turn plays their first card.
 */
export function playForAbsent(roomId: string, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.moveNo !== expectedMove) return null;
    const team = answeringTeam(s);
    if (team !== null) {
      const seat = activeSeats(s).find((x) => teamOf(x) === team)!;
      return applyAnswer(s, seat, "noquiero");
    }
    const card = inHand(s, s.turn)[0];
    if (!card) return null;
    return playCardFor(s, s.turn, card);
  });
}

/** After a hand: the next seat is mano and cards are dealt again. */
export function nextHand(roomId: string, expectedMove: number) {
  return mutate(roomId, (s) => (s.status === "handEnd" && s.moveNo === expectedMove ? deal(s, nextSeat(s, s.mano)) : null));
}

/** Same seats, scores back to zero. */
export function rematch(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    const ready = activeSeats(s).every((x) => s.seats[x]);
    const reset = { ...s, gameNo: s.gameNo + 1, score0: 0, score1: 0, handNo: 0, winner: "" as const };
    return ready ? deal(reset, "a") : { ...reset, status: "waiting" };
  });
}
