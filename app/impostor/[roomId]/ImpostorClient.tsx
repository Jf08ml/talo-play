"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  CLUE_SECONDS,
  GUESS_SECONDS,
  MAX_CLUE_LENGTH,
  MIN_PLAYERS,
  VOTE_SECONDS,
  castVote,
  closeVote,
  clueProblem,
  getImpostorMeta,
  giveClue,
  goToVote,
  guessMatches,
  guessTimeout,
  joinImpostor,
  nextRound,
  normalizeMeta,
  secretFor,
  speakerFor,
  startImpostor,
  submitGuess,
  subscribeImpostor,
  tally,
  type ImpostorMeta,
  type ImpostorState,
} from "@/lib/impostor";
import { IMPOSTOR_CATEGORIES } from "@/lib/impostorWords";
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
import { Eye, EyeOff } from "lucide-react";
import { useTurnAlert } from "@/hooks/useTurnAlert";

type Status = "loading" | "not-found" | "ready" | "error";
type Config = Pick<ImpostorMeta, "categories" | "clueMode" | "clueRounds" | "impostorHint"> & { hostId: string };

export default function ImpostorClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [state, setState] = useState<ImpostorState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  // Presence starts empty: only trust "X isn't here" once I see myself in it.
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getImpostorMeta>>>>(
      roomId,
      (meta) => {
        if (cancelled) return;
        setRoomMeta(meta);
        if (!meta) return setStatus("not-found");
        if (meta.game !== "impostor") return router.replace(`/sala/${roomId}`);
        setConfig({ ...normalizeMeta(meta), hostId: meta.hostId ?? "" });
        unsub ??= subscribeImpostor(roomId, setState);
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
    joinImpostor(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const phase = state?.status;
  const appClues = config?.clueMode === "app";
  const timed = (phase === "clues" && appClues) || phase === "voting" || phase === "guess";
  const now = useServerNow(timed);
  const phaseSeconds = phase === "clues" ? CLUE_SECONDS : phase === "voting" ? VOTE_SECONDS : GUESS_SECONDS;
  const deadline = (state?.phaseStartedAt ?? 0) + phaseSeconds * 1000;
  const expired = timed && now > 0 && now >= deadline;

  // Timeouts and absent players. Every client runs these; each transaction is
  // guarded by the round (and clue) number, so it applies only once.
  const roundNo = state?.roundNo ?? 0;
  const clueNo = state?.clues.length ?? 0;
  const totalClues = (state?.order.length ?? 0) * (config?.clueRounds ?? 1);
  const speaker = state ? speakerFor(state, clueNo) : "";
  const speakerGone = presenceLoaded && !!speaker && !(speaker in presence);
  const impostor = state?.impostor ?? "";
  const impostorGone = presenceLoaded && !!impostor && !(impostor in presence);
  useEffect(() => {
    if (phase === "clues" && appClues && (expired || speakerGone)) {
      giveClue(roomId, clueNo, speaker, "", totalClues).catch(console.error);
    } else if (phase === "voting" && expired) closeVote(roomId, roundNo).catch(console.error);
    else if (phase === "guess" && (expired || impostorGone)) guessTimeout(roomId, roundNo).catch(console.error);
  }, [phase, appClues, expired, speakerGone, impostorGone, roomId, clueNo, speaker, totalClues, roundNo]);

  if (!configured) return <FirebaseSetupNotice />;

  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  const inRound = !!state?.order.includes(myId);
  const secret = state && config ? secretFor(state.seed, config.categories) : null;
  const left = Math.max(0, deadline - now);

  const categoriesLabel =
    config && config.categories.length < IMPOSTOR_CATEGORIES.length
      ? config.categories.map((c) => IMPOSTOR_CATEGORIES.find((x) => x.id === c)?.label).join(", ")
      : "todas las categorías";

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="impostor"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="impostor" />
        )}

        {status === "loading" && <RoomLoading text="Repartiendo las cartas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="impostor"
              roomId={roomId}
              hostId={config.hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`${config.clueMode === "app" ? `${config.clueRounds} ${config.clueRounds === 1 ? "vuelta" : "vueltas"} de pistas en la app` : "Pistas en voz alta"} · ${categoriesLabel}`}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              minToStart={MIN_PLAYERS}
              onStart={() => startImpostor(roomId, connected)}
            />
          </div>
        )}

        {status === "ready" && state && config && secret && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {!inRound && state.status !== "result" && (
                <p className={`${CARD} !p-3 text-center text-sm text-slate-300`}>
                  Llegaste con la ronda empezada: mirá cómo juegan y entrás en la próxima.
                </p>
              )}

              {inRound && state.status !== "result" && (
                <SecretCard
                  key={state.roundNo}
                  isImpostor={state.impostor === myId}
                  word={secret.word}
                  category={`${secret.emoji} ${secret.category}`}
                  hint={config.impostorHint}
                />
              )}

              {state.status === "clues" &&
                (appClues ? (
                  <CluesPanel
                    roomId={roomId}
                    state={state}
                    myId={myId}
                    word={secret.word}
                    isImpostor={state.impostor === myId}
                    totalClues={totalClues}
                    left={left}
                  />
                ) : (
                  <SpokenClues roomId={roomId} state={state} myId={myId} />
                ))}

              {state.status !== "clues" && appClues && state.clues.length > 0 && state.status !== "result" && (
                <ClueList state={state} myId={myId} />
              )}

              {state.status === "voting" && (
                <VotePanel roomId={roomId} state={state} myId={myId} presence={presence} left={left} />
              )}

              {state.status === "guess" && (
                <GuessPanel roomId={roomId} state={state} myId={myId} word={secret.word} left={left} />
              )}

              {state.status === "result" && (
                <ResultPanel
                  state={state}
                  myId={myId}
                  word={secret.word}
                  canNext={connected.length >= MIN_PLAYERS}
                  onNext={() => nextRound(roomId, state.roundNo, connected)}
                />
              )}
              {state.status === "result" && (
                <BackToRoomButton roomId={roomId} stateKey="impostor/state" hostId={config.hostId} presence={presence} myId={myId} />
              )}
              {state.status === "result" && appClues && state.clues.length > 0 && <ClueList state={state} myId={myId} />}
            </div>

            <Scoreboard state={state} presence={presence} myId={myId} />
          </div>
        )}
      </main>
    </div>
  );
}

