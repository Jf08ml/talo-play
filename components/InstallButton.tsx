"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { installMode, promptInstall, subscribeInstall } from "@/lib/install";
import { trackEvent } from "@/lib/analytics";
import { TaloMark } from "./TaloLogo";

/**
 * «Instalar Talo» (lib/install.ts): opens the browser's install prompt, or on
 * iPhone/iPad shows the two steps (Compartir → Agregar a inicio). Renders
 * nothing where it can't help (already installed, or a browser without
 * install). `card` is the home's banner; otherwise a plain button.
 */
export default function InstallButton({ card = false, className = "" }: { card?: boolean; className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- whether it can be installed is only known in the browser
    setMounted(true);
  }, []);
  const mode = useSyncExternalStore(subscribeInstall, installMode, () => "none" as const);
  const [steps, setSteps] = useState(false);
  if (!mounted || mode === "none") return null;

  const go = async () => {
    trackEvent("install_app", { step: mode === "prompt" ? "prompt" : "ios" });
    if (mode === "ios") return setSteps(true);
    const ok = await promptInstall();
    if (ok) trackEvent("install_app", { step: "accepted" });
  };

  const button = (
    <button
      onClick={go}
      className={
        card
          ? "flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-[14px] bg-talo-ink px-5 font-bold text-white transition hover:bg-black"
          : `flex items-center justify-center gap-2 ${className}`
      }
    >
      <Download className="h-5 w-5" /> Instalar Talo
    </button>
  );

  return (
    <>
      {card ? (
        <div className={`flex flex-col gap-4 rounded-[24px] bg-talo-surface p-5 sm:flex-row sm:items-center sm:p-6 ${className}`}>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-talo-hero">
            <TaloMark className="h-9 w-9" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[22px] leading-tight">Talo como app</p>
            <p className="mt-1 text-[15px] text-talo-text-2">Instálalo en tu celular o computadora: se abre con un toque, en pantalla completa, y te avisa cuando un amigo te invita.</p>
          </div>
          {button}
        </div>
      ) : (
        button
      )}
      {steps && <IosSteps onClose={() => setSteps(false)} />}
    </>
  );
}

function IosSteps({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Instalar Talo">
      <div className="talo-light w-full max-w-sm rounded-t-[28px] bg-white p-6 sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-[26px] leading-tight">Instalar Talo</p>
          <button onClick={onClose} aria-label="Cerrar" className="grid h-11 w-11 place-items-center rounded-[14px] hover:bg-talo-surface">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ol className="mt-4 flex flex-col gap-4 text-[17px]">
          <li className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-talo-surface">
              <Share className="h-5 w-5" />
            </span>
            <span>
              Toca <b>Compartir</b> en la barra de Safari.
            </span>
          </li>
          <li className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-talo-surface">
              <SquarePlus className="h-5 w-5" />
            </span>
            <span>
              Elige <b>Agregar a inicio</b> y después <b>Agregar</b>.
            </span>
          </li>
        </ol>
        <p className="mt-4 text-[14px] text-talo-text-3">Talo queda en tu pantalla de inicio como una app. Las notificaciones en iPhone solo funcionan desde ahí.</p>
      </div>
    </div>
  );
}
