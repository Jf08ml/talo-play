"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createEmojisRoom, QUESTION_COUNT_OPTIONS, SECONDS_OPTIONS } from "@/lib/emojis";
import { EMOJI_CATEGORIES, type EmojiCategory } from "@/lib/emojiPuzzles";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";

export default function EmojisHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [seconds, setSeconds] = useState<number>(45);
  const [categories, setCategories] = useState<EmojiCategory[]>(EMOJI_CATEGORIES.map((c) => c.id));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const toggle = (id: EmojiCategory) =>
    setCategories((cs) => (cs.includes(id) ? cs.filter((c) => c !== id) : [...cs, id]));

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (categories.length === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createEmojisRoom({ questionCount, seconds, categories }, identity.clientId);
      router.push(roomPath("emojis", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="emojis">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Acertijos</p>
          <div className="grid grid-cols-3 gap-1.5">
            {QUESTION_COUNT_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setQuestionCount(n)} className={chipClass(questionCount === n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={SECTION_LABEL}>Tiempo por acertijo</p>
          <div className="grid grid-cols-3 gap-1.5">
            {SECONDS_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setSeconds(n)} className={chipClass(seconds === n)}>
                {n} s
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={SECTION_LABEL}>Categorías</p>
          <div className="grid grid-cols-2 gap-1.5">
            {EMOJI_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                aria-pressed={categories.includes(c.id)}
                className={chipClass(categories.includes(c.id))}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          {categories.length === 0 && <p className="mt-1.5 text-xs text-amber-300">Elegí al menos una categoría.</p>}
        </div>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating || categories.length === 0} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