function nameOf(state: ImpostorState, id: string, myId: string): string {
  return id === myId ? "vos" : (state.players[id]?.name ?? "?");
}

function TimeBar({ left, total }: { left: number; total: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
      <div
        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-200 ease-linear"
        style={{ width: `${Math.min(100, (left / (total * 1000)) * 100)}%` }}
      />
    </div>
  );
}

/** My card, hidden until tapped so nobody peeks at my screen. */
function SecretCard({
  isImpostor,
  word,
  category,
  hint,
}: {
  isImpostor: boolean;
  word: string;
  category: string;
  hint: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <button
      onClick={() => setShown((v) => !v)}
      className={`flex flex-col items-center gap-1.5 rounded-2xl border p-5 text-center transition ${
        shown && isImpostor
          ? "border-rose-500/50 bg-rose-950/40 shadow-[0_0_30px_rgba(244,63,94,0.25)]"
          : "border-violet-500/30 bg-slate-900/70 shadow-[0_0_25px_rgba(139,92,246,0.15)]"
      }`}
    >
      {shown ? (
        isImpostor ? (
          <>
            <span className="font-display text-2xl font-bold text-rose-300">🤫 Sos el impostor</span>
            <span className="text-sm text-slate-400">
              {hint ? `La palabra es de: ${category}. ` : ""}Disimulá y descubrí cuál es.
            </span>
          </>
        ) : (
          <>
            <span className="text-xs uppercase tracking-wide text-slate-500">La palabra es</span>
            <span className="font-display text-3xl font-bold text-slate-100">{word}</span>
            <span className="text-sm text-slate-400">{category}</span>
          </>
        )
      ) : (
        <span className="font-display text-lg font-semibold text-slate-200">Tocá para ver tu carta</span>
      )}
      <span className="mt-1 flex items-center gap-1 text-xs text-slate-500">
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {shown ? "Tocá para esconderla" : "Que nadie mire tu pantalla"}
      </span>
    </button>
  );
}

function CluesPanel({
  roomId,
  state,
  myId,
  word,
  isImpostor,
  totalClues,
  left,
}: {
  roomId: string;
  state: ImpostorState;
  myId: string;
  word: string;
  isImpostor: boolean;
  totalClues: number;
  left: number;
}) {
  const [text, setText] = useState("");
  const clueNo = state.clues.length;
  const speaker = speakerFor(state, clueNo);
  const myTurn = speaker === myId;
  useTurnAlert(myTurn);
  // The impostor doesn't know the word, so their clue is never checked against it.
  const problem = text.trim() && !isImpostor ? clueProblem(text, word) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!myTurn || !text.trim() || problem) return;
    giveClue(roomId, clueNo, myId, text, totalClues).catch(console.error);
    setText("");
  };

  return (
    <div className={`${CARD} flex flex-col gap-3`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-slate-100">Pistas</h2>
        <span className="text-xs text-slate-500">
          {Math.min(clueNo + 1, totalClues)} de {totalClues}
        </span>
      </div>
      <ClueItems state={state} myId={myId} />
      <TimeBar left={left} total={CLUE_SECONDS} />
      {myTurn ? (
        <form onSubmit={submit} className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-fuchsia-300">¡Te toca! Decí una palabra relacionada.</p>
          <div className="flex gap-2">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_CLUE_LENGTH}
              placeholder="Tu pista"
              className={`min-w-0 flex-1 ${TEXT_INPUT}`}
            />
            <button type="submit" disabled={!text.trim() || problem !== null} className={`px-4 ${PRIMARY_BUTTON}`}>
              Dar pista
            </button>
          </div>
          {problem && <p className="text-xs text-amber-300">{problem}</p>}
        </form>
      ) : (
        <p className="text-sm text-slate-400">
          Turno de{" "}
          <span className="font-semibold" style={{ color: state.players[speaker]?.color }}>
            {nameOf(state, speaker, myId)}
          </span>
          …
        </p>
      )}
    </div>
  );
}

