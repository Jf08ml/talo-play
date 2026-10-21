"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  REVEAL_MS,
  categoryInfo,
  getTriviaMeta,
  joinTrivia,
  nextQuestion,
  normalizeMeta,
  pickQuestions,
  questionView,
  restartTrivia,
  revealAnswer,
  startTrivia,
  submitAnswer,
  subscribeTrivia,
  type TriviaState,
} from "@/lib/trivia";
import type { TriviaCategory } from "@/lib/triviaQuestions";
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
import GameResults, { rankFrom } from "@/components/Results";
import { useCountdownTicks, useSoundOn } from "@/hooks/useSound";

type Status = "loading" | "not-found" | "ready" | "error";
type Config = { questionCount: number; seconds: number; categories: TriviaCategory[]; hostId: string };

const OPTION_STYLE = [
  { letter: "A", color: "#ef4444" },
  { letter: "B", color: "#3b82f6" },
  { letter: "C", color: "#eab308" },
  { letter: "D", color: "#22c55e" },
];

export default function TriviaClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [state, setState] = useState<TriviaState | null>(null);

  const myId = identity.clientId;
  // The reveal: right or wrong for me.
  useSoundOn(state?.status === "reveal" ? state.qNo : null, state?.answers[myId]?.choice === 0 ? "good" : "bad");
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getTriviaMeta>>>>(
      roomId,
      (meta) => {
        if (cancelled) return;
        setRoomMeta(meta);
        if (!meta) return setStatus("not-found");
        if (meta.game !== "trivia") return router.replace(`/sala/${roomId}`);
        setConfig({ ...normalizeMeta(meta), hostId: meta.hostId ?? "" });
        unsub ??= subscribeTrivia(roomId, setState);
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
    joinTrivia(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const seed = state?.seed;
  const questions = useMemo(
    () => (seed !== undefined && config ? pickQuestions(seed, config.categories, config.questionCount) : []),
    [seed, config]
  );
  const total = questions.length;

  const phase = state?.status;
  const now = useServerNow(phase === "question" || phase === "reveal", 200);
  const seconds = config?.seconds ?? 20;
  const startedAt = state?.phaseStartedAt ?? 0;
  const deadline = phase === "question" ? startedAt + seconds * 1000 : startedAt + REVEAL_MS;
  const expired = now > 0 && startedAt > 0 && now >= deadline;

  // Phase timeouts. Every client runs these; each transaction is guarded by
  // the question number, so it applies only once.
  const qNo = state?.qNo ?? 0;
  useEffect(() => {
    if (phase === "question" && expired) revealAnswer(roomId, qNo).catch(console.error);
    else if (phase === "reveal" && expired) nextQuestion(roomId, qNo, total).catch(console.error);
  }, [phase, expired, roomId, qNo, total]);

  if (!configured) return <FirebaseSetupNotice />;

  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  const answer = (choice: number) => {
    if (!state || state.status !== "question" || state.answers[myId]) return;
    submitAnswer(roomId, state.qNo, myId, choice, seconds, Math.max(1, connected.length)).catch(console.error);
  };

  const categoriesLabel =
    config && config.categories.length < 6
      ? config.categories.map((c) => categoryInfo(c).label).join(", ")
      : "todas las categorías";

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="trivia"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="trivia" />
        )}

        {status === "loading" && <RoomLoading text="Barajando las preguntas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="trivia"
              roomId={roomId}
              hostId={config.hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`${total} preguntas · ${config.seconds} s cada una · ${categoriesLabel}`}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              onStart={() => startTrivia(roomId)}
            />
          </div>
        )}

        {status === "ready" && state && config && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {state.status === "finished" ? (
                <>
                  <FinishedView state={state} myId={myId} onRestart={() => restartTrivia(roomId, state.gameNo)} />
                  <BackToRoomButton roomId={roomId} stateKey="trivia/state" hostId={config.hostId} presence={presence} myId={myId} />
                </>
              ) : questions[state.qNo] !== undefined ? (
                <QuestionView
                  state={state}
                  myId={myId}
                  questionIndex={questions[state.qNo]}
                  total={total}
                  seconds={seconds}
                  now={now}
                  presence={presence}
                  onAnswer={answer}
                />
              ) : null}
            </div>
            <Scoreboard state={state} presence={presence} myId={myId} />
          </div>
        )}
      </main>
    </div>
  );
}

