"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, Timer, Trophy, Volume2, VolumeX } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase";
import { formatClock } from "@/lib/format";
import { FIELD_LABEL, POINTS, orderVisible } from "@/lib/bakery";
import {
  CLOSE_GRACE_MS,
  STATE_KEY,
  closeDuel,
  duelLevel,
  duelLevelSummary,
  duelOrders,
  gameKey,
  joinDuel,
  newShift,
  normalizeMeta,
  playAgain,
  saveBoard,
  shiftStep,
  startDuel,
  subscribeDuel,
  type DuelBoard,
  type DuelBoards,
  type DuelMeta,
  type DuelState,
  type Shift,
  type ShiftAction,
} from "@/lib/bakeryDuel";
import { BakeryAudio } from "@/lib/bakeryAudio";
import { watchRoomMeta } from "@/lib/roomSettings";
import type { PresenceMap } from "@/lib/presence";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useServerNow } from "@/hooks/useServerNow";
import { useQuality } from "@/hooks/useQuality";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { BackToRoomButton, RoomSettingsEditor, type RawMeta } from "@/components/RoomSettings";
import CakeStage, { type CakeFx } from "@/components/bakery/CakeStage";
import CakeArt from "@/components/bakery/CakeArt";
import { CakeBuilder, OrderCard, useBuilderStep, usePrefersReducedMotion } from "@/components/bakery/Builder";
import { SETTINGS } from "@/components/bakery/settings";
import { Confetti } from "@/components/Results";

type Status = "loading" | "not-found" | "ready" | "error";
type Config = { hostId: string; level: number; minutes: number };

const PREFS_KEY = "pasteleria.audio";
/** How long the feedback for a delivered cake stays up (seconds into the next order). */
const TOAST_SECONDS = 1.4;

