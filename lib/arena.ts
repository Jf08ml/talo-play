import { ref, get, onDisconnect, onValue, push, remove, runTransaction, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { makeSeed } from "./random";
import type { TeamId } from "./teams";
import type { ArenaItem, Strike } from "./arenaSim";
import {
  ONLINE_MAX_PEOPLE,
  ONLINE_NEXT_MS,
  chooseTeamState,
  envHitState,
  eventItemsState,
  fallState,
  forfeitState,
  hillTickState,
  joinState,
  nextOnlineState,
  nextRoundState,
  normalizeState,
  pickItemState,
  regenerateState,
  respawnItemsState,
  respawnState,
  shuffleState,
  spendSpecialState,
  startMatchState,
  strikeState,
  timeoutState,
  type ArenaMeta,
  type ArenaPlayer,
  type ArenaSettings,
  type ArenaState,
  type ArenaPose,
  type ArenaArrow,
} from "./arenaRules";

export * from "./arenaRules";

/**
 * Arena medieval: knights in a 3D arena, by teams, each for themselves, on a
 * hill or against waves of bots (lib/arenaRules.ts has the state and its
 * rules; lib/arenaMaps.ts the maps and events). There's no host simulating
 * the fight:
 *
 * - Each phone runs its own fighter (`lib/arenaSim.ts`) and publishes its
 *   pose at `arena/poses/{fighterId}` (~15 Hz, removed on disconnect).
 * - Whoever swings decides what it hits, from the poses it sees, and writes
 *   the damage with `strike` (a transaction on `arena/state`). The target's
 *   phone notices `hits[itself]` and flinches or loses stamina. Kicks and
 *   specials work the same way. A perfect parry is decided by the attacker
 *   too: the pose says when the target's block started (`bt`), so a block
 *   raised just before the blow is a parry — the attacker's own fighter
 *   reels, and the target sees `pr` in its hit.
 * - The map's damage (traps, the arrow rain, the closing ring, falling off
 *   the bridge) is written by whoever runs the fighter it hurts (its phone,
 *   or the bot host / big screen for bots), once per source and tick
 *   (`envHit`, `fallOff`), so it never lands twice.
 * - The special meter (`special`) fills inside `strike` (hits landed,
 *   blocks, parries) and is spent with `spendSpecial` when a special starts.
 * - Arrows: the shooter's phone flies its arrow and decides the hit; the
 *   others draw it from `arena/arrows` (launch point, velocity and time).
 * - Bots are fighters too ("bot0"…): the bot host (the connected player with
 *   the lowest id) simulates them and writes for them; another takes over if
 *   it leaves, from their last poses.
 *
 * Health, gear, the weapons on the floor, scores and the round flow live in
 * `arena/state` and only change by transaction, guarded by `gameNo` and
 * `round`. A fighter whose player left counts as fallen (`forfeit`).
 */

// ---- Firebase ------------------------------------------------------------

const base = (roomId: string) => `rooms/${roomId}/arena`;
const statePath = (roomId: string) => `${base(roomId)}/state`;

function mutate(roomId: string, fn: (state: ArenaState) => ArenaState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createArenaRoom(hostId: string, settings: ArenaSettings): Promise<string> {
  const roomId = generateRoomCode();
  const meta: ArenaMeta = { game: "arena", hostId, ...settings, createdAt: serverTimestamp() };
  const state: Partial<ArenaState> = { status: "waiting", gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getArenaMeta(roomId: string): Promise<Partial<ArenaMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeArena(roomId: string, cb: (state: ArenaState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

type Capacity = Pick<ArenaMeta, "mode" | "size" | "ffa">;

/** Registers the player and, before the match, puts them on a team with room. */
export function joinArena(roomId: string, clientId: string, player: ArenaPlayer, meta: Capacity) {
  return mutate(roomId, (s) => joinState(s, clientId, player, meta));
}

/** Picks a team (null = just watch), while waiting, if it has room. */
export function chooseTeam(roomId: string, clientId: string, team: TeamId | null, meta: Capacity) {
  return mutate(roomId, (s) => chooseTeamState(s, clientId, team, meta));
}

/** Everyone connected, split into two even teams at random. */
export function shuffleTeams(roomId: string, connected: string[], size: number) {
  return mutate(roomId, (s) => shuffleState(s, connected, size));
}

export function startMatch(roomId: string, settings: ArenaSettings, connected: string[]) {
  const seed = makeSeed();
  return mutate(roomId, (s) => startMatchState(s, settings, connected, serverNow(), seed));
}

export function strike(roomId: string, key: number, attacker: string, attackerAt: { x: number; z: number }, strikes: (Strike & { x: number; z: number })[], ranged = false) {
  return mutate(roomId, (s) => strikeState(s, key, attacker, attackerAt, strikes, ranged, serverNow()));
}

export function spendSpecial(roomId: string, key: number, id: string) {
  return mutate(roomId, (s) => spendSpecialState(s, key, id, serverNow()));
}

export function forfeit(roomId: string, key: number, id: string, x: number, z: number) {
  return mutate(roomId, (s) => forfeitState(s, key, id, x, z, serverNow()));
}

/** Map damage on `id` (by whoever runs it): once per source and tick. */
export function envHit(roomId: string, key: number, id: string, src: string, tag: number, damage: number, x: number, z: number) {
  return mutate(roomId, (s) => envHitState(s, key, id, src, tag, damage, x, z, serverNow()));
}

/** `id` fell off the map (by whoever runs it). */
export function fallOff(roomId: string, key: number, id: string) {
  return mutate(roomId, (s) => fallState(s, key, id, serverNow()));
}

/** «Rey»: `id` gets up again (by whoever runs it). */
export function respawnFighter(roomId: string, key: number, id: string) {
  return mutate(roomId, (s) => respawnState(s, key, id, serverNow()));
}

/** «Rey»: a second on the hill for `holder`. */
export function hillTick(roomId: string, key: number, sec: number, holder: string) {
  return mutate(roomId, (s) => hillTickState(s, key, sec, holder, serverNow()));
}

/** «La tribuna tira armas»: event `n`'s weapons land (any client; once). */
export function dropEventItems(roomId: string, key: number, n: number, items: Record<string, ArenaItem>) {
  return mutate(roomId, (s) => eventItemsState(s, key, n, items, serverNow()));
}

export function pickItem(roomId: string, key: number, id: string, itemId: string, x: number, z: number) {
  return mutate(roomId, (s) => pickItemState(s, key, id, itemId, x, z, serverNow()));
}

export function respawnItems(roomId: string, key: number) {
  return mutate(roomId, (s) => respawnItemsState(s, key, serverNow()));
}

export function regenerate(roomId: string, key: number, id: string) {
  return mutate(roomId, (s) => regenerateState(s, key, id, serverNow()));
}

export function timeoutRound(roomId: string, key: number) {
  return mutate(roomId, (s) => timeoutState(s, key, serverNow()));
}

export function nextRound(roomId: string, key: number) {
  return mutate(roomId, (s) => nextRoundState(s, key, serverNow(), ONLINE_NEXT_MS));
}

/** Back to the waiting room (to change teams), also to leave a match halfway. */
export function backToWaiting(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) =>
    s.status !== "waiting" && s.gameNo === expectedGame ? { ...s, status: "waiting", roster: {}, bots: {} } : null
  );
}

// ---- Poses and arrows --------------------------------------------------------------

/** A pose this client writes; people's are removed when they disconnect, bots' stay for the next bot host. */
export function openPose(roomId: string, fighterId: string, owned: boolean) {
  const r = ref(getDb(), `${base(roomId)}/poses/${fighterId}`);
  if (owned) onDisconnect(r).remove().catch(console.error);
  return {
    send: (pose: ArenaPose) => set(r, pose).catch(console.error),
    close: () => {
      if (!owned) return;
      onDisconnect(r).cancel().catch(console.error);
      remove(r).catch(console.error);
    },
  };
}

/** A bot that left the match (a past wave): its pose goes too (the bot host does it). */
export function dropPose(roomId: string, fighterId: string) {
  remove(ref(getDb(), `${base(roomId)}/poses/${fighterId}`)).catch(console.error);
}

export function subscribePoses(roomId: string, cb: (poses: Record<string, ArenaPose>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/poses`), (snap) => cb(snap.val() ?? {}));
}

/** Publishes an arrow; returns a function that takes it down (when it lands or hits). */
export function shootArrow(roomId: string, arrow: ArenaArrow): () => void {
  const r = push(ref(getDb(), `${base(roomId)}/arrows`));
  onDisconnect(r).remove().catch(console.error);
  set(r, arrow).catch(console.error);
  return () => {
    onDisconnect(r).cancel().catch(console.error);
    remove(r).catch(console.error);
  };
}

export function subscribeArrows(roomId: string, cb: (arrows: Record<string, ArenaArrow>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/arrows`), (snap) => cb(snap.val() ?? {}));
}

// ---- Big screen: the phones' pads -----------------------------------------------

/**
 * A phone's pad on the big screen (`arena/input/{clientId}`): the stick
 * (x strafe, y forward, −1…1), the look dragged so far (`lx`/`ly`, radians,
 * accumulated), the buttons held (attack, block) and presses counted (jump,
 * dodge, pick up, kick `k`, special `s`), so a tap between two samples is
 * never lost. The screen turns it into a fighter's input (`lib/arenaPad.ts`).
 */
export interface ArenaPad {
  x: number;
  y: number;
  lx: number;
  ly: number;
  a: number;
  b: number;
  j: number;
  d: number;
  p: number;
  /** Absent on older phones. */
  k?: number;
  s?: number;
  /** Gestures asked for so far, and which one the last was (`EMOTES` index + 1). Absent on older phones. */
  e?: number;
  ek?: number;
}

export const NO_PAD: ArenaPad = { x: 0, y: 0, lx: 0, ly: 0, a: 0, b: 0, j: 0, d: 0, p: 0, k: 0, s: 0, e: 0, ek: 0 };

/** Where my pad goes; it's removed when the phone disconnects. */
export function openPad(roomId: string, clientId: string) {
  const r = ref(getDb(), `${base(roomId)}/input/${clientId}`);
  onDisconnect(r).remove().catch(console.error);
  return {
    send: (pad: ArenaPad) => set(r, pad).catch(console.error),
    close: () => {
      onDisconnect(r).cancel().catch(console.error);
      remove(r).catch(console.error);
    },
  };
}

export function subscribePads(roomId: string, cb: (pads: Record<string, ArenaPad>) => void): Unsubscribe {
  return onValue(ref(getDb(), `${base(roomId)}/input`), (snap) => cb(snap.val() ?? {}));
}

// ---- Online: public arenas ---------------------------------------------------------

/**
 * Public arenas (codes with a 1, which `generateRoomCode` never makes): you
 * enter and fight. Matches chain by themselves (`nextOnlineMatch`, called by
 * whoever is there once `nextAt` passes): the people present split into two
 * even teams, at least 2 against 2, and bots fill the places — named like
 * people and never labelled as bots. Latecomers watch until the next match.
 */
export const ONLINE_WORLDS = ["ARENA1", "ARENA2", "ARENA3", "ARENA4"];

async function ensureWorld(roomId: string) {
  const db = getDb();
  await runTransaction(ref(db, `rooms/${roomId}/meta`), (cur: Partial<ArenaMeta> | null) =>
    cur ? undefined : { game: "arena", size: 2, wins: 2, bots: true, potions: true, regen: false, view: "telefono", mode: "equipos", map: "azar", events: true, ffa: 4, online: true, createdAt: serverNow() }
  );
  await runTransaction(ref(db, statePath(roomId)), (cur: Partial<ArenaState> | null) =>
    cur ? undefined : { status: "waiting", online: true, gameNo: 0, nextAt: 0 }
  );
}

async function worldCrowds() {
  const db = getDb();
  return Promise.all(ONLINE_WORLDS.map(async (id) => ({ id, people: (await get(ref(db, `rooms/${id}/presence`))).size })));
}

export async function onlineCount(): Promise<number> {
  return (await worldCrowds()).reduce((s, w) => s + w.people, 0);
}

/** The busiest public arena with room (created if it was cleaned up); its code. */
export async function enterOnline(): Promise<string> {
  const crowds = await worldCrowds();
  const open = crowds.filter((w) => w.people < ONLINE_MAX_PEOPLE).sort((a, b) => b.people - a.people);
  const id = open[0]?.id ?? ONLINE_WORLDS[0];
  await ensureWorld(id);
  return id;
}

/** The next match of a public arena, with the people `connected` now (mode and map at random). */
export function nextOnlineMatch(roomId: string, connected: string[]) {
  const seed = makeSeed();
  return mutate(roomId, (s) => nextOnlineState(s, connected, serverNow(), seed));
}
