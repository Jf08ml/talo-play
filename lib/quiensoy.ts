import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { levenshtein, normalizeText } from "./text";
import { QUIEN_DECKS, type QuienDeckId } from "./quiensoyCards";

/**
 * ¿Quién soy? Everyone gets a secret character "on their forehead": their
 * phone shows everyone else's, never their own. Taking turns, you ask a
 * yes/no question about yourself (typed in the app, or out loud) and the
 * others answer with buttons; while the answers aren't mostly "no" you keep
 * asking (up to `MAX_PER_TURN`). On your turn you can guess instead: right,
 * and you're done with points for having asked little; wrong, and the turn
 * passes. You can also give up. The round ends when everyone guessed or gave
 * up; "Otra ronda" deals new ones and the scores add up.
 *
 * Characters come from the decks (`lib/quiensoyCards.ts`) or are written by
 * the players ("post-it": each writes the next one's). They're stored in the
 * state (readable with DevTools, like El impostor's word — accepted).
 */

export const MIN_PLAYERS = 2;
export const MAX_PER_TURN = 5;
export const ANSWER_SECONDS = 40;
export const MAX_QUESTION = 90;
export const MAX_CHARACTER = 40;
/** Points for guessing: `GUESS_BASE` minus one per question and two per wrong guess, never under `GUESS_MIN`. */
export const GUESS_BASE = 12;
export const GUESS_MIN = 2;
/** In post-it, after this long anyone can fill the missing ones from the decks. */
export const WRITE_GRACE_MS = 120000;

export type AskMode = "app" | "voz";
export type CardSource = "mazo" | "postit";
export type Answer = "si" | "no" | "aveces" | "nose";

export const ANSWERS: { id: Answer; label: string }[] = [
  { id: "si", label: "Sí" },
  { id: "no", label: "No" },
  { id: "aveces", label: "A veces" },
  { id: "nose", label: "No sé" },
];

export interface QuienMeta {
  game: "quiensoy";
  hostId?: string;
  askMode: AskMode;
  source: CardSource;
  decks: QuienDeckId[];
  createdAt: number | object;
}

export type QuienStatus = "waiting" | "writing" | "playing" | "finished";

export interface QuienPlayer {
  name: string;
  color: string;
}

/** A character: what's shown, other accepted names, and its deck ("postit" if a player wrote it, with who). */
export interface Character {
  name: string;
  alt?: string[];
  deck: string;
  by?: string;
}

/** A question asked and how it was answered. */
export interface LogEntry {
  by: string;
  text: string;
  si: number;
  no: number;
  aveces: number;
  nose: number;
}

export interface Done {
  how: "guessed" | "gave";
  /** Questions asked and points earned. */
  q: number;
  pts: number;
  at: number;
}

export interface QuienState {
  status: QuienStatus;
  seed: number;
  roundNo: number;
  phaseStartedAt: number;
  players: Record<string, QuienPlayer>;
  /** This round's players, in turn order. Late joiners watch until the next round. */
  order: string[];
  cards: Record<string, Character>;
  /** Post-it: writer → what they wrote for the next one. */
  postits: Record<string, string>;
  /** Whose turn, how many turns so far (guard), how many questions in this turn. */
  turn: string;
  turnNo: number;
  turnAsked: number;
  /** The question being answered, and the answers so far. */
  question: { by: string; text: string; at: number } | null;
  answers: Record<string, Answer>;
  log: LogEntry[];
  asked: Record<string, number>;
  misses: Record<string, number>;
  done: Record<string, Done>;
  /** The last guess (for everyone to see how it went). */
  lastGuess: { by: string; text: string; ok: boolean; at: number } | null;
  scores: Record<string, number>;
}

function normalizeState(raw: Partial<QuienState> | null): QuienState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    roundNo: raw.roundNo ?? 0,
    phaseStartedAt: raw.phaseStartedAt ?? 0,
    players: raw.players ?? {},
    order: raw.order ?? [],
    cards: raw.cards ?? {},
    postits: raw.postits ?? {},
    turn: raw.turn ?? "",
    turnNo: raw.turnNo ?? 0,
    turnAsked: raw.turnAsked ?? 0,
    question: raw.question ?? null,
    answers: raw.answers ?? {},
    log: (raw.log ?? []).filter(Boolean).map((e) => ({ by: e.by ?? "", text: e.text ?? "", si: e.si ?? 0, no: e.no ?? 0, aveces: e.aveces ?? 0, nose: e.nose ?? 0 })),
    asked: raw.asked ?? {},
    misses: raw.misses ?? {},
    done: raw.done ?? {},
    lastGuess: raw.lastGuess ?? null,
    scores: raw.scores ?? {},
  };
}