export default function DuelClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [state, setState] = useState<DuelState | null>(null);
  const [boards, setBoards] = useState<DuelBoards>({});

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    const unsubMeta = watchRoomMeta<DuelMeta>(
      roomId,
      (meta) => {
        if (cancelled) return;
        setRoomMeta(meta);
        if (!meta) return setStatus("not-found");
        if (meta.game !== "pasteleria") return router.replace(`/sala/${roomId}`);
        setConfig({ ...normalizeMeta(meta), hostId: meta.hostId ?? "" });
        unsub ??= subscribeDuel(roomId, (data) => {
          setState(data.state);
          setBoards(data.boards);
        });
        setStatus("ready");
      },
      (err) => {
        console.error(err);
        if (!cancelled) setStatus("error");
      }
    );

    return () => {
      cancelled = true;
      unsubMeta();
      unsub?.();
    };
  }, [configured, roomId, identity.clientId, identity.name, router]);

  const hasState = state !== null;
  useEffect(() => {
    if (!hasState || !identity.clientId || !identity.name) return;
    joinDuel(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;
  // While cooking the page is exactly the screen (like the solo game); the waiting room scrolls.
  const inShift = status === "ready" && !!state && state.status !== "waiting";

  return (
    <div className={`flex flex-col ${inShift ? "h-dvh overflow-hidden" : "min-h-dvh"}`}>
      <RoomHeader game="pasteleria" roomId={roomId} right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />} />

      <main className="relative flex min-h-0 flex-1 flex-col">
        {identity.clientId && !identity.name && <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="pasteleria" />}

        {status === "loading" && <RoomLoading text="Prendiendo el horno…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="pasteleria"
              roomId={roomId}
              hostId={config.hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`Duelo · ${duelLevel(config.level).name} · ${config.minutes} min · ${duelLevelSummary(config.level).toLowerCase()}`}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              onStart={() => startDuel(roomId, config.minutes)}
            >
              <WinsTally state={state} myId={myId} />
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && config && state.status !== "waiting" && (
          <DuelPlay
            key={gameKey(state)}
            roomId={roomId}
            state={state}
            config={config}
            boards={boards[gameKey(state)] ?? {}}
            presence={presence}
            myId={myId}
          />
        )}
      </main>
    </div>
  );
}

/** One shift, mounted per game key: a new shift starts with a clean counter. */
function DuelPlay({
  roomId,
  state,
  config,
  boards,
  presence,
  myId,
}: {
  roomId: string;
  state: DuelState;
  config: Config;
  boards: Record<string, DuelBoard>;
  presence: PresenceMap;
  myId: string;
}) {
  const lv = duelLevel(config.level);
  const tickets = useMemo(() => duelOrders(config.level, state.seed), [config.level, state.seed]);
  const gk = gameKey(state);
  const [quality] = useQuality("pasteleria.calidad");
  const reducedMotion = usePrefersReducedMotion();

  // My shift. Coming back mid-shift (a reload) picks up the score from my board.
  const [shift, setShift] = useState<Shift>(() => {
    const mine = boards[myId];
    const fresh = newShift(lv);
    return mine ? { ...fresh, orderNo: mine.orderNo, score: mine.score, right: mine.right, wrong: mine.wrong, bestStreak: mine.bestStreak } : fresh;
  });
  const act = (a: ShiftAction) => setShift((s) => shiftStep(s, lv, tickets, a));

  const playing = state.status === "playing";
  const now = useServerNow(playing);
  const countingDown = playing && (now === 0 || now < state.startedAt);
  const over = !playing || (now > 0 && now >= state.endsAt);
  const canBuild = playing && !countingDown && !over;
  const msLeft = Math.max(0, state.endsAt - Math.max(now, state.startedAt));

  // Sounds: created here, unlocked by the first tap (browsers need a gesture).
  const audio = useRef<BakeryAudio | null>(null);
  const [sfx, setSfx] = useState(true);
  useEffect(() => {
    const a = new BakeryAudio();
    audio.current = a;
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as { sfx?: boolean; volume?: number };
      a.setSfx(p.sfx ?? true);
      a.setVolume(p.volume ?? 0.7);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the device after mounting.
      setSfx(p.sfx ?? true);
    } catch {
      // Defaults.
    }
    return () => {
      a.dispose();
      audio.current = null;
    };
  }, []);
  const toggleSfx = () => {
    const next = !sfx;
    setSfx(next);
    audio.current?.setSfx(next);
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
      localStorage.setItem(PREFS_KEY, JSON.stringify({ ...p, sfx: next }));
    } catch {
      // Not remembered.
    }
  };

  // The order's memory clock.
  useEffect(() => {
    if (!canBuild) return;
    const id = setInterval(() => act({ type: "tick", seconds: 0.25 }), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- act only closes over fixed values.
  }, [canBuild]);

  // The last seconds tick.
  const secondsLeft = Math.ceil(msLeft / 1000);
  useEffect(() => {
    if (canBuild && secondsLeft > 0 && secondsLeft <= 5) audio.current?.tick();
  }, [canBuild, secondsLeft]);

  // Publish my counter for the rivals (only when something they see changes, not on every tick).
  const { score, right, wrong, bestStreak, orderNo, cake } = shift;
  useEffect(() => {
    if (playing) saveBoard(roomId, gk, myId, { score, right, wrong, bestStreak, orderNo, cake }).catch(console.error);
  }, [playing, roomId, gk, myId, score, right, wrong, bestStreak, orderNo, cake]);

  // Feedback for each delivered cake.
  const last = shift.last;
  const fx = useMemo<CakeFx>(() => ({ kind: last ? (last.right ? "celebrate" : "wrong") : "" }), [last]);
  useEffect(() => {
    if (!last) return;
    if (last.right) audio.current?.right();
    else audio.current?.wrong();
  }, [last]);
  const toast = last && shift.elapsed < TOAST_SECONDS ? last : null;

  // Time's up: once the last deliveries had time to arrive, anyone closes the shift.
  const closing = playing && now > 0 && now >= state.endsAt + CLOSE_GRACE_MS;
  const closedFor = useRef(-1);
  useEffect(() => {
    if (!closing || closedFor.current === state.gameNo) return;
    closedFor.current = state.gameNo;
    closeDuel(roomId, state.gameNo, boards).catch(console.error);
  }, [closing, boards, roomId, state.gameNo]);

  const ticket = tickets[shift.orderNo];
  const visible = orderVisible(lv, shift.elapsed, shift.showUntil);
  const hideIn = lv.memorize && visible && shift.peeks === 0 ? shift.showUntil - shift.elapsed : null;
  const [step, setStep] = useBuilderStep(lv, `${gk}-${shift.orderNo}`);

  const orderCard = (compact: boolean) =>
    ticket && (
      <OrderCard
        ticket={ticket}
        mood={toast ? (toast.right ? "happy" : "sad") : "normal"}
        compact={compact}
        picture={lv.picture}
        hidden={canBuild && !visible}
        hideIn={canBuild ? hideIn : null}
        peekCost={POINTS.peek}
        onPeek={() => {
          audio.current?.click();
          act({ type: "peek" });
        }}
      />
    );

  // Everyone in this shift: whoever has a board, plus who's here.
  const ids = [...new Set([...Object.keys(boards), ...Object.keys(state.players).filter((id) => id in presence)])];
  const scoreOf = (id: string) => (state.status === "finished" ? (state.final[id] ?? boards[id]?.score ?? 0) : id === myId ? shift.score : (boards[id]?.score ?? 0));
  const ranked = ids.sort((a, b) => scoreOf(b) - scoreOf(a));
  const nameOf = (id: string) => (id === myId ? "Vos" : (state.players[id]?.name ?? "?"));
  const rivals = { ids: ranked, myId, myCake: shift.cake, boards, scoreOf, nameOf, colorOf: (id: string) => state.players[id]?.color };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-pink-100 via-violet-100 to-amber-50 text-slate-800"
      onPointerDownCapture={() => audio.current?.unlock()}
    >
      {/* Clock, score and rivals (in the same row on a phone on its side) */}
      <div className="flex shrink-0 items-center gap-2 border-b border-pink-200/70 bg-white/70 px-3 py-2 backdrop-blur landscape:py-1">
        <span
          className={`flex items-center gap-1 rounded-full px-3 py-1 font-mono text-lg font-bold tabular-nums ${
            canBuild && msLeft <= 15_000 ? "bg-rose-500 text-white motion-safe:animate-pulse" : "bg-white text-slate-700"
          }`}
          aria-label={`Quedan ${secondsLeft} segundos`}
        >
          <Timer className="h-4 w-4" /> {formatClock(msLeft)}
        </span>
        {shift.streak > 1 && (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700" aria-label={`Racha de ${shift.streak}`}>
            <Flame className="h-3.5 w-3.5" /> {shift.streak}
          </span>
        )}
        <span className="hidden text-xs font-semibold text-violet-700 sm:inline landscape:hidden">{lv.name}</span>
        <Rivals className="hidden min-w-0 flex-1 landscape:flex" {...rivals} />
        <span className="ml-auto whitespace-nowrap rounded-full bg-white px-3 py-1 text-sm font-bold tabular-nums text-pink-600">{shift.score} pts</span>
        <button
          onClick={toggleSfx}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-violet-700 hover:bg-violet-100"
          aria-label={sfx ? "Silenciar efectos" : "Activar efectos"}
        >
          {sfx ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
      </div>
      <Rivals className="flex px-2 pt-2 landscape:hidden" {...rivals} />

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:flex-row lg:gap-3 lg:p-3 landscape:flex-row landscape:p-1.5">
        <div className="flex min-h-0 flex-1 flex-col gap-2 landscape:gap-1.5">
          {orderCard(true)}
          <div className="relative min-h-[22dvh] flex-1 overflow-hidden rounded-3xl shadow-[0_10px_30px_rgba(236,72,153,0.18)] ring-4 ring-white/80 landscape:min-h-0">
            {quality && <CakeStage cake={shift.cake} quality={quality} paused={!canBuild} fx={fx} reducedMotion={reducedMotion} />}
            {toast && (
              <div
                key={toast.n}
                className={`pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-2xl px-4 py-2 text-center shadow-lg motion-safe:animate-celebration-in ${
                  toast.right ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                }`}
                role="status"
              >
                <p className="font-display text-lg font-black">{toast.right ? `¡Perfecta! +${toast.points}` : `No era así ${toast.points ? toast.points : ""}`}</p>
                {!toast.right && <p className="text-xs">Mal: {toast.wrong.map((f) => FIELD_LABEL[f].toLowerCase()).join(", ")}</p>}
              </div>
            )}
            {countingDown && (
              <div className="absolute inset-0 flex items-center justify-center bg-violet-950/30">
                <span
                  key={Math.ceil((state.startedAt - now) / 1000)}
                  className="font-display text-8xl font-black text-white drop-shadow-[0_0_25px_rgba(236,72,153,0.8)] motion-safe:animate-celebration-in"
                >
                  {now ? Math.max(1, Math.ceil((state.startedAt - now) / 1000)) : ""}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 lg:w-[400px] landscape:w-[min(400px,50%)] landscape:gap-1.5 landscape:overflow-y-auto">
          <div className="hidden lg:block">{orderCard(false)}</div>
          <CakeBuilder
            level={lv}
            cake={shift.cake}
            enabled={canBuild}
            step={step}
            onStep={setStep}
            audio={audio}
            reducedMotion={reducedMotion}
            newSince={null}
            onBuild={act}
            onReset={() => act({ type: "reset" })}
            onDeliver={() => act({ type: "deliver" })}
          />
        </div>
      </div>

      {over && (
        <div className="absolute inset-0 z-30 flex overflow-y-auto bg-violet-950/40 p-3 backdrop-blur-sm landscape:p-2">
          <div className="mx-auto mt-auto flex w-full max-w-md flex-col items-center gap-3 rounded-3xl bg-white p-5 text-center shadow-2xl ring-4 ring-pink-100 motion-safe:animate-celebration-in sm:mb-auto landscape:mb-auto landscape:gap-2 landscape:p-4">
            {state.status === "finished" ? (
              <>
                <p className="font-display text-2xl font-black text-pink-500">
                  {state.winner === myId && <Confetti />}
                  {state.winner === myId ? "¡Ganaste el duelo! 🏆" : state.winner ? `¡Ganó ${nameOf(state.winner)}! 🏆` : "¡Empate! 🤝"}
                </p>
                <ol className="flex w-full flex-col gap-1 text-left text-sm">
                  {ranked.map((id, i) => (
                    <li key={id} className={`flex items-center gap-2 rounded-xl px-3 py-1.5 ${id === myId ? "bg-pink-100" : "bg-pink-50"}`}>
                      <span className="w-6 text-center">{["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`}</span>
                      <span className="flex-1 truncate font-semibold" style={{ color: state.players[id]?.color }}>
                        {nameOf(id)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {boards[id]?.right ?? 0} bien · {boards[id]?.wrong ?? 0} mal
                      </span>
                      <span className="w-16 text-right font-bold tabular-nums text-violet-700">{scoreOf(id)}</span>
                    </li>
                  ))}
                </ol>
                <WinsTally state={state} myId={myId} light />
                <button
                  onClick={() => playAgain(roomId, state.gameNo, config.minutes)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-violet-500 py-3 text-base font-bold text-white shadow-lg transition hover:brightness-110"
                  autoFocus
                >
                  <Trophy className="h-5 w-5" /> Otro turno
                </button>
                <BackToRoomButton roomId={roomId} stateKey={STATE_KEY} gameNo={state.gameNo} hostId={config.hostId} presence={presence} myId={myId} />
              </>
            ) : (
              <>
                <p className="font-display text-2xl font-black text-pink-500">¡Se terminó el turno! 🔔</p>
                <p className="text-sm text-slate-600">
                  Hiciste {shift.right} {shift.right === 1 ? "torta bien" : "tortas bien"} y sumaste {shift.score} puntos. Contando los de todos…
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Everyone's score and the cake on their counter, best first. */
function Rivals({
  className,
  ids,
  myId,
  myCake,
  boards,
  scoreOf,
  nameOf,
  colorOf,
}: {
  /** Layout and when it shows (it's in the top row on a phone on its side, its own row otherwise). */
  className: string;
  ids: string[];
  myId: string;
  myCake: DuelBoard["cake"];
  boards: Record<string, DuelBoard>;
  scoreOf: (id: string) => number;
  nameOf: (id: string) => string;
  colorOf: (id: string) => string | undefined;
}) {
  if (ids.length < 2) {
    return (
      <p className={`${className} shrink-0 items-center justify-center text-center text-xs text-violet-700 landscape:truncate`}>
        Estás solo en la cocina: invitá a alguien con «Invitar» para competir.
      </p>
    );
  }
  return (
    <ol className={`${className} shrink-0 gap-1.5 overflow-x-auto`} aria-label="Posiciones">
      {ids.map((id, i) => (
        <li
          key={id}
          className={`flex shrink-0 items-center gap-1.5 rounded-2xl py-1 pl-1 pr-2.5 text-xs shadow-sm ring-1 ${id === myId ? "bg-pink-100 ring-pink-300" : "bg-white/85 ring-pink-100"}`}
        >
          <span className="w-4 text-center font-bold text-slate-500">{i + 1}</span>
          <CakeArt cake={id === myId ? myCake : (boards[id]?.cake ?? myCake)} className="h-8 w-9" label={`La torta de ${nameOf(id)}`} />
          <span className="flex flex-col leading-tight">
            <span className="max-w-[6rem] truncate font-semibold" style={{ color: colorOf(id) }}>
              {nameOf(id)}
            </span>
            <span className="font-bold tabular-nums text-violet-700">{scoreOf(id)} pts</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function WinsTally({ state, myId, light = false }: { state: DuelState; myId: string; light?: boolean }) {
  const rows = Object.entries(state.wins).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return null;
  return (
    <p className={`text-center text-sm ${light ? "text-slate-500" : "text-slate-400"}`}>
      Duelos ganados: {rows.map(([id, n]) => `${id === myId ? "vos" : (state.players[id]?.name ?? "?")} ${n}`).join(" · ")}
    </p>
  );
}
