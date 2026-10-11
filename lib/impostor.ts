import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { makeSeed, mulberry32, seededShuffle } from "./random";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { levenshtein, normalizeText } from "./text";
import { IMPOSTOR_CATEGORIES, type ImpostorCategory } from "./impostorWords";

/**
 * El impostor. Everyone in the round gets the same secret word except one
 * player, the impostor. They take turns giving a one-word clue (in the app,
 * or out loud), then vote who the impostor is. If they catch them, the
 * impostor still wins by guessing the word.
 *
 * The word derives from the round's `seed`; the impostor is stored in the
 * state. Both are readable with DevTools — accepted, there is no backend.
 */

export const MIN_PLAYERS = 3;
export const CLUE_ROUND_OPTIONS = [1, 2, 3] as const;
export const CLUE_SECONDS = 45;
export const VOTE_SECONDS = 60;
export const GUESS_SECONDS = 30;
export const MAX_CLUE_LENGTH = 30;
/** Points: every crew member when the crew wins; the impostor when they win. */
export const CREW_POINTS = 1;
export const IMPOSTOR_POINTS = 2;

export type ClueMode = "app" | "voz";

export interface ImpostorMeta {
  game: "impostor";
  /** Who created the room: starts the game (anyone can if they're away). */
  hostId?: string;
  categories: ImpostorCategory[];
  clueMode: ClueMode;
  /** Times each player gives a clue before voting (app mode). */
  clueRounds: number;
  /** The impostor sees the word's category. */
  impostorHint: boolean;
  createdAt: number | object;
}

export type ImpostorStatus = "waiting" | "clues" | "voting" | "guess" | "result";

export interface ImpostorPlayer {
  name: string;
  color: string;
}

export interface Clue {
  by: string;
  /** "" if they ran out of time or weren't there. */
  text: string;
}

export type Outcome = "" | "crew" | "impostor";
/** How the round ended: impostor caught and missed the word / guessed it, or votes went to someone else / tied. */
export type EndReason = "" | "caught" | "guessed" | "wrong" | "tie";

export interface ImpostorState {
  status: ImpostorStatus;
  seed: number;
  roundNo: number;
  phaseStartedAt: number;
  players: Record<string, ImpostorPlayer>;
  /** This round's players, in speaking order. Whoever joins later watches until the next round. */
  order: string[];
  impostor: string;
  /** Clues given so far (app mode); clue `n` is by `order[n % order.length]`. */
  clues: Clue[];
  /** voter → who they think is the impostor. */
  votes: Record<string, string>;
  /** Most voted, if there was a single one. */
  accused: string;
  guess: string;
  outcome: Outcome;
  endReason: EndReason;
  scores: Record<string, number>;
}

function normalizeState(raw: Partial<ImpostorState> | null): ImpostorState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    seed: raw.seed ?? 0,
    roundNo: raw.roundNo ?? 0,
    phaseStartedAt: raw.phaseStartedAt ?? 0,
    players: raw.players ?? {},
    order: raw.order ?? [],
    impostor: raw.impostor ?? "",
    clues: (raw.clues ?? []).map((c) => ({ by: c?.by ?? "", text: c?.text ?? "" })),
    votes: raw.votes ?? {},
    accused: raw.accused ?? "",
    guess: raw.guess ?? "",
    outcome: raw.outcome ?? "",
    endReason: raw.endReason ?? "",
    scores: raw.scores ?? {},
  };
}

export function normalizeMeta(
  raw: Partial<ImpostorMeta>
): Pick<ImpostorMeta, "categories" | "clueMode" | "clueRounds" | "impostorHint"> {
  return {
    categories: raw.categories?.length ? raw.categories : IMPOSTOR_CATEGORIES.map((c) => c.id),
    clueMode: raw.clueMode ?? "app",
    clueRounds: raw.clueRounds ?? 2,
    impostorHint: raw.impostorHint ?? true,
  };
}

/** The round's secret word and its category. */
export function secretFor(seed: number, categories: ImpostorCategory[]): { word: string; category: string; emoji: string } {
  const rand = mulberry32(seed);
  const allowed = IMPOSTOR_CATEGORIES.filter((c) => categories.includes(c.id));
  const cat = allowed[Math.floor(rand() * allowed.length)] ?? IMPOSTOR_CATEGORIES[0];
  return { word: cat.words[Math.floor(rand() * cat.words.length)], category: cat.label, emoji: cat.emoji };
}

/** The impostor's guess counts with a typo or two on long words. */
export function guessMatches(guess: string, word: string): boolean {
  const g = normalizeText(guess);
  const w = normalizeText(word);
  if (!g) return false;
  if (g === w) return true;
  return w.length >= 5 && levenshtein(g, w) <= (w.length >= 8 ? 2 : 1);
}

/** A clue can't be (or contain) the secret word. */
export function clueProblem(clue: string, word: string): string | null {
  const c = normalizeText(clue);
  if (!c) return "Escribí una pista.";
  const w = normalizeText(word);
  if (c === w || (w.length >= 4 && c.includes(w))) return "¡No vale decir la palabra!";
  return null;
}

export function speakerFor(state: Pick<ImpostorState, "order">, clueNo: number): string {
  return state.order.length ? state.order[clueNo % state.order.length] : "";
}

