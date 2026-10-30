// Shared Tailwind class strings so every game's lobby and room look like part
// of the same product: quiet surfaces with hairline borders, one accent
// (violet) for the main action, no glows.

export const CARD =
  "rounded-2xl border border-white/[0.07] bg-slate-900/50 p-5 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_8px_24px_-12px_rgba(0,0,0,0.6)]";

export const PRIMARY_BUTTON =
  "rounded-xl bg-violet-600 py-2.5 font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] transition hover:bg-violet-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-violet-600/50 disabled:text-white/60 disabled:active:scale-100";

export const SECONDARY_BUTTON =
  "rounded-xl border border-white/10 bg-white/[0.03] py-2.5 font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.06] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

export const TEXT_INPUT =
  "rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-violet-400/70 focus:ring-4 focus:ring-violet-500/15";

export const SECTION_LABEL = "mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-500";

/** One option of a row of selectable chips (difficulty, size, etc). */
export function chipClass(selected: boolean): string {
  return `rounded-lg border px-2 py-1.5 text-xs font-medium transition active:scale-[0.97] ${
    selected
      ? "border-violet-400/60 bg-violet-500/10 text-violet-100"
      : "border-white/10 text-slate-400 hover:border-white/20 hover:bg-white/[0.04] hover:text-slate-200"
  }`;
}

/** One side of a two-way segmented toggle (e.g. colaborativo / competencia). */
export function segmentClass(selected: boolean): string {
  return `rounded-md py-1.5 text-sm font-medium transition ${
    selected
      ? "bg-slate-700/80 text-white shadow-[0_1px_2px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]"
      : "text-slate-400 hover:text-slate-200"
  }`;
}