export function normalizeMeta(raw: Partial<QuienMeta>): Pick<QuienMeta, "askMode" | "source" | "decks"> {
  const decks = (raw.decks ?? []).filter((d) => QUIEN_DECKS.some((x) => x.id === d));
  return {
    askMode: raw.askMode === "voz" ? "voz" : "app",
    source: raw.source === "postit" ? "postit" : "mazo",
    decks: decks.length ? decks : QUIEN_DECKS.map((d) => d.id),
  };
}

// ---- Pure helpers ----------------------------------------------------------------------------

function parseCard(raw: string, deck: string): Character {
  const [name, ...alt] = raw.split("|");
  return alt.length ? { name, alt, deck } : { name, deck };
}

/** Distinct characters from the chosen decks, dealt from the seed. */
export function dealFromDecks(decks: QuienDeckId[], seed: number, count: number): Character[] {
  const pool = QUIEN_DECKS.filter((d) => decks.includes(d.id)).flatMap((d) => d.cards.map((c) => parseCard(c, d.id)));
  const all = pool.length ? pool : QUIEN_DECKS[0].cards.map((c) => parseCard(c, QUIEN_DECKS[0].id));
  return seededShuffle(all, seed).slice(0, count);
}

/** Post-it: who writes `target`'s character (the one before them in the order). */
export function writerOf(order: string[], target: string): string {
  const i = order.indexOf(target);
  return i < 0 || order.length < 2 ? "" : order[(i - 1 + order.length) % order.length];
}

/** Whose character `writer` writes. */
export function targetOf(order: string[], writer: string): string {
  const i = order.indexOf(writer);
  return i < 0 || order.length < 2 ? "" : order[(i + 1) % order.length];
}

const ARTICLES = /^(el|la|los|las|un|una|don|dona)\s+/;
const simple = (s: string) => normalizeText(s).replace(/[^a-z0-9ñ ]/g, "").replace(ARTICLES, "").trim();

/** A guess is right with the name or any other accepted one, a leading article or a small typo aside. */
export function guessMatches(guess: string, card: Character): boolean {
  const g = simple(guess);
  if (!g) return false;
  for (const n of [card.name, ...(card.alt ?? [])]) {
    const w = simple(n);
    if (!w) continue;
    if (g === w) return true;
    if (w.length >= 5 && levenshtein(g, w) <= (w.length >= 9 ? 2 : 1)) return true;
    // Just the surname (or the first name) of someone with two words: "Messi" for "Lionel Messi".
    const parts = w.split(" ");
    if (card.deck === "famosos" && parts.length > 1 && parts.some((p) => p.length >= 4 && (p === g || (p.length >= 6 && levenshtein(p, g) <= 1)))) return true;
  }
  return false;
}

/** How a question went: mostly no (the turn passes), or not. */
export function tallyAnswers(answers: Record<string, Answer>): Omit<LogEntry, "by" | "text"> {
  const t = { si: 0, no: 0, aveces: 0, nose: 0 };
  for (const a of Object.values(answers)) t[a]++;
  return t;
}

export function pointsFor(asked: number, misses: number): number {
  return Math.max(GUESS_MIN, GUESS_BASE - asked - 2 * misses);
}

/** The ones still guessing. */
export const playingNow = (s: QuienState) => s.order.filter((id) => !s.done[id]);

/** This round's points (for the end screen and the ranking). */
export function roundPoints(s: QuienState): Record<string, number> {
  return Object.fromEntries(s.order.map((id) => [id, s.done[id]?.pts ?? 0]));
}

// ---- Firebase ------------------------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/quiensoy/state`;

