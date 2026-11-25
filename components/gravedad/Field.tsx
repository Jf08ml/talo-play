"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { DIR_ANGLE, DT, RESPAWN_S, newRunner, pulsesBy, step, type Input, type Level, type Runner } from "@/lib/gravedadSim";
import { Painter, type Camera, type Ghost } from "@/lib/gravedadDraw";
import { playSound } from "@/lib/sfx";

/**
 * The playing field: canvas, fixed-step loop, keyboard and touch controls.
 * `clock()` gives the level time in seconds (negative = not started yet:
 * the runner waits at the start); the runner's own time follows it, so moving
 * platforms and pulses are where everyone sees them. Ghosts come from
 * `ghosts()` each frame (smoothed here).
 */
export default function Field({
  level,
  color,
  clock,
  ghosts,
  onFinish,
  onFrame,
  frozen = false,
  className = "",
}: {
  level: Level;
  color: string;
  clock: () => number;
  ghosts?: () => Ghost[];
  /** Reached the goal: level time and deaths. */
  onFinish?: (t: number, deaths: number) => void;
  /** Every frame, with my runner (to send my pose, throttled by the caller). */
  onFrame?: (r: Runner) => void;
  frozen?: boolean;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const input = useRef({ left: false, right: false, jump: false, grav: "" as Input["grav"], respawn: false });
  const props = useRef({ clock, ghosts, onFinish, onFrame, frozen, color });
  const [hud, setHud] = useState({ t: 0, deaths: 0, charge: true, warn: false });
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    props.current = { clock, ghosts, onFinish, onFrame, frozen, color };
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the pointer kind is only known in the browser
    setTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  // Keyboard: ←/→ or A/D walk; Space, W or ↑ jump; Q / E / S or ↓ send gravity left / right / to the ceiling; R back to the checkpoint.
  useEffect(() => {
    const keys = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      const i = input.current;
      if (k === "arrowleft" || k === "a") i.left = down;
      else if (k === "arrowright" || k === "d") i.right = down;
      else if (down && !e.repeat && (k === " " || k === "w" || k === "arrowup")) i.jump = true;
      else if (down && !e.repeat && k === "q") i.grav = "left";
      else if (down && !e.repeat && k === "e") i.grav = "right";
      else if (down && !e.repeat && (k === "s" || k === "arrowdown")) i.grav = "up";
      else if (down && !e.repeat && k === "r") i.respawn = true;
      else return;
      e.preventDefault();
    };
    const dn = (e: KeyboardEvent) => keys(e, true);
    const up = (e: KeyboardEvent) => keys(e, false);
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    const painter = new Painter(level);
    let r: Runner | null = null;
    let finished = false;
    let raf = 0;
    let size = { w: 0, h: 0, dpr: 1 };
    const cam: Camera = { x: level.start.x, y: level.start.y, angle: DIR_ANGLE[level.gravity ?? 0], scale: 40 };
    const smooth = new Map<string, Ghost>();
    let last = performance.now();
    let hudAt = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      // About 12 tiles across the short side, a little more on big screens.
      cam.scale = Math.max(26, Math.min(rect.width, rect.height) / (rect.width > 900 ? 14 : 11));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const real = Math.min(0.1, (now - last) / 1000);
      last = now;
      const p = props.current;
      const t = p.clock();
      if (!r && t >= 0) r = newRunner(level, t);
      if (r && !finished && !p.frozen) {
        // A long hiccup (hidden tab): skip ahead instead of replaying it.
        if (t - r.t > 0.5) r.t = t - DT;
        const i = input.current;
        let first = true;
        if (i.respawn && r.dead === 0) {
          r.dead = RESPAWN_S;
          r.deaths++;
          r.vx = r.vy = 0;
          playSound("bad");
        }
        i.respawn = false;
        while (r.t + DT <= t) {
          const move = (i.right ? 1 : 0) - (i.left ? 1 : 0);
          const ev = step(level, r, { move: move as -1 | 0 | 1, jump: first && i.jump, grav: first ? i.grav : "" });
          if (first) {
            i.jump = false;
            i.grav = "";
            first = false;
          }
          if (ev.turned || ev.pulsed) playSound("flip");
          if (ev.died) playSound("bad");
          if (ev.checkpoint) playSound("good");
          if (ev.finished) {
            finished = true;
            playSound("win");
            p.onFinish?.(r.t, r.deaths);
            break;
          }
        }
        // Inputs between steps (fast frames) wait for the next step.
        p.onFrame?.(r);
      }

      // Camera: follow, and turn so my gravity points down.
      const tx = r ? r.x : level.start.x;
      const ty = r ? r.y : level.start.y;
      const k = Math.min(1, real * 7);
      cam.x += (tx - cam.x) * k;
      cam.y += (ty - cam.y) * k;
      const target = DIR_ANGLE[r ? r.g : (level.gravity ?? 0)];
      let da = target - cam.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      cam.angle += da * Math.min(1, real * 9);

      const list: Ghost[] = [];
      for (const gh of p.ghosts?.() ?? []) {
        const prev = smooth.get(gh.id);
        const s = prev && Math.hypot(prev.x - gh.x, prev.y - gh.y) < 4 ? { ...gh, x: prev.x + (gh.x - prev.x) * Math.min(1, real * 12), y: prev.y + (gh.y - prev.y) * Math.min(1, real * 12) } : gh;
        smooth.set(gh.id, s);
        list.push(s);
      }
      painter.draw(ctx, size.w, size.h, size.dpr, cam, Math.max(0, t), r ? { r, color: p.color } : null, list);

      if (now - hudAt > 100) {
        hudAt = now;
        const nextPulse = level.pulse ? (pulsesBy(level, t) + 1) * level.pulse - t : 99;
        setHud({ t: Math.max(0, t), deaths: r?.deaths ?? 0, charge: r?.charge ?? true, warn: t > 0 && nextPulse < 1 });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [level]);

  const hold = (key: "left" | "right") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      input.current[key] = true;
    },
    onPointerUp: () => (input.current[key] = false),
    onPointerCancel: () => (input.current[key] = false),
  });
  // Tap buttons say what they do in data-k: a gravity direction, "jump" or "respawn".
  const press = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const k = e.currentTarget.dataset.k;
    const i = input.current;
    if (k === "jump") i.jump = true;
    else if (k === "respawn") i.respawn = true;
    else if (k === "left" || k === "right" || k === "up") i.grav = k;
  };
  const btn = "flex select-none items-center justify-center rounded-2xl bg-white/15 text-white active:bg-white/30 touch-none";

  return (
    <div ref={wrapRef} className={`relative overflow-hidden bg-[#0a0a0a] ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 block" />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 text-white">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-lg font-bold tabular-nums">{hud.t.toFixed(1)} s</span>
          {hud.deaths > 0 && <span className="text-xs text-white/60">Caídas: {hud.deaths}</span>}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${hud.charge ? "bg-talo-hero text-talo-ink" : "bg-white/10 text-white/40"}`}>
          Gravedad {hud.charge ? "lista" : "…"}
        </span>
      </div>
      {level.hint && hud.t < 12 && (
        <p className="pointer-events-none absolute inset-x-6 top-14 text-center text-sm font-semibold text-white/80">{level.hint}</p>
      )}
      {hud.warn && (
        <p className="pointer-events-none absolute inset-x-0 top-1/4 text-center font-display text-3xl text-talo-hero">¡La gravedad se da vuelta!</p>
      )}

      {touch ? (
        <>
          <div className="absolute bottom-4 left-4 flex gap-3">
            <button aria-label="Izquierda" className={`${btn} h-20 w-20`} {...hold("left")}>
              <ChevronLeft className="h-10 w-10" />
            </button>
            <button aria-label="Derecha" className={`${btn} h-20 w-20`} {...hold("right")}>
              <ChevronRight className="h-10 w-10" />
            </button>
          </div>
          <div className="absolute bottom-4 right-4 flex flex-col items-end gap-3">
            <div className="flex gap-2">
              <button aria-label="Gravedad a la pared izquierda" className={`${btn} h-14 w-14`} data-k="left" onPointerDown={press}>
                <ArrowLeftToLine className="h-7 w-7" />
              </button>
              <button aria-label="Gravedad al techo" className={`${btn} h-14 w-14`} data-k="up" onPointerDown={press}>
                <ArrowUpToLine className="h-7 w-7" />
              </button>
              <button aria-label="Gravedad a la pared derecha" className={`${btn} h-14 w-14`} data-k="right" onPointerDown={press}>
                <ArrowRightToLine className="h-7 w-7" />
              </button>
            </div>
            <button aria-label="Saltar" className={`${btn} h-20 w-40 bg-talo-hero/90 font-bold text-talo-ink active:bg-talo-hero`} data-k="jump" onPointerDown={press}>
              Saltar
            </button>
          </div>
          <button aria-label="Volver al último punto" className={`${btn} absolute right-4 top-12 h-10 w-10`} data-k="respawn" onPointerDown={press}>
            <RotateCcw className="h-5 w-5" />
          </button>
        </>
      ) : (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-white/50">
          ← → caminar · Espacio saltar · Q / E gravedad a la pared · S techo · R volver
        </p>
      )}
    </div>
  );
}
