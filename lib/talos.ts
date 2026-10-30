// Which talo each player is, and the brand colors of the catalog's shelves.
// Pure data, safe anywhere.

import { CATEGORIES, type GameCategory, type GameId } from "./games";

/** The cast's shapes (talo-handoff README §5), as proportions of a height. */
const SHAPES = [
  { name: "pochi", aspect: 1, radius: () => "50%" }, // circle
  { name: "tano", aspect: 0.5, radius: (w: number, h: number) => `${w / 2}px ${w / 2}px ${h * 0.08}px ${h * 0.08}px` }, // tall arch
  { name: "dado", aspect: 1, radius: (w: number) => `${w * 0.18}px` }, // square
  { name: "mora", aspect: 1.6, radius: (w: number, h: number) => `${w / 2}px ${w / 2}px ${h * 0.12}px ${h * 0.12}px` }, // dome
  { name: "pipo", aspect: 1, radius: () => "50%", scale: 0.75 }, // small circle
  { name: "sombra", aspect: 0.77, radius: (w: number, h: number) => `${w / 2}px ${w / 2}px ${h * 0.12}px ${h * 0.12}px` }, // small arch
] as const;

function hash(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface TaloLook {
  w: number;
  h: number;
  radius: string;
  color: string;
}

/**
 * A player's talo: the shape comes from their client id (the same in every
 * room and screen), the color is their player color (lib/ids.ts), so the talo
 * matches how the games paint them. `size` is the height of a full-size talo.
 */
export function playerTalo(id: string, color: string, size: number): TaloLook {
  const shape = SHAPES[hash(id) % SHAPES.length];
  const scale = "scale" in shape ? shape.scale : 1;
  // Wide shapes keep the same area instead of the same height.
  const h = Math.round((shape.aspect > 1 ? size / Math.sqrt(shape.aspect) : size) * scale);
  const w = Math.round(h * shape.aspect);
  return { w, h, radius: shape.radius(w, h), color };
}

/** One flat color per shelf (README §2); `ink` is the text that goes on it. */
export const CATEGORY_COLORS: Record<GameCategory, { color: string; ink: string }> = {
  previa: { color: "#FF5FA2", ink: "#111111" },
  palabras: { color: "#FF7A1A", ink: "#111111" },
  accion: { color: "#2D5BFF", ink: "#FFFFFF" },
  mesa: { color: "#00B26B", ink: "#111111" },
  cartas: { color: "#8A4DFF", ink: "#FFFFFF" },
  puzzles: { color: "#FFC400", ink: "#111111" },
};

/** The shelf a game is on (every game is in exactly one). */
export function categoryOf(game: GameId) {
  return CATEGORIES.find((c) => c.games.includes(game)) ?? CATEGORIES[0];
}

/** A game's brand color and the text color on it. */
export function gameColors(game: GameId) {
  return CATEGORY_COLORS[categoryOf(game).id];
}
