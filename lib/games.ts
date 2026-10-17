/**
 * Catalog of Talo's games: the single source for the home page, lobbies,
 * waiting rooms and link previews. Pure data (no Firebase), so server
 * components can use it too.
 *
 * Every room stores its game in `rooms/{id}/meta/game`; room codes are
 * global, so one code is enough to find any game's room (`lib/roomLookup.ts`).
 */
export type GameId = "rompecabezas" | "memotest" | "tutti" | "dibujo" | "codigo" | "deslizante" | "cuatro" | "palabra" | "trivia" | "impostor" | "naval" | "probable" | "conoces" | "generala" | "emojis" | "verdades" | "damas" | "cajas" | "reto" | "mimica" | "ahorcado" | "sopa" | "carreras" | "carreras3d" | "arena" | "yonunca" | "onda" | "telefono" | "ludo";

/** Who you're playing with: the first question the home page asks. */
export type PlayContext = "pareja" | "amigos" | "grupo" | "solo";

export const CONTEXTS: { id: PlayContext; label: string; hint: string }[] = [
  { id: "pareja", label: "En pareja", hint: "De a dos" },
  { id: "amigos", label: "Con amigos", hint: "3 a 6" },
  { id: "grupo", label: "En grupo", hint: "Reuniones y fiestas" },
  { id: "solo", label: "Solo", hint: "Un rato para vos" },
];

