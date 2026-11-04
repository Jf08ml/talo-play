"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type MutableRefObject, type ReactNode } from "react";
import { COLS } from "@/lib/ladrillazoSim";
import { drawField, fitField, type FieldView, type Particle } from "@/lib/ladrillazoDraw";
import { installLadriAudio, ladriAudio } from "@/lib/ladrillazoAudio";
import { isMuted, setMuted, subscribeMuted } from "@/lib/sfx";
import { Volume2, VolumeX } from "lucide-react";

/** What the player's hands say, read and reset by the game's tick. */
export interface FieldInput {
  targetX: number | null;
  dir: number;
  launch: boolean;
}

export function newInput(): FieldInput {
  return { targetX: null, dir: 0, launch: false };
}

export interface Frame {
  view: FieldView;
  particles?: Particle[];
}

/**
 * The playing field: a canvas fitted to the space it gets, redrawn every
 * frame from `frame(dt)` (which also steps the game). The mouse points the
 * paddle; a finger drags it from wherever it lands (relative, so the finger
 * doesn't hide it); arrows or A/D move it; a tap, click or space serves.
 */
export default function Field({
  frame,
  input,
  paddleX,
  flip = false,
  controls = true,
  children,
}: {
  frame: (dt: number) => Frame;
  input: MutableRefObject<FieldInput>;
  /** My paddle's center now, for dragging it relative to the finger. */
  paddleX?: () => number;
  flip?: boolean;
  /** Takes input (off for spectators). */
  controls?: boolean;
  /** Overlays (countdown, results…). */
  children?: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(frame);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const sizeRef = useRef(size);
  const flipRef = useRef(flip);
  const paddleRef = useRef(paddleX);

  useEffect(installLadriAudio, []);

  useEffect(() => {
    frameRef.current = frame;
    flipRef.current = flip;
    paddleRef.current = paddleX;
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      const next = fitField(r.width, r.height);
      sizeRef.current = next;
      setSize(next);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // The loop: step and draw.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const { w, h } = sizeRef.current;
      const f = frameRef.current(dt);
      if (ctx && w && h) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (canvas!.width !== Math.round(w * dpr)) {
          canvas!.width = Math.round(w * dpr);
          canvas!.height = Math.round(sizeRef.current.h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawField(ctx, f.view, w, h, now / 1000, f.particles);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Pointer and keys.
  useEffect(() => {
    if (!controls) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let drag: { id: number; x: number; paddle: number } | null = null;
    const cell = () => sizeRef.current.w / COLS || 1;
    const worldX = (clientX: number) => {
      const r = canvas.getBoundingClientRect();
      const x = (clientX - r.left) / cell();
      return flipRef.current ? COLS - x : x;
    };
    const down = (e: PointerEvent) => {
      input.current.launch = true;
      if (e.pointerType === "mouse") {
        input.current.targetX = worldX(e.clientX);
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, x: e.clientX, paddle: paddleRef.current?.() ?? worldX(e.clientX) };
      input.current.targetX = drag.paddle;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        input.current.targetX = worldX(e.clientX);
        return;
      }
      if (!drag || drag.id !== e.pointerId) return;
      const dx = ((e.clientX - drag.x) / cell()) * 1.4 * (flipRef.current ? -1 : 1);
      input.current.targetX = drag.paddle + dx;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || !drag || drag.id !== e.pointerId) return;
      drag = null;
      input.current.targetX = null;
    };
    const keys = new Set<string>();
    const syncDir = () => {
      const left = keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
      const right = keys.has("ArrowRight") || keys.has("d") || keys.has("D");
      const dir = (right ? 1 : 0) - (left ? 1 : 0);
      input.current.dir = flipRef.current ? -dir : dir;
    };
    const keyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if ([" ", "ArrowUp", "w", "W"].includes(e.key)) {
        input.current.launch = true;
        e.preventDefault();
        return;
      }
      if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D"].includes(e.key)) {
        keys.add(e.key);
        input.current.targetX = null;
        syncDir();
        e.preventDefault();
      }
    };
    const keyUp = (e: KeyboardEvent) => {
      keys.delete(e.key);
      syncDir();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, [controls, input]);

  return (
    <div ref={wrapRef} className="relative flex min-h-0 w-full flex-1 items-center justify-center">
      <div className="relative" style={{ width: size.w, height: size.h }}>
        <canvas
          ref={canvasRef}
          style={{ width: size.w, height: size.h, touchAction: "none" }}
          className="block select-none rounded-xl ring-1 ring-white/10"
        />
        {children}
      </div>
    </div>
  );
}

/** Sound on/off (shared with the rest of the site), for screens without the room header. */
export function MuteButton() {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  return (
    <button
      onClick={() => setMuted(!muted)}
      className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
      aria-label={muted ? "Activar el sonido" : "Silenciar"}
    >
      {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
    </button>
  );
}

/** Beeps for 3, 2, 1 and go. */
export function useCountdownBeeps(seconds: number) {
  const prev = useRef(seconds);
  useEffect(() => {
    if (prev.current === seconds) return;
    const was = prev.current;
    prev.current = seconds;
    if (seconds > 0 && seconds <= 3) ladriAudio.countdown(seconds);
    else if (seconds === 0 && was > 0) ladriAudio.countdown(0);
  }, [seconds]);
}

/** A big number over the field while the countdown runs. */
export function Countdown({ seconds }: { seconds: number }) {
  if (seconds <= 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
      <span key={seconds} className="animate-celebration-in font-display text-8xl text-white">
        {seconds}
      </span>
    </div>
  );
}
