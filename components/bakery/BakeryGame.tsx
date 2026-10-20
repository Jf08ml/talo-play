"use client";

import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Flame, Music, Pause, Play, RotateCcw, Star, Timer, Users, Volume2, VolumeX, X } from "lucide-react";
import {
  FIELD_LABEL,
  LEVELS,
  POINTS,
  initialGame,
  levelOptions,
  missingStep,
  orderVisible,
  reduce,
  toPass,
  type Cake,
  type Field,
  type Order,
} from "@/lib/bakery";
import { BakeryAudio } from "@/lib/bakeryAudio";
import { makeSeed } from "@/lib/random";
import { trackEvent } from "@/lib/analytics";
import { isFirebaseConfigured } from "@/lib/firebase";
import { cleanupOldRooms } from "@/lib/roomCleanup";
import { useQuality } from "@/hooks/useQuality";
import QualityButton from "@/components/QualityButton";
import { RulesButton } from "@/components/HowToPlay";
import { TaloMark } from "@/components/TaloLogo";
import { CreateRoomForm } from "@/components/RoomSettings";
import CakeStage, { type CakeFx } from "./CakeStage";
import { CakeBuilder, OrderCard, useBuilderStep, usePrefersReducedMotion, valueText } from "./Builder";
import { SETTINGS } from "./settings";

const RECORD_KEY = "pasteleria.record";
const PREFS_KEY = "pasteleria.audio";
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

export default function BakeryGame() {
  const [game, dispatch] = useReducer(reduce, 0, (seed) => initialGame(seed));
  const [quality, toggleQuality] = useQuality("pasteleria.calidad");
  const reducedMotion = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);
  const [friends, setFriends] = useState(false);
  const [prefs, setPrefs] = useState<AudioPrefs>({ sfx: true, music: true, volume: 0.7 });
  const [record, setRecord] = useState(0);
  const audio = useRef<BakeryAudio | null>(null);

  const level = LEVELS[game.level];
  const ticket = game.tickets[game.orderNo];
  const playing = game.phase === "playing";
  // Each new order starts at the first step still to choose.
  const [step, setStep] = useBuilderStep(level, `${game.level}-${game.orderNo}-${game.phase === "menu"}-${game.history.length}`);
  const visible = orderVisible(level, game.elapsed, game.showUntil);
  const hideIn = level.memorize && visible && playing && game.peeks === 0 ? game.showUntil - game.elapsed : null;

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

  // The clock (and the order's memory time), stopped while paused or showing a result.
  const timed = playing && !paused;
  useEffect(() => {
    if (!timed) return;
    const id = setInterval(() => dispatch({ type: "tick", seconds: 0.25 }), 250);
    return () => clearInterval(id);
  }, [timed]);
  const secondsLeft = Math.ceil(game.timeLeft);
  useEffect(() => {
    if (timed && level.seconds > 0 && secondsLeft > 0 && secondsLeft <= 5) audio.current?.tick();
  }, [timed, level.seconds, secondsLeft]);

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

  const start = () => {
    audio.current?.unlock();
    trackEvent("start_game", { game: "pasteleria", players: 1 });
    dispatch({ type: "start", seed: makeSeed() });
  };

  const openFriends = () => {
    setFriends(true);
    // Housekeeping, like every lobby (see lib/roomCleanup.ts).
    cleanupOldRooms();
  };

  // Esc pauses (the builder handles the rest of the keyboard).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape" || e.key.toLowerCase() === "p") {
        if (game.phase === "playing" || paused) setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const missing = missingStep(game.cake);
  const orderCard = (compact: boolean) =>
    ticket && (
      <OrderCard
        ticket={ticket}
        mood={result ? (result.right ? "happy" : "sad") : "normal"}
        compact={compact}
        picture={level.picture}
        hidden={playing && !visible}
        hideIn={hideIn}
        peekCost={POINTS.peek}
        onPeek={() => {
          audio.current?.click();
          dispatch({ type: "peek" });
        }}
      />
    );
  const togglePause = () => {
    audio.current?.click();
    setPaused((p) => !p);
  };

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-gradient-to-b from-pink-100 via-violet-100 to-amber-50 text-slate-800">
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-1.5 border-b border-pink-200/70 bg-white/70 px-3 py-2 backdrop-blur landscape:py-1">
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
        <div className="flex shrink-0 items-center gap-2 px-3 pt-2 landscape:pt-1" aria-label={`Pedido ${Math.min(game.orderNo + 1, level.orders)} de ${level.orders}`}>
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

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:flex-row lg:gap-3 lg:p-3 landscape:flex-row landscape:p-1.5">
        {/* The cake */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 landscape:gap-1.5">
          {game.phase !== "menu" && orderCard(true)}
          <div className="relative min-h-[34dvh] flex-1 overflow-hidden rounded-3xl shadow-[0_10px_30px_rgba(236,72,153,0.18)] ring-4 ring-white/80 short:min-h-[22dvh] landscape:min-h-0">
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
          <div className="flex shrink-0 flex-col gap-2 lg:w-[400px] landscape:w-[min(400px,50%)] landscape:gap-1.5 landscape:overflow-y-auto">
            <div className="hidden lg:block">{orderCard(false)}</div>
            <CakeBuilder
              level={level}
              cake={game.cake}
              enabled={playing && !paused}
              step={step}
              onStep={setStep}
              audio={audio}
              reducedMotion={reducedMotion}
              newSince={game.level > 0 ? levelOptions(LEVELS[game.level - 1]) : null}
              onBuild={dispatch}
              onReset={() => dispatch({ type: "reset" })}
              onDeliver={() => dispatch({ type: "deliver" })}
            />
          </div>
        )}
      </div>

      {/* Overlays */}
      {game.phase === "menu" && <StartScreen record={record} onPlay={start} onFriends={isFirebaseConfigured() ? openFriends : null} />}
      {game.phase === "menu" && friends && <FriendsDialog onClose={() => setFriends(false)} />}
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

