/**
 * Spanish deck, shared by Chinchón and Truco. A card is a 2-character code:
 * suit (`o` oros, `c` copas, `e` espadas, `b` bastos) + rank as one char
 * ("1"–"9", "A" = 10, "B" = 11, "C" = 12). Jokers are "x1" and "x2". Hands
 * and piles are stored as concatenated codes so RTDB never turns them into
 * arrays.
 */

export type Suit = "o" | "c" | "e" | "b";
export const SUITS: Suit[] = ["o", "c", "e", "b"];
const RANK_CHARS = "123456789ABC";

export const SUIT_INFO: Record<Suit, { label: string; color: string }> = {
  o: { label: "oro", color: "#ca8a04" },
  c: { label: "copa", color: "#dc2626" },
  e: { label: "espada", color: "#2563eb" },
  b: { label: "basto", color: "#15803d" },
};

export const card = (suit: Suit, rank: number) => suit + RANK_CHARS[rank - 1];
export const isJoker = (code: string) => code[0] === "x";
export const suitOf = (code: string) => code[0] as Suit;
export const rankOf = (code: string) => RANK_CHARS.indexOf(code[1]) + 1;

/** "1 de espada", "Rey de oro", "Comodín". */
export function cardName(code: string): string {
  if (isJoker(code)) return "Comodín";
  const r = rankOf(code);
  const name = r === 10 ? "Sota" : r === 11 ? "Caballo" : r === 12 ? "Rey" : String(r);
  return `${name} de ${SUIT_INFO[suitOf(code)].label}`;
}

export function splitCards(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < s.length; i += 2) out.push(s.slice(i, i + 2));
  return out;
}

/** 48 cards (1–12 of each suit); without 8 and 9 it's the 40-card deck. */
export function deck(withEightNine: boolean): string[] {
  const out: string[] = [];
  for (const s of SUITS) for (let r = 1; r <= 12; r++) if (withEightNine || (r !== 8 && r !== 9)) out.push(card(s, r));
  return out;
}

/** Fisher–Yates with Math.random: decks are shuffled inside the dealing transaction. */
export function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
