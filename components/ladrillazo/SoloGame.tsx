"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, X, ChevronRight, List } from "lucide-react";
import { Board, makePaddle, type Events } from "@/lib/ladrillazoSim";
import { CAMPAIGN, generateLevel, levelCells, type Level } from "@/lib/ladrillazoLevels";
import { burst, stepParticles, type Particle } from "@/lib/ladrillazoDraw";
import { makeSeed } from "@/lib/random";
import { useWakeLock } from "@/components/carreras/Controller";
import { Confetti } from "@/components/Results";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import Field, { newInput, useEventSounds, type FieldInput, type Frame } from "./Field";
import { GoalPill, Lives, ProgressBar, Stars, formatTime } from "./Hud";
import { readRecord, saveRecord, saveStars } from "./progress";

export type SoloStart = { kind: "campaign"; index: number } | { kind: "infinite" };

interface Run {
  kind: "campaign" | "infinite";
  /** Campaign index, or the infinite mode's level number (0…). */
  index: number;
  seed: number;
  /** Infinite: points and lives carried from the earlier levels. */
  carried: number;
  lives: number;
  key: number;
}

type Phase = "playing" | "paused" | "won" | "lost";

interface Hud {
  score: number;
  lives: number;
  time: number;
  progress: number;
}

function levelOf(run: Run): Level {
  return run.kind === "campaign" ? CAMPAIGN[run.index] : generateLevel(run.seed + run.index * 7919, run.index);
}

/** Stars for a campaign level: done, at most one life lost, under the par time. */
function starsFor(level: Level, livesLeft: number, seconds: number): number {
  return 1 + (level.balls - livesLeft <= 1 ? 1 : 0) + (seconds <= level.par ? 1 : 0);
}

