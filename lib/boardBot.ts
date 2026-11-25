import { colorForClient, generateClientId } from "./ids";

/**
 * The computer as a rival in the one-on-one board games. «Jugar en línea»
 * (`lib/matchmaking.ts`) looks for another person and, when nobody shows up
 * in a few seconds, sits a bot instead — on purpose it looks like anyone
 * else: a person's name, a normal client id (`state.botId`), present in the
 * room (the human's client writes its presence) and thinking for a varying
 * time. Its moves go through the same transactions as a person's, made by
 * whichever client in the room notices it's the bot's turn (the game's
 * move-count guard makes that idempotent).
 */

/** The bot's id in rooms made by the first version ("Contra la app"). */
export const LEGACY_BOT_ID = "bot";

export type BotLevel = "facil" | "normal" | "dificil";
export const BOT_LEVELS: BotLevel[] = ["facil", "normal", "dificil"];

export function normalizeBotLevel(raw: unknown): BotLevel | "" {
  return raw === "facil" || raw === "normal" || raw === "dificil" ? raw : "";
}

/** A level at random, like the rivals you'd meet: mostly normal. */
export function randomBotLevel(): BotLevel {
  const r = Math.random();
  return r < 0.3 ? "facil" : r < 0.75 ? "normal" : "dificil";
}

/** Names that pass for anyone's, from all over. */
export const RIVAL_NAMES = [
  "Sofi", "Mateo", "Valen", "Camila", "Diego", "Lucía", "Andrés", "Majo", "Santi", "Dani", "Pao", "Juanjo",
  "Isa", "Nico", "Fer", "Gabo", "Ale", "Caro", "Javi", "Lupita", "Memo", "Vale", "Tomás", "Emi", "Rodri",
  "Mafe", "Pipe", "Cata", "Kevin", "Ximena", "Bruno", "Lola", "Martina", "Joaquín", "Renata", "Pablo",
  "Abril", "Sebas", "Mica", "Leo", "Ana", "Hugo", "Romi", "Iván", "Belén", "Rafa", "Jime", "Nacho",
];

export interface SeatPlayerInfo {
  name: string;
  color: string;
}

/** Who a room made by «Jugar en línea» sits against its creator: a person who was waiting, or a bot. */
export interface Opponent {
  id: string;
  player: SeatPlayerInfo;
  botLevel?: BotLevel;
}

export function makeBotOpponent(avoidName = ""): Opponent {
  const id = generateClientId();
  const names = RIVAL_NAMES.filter((n) => n.toLowerCase() !== avoidName.trim().toLowerCase());
  return { id, player: { name: randomOf(names), color: colorForClient(id) }, botLevel: randomBotLevel() };
}

/**
 * The online fields of a new room's state: seats in random order (so the bot
 * or the rival starts half the time), the opponent registered, and the bot's
 * id and level when it's one.
 */
export function onlineSeats(hostId: string, vs: Opponent) {
  const hostFirst = Math.random() < 0.5;
  return {
    online: true,
    seats: hostFirst ? { a: hostId, b: vs.id } : { a: vs.id, b: hostId },
    players: { [vs.id]: vs.player },
    ...(vs.botLevel ? { botId: vs.id, botLevel: vs.botLevel } : {}),
  };
}

/** The bot fields every game's state normalizes the same way (old bot rooms used the id "bot"). */
export function normalizeBotFields(raw: { botId?: unknown; botLevel?: unknown; online?: unknown }) {
  const botLevel = normalizeBotLevel(raw.botLevel);
  const botId = typeof raw.botId === "string" ? raw.botId : botLevel ? LEGACY_BOT_ID : "";
  return { botId, botLevel, online: raw.online === true || !!botLevel };
}

export interface BotFields {
  /** The computer's client id in this room ("" if none). */
  botId: string;
  botLevel: BotLevel | "";
  /** Made by «Jugar en línea»: no chat, voice or friends, no waiting room. */
  online: boolean;
}

/**
 * How long the bot takes before moving: usually a second or three, sometimes
 * at once (an obvious move), sometimes a long think. `scale` stretches it for
 * slower games (chess) or shrinks it for quick ones (triqui).
 */
export function botDelay(scale = 1): number {
  const r = Math.random();
  const ms = r < 0.2 ? 250 + Math.random() * 500 : r < 0.8 ? 900 + Math.random() * 2300 : 3200 + Math.random() * 3800;
  return ms * scale;
}

/** A random element among those with the best score. */
export function pickBest<T>(scored: { move: T; score: number }[]): T {
  const best = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === best);
  return top[Math.floor(Math.random() * top.length)].move;
}

export const randomOf = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

const OUT_OF_TIME = Symbol("out of time");

/**
 * Iterative deepening under a time budget: `scoreAll(depth, tick)` scores
 * every root move at that depth, calling `tick()` at each node. Deeper passes
 * replace shallower ones only when they finish in time (depth 1 always does).
 */
export function deepen<T>(
  maxDepth: number,
  budgetMs: number,
  scoreAll: (depth: number, tick: () => void) => { move: T; score: number }[]
): { move: T; score: number }[] {
  const end = Date.now() + budgetMs;
  let nodes = 0;
  const tick = () => {
    if ((++nodes & 1023) === 0 && Date.now() > end) throw OUT_OF_TIME;
  };
  let best = scoreAll(1, () => {});
  for (let d = 2; d <= maxDepth; d++) {
    try {
      best = scoreAll(d, tick);
    } catch (e) {
      if (e !== OUT_OF_TIME) throw e;
      break;
    }
  }
  return best;
}
