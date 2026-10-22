"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  REVEAL_MS,
  answerHint,
  categoryInfo,
  checkAnswer,
  getEmojisMeta,
  joinEmojis,
  nextQuestion,
  normalizeMeta,
  pickPuzzles,
  restartEmojis,
  revealAnswer,
  startEmojis,
  submitSolved,
  subscribeEmojis,
  type EmojisState,
} from "@/lib/emojis";
import { EMOJI_CATEGORIES, EMOJI_PUZZLES, type EmojiCategory } from "@/lib/emojiPuzzles";
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
import { CARD, PRIMARY_BUTTON, TEXT_INPUT } from "@/components/ui";
import GameResults, { rankFrom } from "@/components/Results";
import { useCountdownTicks, useSoundOn } from "@/hooks/useSound";

type Status = "loading" | "not-found" | "ready" | "error";
type Config = { questionCount: number; seconds: number; categories: EmojiCategory[]; hostId: string };

export default function EmojisClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [state, setState] = useState<EmojisState | null>(null);

  const myId = identity.clientId;
  useSoundOn(state ? Object.keys(state.solved).length : null, state?.solved[myId] ? "good" : "flip");
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getEmojisMeta>>>>(
      roomId,
      (meta) => {
        if (cancelled) return;
        setRoomMeta(meta);
        if (!meta) return setStatus("not-found");
        if (meta.game !== "emojis") return router.replace(`/sala/${roomId}`);
        setConfig({ ...normalizeMeta(meta), hostId: meta.hostId ?? "" });
        unsub ??= subscribeEmojis(roomId, setState);
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
    joinEmojis(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const seed = state?.seed;
  const puzzles = useMemo(
    () => (seed !== undefined && config ? pickPuzzles(seed, config.categories, config.questionCount) : []),
    [seed, config]
  );
  const total = puzzles.length;

  const phase = state?.status;
  const now = useServerNow(phase === "question" || phase === "reveal", 200);
  const seconds = config?.seconds ?? 45;
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
  const categoriesLabel =
    config && config.categories.length < EMOJI_CATEGORIES.length
      ? config.categories.map((c) => categoryInfo(c).label).join(", ")
      : "todas las categorías";

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="emojis"
        roomId={roomId}
        chatLocked={phase === "question" && "El chat vuelve cuando se revele la respuesta."}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="emojis" />
        )}

        {status === "loading" && <RoomLoading text="Eligiendo los emojis…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="emojis"
              roomId={roomId}
              hostId={config.hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`${total} acertijos · ${config.seconds} s cada uno · ${categoriesLabel}`}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              onStart={() => startEmojis(roomId)}
            />
          </div>
        )}

        {status === "ready" && state && config && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {state.status === "finished" ? (
                <>
                  <FinishedView state={state} myId={myId} onRestart={() => restartEmojis(roomId, state.gameNo)} />
                  <BackToRoomButton roomId={roomId} stateKey="emojis/state" hostId={config.hostId} presence={presence} myId={myId} />
                </>
              ) : puzzles[state.qNo] !== undefined ? (
                <PuzzleView
                  key={`${state.gameNo}-${state.qNo}`}
                  roomId={roomId}
                  state={state}
                  myId={myId}
                  puzzleIndex={puzzles[state.qNo]}
                  total={total}
                  seconds={seconds}
                  now={now}
                  solversNeeded={Math.max(1, connected.length)}
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

function PuzzleView({
  roomId,
  state,
  myId,
  puzzleIndex,
  total,
  seconds,
  now,
  solversNeeded,
}: {
  roomId: string;
  state: EmojisState;
  myId: string;
  puzzleIndex: number;
  total: number;
  seconds: number;
  now: number;
  solversNeeded: number;
}) {
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "close" | "wrong"; tries: number } | null>(null);
  const puzzle = EMOJI_PUZZLES[puzzleIndex];
  const cat = categoryInfo(puzzle.cat);
  const revealing = state.status === "reveal";
  const mine = state.solved[myId];
  const countdown = state.status === "question" && (now === 0 || now < state.phaseStartedAt);
  // Ticks for the 3-2-1 and the last seconds, until I solve it.
  useCountdownTicks(
    now === 0 || revealing || (mine && !countdown)
      ? null
      : Math.ceil(((countdown ? state.phaseStartedAt : state.phaseStartedAt + seconds * 1000) - now) / 1000)
  );

  if (countdown) {
    return (
      <div className={`${CARD} flex flex-col items-center gap-3 py-12 text-center`}>
        <p className="text-sm uppercase tracking-wide text-slate-500">
          Acertijo {state.qNo + 1} de {total}
        </p>
        <span
          key={Math.ceil((state.phaseStartedAt - now) / 1000)}
          className="animate-celebration-in font-display text-8xl font-bold text-white drop-shadow-[0_0_25px_rgba(250,204,21,0.7)]"
        >
          {now ? Math.max(1, Math.ceil((state.phaseStartedAt - now) / 1000)) : ""}
        </span>
      </div>
    );
  }

  const left = revealing ? 0 : Math.max(0, state.phaseStartedAt + seconds * 1000 - now);
  const halfway = left <= (seconds * 1000) / 2;
  const solvedCount = Object.keys(state.solved).length;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || mine !== undefined || revealing) return;
    const result = checkAnswer(text, puzzle);
    if (result === "correct") {
      submitSolved(roomId, state.qNo, myId, seconds, solversNeeded).catch(console.error);
      setFeedback(null);
    } else {
      setFeedback((f) => ({ kind: result, tries: (f?.tries ?? 0) + 1 }));
    }
    setText("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={`${CARD} flex flex-col items-center gap-4 text-center`}>
        <div className="flex w-full items-center justify-between gap-2 text-sm">
          <span className="rounded-full bg-amber-400/15 px-2.5 py-0.5 font-medium text-amber-200">
            {cat.emoji} {cat.label}
          </span>
          <span className="text-slate-500">
            {state.qNo + 1} / {total}
          </span>
        </div>
        <p className="animate-celebration-in text-6xl leading-tight tracking-widest sm:text-7xl">{puzzle.e}</p>
        <p className="font-mono text-base tracking-wider text-slate-400 sm:text-lg">
          {revealing ? <span className="font-sans font-semibold tracking-normal text-emerald-300">{puzzle.a}</span> : answerHint(puzzle.a, halfway)}
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 transition-[width] duration-200 ease-linear"
            style={{ width: `${(left / (seconds * 1000)) * 100}%` }}
          />
        </div>
      </div>

      {!revealing && mine === undefined && (
        <form onSubmit={submit} className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={80}
              placeholder="¿Qué es?"
              className={`min-w-0 flex-1 ${TEXT_INPUT} ${feedback ? "animate-shake" : ""}`}
              key={feedback?.tries ?? 0}
            />
            <button type="submit" disabled={!text.trim()} className={`px-5 ${PRIMARY_BUTTON}`}>
              Probar
            </button>
          </div>
          {feedback && (
            <p className={`text-center text-sm ${feedback.kind === "close" ? "text-amber-300" : "text-slate-500"}`}>
              {feedback.kind === "close" ? "¡Casi! Estás muy cerca." : "No es eso. Probá de nuevo."}
            </p>
          )}
        </form>
      )}

      <p className="text-center text-sm text-slate-400">
        {revealing
          ? mine !== undefined
            ? `✓ ¡Bien! +${mine} puntos`
            : `Era «${puzzle.a}».`
          : mine !== undefined
            ? `✓ ¡Adivinaste! +${mine}. Esperando a los demás (${solvedCount}/${solversNeeded})…`
            : halfway
              ? "Pista: ya se ve la primera letra de cada palabra."
              : "Escribí rápido: cuanto antes, más puntos."}
      </p>
    </div>
  );
}

function ranked(state: EmojisState): string[] {
  return Object.keys(state.players).sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0));
}

function Scoreboard({ state, presence, myId }: { state: EmojisState; presence: PresenceMap; myId: string }) {
  const rows = ranked(state).filter((id) => id in presence || (state.scores[id] ?? 0) > 0);
  return (
    <aside className={`${CARD} !p-4 w-full lg:w-72`}>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Puntos</h2>
      <ol className="flex flex-col gap-1.5 text-sm">
        {rows.map((id, i) => {
          const pts = state.solved[id];
          return (
            <li key={id} className={`flex items-center gap-2 ${id in presence ? "" : "opacity-40"}`}>
              <span className="w-5 text-slate-500">{i + 1}.</span>
              <span className="flex-1 truncate" style={{ color: state.players[id]?.color }}>
                {id === myId ? "Vos" : (state.players[id]?.name ?? "?")}
              </span>
              {pts !== undefined && <span className="text-xs font-semibold text-emerald-400">+{pts}</span>}
              <span className="w-14 text-right font-mono text-slate-200">{state.scores[id] ?? 0}</span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function FinishedView({ state, myId, onRestart }: { state: EmojisState; myId: string; onRestart: () => void }) {
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
