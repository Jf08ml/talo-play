"use client";

import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Music,
  Pause,
  Play,
  RotateCcw,
  Star,
  Timer,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  DECORATIONS,
  FIELD_LABEL,
  FILLINGS,
  FROSTINGS,
  LEVELS,
  SHAPES,
  SPONGES,
  initialGame,
  levelOptions,
  missingStep,
  reduce,
  toPass,
  type Cake,
  type Decoration,
  type Field,
  type Flavor,
  type Frosting,
  type Order,
  type OrderTicket,
  type Shape,
} from "@/lib/bakery";
import { BakeryAudio } from "@/lib/bakeryAudio";
import { makeSeed } from "@/lib/random";
import { trackEvent } from "@/lib/analytics";
import { useQuality } from "@/hooks/useQuality";
import QualityButton from "@/components/QualityButton";
import { RulesButton } from "@/components/HowToPlay";
import { TaloMark } from "@/components/TaloLogo";
import CakeArt, { DecorationIcon } from "./CakeArt";
import CakeStage, { type CakeFx } from "./CakeStage";
import CustomerFace from "./CustomerFace";

const RECORD_KEY = "pasteleria.record";
const PREFS_KEY = "pasteleria.audio";
const STEPS: Field[] = ["shape", "sponge", "layers", "filling", "frosting", "decorations"];
/** Shown behind the start screen. */
const DEMO_CAKE: Cake = { shape: "redonda", sponge: "chocolate", layers: 2, filling: "fresa", frosting: "rosa", decorations: ["cerezas"] };

interface AudioPrefs {
  sfx: boolean;
  music: boolean;
  volume: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered.
  }
}

/** The value of a field in a cake or order, in words. */
function valueText(field: Field, c: Cake | Order): string {
  switch (field) {
    case "shape":
      return c.shape ? SHAPES[c.shape].label : "sin elegir";
    case "sponge":
      return c.sponge ? SPONGES[c.sponge].label : "sin elegir";
    case "layers":
      return `${c.layers} ${c.layers === 1 ? "piso" : "pisos"}`;
    case "filling":
      return c.filling ? FILLINGS[c.filling].label : "sin relleno";
    case "frosting":
      return c.frosting ? FROSTINGS[c.frosting].label : "sin cobertura";
    case "decorations":
      return c.decorations.length ? c.decorations.map((d) => DECORATIONS[d].label).join(" y ") : "sin decoración";
  }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return reduced;
}

