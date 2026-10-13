/**
 * Puzzles for Adiviná con emojis. Rooms pick them by index, so the list is
 * append-only: reordering or removing changes the puzzles of rooms already
 * created. `alt` are other accepted answers (titles as known in other
 * countries, the original name…).
 */

export type EmojiCategory = "peliculas" | "series" | "dichos" | "lugares";

export const EMOJI_CATEGORIES: { id: EmojiCategory; label: string; emoji: string }[] = [
  { id: "peliculas", label: "Películas", emoji: "🎬" },
  { id: "series", label: "Series y dibujitos", emoji: "📺" },
  { id: "dichos", label: "Dichos y refranes", emoji: "💬" },
  { id: "lugares", label: "Países y lugares", emoji: "🌎" },
];

export interface EmojiPuzzle {
  e: string;
  a: string;
  alt?: string[];
  cat: EmojiCategory;
}

export const EMOJI_PUZZLES: EmojiPuzzle[] = [
  // Películas
  { e: "🦁👑", a: "El rey león", alt: ["the lion king"], cat: "peliculas" },
  { e: "🚢🧊💔", a: "Titanic", cat: "peliculas" },
  { e: "🕷️🧑", a: "El hombre araña", alt: ["spiderman", "spider man"], cat: "peliculas" },
  { e: "🐠🔍", a: "Buscando a Nemo", alt: ["nemo", "finding nemo"], cat: "peliculas" },
  { e: "❄️👸⛄", a: "Frozen", alt: ["frozen una aventura congelada"], cat: "peliculas" },
  { e: "🧸🤠🚀", a: "Toy Story", cat: "peliculas" },
  { e: "🦖🏝️🚙", a: "Jurassic Park", alt: ["parque jurasico", "jurassic world"], cat: "peliculas" },
  { e: "🧙‍♂️💍🌋", a: "El señor de los anillos", alt: ["the lord of the rings"], cat: "peliculas" },
  { e: "👽📞🏠", a: "E.T.", alt: ["et", "e t", "et el extraterrestre"], cat: "peliculas" },
  { e: "🏠🎈👴", a: "Up", alt: ["up una aventura de altura"], cat: "peliculas" },
  { e: "🐀👨‍🍳", a: "Ratatouille", cat: "peliculas" },
  { e: "🧜‍♀️🐚", a: "La sirenita", alt: ["the little mermaid"], cat: "peliculas" },
  { e: "🦈🏖️😱", a: "Tiburón", alt: ["jaws"], cat: "peliculas" },
  { e: "👻🚫🔫", a: "Los cazafantasmas", alt: ["cazafantasmas", "ghostbusters"], cat: "peliculas" },
  { e: "⏰🚗🔙", a: "Volver al futuro", alt: ["back to the future", "regreso al futuro"], cat: "peliculas" },
  { e: "🐼🥋", a: "Kung Fu Panda", cat: "peliculas" },
  { e: "🤖❤️🌱", a: "Wall-E", alt: ["wall e", "walle"], cat: "peliculas" },
  { e: "🍫🏭🎩", a: "Charlie y la fábrica de chocolate", alt: ["la fabrica de chocolate"], cat: "peliculas" },
  { e: "🧊🐘🦥🐿️", a: "La era de hielo", alt: ["la era del hielo", "ice age"], cat: "peliculas" },
  { e: "🧞‍♂️🪔🐒", a: "Aladdín", alt: ["aladino"], cat: "peliculas" },
  { e: "🌹👸👹", a: "La bella y la bestia", cat: "peliculas" },
  { e: "💀🎸🌼", a: "Coco", cat: "peliculas" },
  { e: "🚗⚡🏁", a: "Cars", alt: ["rayo mcqueen"], cat: "peliculas" },
  { e: "🧙‍♂️⚡👓", a: "Harry Potter", cat: "peliculas" },
  { e: "🦍🏙️✈️", a: "King Kong", cat: "peliculas" },
  { e: "🟢👹🫅", a: "Shrek", cat: "peliculas" },
  { e: "👧🏻🐉💨", a: "El viaje de Chihiro", alt: ["chihiro"], cat: "peliculas" },
  { e: "🧠😀😢😡", a: "Intensamente", alt: ["inside out", "del reves"], cat: "peliculas" },
  { e: "🦸‍♂️🔨⚡", a: "Thor", cat: "peliculas" },
  { e: "👨‍👩‍👧‍👦🦸💥", a: "Los increíbles", alt: ["the incredibles", "increibles"], cat: "peliculas" },

  // Series y dibujitos
  { e: "🧽🍍🌊", a: "Bob Esponja", alt: ["bob esponja pantalones cuadrados", "spongebob"], cat: "series" },
  { e: "🍩👨‍👩‍👧‍👦💛", a: "Los Simpson", alt: ["simpson", "los simpsons", "the simpsons"], cat: "series" },
  { e: "🐉👑❄️⚔️", a: "Juego de tronos", alt: ["game of thrones"], cat: "series" },
  { e: "👨‍🏫🧪💵", a: "Breaking Bad", cat: "series" },
  { e: "🦑🎮💰", a: "El juego del calamar", alt: ["squid game", "juego del calamar"], cat: "series" },
  { e: "🏦💰🎭", a: "La casa de papel", alt: ["money heist"], cat: "series" },
  { e: "🔦🚲👾", a: "Stranger Things", cat: "series" },
  { e: "☕👫🛋️", a: "Friends", cat: "series" },
  { e: "🐶🔍👻", a: "Scooby-Doo", alt: ["scooby doo", "scooby"], cat: "series" },
  { e: "🐶🐾🚒", a: "Paw Patrol", alt: ["patrulla canina", "la patrulla canina"], cat: "series" },
  { e: "🐷👧☔", a: "Peppa Pig", alt: ["peppa"], cat: "series" },
  { e: "🪨👨‍👩‍👧🦕", a: "Los Picapiedra", alt: ["los picapiedras", "picapiedra", "the flintstones"], cat: "series" },
  { e: "🐉⚽", a: "Dragon Ball", alt: ["dragon ball z", "dragon ball super"], cat: "series" },
  { e: "⚡🐭🔴", a: "Pokémon", alt: ["pikachu"], cat: "series" },
  { e: "🧟‍♂️🚶‍♂️🚶‍♀️", a: "The Walking Dead", alt: ["walking dead", "los muertos vivientes"], cat: "series" },
  { e: "🛢️👦🍞", a: "El Chavo del 8", alt: ["el chavo", "chavo del ocho", "el chavo del ocho"], cat: "series" },
  { e: "🏢📄🧔", a: "The Office", alt: ["la oficina"], cat: "series" },
  { e: "🐢🥷🍕", a: "Las tortugas ninja", alt: ["tortugas ninja", "ninja turtles"], cat: "series" },
  { e: "👩‍⚕️🏥💔", a: "Grey's Anatomy", alt: ["greys anatomy", "anatomia de grey"], cat: "series" },
  { e: "🧪👴👦🛸", a: "Rick y Morty", alt: ["rick and morty"], cat: "series" },
  { e: "🐱🐭💥", a: "Tom y Jerry", alt: ["tom and jerry"], cat: "series" },
  { e: "👑👸🇬🇧", a: "The Crown", alt: ["la corona"], cat: "series" },
  { e: "🕵️‍♂️🎻🇬🇧", a: "Sherlock", alt: ["sherlock holmes"], cat: "series" },
  { e: "🧛‍♀️🖤👧🏻🎻", a: "Merlina", alt: ["wednesday", "miercoles"], cat: "series" },
  { e: "🚀👨‍👩‍👦🤖", a: "Los Supersónicos", alt: ["supersonicos", "the jetsons", "los jetsons"], cat: "series" },

  // Dichos y refranes
  { e: "🤐🪰", a: "En boca cerrada no entran moscas", cat: "dichos" },
  { e: "✋🐦 > 💯🐦🐦", a: "Más vale pájaro en mano que cien volando", cat: "dichos" },
  { e: "⛈️🙂", a: "Al mal tiempo buena cara", cat: "dichos" },
  { e: "🐴🎁🚫🦷", a: "A caballo regalado no se le miran los dientes", alt: ["a caballo regalado no se le mira el diente"], cat: "dichos" },
  { e: "🦐😴🌊", a: "Camarón que se duerme se lo lleva la corriente", cat: "dichos" },
  { e: "🐕🔊🚫🦷", a: "Perro que ladra no muerde", cat: "dichos" },
  { e: "⏰🌅🙏", a: "Al que madruga Dios lo ayuda", alt: ["a quien madruga dios le ayuda"], cat: "dichos" },
  { e: "🙈❤️", a: "Ojos que no ven corazón que no siente", cat: "dichos" },
  { e: "⏰🥇", a: "El tiempo es oro", cat: "dichos" },
  { e: "🐒👗🐒", a: "Aunque la mona se vista de seda mona queda", cat: "dichos" },
  { e: "🪵🪵", a: "De tal palo tal astilla", cat: "dichos" },
  { e: "🐦‍⬛🍼👁️", a: "Cría cuervos y te sacarán los ojos", cat: "dichos" },
  { e: "🔨🏠🔪🪵", a: "En casa de herrero cuchillo de palo", cat: "dichos" },
  { e: "🌊🎣💰", a: "A río revuelto ganancia de pescadores", cat: "dichos" },
  { e: "🌙🐈🐈🐈", a: "De noche todos los gatos son pardos", cat: "dichos" },
  { e: "👔🐢⏰", a: "Vísteme despacio que estoy apurado", alt: ["vistete despacio que estoy apurado", "visteme despacio que tengo prisa"], cat: "dichos" },
  { e: "⏰🐢✅", a: "Más vale tarde que nunca", cat: "dichos" },
  { e: "😞➡️😊", a: "No hay mal que por bien no venga", cat: "dichos" },
  { e: "🍞🧅❤️", a: "Contigo pan y cebolla", cat: "dichos" },
  { e: "🐟💀👄", a: "Por la boca muere el pez", cat: "dichos" },
  { e: "🌳👀🌲🌲🌲", a: "Los árboles no dejan ver el bosque", alt: ["el arbol no deja ver el bosque"], cat: "dichos" },
  { e: "🏃‍♂️💨🥅⛔", a: "Hecha la ley hecha la trampa", cat: "dichos" },
  { e: "🐕💀😡❌", a: "Muerto el perro se acabó la rabia", cat: "dichos" },
  { e: "👀🔁👀", a: "Ojo por ojo", alt: ["ojo por ojo diente por diente"], cat: "dichos" },

  // Países y lugares
  { e: "🗼🥐🎨", a: "París", alt: ["francia"], cat: "lugares" },
  { e: "🍕🏛️🛵", a: "Italia", alt: ["roma"], cat: "lugares" },
  { e: "🗽🍎🚕", a: "Nueva York", alt: ["new york"], cat: "lugares" },
  { e: "🌮🌵🎺", a: "México", alt: ["mejico"], cat: "lugares" },
  { e: "🦘🐨🏄", a: "Australia", cat: "lugares" },
  { e: "🍣🗻🎌", a: "Japón", alt: ["tokio"], cat: "lugares" },
  { e: "🐼🧧🏯", a: "China", cat: "lugares" },
  { e: "🥘💃🐂", a: "España", alt: ["madrid"], cat: "lugares" },
  { e: "🧉🥩⚽", a: "Argentina", cat: "lugares" },
  { e: "☕🦜🌴", a: "Colombia", cat: "lugares" },
  { e: "🏖️🦜⚽🎉", a: "Brasil", alt: ["rio de janeiro"], cat: "lugares" },
  { e: "🎰💡🏜️", a: "Las Vegas", cat: "lugares" },
  { e: "🐫🔺☀️", a: "Egipto", cat: "lugares" },
  { e: "☘️🍺🎻", a: "Irlanda", cat: "lugares" },
  { e: "💂🎡☔", a: "Londres", alt: ["inglaterra", "reino unido"], cat: "lugares" },
  { e: "🍫⌚🏔️", a: "Suiza", cat: "lugares" },
  { e: "🌷🚲🧀", a: "Holanda", alt: ["paises bajos", "amsterdam"], cat: "lugares" },
  { e: "🦙⛰️🏛️", a: "Machu Picchu", alt: ["peru", "cusco", "cuzco"], cat: "lugares" },
  { e: "🥨🍺🏰", a: "Alemania", alt: ["berlin", "munich"], cat: "lugares" },
  { e: "🧊🌋🐋", a: "Islandia", cat: "lugares" },
  { e: "🐘🍛🕌", a: "India", cat: "lugares" },
  { e: "🍁🏒🫎", a: "Canadá", cat: "lugares" },
  { e: "🪆❄️🏰", a: "Rusia", alt: ["moscu"], cat: "lugares" },
  { e: "💧🌈🌿", a: "Cataratas del Iguazú", alt: ["iguazu", "las cataratas"], cat: "lugares" },
  { e: "🐧🧊🌎⬇️", a: "Antártida", alt: ["antartida", "antartica", "polo sur"], cat: "lugares" },
  { e: "🎅❄️🦌", a: "Polo Norte", alt: ["laponia"], cat: "lugares" },
  { e: "🏰🐭✨", a: "Disney", alt: ["disneylandia", "disney world", "disneyland"], cat: "lugares" },
];
