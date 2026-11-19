"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Navigation } from "lucide-react";
import { botShot, DT, noEvents, startRoll, stepRoll, type Hole, type Roll } from "@/lib/minigolfSim";
import { drawHole, fitHole, screenToHoleVec, type DrawBall, type Fit } from "@/lib/minigolfDraw";
import { golfAudio, installGolfAudio } from "@/lib/minigolfAudio";
import { shotPose, type BallPose } from "@/lib/minigolf";
import type { CameraMode, GolfScene } from "@/lib/minigolf3d";

/** Another player's ball (or a bot's), as published. */
export interface OtherBall {
  pose: BallPose;
  color: string;
}

interface Ghost {
  n: number;
  roll: Roll | null;
  x: number;
  y: number;
  sunk: boolean;
}

/** A shot older than this when first seen isn't replayed, just placed. */
const REPLAY_MAX_S = 12;
/** The splash shows a moment before the ball is back where it was hit from. */
const WATER_PAUSE_S = 0.7;

/**
 * The hole on a canvas, and my ball. Drag anywhere (finger or mouse) to pull
 * back like a slingshot: the shot goes the other way, harder the longer the
 * pull; release to hit, or come back to the start to cancel. My shots are
 * worked out at once (`simulate`) so the result can be published with the
 * shot, then rolled on screen; others' shots are replayed from their pose.
 *
 * `clock()` is the hole's time in seconds (it turns the mills): every phone
 * in a room derives it from the same start.
 */