// ---- Pieces ------------------------------------------------------------------

function Overlay({ children, soft = false }: { children: ReactNode; soft?: boolean }) {
  return (
    // Scrolls when the card is taller than the screen (phones on their side); m-auto keeps it centered otherwise.
    <div className={`absolute inset-0 z-30 flex overflow-y-auto p-3 landscape:p-2 ${soft ? "bg-violet-900/10" : "bg-violet-950/40 backdrop-blur-sm"}`}>
      <div className="mx-auto mt-auto w-full max-w-md motion-safe:animate-celebration-in sm:mb-auto landscape:mb-auto">{children}</div>
    </div>
  );
}

const CARD = "flex flex-col items-center gap-3 rounded-3xl bg-white p-5 text-center shadow-2xl ring-4 ring-pink-100 landscape:gap-2 landscape:p-4";
const MAIN_BTN =
  "flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-violet-500 py-3 text-base font-bold text-white shadow-lg transition hover:brightness-110 landscape:py-2";
const DUEL_BTN =
  "flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-pink-500 py-3 text-base font-bold text-white shadow-lg transition hover:brightness-110 landscape:py-2";
const SOFT_BTN =
  "flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-50 py-2.5 text-sm font-semibold text-violet-700 ring-1 ring-violet-200 transition hover:bg-violet-100 landscape:py-2";

function StartScreen({ record, onPlay, onFriends }: { record: number; onPlay: () => void; onFriends: (() => void) | null }) {
  return (
    <div className="absolute inset-0 z-30 flex overflow-y-auto bg-gradient-to-b from-pink-100/70 via-violet-100/60 to-amber-50/80 p-4 backdrop-blur-[2px] landscape:p-2">
      {/* Side by side on a phone on its side: the explanation left, the buttons right. */}
      <div className={`${CARD} m-auto w-full max-w-md motion-safe:animate-celebration-in landscape:grid landscape:max-w-3xl landscape:grid-cols-2 landscape:items-center landscape:gap-4`}>
        <div className="flex flex-col items-center gap-3 landscape:gap-2">
          <p className="font-display text-4xl font-black text-pink-500 drop-shadow-sm landscape:text-3xl">Pastelería</p>
          <p className="text-sm text-slate-600 landscape:text-xs">
            Los clientes te piden tortas: armalas igual a su pedido eligiendo forma, bizcocho, pisos, relleno, cobertura y
            decoración, y entregalas antes de que se acabe el tiempo.
          </p>
          <ul className="w-full space-y-1 rounded-2xl bg-pink-50 p-3 text-left text-xs text-slate-600 landscape:p-2 landscape:text-[11px]">
            <li>⏱️ {LEVELS.length} niveles con reloj: {LEVELS.map((l) => l.name).join(", ")}.</li>
            <li>🧠 En los últimos, el pedido viene sin dibujo… y en Chef estrella se esconde: ¡memorizalo!</li>
            <li>⭐ Acertar de una suma más; si le errás, a veces podés arreglarla una vez.</li>
            <li>👆 Arrastrá la torta para girarla. En la compu: números para elegir, flechas para cambiar de paso, Enter para entregar.</li>
          </ul>
        </div>
        <div className="flex w-full flex-col items-center gap-3 landscape:gap-2">
          {record > 0 && <p className="text-xs font-semibold text-violet-600">Tu récord: {record} puntos</p>}
          <button onClick={onPlay} className={MAIN_BTN} autoFocus>
            <Play className="h-5 w-5" /> Jugar solo
          </button>
          {onFriends && (
            <button onClick={onFriends} className={DUEL_BTN}>
              <Users className="h-5 w-5" /> Duelo con amigos
            </button>
          )}
          <div className="flex w-full gap-2">
            <RulesButton game="pasteleria" where="lobby" label="Cómo se juega" className={SOFT_BTN} />
            <Link href="/" className={SOFT_BTN}>
              Otros juegos
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** "Duelo con amigos": the create-room form, over the start screen. */
function FriendsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex overflow-y-auto bg-violet-950/60 p-3 backdrop-blur-sm landscape:p-2" role="dialog" aria-label="Duelo con amigos">
      <div className="mx-auto w-full max-w-md motion-safe:animate-celebration-in sm:my-auto">
        <div className="mb-2 flex items-start gap-2 rounded-2xl bg-white p-3 text-sm text-slate-600 shadow-xl">
          <p className="flex-1">
            <b className="text-pink-600">Duelo de pasteleros:</b> todos reciben los mismos pedidos y tienen el mismo tiempo. Cada
            torta bien suma, cada error resta. Gana quien junta más puntos cuando suena la campana.
          </p>
          <button onClick={onClose} className="rounded-lg p-1 text-violet-700 hover:bg-violet-100" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="rounded-2xl bg-slate-950">
          <CreateRoomForm settings={SETTINGS} />
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
          className={`h-10 w-10 landscape:h-7 landscape:w-7 ${i < n ? "fill-amber-300 text-amber-400 motion-safe:animate-celebration-in" : "text-slate-200"}`}
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
      <p className="font-display text-3xl font-black text-pink-500">¡Sos Chef estrella! 👩‍🍳</p>
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
