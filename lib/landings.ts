import { CATEGORIES, GAME_ORDER, GAMES, type GameCategory, type GameId, type PlayContext } from "./games";
import { CATEGORY_COLORS } from "./talos";

/**
 * Landing pages for what people search ("juegos para jugar en pareja",
 * "juegos de cartas online"): one per way of playing (`PlayContext`) and one
 * per shelf (`CATEGORIES`). Pure data, built from the catalog, so the game
 * lists and examples never go out of date. Each one is a folder in `app/`
 * (`app/{slug}/page.tsx` → `LandingPage`), and the sitemap, footer and home
 * link to them.
 */

export interface Landing {
  slug: string;
  /** Short name for links ("En pareja", "Juegos de cartas"). */
  label: string;
  /** <title> (the site name is appended). */
  title: string;
  h1: string;
  description: string;
  intro: string[];
  games: GameId[];
  faq: { q: string; a: string }[];
  color: string;
  ink: string;
}

const titles = (ids: GameId[], n = 4) => {
  const names = ids.slice(0, n).map((id) => GAMES[id].title);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names.at(-1)}` : names[0] ?? "";
};

const FREE = {
  q: "¿Hay que pagar, descargar algo o registrarse?",
  a: "No. Todos los juegos de Talo son gratis y se juegan desde el navegador del celular o la computadora, sin instalar nada ni crear una cuenta: solo pones un nombre.",
};

const REMOTE = {
  q: "¿Se puede jugar a distancia?",
  a: "Sí. Cada uno entra desde su propio celular con el link de la sala y todo se sincroniza en vivo, así que sirve estando juntos o cada uno en su casa, por ejemplo en una videollamada.",
};

const byContext = (c: PlayContext) => GAME_ORDER.filter((id) => GAMES[id].contexts.includes(c));

const CONTEXT_LANDINGS: Record<PlayContext, (games: GameId[]) => Omit<Landing, "games" | "color" | "ink">> = {
  pareja: (g) => ({
    slug: "juegos-para-jugar-en-pareja",
    label: "En pareja",
    title: "Juegos para jugar en pareja online gratis",
    h1: "Juegos para jugar en pareja",
    description: `${g.length} juegos online gratis para jugar de a dos desde el celular: ${titles(g)} y más. Juntos en el sillón o a distancia, sin registrarse.`,
    intro: [
      `Juegos para dos, para jugar juntos en el sillón o a distancia, cada uno desde su celular. Hay clásicos y otros para conocerse más: ${titles(g, 5)}, entre otros.`,
      "Elige uno, mándale el link por WhatsApp a tu pareja (o a quien quieras retar) y en un minuto están jugando. Es gratis y no hace falta registrarse.",
    ],
    faq: [
      { q: "¿Qué juegos hay para jugar en pareja?", a: `Para jugar de a dos hay ${g.length} juegos: ${g.map((id) => GAMES[id].title).join(", ")}.` },
      REMOTE,
      FREE,
    ],
  }),
  amigos: (g) => ({
    slug: "juegos-para-jugar-con-amigos",
    label: "Con amigos",
    title: "Juegos online para jugar con amigos gratis",
    h1: "Juegos para jugar con amigos",
    description: `${g.length} juegos online gratis para jugar con amigos desde el celular: ${titles(g)} y más. Manda el link por WhatsApp y a jugar.`,
    intro: [
      `Juegos para jugar con amigos desde el celular, estén juntos o cada uno en su casa: ${titles(g, 5)} y muchos más.`,
      "Uno crea la sala, manda el link por WhatsApp y los demás entran con un toque, solo poniendo su nombre. Si son pocos, en la Plaza de Talo puedes encontrar a otros para completar la partida.",
    ],
    faq: [
      { q: "¿Cómo invito a mis amigos?", a: "Elige un juego y crea una sala. Manda el link por WhatsApp o pásales el código de 6 letras: tocan el link, escriben su nombre y entran a jugar." },
      REMOTE,
      FREE,
    ],
  }),
  grupo: (g) => ({
    slug: "juegos-para-grupos",
    label: "En grupo",
    title: "Juegos para grupos y reuniones online gratis",
    h1: "Juegos para grupos y reuniones",
    description: `${g.length} juegos online gratis para grupos, reuniones y fiestas, desde el celular: ${titles(g)} y más. Sin registrarse.`,
    intro: [
      `Juegos para cuando son muchos: reuniones, cumpleaños, la fiesta o una videollamada con todo el grupo. Cada uno juega desde su celular: ${titles(g, 5)}, entre otros.`,
      "No hace falta que todos se bajen nada ni se registren: alcanza con mandar el link al grupo de WhatsApp.",
    ],
    faq: [
      { q: "¿Qué juegos sirven para una reunión grande?", a: `Para jugar en grupo hay ${g.length} juegos: ${g.map((id) => GAMES[id].title).join(", ")}.` },
      REMOTE,
      FREE,
    ],
  }),
  solo: (g) => ({
    slug: "juegos-para-jugar-solo",
    label: "Solo",
    title: "Juegos online para jugar solo gratis",
    h1: "Juegos para jugar solo",
    description: `${g.length} juegos online gratis para jugar solo, sin esperar a nadie: ${titles(g)} y más. Desde el celular, sin registrarse.`,
    intro: [
      `Para un rato para ti: juegos que se pueden jugar solo, contra la computadora o contra el reloj, como ${titles(g, 5)}.`,
      "Y cuando quieras, los mismos juegos se juegan con amigos: creas una sala y les mandas el link.",
    ],
    faq: [{ q: "¿Qué juegos se pueden jugar solo?", a: `Se pueden jugar solo: ${g.map((id) => GAMES[id].title).join(", ")}.` }, FREE],
  }),
};

const SHELF_LANDINGS: Record<GameCategory, (games: GameId[]) => Omit<Landing, "games" | "color" | "ink">> = {
  previa: (g) => ({
    slug: "juegos-para-fiestas",
    label: "Para la fiesta",
    title: "Juegos para la fiesta online gratis",
    h1: "Juegos para la fiesta",
    description: `Juegos online gratis para la fiesta y las reuniones: ${titles(g)} y más. Risas, secretos y votaciones desde el celular.`,
    intro: [
      `Juegos para empezar la noche: risas, secretos, votaciones y alguna que otra traición. ${titles(g, 5)}, entre otros.`,
      "Cada uno juega desde su celular y la app lleva los turnos, los votos y los puntos: ustedes solo se ocupan de reírse.",
    ],
    faq: [{ q: "¿Cuántos pueden jugar?", a: "La mayoría se juega de 3 a 10 o más: cuantos más, mejor. Cada juego dice cuántos pueden entrar." }, REMOTE, FREE],
  }),
  palabras: (g) => ({
    slug: "juegos-de-preguntas-y-palabras",
    label: "Preguntas y palabras",
    title: "Juegos de preguntas y palabras online gratis",
    h1: "Juegos de preguntas y palabras",
    description: `Juegos online gratis de preguntas, palabras y adivinanzas: ${titles(g)} y más. Para jugar con amigos desde el celular.`,
    intro: [
      `Para los que saben de todo (o creen saber): trivia, adivinanzas, palabras escondidas y dibujos. ${titles(g, 5)}, entre otros.`,
      "Todos en español, con categorías y palabras pensadas para jugar en cualquier país de habla hispana.",
    ],
    faq: [REMOTE, FREE],
  }),
  accion: (g) => ({
    slug: "juegos-de-accion-y-3d",
    label: "Acción y 3D",
    title: "Juegos de acción y 3D online gratis",
    h1: "Juegos de acción y 3D",
    description: `Juegos online gratis de acción y en 3D para jugar con amigos desde el navegador: ${titles(g)} y más.`,
    intro: [
      `Carreras, combates, saltos y reflejos, varios en 3D y todos desde el navegador: ${titles(g, 5)}, entre otros.`,
      "Se juegan en el celular o en la computadora (con teclado y mouse), y algunos se pueden ver en la tele con los celulares como control.",
    ],
    faq: [
      { q: "¿Funcionan en celulares no tan nuevos?", a: "Sí. Los juegos en 3D tienen calidad alta y baja: si va lento, bájala desde el botón de la pantalla." },
      FREE,
    ],
  }),
  mesa: (g) => ({
    slug: "juegos-de-mesa-online",
    label: "Juegos de mesa",
    title: "Juegos de mesa online gratis",
    h1: "Juegos de mesa online",
    description: `Los clásicos juegos de mesa online y gratis: ${titles(g)} y más. Uno contra uno o en familia, desde el celular.`,
    intro: [
      `Los clásicos de siempre, uno contra uno o en familia, sin perder fichas: ${titles(g, 6)}, entre otros.`,
      "La app controla las reglas y los turnos, así que nadie hace trampa sin querer. Manda el link y juguen cada uno desde su celular.",
    ],
    faq: [REMOTE, FREE],
  }),
  cartas: (g) => ({
    slug: "juegos-de-cartas-y-dados",
    label: "Cartas y dados",
    title: "Juegos de cartas y dados online gratis",
    h1: "Juegos de cartas y dados",
    description: `Juegos de cartas y dados online gratis con baraja española: ${titles(g)}. Para jugar con amigos desde el celular.`,
    intro: [
      `Para la sobremesa, con baraja española y reglas clásicas: ${titles(g, 6)}.`,
      "La app reparte, cuenta los puntos y canta los tantos que hagan falta. Ustedes solo juegan.",
    ],
    faq: [REMOTE, FREE],
  }),
  puzzles: (g) => ({
    slug: "juegos-de-puzzles-y-memoria",
    label: "Puzzles y memoria",
    title: "Juegos de puzzles y memoria online gratis",
    h1: "Juegos de puzzles y memoria",
    description: `Puzzles y juegos de memoria online gratis: ${titles(g)}. Tranquilos, en equipo o a contrarreloj.`,
    intro: [
      `Para pensar un rato, tranquilos, en equipo o a contrarreloj: ${titles(g, 6)}.`,
      "Algunos se arman entre todos y otros son carreras para ver quién termina primero.",
    ],
    faq: [FREE],
  }),
};

function build(): Landing[] {
  const contexts = (Object.keys(CONTEXT_LANDINGS) as PlayContext[]).map((c) => {
    const games = byContext(c);
    return { ...CONTEXT_LANDINGS[c](games), games, color: "#FFD400", ink: "#111111" };
  });
  const shelves = CATEGORIES.map((cat) => {
    const games = cat.games;
    const { color, ink } = CATEGORY_COLORS[cat.id];
    return { ...SHELF_LANDINGS[cat.id](games), games, color, ink };
  });
  return [...contexts, ...shelves];
}

export const LANDINGS: Landing[] = build();

export function landing(slug: string): Landing {
  const found = LANDINGS.find((l) => l.slug === slug);
  if (!found) throw new Error(`Unknown landing ${slug}`);
  return found;
}

/** The landing page of a shelf (for links from the home and breadcrumbs). */
export function shelfLanding(category: GameCategory): Landing {
  return landing(SHELF_LANDINGS[category]([]).slug);
}

export function contextLanding(context: PlayContext): Landing {
  return landing(CONTEXT_LANDINGS[context]([]).slug);
}
