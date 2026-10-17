import { ref, get, onDisconnect, onValue, push, remove, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { serverNow } from "./serverTime";
import { transactState } from "./transact";
import { makeSeed } from "./random";
import { TEAMS, type TeamId } from "./teams";
import { BOT_NAMES, MAX_HP, START_GEAR, roundItems, type ArenaItem, type Gear, type ItemKind, type Strike } from "./arenaSim";

/**
 * Arena medieval: red against blue, 1v1 to 3v3, best of 3 or 5 rounds; each
 * round is to the last one standing. There's no host simulating the fight:
 *
 * - Each phone runs its own fighter (`lib/arenaSim.ts`) and publishes its
 *   pose at `arena/poses/{fighterId}` (~15 Hz, removed on disconnect).
 * - Whoever swings decides what it hits, from the poses it sees, and writes
 *   the damage with `strike` (a transaction on `arena/state`). The target's
 *   phone notices `hits[itself]` and flinches or loses stamina.
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

export const COUNTDOWN_MS = 3500;
/** A round with nobody winning ends on time: the team with more health left wins it. */
export const ROUND_SECONDS = 150;
/** How long the round's result stays on screen. */
export const ROUND_END_MS = 4500;
export const SIZE_OPTIONS = [1, 2, 3] as const;
/** Rounds to win the match: best of 3 or 5. */
export const WINS_OPTIONS = [2, 3] as const;

export type ArenaStatus = "waiting" | "fighting" | "roundEnd" | "finished";

export interface ArenaMeta {
  game: "arena";
  hostId?: string;
  /** Fighters per team. */
  size: number;
  /** Rounds to win. */
  wins: number;
  /** Fill empty places with bots. */
  bots: boolean;
  createdAt: number | object;
}

export interface ArenaPlayer {
  name: string;
  color: string;
}

/** The last hit a fighter took, for its own phone to react (`n` counts them). */
export interface HitNote {
  n: number;
  from: string;
  /** Blocked, and the stamina it costs. */
  b: boolean;
  d: number;
  /** Where the attacker was (pushes the target away from there). */
  x: number;
  z: number;
}

export interface ArenaState {
  status: ArenaStatus;
  gameNo: number;
  round: number;
  /** Per match: lays out the weapons of each round. */
  seed: number;
  /** Rounds needed to win this match. */
  need: number;
  players: Record<string, ArenaPlayer>;
  /** Team each person picked in the waiting room (absent = watching). */
  teams: Record<string, TeamId>;
  /** Fighters of this match (people and bots) and their team. */
  roster: Record<string, TeamId>;
  /** Bot names, by fighter id. */
  bots: Record<string, string>;
  /** Server time the round's fight starts (after the countdown). */
  startedAt: number;
  hp: Record<string, number>;
  gear: Record<string, Gear>;
  items: Record<string, ArenaItem>;
  itemSeq: number;
  hits: Record<string, HitNote>;
  score: Record<TeamId, number>;
  roundWinner: TeamId | "draw" | "";
  roundEndedAt: number;
  winner: TeamId | "";
  /** This match's knockouts per fighter. */
  kills: Record<string, number>;
  /** Matches won per person. */
  wins: Record<string, number>;
}

/** A fighter's pose, written by whoever runs it. */
export interface ArenaPose {
  /** Round it belongs to (`roundKey`). */
  k: number;
  x: number;
  y: number;
  z: number;
  yw: number;
  pt: number;
  /** Act index (`ACTS`), the server time it started and how long it lasts, blocking, bow draw, walking speed. */
  a: number;
  at: number;
  al: number;
  b: number;
  dr: number;
  sp: number;
  /** Server time of the sample. */
  t: number;
}

/** An arrow in flight, for everyone else to draw. */
export interface ArenaArrow {
  k: number;
  o: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Server time it left the bow. */
  t: number;
}

export function roundKey(state: Pick<ArenaState, "gameNo" | "round">): number {
  return state.gameNo * 1000 + state.round;
}

export function normalizeMeta(raw: Partial<ArenaMeta>): ArenaMeta {
  return {
    game: "arena",
    hostId: raw.hostId,
    size: Math.max(1, Math.min(3, raw.size ?? 1)),
    wins: raw.wins === 3 ? 3 : 2,
    bots: raw.bots ?? true,
    createdAt: raw.createdAt ?? 0,
  };
}

function normalizeGear(raw: Partial<Gear> | undefined): Gear {
  return { w: raw?.w ?? START_GEAR.w, sh: !!raw?.sh };
}

function normalizeState(raw: Partial<ArenaState> | null): ArenaState | null {
  if (!raw || !raw.status) return null;
  const gear: Record<string, Gear> = {};
  for (const [id, g] of Object.entries(raw.gear ?? {})) gear[id] = normalizeGear(g);
  return {
    status: raw.status,
    gameNo: raw.gameNo ?? 0,
    round: raw.round ?? 0,
    seed: raw.seed ?? 0,
    need: raw.need ?? 2,
    players: raw.players ?? {},
    teams: raw.teams ?? {},
    roster: raw.roster ?? {},
    bots: raw.bots ?? {},
    startedAt: raw.startedAt ?? 0,
    hp: raw.hp ?? {},
    gear,
    items: raw.items ?? {},
    itemSeq: raw.itemSeq ?? 0,
    hits: raw.hits ?? {},
    score: { red: raw.score?.red ?? 0, blue: raw.score?.blue ?? 0 },
    roundWinner: raw.roundWinner ?? "",
    roundEndedAt: raw.roundEndedAt ?? 0,
    winner: raw.winner ?? "",
    kills: raw.kills ?? {},
    wins: raw.wins ?? {},
  };
}

export const isBot = (id: string) => id.startsWith("bot");

export function fighterName(state: ArenaState, id: string, myId = ""): string {
  if (id === myId) return "Vos";
  return state.bots[id] ?? state.players[id]?.name ?? "Caballero";
}

/** A team's fighters, people first, in a fixed order (it decides where each one starts). */
export function teamFighters(state: Pick<ArenaState, "roster">, team: TeamId): string[] {
  return Object.keys(state.roster)
    .filter((id) => state.roster[id] === team)
    .sort((a, b) => Number(isBot(a)) - Number(isBot(b)) || a.localeCompare(b));
}

export function alive(state: ArenaState, id: string): boolean {
  return id in state.roster && (state.hp[id] ?? 0) > 0;
}

export const teamInfo = (id: TeamId) => TEAMS.find((t) => t.id === id)!;

// ---- Firebase ------------------------------------------------------------

const base = (roomId: string) => `rooms/${roomId}/arena`;
const statePath = (roomId: string) => `${base(roomId)}/state`;

function mutate(roomId: string, fn: (state: ArenaState) => ArenaState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createArenaRoom(hostId: string, settings: { size: number; wins: number; bots: boolean }): Promise<string> {
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

function teamCount(s: ArenaState, team: TeamId): number {
  return Object.values(s.teams).filter((t) => t === team).length;
}

/** Registers the player and, before the match, puts them on the team with fewer people (if there's room). */
export function joinArena(roomId: string, clientId: string, player: ArenaPlayer, size: number) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    const red = teamCount(s, "red");
    const blue = teamCount(s, "blue");
    const team: TeamId | null = red <= blue ? (red < size ? "red" : null) : blue < size ? "blue" : null;
    const assign = s.status === "waiting" && !s.teams[clientId] && !known && team;
    if (!assign && known?.name === player.name && known?.color === player.color) return null;
    return {
      ...s,
      players: { ...s.players, [clientId]: player },
      teams: assign ? { ...s.teams, [clientId]: team } : s.teams,
    };
  });
}

