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
  Worm,
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
  Hash,
  Heart,
  NotebookPen,
  PartyPopper,
  Puzzle,
  User,
  Users,
  VenetianMask,
  Gauge,
  Phone,
  Dice5,
  Moon,
  Castle,
  Spade,
  Club,
  Crosshair,
  Contrast,
  Triangle,
  Bird,
  Rows2,
  CakeSlice,
  type LucideIcon,
} from "lucide-react";
import type { GameId, PlayContext } from "@/lib/games";

// Presentation icons (home, lobbies, headers). Kept out of lib/games.ts so the
// catalog stays plain data; in-game emojis (cards, themes…) are game content.

const GAME_ICONS: Record<GameId, { icon: LucideIcon; tint: string }> = {
  memotest: { icon: Brain, tint: "bg-cyan-400/15 text-cyan-300 ring-cyan-400/25" },
  tutti: { icon: NotebookPen, tint: "bg-fuchsia-400/15 text-fuchsia-300 ring-fuchsia-400/25" },
  dibujo: { icon: Brush, tint: "bg-amber-400/15 text-amber-300 ring-amber-400/25" },
  cuatro: { icon: CircleDot, tint: "bg-rose-400/15 text-rose-300 ring-rose-400/25" },
  palabra: { icon: WholeWord, tint: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/25" },
  trivia: { icon: Lightbulb, tint: "bg-yellow-400/15 text-yellow-300 ring-yellow-400/25" },
  impostor: { icon: UserSearch, tint: "bg-red-400/15 text-red-300 ring-red-400/25" },
  naval: { icon: Ship, tint: "bg-sky-400/15 text-sky-300 ring-sky-400/25" },
  probable: { icon: Vote, tint: "bg-pink-400/15 text-pink-300 ring-pink-400/25" },
  conoces: { icon: HeartHandshake, tint: "bg-rose-400/15 text-rose-300 ring-rose-400/25" },
  generala: { icon: Dices, tint: "bg-lime-400/15 text-lime-300 ring-lime-400/25" },
  emojis: { icon: Laugh, tint: "bg-yellow-400/15 text-yellow-300 ring-yellow-400/25" },
  verdades: { icon: Drama, tint: "bg-purple-400/15 text-purple-300 ring-purple-400/25" },
  damas: { icon: Crown, tint: "bg-stone-400/15 text-stone-300 ring-stone-400/25" },
  cajas: { icon: Grid2x2Check, tint: "bg-cyan-400/15 text-cyan-300 ring-cyan-400/25" },
  reto: { icon: Flame, tint: "bg-orange-400/15 text-orange-300 ring-orange-400/25" },
  mimica: { icon: PersonStanding, tint: "bg-teal-400/15 text-teal-300 ring-teal-400/25" },
  ahorcado: { icon: Skull, tint: "bg-slate-400/15 text-slate-300 ring-slate-400/25" },
  sopa: { icon: TextSearch, tint: "bg-green-400/15 text-green-300 ring-green-400/25" },
  carreras: { icon: Car, tint: "bg-red-400/15 text-red-300 ring-red-400/25" },
  carreras3d: { icon: CarFront, tint: "bg-sky-400/15 text-sky-300 ring-sky-400/25" },
  arena: { icon: Swords, tint: "bg-amber-400/15 text-amber-300 ring-amber-400/25" },
  yonunca: { icon: Hand, tint: "bg-amber-400/15 text-amber-300 ring-amber-400/25" },
  codigo: { icon: VenetianMask, tint: "bg-rose-400/15 text-rose-300 ring-rose-400/25" },
  deslizante: { icon: Grid3x3, tint: "bg-indigo-400/15 text-indigo-300 ring-indigo-400/25" },
  rompecabezas: { icon: Puzzle, tint: "bg-violet-400/15 text-violet-300 ring-violet-400/25" },
  onda: { icon: Gauge, tint: "bg-sky-400/15 text-sky-300 ring-sky-400/25" },
  telefono: { icon: Phone, tint: "bg-lime-400/15 text-lime-300 ring-lime-400/25" },
  ludo: { icon: Dice5, tint: "bg-red-400/15 text-red-300 ring-red-400/25" },
  lobo: { icon: Moon, tint: "bg-indigo-400/15 text-indigo-300 ring-indigo-400/25" },
  ajedrez: { icon: Castle, tint: "bg-stone-400/15 text-stone-300 ring-stone-400/25" },
  chinchon: { icon: Spade, tint: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/25" },
  truco: { icon: Club, tint: "bg-sky-400/15 text-sky-300 ring-sky-400/25" },
  fuego: { icon: Crosshair, tint: "bg-cyan-400/15 text-cyan-300 ring-cyan-400/25" },
  otelo: { icon: Contrast, tint: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/25" },
  backgammon: { icon: Triangle, tint: "bg-amber-400/15 text-amber-300 ring-amber-400/25" },
  oca: { icon: Bird, tint: "bg-lime-400/15 text-lime-300 ring-lime-400/25" },
  domino: { icon: Rows2, tint: "bg-slate-400/15 text-slate-300 ring-slate-400/25" },
  pasteleria: { icon: CakeSlice, tint: "bg-pink-400/15 text-pink-300 ring-pink-400/25" },
  vibora: { icon: Worm, tint: "bg-lime-400/15 text-lime-300 ring-lime-400/25" },
  triqui: { icon: Hash, tint: "bg-cyan-400/15 text-cyan-300 ring-cyan-400/25" },
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

/** A game's icon on a tile tinted with its accent color. */
export default function GameIcon({ game, size = "md" }: { game: GameId; size?: keyof typeof TILE_SIZES }) {
  const { icon: Icon, tint } = GAME_ICONS[game];
  const s = TILE_SIZES[size];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ring-1 ring-inset ${tint} ${s.tile}`}
      aria-hidden="true"
    >
      <Icon className={s.icon} strokeWidth={2} />
    </span>
  );
}