function QuestionView({
  state,
  myId,
  questionIndex,
  total,
  seconds,
  now,
  presence,
  onAnswer,
}: {
  state: TriviaState;
  myId: string;
  questionIndex: number;
  total: number;
  seconds: number;
  now: number;
  presence: PresenceMap;
  onAnswer: (choice: number) => void;
}) {
  const { question, order } = questionView(state.seed, questionIndex);
  const cat = categoryInfo(question.cat);
  const revealing = state.status === "reveal";
  const mine = state.answers[myId];
  const countdown = state.status === "question" && (now === 0 || now < state.phaseStartedAt);
  // Ticks for the 3-2-1 and the last seconds, until I answer.
  useCountdownTicks(
    now === 0 || revealing || (mine && !countdown)
      ? null
      : Math.ceil(((countdown ? state.phaseStartedAt : state.phaseStartedAt + seconds * 1000) - now) / 1000)
  );

  if (countdown) {
    return (
      <div className={`${CARD} flex flex-col items-center gap-3 py-12 text-center`}>
        <p className="text-sm uppercase tracking-wide text-slate-500">
          Pregunta {state.qNo + 1} de {total}
        </p>
        <p className="text-lg font-semibold" style={{ color: cat.color }}>
          {cat.emoji} {cat.label}
        </p>
        <span
          key={Math.ceil((state.phaseStartedAt - now) / 1000)}
          className="animate-celebration-in font-display text-8xl font-bold text-white drop-shadow-[0_0_25px_rgba(168,85,247,0.8)]"
        >
          {now ? Math.max(1, Math.ceil((state.phaseStartedAt - now) / 1000)) : ""}
        </span>
      </div>
    );
  }

  const left = revealing ? 0 : Math.max(0, state.phaseStartedAt + seconds * 1000 - now);
  const answeredCount = Object.keys(state.answers).length;
  const waitingFor = Object.keys(state.players).filter((id) => id in presence).length;

  return (
    <div className="flex flex-col gap-4">
      <div className={`${CARD} flex flex-col gap-3`}>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span
            className="rounded-full px-2.5 py-0.5 font-medium"
            style={{ backgroundColor: `${cat.color}22`, color: cat.color }}
          >
            {cat.emoji} {cat.label}
          </span>
          <span className="text-slate-500">
            {state.qNo + 1} / {total}
          </span>
        </div>
        <h2 className="font-display text-xl font-semibold leading-snug text-slate-100 sm:text-2xl">{question.q}</h2>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-200 ease-linear"
            style={{ width: `${(left / (seconds * 1000)) * 100}%` }}
          />
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {order.map((choice, k) => {
          const style = OPTION_STYLE[k];
          const isRight = choice === 0;
          const chosen = mine?.choice === choice;
          const pickers = revealing
            ? Object.entries(state.answers).filter(([, a]) => a.choice === choice).map(([id]) => id)
            : [];
          const dim = revealing ? !isRight && !chosen : !!mine && !chosen;
          return (
            <button
              key={choice}
              onClick={() => onAnswer(choice)}
              disabled={revealing || !!mine}
              className={`flex min-h-16 items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition ${
                dim ? "opacity-40" : ""
              } ${!revealing && !mine ? "hover:-translate-y-0.5 hover:brightness-110" : ""}`}
              style={{
                borderColor: revealing && isRight ? "#10b981" : chosen ? "#fff" : `${style.color}aa`,
                backgroundColor: revealing && isRight ? "#10b98133" : revealing && chosen ? "#ef444433" : `${style.color}1f`,
                boxShadow: revealing && isRight ? "0 0 22px rgba(16,185,129,0.45)" : undefined,
              }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-white"
                style={{ backgroundColor: style.color }}
              >
                {revealing && isRight ? "✓" : revealing && chosen ? "✗" : style.letter}
              </span>
              <span className="flex-1 font-medium text-slate-100">{question.a[choice]}</span>
              {pickers.length > 0 && (
                <span className="flex -space-x-1.5">
                  {pickers.map((id) => (
                    <span
                      key={id}
                      title={state.players[id]?.name}
                      className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-900 text-[10px] font-bold text-white"
                      style={{ backgroundColor: state.players[id]?.color }}
                    >
                      {state.players[id]?.name.slice(0, 1).toUpperCase()}
                    </span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-center text-sm text-slate-400">
        {revealing
          ? mine
            ? mine.points > 0
              ? `✓ ¡Bien! +${mine.points} puntos`
              : `✗ Era «${question.a[0]}»`
            : `No llegaste a contestar. Era «${question.a[0]}».`
          : mine
            ? `Respondiste. Esperando a los demás (${answeredCount}/${waitingFor})…`
            : "¡Rápido! Cuanto antes contestes, más puntos."}
      </p>
    </div>
  );
}

function ranked(state: TriviaState): string[] {
  return Object.keys(state.players).sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0));
}

function Scoreboard({ state, presence, myId }: { state: TriviaState; presence: PresenceMap; myId: string }) {
  const rows = ranked(state).filter((id) => id in presence || (state.scores[id] ?? 0) > 0);
  return (
    <aside className={`${CARD} !p-4 w-full lg:w-72`}>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Puntos</h2>
      <ol className="flex flex-col gap-1.5 text-sm">
        {rows.map((id, i) => {
          const a = state.answers[id];
          return (
            <li key={id} className={`flex items-center gap-2 ${id in presence ? "" : "opacity-40"}`}>
              <span className="w-5 text-slate-500">{i + 1}.</span>
              <span className="flex-1 truncate" style={{ color: state.players[id]?.color }}>
                {id === myId ? "Vos" : (state.players[id]?.name ?? "?")}
              </span>
              {state.status === "question" && a && <span className="text-xs text-slate-500">✓ respondió</span>}
              {state.status === "reveal" && a && a.points > 0 && (
                <span className="text-xs font-semibold text-emerald-400">+{a.points}</span>
              )}
              <span className="w-14 text-right font-mono text-slate-200">{state.scores[id] ?? 0}</span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function FinishedView({ state, myId, onRestart }: { state: TriviaState; myId: string; onRestart: () => void }) {
  return (
    <GameResults
      ranking={rankFrom(state.players, state.scores, ranked(state))}
      myId={myId}
      actions={
        <button onClick={onRestart} className={`w-full ${PRIMARY_BUTTON}`}>
          Jugar de nuevo
        </button>
      }
    />
  );
}