/** Picks a team (null = just watch), while waiting, if it has room. */
export function chooseTeam(roomId: string, clientId: string, team: TeamId | null, size: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting" || s.teams[clientId] === (team ?? undefined)) return null;
    if (team && teamCount(s, team) >= size) return null;
    const teams = { ...s.teams };
    if (team) teams[clientId] = team;
    else delete teams[clientId];
    return { ...s, teams };
  });
}

/** Everyone connected, split into two even teams at random. */
export function shuffleTeams(roomId: string, connected: string[], size: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting") return null;
    const ids = connected.filter((id) => s.players[id]).sort(() => Math.random() - 0.5).slice(0, size * 2);
    const teams: Record<string, TeamId> = {};
    ids.forEach((id, i) => (teams[id] = i % 2 ? "blue" : "red"));
    return { ...s, teams };
  });
}

function setupRound(s: ArenaState, round: number): ArenaState {
  const hp: Record<string, number> = {};
  const gear: Record<string, Gear> = {};
  for (const id of Object.keys(s.roster)) {
    hp[id] = MAX_HP;
    gear[id] = { ...START_GEAR };
  }
  return {
    ...s,
    status: "fighting",
    round,
    startedAt: serverNow() + COUNTDOWN_MS,
    hp,
    gear,
    items: roundItems(s.seed, round),
    itemSeq: 0,
    hits: {},
    roundWinner: "",
    roundEndedAt: 0,
  };
}

