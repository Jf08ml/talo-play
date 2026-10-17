"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { createYoNuncaRoom, QUESTION_OPTIONS } from "@/lib/yonunca";
import { YONUNCA_LEVELS, type YoNuncaLevel } from "@/lib/yonuncaPrompts";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";

export default function YoNuncaHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [levels, setLevels] = useState<YoNuncaLevel[]>(["tranqui"]);
  const [questions, setQuestions] = useState<number>(25);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const toggle = (id: YoNuncaLevel) => setLevels((ls) => (ls.includes(id) ? ls.filter((l) => l !== id) : [...ls, id]));

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (levels.length === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createYoNuncaRoom({ levels, questions }, identity.clientId);
      trackEvent("create_room", { game: "yonunca" });
      router.push(roomPath("yonunca", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="yonunca">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Nivel</p>
          <div className="flex flex-col gap-1.5">
            {YONUNCA_LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => toggle(l.id)}
                aria-pressed={levels.includes(l.id)}
                className={`${chipClass(levels.includes(l.id))} flex items-baseline gap-2 !px-3 !py-2 text-left`}
              >
                <span className="text-sm">
                  {l.emoji} {l.label}
                </span>
                <span className="font-normal opacity-70">{l.hint}</span>
              </button>
            ))}
          </div>
          {levels.length === 0 && <p className="mt-1.5 text-xs text-amber-300">Elegí al menos un nivel.</p>}
        </div>

        <div>
          <p className={SECTION_LABEL}>Frases</p>
          <div className="grid grid-cols-3 gap-1.5">
            {QUESTION_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setQuestions(n)} className={chipClass(questions === n)}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <p className="text-sm text-slate-400">
          Nadie ve tu respuesta hasta que contestan todos. Sirve en persona o por videollamada.
        </p>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating || levels.length === 0} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
