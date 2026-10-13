"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MAX_CUSTOM_PROMPTS, MAX_PROMPT_LENGTH, QUESTION_OPTIONS, createProbableRoom } from "@/lib/probable";
import { PROBABLE_DECKS, type ProbableDeck } from "@/lib/probablePrompts";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";

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

export default function ProbableHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [decks, setDecks] = useState<ProbableDeck[]>(["tranqui", "amigos"]);
  const [questions, setQuestions] = useState<number>(10);
  const [promptsText, setPromptsText] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const customPrompts = parsePrompts(promptsText);
  const empty = decks.length === 0 && customPrompts.length < 3;

  const toggle = (id: ProbableDeck) => setDecks((ds) => (ds.includes(id) ? ds.filter((d) => d !== id) : [...ds, id]));

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (empty) return;
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createProbableRoom({ decks, customPrompts, questions }, identity.clientId);
      router.push(roomPath("probable", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="probable">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Frases</p>
          <div className="flex flex-col gap-1.5">
            {PROBABLE_DECKS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => toggle(d.id)}
                aria-pressed={decks.includes(d.id)}
                className={`${chipClass(decks.includes(d.id))} flex items-baseline gap-2 !px-3 !py-2 text-left`}
              >
                <span className="text-sm">
                  {d.emoji} {d.label}
                </span>
                <span className="font-normal opacity-70">{d.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={SECTION_LABEL}>Cantidad de preguntas</p>
          <div className="grid grid-cols-3 gap-1.5">
            {QUESTION_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setQuestions(n)} className={chipClass(questions === n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={SECTION_LABEL}>Frases propias (opcional)</p>
          <textarea
            value={promptsText}
            onChange={(e) => setPromptsText(e.target.value)}
            rows={3}
            placeholder={"Una por línea. ¿Quién es más probable que…\nse quede dormido en la reunión\nse olvide el regalo"}
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
          />
          {customPrompts.length > 0 && <p className="mt-1 text-xs text-slate-500">{customPrompts.length} propias</p>}
        </div>

        {empty && (
          <p className="text-sm text-amber-300/90">Elegí al menos un grupo de frases o escribí 3 propias.</p>
        )}
        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating || empty} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
