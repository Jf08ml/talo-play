"use client";

import { MAX_CUSTOM_PROMPTS, MAX_PROMPT_LENGTH, QUESTION_OPTIONS, createProbableRoom, normalizeMeta } from "@/lib/probable";
import { PROBABLE_DECKS, type ProbableDeck } from "@/lib/probablePrompts";
import { saveRoomSettings } from "@/lib/roomSettings";
import { SettingsTextArea, choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { decks: ProbableDeck[]; questions: number; promptsText: string };

/** One phrase per line; a leading "¿Quién es más probable que" and the closing "?" are optional. */
function parsePrompts(text: string): string[] {
  return text
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^¿?\s*qui[eé]n es m[aá]s probable que\s*/i, "")
        .replace(/[?¿]+$/, "")
        .trim()
        .slice(0, MAX_PROMPT_LENGTH)
    )
    .filter(Boolean)
    .slice(0, MAX_CUSTOM_PROMPTS);
}

const toParams = (v: Settings) => ({ decks: v.decks, questions: v.questions, customPrompts: parsePrompts(v.promptsText) });

export const SETTINGS: GameSettings<Settings> = {
  game: "probable",
  initial: { decks: ["tranqui", "amigos"], questions: 10, promptsText: "" },
  fields: [
    {
      kind: "multi",
      key: "decks",
      label: "Frases",
      layout: "list",
      options: PROBABLE_DECKS.map((d) => ({ value: d.id, label: `${d.emoji} ${d.label}`, sub: d.hint })),
    },
    { kind: "choice", key: "questions", label: "Cantidad de preguntas", options: choices(QUESTION_OPTIONS, (n) => `${n}`) },
    {
      kind: "custom",
      render: (v, set) => {
        const n = parsePrompts(v.promptsText).length;
        return (
          <SettingsTextArea
            label="Frases propias (opcional)"
            value={v.promptsText}
            onChange={(promptsText) => set({ promptsText })}
            placeholder={"Una por línea. ¿Quién es más probable que…\nse quede dormido en la reunión\nse olvide el regalo"}
            footer={n > 0 && <p className="mt-1 text-xs text-slate-500">{n} propias</p>}
          />
        );
      },
    },
  ],
  problem: (v) =>
    v.decks.length === 0 && parsePrompts(v.promptsText).length < 3
      ? "Elegí al menos un grupo de frases o escribí 3 propias."
      : null,
  create: (v, hostId) => createProbableRoom(toParams(v), hostId),
  save: (roomId, v) => saveRoomSettings(roomId, "probable/state", toParams(v)),
  fromMeta: (meta) => {
    const m = normalizeMeta(meta);
    return { decks: m.decks, questions: m.questions, promptsText: (m.customPrompts ?? []).join("\n") };
  },
};
