"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Keyboard } from "lucide-react";
import { openPad, type PadWire } from "@/lib/empujonesRoom";
import { DASH_COOLDOWN, GRIP_DRAIN, GRIP_FILL, GRIP_MIN } from "@/lib/empujones";

/**
 * The phone as Empujones' controller: a stick on the left (it appears where
 * the thumb lands) and two buttons on the right, «Empujar» (a dash) and
 * «Aguantar» (hold to plant your feet). On a computer, WASD or the arrows
 * move, space or J dashes and Shift or K holds. Up on the stick is up on
 * the big screen.
 */

const SEND_MS = 50;
/** Stick travel (px) for full speed. */
const STICK_R = 56;
const DEAD = 0.12;

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  w: [0, -1],
  W: [0, -1],
  ArrowDown: [0, 1],
  s: [0, 1],
  S: [0, 1],
  ArrowLeft: [-1, 0],
  a: [-1, 0],
  A: [-1, 0],
  ArrowRight: [1, 0],
  d: [1, 0],
  D: [1, 0],
};
const DASH_KEYS = [" ", "j", "J"];
const BRACE_KEYS = ["Shift", "k", "K"];

/**
 * Dash presses per room and player, kept while the page lives: the pad is
 * remounted when the match starts, and the screen only reacts to the count
 * going up.
 */
const presses = new Map<string, number>();

function useSender(roomId: string, clientId: string) {
  const pad = useRef<ReturnType<typeof openPad> | null>(null);
  const wire = useRef<PadWire>({ x: 0, y: 0, d: presses.get(`${roomId}/${clientId}`) ?? 0, b: false });
  const lastAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const p = openPad(roomId, clientId);
    pad.current = p;
    p.send(wire.current);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      p.close();
      pad.current = null;
    };
  }, [roomId, clientId]);

  /** Changes the input and sends it now if it's been long enough, else once the gap is over (always the latest value). */
  const send = (patch: Partial<PadWire>, urgent = false) => {
    wire.current = { ...wire.current, ...patch };
    presses.set(`${roomId}/${clientId}`, wire.current.d);
    const go = () => {
      timer.current = null;
      lastAt.current = performance.now();
      pad.current?.send({ ...wire.current });
    };
    if (urgent || performance.now() - lastAt.current >= SEND_MS) {
      if (timer.current) clearTimeout(timer.current);
      go();
    } else if (!timer.current) {
      timer.current = setTimeout(go, SEND_MS - (performance.now() - lastAt.current));
    }
  };
  const read = () => wire.current;
  return { send, read };
}

