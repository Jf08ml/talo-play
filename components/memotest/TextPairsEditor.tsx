"use client";

import { TEXT_PRESETS, type TextPair } from "@/lib/memotestDecks";
import { chipClass } from "@/components/ui";

const INPUT =
  "min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-500";

/** Editable list of "A ↔ B" text pairs, with ready-made presets to start from. */
export default function TextPairsEditor({
  pairs,
  onChange,
  max,
  maxLength,
}: {
  pairs: TextPair[];
  onChange: (pairs: TextPair[]) => void;
  max: number;
  maxLength: number;
}) {
  const set = (i: number, patch: Partial<TextPair>) =>
    onChange(pairs.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        <span className="self-center text-xs text-slate-500">Ejemplos:</span>
        {TEXT_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange(preset.pairs)}
            className={chipClass(false)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1">
        {pairs.map((p, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={p.a}
              onChange={(e) => set(i, { a: e.target.value })}
              placeholder="Carta A"
              maxLength={maxLength}
              className={INPUT}
            />
            <span className="text-slate-500">↔</span>
            <input
              value={p.b}
              onChange={(e) => set(i, { b: e.target.value })}
              placeholder="Carta B"
              maxLength={maxLength}
              className={INPUT}
            />
            <button
              type="button"
              onClick={() => onChange(pairs.filter((_, j) => j !== i))}
              aria-label="Quitar par"
              className="px-1 text-slate-500 hover:text-red-400"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {pairs.length < max && (
        <button
          type="button"
          onClick={() => onChange([...pairs, { a: "", b: "" }])}
          className="rounded-md border border-dashed border-slate-700 py-1.5 text-sm text-slate-400 hover:border-slate-500 hover:text-slate-200"
        >
          + Agregar par
        </button>
      )}
    </div>
  );
}