/** One solo level after another, full screen. */
export default function SoloGame({ start, onExit }: { start: SoloStart; onExit: () => void }) {
  const [run, setRun] = useState<Run>(() =>
    start.kind === "campaign"
      ? { kind: "campaign", index: start.index, seed: 0, carried: 0, lives: 0, key: 0 }
      : { kind: "infinite", index: 0, seed: makeSeed(), carried: 0, lives: 3, key: 0 }
  );
  const level = levelOf(run);
  const boardRef = useRef<Board | null>(null);
  const particles = useRef<Particle[]>([]);
  const input = useRef<FieldInput>(newInput());
  const [phase, setPhase] = useState<Phase>("playing");
  const phaseRef = useRef(phase);
  const [hud, setHud] = useState<Hud>({ score: 0, lives: 0, time: 0, progress: 0 });
  const [result, setResult] = useState<{ stars: number; score: number; record: boolean } | null>(null);
  const [hint, setHint] = useState(true);
  const lastHud = useRef(0);
  const sound = useEventSounds();
  useWakeLock();

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // A new board for each level (and each retry).
  /* eslint-disable react-hooks/set-state-in-effect -- the screen resets with each new board. */
  useEffect(() => {
    const lvl = levelOf(run);
    const b = new Board(levelCells(lvl), [makePaddle("me")], { goal: lvl.goal, lives: run.kind === "infinite" ? run.lives : lvl.balls });
    b.serve("me", 30);
    boardRef.current = b;
    particles.current = [];
    setHud({ score: run.carried, lives: b.lives, time: 0, progress: 0 });
    setResult(null);
    setPhase("playing");
    const t = setTimeout(() => setHint(false), 6000);
    return () => clearTimeout(t);
  }, [run]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const onEvents = useCallback(
    (ev: Events) => {
      for (const { i, ch } of ev.broke) burst(particles.current, i, ch, ch === "o" ? 14 : 6);
      if (ev.broke.some((b) => b.ch === "o")) sound("good");
      else if (ev.booms.length) sound("capture");
      else if (ev.broke.length) sound("place");
      if (ev.paddle) sound("tick");
      if (ev.power.length) sound("flip");
      if (ev.lost.length && boardRef.current && !boardRef.current.balls.length) sound("bad");
    },
    [sound]
  );

  const frame = (dt: number): Frame => {
    const b = boardRef.current;
    if (!b) return { view: { cells: "", paddles: [], balls: [] } };
    if (phaseRef.current === "playing") {
      b.step(dt, { me: { ...input.current } });
      input.current.launch = false;
      onEvents(b.takeEvents());
      if (b.done || b.over) {
        const won = b.done;
        const seconds = b.time;
        const bonus = won ? Math.max(0, Math.round((level.par - seconds) * 5)) + b.lives * 50 : 0;
        const score = run.carried + b.score + bonus;
        phaseRef.current = won ? "won" : "lost";
        setPhase(phaseRef.current);
        if (run.kind === "campaign") {
          const stars = won ? starsFor(level, b.lives, seconds) : 0;
          if (won) saveStars(run.index, stars);
          setResult({ stars, score, record: false });
        } else {
          const record = !won && score > readRecord();
          if (!won) saveRecord(score);
          setResult({ stars: 0, score, record });
        }
        if (!won) sound("end");
      }
      const now = performance.now();
      if (now - lastHud.current > 120) {
        lastHud.current = now;
        setHud({ score: run.carried + b.score, lives: b.lives, time: b.time, progress: b.progress() });
      }
    }
    stepParticles(particles.current, dt);
    return {
      view: {
        cells: b.cellString(),
        paddles: b.paddles.map((p) => ({ x: p.x, hw: p.hw, side: p.side, color: "#FFD400", me: true })),
        balls: b.balls,
        drops: b.drops,
      },
      particles: particles.current,
    };
  };

  // Esc / P pause.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "p" && e.key !== "P") return;
      setPhase((p) => (p === "playing" ? "paused" : p === "paused" ? "playing" : p));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Leaving the tab pauses.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) setPhase((p) => (p === "playing" ? "paused" : p));
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  const retry = () => setRun((r) => ({ ...r, key: r.key + 1 }));
  const next = () => {
    const b = boardRef.current;
    if (run.kind === "campaign") {
      if (run.index + 1 < CAMPAIGN.length) setRun({ ...run, index: run.index + 1, key: run.key + 1 });
      else onExit();
      return;
    }
    setRun({ ...run, index: run.index + 1, carried: result?.score ?? run.carried, lives: Math.min(6, (b?.lives ?? 1) + 1), key: run.key + 1 });
  };
  const restartInfinite = () => setRun({ kind: "infinite", index: 0, seed: makeSeed(), carried: 0, lives: 3, key: run.key + 1 });

  const title = run.kind === "campaign" ? `Nivel ${run.index + 1} · ${level.name}` : `Infinito · nivel ${run.index + 1}`;
  const lastCampaign = run.kind === "campaign" && run.index + 1 >= CAMPAIGN.length;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-talo-ink text-white">
      <header className="mx-auto flex w-full max-w-xl items-center gap-3 px-3 pt-3">
        <button onClick={onExit} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Salir">
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{title}</p>
          <GoalPill goal={level.goal} />
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-mono text-lg leading-none">{hud.score}</span>
          <Lives lives={hud.lives} />
        </div>
        <button
          onClick={() => setPhase((p) => (p === "playing" ? "paused" : p === "paused" ? "playing" : p))}
          className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label={phase === "paused" ? "Seguir" : "Pausa"}
        >
          {phase === "paused" ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
        </button>
      </header>
      <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 py-2 text-xs text-white/60">
        <span className="font-mono">{formatTime(hud.time)}</span>
        <ProgressBar value={hud.progress} />
      </div>

      <main className="flex min-h-0 flex-1 flex-col px-2 pb-3">
        <Field frame={frame} input={input} paddleX={() => boardRef.current?.paddles[0].x ?? 10} controls={phase === "playing"}>
          {hint && phase === "playing" && (
            <p className="pointer-events-none absolute inset-x-0 bottom-12 text-center text-xs text-white/70">
              Mové la paleta con el dedo, el mouse o las flechas · tocá para sacar
            </p>
          )}
          {phase === "paused" && (
            <Overlay>
              <p className="font-display text-3xl">Pausa</p>
              <button onClick={() => setPhase("playing")} className={`w-full ${PRIMARY_BUTTON}`}>
                Seguir
              </button>
              <button onClick={retry} className={`w-full ${SECONDARY_BUTTON}`}>
                Empezar de nuevo
              </button>
              <button onClick={onExit} className="text-sm text-white/60 hover:text-white">
                Salir
              </button>
            </Overlay>
          )}
          {(phase === "won" || phase === "lost") && result && (
            <Overlay>
              {phase === "won" && <Confetti pieces={80} />}
              <p className="font-display text-3xl">
                {phase === "won" ? (run.kind === "infinite" ? "¡Nivel superado!" : lastCampaign ? "¡Terminaste todo!" : "¡Ladrillazo!") : run.kind === "infinite" ? "Fin del juego" : "Sin pelotas"}
              </p>
              {run.kind === "campaign" && phase === "won" && <Stars n={result.stars} size="h-8 w-8" />}
              <p className="text-sm text-white/70">
                {result.score} puntos
                {result.record && " · ¡Récord nuevo!"}
              </p>
              {phase === "won" ? (
                <>
                  {!lastCampaign && (
                    <button onClick={next} className={`flex w-full items-center justify-center gap-1 ${PRIMARY_BUTTON}`}>
                      {run.kind === "infinite" ? "Seguir" : "Siguiente nivel"} <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                  {run.kind === "campaign" && (
                    <button onClick={retry} className={`flex w-full items-center justify-center gap-1.5 ${SECONDARY_BUTTON}`}>
                      <RotateCcw className="h-4 w-4" /> Repetir por más estrellas
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={run.kind === "infinite" ? restartInfinite : retry}
                  className={`flex w-full items-center justify-center gap-1.5 ${PRIMARY_BUTTON}`}
                >
                  <RotateCcw className="h-4 w-4" /> Otra vez
                </button>
              )}
              <button onClick={onExit} className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white">
                <List className="h-4 w-4" /> Volver al menú
              </button>
            </Overlay>
          )}
        </Field>
      </main>
    </div>
  );
}

export function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/70 p-6">
      <div className="flex w-full max-w-[260px] flex-col items-center gap-3 text-center">{children}</div>
    </div>
  );
}
