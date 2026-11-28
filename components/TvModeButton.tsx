"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, Gauge, Tv, X } from "lucide-react";
import {
  setTvInfo,
  setTvPref,
  startTvMonitor,
  subscribeTvMode,
  tvChoice,
  tvFps,
  tvInfoOn,
  tvLevel,
  tvModeOn,
  TV_LEVEL_ORDER,
  TV_LEVELS,
  type TvPref,
} from "@/lib/tvMode";

/** Whether Modo TV is on (false while rendering on the server). */
export function useTvMode(): boolean {
  return useSyncExternalStore(subscribeTvMode, tvModeOn, () => false);
}

const OPTIONS: { id: Exclude<TvPref, "auto">; label: string; hint: string }[] = [
  { id: "adaptar", label: "Automático", hint: "Empieza en Baja y sube o baja solo según cómo vaya la tele" },
  ...TV_LEVEL_ORDER.map((id) => ({ id, label: TV_LEVELS[id].label, hint: TV_LEVELS[id].hint })),
  { id: "no", label: "Normal", hint: "Sin Modo TV: la calidad de siempre, para computadoras" },
];

/** «Modo TV» on the big screens: picks how light the graphics are (see lib/tvMode.ts). */
export default function TvModeButton({ className = "" }: { className?: string }) {
  const choice = useSyncExternalStore(subscribeTvMode, tvChoice, () => "no" as const);
  const level = useSyncExternalStore(subscribeTvMode, tvLevel, () => null);
  const info = useSyncExternalStore(subscribeTvMode, tvInfoOn, () => false);
  const [open, setOpen] = useState(false);
  const on = choice !== "no";

  useEffect(() => startTvMonitor(), []);

  const label = !level ? "Modo TV" : choice === "adaptar" ? `TV · Auto (${TV_LEVELS[level].label})` : `TV · ${TV_LEVELS[level].label}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title="Modo TV: elige qué tan livianos son los gráficos para que la tele no se trabe"
        className={`flex items-center gap-1.5 ${className} ${on ? "!bg-talo-hero !text-talo-ink" : ""}`}
      >
        <Tv className="h-4 w-4" />
        <span>{label}</span>
      </button>
      {open && <TvMenu choice={choice} info={info} onClose={() => setOpen(false)} />}
      {on && info && <TvInfoChip />}
    </>
  );
}

function TvMenu({ choice, info, onClose }: { choice: Exclude<TvPref, "auto">; info: boolean; onClose: () => void }) {
  const chosenRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    chosenRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Calidad de pantalla"
        className="w-full max-w-md rounded-2xl bg-[#111111] p-4 text-white shadow-xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Tv className="h-5 w-5" /> Pantalla
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-sm text-white/60">Si la tele se traba, elige una más baja. Si se ve borroso y va fluido, prueba una más alta.</p>
        <div className="flex flex-col gap-1.5">
          {OPTIONS.map((o) => {
            const chosen = o.id === choice;
            return (
              <button
                key={o.id}
                ref={chosen ? chosenRef : undefined}
                type="button"
                onClick={() => {
                  setTvPref(o.id);
                  onClose();
                }}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none ring-talo-hero focus-visible:ring-2 ${chosen ? "bg-talo-hero text-talo-ink" : "bg-white/5 hover:bg-white/10"}`}
              >
                <span className="flex-1">
                  <span className="block font-bold">{o.label}</span>
                  <span className={`block text-xs ${chosen ? "text-talo-ink/70" : "text-white/55"}`}>{o.hint}</span>
                </span>
                {chosen && <Check className="h-5 w-5 shrink-0" />}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setTvInfo(!info)}
          aria-pressed={info}
          className="mt-3 flex w-full items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-sm outline-none ring-talo-hero hover:bg-white/10 focus-visible:ring-2"
        >
          <Gauge className="h-4 w-4" />
          <span className="flex-1 text-left">Mostrar resolución y fps</span>
          <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${info ? "bg-talo-hero text-talo-ink" : "bg-white/10 text-white/60"}`}>{info ? "Sí" : "No"}</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** The biggest canvas on the page: the game's, whose buffer size is what's drawn. */
function drawnSize(): string {
  let best: HTMLCanvasElement | null = null;
  document.querySelectorAll("canvas").forEach((c) => {
    if (!best || c.width * c.height > best.width * best.height) best = c;
  });
  const c = best as HTMLCanvasElement | null;
  return c ? `${c.width}×${c.height}` : "—";
}

/** Corner chip to try levels on a TV: level · drawn pixels · fps. */
function TvInfoChip() {
  const [text, setText] = useState("");
  useEffect(() => {
    const update = () => {
      const level = tvLevel();
      const auto = tvChoice() === "adaptar";
      const name = level ? (auto ? `Auto · ${TV_LEVELS[level].label}` : TV_LEVELS[level].label) : "Normal";
      setText(`${name} · ${drawnSize()} · ${Math.round(tvFps())} fps`);
    };
    update();
    const id = window.setInterval(update, 500);
    return () => window.clearInterval(id);
  }, []);
  return createPortal(
    <div className="pointer-events-none fixed bottom-2 left-2 z-[90] rounded-lg bg-black/75 px-2.5 py-1 font-mono text-xs text-white">{text}</div>,
    document.body,
  );
}
