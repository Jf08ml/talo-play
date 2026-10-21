"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  ALPHABET,
  MAX_MISSES,
  MAX_WORD,
  chooseWord,
  currentGuesser,
  getAhorcadoMeta,
  guess,
  guessersOf,
  joinAhorcado,
  misses,
  nextRound,
  playAgain,
  setterOf,
  skipGuesser,
  startAhorcado,
  subscribeAhorcado,
  wordProblem,
  type AhorcadoState,
} from "@/lib/ahorcado";
import type { PresenceMap } from "@/lib/presence";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_INPUT } from "@/components/ui";
import { Eye, EyeOff } from "lucide-react";
import { useTurnAlert } from "@/hooks/useTurnAlert";
import GameResults, { rankFrom } from "@/components/Results";
import { useSoundOn } from "@/hooks/useSound";

type Status = "loading" | "not-found" | "ready" | "error";

export default function AhorcadoClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [state, setState] = useState<AhorcadoState | null>(null);
  const [hostId, setHostId] = useState("");

  const myId = identity.clientId;
  useSoundOn(state?.last.text ? `${state.turnNo}${state.last.text}` : null, state?.last.ok ? "good" : "bad");
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  // Presence starts empty: only trust "X isn't here" once I see myself in it.
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    getAhorcadoMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "ahorcado") return router.replace(`/sala/${roomId}`);
        setHostId(meta.hostId ?? "");
        unsub = subscribeAhorcado(roomId, setState);
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
    joinAhorcado(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;

  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="ahorcado"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="ahorcado" />
        )}

        {status === "loading" && <RoomLoading text="Atando la soga…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="ahorcado"
              roomId={roomId}
              hostId={hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`Una ronda por jugador · ${MAX_MISSES} errores y te ahorcan`}
              onStart={() => startAhorcado(roomId, connected)}
            />
          </div>
        )}

        {status === "ready" && state && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {state.status === "choosing" && <ChoosePanel roomId={roomId} state={state} myId={myId} isAway={isAway} />}
              {(state.status === "guessing" || state.status === "roundEnd") && (
                <GuessPanel roomId={roomId} state={state} myId={myId} isAway={isAway} />
              )}
              {state.status === "finished" && (
                <FinalPanel
                  state={state}
                  myId={myId}
                  canAgain={connected.length >= 2}
                  onAgain={() => playAgain(roomId, state.gameNo, connected)}
                />
              )}
            </div>
            <Scoreboard state={state} presence={presence} myId={myId} />
          </div>
        )}
      </main>
    </div>
  );
}

function nameOf(state: AhorcadoState, id: string, myId: string): string {
  return id === myId ? "vos" : (state.players[id]?.name ?? "?");
}

