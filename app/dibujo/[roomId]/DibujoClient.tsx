"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  CHOOSE_SECONDS,
  checkGuess,
  chooseWord,
  clearStrokes,
  endTurn,
  getDibujoMeta,
  joinDibujo,
  MAX_GUESS_LENGTH,
  newStrokeId,
  nextTurn,
  removeStroke,
  restartDibujo,
  REVEAL_MS,
  saveStroke,
  sendChat,
  startDibujo,
  submitCorrectGuess,
  subscribeChat,
  subscribeDibujoState,
  subscribeStrokes,
  totalTurns,
  turnKey,
  wordHint,
  wordOptions,
  wordPool,
  type ChatMessage,
  type DibujoState,
  type Stroke,
} from "@/lib/dibujo";
import type { PresenceMap } from "@/lib/presence";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useServerNow } from "@/hooks/useServerNow";
import DrawingCanvas, { BACKGROUND } from "@/components/dibujo/DrawingCanvas";
import NamePrompt from "@/components/NamePrompt";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { CARD, PRIMARY_BUTTON } from "@/components/ui";

type Status = "loading" | "not-found" | "ready" | "error";

const COLORS = ["#0f172a", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#92400e", "#94a3b8"];
const WIDTHS = [4, 10, 22];
const ERASER_WIDTH = 34;

export default function DibujoClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [config, setConfig] = useState<{ rounds: number; drawSeconds: number; pool: string[] } | null>(null);
  const [state, setState] = useState<DibujoState | null>(null);
  const [strokes, setStrokes] = useState<Map<string, Stroke>>(new Map());
  const [chat, setChat] = useState<ChatMessage[]>([]);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  // Presence starts empty: only trust "X isn't here" once I see myself in it.
  const presenceLoaded = !!myId && myId in presence;

  // Load the room's setup, then follow its game state.
  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    getDibujoMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "dibujo") return router.replace(`/sala/${roomId}`);
        setConfig({
          rounds: meta.rounds ?? 2,
          drawSeconds: meta.drawSeconds ?? 80,
          pool: wordPool({ customWords: meta.customWords, useDefaultWords: meta.useDefaultWords ?? true }),
        });
        unsub = subscribeDibujoState(roomId, setState);
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

  // Take a seat (and keep my name/color up to date).
  const hasState = state !== null;
  useEffect(() => {
    if (!hasState || !identity.clientId || !identity.name) return;
    joinDibujo(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  // Strokes and chat belong to the current turn.
  const tk = state ? turnKey(state) : "";
  useEffect(() => {
    if (!tk) return;
    const unsubStrokes = subscribeStrokes(roomId, tk, setStrokes);
    const unsubChat = subscribeChat(roomId, tk, setChat);
    return () => {
      unsubStrokes();
      unsubChat();
    };
  }, [roomId, tk]);

  const phase = state?.status;
  const now = useServerNow(phase === "choosing" || phase === "drawing" || phase === "reveal");
  const turnNo = state?.turnNo ?? 0;
  const drawer = state?.drawer ?? "";
  const isDrawer = drawer === myId;
  const drawerHere = !presenceLoaded || drawer in presence;
  const options = useMemo(
    () => (state && config ? wordOptions(state.seed, config.pool, state.turnNo) : []),
    [state, config]
  );

  const phaseMs =
    phase === "choosing" ? CHOOSE_SECONDS * 1000 : phase === "drawing" ? (config?.drawSeconds ?? 0) * 1000 : REVEAL_MS;
  const deadline = state ? state.phaseStartedAt + phaseMs : 0;
  const expired = now > 0 && deadline > 0 && now >= deadline;

  // Phase timeouts and absent drawers. Every client runs these; each
  // transaction is guarded by the turn number, so it applies only once.
  const rounds = config?.rounds ?? 0;
  const firstOption = options[0];
  useEffect(() => {
    if (phase === "choosing" && !drawerHere) nextTurn(roomId, turnNo, rounds).catch(console.error);
    else if (phase === "choosing" && expired && firstOption) chooseWord(roomId, turnNo, firstOption).catch(console.error);
    else if (phase === "drawing" && (expired || !drawerHere)) endTurn(roomId, turnNo).catch(console.error);
    else if (phase === "reveal" && expired) nextTurn(roomId, turnNo, rounds).catch(console.error);
  }, [phase, expired, drawerHere, roomId, turnNo, rounds, firstOption]);

  if (!configured) return <FirebaseSetupNotice />;

  const onlineGuessers = state ? state.order.filter((id) => id !== drawer && id in presence) : [];

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="dibujo"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" />
        )}

        {status === "loading" && <RoomLoading text="Sacando los lápices…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && (
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              {state.status === "waiting" ? (
                <div className={`${CARD} flex flex-col items-center gap-3 text-center`}>
                  <p className="font-display text-lg font-semibold text-slate-100">Esperando jugadores…</p>
                  <p className="text-sm text-slate-400">
                    Cada uno dibuja {config.rounds} {config.rounds === 1 ? "vez" : "veces"}, {config.drawSeconds} s por
                    dibujo. Compartí el enlace; cuando estén todos, cualquiera puede arrancar.
                  </p>
                  <button onClick={() => startDibujo(roomId)} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
                    Empezar partida
                  </button>
                </div>
              ) : state.status === "finished" ? (
                <FinishedView state={state} myId={myId} onRestart={() => restartDibujo(roomId)} />
              ) : (
                <>
                  <TurnBar
                    state={state}
                    myId={myId}
                    now={now}
                    deadline={deadline}
                    drawSeconds={config.drawSeconds}
                    totalTurns={totalTurns(state, config.rounds)}
                  />
                  <Board
                    roomId={roomId}
                    tk={tk}
                    state={state}
                    strokes={strokes}
                    isDrawer={isDrawer}
                    myId={myId}
                    options={options}
                  />
                </>
              )}
            </div>

            <div className="flex w-full flex-col gap-4 lg:w-80">
              <Scoreboard state={state} presence={presence} myId={myId} />
              {state.status !== "waiting" && (
                <Chat
                  roomId={roomId}
                  tk={tk}
                  state={state}
                  chat={chat}
                  myId={myId}
                  isDrawer={isDrawer}
                  onCorrect={() =>
                    submitCorrectGuess(roomId, state.turnNo, myId, config.drawSeconds, Math.max(1, onlineGuessers.length))
                  }
                />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function TurnBar({
  state,
  myId,
  now,
  deadline,
  drawSeconds,
  totalTurns,
}: {
  state: DibujoState;
  myId: string;
  now: number;
  deadline: number;
  drawSeconds: number;
  totalTurns: number;
}) {
  const drawerName = state.drawer === myId ? "Vos" : state.players[state.drawer]?.name ?? "?";
  const secondsLeft = now ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const iKnow = state.drawer === myId || !!state.guessed[myId] || state.status === "reveal";
  const elapsed = now ? 1 - (deadline - now) / (drawSeconds * 1000) : 0;

  let center: string;
  if (state.status === "choosing") center = state.drawer === myId ? "Elegí qué dibujar" : `${drawerName} está eligiendo…`;
  else if (iKnow) center = state.word;
  else center = wordHint(state.word, state.seed, state.turnNo, elapsed);

  return (
    <div className={`${CARD} !py-3 flex items-center gap-3`}>
      <div className="w-24 shrink-0 text-xs text-slate-500 sm:w-32">
        Turno {Math.min(state.turnNo + 1, totalTurns)}/{totalTurns}
        <div className="truncate text-sm text-slate-300">✏️ {drawerName}</div>
      </div>
      <p
        className={`min-w-0 flex-1 truncate text-center font-display text-xl font-semibold sm:text-2xl ${
          iKnow && state.status !== "choosing" ? "text-emerald-300" : "tracking-widest text-slate-100"
        }`}
      >
        {center}
        {!iKnow && state.status === "drawing" && (
          <span className="ml-2 align-middle text-xs font-normal tracking-normal text-slate-500">
            ({[...state.word].filter((c) => c !== " ").length} letras)
          </span>
        )}
      </p>
      {secondsLeft !== null && state.status !== "reveal" && (
        <span
          className={`shrink-0 rounded-lg px-3 py-1 font-mono text-lg ${
            secondsLeft <= 10 && state.status === "drawing" ? "bg-red-500/15 text-red-300" : "bg-slate-800 text-slate-200"
          }`}
        >
          {secondsLeft}s
        </span>
      )}
    </div>
  );
}

function Board({
  roomId,
  tk,
  state,
  strokes,
  isDrawer,
  myId,
  options,
}: {
  roomId: string;
  tk: string;
  state: DibujoState;
  strokes: Map<string, Stroke>;
  isDrawer: boolean;
  myId: string;
  options: string[];
}) {
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [eraser, setEraser] = useState(false);
  const mine = useRef<string[]>([]);
  const canDraw = isDrawer && state.status === "drawing";

  const undo = () => {
    // Last stroke I drew that's still on the board.
    while (mine.current.length) {
      const id = mine.current.pop()!;
      if (strokes.has(id)) {
        removeStroke(roomId, tk, id).catch(console.error);
        return;
      }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <DrawingCanvas
          strokes={strokes}
          canDraw={canDraw}
          color={eraser ? BACKGROUND : color}
          width={eraser ? ERASER_WIDTH : width}
          onStrokeStart={() => {
            const id = newStrokeId(roomId, tk);
            mine.current.push(id);
            return id;
          }}
          onStrokeChange={(id, stroke) => saveStroke(roomId, tk, id, stroke).catch(console.error)}
        />

        {state.status === "choosing" && isDrawer && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-slate-950/80 p-4 backdrop-blur-sm">
            <p className="font-display text-lg font-semibold text-slate-100">Elegí una palabra para dibujar</p>
            <div className="flex flex-wrap justify-center gap-2">
              {options.map((w) => (
                <button
                  key={w}
                  onClick={() => chooseWord(roomId, state.turnNo, w)}
                  className="rounded-xl border border-violet-400/40 bg-violet-600/20 px-4 py-2.5 font-display text-lg font-semibold text-violet-100 transition hover:bg-violet-600/40 hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]"
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        )}

        {state.status === "choosing" && !isDrawer && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-950/70 p-4 text-center">
            <p className="font-display text-lg text-slate-300">
              {state.players[state.drawer]?.name ?? "?"} está eligiendo una palabra…
            </p>
          </div>
        )}

        {state.status === "reveal" && (
          <div className="animate-celebration-in absolute inset-x-4 top-4 flex flex-col items-center gap-2 rounded-2xl border border-emerald-500/25 bg-slate-900/95 p-4 text-center shadow-[0_0_40px_rgba(52,211,153,0.2)]">
            <p className="text-sm text-slate-400">La palabra era</p>
            <p className="font-display text-2xl font-bold text-emerald-300">{state.word}</p>
            <p className="text-sm text-slate-300">
              {Object.keys(state.guessed).length === 0
                ? "Nadie la adivinó 😅"
                : Object.entries(state.guessed)
                    .sort((a, b) => a[1].at - b[1].at)
                    .map(([id, g]) => `${id === myId ? "Vos" : state.players[id]?.name ?? "?"} +${g.points}`)
                    .join(" · ")}
            </p>
          </div>
        )}
      </div>

      {isDrawer && state.status === "drawing" && (
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
                className={`h-7 w-7 rounded-full border-2 transition ${
                  !eraser && color === c ? "scale-110 border-white" : "border-slate-700"
                }`}
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
              onClick={() => clearStrokes(roomId, tk)}
              className="rounded-md border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:border-red-400/60 hover:text-red-300"
            >
              🗑 Borrar
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

function Chat({
  roomId,
  tk,
  state,
  chat,
  myId,
  isDrawer,
  onCorrect,
}: {
  roomId: string;
  tk: string;
  state: DibujoState;
  chat: ChatMessage[];
  myId: string;
  isDrawer: boolean;
  onCorrect: () => void;
}) {
  const [text, setText] = useState("");
  const [close, setClose] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const guessing = state.status === "drawing" && !isDrawer && !state.guessed[myId];
  // While drawing, the drawer and those who already guessed only watch: their
  // messages could give the word away.
  const blocked = state.status === "drawing" && !guessing;

  // Chat lines plus "X adivinó" events, in time order.
  const lines = useMemo(() => {
    const items: { key: string; at: number; by: string; text?: string; points?: number }[] = chat.map((m, i) => ({
      key: `m${i}`,
      at: m.at,
      by: m.by,
      text: m.text,
    }));
    for (const [id, g] of Object.entries(state.guessed)) items.push({ key: `g${id}`, at: g.at, by: id, points: g.points });
    return items.sort((a, b) => a.at - b.at);
  }, [chat, state.guessed]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lines.length]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const guess = text.trim();
    if (!guess || blocked) return;
    setText("");
    setClose(null);
    if (guessing) {
      const result = checkGuess(guess, state.word);
      if (result === "correct") return onCorrect();
      if (result === "close") return setClose(guess);
    }
    sendChat(roomId, tk, myId, guess).catch(console.error);
  };

  return (
    <div className={`${CARD} !p-3 flex h-80 flex-col gap-2 lg:h-[26rem]`}>
      <div ref={listRef} className="flex-1 space-y-1 overflow-y-auto pr-1 text-sm">
        {lines.length === 0 && <p className="text-slate-600">Escribí acá lo que creés que es.</p>}
        {lines.map((l) => {
          const p = state.players[l.by];
          const name = l.by === myId ? "Vos" : p?.name ?? "?";
          if (l.points !== undefined) {
            return (
              <p key={l.key} className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-300">
                ✓ {name} {l.by === myId ? "adivinaste" : "adivinó"} (+{l.points})
              </p>
            );
          }
          return (
            <p key={l.key} className="break-words px-2">
              <span className="font-semibold" style={{ color: p?.color }}>
                {name}:
              </span>{" "}
              <span className="text-slate-300">{l.text}</span>
            </p>
          );
        })}
      </div>
      {close && (
        <p className="rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
          ¡Casi! &quot;{close}&quot; está muy cerca. Revisá cómo lo escribiste.
        </p>
      )}
      <form onSubmit={submit} className="flex gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_GUESS_LENGTH}
          disabled={blocked}
          placeholder={
            isDrawer && state.status === "drawing"
              ? "Estás dibujando 🎨"
              : state.guessed[myId] && state.status === "drawing"
                ? "¡Ya adivinaste! Esperá a los demás"
                : guessing
                  ? "¿Qué es?"
                  : "Escribí algo…"
          }
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={blocked || !text.trim()}
          className="rounded-lg bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}

function ranked(state: DibujoState): string[] {
  return [...state.order].sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0));
}

function Scoreboard({ state, presence, myId }: { state: DibujoState; presence: PresenceMap; myId: string }) {
  const inTurn = state.status === "choosing" || state.status === "drawing" || state.status === "reveal";
  return (
    <aside className={`${CARD} !p-4`}>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Puntos</h2>
      <ul className="flex flex-col gap-1">
        {ranked(state).map((id) => {
          const p = state.players[id];
          return (
            <li
              key={id}
              className={`flex items-center gap-2 rounded-lg px-2 py-1 ${
                inTurn && id === state.drawer ? "bg-violet-500/15 ring-1 ring-violet-400/40" : ""
              } ${id in presence ? "" : "opacity-40"}`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p?.color }} />
              <span className="flex-1 truncate text-sm text-slate-200">
                {p?.name ?? "?"}
                {id === myId && <span className="text-slate-500"> (vos)</span>}
              </span>
              {inTurn && id === state.drawer && <span title="Dibuja">✏️</span>}
              {inTurn && state.guessed[id] && <span className="text-emerald-400">✓</span>}
              <span className="font-mono text-sm font-semibold text-slate-100">{state.scores[id] ?? 0}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function FinishedView({ state, myId, onRestart }: { state: DibujoState; myId: string; onRestart: () => void }) {
  const order = ranked(state);
  const best = state.scores[order[0]] ?? 0;
  const winners = order.filter((id) => (state.scores[id] ?? 0) === best);
  const names = winners.map((id) => (id === myId ? "vos" : state.players[id]?.name ?? "?"));
  const iWon = winners.includes(myId);
  return (
    <div
      className={`animate-celebration-in flex flex-col items-center gap-3 rounded-2xl border bg-slate-900 p-6 text-center ${
        iWon ? "border-emerald-500/25 shadow-[0_0_40px_rgba(52,211,153,0.2)]" : "border-violet-500/20"
      }`}
    >
      <p className="font-display text-2xl font-semibold text-slate-100">
        {iWon ? "🎉 ¡Ganaste!" : "🏁 ¡Terminó la partida!"}
      </p>
      <p className="text-slate-400">
        {winners.length > 1 ? `Empate entre ${names.join(" y ")}` : `Ganó ${names[0]}`} con {best} puntos.
      </p>
      <button onClick={onRestart} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
        Jugar de nuevo
      </button>
    </div>
  );
}