/** Votes per accused player, most voted first. */
export function tally(votes: Record<string, string>): [string, number][] {
  const counts = new Map<string, number>();
  for (const target of Object.values(votes)) counts.set(target, (counts.get(target) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/impostor/state`;

function mutate(roomId: string, fn: (state: ImpostorState) => ImpostorState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createImpostorRoom(
  params: { categories: ImpostorCategory[]; clueMode: ClueMode; clueRounds: number; impostorHint: boolean },
  hostId: string
): Promise<string> {
  const roomId = generateRoomCode();
  const meta: ImpostorMeta = { game: "impostor", hostId, ...params, createdAt: serverTimestamp() };
  const state: Partial<ImpostorState> = { status: "waiting", seed: makeSeed(), roundNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getImpostorMeta(roomId: string): Promise<Partial<ImpostorMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeImpostor(roomId: string, cb: (state: ImpostorState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinImpostor(roomId: string, clientId: string, player: ImpostorPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

function newRound(s: ImpostorState, participants: string[], seed: number, roundNo: number): ImpostorState {
  const order = seededShuffle(participants, seed);
  const impostor = order[Math.floor(Math.random() * order.length)];
  const scores = { ...s.scores };
  for (const id of order) scores[id] = scores[id] ?? 0;
  return {
    ...s,
    status: "clues",
    seed,
    roundNo,
    phaseStartedAt: serverNow(),
    order,
    impostor,
    clues: [],
    votes: {},
    accused: "",
    guess: "",
    outcome: "",
    endReason: "",
    scores,
  };
}

/** Deals the first round to `participants` (the connected players). */
export function startImpostor(roomId: string, participants: string[]) {
  return mutate(roomId, (s) => {
    const ids = participants.filter((id) => s.players[id]);
    if (s.status !== "waiting" || ids.length < MIN_PLAYERS) return null;
    return newRound(s, ids, s.seed, s.roundNo);
  });
}

/** A new word and impostor for whoever is connected now; scores are kept. */
export function nextRound(roomId: string, expectedRound: number, participants: string[]) {
  return mutate(roomId, (s) => {
    const ids = participants.filter((id) => s.players[id]);
    if (s.status !== "result" || s.roundNo !== expectedRound || ids.length < MIN_PLAYERS) return null;
    return newRound(s, ids, makeSeed(), s.roundNo + 1);
  });
}

function toVoting(s: ImpostorState): ImpostorState {
  return { ...s, status: "voting", phaseStartedAt: serverNow(), votes: {} };
}

/**
 * Records the clue of whoever's turn it is (`expectedClue` = how many clues
 * were given), or an empty one if `text` is "" (time's up or they left).
 * After the last clue, voting starts.
 */
export function giveClue(roomId: string, expectedClue: number, by: string, text: string, totalClues: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "clues" || s.clues.length !== expectedClue || speakerFor(s, expectedClue) !== by) return null;
    const clues = [...s.clues, { by, text: text.trim().slice(0, MAX_CLUE_LENGTH) }];
    const next = { ...s, clues, phaseStartedAt: serverNow() };
    return clues.length >= totalClues ? toVoting(next) : next;
  });
}

/** Clues said out loud (or enough clues): anyone in the round moves on to the vote. */
export function goToVote(roomId: string, expectedRound: number, clientId: string) {
  return mutate(roomId, (s) =>
    s.status === "clues" && s.roundNo === expectedRound && s.order.includes(clientId) ? toVoting(s) : null
  );
}

function resolve(s: ImpostorState): ImpostorState {
  const [first, second] = tally(s.votes);
  const now = serverNow();
  if (!first || (second && second[1] === first[1])) return finish({ ...s, accused: "" }, "impostor", "tie");
  const accused = first[0];
  if (accused !== s.impostor) return finish({ ...s, accused }, "impostor", "wrong");
  return { ...s, accused, status: "guess", phaseStartedAt: now };
}

function finish(s: ImpostorState, outcome: Outcome, endReason: EndReason): ImpostorState {
  const scores = { ...s.scores };
  if (outcome === "impostor") scores[s.impostor] = (scores[s.impostor] ?? 0) + IMPOSTOR_POINTS;
  else for (const id of s.order) if (id !== s.impostor) scores[id] = (scores[id] ?? 0) + CREW_POINTS;
  return { ...s, status: "result", outcome, endReason, scores, phaseStartedAt: serverNow() };
}

/**
 * My vote (it can change until the vote closes). When `votersNeeded` players
 * (the connected ones in the round) have voted, it's resolved.
 */
export function castVote(roomId: string, expectedRound: number, voter: string, target: string, votersNeeded: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "voting" || s.roundNo !== expectedRound) return null;
    if (!s.order.includes(voter) || !s.order.includes(target) || voter === target || s.votes[voter] === target) return null;
    const next = { ...s, votes: { ...s.votes, [voter]: target } };
    return Object.keys(next.votes).length >= votersNeeded ? resolve(next) : next;
  });
}

/** Time's up for the vote: resolve with the votes there are. */
export function closeVote(roomId: string, expectedRound: number) {
  return mutate(roomId, (s) => (s.status === "voting" && s.roundNo === expectedRound ? resolve(s) : null));
}

/** The caught impostor's last chance; `correct` is checked by the caller with `guessMatches`. */
export function submitGuess(roomId: string, expectedRound: number, clientId: string, guess: string, correct: boolean) {
  return mutate(roomId, (s) => {
    if (s.status !== "guess" || s.roundNo !== expectedRound || s.impostor !== clientId) return null;
    const next = { ...s, guess: guess.trim().slice(0, MAX_CLUE_LENGTH) };
    return correct ? finish(next, "impostor", "guessed") : finish(next, "crew", "caught");
  });
}

/** The impostor ran out of time (or left) without guessing. */
export function guessTimeout(roomId: string, expectedRound: number) {
  return mutate(roomId, (s) =>
    s.status === "guess" && s.roundNo === expectedRound ? finish(s, "crew", "caught") : null
  );
}
