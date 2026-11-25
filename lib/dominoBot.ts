import { fits, isDouble, pips, playable, splitTiles, type DominoState, type Seat, type Side } from "./domino";
import { randomOf, type BotLevel } from "./boardBot";

/**
 * Dominó's computer rival (one on one). It only looks at its own hand and
 * the line. Fácil plays any tile that fits; normal gets rid of heavy tiles
 * and doubles first; difícil also keeps the ends on numbers it holds (so it
 * isn't left without a play) and avoids ends it has none of.
 */

export type DominoBotAction = { kind: "play"; tile: string; side: Side } | { kind: "draw" } | { kind: "pass" };

function endsAfter(line: string, tile: string, side: Side): [number, number] {
  if (!line) return [Number(tile[0]), Number(tile[1])];
  const left = Number(line[0]);
  const right = Number(line[line.length - 1]);
  const [x, y] = [Number(tile[0]), Number(tile[1])];
  if (side === "l") return [x === left ? y : x, right];
  return [left, x === right ? y : x];
}

export function dominoBotAction(s: DominoState, seat: Seat, level: BotLevel): DominoBotAction {
  const options = playable(s, seat).flatMap((tile) => fits(s.line, tile).map((side) => ({ tile, side })));
  if (!options.length) return s.stock ? { kind: "draw" } : { kind: "pass" };
  if (level === "facil") return { kind: "play", ...randomOf(options) };
  const hand = splitTiles(s.hands[seat]);
  const scored = options.map((o) => {
    let score = pips(o.tile) + (isDouble(o.tile) ? 4 : 0);
    if (level === "dificil") {
      const rest = hand.filter((t) => t !== o.tile);
      const [l, r] = endsAfter(s.line, o.tile, o.side);
      const holds = (n: number) => rest.filter((t) => t.includes(String(n))).length;
      score += 3 * (holds(l) + holds(r));
      if (rest.length && !holds(l) && !holds(r)) score -= 6;
    }
    return { o, score: score + Math.random() * (level === "normal" ? 3 : 1) };
  });
  scored.sort((x, y) => y.score - x.score);
  return { kind: "play", ...scored[0].o };
}
