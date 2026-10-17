import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { transactState } from "./transact";
import { deck, shuffle, splitCards } from "./baraja";
import { bestArrangement, canCut, cutterPoints, isChinchon } from "./chinchonRules";

/**
 * Chinchón for 2–5, with the 48-card Spanish deck plus two jokers. Each hand,
 * everyone gets 7 cards; in turn you take the top of the deck or of the
 * discard pile and throw one. You may cut when throwing if the other seven are
 * all melded but one card worth ≤ 5. Then everyone scores their loose cards
 * (best arrangement, computed by the app); the cutter scores that card, or
 * −10 with everything melded. A chinchón (seven in a row of one suit) wins the
 * game on the spot. Whoever passes the limit is out; the last one left wins.
 *
 * Hands, deck and discard pile live in the state (readable with DevTools —
 * accepted, as in Batalla naval). The deck is shuffled with Math.random in the
 * dealing transaction.
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const HAND = 7;
export const LIMIT_OPTIONS = [50, 100] as const;

export interface ChinchonMeta {
  game: "chinchon";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  limit: number;
  createdAt: number | object;
}

export type ChinchonStatus = "waiting" | "playing" | "handEnd" | "finished";

export interface ChinchonPlayer {
  name: string;
  color: string;
}

export interface ChinchonState {
  status: ChinchonStatus;
  gameNo: number;
  players: Record<string, ChinchonPlayer>;
  /** Players of this game in seat order, fixed at the start. */
  order: string[];
  /** Eliminated players. */
  out: Record<string, boolean>;
  handNo: number;
  turn: string;
  phase: "draw" | "discard";
  deck: string;
  /** Discard pile, top card last. */
  discard: string;
  hands: Record<string, string>;
  /** The card just taken from the discard pile (it can't be thrown back right away). */
  tookDiscard: string;
  scores: Record<string, number>;
  /** Bumped on every action, so a double tap can't act twice. */
  moveNo: number;
  /** The last hand's result, shown until the next deal. */
  lastHand: { cutter: string; chinchon: boolean; points: Record<string, number> };
  winner: string;
  wins: Record<string, number>;
}

function normalizeState(raw: Partial<ChinchonState> | null): ChinchonState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    order: raw.order ?? [],
    out: raw.out ?? {},
    handNo: raw.handNo ?? 0,
    turn: raw.turn ?? "",
    phase: raw.phase ?? "draw",
    deck: raw.deck ?? "",
    discard: raw.discard ?? "",
    hands: raw.hands ?? {},
    tookDiscard: raw.tookDiscard ?? "",
    scores: raw.scores ?? {},
    moveNo: raw.moveNo ?? 0,
    lastHand: { cutter: raw.lastHand?.cutter ?? "", chinchon: raw.lastHand?.chinchon ?? false, points: raw.lastHand?.points ?? {} },
    winner: raw.winner ?? "",
    wins: raw.wins ?? {},
  };
}

export function inPlay(s: Pick<ChinchonState, "order" | "out">): string[] {
  return s.order.filter((id) => !s.out[id]);
}

export function topDiscard(s: Pick<ChinchonState, "discard">): string {
  return s.discard.slice(-2);
}

function nextPlayer(s: ChinchonState, after: string): string {
  const alive = inPlay(s);
  return alive[(alive.indexOf(after) + 1) % alive.length];
}

/** Deals a new hand; the player after the previous starter begins. */
function deal(s: ChinchonState): ChinchonState {
  const alive = inPlay(s);
  const cards = shuffle([...deck(true), "x1", "x2"]);
  const hands: Record<string, string> = {};
  alive.forEach((id, i) => (hands[id] = cards.slice(i * HAND, (i + 1) * HAND).join("")));
  const used = alive.length * HAND;
  const starter = alive[s.handNo % alive.length];
  return {
    ...s,
    status: "playing",
    handNo: s.handNo + 1,
    hands,
    discard: cards[used],
    deck: cards.slice(used + 1).join(""),
    turn: starter,
    phase: "draw",
    tookDiscard: "",
    moveNo: s.moveNo + 1,
  };
}