function ClueItems({ state, myId }: { state: ImpostorState; myId: string }) {
  if (state.clues.length === 0) return <p className="text-sm text-slate-500">Todavía no hay pistas.</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {state.clues.map((c, i) => (
        <li
          key={i}
          className="flex items-center gap-1.5 rounded-full bg-slate-800/80 py-1 pl-1 pr-3 text-sm ring-1 ring-slate-700"
        >
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: state.players[c.by]?.color }}
            title={nameOf(state, c.by, myId)}
          >
            {state.players[c.by]?.name.slice(0, 1).toUpperCase()}
          </span>
          {c.text ? <span className="text-slate-100">{c.text}</span> : <span className="italic text-slate-500">pasó</span>}
        </li>
      ))}
    </ul>
  );
}

function ClueList({ state, myId }: { state: ImpostorState; myId: string }) {
  return (
    <div className={`${CARD} !p-4 flex flex-col gap-2`}>
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Pistas</h3>
      <ClueItems state={state} myId={myId} />
    </div>
  );
}

function SpokenClues({ roomId, state, myId }: { roomId: string; state: ImpostorState; myId: string }) {
  return (
    <div className={`${CARD} flex flex-col gap-3`}>
      <h2 className="font-display text-lg font-semibold text-slate-100">Pistas en voz alta</h2>
      <p className="text-sm text-slate-400">
        Cada uno dice una palabra relacionada con la suya, en este orden. Den las vueltas que quieran y después voten.
      </p>
      <ol className="flex flex-col gap-1 text-sm">
        {state.order.map((id, i) => (
          <li key={id} className="flex items-center gap-2">
            <span className="w-5 text-slate-500">{i + 1}.</span>
            <span style={{ color: state.players[id]?.color }}>{nameOf(state, id, myId)}</span>
          </li>
        ))}
      </ol>
      {state.order.includes(myId) && (
        <button onClick={() => goToVote(roomId, state.roundNo, myId)} className={`w-full max-w-xs self-center ${PRIMARY_BUTTON}`}>
          Ir a votar
        </button>
      )}
    </div>
  );
}

