"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Flag, Shuffle, X } from "lucide-react";
import { course, dailyCourse, type Difficulty, DIFFICULTIES } from "@/lib/minigolfHoles";
import { scoreName, toPar } from "@/lib/minigolfSim";
import { getDaily, submitDaily, type DailyEntry } from "@/lib/minigolf";
import { makeSeed } from "@/lib/random";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { Confetti } from "@/components/Results";
import { MuteButton } from "@/components/ladrillazo/Field";
import { formatTime } from "@/components/ladrillazo/Hud";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import GolfField from "./GolfField";
import Scorecard from "./Scorecard";
import { STARTED, readDay, saveDay, saveRecord } from "./progress";

export type SoloStart = { kind: "course"; difficulty: Difficulty } | { kind: "daily"; day: string };

export const SOLO_HOLES = 9;

const msSince = (t: number) => Math.round(performance.now() - t);

/** Solo: a 9-hole course (new every time) or today's holes, with no room and no Firebase until the daily top. */
export default function SoloGame({ start, onExit }: { start: SoloStart; onExit: () => void }) {
  const identity = useClientIdentity();
  const daily = start.kind === "daily";
  const [seed, setSeed] = useState(makeSeed);
  const holes = useMemo(
    () => (start.kind === "daily" ? dailyCourse(start.day) : course(seed, SOLO_HOLES, start.difficulty)),
    [start, seed]
  );
  const pars = holes.map((h) => h.par);
  const [idx, setIdx] = useState(0);
  const [card, setCard] = useState<number[]>([]);
  const [strokes, setStrokes] = useState(0);
  const [holeDone, setHoleDone] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [record, setRecord] = useState(false);
  const [top, setTop] = useState<DailyEntry[] | null>(null);
  const startedAt = useRef(0);
  const holeStart = useRef(0);
  const [round, setRound] = useState(0);

  useEffect(() => {
    startedAt.current = performance.now();
  }, [round]);
  useEffect(() => {
    holeStart.current = performance.now();
  }, [idx, round]);
  const clock = useCallback(() => (performance.now() - holeStart.current) / 1000, []);

  // One try a day: it counts from the moment the holes are seen.
  useEffect(() => {
    if (start.kind === "daily" && readDay(start.day) === null) saveDay(start.day, STARTED);
  }, [start]);

  const total = card.reduce((a, b) => a + b, 0);
  const parSoFar = pars.slice(0, card.length).reduce((a, b) => a + b, 0);

  const done = (n: number) => {
    const next = [...card, n];
    setCard(next);
    setHoleDone(n);
    if (next.length < holes.length) return;
    // The round is over.
    const sum = next.reduce((a, b) => a + b, 0);
    const diff = sum - pars.reduce((a, b) => a + b, 0);
    if (start.kind === "course") setRecord(saveRecord(start.difficulty, diff));
    if (start.kind === "daily") {
      const first = readDay(start.day) === STARTED;
      saveDay(start.day, sum);
      const ms = msSince(startedAt.current);
      const send =
        first && identity.clientId && identity.name
          ? submitDaily(start.day, identity.clientId, { name: identity.name, color: identity.color }, sum, ms)
          : Promise.resolve();
      send
        .catch(console.error)
        .then(() => getDaily(start.day))
        .then(setTop)
        .catch(console.error);
    }
  };

  const nextHole = () => {
    if (card.length >= holes.length) {
      setFinished(true);
      return;
    }
    setIdx(card.length);
    setStrokes(0);
    setHoleDone(null);
  };

  const again = () => {
    setSeed(makeSeed());
    setIdx(0);
    setCard([]);
    setStrokes(0);
    setHoleDone(null);
    setFinished(false);
    setRecord(false);
    setRound((r) => r + 1);
  };

  const label = daily ? "Hoyos del día" : DIFFICULTIES.find((d) => d.id === (start.kind === "course" ? start.difficulty : "media"))?.label;
  const hole = holes[idx];

  return (
    <div className="flex h-dvh flex-col bg-talo-ink text-white">
      <header className="mx-auto flex w-full max-w-xl items-center gap-3 px-3 pt-3">
        <button onClick={onExit} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Salir">
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            {finished ? "Recorrido terminado" : `Hoyo ${idx + 1} de ${holes.length} · Par ${hole.par}`}
          </p>
          <p className="text-xs text-white/60">
            {label}
            {card.length && !finished ? ` · llevás ${total} (${toPar(total, parSoFar)})` : ""}
          </p>
        </div>
        {!finished && (
          <span className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-center">
            <span className="block font-display text-xl leading-none">{strokes}</span>
            <span className="text-[10px] text-white/50">{strokes === 1 ? "golpe" : "golpes"}</span>
          </span>
        )}
        <MuteButton />
      </header>

      {finished ? (
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 overflow-y-auto p-3">
          {total <= pars.reduce((a, b) => a + b, 0) && <Confetti pieces={90} />}
          <div className="text-center">
            <p className="font-display text-4xl">
              {total} golpes <span className="text-talo-hero">{toPar(total, pars.reduce((a, b) => a + b, 0))}</span>
            </p>
            {record && <p className="mt-1 text-sm font-bold text-[#5fe0a0]">¡Tu mejor recorrido en {label?.toLowerCase()}!</p>}
          </div>
          <Scorecard pars={pars} rows={[{ id: "me", name: identity.name ?? "Vos", color: identity.color, card }]} myId="me" />
          {daily && top && (
            <div className="rounded-xl bg-white/[0.05] p-3 ring-1 ring-white/10">
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-white/60">Los mejores de hoy</p>
              {top.length === 0 ? (
                <p className="text-sm text-white/50">Todavía nadie terminó.</p>
              ) : (
                <ol className="flex flex-col gap-1 text-sm">
                  {top.map((e, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-4 text-right text-white/50">{i + 1}</span>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />
                      <span className="flex-1 truncate">{e.name}</span>
                      <span className="font-mono">{e.strokes}</span>
                      <span className="w-12 text-right font-mono text-white/50">{formatTime(e.ms / 1000)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          {daily ? (
            <>
              <p className="text-center text-xs text-white/50">Mañana hay hoyos nuevos.</p>
              <button onClick={onExit} className={PRIMARY_BUTTON}>
                Volver
              </button>
            </>
          ) : (
            <>
              <button onClick={again} className={`flex items-center justify-center gap-1.5 ${PRIMARY_BUTTON}`}>
                <Shuffle className="h-4 w-4" /> Otro recorrido
              </button>
              <button onClick={onExit} className="inline-flex items-center justify-center gap-1 text-sm text-white/60 hover:text-white">
                <Flag className="h-4 w-4" /> Volver al menú
              </button>
            </>
          )}
        </main>
      ) : (
        <main className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-2 p-3">
          <GolfField
            key={`${round}-${idx}`}
            hole={hole}
            clock={clock}
            color={identity.color}
            enabled={holeDone === null}
            onShot={(p) => setStrokes(p.s)}
            onDone={(n) => done(n)}
          >
            {holeDone !== null && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-black/55 p-4 text-center">
                <p className="animate-celebration-in font-display text-4xl">{scoreName(holeDone, hole.par)}</p>
                <p className="text-sm text-white/80">
                  {holeDone} {holeDone === 1 ? "golpe" : "golpes"} · par {hole.par}
                </p>
                <button onClick={nextHole} className={`flex items-center gap-1 ${PRIMARY_BUTTON}`}>
                  {card.length >= holes.length ? "Ver la tarjeta" : `Hoyo ${card.length + 1}`} <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </GolfField>
          {idx === 0 && strokes === 0 && (
            <p className="text-center text-xs text-white/60">Arrastrá hacia atrás para apuntar (como una gomera) y soltá para tirar.</p>
          )}
          {!daily && (
            <button onClick={again} className={`self-center text-xs ${SECONDARY_BUTTON} !min-h-0 !py-1.5`}>
              <Shuffle className="mr-1 inline h-3.5 w-3.5" /> Otro recorrido
            </button>
          )}
        </main>
      )}
    </div>
  );
}
