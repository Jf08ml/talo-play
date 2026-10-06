"use client";

import { useState } from "react";

// Pieces never go back to unplaced once snapped in, so a room's completion
// state only ever flips false -> true, once — `dismissed` never needs to be
// re-armed for a "later" completion that can't happen.
export default function CompletionBanner({ show }: { show: boolean }) {
  const [dismissed, setDismissed] = useState(false);

  if (!show || dismissed) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4">
      <div className="animate-celebration-in pointer-events-auto flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-slate-900 px-5 py-3 shadow-[0_0_40px_rgba(52,211,153,0.25)]">
        <span className="text-2xl">🎉</span>
        <p className="font-display text-sm font-semibold text-slate-100 sm:text-base">
          ¡Rompecabezas completo!
        </p>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Cerrar"
          className="ml-1 text-slate-500 hover:text-slate-300"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
