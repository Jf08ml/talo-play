"use client";

import { QUESTION_COUNT_OPTIONS, SECONDS_OPTIONS, createTriviaRoom, normalizeMeta } from "@/lib/trivia";
import { TRIVIA_CATEGORIES, type TriviaCategory } from "@/lib/triviaQuestions";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { questionCount: number; seconds: number; categories: TriviaCategory[] };

export const SETTINGS: GameSettings<Settings> = {
  game: "trivia",
  initial: { questionCount: 10, seconds: 20, categories: TRIVIA_CATEGORIES.map((c) => c.id) },
  fields: [
    { kind: "choice", key: "questionCount", label: "Preguntas", options: choices(QUESTION_COUNT_OPTIONS, (n) => `${n}`) },
    { kind: "choice", key: "seconds", label: "Tiempo por pregunta", options: choices(SECONDS_OPTIONS, (n) => `${n} s`) },
    {
      kind: "multi",
      key: "categories",
      label: "Categorías",
      options: TRIVIA_CATEGORIES.map((c) => ({ value: c.id, label: `${c.emoji} ${c.label}` })),
    },
  ],
  problem: (v) => (v.categories.length === 0 ? "Elegí al menos una categoría." : null),
  create: (v, hostId) => createTriviaRoom(v, hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "trivia/state", v),
  fromMeta: (meta) => normalizeMeta(meta),
};
