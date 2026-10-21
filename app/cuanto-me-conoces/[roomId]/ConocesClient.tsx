"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  ANSWER_SECONDS,
  MIN_PLAYERS,
  closeTurn,
  getConocesMeta,
  joinConoces,
  nextTurn,
  normalizeMeta,
  playAgain,
  protagonistOf,
  questionFor,
  skipTurn,
  startConoces,
  submitAnswer,
  submitGuess,
  subscribeConoces,
  totalTurns,
  type ConocesState,
} from "@/lib/conoces";
import type { PresenceMap } from "@/lib/presence";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useServerNow } from "@/hooks/useServerNow";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { BackToRoomButton, RoomSettingsEditor, type RawMeta } from "@/components/RoomSettings";
import { watchRoomMeta } from "@/lib/roomSettings";
import { SETTINGS } from "../settings";
import { CARD, PRIMARY_BUTTON } from "@/components/ui";
import { Check, Lock } from "lucide-react";
import GameResults, { rankFrom } from "@/components/Results";

type Status = "loading" | "not-found" | "ready" | "error";

export default function ConocesClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
  const [config, setConfig] = useState<{ hostId: string; rounds: number } | null>(null);
  const [state, setState] = useState<ConocesState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  // Presence starts empty: only trust "X isn't here" once I see myself in it.
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getConocesMeta>>>>(
      roomId,
      (meta) => {
        if (cancelled) return;
        setRoomMeta(meta);
        if (!meta) return setStatus("not-found");
        if (meta.game !== "conoces") return router.replace(`/sala/${roomId}`);
        setConfig({ ...normalizeMeta(meta), hostId: meta.hostId ?? "" });
        unsub ??= subscribeConoces(roomId, setState);
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
    joinConoces(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const answering = state?.status === "answering";
  const now = useServerNow(answering);
  const deadline = (state?.phaseStartedAt ?? 0) + ANSWER_SECONDS * 1000;
  const expired = answering && now > 0 && now >= deadline;
  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  const protagonist = state ? protagonistOf(state) : "";
  const guessers = connected.filter((id) => id !== protagonist);
  const total = state && config ? totalTurns(state, config.rounds) : 0;

  // Timeouts and absent players. Every client runs these; each transaction is
  // guarded by the turn number, so it applies only once.
  const turnNo = state?.turnNo ?? 0;
  const answered = (state?.answer ?? -1) >= 0;
  const protagonistGone = presenceLoaded && !!protagonist && !(protagonist in presence);
  const allIn =
    answering && presenceLoaded && answered && guessers.every((id) => state?.guesses[id] !== undefined);
  useEffect(() => {
    if (!answering) return;
    if (protagonistGone && !answered) skipTurn(roomId, turnNo, total).catch(console.error);
    else if (expired || allIn) closeTurn(roomId, turnNo).catch(console.error);
  }, [answering, protagonistGone, answered, expired, allIn, roomId, turnNo, total]);

  if (!configured) return <FirebaseSetupNotice />;

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="conoces"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="conoces" />
        )}

        {status === "loading" && <RoomLoading text="Preparando las preguntas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="conoces"
              roomId={roomId}
              hostId={config.hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`${config.rounds} preguntas para cada uno`}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              onStart={() => startConoces(roomId, connected)}
            >
              {connected.length < MIN_PLAYERS && (
                <p className="text-center text-sm text-amber-300/90">Hace falta al menos otra persona para empezar.</p>
              )}
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && config && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {state.status === "finished" ? (
                <>
                  <FinalPanel
                    state={state}
                    myId={myId}
                    canAgain={connected.length >= MIN_PLAYERS}
                    onAgain={() => playAgain(roomId, state.gameNo, connected)}
                  />
                  <BackToRoomButton roomId={roomId} stateKey="conoces/state" hostId={config.hostId} presence={presence} myId={myId} />
                </>
              ) : (
                <TurnPanel
                  roomId={roomId}
                  state={state}
                  myId={myId}
                  guessers={guessers}
                  total={total}
                  left={Math.max(0, deadline - now)}
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

function nameOf(state: ConocesState, id: string, myId: string): string {
  return id === myId ? "vos" : (state.players[id]?.name ?? "?");
}

function Avatar({ state, id }: { state: ConocesState; id: string }) {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-slate-900"
      style={{ backgroundColor: state.players[id]?.color ?? "#64748b" }}
      title={state.players[id]?.name}
    >
      {state.players[id]?.name.slice(0, 1).toUpperCase() ?? "?"}
    </span>
  );
}

function TurnPanel({
  roomId,
  state,
  myId,
  guessers,
  total,
  left,
}: {
  roomId: string;
  state: ConocesState;
  myId: string;
  guessers: string[];
  total: number;
  left: number;
}) {
  const protagonist = protagonistOf(state);
  const isProtagonist = protagonist === myId;
  const question = questionFor(state.seed, state.turnNo);
  const revealing = state.status === "reveal";
  const mine = isProtagonist ? state.answer : state.guesses[myId];
  const guessed = guessers.filter((id) => state.guesses[id] !== undefined).length;
  const protName = state.players[protagonist]?.name ?? "?";
  const canChoose = !revealing && !!state.players[myId];

  const choose = (i: number) => {
    if (!canChoose) return;
    if (isProtagonist) submitAnswer(roomId, state.turnNo, myId, i, guessers.length).catch(console.error);
    else submitGuess(roomId, state.turnNo, myId, i, guessers.length).catch(console.error);
  };

  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          Pregunta {state.turnNo + 1} de {total}
        </span>
        <span className="flex items-center gap-1.5">
          <Avatar state={state} id={protagonist} />
          <span style={{ color: state.players[protagonist]?.color }}>{isProtagonist ? "Te toca a vos" : `Le toca a ${protName}`}</span>
        </span>
      </div>

      <div key={state.turnNo} className="animate-celebration-in text-center">
        {!isProtagonist && (
          <p className="text-sm font-medium text-rose-300">Le preguntamos a {protName}:</p>
        )}
        <p className="mt-1 font-display text-2xl font-bold text-slate-100">{question.q}</p>
        {!revealing && (
          <p className="mt-1 text-sm text-slate-400">
            {isProtagonist
              ? "Elegí tu respuesta. Nadie la ve hasta el final."
              : `¿Qué creés que eligió ${protName}?`}
          </p>
        )}
      </div>

      {!revealing && (
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-rose-400 to-pink-600 transition-[width] duration-200 ease-linear"
            style={{ width: `${Math.min(100, (left / (ANSWER_SECONDS * 1000)) * 100)}%` }}
          />
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {question.a.map((option, i) => {
          const picked = mine === i;
          const right = revealing && state.answer === i;
          const who = revealing ? Object.keys(state.guesses).filter((g) => state.guesses[g] === i) : [];
          return (
            <button
              key={option}
              onClick={() => choose(i)}
              disabled={!canChoose}
              className={`flex min-h-14 items-center gap-2 rounded-xl border px-4 py-3 text-left transition ${
                right
                  ? "border-emerald-400 bg-emerald-500/15 shadow-[0_0_20px_rgba(52,211,153,0.3)]"
                  : picked
                    ? "border-rose-400 bg-rose-500/15 shadow-[0_0_18px_rgba(251,113,133,0.35)]"
                    : revealing
                      ? "border-slate-800 bg-slate-950/30 opacity-60"
                      : "border-slate-700 bg-slate-950/40 hover:border-slate-500"
              }`}
            >
              <span className="flex-1 font-medium text-slate-100">{option}</span>
              {right && <Check className="h-5 w-5 text-emerald-300" />}
              {who.length > 0 && (
                <span className="flex -space-x-1.5">
                  {who.map((id) => (
                    <Avatar key={id} state={state} id={id} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!revealing ? (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            {state.answer >= 0 ? <Lock className="h-3.5 w-3.5 text-emerald-400" /> : null}
            {state.answer >= 0 ? `${isProtagonist ? "Ya elegiste" : `${protName} ya eligió`}` : `${isProtagonist ? "Falta tu respuesta" : `${protName} está pensando…`}`}
          </span>
          <span>
            Adivinaron {guessed} de {guessers.length}
          </span>
        </div>
      ) : (
        <RevealFooter
          state={state}
          myId={myId}
          last={state.turnNo + 1 >= total}
          onNext={() => nextTurn(roomId, state.turnNo, total)}
        />
      )}
    </div>
  );
}

function RevealFooter({
  state,
  myId,
  last,
  onNext,
}: {
  state: ConocesState;
  myId: string;
  last: boolean;
  onNext: () => void;
}) {
  const protagonist = protagonistOf(state);
  const right = Object.keys(state.guesses).filter((g) => g !== protagonist && state.guesses[g] === state.answer);
  const myGuess = state.guesses[myId];
  const message =
    state.answer < 0
      ? `${nameOf(state, protagonist, myId)} no llegó a contestar.`
      : protagonist === myId
        ? right.length === 0
          ? "Nadie te adivinó. ¡Sos un misterio!"
          : `Te adivinaron ${right.length}: +${right.length} para vos.`
        : myGuess === undefined
          ? `${right.length} ${right.length === 1 ? "adivinó" : "adivinaron"}.`
          : myGuess === state.answer
            ? "¡Adivinaste! +1 para vos y +1 para quien contestó."
            : "Esta vez no le acertaste.";
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-slate-300">{message}</p>
      <button onClick={onNext} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
        {last ? "Ver resultados" : "Siguiente pregunta"}
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
  state: ConocesState;
  myId: string;
  canAgain: boolean;
  onAgain: () => void;
}) {
  // For each protagonist, who guessed them right the most.
  const bestFriends = state.order
    .map((p) => {
      let best = "";
      let n = 0;
      for (const [k, v] of Object.entries(state.hits)) {
        const [prot, guesser] = k.split("__");
        if (prot === p && v > n) {
          best = guesser;
          n = v;
        }
      }
      return { p, best, n };
    })
    .filter((x) => x.best);

  return (
    <GameResults
      ranking={rankFrom(state.players, state.scores)}
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
    >
      {bestFriends.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Quién conoce mejor a quién</p>
          <ul className="flex flex-col gap-1 text-sm text-slate-300">
            {bestFriends.map(({ p, best, n }) => (
              <li key={p}>
                <span className="font-semibold" style={{ color: state.players[best]?.color }}>
                  {best === myId ? "Vos" : nameOf(state, best, myId)}
                </span>{" "}
                {best === myId ? "conocés" : "conoce"} a{" "}
                <span className="font-semibold" style={{ color: state.players[p]?.color }}>
                  {nameOf(state, p, myId)}
                </span>{" "}
                ({n} {n === 1 ? "acierto" : "aciertos"})
              </li>
            ))}
          </ul>
        </div>
      )}
    </GameResults>
  );
}

function Scoreboard({ state, presence, myId }: { state: ConocesState; presence: PresenceMap; myId: string }) {
  const rows = Object.keys(state.players)
    .filter((id) => id in presence || (state.scores[id] ?? 0) > 0)
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
            <span className="w-8 text-right font-mono text-slate-200">{state.scores[id] ?? 0}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-slate-800 pt-2 text-xs text-slate-500">
        Cada acierto suma 1 para quien adivina y 1 para quien contestó.
      </p>
    </aside>
  );
}
