// Shared Tailwind class strings so every game's lobby form and room look like
// part of the same product: Talo's dark side (rooms sit on the ink page).
// Flat surfaces, no gradients or glows; the main action is the brand yellow,
// a selected option turns white (as the home's selected tab turns ink).

export const CARD = "rounded-[20px] border border-white/[0.08] bg-[#1c1c1c] p-5";

export const PRIMARY_BUTTON =
  "rounded-[14px] bg-talo-hero py-2.5 font-bold text-talo-ink transition hover:bg-[#ffe033] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40 disabled:active:scale-100";

export const SECONDARY_BUTTON =
  "rounded-[14px] border-2 border-white/70 py-2.5 font-bold text-white transition hover:border-white hover:bg-white/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

export const TEXT_INPUT =
  "rounded-[10px] border border-white/10 bg-white/[0.06] px-3 py-2 text-white outline-none transition placeholder:text-white/40 focus:border-white/50";

export const SECTION_LABEL = "mb-1.5 text-[13px] font-bold text-white/60";

/** One option of a row of selectable chips (difficulty, size, etc). */
export function chipClass(selected: boolean): string {
  return `rounded-[10px] border px-2 py-1.5 text-xs font-bold transition active:scale-[0.97] ${
    selected
      ? "border-white bg-white text-talo-ink"
      : "border-white/15 text-white/70 hover:border-white/40 hover:text-white"
  }`;
}

/** One side of a two-way segmented toggle (e.g. colaborativo / competencia). */
export function segmentClass(selected: boolean): string {
  return `rounded-lg py-1.5 text-sm font-bold transition ${
    selected ? "bg-white text-talo-ink" : "text-white/60 hover:text-white"
  }`;
}
