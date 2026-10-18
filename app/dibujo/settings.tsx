"use client";

import { DRAW_SECONDS_OPTIONS, MAX_CUSTOM_WORDS, MAX_WORD_LENGTH, ROUND_OPTIONS, createDibujoRoom } from "@/lib/dibujo";
import { DEFAULT_WORDS } from "@/lib/dibujoWords";
import { saveRoomSettings } from "@/lib/roomSettings";
import { SettingsTextArea, choices, type GameSettings } from "@/components/RoomSettings";

type Settings = { rounds: number; drawSeconds: number; wordsText: string; useDefaultWords: boolean };

/** One word per line or separated by commas. */
function parseWords(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((w) => w.trim().slice(0, MAX_WORD_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_CUSTOM_WORDS);
}

export const SETTINGS: GameSettings<Settings> = {
  game: "dibujo",
  initial: { rounds: 2, drawSeconds: 80, wordsText: "", useDefaultWords: true },
  fields: [
    {
      kind: "choice",
      key: "rounds",
      label: "Vueltas (cuántas veces dibuja cada uno)",
      options: choices(ROUND_OPTIONS, (n) => `${n} ${n === 1 ? "vuelta" : "vueltas"}`),
    },
    { kind: "choice", key: "drawSeconds", label: "Tiempo para dibujar", options: choices(DRAW_SECONDS_OPTIONS, (s) => `${s} s`) },
    {
      kind: "custom",
      render: (v, set) => {
        const n = parseWords(v.wordsText).length;
        return (
          <SettingsTextArea
            label="Palabras propias (opcional)"
            value={v.wordsText}
            onChange={(wordsText) => set({ wordsText })}
            placeholder="Una por línea o separadas por comas: oficina, café, el jefe…"
            footer={n > 0 && <p className="mt-1 text-xs text-slate-500">{n} propias</p>}
          />
        );
      },
    },
    { kind: "toggle", key: "useDefaultWords", label: `Sumar las ${DEFAULT_WORDS.length} palabras incluidas` },
  ],
  problem: (v) =>
    !v.useDefaultWords && parseWords(v.wordsText).length < 3 ? "Sin las palabras incluidas, escribí al menos 3 propias." : null,
  create: (v, hostId) =>
    createDibujoRoom(
      { rounds: v.rounds, drawSeconds: v.drawSeconds, customWords: parseWords(v.wordsText), useDefaultWords: v.useDefaultWords },
      hostId
    ),
  save: (roomId, v) => {
    const customWords = parseWords(v.wordsText);
    return saveRoomSettings(roomId, "dibujo/state", {
      rounds: v.rounds,
      drawSeconds: v.drawSeconds,
      useDefaultWords: v.useDefaultWords || customWords.length === 0,
      customWords: customWords.length ? customWords : null,
    });
  },
  fromMeta: (meta) => ({
    rounds: meta.rounds ?? 2,
    drawSeconds: meta.drawSeconds ?? 80,
    wordsText: (meta.customWords ?? []).join(", "),
    useDefaultWords: meta.useDefaultWords ?? true,
  }),
};