export interface GameInfo {
  id: GameId;
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
      "Revisen las respuestas y voten las que no valen. Las únicas suman más.",
    ],
  },
  dibujo: {
    id: "dibujo",
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
  cuatro: {
    id: "cuatro",
    title: "4 en línea",
    path: "4-en-linea",
    tagline: "El clásico de tirar fichas por turnos: el primero que alinea cuatro gana. Ideal para una revancha rápida.",
    minPlayers: 2,
    maxPlayers: 2,
    duration: "5 min",
    contexts: ["pareja", "amigos"],
    howTo: [
      "Cada uno tiene un color; se juega por turnos.",
      "Tocá una columna para tirar tu ficha: cae hasta abajo.",
      "Gana quien alinea cuatro en horizontal, vertical o diagonal. Los demás miran.",
    ],
  },
  palabra: {
    id: "palabra",
    title: "Palabra secreta",
    path: "palabra-secreta",
    tagline: "Adiviná la palabra de cinco letras en seis intentos. Todos tienen la misma: gana quien la saca primero.",
    minPlayers: 1,
    maxPlayers: 8,
    duration: "3–5 min",
    contexts: ["solo", "pareja", "amigos"],
    howTo: [
      "Escribí una palabra de cinco letras y mandala.",
      "Verde: letra en su lugar. Amarillo: está, pero en otro lugar. Gris: no está.",
      "Mirá los colores de los demás en vivo: gana el primero que la adivina.",
    ],
  },
  trivia: {
    id: "trivia",
    title: "Trivia",
    path: "trivia",
    tagline: "Preguntas de geografía, historia, ciencia, deportes y más. Suma más quien contesta bien y rápido.",
    minPlayers: 1,
    maxPlayers: 12,
    duration: "5–10 min",
    contexts: ["solo", "pareja", "amigos", "grupo"],
    howTo: [
      "Sale una pregunta con cuatro opciones para todos a la vez.",
      "Tocá la que creas correcta antes de que se acabe el tiempo.",
      "Acertar suma de 500 a 1000 puntos: cuanto más rápido, más.",
    ],
  },
  impostor: {
    id: "impostor",
    title: "El impostor",
    path: "impostor",
    tagline: "Todos tienen la misma palabra menos uno, que tiene que disimular. Den pistas, sospechen y voten.",
    minPlayers: 3,
    maxPlayers: 12,
    duration: "5–10 min",
    contexts: ["amigos", "grupo"],
    howTo: [
      "Mirá tu carta a escondidas: tiene la palabra secreta, o te dice que sos el impostor.",
      "Por turnos, cada uno da una pista de una palabra, sin regalarla.",
      "Voten quién es el impostor. Si lo descubren, todavía puede ganar adivinando la palabra.",
    ],
  },
  probable: {
    id: "probable",
    title: "¿Quién es más probable?",
    path: "quien-es-mas-probable",
    tagline: "«¿Quién es más probable que llegue tarde a su propio casamiento?» Todos votan a alguien del grupo… y se arma.",
    minPlayers: 3,
    maxPlayers: 12,
    duration: "10 min",
    contexts: ["grupo", "amigos"],
    howTo: [
      "Sale una frase: «¿Quién es más probable que…?».",
      "Cada uno vota en secreto a alguien de la sala (vale votarse).",
      "Se revela quién se lleva el título. Sumás un punto si votaste con la mayoría.",
    ],
  },
  conoces: {
    id: "conoces",
    title: "¿Cuánto me conocés?",
    path: "cuanto-me-conoces",
    tagline: "Uno contesta preguntas sobre sí mismo a escondidas y los demás tienen que adivinar qué eligió.",
    minPlayers: 2,
    maxPlayers: 8,
    duration: "10 min",
    contexts: ["pareja", "amigos", "grupo"],
    howTo: [
      "Por turnos, a uno le toca una pregunta sobre sí mismo y elige su respuesta en secreto.",
      "Al mismo tiempo, los demás eligen lo que creen que contestó.",
      "Cada acierto suma un punto para quien adivinó y otro para el protagonista.",
    ],
  },
  generala: {
    id: "generala",
    title: "Generala",
    path: "generala",
    tagline: "El clásico de los cinco dados: escalera, full, póker y generala. Tres tiros por turno y a llenar la planilla.",
    minPlayers: 2,
    maxPlayers: 6,
    duration: "15–20 min",
    contexts: ["pareja", "amigos"],
    howTo: [
      "En tu turno tirás los dados hasta tres veces; entre tiro y tiro, tocá los que quieras guardar.",
      "Anotá el resultado en un casillero libre de tu planilla, o tachá uno con 0.",
      "Cuando se llenan las planillas gana el que más suma. ¡La generala servida gana en el acto!",
    ],
  },
  naval: {
    id: "naval",
    title: "Batalla naval",
    path: "batalla-naval",
    tagline: "Escondé tu flota y hundí la del rival antes que él. Uno contra uno, disparo a disparo.",
    minPlayers: 2,
    maxPlayers: 2,
    duration: "10 min",
    contexts: ["pareja", "amigos"],
    howTo: [
      "Ubicá tus cinco barcos en el mapa (o mezclalos al azar) y tocá «Listo».",
      "Por turnos, tocá una casilla del mapa rival para disparar. Si le das, tirás de nuevo.",
      "Gana el primero que hunde toda la flota del otro.",
    ],
  },
  emojis: {
    id: "emojis",
    title: "Adiviná con emojis",
    path: "adivina-con-emojis",
    tagline: "🦁👑 = El rey león. Películas, series, dichos y lugares escondidos en emojis: el que escribe primero suma más.",
    minPlayers: 1,
    maxPlayers: 12,
    duration: "5–10 min",
    contexts: ["solo", "pareja", "amigos", "grupo"],
    howTo: [
      "Aparecen unos emojis y la categoría: película, serie, dicho o lugar.",
      "Escribí lo que creés que es; podés probar todas las veces que quieras.",
      "Acertar suma de 500 a 1000 puntos: cuanto más rápido, más.",
    ],
  },
  verdades: {
    id: "verdades",
    title: "Dos verdades y una mentira",
    path: "dos-verdades-una-mentira",
    tagline: "Cada uno cuenta tres cosas sobre sí mismo y una es mentira. ¿Quién engaña mejor al grupo?",
    minPlayers: 3,
    maxPlayers: 12,
    duration: "10–15 min",
    contexts: ["amigos", "grupo"],
    howTo: [
      "Escribí tres frases sobre vos: dos verdaderas y una inventada. Marcá cuál es la mentira.",
      "Por turnos, el grupo vota cuál de las tres frases de cada uno es la mentira.",
      "Acertar suma un punto; y cada uno que se la cree suma un punto para el mentiroso.",
    ],
  },
  damas: {
    id: "damas",
    title: "Damas",
    path: "damas",
    tagline: "El clásico de tablero: avanzá en diagonal, comé las fichas del rival y coroná tus damas.",
    minPlayers: 2,
    maxPlayers: 2,
    duration: "10–15 min",
    contexts: ["pareja", "amigos"],
    howTo: [
      "Las fichas avanzan en diagonal, de a una casilla. Comen saltando por encima, hacia adelante o hacia atrás.",
      "Comer es obligatorio, y si después podés seguir comiendo, seguís con la misma ficha.",
      "La ficha que llega al fondo se corona dama y se mueve lejos. Gana quien deja al otro sin jugadas.",
    ],
  },
  cajas: {
    id: "cajas",
    title: "Puntos y cajas",
    path: "puntos-y-cajas",
    tagline: "Por turnos, uní dos puntos. Quien cierra un cuadrado se lo queda y vuelve a jugar.",
    minPlayers: 2,
    maxPlayers: 4,
    duration: "5–10 min",
    contexts: ["pareja", "amigos"],
    howTo: [
      "En tu turno, tocá el espacio entre dos puntos para trazar una línea.",
      "Si cerrás un cuadrado, es tuyo y jugás de nuevo.",
      "Cuando no quedan líneas, gana quien tiene más cuadrados.",
    ],
  },
  reto: {
    id: "reto",
    title: "Verdad o reto",
    path: "verdad-o-reto",
    tagline: "Te toca: ¿verdad o reto? La app reparte las preguntas y los desafíos; el grupo decide si cumpliste.",
    minPlayers: 3,
    maxPlayers: 12,
    duration: "Libre",
    contexts: ["amigos", "grupo"],
    howTo: [
      "Por turnos, al que le toca elige: verdad o reto.",
      "Aparece una pregunta para contestar con la verdad, o un desafío para cumplir.",
      "Los demás votan si cumplió: suma un punto. Si se raja, queda registrado…",
    ],
  },
  mimica: {
    id: "mimica",
    title: "Mímica",
    path: "mimica",
    tagline: "Dos equipos, un celular que muestra la palabra y un minuto para actuar sin hablar. ¿Cuántas sacan?",
    minPlayers: 4,
    maxPlayers: 16,
    duration: "15–20 min",
    contexts: ["grupo"],
    howTo: [
      "Armen dos equipos. Por turnos, uno de cada equipo actúa; solo él ve la palabra en su celular.",
      "Representala con gestos, sin hablar ni señalar cosas. Su equipo grita lo que cree que es.",
      "Cada palabra adivinada suma un punto. Si es muy difícil, pasala. Gana el equipo con más puntos.",
    ],
  },
  ahorcado: {
    id: "ahorcado",
    title: "Ahorcado",
    path: "ahorcado",
    tagline: "Uno elige una palabra secreta y los demás proponen letras por turnos antes de que se complete el ahorcado.",
    minPlayers: 2,
    maxPlayers: 8,
    duration: "10 min",
    contexts: ["pareja", "amigos"],
    howTo: [
      "Por rondas, a uno le toca elegir la palabra secreta (o que la elija la app).",
      "Los demás, por turnos, proponen una letra o arriesgan la palabra entera.",
      "Cada letra que está suma; cada error dibuja una parte del ahorcado. ¡Seis errores y gana el que eligió!",
    ],
  },
  sopa: {
    id: "sopa",
    title: "Sopa de letras",
    path: "sopa-de-letras",
    tagline: "Todos tienen la misma sopa: encontrá las palabras escondidas antes que los demás.",
    minPlayers: 1,
    maxPlayers: 8,
    duration: "5 min",
    contexts: ["solo", "pareja", "amigos"],
    howTo: [
      "Las palabras están escondidas en línea recta: horizontal, vertical o en diagonal.",
      "Tocá la primera letra y después la última para marcar una palabra.",
      "Cada palabra es de quien la marca primero. Gana quien encuentra más.",
    ],
  },
  carreras: {
    id: "carreras",
    title: "Carreras",
    path: "carreras",
    tagline: "La pista se ve desde arriba en la tele o el proyector y cada uno maneja su auto desde el teléfono.",
    minPlayers: 1,
    maxPlayers: 4,
    duration: "3–5 min",
    contexts: ["pareja", "amigos", "grupo"],
    howTo: [
      "Abrí la pantalla en una compu conectada a la tele o al proyector.",
      "Cada piloto entra desde su teléfono con el código: el teléfono es el volante.",
      "Manejá con botones o inclinando el teléfono. Gana el primero en completar las vueltas.",
    ],
  },
  carreras3d: {
    id: "carreras3d",
    title: "Carreras 3D",
    path: "carreras-3d",
    tagline: "Carreras en 3D de hasta 4: en la tele o el proyector con el teléfono de volante, o cada uno en su teléfono.",
    minPlayers: 1,
    maxPlayers: 4,
    duration: "3–5 min",
    contexts: ["pareja", "amigos", "grupo", "solo"],
    howTo: [
      "Elegí dónde se ve: en una pantalla grande (tele o proyector, dividida por piloto) o cada uno en su teléfono.",
      "Cada piloto entra desde su teléfono con el código y elige un auto.",
      "Manejá con botones o inclinando el teléfono, con cámara detrás del auto o desde la cabina.",
    ],
  },
  arena: {
    id: "arena",
    title: "Arena medieval",
    path: "arena-medieval",
    tagline: "Combates de caballeros en 3D, de 1 contra 1 a 3 contra 3: corré a buscar armas por la arena y quedate en pie.",
    minPlayers: 1,
    maxPlayers: 6,
    duration: "5–10 min",
    contexts: ["pareja", "amigos", "grupo", "solo"],
    howTo: [
      "Armen dos equipos (los lugares vacíos pueden ser bots). Cada uno pelea desde su teléfono o su compu.",
      "Arrancás con una daga: corré a agarrar espadas, hachas, mazas, lanzas, arcos y escudos tirados por la arena.",
      "Corré, esquivá, encadená combos y bloqueá de frente, cuidando el aguante. Hay pociones para curarte. Gana la ronda el equipo que queda en pie.",
    ],
  },
  codigo: {
    id: "codigo",
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
  yonunca: {
    id: "yonunca",
    title: "Yo nunca nunca",
    path: "yo-nunca",
    tagline: "Sale una frase y cada uno contesta en secreto: ¿lo hiciste o no? Después se revela quién sí… y hay que contar la historia.",
    minPlayers: 2,
    maxPlayers: 16,
    duration: "10–20 min",
    contexts: ["amigos", "grupo", "pareja"],
    howTo: [
      "Aparece una frase: “Yo nunca nunca…”.",
      "Cada uno toca “Yo sí” o “Yo no” en su celular, sin que los demás vean.",
      "Cuando contestan todos se revela quién lo hizo. Al final, ranking de quién vivió más.",
    ],
  },
  onda: {
    id: "onda",
    title: "En la misma onda",
    path: "en-la-misma-onda",
    tagline: "Uno ve dónde cae un punto en una escala (frío ↔ caliente, barato ↔ caro…) y da una pista. ¿Los demás lo encuentran en el dial?",
    minPlayers: 2,
    maxPlayers: 12,
    duration: "15–20 min",
    contexts: ["pareja", "amigos", "grupo"],
    howTo: [
      "Por turnos, a uno le toca ver en secreto dónde está el objetivo en una escala.",
      "Da una pista: una palabra, una cosa o un personaje que esté justo ahí.",
      "Los demás mueven la aguja del dial. Cuanto más cerca, más puntos; el que dio la pista suma el promedio.",
    ],
  },
  telefono: {
    id: "telefono",
    title: "Teléfono descompuesto",
    path: "telefono-descompuesto",
    tagline: "Cada uno escribe una frase, el siguiente la dibuja, el otro adivina el dibujo… y así. Al final, el álbum muestra cómo se deformó todo.",
    minPlayers: 3,
    maxPlayers: 12,
    duration: "10–15 min",
    contexts: ["amigos", "grupo"],
    howTo: [
      "Todos escriben una frase divertida al mismo tiempo.",
      "Las frases pasan de mano en mano: dibujás la que te llega, y el siguiente describe tu dibujo.",
      "Cuando todas dieron la vuelta, miren el álbum de cada cadena y vean cómo terminó.",
    ],
  },
  ludo: {
    id: "ludo",
    title: "Ludo",
    path: "ludo",
    tagline: "El clásico de dados y fichas para 2 a 4: sacá con un 6, comete las fichas de los demás y llevá las cuatro a casa.",
    minPlayers: 2,
    maxPlayers: 4,
    duration: "20–30 min",
    contexts: ["pareja", "amigos"],
    howTo: [
      "Tirá el dado en tu turno: con un 6 sacás una ficha de tu base (y volvés a tirar).",
      "Mové una ficha lo que marca el dado. Si caés donde hay una rival, vuelve a su base (salvo en las casillas con estrella).",
      "Gana el primero que lleva sus cuatro fichas a la meta, con el número justo.",
    ],
  },
};

/** Home page order: quickest to start first. */
export const GAME_ORDER: GameId[] = ["memotest", "impostor", "probable", "yonunca", "onda", "telefono", "reto", "emojis", "trivia", "conoces", "verdades", "mimica", "arena", "carreras3d", "carreras", "palabra", "sopa", "ahorcado", "cuatro", "cajas", "naval", "damas", "generala", "ludo", "tutti", "dibujo", "codigo", "deslizante", "rompecabezas"];

export function roomPath(game: GameId, roomId: string): string {
  return `/${GAMES[game].path}/${roomId}`;
}

export function playersLabel(game: GameInfo): string {
  return game.minPlayers === game.maxPlayers ? `${game.minPlayers}` : `${game.minPlayers}–${game.maxPlayers}`;
}