function mutate(roomId: string, fn: (state: QuienState) => QuienState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export type QuienSettings = Pick<QuienMeta, "askMode" | "source" | "decks">;

export async function createQuienRoom(settings: QuienSettings, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: QuienMeta = { game: "quiensoy", hostId, ...settings, createdAt: serverTimestamp() };
  const state: Partial<QuienState> = { status: "waiting", seed: makeSeed(), roundNo: 0 };
  await update(ref(getDb()), { [`rooms/${roomId}/meta`]: meta, [statePath(roomId)]: state });
  return roomId;
}

export async function getQuienMeta(roomId: string): Promise<Partial<QuienMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeQuien(roomId: string, cb: (state: QuienState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinQuien(roomId: string, clientId: string, player: QuienPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

/** The first turn: everyone has a character. */
function toPlaying(s: QuienState, cards: Record<string, Character>): QuienState {
  return { ...s, status: "playing", cards, turn: s.order[0], turnNo: s.turnNo + 1, turnAsked: 0, question: null, answers: {}, phaseStartedAt: serverNow() };
}

/** A new round for `participants`: from the decks straight away, or the post-its to write first. */
function newRound(s: QuienState, participants: string[], settings: QuienSettings, seed: number, roundNo: number): QuienState {
  const order = seededShuffle(participants, seed);
  const scores = { ...s.scores };
  for (const id of order) scores[id] = scores[id] ?? 0;
  const base: QuienState = {
    ...s,
    status: settings.source === "postit" ? "writing" : "playing",
    seed,
    roundNo,
    phaseStartedAt: serverNow(),
    order,
    cards: {},
    postits: {},
    turn: "",
    turnAsked: 0,
    question: null,
    answers: {},
    log: [],
    asked: {},
    misses: {},
    done: {},
    lastGuess: null,
    scores,
  };
  if (settings.source === "postit") return base;
  const dealt = dealFromDecks(settings.decks, seed, order.length);
  return toPlaying(base, Object.fromEntries(order.map((id, i) => [id, dealt[i]])));
}

export function startQuien(roomId: string, participants: string[], settings: QuienSettings) {
  return mutate(roomId, (s) => {
    const ids = participants.filter((id) => s.players[id]);
    if (s.status !== "waiting" || ids.length < MIN_PLAYERS) return null;
    return newRound(s, ids, settings, s.seed, s.roundNo);
  });
}

export function nextRound(roomId: string, expectedRound: number, participants: string[], settings: QuienSettings) {
  return mutate(roomId, (s) => {
    const ids = participants.filter((id) => s.players[id]);
    if (s.status !== "finished" || s.roundNo !== expectedRound || ids.length < MIN_PLAYERS) return null;
    return newRound(s, ids, settings, makeSeed(), s.roundNo + 1);
  });
}

/** Post-it: the cards from what was written (and the decks for whoever didn't write). */
function dealPostits(s: QuienState, decks: QuienDeckId[]): QuienState {
  const spare = dealFromDecks(decks, s.seed, s.order.length);
  const cards: Record<string, Character> = {};
  s.order.forEach((id, i) => {
    const writer = writerOf(s.order, id);
    const text = s.postits[writer]?.trim();
    cards[id] = text ? { name: text, deck: "postit", by: writer } : spare[i];
  });
  return toPlaying(s, cards);
}

/** Post-it: what `writer` wrote for the next one. Once everyone wrote, the game starts. */
export function submitPostit(roomId: string, expectedRound: number, writer: string, text: string, decks: QuienDeckId[]) {
  return mutate(roomId, (s) => {
    const clean = text.trim().slice(0, MAX_CHARACTER);
    if (s.status !== "writing" || s.roundNo !== expectedRound || !s.order.includes(writer) || !clean) return null;
    const next = { ...s, postits: { ...s.postits, [writer]: clean } };
    return s.order.every((id) => next.postits[id]) ? dealPostits(next, decks) : next;
  });
}

/** Post-it: start without waiting (whoever didn't write gets their target a card from the decks). */
export function fillPostits(roomId: string, expectedRound: number, decks: QuienDeckId[]) {
  return mutate(roomId, (s) => (s.status === "writing" && s.roundNo === expectedRound ? dealPostits(s, decks) : null));
}

/** The next one still guessing after `from` (or "" if nobody is). */
function nextUp(s: QuienState, from: string): string {
  const n = s.order.length;
  const i = s.order.indexOf(from);
  for (let k = 1; k <= n; k++) {
    const id = s.order[(i + k + n) % n];
    if (!s.done[id]) return id;
  }
  return "";
}

function passTurnFrom(s: QuienState): QuienState {
  const turn = nextUp(s, s.turn);
  if (!turn) return { ...s, status: "finished", turn: "", question: null, answers: {}, phaseStartedAt: serverNow() };
  return { ...s, turn, turnNo: s.turnNo + 1, turnAsked: 0, question: null, answers: {}, phaseStartedAt: serverNow() };
}

/** The asker's question (in voice mode the text is empty: it was said out loud). */
export function ask(roomId: string, expectedTurn: number, by: string, text: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.turnNo !== expectedTurn || s.turn !== by || s.question) return null;
    return { ...s, question: { by, text: text.trim().slice(0, MAX_QUESTION), at: Math.round(serverNow()) }, answers: {}, phaseStartedAt: serverNow() };
  });
}

function resolveQuestion(s: QuienState): QuienState {
  if (!s.question) return s;
  const t = tallyAnswers(s.answers);
  const by = s.question.by;
  const next: QuienState = {
    ...s,
    log: [...s.log, { by, text: s.question.text, ...t }],
    asked: { ...s.asked, [by]: (s.asked[by] ?? 0) + 1 },
    turnAsked: s.turnAsked + 1,
    question: null,
    answers: {},
    phaseStartedAt: serverNow(),
  };
  // A "no" (more no than yes) or the turn's limit: the next one asks.
  return t.no > t.si || next.turnAsked >= MAX_PER_TURN ? passTurnFrom(next) : next;
}

/** Someone's answer (they can change it until it closes). With `needed` answers (the connected others) it closes. */
export function answer(roomId: string, expectedTurn: number, voter: string, a: Answer, needed: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.turnNo !== expectedTurn || !s.question || voter === s.question.by || !s.order.includes(voter) || s.answers[voter] === a) return null;
    const next = { ...s, answers: { ...s.answers, [voter]: a } };
    return Object.keys(next.answers).length >= needed ? resolveQuestion(next) : next;
  });
}