/**
 * Starts a match with the connected people on each team (at most `size`
 * each), plus bots to fill the places when `bots` is on. Each team needs
 * somebody, and at least one person has to fight.
 */
export function startMatch(roomId: string, settings: { size: number; wins: number; bots: boolean }, connected: string[]) {
  return mutate(roomId, (s) => {
    if (s.status !== "waiting" && s.status !== "finished") return null;
    const roster: Record<string, TeamId> = {};
    const bots: Record<string, string> = {};
    let botNo = 0;
    for (const team of ["red", "blue"] as TeamId[]) {
      const people = Object.keys(s.teams)
        .filter((id) => s.teams[id] === team && connected.includes(id))
        .slice(0, settings.size);
      for (const id of people) roster[id] = team;
      if (settings.bots) {
        for (let k = people.length; k < settings.size; k++) {
          const id = `bot${botNo}`;
          bots[id] = BOT_NAMES[botNo % BOT_NAMES.length];
          roster[id] = team;
          botNo++;
        }
      }
    }
    const ids = Object.keys(roster);
    const people = ids.filter((id) => !isBot(id));
    if (!people.length || !ids.some((id) => roster[id] === "red") || !ids.some((id) => roster[id] === "blue")) return null;
    const next: ArenaState = {
      ...s,
      gameNo: s.gameNo + 1,
      seed: makeSeed(),
      need: settings.wins,
      roster,
      bots,
      score: { red: 0, blue: 0 },
      kills: {},
      winner: "",
    };
    return setupRound(next, 1);
  });
}

/** Whether a team is still standing; when one isn't, the round goes to the other. */
function checkRoundEnd(s: ArenaState): ArenaState {
  if (s.status !== "fighting") return s;
  const standing = (team: TeamId) => Object.keys(s.roster).some((id) => s.roster[id] === team && (s.hp[id] ?? 0) > 0);
  const red = standing("red");
  const blue = standing("blue");
  if (red && blue) return s;
  return endRound(s, red ? "red" : blue ? "blue" : "draw");
}

function endRound(s: ArenaState, winner: TeamId | "draw"): ArenaState {
  const score = { ...s.score };
  if (winner !== "draw") score[winner] += 1;
  return { ...s, status: "roundEnd", roundWinner: winner, roundEndedAt: serverNow(), score };
}

/** Drops what a fallen (or switching) fighter carried as items at (x, z). */
function dropGear(s: ArenaState, items: Record<string, ArenaItem>, gear: Gear, x: number, z: number): number {
  let seq = s.itemSeq;
  const drop = (kind: ItemKind, dx: number) => {
    items[`d${seq++}`] = { kind, x: Math.round((x + dx) * 100) / 100, z: Math.round(z * 100) / 100 };
  };
  if (gear.w !== "daga") drop(gear.w, -0.4);
  if (gear.sh) drop("escudo", 0.4);
  return seq;
}

function inRound(s: ArenaState, key: number): boolean {
  return s.status === "fighting" && roundKey(s) === key && serverNow() >= s.startedAt - 300;
}

/**
 * `attacker`'s swing (or arrow) hit these targets. Each one must still be
 * standing and on the other team; `where` is where each target was (to drop
 * its weapons if it falls).
 */