function VotePanel({
  roomId,
  state,
  myId,
  presence,
  left,
}: {
  roomId: string;
  state: ImpostorState;
  myId: string;
  presence: PresenceMap;
  left: number;
}) {
  const canVote = state.order.includes(myId);
  const myVote = state.votes[myId];
  const voters = state.order.filter((id) => id in presence);
  const votersNeeded = Math.max(1, voters.length);
  const voted = Object.keys(state.votes).length;

  return (
    <div className={`${CARD} flex flex-col gap-3`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-slate-100">¿Quién es el impostor?</h2>
        <span className="text-xs text-slate-500">
          Votaron {voted} de {voters.length}
        </span>
      </div>
      <TimeBar left={left} total={VOTE_SECONDS} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {state.order.map((id) => {
          const isMe = id === myId;
          const chosen = myVote === id;
          return (
            <button
              key={id}
              onClick={() => castVote(roomId, state.roundNo, myId, id, votersNeeded)}
              disabled={!canVote || isMe}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                chosen
                  ? "border-fuchsia-400 bg-fuchsia-500/15 shadow-[0_0_18px_rgba(217,70,239,0.35)]"
                  : "border-slate-700 bg-slate-950/40 hover:border-slate-500"
              } ${isMe ? "opacity-40" : ""} ${id in presence ? "" : "opacity-50"}`}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: state.players[id]?.color }}
              >
                {state.players[id]?.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-100">{nameOf(state, id, myId)}</span>
              {state.votes[id] && <span title="Ya votó" className="text-xs text-emerald-400">✓</span>}
            </button>
          );
        })}
      </div>
      <p className="text-center text-sm text-slate-400">
        {!canVote
          ? "Están votando…"
          : myVote
            ? "Votaste. Podés cambiar tu voto hasta que voten todos."
            : "Tocá a quien creas que es el impostor."}
      </p>
    </div>
  );
}

function GuessPanel({
  roomId,
  state,
  myId,
  word,
  left,
}: {
  roomId: string;
  state: ImpostorState;
  myId: string;
  word: string;
  left: number;
}) {
  const [text, setText] = useState("");
  const iAmImpostor = state.impostor === myId;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    submitGuess(roomId, state.roundNo, myId, text, guessMatches(text, word)).catch(console.error);
  };

  return (
    <div className={`${CARD} flex flex-col gap-3 text-center`}>
      <p className="font-display text-xl font-semibold text-slate-100">
        {iAmImpostor ? "😱 ¡Te descubrieron!" : `🎯 ¡Descubrieron a ${nameOf(state, state.impostor, myId)}!`}
      </p>
      <p className="text-sm text-slate-400">
        {iAmImpostor
          ? "Última chance: si adivinás la palabra, ganás igual."
          : "Pero todavía puede ganar si adivina la palabra…"}
      </p>
      <TimeBar left={left} total={GUESS_SECONDS} />
      {iAmImpostor && (
        <form onSubmit={submit} className="flex gap-2">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_CLUE_LENGTH}
            placeholder="¿Cuál era la palabra?"
            className={`min-w-0 flex-1 ${TEXT_INPUT}`}
          />
          <button type="submit" disabled={!text.trim()} className={`px-4 ${PRIMARY_BUTTON}`}>
            Arriesgar
          </button>
        </form>
      )}
    </div>
  );
}

function ResultPanel({
  state,
  myId,
  word,
  canNext,
  onNext,
}: {
  state: ImpostorState;
  myId: string;
  word: string;
  canNext: boolean;
  onNext: () => void;
}) {
  const impostorName = nameOf(state, state.impostor, myId);
  const crewWon = state.outcome === "crew";
  const iWon = state.order.includes(myId) && (crewWon ? state.impostor !== myId : state.impostor === myId);
  const reason =
    state.endReason === "caught"
      ? `Lo descubrieron${state.guess ? ` y arriesgó «${state.guess}»` : " y no adivinó la palabra"}.`
      : state.endReason === "guessed"
        ? `Lo descubrieron, pero adivinó la palabra («${state.guess}»).`
        : state.endReason === "tie"
          ? "La votación quedó empatada."
          : `Votaron a ${nameOf(state, state.accused, myId)}, que era inocente.`;

  return (
    <div
      className={`animate-celebration-in flex flex-col items-center gap-3 rounded-2xl border bg-slate-900 p-6 text-center ${
        iWon ? "border-emerald-500/25 shadow-[0_0_40px_rgba(52,211,153,0.2)]" : "border-violet-500/20"
      }`}
    >
      <p className="font-display text-2xl font-semibold text-slate-100">
        {crewWon ? "🕵️ ¡Ganaron los demás!" : "🤫 ¡Ganó el impostor!"}
      </p>
      <p className="text-slate-300">
        El impostor era <span className="font-semibold" style={{ color: state.players[state.impostor]?.color }}>{impostorName}</span>.{" "}
        {reason}
      </p>
      <p className="text-sm text-slate-400">
        La palabra era <span className="font-display text-lg font-bold text-slate-100">{word}</span>
      </p>
      <VoteSummary state={state} myId={myId} />
      {canNext ? (
        <button onClick={onNext} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
          Otra ronda
        </button>
      ) : (
        <p className="text-xs text-amber-300/90">Hacen falta al menos {MIN_PLAYERS} jugadores conectados para otra ronda.</p>
      )}
    </div>
  );
}

function VoteSummary({ state, myId }: { state: ImpostorState; myId: string }) {
  const rows = tally(state.votes);
  if (rows.length === 0) return <p className="text-xs text-slate-500">Nadie votó.</p>;
  return (
    <ul className="flex flex-wrap justify-center gap-1.5 text-xs">
      {rows.map(([id, n]) => (
        <li key={id} className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">
          {nameOf(state, id, myId)}: {n} {n === 1 ? "voto" : "votos"}
          {id === state.impostor && " 🤫"}
        </li>
      ))}
    </ul>
  );
}

function Scoreboard({ state, presence, myId }: { state: ImpostorState; presence: PresenceMap; myId: string }) {
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
              {state.status === "result" && id === state.impostor && " 🤫"}
            </span>
            {!state.order.includes(id) && state.status !== "result" && (
              <span className="text-xs text-slate-500">mirando</span>
            )}
            <span className="w-8 text-right font-mono text-slate-200">{state.scores[id] ?? 0}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-slate-800 pt-2 text-xs text-slate-500">
        Si ganan, cada uno suma 1. Si gana el impostor, suma 2.
      </p>
    </aside>
  );
}