/** Scores the hand after `cutter` cut; ends the game if needed. */
function endHand(s: ChinchonState, cutter: string, limit: number): ChinchonState {
  const cutterCards = splitCards(s.hands[cutter]);
  if (isChinchon(cutterCards)) {
    return {
      ...s,
      status: "finished",
      lastHand: { cutter, chinchon: true, points: {} },
      winner: cutter,
      wins: { ...s.wins, [cutter]: (s.wins[cutter] ?? 0) + 1 },
      moveNo: s.moveNo + 1,
    };
  }
  const points: Record<string, number> = {};
  const scores = { ...s.scores };
  const out = { ...s.out };
  for (const id of inPlay(s)) {
    const cards = splitCards(s.hands[id] ?? "");
    points[id] = id === cutter ? cutterPoints(cards) : bestArrangement(cards).points;
    scores[id] = (scores[id] ?? 0) + points[id];
    if (scores[id] > limit) out[id] = true;
  }
  const alive = s.order.filter((id) => !out[id]);
  const next: ChinchonState = { ...s, scores, out, lastHand: { cutter, chinchon: false, points }, moveNo: s.moveNo + 1 };
  if (alive.length <= 1) {
    // Everyone passed the limit at once: the lowest score wins.
    const winner = alive[0] ?? [...s.order].sort((a, b) => scores[a] - scores[b])[0];
    return { ...next, status: "finished", winner, wins: { ...s.wins, [winner]: (s.wins[winner] ?? 0) + 1 } };
  }
  return { ...next, status: "handEnd" };
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/chinchon/state`;

function mutate(roomId: string, fn: (state: ChinchonState) => ChinchonState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createChinchonRoom(params: { limit: number }, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: ChinchonMeta = { game: "chinchon", hostId, ...params, createdAt: serverTimestamp() };
  const state: Partial<ChinchonState> = { status: "waiting", gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getChinchonMeta(roomId: string): Promise<Partial<ChinchonMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeChinchon(roomId: string, cb: (state: ChinchonState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinChinchon(roomId: string, clientId: string, player: ChinchonPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

/** The connected players (up to MAX_PLAYERS) play; the rest watch. */
export function startChinchon(roomId: string, connected: string[]) {
  return mutate(roomId, (s) => {
    const ids = connected.filter((id) => s.players[id]).slice(0, MAX_PLAYERS);
    if (s.status !== "waiting" || ids.length < MIN_PLAYERS) return null;
    return deal({
      ...s,
      order: shuffle(ids),
      out: {},
      handNo: 0,
      scores: Object.fromEntries(ids.map((id) => [id, 0])),
      lastHand: { cutter: "", chinchon: false, points: {} },
      winner: "",
    });
  });
}

/** Takes the top card of the deck (`fromDiscard` false) or of the discard pile. */
export function drawCard(roomId: string, clientId: string, fromDiscard: boolean, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.turn !== clientId || s.phase !== "draw" || s.moveNo !== expectedMove) return null;
    let deckStr = s.deck;
    let discard = s.discard;
    let taken: string;
    if (fromDiscard) {
      if (!discard) return null;
      taken = discard.slice(-2);
      discard = discard.slice(0, -2);
    } else {
      if (!deckStr) {
        // Deck ran out: the discard pile but its top card is shuffled into a new one.
        const top = discard.slice(-2);
        deckStr = shuffle(splitCards(discard.slice(0, -2))).join("");
        discard = top;
        if (!deckStr) return null;
      }
      taken = deckStr.slice(0, 2);
      deckStr = deckStr.slice(2);
    }
    return {
      ...s,
      deck: deckStr,
      discard,
      hands: { ...s.hands, [clientId]: (s.hands[clientId] ?? "") + taken },
      phase: "discard",
      tookDiscard: fromDiscard ? taken : "",
      moveNo: s.moveNo + 1,
    };
  });
}

/** Throws `code`; with `cut`, closes the hand (only if the other seven allow it). */
export function discardCard(roomId: string, clientId: string, code: string, cut: boolean, limit: number, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.turn !== clientId || s.phase !== "discard" || s.moveNo !== expectedMove) return null;
    const cards = splitCards(s.hands[clientId] ?? "");
    const i = cards.indexOf(code);
    if (i < 0 || code === s.tookDiscard) return null;
    cards.splice(i, 1);
    if (cut && !canCut(cards)) return null;
    const next: ChinchonState = {
      ...s,
      hands: { ...s.hands, [clientId]: cards.join("") },
      discard: s.discard + code,
      tookDiscard: "",
    };
    if (cut) return endHand(next, clientId, limit);
    return { ...next, turn: nextPlayer(s, clientId), phase: "draw", moveNo: s.moveNo + 1 };
  });
}

/** The player in turn left: they draw from the deck and throw that same card. */
export function skipTurn(roomId: string, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.moveNo !== expectedMove) return null;
    const who = s.turn;
    let hand = s.hands[who] ?? "";
    let discard = s.discard;
    let deckStr = s.deck;
    if (s.phase === "draw") {
      if (!deckStr) {
        const top = discard.slice(-2);
        deckStr = shuffle(splitCards(discard.slice(0, -2))).join("");
        discard = top;
      }
      discard += deckStr.slice(0, 2);
      deckStr = deckStr.slice(2);
    } else {
      // Throw the card they drew (the last in the hand).
      discard += hand.slice(-2);
      hand = hand.slice(0, -2);
    }
    return {
      ...s,
      deck: deckStr,
      discard,
      hands: { ...s.hands, [who]: hand },
      turn: nextPlayer(s, who),
      phase: "draw",
      tookDiscard: "",
      moveNo: s.moveNo + 1,
    };
  });
}

/** After a hand's scores: deal the next one. */
export function nextHand(roomId: string, expectedMove: number) {
  return mutate(roomId, (s) => (s.status === "handEnd" && s.moveNo === expectedMove ? deal(s) : null));
}

/** Back to the waiting room so whoever is here plays the next game. */
export function playAgain(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    return { ...s, status: "waiting", gameNo: s.gameNo + 1, order: [], out: {}, hands: {}, deck: "", discard: "", scores: {}, winner: "" };
  });
}
