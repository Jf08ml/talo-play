import { isJoker, rankOf, suitOf } from "./baraja";

/**
 * Chinchón scoring, pure. A meld is a group (3–4 cards of the same number) or
 * a run (3+ consecutive cards of the same suit, 1–12, no wrap); jokers fill in
 * for any card, but every meld needs at least two real cards. Cards outside
 * melds count their number; a loose joker counts JOKER_POINTS.
 */

export const JOKER_POINTS = 50;
/** You may cut with every card melded but one worth at most this much. */
export const CUT_MAX = 5;
/** Cutting with all seven cards melded. */
export const CLEAN_CUT = -10;

export function cardPoints(code: string): number {
  return isJoker(code) ? JOKER_POINTS : rankOf(code);
}

export function isMeld(cards: string[]): boolean {
  if (cards.length < 3) return false;
  const real = cards.filter((c) => !isJoker(c));
  const jokers = cards.length - real.length;
  if (real.length < 2) return false;
  const ranks = real.map(rankOf);
  // Group: same number, up to four cards.
  if (cards.length <= 4 && ranks.every((r) => r === ranks[0])) return true;
  // Run: same suit, different numbers, gaps covered by jokers.
  if (!real.every((c) => suitOf(c) === suitOf(real[0]))) return false;
  if (new Set(ranks).size !== ranks.length) return false;
  const span = Math.max(...ranks) - Math.min(...ranks) + 1;
  return span - real.length <= jokers && cards.length <= 12;
}

export interface Arrangement {
  melds: string[][];
  loose: string[];
  points: number;
}

/** The arrangement of `cards` into melds that leaves the fewest loose points. */
export function bestArrangement(cards: string[]): Arrangement {
  let best: Arrangement = { melds: [], loose: cards.slice(), points: cards.reduce((a, c) => a + cardPoints(c), 0) };
  const search = (rest: string[], melds: string[][], loose: string[], points: number) => {
    if (points >= best.points) return;
    if (rest.length === 0) {
      best = { melds, loose, points };
      return;
    }
    const [first, ...others] = rest;
    // Every meld that uses `first` plus a subset of the others.
    const n = others.length;
    for (let mask = 1; mask < 1 << n; mask++) {
      const size = 1 + countBits(mask);
      if (size < 3) continue;
      const meld = [first, ...others.filter((_, i) => mask & (1 << i))];
      if (!isMeld(meld)) continue;
      search(others.filter((_, i) => !(mask & (1 << i))), [...melds, meld], loose, points);
    }
    search(others, melds, [...loose, first], points + cardPoints(first));
  };
  search(cards, [], [], 0);
  return best;
}

function countBits(n: number): number {
  let c = 0;
  while (n) {
    c += n & 1;
    n >>= 1;
  }
  return c;
}

/** Seven consecutive cards of one suit, without jokers: wins the whole game. */
export function isChinchon(cards: string[]): boolean {
  if (cards.length !== 7 || cards.some(isJoker)) return false;
  const suit = suitOf(cards[0]);
  if (!cards.every((c) => suitOf(c) === suit)) return false;
  const ranks = cards.map(rankOf).sort((a, b) => a - b);
  return ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1);
}

/** Can a player cut keeping these seven cards? (Every card melded but at most one worth ≤ CUT_MAX.) */
export function canCut(cards: string[]): boolean {
  const a = bestArrangement(cards);
  return a.loose.length === 0 || (a.loose.length === 1 && !isJoker(a.loose[0]) && cardPoints(a.loose[0]) <= CUT_MAX);
}

/** Points the cutter scores: −10 if everything is melded, else the loose card. */
export function cutterPoints(cards: string[]): number {
  const a = bestArrangement(cards);
  return a.loose.length === 0 ? CLEAN_CUT : a.points;
}
