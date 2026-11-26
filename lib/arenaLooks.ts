/**
 * Arena medieval's looks and gestures shared by the 3D knights, the lobby's
 * preview and the HUD: the shield emblems as SVG paths (a 100×100 box, drawn
 * with `evenodd`), and the four quick gestures. Pure data.
 */

/** Emblem id (lib/arenaProgress.ts `EMBLEMS`) → path. "ninguno" has none. */
export const EMBLEM_PATHS: Record<string, string> = {
  cruz: "M40 8h20v32h32v20H60v32H40V60H8V40h32z",
  estrella: "M50 4L61 37H96L68 58L79 92L50 71L21 92L32 58L4 37H39Z",
  rayo: "M60 2L16 56H45L36 98L84 40H55Z",
  luna: "M60 6A44 44 0 1 0 94 72A35 35 0 1 1 60 6Z",
  corona: "M8 80L12 26L32 50L50 14L68 50L88 26L92 80Z M20 86H80V94H20Z",
  dragon: "M8 74Q22 30 52 34L74 10L72 32L94 30L78 46Q92 58 82 80L66 66L58 92L46 70Q26 84 8 74Z M62 42a5 5 0 1 0 0.1 0Z",
  calavera: "M50 6C26 6 12 24 12 46c0 13 6 22 14 27v19h48V73c8-5 14-14 14-27C88 24 74 6 50 6Z M26 46a10 10 0 1 0 20 0a10 10 0 1 0 -20 0Z M54 46a10 10 0 1 0 20 0a10 10 0 1 0 -20 0Z M46 64h8l-4 10Z",
};

/**
 * Quick gestures. Sent in the pose as their index + 1 (`ArenaPose.em`, 0 or
 * absent = none), so this list is append-only.
 */
export interface Emote {
  id: "saludo" | "festejo" | "burla" | "reverencia";
  label: string;
  /** What floats over the head. */
  emoji: string;
}

export const EMOTES: Emote[] = [
  { id: "saludo", label: "Saludo", emoji: "👋" },
  { id: "festejo", label: "Festejo", emoji: "🎉" },
  { id: "burla", label: "Burla", emoji: "😜" },
  { id: "reverencia", label: "Reverencia", emoji: "🙇" },
];

/** How long a gesture plays (s), and the wait before another. */
export const EMOTE_SECONDS = 1.8;
export const EMOTE_COOLDOWN_MS = 3500;
