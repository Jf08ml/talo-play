import {
  Brain,
  Brush,
  Grid3x3,
  Heart,
  NotebookPen,
  PartyPopper,
  Puzzle,
  User,
  Users,
  VenetianMask,
  type LucideIcon,
} from "lucide-react";
import type { GameId, PlayContext } from "@/lib/games";

// Presentation icons (home, lobbies, headers). Kept out of lib/games.ts so the
// catalog stays plain data; in-game emojis (cards, themes…) are game content.

const GAME_ICONS: Record<GameId, { icon: LucideIcon; gradient: string }> = {
  memotest: { icon: Brain, gradient: "from-cyan-500 to-sky-600" },
  tutti: { icon: NotebookPen, gradient: "from-fuchsia-500 to-pink-600" },
  dibujo: { icon: Brush, gradient: "from-amber-400 to-orange-500" },
  codigo: { icon: VenetianMask, gradient: "from-rose-500 to-red-600" },
  deslizante: { icon: Grid3x3, gradient: "from-indigo-500 to-violet-600" },
  rompecabezas: { icon: Puzzle, gradient: "from-violet-500 to-purple-600" },
};

export const CONTEXT_ICONS: Record<PlayContext, LucideIcon> = {
  pareja: Heart,
  amigos: Users,
  grupo: PartyPopper,
  solo: User,
};

const TILE_SIZES = {
  sm: { tile: "h-6 w-6 rounded-md", icon: "h-3.5 w-3.5" },
  md: { tile: "h-8 w-8 rounded-lg", icon: "h-4.5 w-4.5" },
  lg: { tile: "h-11 w-11 rounded-xl", icon: "h-6 w-6" },
};

/** A game's icon on its accent-colored tile. */
export default function GameIcon({ game, size = "md" }: { game: GameId; size?: keyof typeof TILE_SIZES }) {
  const { icon: Icon, gradient } = GAME_ICONS[game];
  const s = TILE_SIZES[size];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-gradient-to-br text-white shadow-sm ${gradient} ${s.tile}`}
      aria-hidden="true"
    >
      <Icon className={s.icon} strokeWidth={2.25} />
    </span>
  );
}
