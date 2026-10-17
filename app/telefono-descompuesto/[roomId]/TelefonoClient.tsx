"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  GRACE_MS,
  MAX_TEXT_LENGTH,
  MIN_PLAYERS,
  PHRASE_IDEAS,
  albumNext,
  chainOf,
  forceNextStep,
  getTelefonoMeta,
  isDrawStep,
  joinTelefono,
  playAgain,
  startTelefono,
  stepSeconds,
  submitEntry,
  subscribeChains,
  subscribeEntry,
  subscribeTelefono,
  totalSteps,
  type Entry,
  type TelefonoState,
} from "@/lib/telefono";
import type { Stroke } from "@/lib/dibujo";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useServerNow } from "@/hooks/useServerNow";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import DrawingCanvas, { BACKGROUND } from "@/components/dibujo/DrawingCanvas";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_INPUT } from "@/components/ui";

type Status = "loading" | "not-found" | "ready" | "error";

const COLORS = ["#0f172a", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#92400e", "#94a3b8"];
const WIDTHS = [4, 10, 22];
const ERASER_WIDTH = 40;

export default function TelefonoClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [config, setConfig] = useState<{ hostId: string; drawSeconds: number } | null>(null);
  const [state, setState] = useState<TelefonoState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  // Presence starts empty: only trust "X isn't here" once I see myself in it.
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    getTelefonoMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "telefono") return router.replace(`/sala/${roomId}`);
        setConfig({ hostId: meta.hostId ?? "", drawSeconds: meta.drawSeconds ?? 90 });
        unsub = subscribeTelefono(roomId, setState);
        setStatus("ready");
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [configured, roomId, identity.clientId, identity.name, router]);

  const hasState = state !== null;
  useEffect(() => {
    if (!hasState || !identity.clientId || !identity.name) return;
    joinTelefono(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const playing = state?.status === "playing";
  const now = useServerNow(playing);
  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  const deadline = state && config ? state.stepStartedAt + stepSeconds(state.step, config.drawSeconds) * 1000 : 0;
  const pastGrace = playing && now > 0 && now >= deadline + GRACE_MS;
  // Players who left don't block the step: move on once everyone still here is done.
  const allDone =
    playing &&
    presenceLoaded &&
    !!state &&
    Object.keys(state.done).length > 0 &&
    state.order.filter((id) => id in presence).every((id) => state.done[id]);
  const gameNo = state?.gameNo ?? 0;
  const step = state?.step ?? 0;
  useEffect(() => {
    if (pastGrace || allDone) forceNextStep(roomId, gameNo, step).catch(console.error);
  }, [pastGrace, allDone, roomId, gameNo, step]);

  if (!configured) return <FirebaseSetupNotice />;

  const inGame = !!state && state.order.includes(myId);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="telefono"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="telefono" />
        )}

        {status === "loading" && <RoomLoading text="Conectando el teléfono…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="telefono"
              roomId={roomId}
              hostId={config.hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`${config.drawSeconds} s para dibujar · ${45} s para escribir`}
              onStart={() => startTelefono(roomId, connected)}
            >
              {connected.length < MIN_PLAYERS && (
                <p className="text-center text-sm text-amber-300/90">Hacen falta al menos {MIN_PLAYERS} jugadores.</p>
              )}
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && config && state.status === "playing" && (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4">
            <StepHeader state={state} left={Math.max(0, deadline - now)} total={stepSeconds(state.step, config.drawSeconds)} />
            {inGame ? (
              <TaskPanel
                key={`${state.gameNo}-${state.step}`}
                roomId={roomId}
                state={state}
                myId={myId}
                deadline={deadline}
                now={now}
                connected={connected}
              />
            ) : (
              <div className={`${CARD} text-center text-slate-400`}>
                La partida ya empezó. Vas a poder ver el álbum al final y jugar la próxima.
              </div>
            )}
            <DoneList state={state} myId={myId} presence={presence} />
          </div>
        )}

        {status === "ready" && state && state.status === "album" && (
          <Album roomId={roomId} state={state} myId={myId} />
        )}
      </main>
    </div>
  );
}

function nameOf(state: TelefonoState, id: string, myId: string): string {
  return id === myId ? "Vos" : (state.players[id]?.name ?? "?");
}

