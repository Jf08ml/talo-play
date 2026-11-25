"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Lock, RotateCcw, Star } from "lucide-react";
import { LEVELS } from "@/lib/gravedadLevels";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import FullscreenButton from "@/components/FullscreenButton";
import Field from "./Field";

/**
 * Solo: the hand-made levels in order, with up to three stars each by time
 * (`starsFor`). Progress stays in this browser (`gravedad.estrellas`); a
 * level opens once the one before it is done. No Firebase.
 */

const KEY = "gravedad.estrellas";

type Progress = Record<number, { stars: number; ms: number }>;

export function readProgress(): Progress {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Progress;
  } catch {
    return {};
  }
}

function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

export function starsFor(level: number, seconds: number): number {
  const par = LEVELS[level].par;
  return seconds <= par ? 3 : seconds <= par * 1.6 ? 2 : 1;
}

export default function SoloGame({ onExit }: { onExit: () => void }) {
  const [progress, setProgress] = useState<Progress>({});
  const [playing, setPlaying] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- progress lives in this browser: read after mounting.
    setProgress(readProgress());
  }, []);

  if (playing !== null)
    return (
      <PlayLevel
        key={playing}
        level={playing}
        onExit={() => setPlaying(null)}
        onNext={() => setPlaying(playing + 1 < LEVELS.length ? playing + 1 : null)}
        onDone={(ms) => {
          const stars = starsFor(playing, ms / 1000);
          const prev = progress[playing];
          const next = { ...progress, [playing]: { stars: Math.max(stars, prev?.stars ?? 0), ms: Math.min(ms, prev?.ms ?? Infinity) } };
          setProgress(next);
          saveProgress(next);
          return { stars, best: next[playing].ms };
        }}
      />
    );

  const total = Object.values(progress).reduce((s, p) => s + p.stars, 0);
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-talo-ink text-white">
      <div className="flex items-center gap-2 p-3">
        <button onClick={onExit} aria-label="Volver" className="grid h-11 w-11 place-items-center rounded-xl hover:bg-white/10">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 font-display text-xl">Niveles</h1>
        <span className="flex items-center gap-1 font-mono text-sm text-talo-hero">
          <Star className="h-4 w-4 fill-talo-hero" /> {total} / {LEVELS.length * 3}
        </span>
      </div>
      <div className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-3 p-4 sm:grid-cols-3">
        {LEVELS.map((lv, i) => {
          const open = i === 0 || !!progress[i - 1];
          const p = progress[i];
          return (
            <button
              key={i}
              disabled={!open}
              onClick={() => setPlaying(i)}
              className="flex flex-col gap-2 rounded-2xl bg-white/[0.06] p-4 text-left transition hover:bg-white/10 disabled:opacity-40"
            >
              <span className="font-mono text-xs text-white/50">Nivel {i + 1}</span>
              <span className="font-bold leading-tight">{lv.name}</span>
              {open ? (
                <span className="flex gap-0.5">
                  {[1, 2, 3].map((s) => (
                    <Star key={s} className={`h-4 w-4 ${p && p.stars >= s ? "fill-talo-hero text-talo-hero" : "text-white/25"}`} />
                  ))}
                  {p && <span className="ml-auto font-mono text-xs text-white/60">{(p.ms / 1000).toFixed(1)} s</span>}
                </span>
              ) : (
                <Lock className="h-4 w-4 text-white/50" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlayLevel({
  level,
  onExit,
  onNext,
  onDone,
}: {
  level: number;
  onExit: () => void;
  onNext: () => void;
  onDone: (ms: number) => { stars: number; best: number };
}) {
  const identity = useClientIdentity();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ ms: number; deaths: number; stars: number; best: number } | null>(null);
  const start = useRef(0);
  useEffect(() => {
    // A short beat before the clock runs, so nobody starts mid-step.
    start.current = performance.now() + 500;
  }, [attempt]);
  const lv = LEVELS[level];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-talo-ink text-white">
      <div className="flex items-center gap-2 p-2">
        <button onClick={onExit} aria-label="Volver a los niveles" className="grid h-11 w-11 place-items-center rounded-xl hover:bg-white/10">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 truncate font-bold">
          {level + 1}. {lv.name}
        </p>
        <button
          onClick={() => {
            setResult(null);
            setAttempt((a) => a + 1);
          }}
          aria-label="Empezar de nuevo"
          className="grid h-11 w-11 place-items-center rounded-xl hover:bg-white/10"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
        <FullscreenButton className="grid h-11 w-11 place-items-center rounded-xl text-white hover:bg-white/10" iconClassName="h-5 w-5" />
      </div>
      <Field
        key={attempt}
        level={lv}
        color={identity.color || "#FFD400"}
        clock={() => (start.current ? (performance.now() - start.current) / 1000 : -1)}
        onFinish={(t, deaths) => setResult({ ms: Math.round(t * 1000), deaths, ...onDone(Math.round(t * 1000)) })}
        frozen={!!result}
        className="flex-1"
      />
      {result && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-4">
          <div className="animate-celebration-in flex w-full max-w-sm flex-col items-center gap-3 rounded-[28px] bg-[#1c1c1c] p-6 text-center">
            <p className="font-display text-3xl">¡Llegaste!</p>
            <div className="flex gap-1">
              {[1, 2, 3].map((s) => (
                <Star key={s} className={`h-9 w-9 ${result.stars >= s ? "fill-talo-hero text-talo-hero" : "text-white/20"}`} />
              ))}
            </div>
            <p className="font-mono text-lg">{(result.ms / 1000).toFixed(1)} s</p>
            <p className="text-sm text-white/60">
              {result.deaths ? `${result.deaths} ${result.deaths === 1 ? "caída" : "caídas"} · ` : ""}
              {result.stars < 3 ? `Tres estrellas en ${lv.par} s o menos` : "¡Perfecto!"}
            </p>
            <div className="mt-2 flex w-full flex-col gap-2">
              {level + 1 < LEVELS.length && (
                <button onClick={onNext} className={PRIMARY_BUTTON}>
                  Siguiente nivel
                </button>
              )}
              <button
                onClick={() => {
                  setResult(null);
                  setAttempt((a) => a + 1);
                }}
                className={SECONDARY_BUTTON}
              >
                Repetir
              </button>
              <button onClick={onExit} className="text-sm text-white/60 hover:text-white">
                Niveles
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
