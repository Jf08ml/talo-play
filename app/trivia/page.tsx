"use client";

import { trackEvent } from "@/lib/analytics";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createTriviaRoom, QUESTION_COUNT_OPTIONS, SECONDS_OPTIONS } from "@/lib/trivia";
import { TRIVIA_CATEGORIES, type TriviaCategory } from "@/lib/triviaQuestions";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";

export default function TriviaHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [seconds, setSeconds] = useState<number>(20);
  const [categories, setCategories] = useState<TriviaCategory[]>(TRIVIA_CATEGORIES.map((c) => c.id));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const toggle = (id: TriviaCategory) =>
    setCategories((cs) => (cs.includes(id) ? cs.filter((c) => c !== id) : [...cs, id]));

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (categories.length === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createTriviaRoom({ questionCount, seconds, categories }, identity.clientId);
      trackEvent("create_room", { game: "trivia" });
      router.push(roomPath("trivia", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="trivia">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Preguntas</p>
          <div className="grid grid-cols-3 gap-1.5">
            {QUESTION_COUNT_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setQuestionCount(n)} className={chipClass(questionCount === n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={SECTION_LABEL}>Tiempo por pregunta</p>
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
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {TRIVIA_CATEGORIES.map((c) => (
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