export function strike(
  roomId: string,
  key: number,
  attacker: string,
  attackerAt: { x: number; z: number },
  strikes: (Strike & { x: number; z: number })[],
  ranged = false
) {
  return mutate(roomId, (s) => {
    if (!inRound(s, key)) return null;
    // An arrow still counts if its shooter fell while it flew.
    if (!(attacker in s.roster) || (!ranged && !alive(s, attacker))) return null;
    const hp = { ...s.hp };
    const hits = { ...s.hits };
    const kills = { ...s.kills };
    const items = { ...s.items };
    let itemSeq = s.itemSeq;
    let changed = false;
    for (const st of strikes) {
      const t = st.target;
      if (!alive(s, t) || s.roster[t] === s.roster[attacker] || (hp[t] ?? 0) <= 0) continue;
      changed = true;
      hp[t] = Math.max(0, (hp[t] ?? 0) - Math.max(0, Math.round(st.damage)));
      hits[t] = {
        n: (hits[t]?.n ?? 0) + 1,
        from: attacker,
        b: st.blocked,
        d: Math.round(st.drain),
        x: Math.round(attackerAt.x * 100) / 100,
        z: Math.round(attackerAt.z * 100) / 100,
      };
      if (hp[t] === 0) {
        kills[attacker] = (kills[attacker] ?? 0) + 1;
        itemSeq = dropGear({ ...s, itemSeq }, items, s.gear[t] ?? START_GEAR, st.x, st.z);
      }
    }
    if (!changed) return null;
    return checkRoundEnd({ ...s, hp, hits, kills, items, itemSeq });
  });
}

/** A fighter whose player left falls where it was (its weapons stay there). */
export function forfeit(roomId: string, key: number, id: string, x: number, z: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "fighting" || roundKey(s) !== key || !alive(s, id)) return null;
    const items = { ...s.items };
    const itemSeq = dropGear(s, items, s.gear[id] ?? START_GEAR, x, z);
    return checkRoundEnd({ ...s, hp: { ...s.hp, [id]: 0 }, items, itemSeq });
  });
}

/**
 * Picks up an item: a shield goes in the other hand, a weapon replaces the
 * one in hand (which is left on the floor at (x, z), unless it's the dagger).
 */
export function pickItem(roomId: string, key: number, id: string, itemId: string, x: number, z: number) {
  return mutate(roomId, (s) => {
    if (!inRound(s, key) || !alive(s, id)) return null;
    const item = s.items[itemId];
    if (!item) return null;
    const gear = s.gear[id] ?? START_GEAR;
    const items = { ...s.items };
    delete items[itemId];
    let itemSeq = s.itemSeq;
    let next: Gear;
    if (item.kind === "escudo") {
      if (gear.sh) return null;
      next = { ...gear, sh: true };
    } else {
      if (gear.w !== "daga") itemSeq = dropGear(s, items, { w: gear.w, sh: false }, x, z);
      next = { ...gear, w: item.kind };
    }
    return { ...s, items, itemSeq, gear: { ...s.gear, [id]: next } };
  });
}

/** Out of time: the team with more health left takes the round (equal = nobody). */
export function timeoutRound(roomId: string, key: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "fighting" || roundKey(s) !== key || serverNow() < s.startedAt + ROUND_SECONDS * 1000) return null;
    const total = (team: TeamId) =>
      Object.keys(s.roster)
        .filter((id) => s.roster[id] === team)
        .reduce((sum, id) => sum + (s.hp[id] ?? 0), 0);
    const red = total("red");
    const blue = total("blue");
    return endRound(s, red > blue ? "red" : blue > red ? "blue" : "draw");
  });
}

/** After a round's result: the next round, or the end of the match. */
export function nextRound(roomId: string, key: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "roundEnd" || roundKey(s) !== key || serverNow() < s.roundEndedAt + ROUND_END_MS - 300) return null;
    const champion = (["red", "blue"] as TeamId[]).find((t) => s.score[t] >= s.need);
    if (!champion) return setupRound(s, s.round + 1);
    const wins = { ...s.wins };
    for (const id of Object.keys(s.roster)) {
      if (s.roster[id] === champion && !isBot(id)) wins[id] = (wins[id] ?? 0) + 1;
    }
    return { ...s, status: "finished", winner: champion, wins };
  });
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
