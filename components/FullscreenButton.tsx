"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize, Minimize, Share, SquarePlus, X } from "lucide-react";
import { useFullscreen } from "@/lib/fullscreen";

/**
 * The full-screen button every game uses: toggles full screen where the
 * browser can (Android, iPad, computers), and on iPhone explains how to add
 * Talo to the home screen, which opens it without Safari's bars. Hidden when
 * Talo already runs that way. `icon` draws the button's content (it gets
 * whether it's full screen now); `target` is what goes full screen (the
 * whole page by default).
 */
export default function FullscreenButton({
  className,
  iconClassName = "h-4 w-4",
  target,
  icon,
}: {
  className: string;
  iconClassName?: string;
  target?: () => HTMLElement | null;
  icon?: (active: boolean) => ReactNode;
}) {
  const { mode, active, toggle } = useFullscreen(target);
  const [hint, setHint] = useState(false);
  if (mode === "none") return null;
  return (
    <>
      <button
        type="button"
        onClick={() => (mode === "api" ? toggle() : setHint(true))}
        aria-label={active ? "Salir de pantalla completa" : "Pantalla completa"}
        title={active ? "Salir de pantalla completa" : "Pantalla completa"}
        className={className}
      >
        {icon ? icon(active) : active ? <Minimize className={iconClassName} /> : <Maximize className={iconClassName} />}
      </button>
      {hint && <InstallHint onClose={() => setHint(false)} />}
    </>
  );
}

/** iPhone: full screen is Talo on the home screen. */
function InstallHint({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Pantalla completa en iPhone"
        onClick={(e) => e.stopPropagation()}
        className="talo-light relative w-full max-w-sm rounded-[24px] border-2 border-talo-ink bg-white p-5 text-talo-ink"
      >
        <button onClick={onClose} aria-label="Cerrar" className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-xl hover:bg-black/5">
          <X className="h-5 w-5" />
        </button>
        <p className="pr-8 font-display text-[22px] leading-tight">Pantalla completa en iPhone</p>
        <p className="mt-2 text-[15px] text-talo-text-2">
          El iPhone no deja poner páginas en pantalla completa, pero si agregas Talo a tu inicio se abre como una app, sin las barras de Safari.
        </p>
        <ol className="mt-4 flex flex-col gap-3 text-[15px]">
          <li className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-talo-surface">
              <Share className="h-5 w-5" />
            </span>
            <span>
              Toca <b>Compartir</b> en la barra de Safari.
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-talo-surface">
              <SquarePlus className="h-5 w-5" />
            </span>
            <span>
              Elige <b>Agregar a inicio</b> y después <b>Agregar</b>.
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-talo-hero font-display">t</span>
            <span>Abre Talo desde el ícono de tu pantalla de inicio.</span>
          </li>
        </ol>
        <p className="mt-4 text-xs text-talo-text-3">Gira el teléfono para jugar en horizontal.</p>
      </div>
    </div>,
    document.body
  );
}
