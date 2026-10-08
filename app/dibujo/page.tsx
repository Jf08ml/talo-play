"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createDibujoRoom,
  DRAW_SECONDS_OPTIONS,
  MAX_CUSTOM_WORDS,
  MAX_WORD_LENGTH,
  ROUND_OPTIONS,
} from "@/lib/dibujo";
import { DEFAULT_WORDS } from "@/lib/dibujoWords";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";

/** One word per line or separated by commas. */
function parseWords(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((w) => w.trim().slice(0, MAX_WORD_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_CUSTOM_WORDS);
}

export default function DibujoHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [rounds, setRounds] = useState<number>(2);
  const [drawSeconds, setDrawSeconds] = useState<number>(80);
  const [wordsText, setWordsText] = useState("");
  const [useDefaultWords, setUseDefaultWords] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const customWords = parseWords(wordsText);
  const tooFewCustom = !useDefaultWords && customWords.length < 3;

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (tooFewCustom) return;
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createDibujoRoom({ rounds, drawSeconds, customWords, useDefaultWords }, identity.clientId);
      router.push(roomPath("dibujo", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="dibujo">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Vueltas (cuántas veces dibuja cada uno)</p>
          <div className="grid grid-cols-3 gap-1.5">
            {ROUND_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setRounds(n)} className={chipClass(rounds === n)}>
                {n} {n === 1 ? "vuelta" : "vueltas"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={SECTION_LABEL}>Tiempo para dibujar</p>
          <div className="grid grid-cols-3 gap-1.5">
            {DRAW_SECONDS_OPTIONS.map((sec) => (
              <button key={sec} type="button" onClick={() => setDrawSeconds(sec)} className={chipClass(drawSeconds === sec)}>
                {sec} s
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={SECTION_LABEL}>Palabras propias (opcional)</p>
          <textarea
            value={wordsText}
            onChange={(e) => setWordsText(e.target.value)}
            rows={3}
            placeholder="Una por línea o separadas por comas: oficina, café, el jefe…"
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={useDefaultWords}
                onChange={(e) => setUseDefaultWords(e.target.checked)}
                className="h-4 w-4 accent-violet-500"
              />
              Sumar las {DEFAULT_WORDS.length} palabras incluidas
            </label>
            {customWords.length > 0 && (
              <span className="text-xs text-slate-500">{customWords.length} propias</span>
            )}
          </div>
        </div>

        {tooFewCustom && (
          <p className="text-sm text-amber-300/90">
            Sin las palabras incluidas, escribí al menos 3 propias.
          </p>
        )}
        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating || tooFewCustom} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
