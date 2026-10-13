/**
 * Words for Sopa de letras, by theme: uppercase, no accents (the Ñ stays),
 * no spaces. Boards are generated from the room's seed by index, so lists
 * are append-only: reordering or removing changes the boards of rooms
 * already created.
 */

export type SopaTheme = "mezcla" | "animales" | "comidas" | "paises" | "deportes" | "casa";

export const SOPA_THEMES: { id: SopaTheme; label: string; emoji: string; words: string[] }[] = [
  {
    id: "animales",
    label: "Animales",
    emoji: "🐾",
    words: [
      "PERRO", "GATO", "LEON", "TIGRE", "JIRAFA", "CEBRA", "MONO", "OSO", "LOBO", "ZORRO",
      "CONEJO", "RATON", "CABALLO", "VACA", "CERDO", "OVEJA", "CABRA", "PATO", "GALLINA", "BUHO",
      "AGUILA", "LORO", "PINGUINO", "DELFIN", "BALLENA", "TIBURON", "PULPO", "CANGREJO", "TORTUGA", "SAPO",
      "RANA", "SERPIENTE", "ARAÑA", "ABEJA", "HORMIGA", "MARIPOSA", "CARACOL", "CAMELLO", "ELEFANTE", "CANGURO",
      "KOALA", "PANDA", "LLAMA", "PUMA", "YAGUARETE", "CARPINCHO", "HORNERO", "ÑANDU", "COCODRILO", "FOCA",
    ],
  },
  {
    id: "comidas",
    label: "Comidas",
    emoji: "🍕",
    words: [
      "PIZZA", "EMPANADA", "ASADO", "MILANESA", "PASTA", "ÑOQUIS", "RAVIOLES", "LASAÑA", "SOPA", "GUISO",
      "TARTA", "ARROZ", "POLLO", "PESCADO", "ENSALADA", "TOMATE", "PAPA", "BATATA", "ZANAHORIA", "CEBOLLA",
      "LECHUGA", "QUESO", "JAMON", "HUEVO", "PAN", "MANTECA", "DULCE", "HELADO", "TORTA", "FLAN",
      "ALFAJOR", "GALLETA", "CHOCOLATE", "MEDIALUNA", "MANZANA", "BANANA", "NARANJA", "FRUTILLA", "UVA", "PERA",
      "SANDIA", "MELON", "LIMON", "DURAZNO", "CHORIZO", "TACO", "SUSHI", "HAMBURGUESA", "MATE", "CAFE",
    ],
  },
  {
    id: "paises",
    label: "Países",
    emoji: "🌎",
    words: [
      "ARGENTINA", "URUGUAY", "CHILE", "PERU", "BOLIVIA", "PARAGUAY", "BRASIL", "COLOMBIA", "ECUADOR", "VENEZUELA",
      "MEXICO", "CUBA", "PANAMA", "HONDURAS", "ESPAÑA", "FRANCIA", "ITALIA", "ALEMANIA", "PORTUGAL", "GRECIA",
      "SUIZA", "HOLANDA", "SUECIA", "NORUEGA", "RUSIA", "CHINA", "JAPON", "INDIA", "COREA", "EGIPTO",
      "MARRUECOS", "KENIA", "CANADA", "AUSTRALIA", "IRLANDA", "ESCOCIA", "TURQUIA", "IRAN", "ISRAEL", "TAILANDIA",
    ],
  },
  {
    id: "deportes",
    label: "Deportes",
    emoji: "⚽",
    words: [
      "FUTBOL", "TENIS", "RUGBY", "HOCKEY", "BASQUET", "VOLEY", "HANDBALL", "BOXEO", "KARATE", "JUDO",
      "NATACION", "ATLETISMO", "CICLISMO", "GOLF", "POLO", "PADEL", "SURF", "ESQUI", "REMO", "VELA",
      "ESGRIMA", "BEISBOL", "PATIN", "GIMNASIA", "AJEDREZ", "PELOTA", "ARCO", "GOL", "CANCHA", "RED",
      "RAQUETA", "CASCO", "MEDALLA", "TROFEO", "EQUIPO", "ARBITRO", "PENAL", "CORNER", "MARATON", "SALTO",
    ],
  },
  {
    id: "casa",
    label: "En casa",
    emoji: "🏠",
    words: [
      "MESA", "SILLA", "CAMA", "SOFA", "PUERTA", "VENTANA", "ESPEJO", "LAMPARA", "RELOJ", "ALFOMBRA",
      "COCINA", "HELADERA", "HORNO", "PLATO", "VASO", "TAZA", "OLLA", "SARTEN", "CUCHARA", "TENEDOR",
      "CUCHILLO", "DUCHA", "TOALLA", "JABON", "PEINE", "ALMOHADA", "SABANA", "FRAZADA", "ESCOBA", "BALDE",
      "LLAVE", "TECHO", "PARED", "PISO", "ESCALERA", "BALCON", "JARDIN", "PLANTA", "CORTINA", "ESTANTE",
    ],
  },
];

export const SOPA_THEME_OPTIONS: { id: SopaTheme; label: string; emoji: string }[] = [
  { id: "mezcla", label: "Mezcla", emoji: "🎲" },
  ...SOPA_THEMES.map(({ id, label, emoji }) => ({ id, label, emoji })),
];
