/**
 * The computer as a rival in the one-on-one board games ("Contra la app").
 * The bot sits in a seat under the client id `BOT_ID`; its moves go through
 * the same transactions as a person's, made by whichever client in the room
 * notices it's the bot's turn (the move-count guard makes it idempotent).
 */

export const BOT_ID = "bot";

export type BotLevel = "facil" | "normal" | "dificil";
export const BOT_LEVELS: BotLevel[] = ["facil", "normal", "dificil"];

export const BOT_LEVEL_LABEL: Record<BotLevel, { label: string; sub: string }> = {
  facil: { label: "Fácil", sub: "Se distrae seguido" },
  normal: { label: "Normal", sub: "Ve venir lo obvio" },
  dificil: { label: "Difícil", sub: "Piensa varias jugadas" },
};

export const botPlayer = (level: BotLevel) => ({
  name: `Talo (${BOT_LEVEL_LABEL[level].label.toLowerCase()})`,
  color: "#FFD400",
});

export const isBot = (id: string) => id === BOT_ID;

export function normalizeBotLevel(raw: unknown): BotLevel | "" {
  return raw === "facil" || raw === "normal" || raw === "dificil" ? raw : "";
}

/** How long the bot "thinks" before moving, so it doesn't feel instant. */
export const botDelay = () => 550 + Math.random() * 500;

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
