"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, Crown, RotateCcw, Scissors, Shield, Skull, Trophy, X, Zap } from "lucide-react";
import type { TopEntry } from "@/lib/vibora";
import { PRIMARY_BUTTON } from "@/components/ui";

export interface HudData {
  mass: number;
  rank: number;
  total: number;
  top: { id: string; name: string; color: string; mass: number }[];
  leaderId: string | null;
  /** Points to pass the one above (null when first or out). */
  gap: number | null;
  /** Null online: no clock. */
  secondsLeft: number | null;
  countdown: number | null;
  /** 0–1: how close my head is to the edge. */
  edge: number;
  /** Just got cut. */
  hurt: boolean;
  boostReady: boolean;
  boosting: boolean;
}

export interface FeedItem {
  key: number;
  text: string;
  tone: "good" | "bad" | null;
  kind: "cut" | "crash";
}

/** What the "perdiste" screen shows. */
export interface Crash {
  /** Who you ran into ("" = the edge). */
  by: string;
  best: number;
  seconds: number;
  cuts: number;
  bestRank: number;
}

const GLASS = "rounded-2xl bg-slate-950/55 ring-1 ring-white/10 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.35)]";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Everything over the canvas: score, ranking, clock, feed, boost and the end-of-life card. */
export default function Hud({
  hud,
  feed,
  online,
  myId,
  top,
  crashed,
  touch,
  hint,
  onBoost,
  onRespawn,
}: {
  hud: HudData | null;
  feed: FeedItem[];
  online: boolean;
  myId: string;
  top: TopEntry[];
  crashed: Crash | null;
  touch: boolean;
  hint: boolean;
  onBoost: (on: boolean) => void;
  onRespawn: () => void;
}) {
  const [showTop, setShowTop] = useState(false);
  if (!hud) return null;
  const controls = touch ? "Arrastrá el dedo para guiar · mantené el rayo para acelerar" : "Guiá con el mouse · click o espacio para acelerar";
  const lastSeconds = hud.secondsLeft !== null && hud.secondsLeft <= 10;

  return (
    <>
      {hud.edge > 0.6 && (
        <p className="pointer-events-none absolute inset-x-0 bottom-28 mx-auto w-fit animate-pulse rounded-full bg-rose-600/80 px-3 py-1 text-sm font-semibold text-white shadow-lg">
          {online ? "¡Cuidado! El borde te elimina" : "¡El borde quema! Alejate"}
        </p>
      )}
      {hud.hurt && <div className="pointer-events-none absolute inset-0 animate-pulse bg-rose-500/15" />}

      {/* Score */}
      <div className={`pointer-events-none absolute left-3 top-3 w-36 px-3.5 py-2.5 sm:w-44 ${GLASS}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Largo</p>
        <p className="font-display text-3xl font-bold leading-none tabular-nums text-white">{hud.mass}</p>
        {hud.rank > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold ${
                hud.rank === 1 ? "bg-amber-400/20 text-amber-200 ring-1 ring-amber-300/40" : "bg-white/10 text-slate-200"
              }`}
            >
              {hud.rank === 1 && <Crown className="h-3 w-3" />}#{hud.rank}
            </span>
            <span className="text-slate-400">de {hud.total}</span>
          </div>
        )}
        {hud.gap !== null && hud.gap > 0 && <p className="mt-1 text-[11px] text-slate-400">a {hud.gap} del #{hud.rank - 1}</p>}
      </div>

      {/* Clock or "en línea" */}
      <div
        className={`pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 px-3 py-1.5 text-sm ${GLASS} ${
          lastSeconds ? "text-rose-200 ring-rose-400/50" : "text-slate-100"
        }`}
      >
        {online ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-400" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider">En línea · {hud.total}</span>
          </>
        ) : (
          <>
            <Clock className={`h-3.5 w-3.5 ${lastSeconds ? "animate-pulse" : "text-slate-400"}`} />
            <span className="font-mono font-semibold tabular-nums">{clock(hud.secondsLeft ?? 0)}</span>
          </>
        )}
      </div>

      {/* Ranking */}
      <div className="absolute right-3 top-3 flex w-40 flex-col items-stretch gap-2 sm:w-48">
        <div className={`pointer-events-none px-2.5 py-2 ${GLASS}`}>
          <p className="mb-1 flex items-center gap-1 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            <Trophy className="h-3 w-3" /> Posiciones
          </p>
          <ol className="flex flex-col gap-0.5 text-xs">
            {hud.top.map((p, i) => (
              <li
                key={p.id}
                className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1 ${
                  p.id === myId ? "bg-lime-400/15 font-semibold text-white ring-1 ring-lime-300/30" : "text-slate-300"
                }`}
              >
                <span className={`w-3.5 text-right tabular-nums ${i === 0 ? "text-amber-300" : "text-slate-500"}`}>
                  {i === 0 ? <Crown className="h-3 w-3" /> : i + 1}
                </span>
                <span className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/40" style={{ backgroundColor: p.color }} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="font-mono tabular-nums">{p.mass}</span>
              </li>
            ))}
            {hud.rank > hud.top.length && (
              <li className="flex items-center gap-1.5 rounded-lg bg-lime-400/15 px-1.5 py-1 font-semibold text-white ring-1 ring-lime-300/30">
                <span className="w-3.5 text-right tabular-nums text-slate-400">{hud.rank}</span>
                <span className="h-2 w-2 shrink-0 rounded-full bg-white" />
                <span className="flex-1 truncate">Vos</span>
                <span className="font-mono tabular-nums">{hud.mass}</span>
              </li>
            )}
          </ol>
        </div>
        {online && (
          <button
            data-control
            onClick={() => setShowTop((v) => !v)}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-200 transition hover:text-amber-100 ${GLASS} ring-amber-300/25`}
          >
            <Trophy className="h-3.5 w-3.5" /> Récords de hoy
          </button>
        )}
      </div>

      {online && showTop && (
        <div data-control className={`absolute inset-x-3 top-16 z-10 mx-auto max-w-xs p-4 ${GLASS} bg-slate-950/90 ring-amber-300/30`}>
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 font-display font-semibold text-amber-200">
              <Trophy className="h-4 w-4" /> Los más grandes de hoy
            </p>
            <button onClick={() => setShowTop(false)} aria-label="Cerrar" className="text-slate-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          {top.length ? (
            <ol className="flex flex-col gap-1 text-sm">
              {top.map((e, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg px-2 py-1 text-slate-200 odd:bg-white/5">
                  <span className={`w-4 text-right tabular-nums ${i < 3 ? "text-amber-300" : "text-slate-500"}`}>{i + 1}</span>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                  <span className="flex-1 truncate">{e.name}</span>
                  <span className="font-mono tabular-nums">{e.best}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-400">Todavía nadie. ¡Llegá a 20 puntos y entrás!</p>
          )}
        </div>
      )}

      {/* Feed */}
      <div className="pointer-events-none absolute inset-x-0 top-16 flex flex-col items-center gap-1 px-3">
        {feed.map((f) => (
          <p
            key={f.key}
            className={`animate-celebration-in flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 backdrop-blur-md ${
              f.tone === "good"
                ? "bg-emerald-500/20 text-emerald-100 ring-emerald-400/35"
                : f.tone === "bad"
                  ? "bg-rose-500/20 text-rose-100 ring-rose-400/35"
                  : "bg-slate-950/60 text-slate-200 ring-white/10"
            }`}
          >
            {f.kind === "cut" ? <Scissors className="h-3.5 w-3.5" /> : <Skull className="h-3.5 w-3.5" />}
            {f.text}
          </p>
        ))}
      </div>

      {/* Countdown and the first seconds' tips */}
      {hud.countdown !== null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            key={hud.countdown}
            className="animate-celebration-in font-display text-8xl font-bold text-white drop-shadow-[0_0_30px_rgba(163,230,53,0.75)]"
          >
            {hud.countdown}
          </span>
        </div>
      )}
      {(hud.countdown !== null || hint) && !crashed && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 flex flex-col items-center gap-1.5 px-4 text-center text-xs sm:text-sm">
          <p className={`px-3 py-1.5 text-slate-200 ${GLASS}`}>{controls}</p>
          <p className={`flex items-center gap-1.5 px-3 py-1.5 text-slate-200 ${GLASS}`}>
            <Shield className="h-3.5 w-3.5 shrink-0 text-slate-100" />
            {online ? "Cabeza y cuello blindados: si los chocás, perdés." : "Cabeza y cuello blindados: no se cortan."}
          </p>
          <p className={`flex items-center gap-1.5 px-3 py-1.5 text-slate-200 ${GLASS}`}>
            <Scissors className="h-3.5 w-3.5 shrink-0 text-lime-300" /> El resto del cuerpo se corta con la cabeza.
          </p>
        </div>
      )}

      {/* Boost */}
      {touch && !crashed && (
        <button
          aria-label="Acelerar"
          data-control
          onPointerDown={(e) => {
            e.stopPropagation();
            onBoost(true);
          }}
          onPointerUp={() => onBoost(false)}
          onPointerCancel={() => onBoost(false)}
          onPointerLeave={() => onBoost(false)}
          className={`absolute bottom-6 right-6 flex h-20 w-20 items-center justify-center rounded-full ring-2 backdrop-blur-md transition active:scale-95 ${
            hud.boosting
              ? "bg-amber-400/50 text-white ring-amber-200 shadow-[0_0_35px_rgba(251,191,36,0.6)]"
              : hud.boostReady
                ? "bg-amber-400/20 text-amber-200 ring-amber-300/60"
                : "bg-slate-800/50 text-slate-500 ring-slate-600/60"
          }`}
        >
          <Zap className="h-9 w-9" fill={hud.boosting ? "currentColor" : "none"} />
        </button>
      )}

      {/* Lost (online) */}
      {crashed && (
        <div data-control className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[3px]">
          <div className="animate-celebration-in relative flex w-full max-w-xs flex-col items-center gap-4 overflow-hidden rounded-3xl border border-rose-400/25 bg-slate-900/95 p-6 text-center shadow-[0_0_60px_rgba(244,63,94,0.25)]">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-20 mx-auto h-40 w-64 rounded-full bg-rose-500/25 blur-3xl" />
            <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-rose-700 shadow-[0_0_24px_rgba(244,63,94,0.5)]">
              <Skull className="h-6 w-6 text-white" />
            </span>
            <div className="relative">
              <p className="font-display text-3xl font-bold text-slate-100">¡Perdiste!</p>
              <p className="mt-1 text-sm text-slate-400">{crashed.by ? `Chocaste contra ${crashed.by}` : "Chocaste contra el borde"}</p>
            </div>
            <div className="relative grid w-full grid-cols-2 gap-2 text-left">
              {[
                ["Llegaste a", `${crashed.best}`],
                ["Mejor puesto", crashed.bestRank ? `#${crashed.bestRank}` : "–"],
                ["Duraste", clock(crashed.seconds)],
                ["Colas cortadas", `${crashed.cuts}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-800/70 px-3 py-2 ring-1 ring-white/5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                  <p className="font-display text-xl font-bold tabular-nums text-slate-100">{value}</p>
                </div>
              ))}
            </div>
            {top.length > 0 && crashed.best >= (top.length >= 10 ? top[top.length - 1].best : 20) && (
              <p className="relative flex items-center gap-1.5 text-sm text-amber-200">
                <Trophy className="h-4 w-4" /> ¡Entraste en los récords de hoy!
              </p>
            )}
            <button onClick={onRespawn} className={`relative flex w-full items-center justify-center gap-2 ${PRIMARY_BUTTON}`}>
              <RotateCcw className="h-4 w-4" /> Jugar de nuevo
            </button>
            <Link href="/viborita" className="relative text-sm text-slate-400 hover:text-slate-200">
              Salir
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
