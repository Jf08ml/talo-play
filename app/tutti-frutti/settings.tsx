"use client";

import { useState } from "react";
import {
  MAX_CATEGORIES,
  MAX_CATEGORY_LENGTH,
  MIN_CATEGORIES,
  ROUND_OPTIONS,
  ROUND_SECONDS_OPTIONS,
  createTuttiRoom,
} from "@/lib/tutti";
import { DEFAULT_CATEGORIES, EASY_LETTERS, HARD_LETTERS, SUGGESTED_CATEGORIES } from "@/lib/tuttiCategories";
import { saveRoomSettings } from "@/lib/roomSettings";
import { choices, type GameSettings } from "@/components/RoomSettings";
import { SECTION_LABEL, chipClass } from "@/components/ui";

type Settings = { categories: string[]; rounds: number; roundSeconds: number; hardLetters: boolean };

function CategoryPicker({ categories, onChange }: { categories: string[]; onChange: (c: string[]) => void }) {
  const [custom, setCustom] = useState("");
  const all = [...SUGGESTED_CATEGORIES, ...categories.filter((c) => !SUGGESTED_CATEGORIES.includes(c))];
  const full = categories.length >= MAX_CATEGORIES;
  const toggle = (cat: string) =>
    onChange(categories.includes(cat) ? categories.filter((c) => c !== cat) : full ? categories : [...categories, cat]);
  const addCustom = () => {
    const name = custom.trim().slice(0, MAX_CATEGORY_LENGTH);
    if (!name || full) return;
    if (!categories.some((c) => c.toLowerCase() === name.toLowerCase())) onChange([...categories, name]);
    setCustom("");
  };
  return (
    <div>
      <p className={SECTION_LABEL}>
        Categorías ({categories.length}/{MAX_CATEGORIES})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {all.map((cat) => (
          <button key={cat} type="button" onClick={() => toggle(cat)} className={chipClass(categories.includes(cat))}>
            {cat}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Otra categoría…"
          maxLength={MAX_CATEGORY_LENGTH}
          disabled={full}
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-500 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!custom.trim() || full}
          className="rounded-md border border-slate-700 px-3 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40"
        >
          Agregar
        </button>
      </div>
    </div>
  );
}

const lettersOf = (v: Settings) => (v.hardLetters ? EASY_LETTERS + HARD_LETTERS : EASY_LETTERS);

export const SETTINGS: GameSettings<Settings> = {
  game: "tutti",
  initial: { categories: DEFAULT_CATEGORIES, rounds: 5, roundSeconds: 0, hardLetters: false },
  fields: [
    { kind: "custom", render: (v, set) => <CategoryPicker categories={v.categories} onChange={(categories) => set({ categories })} /> },
    { kind: "choice", key: "rounds", label: "Rondas", options: choices(ROUND_OPTIONS, (n) => `${n} rondas`) },
    {
      kind: "choice",
      key: "roundSeconds",
      label: "Tiempo por ronda",
      layout: 4,
      options: choices(ROUND_SECONDS_OPTIONS, (sec) =>
        sec === 0 ? "Sin límite" : sec % 60 === 0 ? `${sec / 60} min` : `${sec} s`
      ),
    },
    { kind: "toggle", key: "hardLetters", label: `Incluir letras difíciles (${HARD_LETTERS.split("").join(", ")})` },
  ],
  problem: (v) => (v.categories.length < MIN_CATEGORIES ? `Elegí al menos ${MIN_CATEGORIES} categorías.` : null),
  create: (v, hostId) =>
    createTuttiRoom({ categories: v.categories, rounds: v.rounds, roundSeconds: v.roundSeconds, letters: lettersOf(v) }, hostId),
  save: (roomId, v) =>
    saveRoomSettings(roomId, "tutti/state", {
      categories: v.categories.map((c) => c.trim().slice(0, MAX_CATEGORY_LENGTH)),
      rounds: Math.min(v.rounds, lettersOf(v).length),
      roundSeconds: v.roundSeconds,
      letters: lettersOf(v),
    }),
  fromMeta: (meta) => ({
    categories: meta.categories ?? DEFAULT_CATEGORIES,
    rounds: meta.rounds ?? 5,
    roundSeconds: meta.roundSeconds ?? 0,
    hardLetters: (meta.letters ?? EASY_LETTERS).length > EASY_LETTERS.length,
  }),
};
