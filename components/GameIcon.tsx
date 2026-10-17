import {
  Brain,
  Brush,
  Car,
  CarFront,
  Dices,
  Flame,
  Hand,
  PersonStanding,
  Skull,
  Swords,
  TextSearch,
  Drama,
  Grid2x2Check,
  Laugh,
  Crown,
  HeartHandshake,
  Ship,
  Vote,
  CircleDot,
  WholeWord,
  Lightbulb,
  UserSearch,
  Grid3x3,
  Heart,
  NotebookPen,
  PartyPopper,
  Puzzle,
  User,
  Users,
  VenetianMask,
  Gauge,
  Phone,
  type LucideIcon,
} from "lucide-react";
import type { GameId, PlayContext } from "@/lib/games";

// Presentation icons (home, lobbies, headers). Kept out of lib/games.ts so the
// catalog stays plain data; in-game emojis (cards, themes…) are game content.

const GAME_ICONS: Record<GameId, { icon: LucideIcon; gradient: string }> = {
  memotest: { icon: Brain, gradient: "from-cyan-500 to-sky-600" },
  tutti: { icon: NotebookPen, gradient: "from-fuchsia-500 to-pink-600" },
  dibujo: { icon: Brush, gradient: "from-amber-400 to-orange-500" },
  cuatro: { icon: CircleDot, gradient: "from-rose-500 to-amber-400" },
  palabra: { icon: WholeWord, gradient: "from-emerald-500 to-teal-600" },
  trivia: { icon: Lightbulb, gradient: "from-yellow-400 to-orange-500" },
  impostor: { icon: UserSearch, gradient: "from-red-500 to-fuchsia-600" },
  naval: { icon: Ship, gradient: "from-sky-500 to-blue-700" },
  probable: { icon: Vote, gradient: "from-pink-500 to-orange-400" },
  conoces: { icon: HeartHandshake, gradient: "from-rose-400 to-pink-600" },
  generala: { icon: Dices, gradient: "from-lime-500 to-emerald-600" },
  emojis: { icon: Laugh, gradient: "from-yellow-400 to-amber-500" },
  verdades: { icon: Drama, gradient: "from-purple-500 to-indigo-600" },
  damas: { icon: Crown, gradient: "from-stone-500 to-red-700" },
  cajas: { icon: Grid2x2Check, gradient: "from-cyan-500 to-blue-600" },
  reto: { icon: Flame, gradient: "from-orange-500 to-red-600" },
  mimica: { icon: PersonStanding, gradient: "from-teal-400 to-cyan-600" },
  ahorcado: { icon: Skull, gradient: "from-slate-500 to-zinc-700" },
  sopa: { icon: TextSearch, gradient: "from-green-500 to-lime-500" },
  carreras: { icon: Car, gradient: "from-red-500 to-cyan-500" },
  carreras3d: { icon: CarFront, gradient: "from-sky-500 to-violet-600" },
  arena: { icon: Swords, gradient: "from-amber-500 to-red-700" },
  yonunca: { icon: Hand, gradient: "from-amber-400 to-orange-600" },
  codigo: { icon: VenetianMask, gradient: "from-rose-500 to-red-600" },
  deslizante: { icon: Grid3x3, gradient: "from-indigo-500 to-violet-600" },
  rompecabezas: { icon: Puzzle, gradient: "from-violet-500 to-purple-600" },
  onda: { icon: Gauge, gradient: "from-sky-500 to-orange-500" },
  telefono: { icon: Phone, gradient: "from-lime-400 to-emerald-600" },
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
