/**
 * Secret words for El impostor, by category. A round's word is picked by
 * index from the round's seed, so only append to these lists: reordering or
 * removing words changes the word of rounds already being played.
 */

export type ImpostorCategory = "comidas" | "animales" | "lugares" | "objetos" | "profesiones" | "deportes";

export const IMPOSTOR_CATEGORIES: { id: ImpostorCategory; label: string; emoji: string; words: string[] }[] = [
  {
    id: "comidas",
    label: "Comidas y bebidas",
    emoji: "🍕",
    words: [
      "pizza", "empanada", "asado", "milanesa", "helado", "sushi", "hamburguesa", "ñoquis", "alfajor", "choripán",
      "tarta", "panqueque", "medialuna", "ravioles", "guiso", "ensalada", "sopa", "tacos", "flan", "dulce de leche",
      "mate", "café", "papas fritas", "chocolate", "queso",
    ],
  },
  {
    id: "animales",
    label: "Animales",
    emoji: "🦁",
    words: [
      "perro", "gato", "elefante", "jirafa", "león", "tiburón", "pingüino", "mono", "caballo", "vaca",
      "serpiente", "águila", "delfín", "tortuga", "conejo", "oso", "cocodrilo", "mariposa", "abeja", "búho",
      "zorro", "canguro", "cebra", "pulpo", "loro",
    ],
  },
  {
    id: "lugares",
    label: "Lugares",
    emoji: "🏖️",
    words: [
      "playa", "hospital", "escuela", "aeropuerto", "cine", "supermercado", "gimnasio", "biblioteca", "estadio", "museo",
      "iglesia", "banco", "restaurante", "montaña", "zoológico", "cárcel", "peluquería", "farmacia", "hotel", "boliche",
      "plaza", "comisaría", "circo", "oficina", "camping",
    ],
  },
  {
    id: "objetos",
    label: "Objetos",
    emoji: "🔑",
    words: [
      "celular", "paraguas", "reloj", "anteojos", "llave", "espejo", "mochila", "almohada", "tijera", "lámpara",
      "guitarra", "cepillo de dientes", "control remoto", "auriculares", "billetera", "vela", "bicicleta", "heladera",
      "cuchillo", "sartén", "computadora", "pelota", "linterna", "silla", "televisor",
    ],
  },
  {
    id: "profesiones",
    label: "Profesiones",
    emoji: "👩‍🚒",
    words: [
      "médico", "bombero", "policía", "maestro", "cocinero", "astronauta", "payaso", "piloto", "dentista", "abogado",
      "futbolista", "peluquero", "plomero", "cantante", "actor", "periodista", "veterinario", "carpintero", "enfermero",
      "mozo", "taxista", "panadero", "jardinero", "mago", "arquitecto",
    ],
  },
  {
    id: "deportes",
    label: "Deportes y actividades",
    emoji: "⚽",
    words: [
      "fútbol", "tenis", "natación", "básquet", "boxeo", "ciclismo", "ajedrez", "surf", "esquí", "golf",
      "rugby", "vóley", "yoga", "karate", "patinaje", "escalada", "pesca", "atletismo", "hockey", "paracaidismo",
      "buceo", "equitación", "bowling", "ping-pong", "maratón",
    ],
  },
];
