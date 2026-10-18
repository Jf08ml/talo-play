import { ref, get, onValue, serverTimestamp, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import { transactState } from "./transact";

/**
 * El juego de la Oca for 2–6, with the classic Spanish board of 63 squares
 * (`SQUARES`). `order` is fixed at start (the connected players, shuffled);
 * later joiners watch. Rolling is one transaction that resolves the whole
 * landing: oca to the next oca, bridge ↔ bridge and dice ↔ dice (all roll
 * again), inn (lose 1 turn), well (stuck until someone else falls in), maze
 * (back to 30), jail (lose 2 turns), skull (back to the start). The garden
 * (63) needs the exact count: the rest bounces back. With two dice, a first
 * roll of 6+3 goes to 26 and 4+5 to 53. Dice: Math.random in the transaction.
 */

export const GOAL = 63;
export const MAX_PLAYERS = 6;
export const OCAS = [5, 9, 14, 18, 23, 27, 32, 36, 41, 45, 50, 54, 59];
export const PLAYER_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#f97316"];

export type Rule =
  | ""
  | "oca"
  | "puente"
  | "dados"
  | "posada"
  | "pozo"
  | "laberinto"
  | "carcel"
  | "calavera"
  | "rebote"
  | "meta";

/** Special squares and what they show. */
export const SQUARES: Record<number, { rule: Rule; emoji: string; name: string }> = {
  ...Object.fromEntries(OCAS.map((n) => [n, { rule: "oca" as Rule, emoji: "🪿", name: "Oca" }])),
  6: { rule: "puente", emoji: "🌉", name: "Puente" },
  12: { rule: "puente", emoji: "🌉", name: "Puente" },
  19: { rule: "posada", emoji: "🏨", name: "Posada" },
  26: { rule: "dados", emoji: "🎲", name: "Dados" },
  31: { rule: "pozo", emoji: "🕳️", name: "Pozo" },
  42: { rule: "laberinto", emoji: "🌀", name: "Laberinto" },
  52: { rule: "carcel", emoji: "⛓️", name: "Cárcel" },
  53: { rule: "dados", emoji: "🎲", name: "Dados" },
  58: { rule: "calavera", emoji: "💀", name: "Calavera" },
  63: { rule: "meta", emoji: "🌷", name: "Jardín de la Oca" },
};

export const RULE_TEXT: Record<Rule, string> = {
  "": "",
  oca: "De oca a oca y tiro porque me toca 🪿",
  puente: "De puente a puente y tiro porque me lleva la corriente 🌉",
  dados: "De dado a dado y tiro porque me ha tocado 🎲",
  posada: "Cayó en la posada: pierde un turno 🏨",
  pozo: "Cayó en el pozo: queda ahí hasta que otro lo rescate 🕳️",
  laberinto: "Se perdió en el laberinto: vuelve a la 30 🌀",
  carcel: "¡A la cárcel! Pierde dos turnos ⛓️",
  calavera: "¡La calavera! Vuelve a empezar 💀",
  rebote: "Se pasó de la 63 y rebotó",
  meta: "¡Llegó al jardín de la Oca! 🌷",
};

export type OcaStatus = "waiting" | "playing" | "finished";

export interface OcaMeta {
  game: "oca";
  /** 1 or 2 dice. */
  dice: number;
  hostId?: string;
  createdAt: number | object;
}

export interface OcaPlayer {
  name: string;
  color: string;
}

export interface OcaLast {
  who: string;
  /** Dice as rolled ("3,5"). */
  dice: string;
  from: number;
  /** Where the roll took the token (after any bounce)… */
  landed: number;
  /** …and where it ended up after the square's rule. */
  to: number;
  rule: Rule;
  /** It bounced off 63 before landing. */
  bounced: boolean;
  again: boolean;
  /** Who the well released (""). */
  freed: string;
}

export interface OcaState {
  status: OcaStatus;
  dice: number;
  gameNo: number;
  players: Record<string, OcaPlayer>;
  order: string[];
  pos: Record<string, number>;
  /** Turns each player still has to sit out. */
  wait: Record<string, number>;
  /** Who is stuck in the well ("" nobody). */
  well: string;
  /** Rolls made this game per player (for the first-roll rule). */
  rolls: Record<string, number>;
  /** Index in `order` of who plays. */
  turn: number;
  moveNo: number;
  last: OcaLast;
  winner: string;
  wins: Record<string, number>;
}

const NO_LAST: OcaLast = { who: "", dice: "", from: 0, landed: 0, to: 0, rule: "", bounced: false, again: false, freed: "" };

function normalizeState(raw: Partial<OcaState> | null): OcaState | null {
  if (!raw || !raw.status) return null;
  return {
    status: raw.status,
    dice: raw.dice === 1 ? 1 : 2,
    gameNo: raw.gameNo ?? 0,
    players: raw.players ?? {},
    order: raw.order ?? [],
    pos: raw.pos ?? {},
    wait: raw.wait ?? {},
    well: raw.well ?? "",
    rolls: raw.rolls ?? {},
    turn: raw.turn ?? 0,
    moveNo: raw.moveNo ?? 0,
    last: { ...NO_LAST, ...raw.last },
    winner: raw.winner ?? "",
    wins: raw.wins ?? {},
  };
}

export const colorOf = (s: Pick<OcaState, "order">, id: string) => PLAYER_COLORS[Math.max(0, s.order.indexOf(id)) % PLAYER_COLORS.length];

/** Where a token that lands on `square` ends up, and whether it rolls again. */
export function resolveLanding(square: number): { to: number; rule: Rule; again: boolean } {
  const rule = SQUARES[square]?.rule ?? "";
  switch (rule) {
    case "oca": {
      const next = OCAS.find((o) => o > square) ?? GOAL;
      return { to: next, rule, again: next !== GOAL };
    }
    case "puente":
      return { to: square === 6 ? 12 : 6, rule, again: true };
    case "dados":
      return { to: square === 26 ? 53 : 26, rule, again: true };
    case "laberinto":
      return { to: 30, rule, again: false };
    case "calavera":
      return { to: 0, rule, again: false };
    default:
      return { to: square, rule, again: false };
  }
}

/** Next player who can roll, consuming the lost turns of those skipped. */
function advance(s: OcaState): OcaState {
  const wait = { ...s.wait };
  let turn = s.turn;
  for (let i = 0; i < s.order.length * 4; i++) {
    turn = (turn + 1) % s.order.length;
    const id = s.order[turn];
    if (id === s.well && s.order.length > 1) continue;
    if ((wait[id] ?? 0) > 0) {
      wait[id] -= 1;
      continue;
    }
    break;
  }
  return { ...s, turn, wait };
}

// ---- Firebase ------------------------------------------------------------

const statePath = (roomId: string) => `rooms/${roomId}/oca/state`;

function mutate(roomId: string, fn: (state: OcaState) => OcaState | null) {
  return transactState(statePath(roomId), normalizeState, fn);
}

export async function createOcaRoom(dice: number, hostId: string): Promise<string> {
  const roomId = generateRoomCode();
  const meta: OcaMeta = { game: "oca", dice, hostId, createdAt: serverTimestamp() };
  const state: Partial<OcaState> = { status: "waiting", dice, gameNo: 0 };
  await update(ref(getDb()), {
    [`rooms/${roomId}/meta`]: meta,
    [statePath(roomId)]: state,
  });
  return roomId;
}

export async function getOcaMeta(roomId: string): Promise<Partial<OcaMeta> | null> {
  const snap = await get(ref(getDb(), `rooms/${roomId}/meta`));
  return snap.exists() ? snap.val() : null;
}

export function subscribeOca(roomId: string, cb: (state: OcaState | null) => void): Unsubscribe {
  return onValue(ref(getDb(), statePath(roomId)), (snap) => cb(normalizeState(snap.val())));
}

export function joinOca(roomId: string, clientId: string, player: OcaPlayer) {
  return mutate(roomId, (s) => {
    const known = s.players[clientId];
    if (known?.name === player.name && known?.color === player.color) return null;
    return { ...s, players: { ...s.players, [clientId]: player } };
  });
}

function fresh(s: OcaState, order: string[]): OcaState {
  return {
    ...s,
    status: "playing",
    order,
    pos: Object.fromEntries(order.map((id) => [id, 0])),
    wait: {},
    well: "",
    rolls: {},
    turn: 0,
    moveNo: s.moveNo + 1,
    last: NO_LAST,
    winner: "",
  };
}

/** Starts with the connected players (`ids`), in random order. */
export function startOca(roomId: string, ids: string[]) {
  return mutate(roomId, (s) => {
    const order = ids.filter((id) => s.players[id]).slice(0, MAX_PLAYERS);
    if (s.status !== "waiting" || order.length < 2) return null;
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return fresh(s, order);
  });
}

export function rollOca(roomId: string, clientId: string, expectedMove: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "playing" || s.order[s.turn] !== clientId || s.moveNo !== expectedMove) return null;
    const dice = Array.from({ length: s.dice }, () => 1 + Math.floor(Math.random() * 6));
    const total = dice.reduce((a, b) => a + b, 0);
    const from = s.pos[clientId] ?? 0;
    const first = (s.rolls[clientId] ?? 0) === 0 && s.dice === 2;
    const pair = [...dice].sort().join(",");

    let landed: number;
    let bounced = false;
    let to: number;
    let rule: Rule;
    let again: boolean;
    if (first && from === 0 && (pair === "3,6" || pair === "4,5")) {
      // Classic opening: 6 and 3 to the dice on 26, 4 and 5 to the ones on 53.
      landed = pair === "3,6" ? 26 : 53;
      ({ to, rule, again } = { to: landed, rule: "dados" as Rule, again: true });
    } else {
      landed = from + total;
      if (landed > GOAL) {
        landed = GOAL - (landed - GOAL);
        bounced = true;
      }
      ({ to, rule, again } = resolveLanding(landed));
    }

    const wait = { ...s.wait };
    let well = s.well;
    let freed = "";
    if (to === GOAL) rule = rule === "oca" ? "oca" : "meta";
    if (rule === "posada") wait[clientId] = 1;
    if (rule === "carcel") wait[clientId] = 2;
    if (rule === "pozo") {
      if (well && well !== clientId) freed = well;
      well = clientId;
    } else if (well === clientId) {
      well = "";
    }

    const next: OcaState = {
      ...s,
      pos: { ...s.pos, [clientId]: to },
      wait,
      well,
      rolls: { ...s.rolls, [clientId]: (s.rolls[clientId] ?? 0) + 1 },
      moveNo: s.moveNo + 1,
      last: { who: clientId, dice: dice.join(","), from, landed, to, rule: bounced && !rule ? "rebote" : rule, bounced, again, freed },
    };
    if (to === GOAL) {
      return { ...next, status: "finished", winner: clientId, wins: { ...s.wins, [clientId]: (s.wins[clientId] ?? 0) + 1 } };
    }
    return again ? next : advance(next);
  });
}

