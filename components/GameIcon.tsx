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
  BrickWall,
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
import { gameColors } from "@/lib/talos";

// Presentation icons (headers, waiting rooms, rules). Kept out of lib/games.ts so the
// catalog stays plain data; in-game emojis (cards, themes…) are game content.

const GAME_ICONS: Record<GameId, LucideIcon> = {
  memotest: Brain,
  tutti: NotebookPen,
  dibujo: Brush,
  cuatro: CircleDot,
  palabra: WholeWord,
  trivia: Lightbulb,
  impostor: UserSearch,
  naval: Ship,
  probable: Vote,
  conoces: HeartHandshake,
  generala: Dices,
  emojis: Laugh,
  verdades: Drama,
  damas: Crown,
  cajas: Grid2x2Check,
  reto: Flame,
  mimica: PersonStanding,
  ahorcado: Skull,
  sopa: TextSearch,
  carreras: Car,
  carreras3d: CarFront,
  arena: Swords,
  yonunca: Hand,
  codigo: VenetianMask,
  deslizante: Grid3x3,
  rompecabezas: Puzzle,
  onda: Gauge,
  telefono: Phone,
  ludo: Dice5,
  lobo: Moon,
  ajedrez: Castle,
  chinchon: Spade,
  truco: Club,
  fuego: Crosshair,
  otelo: Contrast,
  backgammon: Triangle,
  oca: Bird,
  domino: Rows2,
  pasteleria: CakeSlice,
  vibora: Worm,
  triqui: Hash,
  ladrillazo: BrickWall,
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

/** A game's icon on a flat tile in its shelf's color (lib/talos.ts). */
export default function GameIcon({ game, size = "md" }: { game: GameId; size?: keyof typeof TILE_SIZES }) {
  const Icon = GAME_ICONS[game];
  const { color, ink } = gameColors(game);
  const s = TILE_SIZES[size];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${s.tile}`}
      style={{ background: color, color: ink }}
      aria-hidden="true"
    >
      <Icon className={s.icon} strokeWidth={2.4} />
    </span>
  );
}
