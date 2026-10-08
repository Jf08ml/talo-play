"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createTuttiRoom,
  MAX_CATEGORIES,
  MAX_CATEGORY_LENGTH,
  MIN_CATEGORIES,
  ROUND_OPTIONS,
  ROUND_SECONDS_OPTIONS,
} from "@/lib/tutti";
import { DEFAULT_CATEGORIES, EASY_LETTERS, HARD_LETTERS, SUGGESTED_CATEGORIES } from "@/lib/tuttiCategories";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";

export default function TuttiHome() {
  const router = useRouter();
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [custom, setCustom] = useState("");
  const [rounds, setRounds] = useState<number>(5);
  const [roundSeconds, setRoundSeconds] = useState<number>(0);
  const [hardLetters, setHardLetters] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const all = [...SUGGESTED_CATEGORIES, ...categories.filter((c) => !SUGGESTED_CATEGORIES.includes(c))];
  const full = categories.length >= MAX_CATEGORIES;

  const toggle = (cat: string) =>
    setCategories((cs) => (cs.includes(cat) ? cs.filter((c) => c !== cat) : full ? cs : [...cs, cat]));

  const addCustom = () => {
    const name = custom.trim().slice(0, MAX_CATEGORY_LENGTH);
    if (!name || full) return;
    if (!categories.some((c) => c.toLowerCase() === name.toLowerCase())) setCategories([...categories, name]);
    setCustom("");
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (categories.length < MIN_CATEGORIES) return;
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createTuttiRoom({
        categories,
        rounds,
        roundSeconds,
        letters: hardLetters ? EASY_LETTERS + HARD_LETTERS : EASY_LETTERS,
      });
      router.push(roomPath("tutti", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby
      game="tutti"
      description="Sale una letra y hay que completar cada categoría con una palabra que empiece con ella. El primero que termina grita ¡Basta! y se cierra la ronda para todos."
    >
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

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

        <div>
          <p className={SECTION_LABEL}>Rondas</p>
          <div className="grid grid-cols-3 gap-1.5">
            {ROUND_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setRounds(n)} className={chipClass(rounds === n)}>
                {n} rondas
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={SECTION_LABEL}>Tiempo por ronda</p>
          <div className="grid grid-cols-4 gap-1.5">
            {ROUND_SECONDS_OPTIONS.map((sec) => (
              <button key={sec} type="button" onClick={() => setRoundSeconds(sec)} className={chipClass(roundSeconds === sec)}>
                {sec === 0 ? "Sin límite" : `${sec / 60 >= 1 && sec % 60 === 0 ? `${sec / 60} min` : `${sec} s`}`}
              </button>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={hardLetters}
            onChange={(e) => setHardLetters(e.target.checked)}
            className="h-4 w-4 accent-violet-500"
          />
          Incluir letras difíciles ({HARD_LETTERS.split("").join(", ")})
        </label>

        {categories.length < MIN_CATEGORIES && (
          <p className="text-sm text-amber-300/90">Elegí al menos {MIN_CATEGORIES} categorías.</p>
        )}
        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button
          type="submit"
          disabled={creating || categories.length < MIN_CATEGORIES}
          className={`mt-auto ${PRIMARY_BUTTON}`}
        >
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
