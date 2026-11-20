"use client";

import type { RefObject } from "react";
import { ArrowUp, Footprints } from "lucide-react";
import { JUMP_FROM, JUMP_TO, KICK_REACH, type Cue } from "@/lib/tronco";

/**
 * What the match and the practice share on screen: the timing bar (the log
 * coming at you from the side it comes, with the windows where each button
 * works) and the two buttons, which light up when they'd work right now.
 * Both are painted from the game loop through refs, never by React state,
 * so they follow the log every frame.
 */

/** Seconds of approach the bar shows. */
const SPAN = 1.3;
/** Half the bar (in %) left for the approach, from the middle out. */
const HALF = 44;
const pos = (ttc: number) => (Math.min(ttc, SPAN) / SPAN) * HALF;

export function TimingMeter({ meterRef }: { meterRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={meterRef} className="pointer-events-none mx-auto w-full max-w-sm opacity-0 transition-opacity duration-200">
      <p data-label className="mb-1 h-7 text-center font-display text-xl leading-7 text-white drop-shadow" />
      <div className="relative h-9 overflow-hidden rounded-full bg-black/60 ring-1 ring-white/15">
        <div data-zone="jump" className="absolute inset-y-1 rounded-full bg-talo-hero/45" />
        <div data-zone="kick" className="absolute inset-y-1 rounded-full bg-emerald-400/70" />
        <div className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-talo-ink" />
        <div data-log className="absolute top-1/2 h-3.5 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#5a3818] bg-[#A9713A]" />
      </div>
    </div>
  );
}

/**
 * Paints the bar: the log comes from the left when it turns to the right
 * (dir 1, as seen from behind your seat) and from the right otherwise.
 * `busy` = in the air or recovering (the buttons wouldn't respond).
 */
export function paintMeter(
  el: HTMLDivElement | null,
  cue: Cue,
  dir: 1 | -1,
  show: boolean,
  busy: boolean,
  zones: { jump: boolean; kick: boolean } = { jump: true, kick: true }
) {
  if (!el) return;
  const visible = show && Number.isFinite(cue.ttc);
  el.style.opacity = visible ? "1" : "0";
  if (!visible) return;
  const side = dir === 1 ? -1 : 1;
  const place = (node: Element | null, from: number, to: number, on: boolean) => {
    if (!(node instanceof HTMLElement)) return;
    node.style.display = on ? "" : "none";
    const a = 50 + side * pos(from);
    const b = 50 + side * pos(to);
    node.style.left = `${Math.min(a, b)}%`;
    node.style.width = `${Math.abs(b - a)}%`;
  };
  place(el.querySelector('[data-zone="jump"]'), JUMP_FROM, JUMP_TO, zones.jump);
  place(el.querySelector('[data-zone="kick"]'), 0, KICK_REACH, zones.kick);
  const log = el.querySelector("[data-log]");
  if (log instanceof HTMLElement) {
    log.style.left = `${50 + side * pos(cue.ttc)}%`;
    log.style.opacity = cue.ttc > SPAN ? "0.35" : "1";
  }
  const label = el.querySelector("[data-label]");
  const text = busy ? "" : cue.kick ? "¡Ahora!" : cue.jump ? "¡Saltá!" : cue.ttc < SPAN ? (side < 0 ? "← Viene" : "Viene →") : "";
  if (label && label.textContent !== text) label.textContent = text;
}

/** Lights the buttons that would work right now. */
export function paintButtons(jump: HTMLElement | null, kick: HTMLElement | null, cue: Cue, busy: boolean) {
  const j = !busy && cue.jump ? "1" : "";
  const k = !busy && cue.kick ? "1" : "";
  if (jump && jump.dataset.ready !== j) jump.dataset.ready = j;
  if (kick && kick.dataset.ready !== k) kick.dataset.ready = k;
}

export function ActionButtons({
  jumpRef,
  kickRef,
  onJump,
  onKick,
  disabled,
  jumpOff,
  kickOff,
}: {
  jumpRef: RefObject<HTMLButtonElement | null>;
  kickRef: RefObject<HTMLButtonElement | null>;
  onJump: () => void;
  onKick: () => void;
  disabled?: boolean;
  /** Only one of them in use (the practice teaches them one at a time). */
  jumpOff?: boolean;
  kickOff?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 bg-talo-ink p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <button
        ref={jumpRef}
        onPointerDown={(e) => {
          e.preventDefault();
          onJump();
        }}
        disabled={disabled || jumpOff}
        className="flex select-none items-center justify-center gap-2 rounded-2xl bg-white/85 py-5 text-lg font-bold text-talo-ink ring-talo-hero/50 transition-[background-color,box-shadow,transform] duration-75 active:scale-95 disabled:opacity-30 data-[ready=1]:scale-[1.03] data-[ready=1]:bg-talo-hero data-[ready=1]:ring-4"
      >
        <ArrowUp className="h-6 w-6" strokeWidth={3} /> Saltar
      </button>
      <button
        ref={kickRef}
        onPointerDown={(e) => {
          e.preventDefault();
          onKick();
        }}
        disabled={disabled || kickOff}
        className="flex select-none items-center justify-center gap-2 rounded-2xl bg-white/85 py-5 text-lg font-bold text-talo-ink ring-emerald-300/50 transition-[background-color,box-shadow,transform] duration-75 active:scale-95 disabled:opacity-30 data-[ready=1]:scale-[1.03] data-[ready=1]:bg-emerald-400 data-[ready=1]:ring-4"
      >
        <Footprints className="h-6 w-6" strokeWidth={2.5} /> Patear
      </button>
    </div>
  );
}
