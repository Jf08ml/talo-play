"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Flag, Shuffle, X } from "lucide-react";
import { canBeImpossible, dailyPuzzle, generatePuzzle, totalCrossings } from "@/lib/puentes";
import { getDaily, submitDaily, type DailyEntry } from "@/lib/puentesRoom";
import { makeSeed } from "@/lib/random";
import { playSound } from "@/lib/sfx";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { Confetti } from "@/components/Results";
import { MuteButton } from "@/components/ladrillazo/Field";
import { Stars, formatTime } from "@/components/ladrillazo/Hud";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import PlayArea from "./PlayArea";
import Reveal from "./Reveal";
import { STARTED, readDay, saveDay, saveLevel } from "./progress";

export type SoloStart = { kind: "levels"; level: number } | { kind: "daily"; day: string };

type Phase = "playing" | "won" | "wrong" | "gaveup";

/** Stars for a level: fewer undos and restarts, more stars. */
function starsFor(mistakes: number): number {
  return mistakes === 0 ? 3 : mistakes <= 3 ? 2 : 1;
}

export default function SoloGame({ start, onExit }: { start: SoloStart; onExit: () => void }) {
  const identity = useClientIdentity();
  const daily = start.kind === "daily";
  const [level, setLevel] = useState(start.kind === "levels" ? start.level : 11);
  const [seed, setSeed] = useState(makeSeed);
  const pz = useMemo(() => (start.kind === "daily" ? dailyPuzzle(start.day) : generatePuzzle(seed, level)), [start, seed, level]);
  const [phase, setPhase] = useState<Phase>("playing");
  const [mistakes, setMistakes] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [doneMs, setDoneMs] = useState(0);
  const [top, setTop] = useState<DailyEntry[] | null>(null);
  const [attempt, setAttempt] = useState(0);

  // One try a day: it counts as tried from the moment the map is seen.
  useEffect(() => {
    if (start.kind === "daily" && readDay(start.day) === null) saveDay(start.day, STARTED);
  }, [start]);

  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [phase]);

  const fresh = (nextLevel: number) => {
    setLevel(nextLevel);
    setSeed(makeSeed());
    setPhase("playing");
    setMistakes(0);
    setStartedAt(Date.now());
    setNow(Date.now());
    setAttempt((a) => a + 1);
  };

  const finish = (outcome: Phase) => {
    const ms = Date.now() - startedAt;
    setDoneMs(ms);
    setPhase(outcome);
    if (outcome === "won") {
      if (!daily) saveLevel(level + 1);
    } else {
      playSound("bad");
    }
    if (start.kind === "daily") {
      const first = readDay(start.day) === STARTED;
      saveDay(start.day, outcome === "won" ? ms : -1);
      const send = outcome === "won" && first && identity.clientId && identity.name
        ? submitDaily(start.day, identity.clientId, { name: identity.name, color: identity.color }, ms)
        : Promise.resolve();
      send
        .catch(console.error)
        .then(() => getDaily(start.day))
        .then(setTop)
        .catch(console.error);
    }
  };

  const claimable = daily || canBeImpossible(level);
  const elapsed = (phase === "playing" ? now : startedAt + doneMs) - startedAt;

  return (
    <div className="min-h-dvh bg-talo-ink text-white">
      <header className="mx-auto flex w-full max-w-md items-center gap-3 px-3 pt-3">
        <button onClick={onExit} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Salir">
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{daily ? "Reto del día" : `Nivel ${level}`}</p>
          <p className="text-xs text-white/60">
            Cruzá los {totalCrossings(pz) === pz.bridges.length ? `${pz.bridges.length} puentes` : `${pz.bridges.length} puentes (${totalCrossings(pz)} cruces)`} sin repetir
          </p>
        </div>
        <span className="font-mono text-lg">{formatTime(elapsed / 1000)}</span>
        <MuteButton />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-col gap-3 p-3">
        {phase === "playing" ? (
          <>
            <PlayArea
              key={`${attempt}-${seed}`}
              pz={pz}
              canClaim={claimable}
              onSolved={() => finish("won")}
              onClaim={() => finish(pz.impossible ? "won" : "wrong")}
              onMistake={() => setMistakes((m) => m + 1)}
            />
            <button onClick={() => finish("gaveup")} className="self-center text-xs text-white/50 underline-offset-2 hover:text-white hover:underline">
              Me rindo: mostrame la solución
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            {phase === "won" && <Confetti pieces={90} />}
            <div className="text-center">
              <p className="font-display text-3xl">
                {phase === "won" ? (pz.impossible ? "¡Bien visto: no se podía!" : "¡Lo lograste!") : phase === "wrong" ? "Sí se podía" : "Así se hacía"}
              </p>
              {phase === "won" && !daily && (
                <div className="mt-2 flex justify-center">
                  <Stars n={starsFor(mistakes)} size="h-8 w-8" />
                </div>
              )}
              {phase === "won" && <p className="mt-1 text-sm text-white/70">{formatTime(doneMs / 1000)}</p>}
            </div>
            {phase !== "won" && <Reveal pz={pz} />}
            {daily && top && (
              <div className="rounded-xl bg-white/[0.05] p-3 ring-1 ring-white/10">
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-white/60">Los más rápidos de hoy</p>
                {top.length === 0 ? (
                  <p className="text-sm text-white/50">Todavía nadie lo resolvió.</p>
                ) : (
                  <ol className="flex flex-col gap-1 text-sm">
                    {top.map((e, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-4 text-right text-white/50">{i + 1}</span>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />
                        <span className="flex-1 truncate">{e.name}</span>
                        <span className="font-mono">{formatTime(e.ms / 1000)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
            {daily ? (
              <>
                <p className="text-center text-xs text-white/50">Mañana hay un mapa nuevo.</p>
                <button onClick={onExit} className={PRIMARY_BUTTON}>
                  Volver
                </button>
              </>
            ) : phase === "won" ? (
              <>
                <button onClick={() => fresh(level + 1)} className={`flex items-center justify-center gap-1 ${PRIMARY_BUTTON}`}>
                  Nivel {level + 1} <ChevronRight className="h-4 w-4" />
                </button>
                <button onClick={() => fresh(level)} className={`flex items-center justify-center gap-1.5 ${SECONDARY_BUTTON}`}>
                  <Shuffle className="h-4 w-4" /> Otro mapa del mismo nivel
                </button>
              </>
            ) : (
              <button onClick={() => fresh(level)} className={`flex items-center justify-center gap-1.5 ${PRIMARY_BUTTON}`}>
                <Shuffle className="h-4 w-4" /> Otro mapa
              </button>
            )}
            {!daily && (
              <button onClick={onExit} className="inline-flex items-center justify-center gap-1 text-sm text-white/60 hover:text-white">
                <Flag className="h-4 w-4" /> Volver al menú
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
