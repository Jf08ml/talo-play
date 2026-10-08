// Content for Memotest decks: emoji themes and ready-made text pair lists.
// Every emoji theme needs at least MAX_PAIRS (18) entries. Avoid flag emojis:
// Windows renders them as two letters.

export interface EmojiTheme {
  id: string;
  label: string;
  emojis: string[];
}

export const EMOJI_THEMES: EmojiTheme[] = [
  {
    // Must stay first and unchanged: rooms created before themes existed use it.
    id: "variado",
    label: "🎲 Variado",
    emojis: [
      "🐶", "🐱", "🦊", "🐼", "🐸", "🐵", "🦁", "🐯", "🐨", "🐷", "🐙", "🦄",
      "🐝", "🐢", "🦋", "🐬", "🍕", "🍔", "🍉", "🍓", "🍌", "🍒", "🥑", "🌮",
      "⚽", "🏀", "🎸", "🚀", "🌈", "⭐", "🎈", "🍩",
    ],
  },
  {
    id: "animales",
    label: "🐾 Animales",
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮",
      "🐷", "🐸", "🐵", "🐔", "🐧", "🦆", "🦉", "🐴", "🦄", "🐝", "🐢", "🐙",
      "🦋", "🐬", "🐳", "🦒",
    ],
  },
  {
    id: "comida",
    label: "🍕 Comida",
    emojis: [
      "🍕", "🍔", "🌭", "🌮", "🌯", "🍟", "🥐", "🥨", "🧀", "🍳", "🥞", "🍩",
      "🍪", "🎂", "🍫", "🍿", "🍉", "🍓", "🍌", "🍒", "🍍", "🥑", "🍇", "🍎",
      "🥝", "🌽", "🥕", "🥦",
    ],
  },
  {
    id: "deportes",
    label: "⚽ Deportes",
    emojis: [
      "⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏉", "🎱", "🏓", "🏸", "🏒", "🥊",
      "🥋", "⛳", "🏹", "🎣", "🛹", "🥌", "🎿", "🏆", "🥇", "🚴", "🏊", "🏄",
    ],
  },
  {
    id: "caras",
    label: "😎 Caras",
    emojis: [
      "😀", "😂", "😍", "😎", "🤓", "😜", "🤔", "😴", "🤯", "🥳", "😇", "🤠",
      "🤡", "👻", "💀", "👽", "🤖", "😈", "🙃", "😬", "🥶", "🥵", "🤑", "🤐",
    ],
  },
  {
    id: "naturaleza",
    label: "🌻 Naturaleza",
    emojis: [
      "🌵", "🌲", "🌴", "🌻", "🌹", "🌷", "🍄", "🌈", "⭐", "🌙", "☀️", "⚡",
      "❄️", "🔥", "🌊", "🌍", "🪐", "☄️", "🌋", "🌸", "🍁", "🍀",
    ],
  },
];

export interface TextPair {
  a: string;
  b: string;
}

export const TEXT_PRESETS: { label: string; pairs: TextPair[] }[] = [
  {
    label: "Países y capitales",
    pairs: [
      { a: "Argentina", b: "Buenos Aires" },
      { a: "Uruguay", b: "Montevideo" },
      { a: "Chile", b: "Santiago" },
      { a: "Perú", b: "Lima" },
      { a: "Colombia", b: "Bogotá" },
      { a: "México", b: "Ciudad de México" },
      { a: "España", b: "Madrid" },
      { a: "Brasil", b: "Brasilia" },
    ],
  },
  {
    label: "Inglés ↔ Español",
    pairs: [
      { a: "Dog", b: "Perro" },
      { a: "House", b: "Casa" },
      { a: "Apple", b: "Manzana" },
      { a: "Book", b: "Libro" },
      { a: "Water", b: "Agua" },
      { a: "Friend", b: "Amigo" },
      { a: "Sun", b: "Sol" },
      { a: "Car", b: "Auto" },
    ],
  },
  {
    label: "Tablas de multiplicar",
    pairs: [
      { a: "3 × 4", b: "12" },
      { a: "6 × 7", b: "42" },
      { a: "8 × 8", b: "64" },
      { a: "9 × 6", b: "54" },
      { a: "7 × 8", b: "56" },
      { a: "5 × 9", b: "45" },
      { a: "4 × 6", b: "24" },
      { a: "9 × 9", b: "81" },
    ],
  },
];
