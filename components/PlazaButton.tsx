"use client";

import { MessagesSquare } from "lucide-react";
import { useActiveCount, usePlaza } from "./PlazaProvider";

/**
 * Floating "Plaza" button on Talo's light pages (rendered by `SiteFooter`,
 * bottom left; "Ideas" is bottom right), with how many people are on Talo now.
 */
export default function PlazaButton() {
  const { open, show } = usePlaza();
  const active = useActiveCount();
  if (open) return null;
  return (
    <button
      onClick={() => show("boton")}
      aria-label={active ? `La Plaza: ${active} ${active === 1 ? "persona" : "personas"} en Talo ahora` : "La Plaza"}
      className="fixed bottom-4 left-4 z-[60] flex min-h-12 items-center gap-2 rounded-full border-2 border-talo-ink bg-talo-ink px-4 font-bold text-talo-hero shadow-[3px_3px_0_#FFD400] transition hover:bg-black active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#FFD400] sm:bottom-6 sm:left-6"
    >
      <MessagesSquare className="h-5 w-5" strokeWidth={2.4} />
      Plaza
      {active > 0 && (
        <span className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[13px] text-white">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          {active}
        </span>
      )}
    </button>
  );
}
