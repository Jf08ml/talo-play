"use client";

import { QUESTION_COUNT_OPTIONS, SECONDS_OPTIONS, createEmojisRoom, normalizeMeta } from "@/lib/emojis";
import { EMOJI_CATEGORIES, type EmojiCategory } from "@/lib/emojiPuzzles";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { questionCount: number; seconds: number; categories: EmojiCategory[] };

export const SETTINGS: GameSettings<Settings> = {
  game: "emojis",
  initial: { questionCount: 10, seconds: 45, categories: EMOJI_CATEGORIES.map((c) => c.id) },
  fields: [
    { kind: "choice", key: "questionCount", label: "Acertijos", options: choices(QUESTION_COUNT_OPTIONS, (n) => `${n}`) },
    { kind: "choice", key: "seconds", label: "Tiempo por acertijo", options: choices(SECONDS_OPTIONS, (n) => `${n} s`) },
    {
      kind: "multi",
      key: "categories",
      label: "Categorías",
      layout: 2,
      options: EMOJI_CATEGORIES.map((c) => ({ value: c.id, label: `${c.emoji} ${c.label}` })),
    },
  ],
  problem: (v) => (v.categories.length === 0 ? "Elegí al menos una categoría." : null),
  create: (v, hostId) => createEmojisRoom(v, hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "emojis/state", v),
  fromMeta: (meta) => normalizeMeta(meta),
};