export default function GolfField({
  hole,
  clock,
  color,
  enabled,
  initial,
  others,
  watching = false,
  view = "2d",
  shadows = false,
  onShot,
  onDone,
  children,
}: {
  hole: Hole;
  clock: () => number;
  color: string;
  /** Shots allowed (not during a countdown, not when watching). */
  enabled: boolean;
  /** My ball as last published (coming back to a room mid-hole). */
  initial?: BallPose | null;
  others?: Record<string, OtherBall>;
  /** Only watching: no ball of mine. */
  watching?: boolean;
  /** Flat from above, or the 3D scene. */
  view?: "2d" | "3d";
  /** Real-time shadows in 3D. */
  shadows?: boolean;
  /** Right after hitting: the shot and where it will end (penalties counted). */
  onShot?: (pose: BallPose) => void;
  /** Holed out (strokes) or out of strokes (`MAX_STROKES`), when the ball stops. */
  onDone?: (strokes: number, holed: boolean) => void;
  children?: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<GolfScene | null>(null);
  const [fit, setFit] = useState<Fit>({ scale: 1, w: 0, h: 0, rot: false, holeH: 0 });
  const fitRef = useRef(fit);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [camMode, setCamMode] = useState<CameraMode>("seguir");
  const props = useRef({ hole, clock, color, enabled, others, watching, view, onShot, onDone });
  useEffect(() => {
    props.current = { hole, clock, color, enabled, others, watching, view, onShot, onDone };
  });

  // My ball.
  const me = useRef({
    x: initial?.ex ?? hole.tee.x,
    y: initial?.ey ?? hole.tee.y,
    strokes: initial?.s ?? 0,
    n: initial?.n ?? 0,
    roll: null as Roll | null,
    pendingEnd: null as BallPose | null,
    waterUntil: 0,
    fin: initial?.fin ?? false,
  });
  const ghosts = useRef(new Map<string, Ghost>());
  const aim = useRef<{ angle: number; power: number } | null>(null);
  const bumped = useRef(new Map<number, number>());

  useEffect(installGolfAudio, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      const next = fitHole(props.current.hole, r.width, r.height);
      fitRef.current = next;
      setFit(next);
      setBox({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // The 3D scene, loaded only when it's wanted.
  useEffect(() => {
    if (view !== "3d") return;
    let alive = true;
    let scene: GolfScene | null = null;
    import("@/lib/minigolf3d").then(({ GolfScene }) => {
      if (!alive || !glRef.current) return;
      try {
        scene = new GolfScene(glRef.current, props.current.hole, shadows);
      } catch (err) {
        console.error(err);
        return;
      }
      sceneRef.current = scene;
      const r = wrapRef.current?.getBoundingClientRect();
      if (r) scene.setSize(Math.floor(r.width), Math.floor(r.height));
    });
    return () => {
      alive = false;
      sceneRef.current = null;
      scene?.dispose();
    };
  }, [view, shadows]);
  useEffect(() => {
    if (box.w && box.h) sceneRef.current?.setSize(box.w, box.h);
  }, [box]);
  useEffect(() => {
    sceneRef.current?.setMode(camMode);
  }, [camMode]);

  // Others' balls: replay each new shot.
  useEffect(() => {
    const now = clock();
    const seen = new Set<string>();
    for (const [id, o] of Object.entries(others ?? {})) {
      seen.add(id);
      const g = ghosts.current.get(id);
      const p = o.pose;
      if (g && g.n === p.n) continue;
      const fresh = p.end !== "tee" && g !== undefined && now - p.t < REPLAY_MAX_S;
      ghosts.current.set(id, {
        n: p.n,
        roll: fresh ? startRoll(p.sx, p.sy, p.t, p.a, p.p) : null,
        x: fresh ? p.sx : p.ex,
        y: fresh ? p.sy : p.ey,
        sunk: !fresh && p.end === "in",
      });
    }
    for (const id of [...ghosts.current.keys()]) if (!seen.has(id)) ghosts.current.delete(id);
  }, [others, clock]);

  // The loop: step the rolling balls at a fixed rate and draw.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      acc += dt;
      const { hole: h, others: o } = props.current;
      const m = me.current;
      const ev = noEvents();
      let steps = 0;
      while (acc >= DT && steps < 60) {
        acc -= DT;
        steps++;
        if (m.roll && !m.roll.done) {
          stepRoll(h, m.roll, ev);
          for (let i = 0; i < h.bumpers.length; i++) {
            const b = h.bumpers[i];
            if (Math.hypot(m.roll.x - b.x, m.roll.y - b.y) < b.r + 0.35) bumped.current.set(i, t / 1000);
          }
        }
        for (const g of ghosts.current.values()) if (g.roll && !g.roll.done) stepRoll(h, g.roll);
      }
      if (acc > DT) acc = 0;
      golfAudio.events(ev);

      // My roll ends.
      if (m.roll) {
        m.x = m.roll.x;
        m.y = m.roll.y;
        if (m.roll.done) {
          const end = m.roll.done;
          if (end === "water" && !m.waterUntil) m.waterUntil = t / 1000 + WATER_PAUSE_S;
          if (end !== "water" || t / 1000 >= m.waterUntil) {
            const pose = m.pendingEnd!;
            m.x = pose.ex;
            m.y = pose.ey;
            m.roll = null;
            m.waterUntil = 0;
            if (pose.fin) props.current.onDone?.(pose.s, pose.end === "in");
          }
        }
      }
      // Ghosts settle where their player said.
      for (const [id, g] of ghosts.current) {
        const pose = o?.[id]?.pose;
        if (g.roll) {
          g.x = g.roll.x;
          g.y = g.roll.y;
          if (g.roll.done && pose) {
            g.roll = null;
            g.x = pose.ex;
            g.y = pose.ey;
            g.sunk = pose.end === "in";
          }
        }
      }

      const balls: DrawBall[] = [];
      for (const [id, g] of ghosts.current) balls.push({ id, x: g.x, y: g.y, color: o?.[id]?.color ?? "#999", sunk: g.sunk });
      const sunk = m.fin && !m.roll && m.pendingEnd?.end === "in";
      const mineSunk = sunk || (m.fin && !m.roll && initial?.end === "in" && !m.pendingEnd);
      if (!props.current.watching) balls.push({ id: "me", x: m.x, y: m.y, color: props.current.color, me: true, sunk: mineSunk });
      const a = aim.current;
      const holeT = m.roll ? m.roll.t : props.current.clock();
      const aimView = a && !m.roll ? { x: m.x, y: m.y, ...a } : null;
      const scene = props.current.view === "3d" ? sceneRef.current : null;
      if (scene) {
        scene.render({ t: holeT, balls, aim: aimView, bumped: bumped.current, now: t / 1000 });
      } else if (props.current.view === "2d") {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        const f = fitRef.current;
        if (ctx && f.w) {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          if (canvas!.width !== Math.round(f.w * dpr) || canvas!.height !== Math.round(f.h * dpr)) {
            canvas!.width = Math.round(f.w * dpr);
            canvas!.height = Math.round(f.h * dpr);
          }
          drawHole(ctx, { hole: h, t: holeT, balls, aim: aimView, bumped: bumped.current }, f, dpr, t / 1000);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // `initial` only seeds the ball; later changes are my own writes coming back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pull back and release.
  useEffect(() => {
    const canvas = wrapRef.current;
    if (!canvas) return;
    let drag: { id: number; x: number; y: number } | null = null;
    const canShoot = () => {
      const m = me.current;
      return props.current.enabled && !m.roll && !m.fin;
    };
    const down = (e: PointerEvent) => {
      if (!canShoot() || drag) return;
      canvas.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      aim.current = null;
    };
    const move = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = drag.x - e.clientX;
      const dy = drag.y - e.clientY;
      const len = Math.hypot(dx, dy);
      const f = fitRef.current;
      const scene = props.current.view === "3d" ? sceneRef.current : null;
      const r = canvas.getBoundingClientRect();
      const full = Math.max(90, Math.min(scene ? r.width : f.w, scene ? r.height : f.h) * 0.42);
      const v = scene ? scene.screenToHoleVec(dx, dy) : screenToHoleVec(f, dx, dy);
      aim.current = len < 8 ? null : { angle: Math.atan2(v.y, v.x), power: Math.min(1, len / full) };
    };
    const up = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      drag = null;
      const a = aim.current;
      aim.current = null;
      if (!a || a.power < 0.03 || !canShoot()) return;
      shoot(a.angle, a.power);
    };
    const cancel = () => {
      drag = null;
      aim.current = null;
    };
    const shoot = (angle: number, power: number) => {
      const { hole: h, clock: c } = props.current;
      const m = me.current;
      const t = c();
      const { pose } = shotPose(h, { x: m.x, y: m.y, s: m.strokes, n: m.n }, t, angle, power);
      m.strokes = pose.s;
      m.n = pose.n;
      m.fin = pose.fin;
      m.pendingEnd = pose;
      m.roll = startRoll(m.x, m.y, t, angle, power);
      golfAudio.putt(power);
      props.current.onShot?.(pose);
    };
    // Development only: `__golf.auto(skill)` takes my next shot like a bot would (for testing).
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __golf?: unknown }).__golf = {
        auto: (skill = 1) => {
          if (!canShoot()) return false;
          const m = me.current;
          const s = botShot(props.current.hole, m.x, m.y, props.current.clock(), skill, Math.random);
          shoot(s.angle, s.power);
          return true;
        },
      };
    }
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative flex min-h-0 w-full flex-1 touch-none select-none items-center justify-center">
      <div className="relative" style={view === "3d" ? { width: box.w, height: box.h } : { width: fit.w, height: fit.h }}>
        {view === "3d" ? (
          <>
            <canvas ref={glRef} style={{ width: box.w, height: box.h }} className="block rounded-xl ring-1 ring-white/10" />
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setCamMode((m) => (m === "seguir" ? "todo" : "seguir"))}
              className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-xl bg-black/55 px-2.5 py-1.5 text-xs font-bold text-white"
            >
              {camMode === "seguir" ? <Maximize2 className="h-3.5 w-3.5" /> : <Navigation className="h-3.5 w-3.5" />}
              {camMode === "seguir" ? "Ver todo" : "Seguir la pelota"}
            </button>
          </>
        ) : (
          <canvas ref={canvasRef} style={{ width: fit.w, height: fit.h }} className="block rounded-xl ring-1 ring-white/10" />
        )}
        {children}
      </div>
    </div>
  );
}