function ChoosePanel({
  roomId,
  state,
  myId,
  isAway,
}: {
  roomId: string;
  state: AhorcadoState;
  myId: string;
  isAway: (id: string) => boolean;
}) {
  const [text, setText] = useState("");
  const [shown, setShown] = useState(false);
  const setter = setterOf(state);
  const isSetter = setter === myId;
  const problem = text.trim() ? wordProblem(text) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || problem) return;
    chooseWord(roomId, myId, state.round, text).catch(console.error);
  };

  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      <p className="text-center text-xs uppercase tracking-wide text-slate-500">
        Ronda {state.round + 1} de {state.order.length}
      </p>
      {isSetter ? (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="text-center">
            <p className="font-display text-xl font-semibold text-slate-100">Te toca elegir la palabra</p>
            <p className="text-sm text-slate-400">Que nadie mire tu pantalla. Puede ser una palabra o una frase corta.</p>
          </div>
          <div className="flex gap-2">
            <input
              autoFocus
              type={shown ? "text" : "password"}
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_WORD}
              placeholder="Palabra secreta"
              className={`min-w-0 flex-1 ${TEXT_INPUT}`}
            />
            <button
              type="button"
              onClick={() => setShown((v) => !v)}
              aria-label={shown ? "Ocultar" : "Mostrar"}
              className="rounded-lg border border-slate-700 px-3 text-slate-400 hover:text-slate-200"
            >
              {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {problem && <p className="text-xs text-amber-300">{problem}</p>}
          <button type="submit" disabled={!text.trim() || !!problem} className={PRIMARY_BUTTON}>
            Usar esta palabra
          </button>
          <button
            type="button"
            onClick={() => chooseWord(roomId, myId, state.round, null)}
            className={`text-sm ${SECONDARY_BUTTON}`}
          >
            Que la elija la app (y adivino yo también)
          </button>
        </form>
      ) : (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="font-display text-xl font-semibold text-slate-100">
            <span style={{ color: state.players[setter]?.color }}>{nameOf(state, setter, myId)}</span> está eligiendo la
            palabra…
          </p>
          {isAway(setter) && (
            <button
              onClick={() => chooseWord(roomId, myId, state.round, null)}
              className={`w-full max-w-xs text-sm ${SECONDARY_BUTTON}`}
            >
              Se fue: que la elija la app
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The gallows, drawn part by part with each miss. */
function Gallows({ misses: m }: { misses: number }) {
  const part = (n: number) => (m >= n ? "opacity-100" : "opacity-0");
  return (
    <svg viewBox="0 0 120 130" className="h-40 w-36 shrink-0 sm:h-48 sm:w-44">
      <g stroke="#94a3b8" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M10 125 H70 M30 125 V8 H82 V22" />
      </g>
      <g stroke="#f8fafc" strokeWidth="4" strokeLinecap="round" fill="none" className="transition-opacity">
        <circle cx="82" cy="34" r="12" className={`transition-opacity duration-300 ${part(1)}`} />
        <path d="M82 46 V80" className={`transition-opacity duration-300 ${part(2)}`} />
        <path d="M82 56 L66 70" className={`transition-opacity duration-300 ${part(3)}`} />
        <path d="M82 56 L98 70" className={`transition-opacity duration-300 ${part(4)}`} />
        <path d="M82 80 L68 102" className={`transition-opacity duration-300 ${part(5)}`} />
        <path d="M82 80 L96 102" className={`transition-opacity duration-300 ${part(6)}`} />
      </g>
      {m >= MAX_MISSES && (
        <g stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round">
          <path d="M76 30 l4 4 m0 -4 l-4 4 M84 30 l4 4 m0 -4 l-4 4" />
        </g>
      )}
    </svg>
  );
}

function GuessPanel({
  roomId,
  state,
  myId,
  isAway,
}: {
  roomId: string;
  state: AhorcadoState;
  myId: string;
  isAway: (id: string) => boolean;
}) {
  const [wordText, setWordText] = useState("");
  const setter = setterOf(state);
  const guesser = currentGuesser(state);
  const ended = state.status === "roundEnd";
  const myTurn = !ended && guesser === myId;
  useTurnAlert(myTurn);
  const m = misses(state);
  const knowsWord = !state.fromApp && setter === myId;
  const canSee = (ch: string) => ch === " " || state.tried.includes(ch) || ended || knowsWord;

  const tryLetter = (letter: string) => {
    if (!myTurn || state.tried.includes(letter)) return;
    guess(roomId, myId, state.turnNo, letter).catch(console.error);
  };
  const tryWord = (e: FormEvent) => {
    e.preventDefault();
    if (!myTurn || !wordText.trim()) return;
    guess(roomId, myId, state.turnNo, wordText).catch(console.error);
    setWordText("");
  };

  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          Ronda {state.round + 1} de {state.order.length} ·{" "}
          {state.fromApp ? "palabra de la app" : `palabra de ${nameOf(state, setter, myId)}`}
        </span>
        <span className={m >= MAX_MISSES - 1 ? "font-semibold text-rose-300" : ""}>
          Errores: {m} / {MAX_MISSES}
        </span>
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <Gallows misses={m} />
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {state.word.split(" ").map((w, wi) => (
            <div key={wi} className="flex gap-1">
              {[...w].map((ch, i) => {
                const visible = canSee(ch);
                const missed = ended && !state.tried.includes(ch) && !state.solvedBy;
                return (
                  <span
                    key={i}
                    className={`flex h-10 w-7 items-end justify-center border-b-2 pb-0.5 font-mono text-2xl font-bold sm:w-8 ${
                      missed ? "border-rose-400 text-rose-300" : knowsWord && !state.tried.includes(ch) ? "border-slate-500 text-slate-500" : "border-slate-400 text-slate-100"
                    }`}
                  >
                    {visible ? ch : ""}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {state.last.by && (
        <p className="text-center text-sm text-slate-400">
          {nameOf(state, state.last.by, myId)} probó{" "}
          <span className={`font-mono font-semibold ${state.last.ok ? "text-emerald-300" : "text-rose-300"}`}>
            {state.last.text}
          </span>
          {state.last.ok ? " ✓" : " ✗"}
        </p>
      )}

      {ended ? (
        <RoundEnd roomId={roomId} state={state} myId={myId} />
      ) : (
        <>
          <div className="grid grid-cols-9 gap-1 sm:gap-1.5">
            {ALPHABET.map((l) => {
              const used = state.tried.includes(l);
              const ok = used && state.word.includes(l);
              return (
                <button
                  key={l}
                  onClick={() => tryLetter(l)}
                  disabled={!myTurn || used}
                  className={`rounded-md py-2 font-mono text-sm font-bold transition ${
                    used
                      ? ok
                        ? "bg-emerald-500/25 text-emerald-300"
                        : "bg-slate-800/40 text-slate-600 line-through"
                      : myTurn
                        ? "bg-slate-700 text-slate-100 hover:bg-violet-600"
                        : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {l}
                </button>
              );
            })}
          </div>
          {myTurn ? (
            <form onSubmit={tryWord} className="flex gap-2">
              <input
                value={wordText}
                onChange={(e) => setWordText(e.target.value)}
                maxLength={MAX_WORD}
                placeholder="¿Ya sabés? Arriesgá la palabra"
                className={`min-w-0 flex-1 ${TEXT_INPUT}`}
              />
              <button type="submit" disabled={!wordText.trim()} className={`px-4 text-sm ${SECONDARY_BUTTON}`}>
                Arriesgar
              </button>
            </form>
          ) : null}
          <div className="flex flex-col items-center gap-2 text-center text-sm">
            <p className={myTurn ? "font-semibold text-fuchsia-300" : "text-slate-400"}>
              {myTurn ? (
                "¡Te toca! Elegí una letra."
              ) : (
                <>
                  Turno de <span style={{ color: state.players[guesser]?.color }}>{nameOf(state, guesser, myId)}</span>
                  {knowsWord && " · vos elegiste la palabra: mirá cómo sufren"}
                </>
              )}
            </p>
            {isAway(guesser) && !myTurn && (
              <button onClick={() => skipGuesser(roomId, state.turnNo)} className={`px-4 text-xs ${SECONDARY_BUTTON}`}>
                {nameOf(state, guesser, myId)} se fue: saltar su turno
              </button>
            )}
            {!guessersOf(state).includes(myId) && setter !== myId && (
              <p className="text-xs text-slate-500">Entraste con la partida empezada: mirás hasta la próxima.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RoundEnd({ roomId, state, myId }: { roomId: string; state: AhorcadoState; myId: string }) {
  const setter = setterOf(state);
  const message = state.solvedBy
    ? state.solvedBy === myId
      ? "🎉 ¡La sacaste! +3"
      : `🎯 ¡La sacó ${nameOf(state, state.solvedBy, myId)}! +3`
    : state.fromApp
      ? "💀 ¡Los ahorcó la app!"
      : setter === myId
        ? "💀 ¡Los ahorcaste a todos! +3"
        : `💀 ¡Ahorcados! +3 para ${nameOf(state, setter, myId)}`;
  const last = state.round + 1 >= state.order.length;
  return (
    <div className="animate-celebration-in flex flex-col items-center gap-3 text-center">
      <p className="font-display text-xl font-semibold text-slate-100">{message}</p>
      <button onClick={() => nextRound(roomId, state.round)} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
        {last ? "Ver resultados" : "Siguiente ronda"}
      </button>
    </div>
  );
}

function FinalPanel({
  state,
  myId,
  canAgain,
  onAgain,
}: {
  state: AhorcadoState;
  myId: string;
  canAgain: boolean;
  onAgain: () => void;
}) {
  return (
    <GameResults
      ranking={rankFrom(state.players, state.scores, state.order)}
      myId={myId}
      actions={
        canAgain ? (
          <button onClick={onAgain} className={`w-full ${PRIMARY_BUTTON}`}>
            Jugar de nuevo
          </button>
        ) : (
          <p className="text-xs text-amber-300/90">Hace falta al menos otra persona conectada para jugar de nuevo.</p>
        )
      }
    />
  );
}

function Scoreboard({ state, presence, myId }: { state: AhorcadoState; presence: PresenceMap; myId: string }) {
  const rows = Object.keys(state.players)
    .filter((id) => id in presence || state.order.includes(id))
    .sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0));
  return (
    <aside className={`${CARD} !p-4 w-full lg:w-72`}>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Puntos</h2>
      <ol className="flex flex-col gap-1.5 text-sm">
        {rows.map((id) => (
          <li key={id} className={`flex items-center gap-2 ${id in presence ? "" : "opacity-40"}`}>
            <span className="flex-1 truncate" style={{ color: state.players[id]?.color }}>
              {id === myId ? "Vos" : (state.players[id]?.name ?? "?")}
            </span>
            {!state.order.includes(id) && <span className="text-xs text-slate-500">mirando</span>}
            <span className="w-8 text-right font-mono text-slate-200">{state.scores[id] ?? 0}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-slate-800 pt-2 text-xs text-slate-500">
        Letra acertada: 1 · completar la palabra: 3 · ahorcar a todos: 3 para quien la eligió.
      </p>
    </aside>
  );
}
