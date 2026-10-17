import type { Metadata } from "next";
import { CONTEXTS, GAME_ORDER, GAMES, playersLabel, type GameId, type PlayContext } from "./games";

/**
 * Search (SEO) and AI-answer (GEO) data: per-game metadata, schema.org JSON-LD
 * and the FAQ shown on the home. Pure data, built from the catalog in
 * `lib/games.ts`, so a new game gets all of it for free.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://talo-play.vercel.app").replace(/\/$/, "");

export const SITE_NAME = "Talo";

export const SITE_DESCRIPTION =
  "Juegos online gratis para jugar juntos desde el celular: en pareja, con amigos, en grupo o solo. Elegí un juego, mandá el link por WhatsApp y ya están jugando. Sin registrarse ni descargar nada.";

const CONTEXT_PHRASE: Record<PlayContext, string> = {
  pareja: "en pareja",
  amigos: "con amigos",
  grupo: "en grupo",
  solo: "solo",
};

function contextsText(contexts: PlayContext[]): string {
  const phrases = contexts.map((c) => CONTEXT_PHRASE[c]);
  return phrases.length > 1 ? `${phrases.slice(0, -1).join(", ")} o ${phrases.at(-1)}` : phrases[0];
}

/** "4 a 10 jugadores" / "1 jugador". */
function playersText(game: GameId): string {
  const info = GAMES[game];
  const label = playersLabel(info).replace("–", " a ");
  return `${label} ${info.maxPlayers === 1 ? "jugador" : "jugadores"}`;
}

/** Lobby page title: what people search ("Trivia online gratis con amigos"). */
function gameTitle(game: GameId): string {
  const info = GAMES[game];
  // The most searched phrase the game fits: "con amigos" > "en grupo" > "en pareja" > "solo".
  const best = (["amigos", "grupo", "pareja", "solo"] as const).find((c) => info.contexts.includes(c))!;
  return `${info.title} online gratis ${CONTEXT_PHRASE[best]}`;
}

function gameDescription(game: GameId): string {
  const info = GAMES[game];
  return `${info.tagline} Jugá ${contextsText(info.contexts)} desde el celular: ${playersText(game)}, ${info.duration}. Gratis y sin registrarse.`;
}

/** Metadata for a game's lobby (`/{path}`); its rooms override it with `inviteMetadata`. */
export function gameMetadata(game: GameId): Metadata {
  const info = GAMES[game];
  const title = gameTitle(game);
  const description = gameDescription(game);
  return {
    title,
    description,
    keywords: [
      info.title,
      `${info.title} online`,
      ...info.contexts.map((c) => `juegos ${CONTEXT_PHRASE[c]}`),
      "juegos online gratis",
      "juegos para jugar con amigos",
      "sin registrarse",
    ],
    alternates: { canonical: `/${info.path}` },
    openGraph: { title: `${title} · ${SITE_NAME}`, description, url: `/${info.path}`, images: ["/opengraph-image"] },
  };
}

/** schema.org data for a game's lobby. */
export function gameJsonLd(game: GameId) {
  const info = GAMES[game];
  const url = `${SITE_URL}/${info.path}`;
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    "@id": `${url}#game`,
    name: info.title,
    url,
    description: gameDescription(game),
    inLanguage: "es",
    genre: "Juego social",
    applicationCategory: "GameApplication",
    operatingSystem: "Web, Android, iOS",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
    playMode: info.maxPlayers > 1 ? "MultiPlayer" : "SinglePlayer",
    numberOfPlayers: { "@type": "QuantitativeValue", minValue: info.minPlayers, maxValue: info.maxPlayers },
    timeRequired: info.duration,
    gameTip: info.howTo,
    publisher: { "@id": `${SITE_URL}/#org` },
    isPartOf: { "@id": `${SITE_URL}/#website` },
  };
}

/** Questions answered on the home, also sent as FAQPage JSON-LD (must match what's shown). */
export const HOME_FAQ: { q: string; a: string }[] = [
  {
    q: "¿Qué es Talo?",
    a: `Talo es una colección de ${GAME_ORDER.length} juegos sociales online para jugar juntos desde el celular o la compu: trivia, El impostor, Tutti Frutti, Dibujá y adiviná, Memotest, 4 en línea, Batalla naval, Generala y más.`,
  },
  {
    q: "¿Es gratis? ¿Hay que registrarse o descargar algo?",
    a: "Es gratis y no hace falta registrarse ni instalar nada: se juega desde el navegador. Solo ponés un nombre para que los demás te reconozcan.",
  },
  {
    q: "¿Cómo invito a mis amigos?",
    a: "Elegí un juego y creá una sala. Mandá el link por WhatsApp (o pasá el código de 6 letras): tocan el link, escriben su nombre y entran a jugar.",
  },
  {
    q: "¿Qué juegos hay para jugar en pareja?",
    a: listFor("pareja"),
  },
  {
    q: "¿Qué juegos hay para jugar en grupo o en una reunión?",
    a: listFor("grupo"),
  },
  {
    q: "¿Se puede jugar a distancia?",
    a: "Sí. Cada uno juega desde su celular y la partida se sincroniza en vivo, así que sirve igual estando juntos o cada uno en su casa, por ejemplo durante una videollamada.",
  },
];

function listFor(context: PlayContext): string {
  const label = CONTEXTS.find((c) => c.id === context)!.label.toLowerCase();
  const titles = GAME_ORDER.filter((id) => GAMES[id].contexts.includes(context)).map((id) => GAMES[id].title);
  return `Para jugar ${label}: ${titles.join(", ")}.`;
}

/** schema.org data for the home: the site, who runs it, the game list and the FAQ. */
export function homeJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      inLanguage: "es",
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/opengraph-image`,
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Juegos de Talo",
      itemListElement: GAME_ORDER.map((id, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/${GAMES[id].path}`,
        name: GAMES[id].title,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: HOME_FAQ.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ];
}

/** Plain-text site summary for AI assistants (`/llms.txt`, llmstxt.org format). */
export function llmsText(): string {
  const games = GAME_ORDER.map((id) => {
    const g = GAMES[id];
    return [
      `### [${g.title}](${SITE_URL}/${g.path})`,
      "",
      g.tagline,
      "",
      `- Jugadores: ${playersLabel(g)} · Duración: ${g.duration} · Para jugar ${contextsText(g.contexts)}`,
      ...g.howTo.map((step) => `- ${step}`),
    ].join("\n");
  });
  return [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "Talo es una web app en español (Argentina) con juegos sociales multijugador en tiempo real. Cómo se usa: elegís un juego, creás una sala, mandás el link (o el código de 6 letras) por WhatsApp y los demás entran poniendo solo un nombre. No hay cuentas, descargas ni pagos.",
    "",
    "## Preguntas frecuentes",
    "",
    ...HOME_FAQ.flatMap(({ q, a }) => [`- **${q}** ${a}`]),
    "",
    "## Juegos",
    "",
    games.join("\n\n"),
    "",
  ].join("\n");
}