/** Time's up for the answers (or the asker closes it): it counts with the ones there are. */
export function closeQuestion(roomId: string, expectedTurn: number, askedAt: number) {
  return mutate(roomId, (s) => (s.status === "playing" && s.turnNo === expectedTurn && s.question?.at === askedAt ? resolveQuestion(s) : null));
}

/** The guess of whoever's turn it is; `ok` is checked by the caller with `guessMatches`. */
export function guess(roomId: string, expectedTurn: number, by: string, text: string, ok: boolean) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.turnNo !== expectedTurn || s.turn !== by || s.question) return null;
    const lastGuess = { by, text: text.trim().slice(0, MAX_CHARACTER), ok, at: Math.round(serverNow()) };
    if (!ok) return passTurnFrom({ ...s, misses: { ...s.misses, [by]: (s.misses[by] ?? 0) + 1 }, lastGuess });
    const q = s.asked[by] ?? 0;
    const pts = pointsFor(q, s.misses[by] ?? 0);
    return passTurnFrom({
      ...s,
      lastGuess,
      done: { ...s.done, [by]: { how: "guessed", q, pts, at: Math.round(serverNow()) } },
      scores: { ...s.scores, [by]: (s.scores[by] ?? 0) + pts },
    });
  });
}

/** Ends your turn without asking more. */
export function passTurn(roomId: string, expectedTurn: number, by: string) {
  return mutate(roomId, (s) => (s.status === "playing" && s.turnNo === expectedTurn && s.turn === by && !s.question ? passTurnFrom(s) : null));
}

/** I give up: my character is shown and I get no points. */
export function giveUp(roomId: string, expectedRound: number, id: string) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.roundNo !== expectedRound || !s.order.includes(id) || s.done[id]) return null;
    const next: QuienState = { ...s, done: { ...s.done, [id]: { how: "gave", q: s.asked[id] ?? 0, pts: 0, at: Math.round(serverNow()) } } };
    if (s.turn !== id) return next;
    return passTurnFrom({ ...next, question: null, answers: {} });
  });
}

/**
 * Whoever's turn it is left: skip them. If everyone still guessing is gone
 * (`absent`), they give up and the round ends.
 */
export function skipAbsent(roomId: string, expectedTurn: number, absent: string[]) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.turnNo !== expectedTurn || !absent.includes(s.turn)) return null;
    const left = playingNow(s);
    if (left.every((id) => absent.includes(id))) {
      const done = { ...s.done };
      for (const id of left) done[id] = { how: "gave", q: s.asked[id] ?? 0, pts: 0, at: Math.round(serverNow()) };
      return { ...s, done, status: "finished", turn: "", question: null, answers: {}, phaseStartedAt: serverNow() };
    }
    return passTurnFrom(s);
  });
}
