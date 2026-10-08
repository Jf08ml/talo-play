/**
 * Catalog of Talo's games: the single source for the home page, lobbies,
 * waiting rooms and link previews. Pure data (no Firebase), so server
 * components can use it too.
 *
 * Every room stores its game in `rooms/{id}/meta/game`; room codes are
 * global, so one code is enough to find any game's room (`lib/roomLookup.ts`).
 */
export type GameId = "rompecabezas" | "memotest" | "tutti" | "dibujo" | "codigo" | "deslizante";

/** Who you're playing with: the first question the home page asks. */
export type PlayContext = "pareja" | "amigos" | "grupo" | "solo";

export const CONTEXTS: { id: PlayContext; emoji: string; label: string; hint: string }[] = [
  { id: "pareja", emoji: "❤️", label: "En pareja", hint: "De a dos" },
  { id: "amigos", emoji: "👥", label: "Con amigos", hint: "3 a 6" },
  { id: "grupo", emoji: "🎉", label: "En grupo", hint: "Reuniones y fiestas" },
  { id: "solo", emoji: "🧍", label: "Solo", hint: "Un rato para vos" },
];

export interface GameInfo {
  id: GameId;
  emoji: string;
  title: string;
  /** URL segment: the lobby lives at `/{path}` and rooms at `/{path}/{roomId}`. */
  path: string;
  /** One line for cards and link previews. */
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  /** Rough length of one game, for cards ("5 min"). */
  duration: string;
  contexts: PlayContext[];
  /** Three short steps, shown in the lobby and the waiting room. */
  howTo: string[];
}

export const GAMES: Record<GameId, GameInfo> = {
  rompecabezas: {
    id: "rompecabezas",
    emoji: "🧩",
    title: "Rompecabezas",
    path: "rompecabezas",
    tagline: "Convertí una foto en un rompecabezas y armalo en equipo, o en una carrera rojos contra azules.",
    minPlayers: 1,
    maxPlayers: 10,
    duration: "10–20 min",
    contexts: ["solo", "pareja", "amigos"],
    howTo: [
      "Subí una foto y elegí cuántas piezas.",
      "Arrastrá las piezas: encajan solas cuando están cerca de su lugar.",
      "En competencia, cada equipo arma su copia y gana el más rápido.",
    ],
  },
  deslizante: {
    id: "deslizante",
    emoji: "🔲",
    title: "Rompecabezas deslizante",
    path: "deslizante",
    tagline: "Las fichas están mezcladas y falta una. Misma mezcla para todos: gana quien lo ordena primero.",
    minPlayers: 1,
    maxPlayers: 8,
    duration: "3–5 min",
    contexts: ["solo", "pareja", "amigos"],
    howTo: [
      "Todos reciben la misma mezcla de la imagen.",
      "Tocá una ficha en la fila o columna del hueco para deslizarla (o usá las flechas).",
      "Mirá el avance de los demás en vivo: gana el primero que la arma.",
    ],
  },
  memotest: {
    id: "memotest",
    emoji: "🃏",
    title: "Memotest",
    path: "memotest",
    tagline: "Dá vuelta las cartas y encontrá los pares: con emojis, fotos propias o pares de palabras.",
    minPlayers: 1,
    maxPlayers: 6,
    duration: "5 min",
    contexts: ["solo", "pareja", "amigos"],
    howTo: [
      "En tu turno, dá vuelta dos cartas.",
      "Si son pareja te las quedás y seguís jugando.",
      "Gana quien junte más pares (en cooperativo, resuélvanlo lo más rápido posible).",
    ],
  },
  tutti: {
    id: "tutti",
    emoji: "📝",
    title: "Tutti Frutti",
    path: "tutti-frutti",
    tagline: "Sale una letra y hay que llenar cada categoría. El primero que termina grita ¡Basta!",
    minPlayers: 2,
    maxPlayers: 10,
    duration: "15 min",
    contexts: ["pareja", "amigos", "grupo"],
    howTo: [
      "Sale una letra: completá cada categoría con una palabra que empiece con ella.",
      "Cuando terminás, tocá ¡Basta! y se cierra la ronda para todos.",
      "Revisen las respuestas y voten 👎 las que no valen. Las únicas suman más.",
    ],
  },
  dibujo: {
    id: "dibujo",
    emoji: "🎨",
    title: "Dibujá y adiviná",
    path: "dibujo",
    tagline: "Uno dibuja una palabra secreta y los demás la adivinan en el chat. Cuanto más rápido, más puntos.",
    minPlayers: 3,
    maxPlayers: 12,
    duration: "15 min",
    contexts: ["amigos", "grupo"],
    howTo: [
      "Por turnos, uno elige una palabra y la dibuja.",
      "Los demás escriben en el chat lo que creen que es.",
      "Adivinar rápido da más puntos; el que dibuja suma por cada acierto.",
    ],
  },
  codigo: {
    id: "codigo",
    emoji: "🕵️",
    title: "Código secreto",
    path: "codigo-secreto",
    tagline: "Rojos contra azules. Los jefes de espías dan pistas de una palabra para encontrar a sus agentes.",
    minPlayers: 4,
    maxPlayers: 12,
    duration: "15–20 min",
    contexts: ["grupo", "amigos"],
    howTo: [
      "Armen dos equipos; cada uno elige un jefe de espías.",
      "El jefe ve el mapa secreto y da una pista: una palabra y un número.",
      "Su equipo toca las palabras que cree suyas. ¡Cuidado con la bomba!",
    ],
  },
};

/** Home page order: quickest to start first. */
export const GAME_ORDER: GameId[] = ["memotest", "tutti", "dibujo", "codigo", "deslizante", "rompecabezas"];

export function roomPath(game: GameId, roomId: string): string {
  return `/${GAMES[game].path}/${roomId}`;
}

export function playersLabel(game: GameInfo): string {
  return game.minPlayers === game.maxPlayers ? `${game.minPlayers}` : `${game.minPlayers}–${game.maxPlayers}`;
}