export default function Pad({ roomId, clientId, color, locked = false }: { roomId: string; clientId: string; color: string; locked?: boolean }) {
  const { send, read } = useSender(roomId, clientId);
  const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const [bracing, setBracing] = useState(false);
  const stickId = useRef<number | null>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const coolRef = useRef<HTMLSpanElement>(null);
  const gripRef = useRef<HTMLSpanElement>(null);
  const coolUntil = useRef(0);
  const lockedRef = useRef(locked);
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  const setMove = (x: number, y: number) => {
    const len = Math.hypot(x, y);
    const k = len < DEAD ? 0 : Math.min(1, len) / len;
    send({ x: Math.round(x * k * 100) / 100, y: Math.round(y * k * 100) / 100 });
  };

  const dash = () => {
    if (performance.now() < coolUntil.current || lockedRef.current) return;
    coolUntil.current = performance.now() + DASH_COOLDOWN * 1000;
    send({ d: read().d + 1 }, true);
    navigator.vibrate?.(15);
    coolRef.current?.animate([{ transform: "scaleY(1)" }, { transform: "scaleY(0)" }], { duration: DASH_COOLDOWN * 1000, easing: "linear" });
  };

  const brace = (on: boolean) => {
    if (read().b === on) return;
    send({ b: on }, true);
    setBracing(on);
  };

  // Grip, guessed here with the same numbers the screen uses (just for the bar).
  useEffect(() => {
    let grip = 1;
    let holding = false;
    let frame = 0;
    let last = performance.now();
    const loop = (t: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const want = read().b;
      holding = want && (holding ? grip > 0 : grip > GRIP_MIN);
      grip = holding ? Math.max(0, grip - GRIP_DRAIN * dt) : Math.min(1, grip + GRIP_FILL * dt);
      if (gripRef.current) gripRef.current.style.transform = `scaleX(${grip})`;
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
    // `read` only looks at a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard (computers).
  useEffect(() => {
    const held = new Set<string>();
    const apply = () => {
      let x = 0;
      let y = 0;
      for (const k of held) {
        const m = MOVE_KEYS[k];
        if (m) {
          x += m[0];
          y += m[1];
        }
      }
      const n = Math.hypot(x, y) || 1;
      setMove(x / n, y / n);
      brace(BRACE_KEYS.some((k) => held.has(k)));
    };
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!(e.key in MOVE_KEYS) && !DASH_KEYS.includes(e.key) && !BRACE_KEYS.includes(e.key)) return;
      e.preventDefault();
      if (DASH_KEYS.includes(e.key) && !e.repeat) dash();
      held.add(e.key);
      apply();
    };
    const up = (e: KeyboardEvent) => {
      if (!held.delete(e.key)) return;
      apply();
    };
    const clear = () => {
      held.clear();
      apply();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
    // The handlers only touch refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stickId.current !== null) return;
    stickId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    setStick({ ox: e.clientX - r.left, oy: e.clientY - r.top, x: 0, y: 0 });
  };
  const stickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== stickId.current || !stick) return;
    const r = e.currentTarget.getBoundingClientRect();
    let dx = e.clientX - r.left - stick.ox;
    let dy = e.clientY - r.top - stick.oy;
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) {
      dx = (dx / len) * STICK_R;
      dy = (dy / len) * STICK_R;
    }
    setStick({ ...stick, x: dx, y: dy });
    setMove(dx / STICK_R, dy / STICK_R);
  };
  const stickUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== stickId.current) return;
    stickId.current = null;
    setStick(null);
    setMove(0, 0);
  };

  return (
    <div className={`flex min-h-[46vh] flex-1 select-none gap-3 [touch-action:none] ${locked ? "opacity-60" : ""}`}>
      <div
        ref={zoneRef}
        onPointerDown={stickDown}
        onPointerMove={stickMove}
        onPointerUp={stickUp}
        onPointerCancel={stickUp}
        className="relative flex-1 overflow-hidden rounded-[24px] bg-white/[0.06] ring-1 ring-white/[0.08]"
      >
        {stick ? (
          <>
            <span
              className="absolute h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/25"
              style={{ left: stick.ox, top: stick.oy }}
            />
            <span
              className="absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-talo-ink"
              style={{ left: stick.ox + stick.x, top: stick.oy + stick.y, background: color }}
            />
          </>
        ) : (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-white/40">
            <span className="h-24 w-24 rounded-full border-2 border-dashed border-white/25" />
            <span className="px-3 text-sm font-bold">Apoyá el dedo y movelo para caminar</span>
          </div>
        )}
      </div>

      <div className="flex w-[42%] max-w-48 flex-col gap-3">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            dash();
          }}
          className="relative flex flex-[3] items-center justify-center overflow-hidden rounded-[24px] border-[3px] border-talo-ink font-display text-2xl text-talo-ink active:scale-95"
          style={{ background: color }}
        >
          <span ref={coolRef} className="absolute inset-0 origin-bottom bg-talo-ink/45" style={{ transform: "scaleY(0)" }} />
          <span className="relative">Empujar</span>
        </button>
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            brace(true);
          }}
          onPointerUp={() => brace(false)}
          onPointerCancel={() => brace(false)}
          onContextMenu={(e) => e.preventDefault()}
          className={`relative flex flex-[2] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[24px] px-3 text-lg font-bold ${
            bracing ? "bg-white text-talo-ink" : "bg-white/[0.1] text-white"
          }`}
        >
          Aguantar
          <span className="h-1.5 w-full overflow-hidden rounded-full bg-black/30">
            <span ref={gripRef} className="block h-full origin-left rounded-full bg-talo-hero" />
          </span>
        </button>
      </div>

      <p className="pointer-events-none fixed bottom-2 left-1/2 hidden -translate-x-1/2 items-center gap-1.5 text-xs text-white/40 [@media(hover:hover)_and_(pointer:fine)]:flex">
        <Keyboard className="h-3.5 w-3.5" /> WASD o flechas · espacio: empujar · Shift: aguantar
      </p>
    </div>
  );
}
