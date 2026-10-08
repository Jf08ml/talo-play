// Shared Tailwind class strings so every game's lobby and room look like part
// of the same salón.

export const CARD =
  "rounded-2xl border border-violet-500/15 bg-slate-900/60 p-5 shadow-[0_0_25px_rgba(139,92,246,0.08)] backdrop-blur";

export const PRIMARY_BUTTON =
  "rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 py-2.5 font-medium text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";

export const SECONDARY_BUTTON =
  "rounded-lg border border-cyan-400/60 py-2.5 font-medium text-cyan-300 transition hover:bg-cyan-500/10 hover:shadow-[0_0_15px_rgba(34,211,238,0.25)] disabled:cursor-not-allowed disabled:opacity-50";

export const TEXT_INPUT =
  "rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30";

export const SECTION_LABEL = "mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500";

/** One option of a row of selectable chips (difficulty, size, etc). */
export function chipClass(selected: boolean): string {
  return `rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
    selected
      ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.3)]"
      : "border-slate-700 text-slate-400 hover:bg-slate-800/60"
  }`;
}

/** One side of a two-way segmented toggle (e.g. colaborativo / competencia). */
export function segmentClass(selected: boolean): string {
  return `rounded-md py-1.5 text-sm font-medium transition ${
    selected
      ? "bg-violet-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.5)]"
      : "text-slate-400 hover:text-slate-200"
  }`;
}