/** The player in turn left: the next one plays. */
export function skipTurn(roomId: string, expectedMove: number) {
  return mutate(roomId, (s) =>
    s.status === "playing" && s.moveNo === expectedMove ? advance({ ...s, moveNo: s.moveNo + 1 }) : null
  );
}

/** Same players; the order rotates so someone else starts. */
export function rematch(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) => {
    if (s.status !== "finished" || s.gameNo !== expectedGame) return null;
    const order = [...s.order.slice(1), s.order[0]];
    return { ...fresh(s, order), gameNo: s.gameNo + 1 };
  });
}

/** Back to the waiting room, so new people can join the next game. */
export function backToLobby(roomId: string, expectedGame: number) {
  return mutate(roomId, (s) =>
    s.status === "finished" && s.gameNo === expectedGame ? { ...s, status: "waiting", gameNo: s.gameNo + 1 } : null
  );
}

/**
 * Board layout: square n (0–63) on an 8×8 spiral that starts at the bottom
 * left and winds clockwise inward to the garden.
 */
export const SPIRAL: [number, number][] = (() => {
  const out: [number, number][] = [];
  let top = 0;
  let bottom = 7;
  let left = 0;
  let right = 7;
  while (out.length < 64) {
    for (let c = left; c <= right && out.length < 64; c++) out.push([bottom, c]);
    bottom--;
    for (let r = bottom; r >= top && out.length < 64; r--) out.push([r, right]);
    right--;
    for (let c = right; c >= left && out.length < 64; c--) out.push([top, c]);
    top++;
    for (let r = top; r <= bottom && out.length < 64; r++) out.push([r, left]);
    left++;
  }
  return out;
})();