function StepHeader({ state, left, total }: { state: TelefonoState; left: number; total: number }) {
  const steps = totalSteps(state);
  const label = state.step === 0 ? "Escribí una frase" : isDrawStep(state.step) ? "Dibujá" : "Describí el dibujo";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <p className="font-display text-xl font-semibold text-slate-100">{label}</p>
        <p className="text-sm text-slate-400">
          Paso {state.step + 1} de {steps} · <span className="font-mono">{Math.ceil(left / 1000)}s</span>
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-lime-400 to-emerald-500 transition-[width] duration-200 ease-linear"
          style={{ width: `${Math.min(100, (left / (total * 1000)) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function TaskPanel({
  roomId,
  state,
  myId,
  deadline,
  now,
  connected,
}: {
  roomId: string;
  state: TelefonoState;
  myId: string;
  deadline: number;
  now: number;
  connected: string[];
}) {
  const chain = chainOf(state, myId, state.step);
  const drawing = isDrawStep(state.step);
  const [prev, setPrev] = useState<Entry | null | undefined>(state.step === 0 ? null : undefined);
  const [text, setText] = useState("");
  const [strokes, setStrokes] = useState<Map<string, Stroke>>(new Map());
  const [sent, setSent] = useState(false);
  const done = !!state.done[myId] || sent;

  useEffect(() => {
    if (state.step === 0) return;
    return subscribeEntry(roomId, state.gameNo, chain, state.step - 1, setPrev);
  }, [roomId, state.gameNo, chain, state.step]);

  const submit = () => {
    if (done) return;
    setSent(true);
    const entry = drawing ? { strokes: [...strokes.values()] } : { text: text.trim() || "…" };
    submitEntry(roomId, state, myId, entry, connected).catch((err) => {
      console.error(err);
      setSent(false);
    });
  };

  // Time's up: hand in whatever there is.
  const timeUp = now > 0 && now >= deadline;
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  useEffect(() => {
    if (timeUp) submitRef.current();
  }, [timeUp]);

  const onText = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) submit();
  };

  if (done) {
    return (
      <div className={`${CARD} flex flex-col items-center gap-2 py-8 text-center`}>
        <p className="font-display text-xl font-semibold text-emerald-300">¡Listo! ✓</p>
        <p className="text-sm text-slate-400">Esperando a los demás…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {state.step > 0 && (
        <div className={`${CARD} !p-4`}>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
            {drawing ? "Te llegó esta frase:" : "Te llegó este dibujo:"}
          </p>
          {prev === undefined ? (
            <p className="text-slate-500">Cargando…</p>
          ) : drawing ? (
            <p className="font-display text-2xl font-bold text-slate-100">
              {prev?.text || <span className="text-slate-500">(llegó en blanco: dibujá lo que quieras)</span>}
            </p>
          ) : (
            <ReadOnlyDrawing strokes={prev?.strokes ?? []} />
          )}
        </div>
      )}

      {drawing ? (
        <>
          <DrawPad strokes={strokes} setStrokes={setStrokes} />
          <button onClick={submit} className={PRIMARY_BUTTON}>
            Listo, pasar el dibujo
          </button>
        </>
      ) : (
        <form onSubmit={onText} className={`${CARD} flex flex-col gap-2`}>
          <p className="text-sm text-slate-400">
            {state.step === 0
              ? "Inventá una frase divertida para que el siguiente la dibuje."
              : "¿Qué ves en el dibujo? Escribilo para que el siguiente lo dibuje."}
          </p>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_TEXT_LENGTH}
            placeholder={state.step === 0 ? "Un gato manejando un colectivo" : "Es…"}
            className={TEXT_INPUT}
            autoFocus
          />
          <div className="flex gap-2">
            {state.step === 0 && (
              <button
                type="button"
                onClick={() => setText(PHRASE_IDEAS[Math.floor(Math.random() * PHRASE_IDEAS.length)])}
                className={`px-3 text-sm ${SECONDARY_BUTTON}`}
              >
                🎲 Dame una idea
              </button>
            )}
            <button type="submit" disabled={!text.trim()} className={`flex-1 ${PRIMARY_BUTTON}`}>
              Listo
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ReadOnlyDrawing({ strokes }: { strokes: Stroke[] }) {
  const map = new Map(strokes.map((s, i) => [`s${i}`, s]));
  return (
    <DrawingCanvas strokes={map} canDraw={false} color="#000" width={1} onStrokeStart={() => ""} onStrokeChange={() => {}} />
  );
}

function DrawPad({
  strokes,
  setStrokes,
}: {
  strokes: Map<string, Stroke>;
  setStrokes: (fn: (m: Map<string, Stroke>) => Map<string, Stroke>) => void;
}) {
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [eraser, setEraser] = useState(false);
  const nextId = useRef(0);

  const undo = () =>
    setStrokes((m) => {
      const keys = [...m.keys()];
      if (!keys.length) return m;
      const next = new Map(m);
      next.delete(keys[keys.length - 1]);
      return next;
    });

  return (
    <div className="flex flex-col gap-2">
      <DrawingCanvas
        strokes={strokes}
        canDraw
        color={eraser ? BACKGROUND : color}
        width={eraser ? ERASER_WIDTH : width}
        onStrokeStart={() => `s${nextId.current++}`}
        onStrokeChange={(id, stroke) => setStrokes((m) => new Map(m).set(id, stroke))}
      />
      <div className={`${CARD} !p-2 flex flex-wrap items-center gap-2`}>
        <div className="flex flex-wrap gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setColor(c);
                setEraser(false);
              }}
              aria-label={`Color ${c}`}
              className={`h-7 w-7 rounded-full border-2 transition ${!eraser && color === c ? "scale-110 border-white" : "border-slate-700"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <span className="mx-1 h-6 w-px bg-slate-700" />
        {WIDTHS.map((w) => (
          <button
            key={w}
            onClick={() => {
              setWidth(w);
              setEraser(false);
            }}
            aria-label={`Grosor ${w}`}
            className={`flex h-8 w-8 items-center justify-center rounded-md border ${
              !eraser && width === w ? "border-cyan-400/60 bg-cyan-500/10" : "border-slate-700"
            }`}
          >
            <span className="rounded-full bg-slate-200" style={{ width: Math.max(4, w / 1.6), height: Math.max(4, w / 1.6) }} />
          </button>
        ))}
        <button
          onClick={() => setEraser(true)}
          className={`rounded-md border px-2 py-1 text-sm ${
            eraser ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-200" : "border-slate-700 text-slate-300"
          }`}
        >
          🧽 Goma
        </button>
        <span className="ml-auto flex gap-1">
          <button onClick={undo} className="rounded-md border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800">
            ↶ Deshacer
          </button>
          <button
            onClick={() => setStrokes(() => new Map())}
            className="rounded-md border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:border-red-400/60 hover:text-red-300"
          >
            🗑 Borrar
          </button>
        </span>
      </div>
    </div>
  );
}

function DoneList({ state, myId, presence }: { state: TelefonoState; myId: string; presence: Record<string, unknown> }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {state.order.map((id) => (
        <span
          key={id}
          className={`rounded-full px-2.5 py-1 text-xs ${
            state.done[id] ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-400"
          } ${id in presence ? "" : "line-through opacity-50"}`}
        >
          {state.done[id] ? "✓ " : "✏️ "}
          {nameOf(state, id, myId)}
        </span>
      ))}
    </div>
  );
}

function Album({ roomId, state, myId }: { roomId: string; state: TelefonoState; myId: string }) {
  const [chains, setChains] = useState<(Entry | null)[][]>([]);
  useEffect(() => subscribeChains(roomId, state.gameNo, setChains), [roomId, state.gameNo]);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.albumChain, state.albumStep]);

  const steps = totalSteps(state);
  const chain = chains[state.albumChain] ?? [];
  const owner = state.order[state.albumChain];
  const lastChain = state.albumChain + 1 >= state.order.length;
  const lastStep = state.albumStep + 1 >= steps;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4">
      <div className="text-center">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Álbum {state.albumChain + 1} de {state.order.length}
        </p>
        <p className="font-display text-2xl font-semibold text-slate-100">La cadena de {nameOf(state, owner, myId)}</p>
      </div>

      {Array.from({ length: state.albumStep + 1 }, (_, k) => {
        const e = chain[k];
        const author = e?.by ?? state.order[(state.albumChain + k) % state.order.length];
        return (
          <div key={k} className={`animate-celebration-in ${CARD} !p-4`}>
            <p className="mb-2 text-xs text-slate-500">
              <span style={{ color: state.players[author]?.color }}>{nameOf(state, author, myId)}</span>{" "}
              {k === 0 ? "escribió:" : isDrawStep(k) ? "dibujó:" : "creyó que era:"}
            </p>
            {isDrawStep(k) ? (
              <ReadOnlyDrawing strokes={e?.strokes ?? []} />
            ) : (
              <p className="font-display text-2xl font-bold text-slate-100">{e?.text || <span className="text-slate-500">(en blanco)</span>}</p>
            )}
          </div>
        );
      })}
      <div ref={endRef} />

      {!(lastChain && lastStep) ? (
        <button onClick={() => albumNext(roomId, { chain: state.albumChain, step: state.albumStep })} className={PRIMARY_BUTTON}>
          {lastStep ? "Siguiente cadena" : "Ver qué pasó después"}
        </button>
      ) : (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="font-display text-xl font-semibold text-slate-100">🏁 ¡Fin del álbum!</p>
          <button onClick={() => playAgain(roomId, state.gameNo)} className={`w-full max-w-xs ${SECONDARY_BUTTON}`}>
            Jugar de nuevo
          </button>
        </div>
      )}
    </div>
  );
}
