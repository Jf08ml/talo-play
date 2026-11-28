"use client";

import { useSyncExternalStore } from "react";
import { Tv } from "lucide-react";
import { setTvMode, subscribeTvMode, tvModeOn } from "@/lib/tvMode";

/** Whether Modo TV is on (false while rendering on the server). */
export function useTvMode(): boolean {
  return useSyncExternalStore(subscribeTvMode, tvModeOn, () => false);
}

/** «Modo TV» on the big screens: lighter graphics for TVs (see lib/tvMode.ts). */
export default function TvModeButton({ className = "" }: { className?: string }) {
  const on = useTvMode();
  return (
    <button
      type="button"
      onClick={() => setTvMode(!on)}
      aria-pressed={on}
      title={on ? "Modo TV: gráficos livianos para que la tele no se trabe. Toca para volver a los normales." : "Modo TV: gráficos livianos para teles lentas"}
      className={`flex items-center gap-1.5 ${className} ${on ? "!bg-talo-hero !text-talo-ink" : ""}`}
    >
      <Tv className="h-4 w-4" />
      <span>Modo TV</span>
    </button>
  );
}