export default function BakeryGame() {
  const [game, dispatch] = useReducer(reduce, 0, (seed) => initialGame(seed));
  const [quality, toggleQuality] = useQuality("pasteleria.calidad");
  const reducedMotion = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);
  const [step, setStep] = useState<Field>("shape");
  const [prefs, setPrefs] = useState<AudioPrefs>({ sfx: true, music: true, volume: 0.7 });
  const [record, setRecord] = useState(0);
  const audio = useRef<BakeryAudio | null>(null);

  const level = LEVELS[game.level];
  const ticket = game.tickets[game.orderNo];
  const playing = game.phase === "playing";
  const opts = useMemo(() => levelOptions(level), [level]);

  // Audio and saved preferences live for the whole page.
  useEffect(() => {
    const a = new BakeryAudio();
    audio.current = a;
    const p = readJson<AudioPrefs>(PREFS_KEY, { sfx: true, music: true, volume: 0.7 });
    a.setSfx(p.sfx);
    a.setMusicEnabled(p.music);
    a.setVolume(p.volume);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the device after mounting.
    setPrefs(p);
    setRecord(readJson<{ score: number }>(RECORD_KEY, { score: 0 }).score);
    return () => {
      a.dispose();
      audio.current = null;
    };
  }, []);

  const updatePrefs = (patch: Partial<AudioPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    writeJson(PREFS_KEY, next);
    audio.current?.setSfx(next.sfx);
    audio.current?.setMusicEnabled(next.music);
    audio.current?.setVolume(next.volume);
  };

  // Music only while playing (not on menus or paused).
  const musicWanted = game.phase !== "menu" && !paused;
  useEffect(() => {
    if (musicWanted) audio.current?.startMusic();
    else audio.current?.stopMusic();
  }, [musicWanted]);

  // The clock (levels with one), stopped while paused or showing a result.
  const timed = level.seconds > 0 && playing && !paused;
  useEffect(() => {
    if (!timed) return;
    const id = setInterval(() => dispatch({ type: "tick", seconds: 0.25 }), 250);
    return () => clearInterval(id);
  }, [timed]);
  const secondsLeft = Math.ceil(game.timeLeft);
  useEffect(() => {
    if (timed && secondsLeft > 0 && secondsLeft <= 5) audio.current?.tick();
  }, [timed, secondsLeft]);

  // Feedback for each delivered cake: a new result object plays it once.
  const result = game.result;
  const fx = useMemo<CakeFx>(() => ({ kind: result ? (result.right ? "celebrate" : "wrong") : "" }), [result]);
  useEffect(() => {
    if (!result) return;
    if (result.right) audio.current?.right();
    else audio.current?.wrong();
  }, [result]);

  // Level done / game over: fanfare and record.
  useEffect(() => {
    if (game.phase !== "levelDone" && game.phase !== "gameOver") return;
    const passed = (game.history[game.history.length - 1]?.stars ?? 0) > 0;
    if (game.phase === "levelDone" && passed) audio.current?.levelUp();
    const best = readJson<{ score: number }>(RECORD_KEY, { score: 0 }).score;
    if (game.score > best) {
      writeJson(RECORD_KEY, { score: game.score });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the record follows the saved value.
      setRecord(game.score);
    }
  }, [game.phase, game.history, game.score]);

  // Each new order starts at the first step still to choose.
  const orderKey = `${game.level}-${game.orderNo}-${game.phase === "menu"}`;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new order resets the step tabs.
    setStep(level.shapes.length === 1 ? "sponge" : "shape");
  }, [orderKey, level.shapes.length]);

  // Keep the chosen step's tab in view (it scrolls sideways on phones).
  useEffect(() => {
    document.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [step]);

  const stepAvailable = (f: Field) => {
    if (f === "layers") return opts.layers.length > 1;
    if (f === "filling") return opts.fillings.length > 0;
    return true;
  };
  const steps = STEPS.filter(stepAvailable);
  const stepEnabled = (f: Field) => f !== "filling" || game.cake.layers > 1;

  /** After choosing, move on to the next step that still needs something. */
  const advance = (from: Field, cake: Cake) => {
    const i = steps.indexOf(from);
    const next = steps.slice(i + 1).find((f) => f !== "filling" || cake.layers > 1);
    if (next) setStep(next);
  };

  const choose = (field: Field, value: string | number) => {
    if (!playing || paused) return;
    audio.current?.pick(steps.indexOf(field));
    let next: Cake = game.cake;
    if (field === "layers") {
      dispatch({ type: "layers", value: value as number });
      next = { ...game.cake, layers: value as number, filling: (value as number) > 1 ? game.cake.filling : null };
    } else if (field === "decorations") {
      dispatch({ type: "decoration", value: value as Decoration });
      return;
    } else {
      dispatch({ type: "set", field, value: value as string });
      next = { ...game.cake, [field]: value };
    }
    if (!reducedMotion) advance(field, next);
  };

  const deliver = () => {
    if (!playing || paused || missingStep(game.cake)) return;
    dispatch({ type: "deliver" });
  };

  const start = () => {
    audio.current?.unlock();
    trackEvent("start_game", { game: "pasteleria", players: 1 });
    dispatch({ type: "start", seed: makeSeed() });
  };

  // Keyboard: 1–6 picks in the current step, ←/→ change step, Enter delivers, Esc pauses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape" || e.key.toLowerCase() === "p") {
        if (game.phase === "playing" || paused) setPaused((p) => !p);
        return;
      }
      if (!playing || paused) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const i = steps.indexOf(step);
        const j = (i + (e.key === "ArrowRight" ? 1 : -1) + steps.length) % steps.length;
        setStep(steps[j]);
        e.preventDefault();
      } else if (e.key === "Enter") {
        // Without this, the same Enter would also press the result card's focused button.
        e.preventDefault();
        deliver();
      } else if (/^[1-6]$/.test(e.key)) {
        const options = optionValues(step);
        const v = options[Number(e.key) - 1];
        if (v !== undefined && stepEnabled(step)) choose(step, v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function optionValues(field: Field): (string | number)[] {
    switch (field) {
      case "shape":
        return opts.shapes;
      case "sponge":
        return opts.sponges;
      case "layers":
        return opts.layers;
      case "filling":
        return opts.fillings;
      case "frosting":
        return opts.frostings;
      case "decorations":
        return opts.decorations;
    }
  }

  const missing = missingStep(game.cake);
  const togglePause = () => {
    audio.current?.click();
    setPaused((p) => !p);
  };

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-gradient-to-b from-pink-100 via-violet-100 to-amber-50 text-slate-800">
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-1.5 border-b border-pink-200/70 bg-white/70 px-3 py-2 backdrop-blur">
        <Link
          href="/"
          className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm font-medium text-violet-700 hover:bg-violet-100"
          aria-label="Volver al catálogo de juegos"
        >
          <ChevronLeft className="h-4 w-4" />
          <TaloMark className="h-6 w-6" />
        </Link>
        <h1 className={`font-display text-lg font-bold text-pink-600 ${game.phase === "menu" ? "" : "hidden sm:block"}`}>Pastelería</h1>
        {game.phase !== "menu" && (
          <span className="hidden rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700 sm:inline">
            Nivel {game.level + 1} · {level.name}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {game.phase !== "menu" && (
            <>
              {level.seconds > 0 && playing && (
                <span
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${
                    secondsLeft <= 10 ? "bg-rose-500 text-white" : "bg-white text-slate-700"
                  }`}
                  aria-label={`Quedan ${secondsLeft} segundos`}
                >
                  <Timer className="h-4 w-4" /> {secondsLeft}
                </span>
              )}
              {game.streak > 1 && (
                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700" aria-label={`Racha de ${game.streak}`}>
                  <Flame className="h-3.5 w-3.5" /> {game.streak}
                </span>
              )}
              <span className="whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-sm font-bold tabular-nums text-pink-600" aria-label={`Puntos: ${game.score}`}>
                {game.score} pts
              </span>
            </>
          )}
          <RulesButton
            game="pasteleria"
            where="partida"
            label=""
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 bg-white text-violet-700 hover:bg-violet-100"
          />
          <button
            onClick={() => updatePrefs({ sfx: !prefs.sfx })}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 bg-white text-violet-700 hover:bg-violet-100"
            aria-label={prefs.sfx ? "Silenciar efectos" : "Activar efectos"}
            title={prefs.sfx ? "Silenciar efectos" : "Activar efectos"}
          >
            {prefs.sfx ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          {quality && <QualityButton quality={quality} onToggle={toggleQuality} className="hidden !bg-white !text-violet-700 sm:flex" />}
          {game.phase !== "menu" && (
            <button
              onClick={togglePause}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 bg-pink-500 text-white hover:bg-pink-600"
              aria-label="Pausa"
              title="Pausa (Esc)"
            >
              <Pause className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* Progress through the level's orders */}
      {game.phase !== "menu" && (
        <div className="flex shrink-0 items-center gap-2 px-3 pt-2" aria-label={`Pedido ${Math.min(game.orderNo + 1, level.orders)} de ${level.orders}`}>
          <span className="text-xs font-semibold text-violet-700 sm:hidden">Nivel {game.level + 1}</span>
          <div className="flex flex-1 gap-1">
            {Array.from({ length: level.orders }, (_, i) => (
              <span
                key={i}
                className={`h-2 flex-1 rounded-full ${
                  i < game.orderNo || (i === game.orderNo && game.phase === "levelDone")
                    ? "bg-pink-400"
                    : i === game.orderNo
                      ? "bg-violet-400 motion-safe:animate-pulse"
                      : "bg-white"
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-slate-500">
            Pedido {Math.min(game.orderNo + 1, level.orders)}/{level.orders}
          </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:flex-row lg:gap-3 lg:p-3">
        {/* The cake */}
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {ticket && game.phase !== "menu" && <OrderCard ticket={ticket} mood={result ? (result.right ? "happy" : "sad") : "normal"} compact />}
          <div className="relative min-h-[34dvh] flex-1 overflow-hidden rounded-3xl shadow-[0_10px_30px_rgba(236,72,153,0.18)] ring-4 ring-white/80">
            {quality && <CakeStage cake={game.phase === "menu" ? DEMO_CAKE : game.cake} quality={quality} paused={paused} fx={fx} reducedMotion={reducedMotion} />}
            {playing && missing && (
              <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white/85 px-3 py-1 text-xs font-medium text-violet-700 shadow">
                Falta: {FIELD_LABEL[missing].toLowerCase()}
              </p>
            )}
          </div>
        </div>

        {/* Controls */}
        {game.phase !== "menu" && (
          <div className="flex shrink-0 flex-col gap-2 lg:w-[400px]">
            {ticket && (
              <div className="hidden lg:block">
                <OrderCard ticket={ticket} mood={result ? (result.right ? "happy" : "sad") : "normal"} />
              </div>
            )}
            <div className="rounded-3xl bg-white/85 p-2.5 shadow-sm ring-1 ring-pink-100">
              <div role="tablist" aria-label="Pasos de la torta" className="flex gap-1 overflow-x-auto pb-1">
                {steps.map((f, i) => {
                  const done = isDone(f, game.cake);
                  const enabled = stepEnabled(f);
                  return (
                    <button
                      key={f}
                      role="tab"
                      aria-selected={step === f}
                      disabled={!playing}
                      onClick={() => {
                        audio.current?.click();
                        setStep(f);
                      }}
                      className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        step === f ? "bg-pink-500 text-white shadow" : enabled ? "bg-pink-50 text-pink-700 hover:bg-pink-100" : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${step === f ? "bg-white/30" : "bg-white"}`}>
                        {done ? <Check className="h-3 w-3" /> : i + 1}
                      </span>
                      {FIELD_LABEL[f]}
                    </button>
                  );
                })}
              </div>
              <StepOptions
                field={step}
                values={optionValues(step)}
                cake={game.cake}
                enabled={playing && !paused && stepEnabled(step)}
                decorationCount={level.decorationCount}
                newSince={game.level > 0 ? levelOptions(LEVELS[game.level - 1]) : null}
                onPick={(v) => choose(step, v)}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  audio.current?.click();
                  dispatch({ type: "reset" });
                  setStep(level.shapes.length === 1 ? "sponge" : "shape");
                }}
                disabled={!playing}
                className="flex items-center justify-center gap-1.5 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-violet-700 shadow-sm ring-1 ring-violet-200 transition hover:bg-violet-50 disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" /> Empezar de nuevo
              </button>
              <button
                onClick={deliver}
                disabled={!playing || !!missing}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-violet-500 py-3 text-base font-bold text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
              >
                Entregar la torta <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Overlays */}
      {game.phase === "menu" && <StartScreen record={record} onPlay={start} />}
      {game.phase === "result" && result && ticket && (
        <Overlay soft>
          <ResultCard
            right={result.right}
            timeout={result.timeout}
            points={result.points}
            streak={game.streak}
            wrong={result.wrong}
            order={ticket.order}
            cake={game.cake}
            canRetry={result.canRetry}
            name={ticket.customer.name}
            onRetry={() => {
              dispatch({ type: "retry" });
              setStep(result.wrong[0] ?? "shape");
            }}
            onNext={() => dispatch({ type: "next" })}
          />
        </Overlay>
      )}
      {game.phase === "levelDone" && (
        <Overlay>
          <LevelCard game={game} onNext={() => dispatch({ type: "nextLevel" })} onRepeat={() => dispatch({ type: "repeatLevel" })} />
        </Overlay>
      )}
      {game.phase === "gameOver" && (
        <Overlay>
          <FinalCard game={game} record={record} onAgain={() => dispatch({ type: "menu", seed: makeSeed() })} />
        </Overlay>
      )}
      {paused && game.phase !== "menu" && (
        <Overlay>
          <PauseCard
            prefs={prefs}
            onPrefs={updatePrefs}
            onResume={togglePause}
            onQuit={() => {
              setPaused(false);
              dispatch({ type: "menu", seed: makeSeed() });
            }}
            quality={quality}
            onQuality={toggleQuality}
          />
        </Overlay>
      )}
    </div>
  );
}

function isDone(f: Field, c: Cake): boolean {
  switch (f) {
    case "shape":
      return !!c.shape;
    case "sponge":
      return !!c.sponge;
    case "layers":
      return true;
    case "filling":
      return c.layers < 2 || !!c.filling;
    case "frosting":
      return !!c.frosting;
    case "decorations":
      return c.decorations.length > 0;
  }
}

// ---- Pieces ------------------------------------------------------------------

function Swatch({ color }: { color: string }) {
  return <span className="h-7 w-7 shrink-0 rounded-full shadow-inner ring-2 ring-white" style={{ background: color }} aria-hidden="true" />;
}

function StepOptions({
  field,
  values,
  cake,
  enabled,
  decorationCount,
  newSince,
  onPick,
}: {
  field: Field;
  values: (string | number)[];
  cake: Cake;
  enabled: boolean;
  decorationCount: number;
  newSince: ReturnType<typeof levelOptions> | null;
  onPick: (v: string | number) => void;
}) {
  const isNew = (v: string | number) => {
    if (!newSince) return false;
    const before: Record<Field, (string | number)[]> = {
      shape: newSince.shapes,
      sponge: newSince.sponges,
      layers: newSince.layers,
      filling: newSince.fillings,
      frosting: newSince.frostings,
      decorations: newSince.decorations,
    };
    return !before[field].includes(v);
  };
  const selected = (v: string | number) =>
    field === "decorations" ? cake.decorations.includes(v as Decoration) : (cake as unknown as Record<string, unknown>)[field] === v;

  const hint: ReactNode =
    field === "filling" && cake.layers < 2
      ? "El relleno va entre los pisos: elegí 2 pisos o más."
      : field === "decorations"
        ? decorationCount > 1
          ? `Elegí ${decorationCount} decoraciones (tocá de nuevo para sacar una).`
          : "Elegí una decoración (tocá otra para cambiarla)."
        : null;

  const content = (v: string | number): { label: string; visual: ReactNode } => {
    switch (field) {
      case "shape":
        return {
          label: SHAPES[v as Shape].label,
          visual: <span className={`h-7 w-9 bg-pink-300 ring-2 ring-white ${v === "redonda" ? "rounded-full" : "rounded-md"}`} aria-hidden="true" />,
        };
      case "sponge":
        return { label: SPONGES[v as Flavor].label, visual: <Swatch color={SPONGES[v as Flavor].color} /> };
      case "layers":
        return {
          label: `${v} ${v === 1 ? "piso" : "pisos"}`,
          visual: (
            <span className="flex flex-col-reverse gap-0.5" aria-hidden="true">
              {Array.from({ length: v as number }, (_, i) => (
                <span key={i} className="h-2 w-8 rounded-sm bg-amber-300" />
              ))}
            </span>
          ),
        };
      case "filling":
        return { label: FILLINGS[v as Flavor].label, visual: <Swatch color={FILLINGS[v as Flavor].color} /> };
      case "frosting":
        return { label: FROSTINGS[v as Frosting].label, visual: <Swatch color={FROSTINGS[v as Frosting].color} /> };
      case "decorations":
        return { label: DECORATIONS[v as Decoration].label, visual: <DecorationIcon d={v as Decoration} className="h-8 w-8" /> };
    }
  };

  return (
    <div role="tabpanel" aria-label={FIELD_LABEL[field]}>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-3">
        {values.map((v, i) => {
          const { label, visual } = content(v);
          const on = selected(v);
          return (
            <button
              key={String(v)}
              onClick={() => onPick(v)}
              disabled={!enabled}
              aria-pressed={on}
              className={`relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-center text-xs font-semibold transition motion-safe:active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
                on ? "bg-pink-100 text-pink-700 ring-[3px] ring-pink-400" : "bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-pink-50"
              }`}
            >
              {visual}
              <span className="leading-tight">{label}</span>
              {on && (
                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-pink-500 text-white" aria-hidden="true">
                  <Check className="h-3 w-3" />
                </span>
              )}
              {isNew(v) && !on && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-amber-300 px-1.5 text-[9px] font-bold text-amber-900">¡Nuevo!</span>
              )}
              <span className="sr-only">Tecla {i + 1}</span>
            </button>
          );
        })}
      </div>
      {hint && <p className="mt-1.5 text-center text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function OrderCard({ ticket, mood, compact = false }: { ticket: OrderTicket; mood: "normal" | "happy" | "sad"; compact?: boolean }) {
  const { order, customer, occasion } = ticket;
  const rows: Field[] = ["shape", "sponge", "layers", ...(order.filling ? (["filling"] as Field[]) : []), "frosting", "decorations"];
  const swatch = (f: Field): string | null =>
    f === "sponge" ? SPONGES[order.sponge].color : f === "filling" && order.filling ? FILLINGS[order.filling].color : f === "frosting" ? FROSTINGS[order.frosting].color : null;

  return (
    <section
      className={`flex gap-2 rounded-3xl bg-white/90 p-2.5 shadow-sm ring-1 ring-pink-100 ${compact ? "lg:hidden" : ""}`}
      aria-label={`Pedido de ${customer.name}`}
    >
      <div className="flex shrink-0 flex-col items-center">
        <CustomerFace customer={customer} mood={mood} className={compact ? "h-12 w-12" : "h-16 w-16"} />
        <span className="text-[11px] font-bold text-slate-600">{customer.name}</span>
      </div>
      <div className="min-w-0 flex-1">
        {!compact && <p className="mb-1 text-xs italic text-slate-500">«Quiero una torta {occasion}».</p>}
        <ul className={compact ? "grid grid-cols-2 gap-1" : "flex flex-wrap gap-1"}>
          {rows.map((f) => (
            <li key={f} className={`flex min-w-0 items-center gap-1 bg-pink-50 px-2 py-0.5 text-slate-700 ${compact ? "rounded-lg text-[10px]" : "rounded-full text-[11px]"}`}>
              {swatch(f) && <span className="h-3 w-3 rounded-full ring-1 ring-white" style={{ background: swatch(f)! }} aria-hidden="true" />}
              <span className="leading-tight">
                <span className="font-semibold text-pink-700">{FIELD_LABEL[f]}:</span> {valueText(f, order)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <CakeArt cake={order} className={`shrink-0 ${compact ? "h-14 w-16 self-center" : "h-24 w-28"}`} label="Así tiene que quedar la torta" />
    </section>
  );
}

function Overlay({ children, soft = false }: { children: ReactNode; soft?: boolean }) {
  return (
    <div className={`absolute inset-0 z-30 flex items-end justify-center p-3 sm:items-center ${soft ? "bg-violet-900/10" : "bg-violet-950/40 backdrop-blur-sm"}`}>
      <div className="motion-safe:animate-celebration-in w-full max-w-md">{children}</div>
    </div>
  );
}

const CARD = "flex flex-col items-center gap-3 rounded-3xl bg-white p-5 text-center shadow-2xl ring-4 ring-pink-100";
const MAIN_BTN =
  "flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-violet-500 py-3 text-base font-bold text-white shadow-lg transition hover:brightness-110";
const SOFT_BTN = "flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-50 py-2.5 text-sm font-semibold text-violet-700 ring-1 ring-violet-200 transition hover:bg-violet-100";

function StartScreen({ record, onPlay }: { record: number; onPlay: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-gradient-to-b from-pink-100/70 via-violet-100/60 to-amber-50/80 p-4 backdrop-blur-[2px]">
      <div className={`${CARD} max-w-md motion-safe:animate-celebration-in`}>
        <p className="font-display text-4xl font-black text-pink-500 drop-shadow-sm">Pastelería</p>
        <p className="text-sm text-slate-600">
          Los clientes te piden tortas: armalas igual a su pedido eligiendo forma, bizcocho, pisos, relleno, cobertura y
          decoración, y entregalas.
        </p>
        <ul className="w-full space-y-1 rounded-2xl bg-pink-50 p-3 text-left text-xs text-slate-600">
          <li>🍰 3 niveles: Aprendiz, Pastelero y Maestro (con reloj).</li>
          <li>⭐ Acertar de una suma más; si le errás, podés arreglarla una vez.</li>
          <li>👆 Arrastrá la torta para girarla. En la compu: números para elegir, flechas para cambiar de paso, Enter para entregar.</li>
        </ul>
        {record > 0 && <p className="text-xs font-semibold text-violet-600">Tu récord: {record} puntos</p>}
        <button onClick={onPlay} className={MAIN_BTN} autoFocus>
          <Play className="h-5 w-5" /> Jugar
        </button>
        <div className="flex w-full gap-2">
          <RulesButton game="pasteleria" where="lobby" label="Cómo se juega" className={SOFT_BTN} />
          <Link href="/" className={SOFT_BTN}>
            Otros juegos
          </Link>
        </div>
      </div>
    </div>
  );
}

function ResultCard({
  right,
  timeout,
  points,
  streak,
  wrong,
  order,
  cake,
  canRetry,
  name,
  onRetry,
  onNext,
}: {
  right: boolean;
  timeout: boolean;
  points: number;
  streak: number;
  wrong: Field[];
  order: Order;
  cake: Cake;
  canRetry: boolean;
  name: string;
  onRetry: () => void;
  onNext: () => void;
}) {
  return (
    <div className={CARD} role="status" aria-live="polite">
      {right ? (
        <>
          <p className="font-display text-2xl font-black text-emerald-500">¡Perfecta! 🎉</p>
          <p className="text-sm text-slate-600">A {name} le encantó.</p>
          <p className="text-3xl font-black text-pink-500">+{points}</p>
          {streak > 1 && <p className="flex items-center gap-1 text-xs font-bold text-amber-600"><Flame className="h-4 w-4" /> ¡Racha de {streak}!</p>}
        </>
      ) : (
        <>
          <p className="font-display text-2xl font-black text-rose-500">{timeout ? "¡Se acabó el tiempo! ⏰" : "Mmm… no es lo que pidió"}</p>
          {wrong.length > 0 && (
            <ul className="w-full space-y-1 text-left text-sm">
              {wrong.map((f) => (
                <li key={f} className="rounded-xl bg-rose-50 px-3 py-1.5 text-slate-700">
                  <span className="font-bold text-rose-600">✗ {FIELD_LABEL[f]}:</span> pidió <b>{valueText(f, order)}</b>, tiene {valueText(f, cake)}.
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="flex w-full flex-col gap-2">
        {canRetry && (
          <button onClick={onRetry} className={MAIN_BTN} autoFocus>
            Arreglar la torta
          </button>
        )}
        <button onClick={onNext} className={canRetry ? SOFT_BTN : MAIN_BTN} autoFocus={!canRetry}>
          {canRetry ? "Pasar al siguiente pedido" : "Siguiente pedido"} <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-1" aria-label={`${n} de 3 estrellas`}>
      {[0, 1, 2].map((i) => (
        <Star
          key={i}
          className={`h-10 w-10 ${i < n ? "fill-amber-300 text-amber-400 motion-safe:animate-celebration-in" : "text-slate-200"}`}
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

function LevelCard({ game, onNext, onRepeat }: { game: ReturnType<typeof initialGame>; onNext: () => void; onRepeat: () => void }) {
  const h = game.history[game.history.length - 1];
  const level = LEVELS[game.level];
  const passed = h.stars > 0;
  const last = game.level + 1 >= LEVELS.length;
  return (
    <div className={CARD}>
      <p className="font-display text-2xl font-black text-pink-500">{passed ? `¡Nivel ${game.level + 1} superado!` : "Casi…"}</p>
      <Stars n={h.stars} />
      <div className="grid w-full grid-cols-3 gap-2 text-sm">
        <Stat label="De una" value={h.firstTry} />
        <Stat label="Bien" value={h.right} />
        <Stat label="Fallidas" value={h.failed} />
      </div>
      <p className="text-sm text-slate-600">
        +{h.points} puntos en el nivel · {game.score} en total
      </p>
      {!passed && <p className="text-xs text-slate-500">Para pasar hacen falta {toPass(level)} tortas bien de {level.orders}.</p>}
      {passed && (
        <button onClick={onNext} className={MAIN_BTN} autoFocus>
          {last ? "Ver resultado final" : `Nivel ${game.level + 2}: ${LEVELS[game.level + 1].name}`} <ChevronRight className="h-5 w-5" />
        </button>
      )}
      <button onClick={onRepeat} className={passed ? SOFT_BTN : MAIN_BTN} autoFocus={!passed}>
        <RotateCcw className="h-4 w-4" /> Repetir este nivel
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-pink-50 py-2">
      <p className="text-xl font-black text-pink-600">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function FinalCard({ game, record, onAgain }: { game: ReturnType<typeof initialGame>; record: number; onAgain: () => void }) {
  const right = game.history.reduce((n, h) => n + h.right, 0);
  const failed = game.history.reduce((n, h) => n + h.failed, 0);
  const stars = game.history.reduce((n, h) => n + h.stars, 0);
  return (
    <div className={CARD}>
      <p className="font-display text-3xl font-black text-pink-500">¡Sos Maestro Pastelero! 👩‍🍳</p>
      <p className="text-4xl font-black text-violet-600">{game.score} pts</p>
      {game.score >= record && game.score > 0 && <p className="text-sm font-bold text-amber-600">¡Nuevo récord!</p>}
      <div className="grid w-full grid-cols-3 gap-2 text-sm">
        <Stat label="Tortas bien" value={right} />
        <Stat label="Fallidas" value={failed} />
        <Stat label="Mejor racha" value={game.bestStreak} />
      </div>
      <p className="text-xs text-slate-500">{stars} estrellas en total</p>
      <button onClick={onAgain} className={MAIN_BTN} autoFocus>
        <Play className="h-5 w-5" /> Jugar de nuevo
      </button>
      <Link href="/" className={SOFT_BTN}>
        Volver al catálogo
      </Link>
    </div>
  );
}

function PauseCard({
  prefs,
  onPrefs,
  onResume,
  onQuit,
  quality,
  onQuality,
}: {
  prefs: AudioPrefs;
  onPrefs: (p: Partial<AudioPrefs>) => void;
  onResume: () => void;
  onQuit: () => void;
  quality: ReturnType<typeof useQuality>[0];
  onQuality: () => void;
}) {
  return (
    <div className={CARD} role="dialog" aria-label="Pausa">
      <p className="font-display text-2xl font-black text-violet-600">Pausa</p>
      <div className="flex w-full flex-col gap-2 text-left text-sm">
        <label className="flex items-center justify-between rounded-2xl bg-violet-50 px-3 py-2">
          <span className="flex items-center gap-2 font-semibold text-slate-700">
            <Music className="h-4 w-4 text-violet-500" /> Música
          </span>
          <input type="checkbox" checked={prefs.music} onChange={(e) => onPrefs({ music: e.target.checked })} className="h-5 w-5 accent-pink-500" />
        </label>
        <label className="flex items-center justify-between rounded-2xl bg-violet-50 px-3 py-2">
          <span className="flex items-center gap-2 font-semibold text-slate-700">
            <Volume2 className="h-4 w-4 text-violet-500" /> Efectos de sonido
          </span>
          <input type="checkbox" checked={prefs.sfx} onChange={(e) => onPrefs({ sfx: e.target.checked })} className="h-5 w-5 accent-pink-500" />
        </label>
        <label className="flex items-center gap-3 rounded-2xl bg-violet-50 px-3 py-2">
          <span className="font-semibold text-slate-700">Volumen</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={prefs.volume}
            onChange={(e) => onPrefs({ volume: Number(e.target.value) })}
            className="flex-1 accent-pink-500"
            aria-label="Volumen"
          />
        </label>
        {quality && (
          <button onClick={onQuality} className="flex items-center justify-between rounded-2xl bg-violet-50 px-3 py-2 font-semibold text-slate-700">
            Calidad gráfica <span className="text-violet-600">{quality === "alta" ? "Alta" : "Baja (más fluido)"}</span>
          </button>
        )}
      </div>
      <button onClick={onResume} className={MAIN_BTN} autoFocus>
        <Play className="h-5 w-5" /> Seguir
      </button>
      <button onClick={onQuit} className={SOFT_BTN}>
        Salir al menú (se pierde la partida)
      </button>
      <Link href="/" className="text-xs text-slate-500 underline">
        Volver al catálogo
      </Link>
    </div>
  );
}
