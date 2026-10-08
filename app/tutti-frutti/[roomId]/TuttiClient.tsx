"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  advanceRound,
  catKey,
  endRound,
  getTuttiMeta,
  joinTutti,
  letterFor,
  MAX_ANSWER_LENGTH,
  restartTutti,
  roundKey,
  saveAnswers,
  scoreRound,
  setReady,
  setVote,
  startsWithLetter,
  startTutti,
  subscribeTutti,
  sumPoints,
  voteKey,
  type AllAnswers,
  type AllVotes,
  type AnswerResult,
  type PlayerAnswers,
  type TuttiMeta,
  type TuttiState,
} from "@/lib/tutti";
import { EASY_LETTERS } from "@/lib/tuttiCategories";
import type { PresenceMap } from "@/lib/presence";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useServerNow } from "@/hooks/useServerNow";
import NamePrompt from "@/components/NamePrompt";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";

type Status = "loading" | "not-found" | "ready" | "error";
type Config = Pick<TuttiMeta, "categories" | "rounds" | "roundSeconds" | "letters">;

const SAVE_DEBOUNCE_MS = 350;

export default function TuttiClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [config, setConfig] = useState<Config | null>(null);
  const [state, setState] = useState<TuttiState | null>(null);
  const [answers, setAnswers] = useState<AllAnswers>({});
  const [votes, setVotes] = useState<AllVotes>({});
  // My answers being typed for round `rk`; `dirty` = not saved yet.
  const [draft, setDraft] = useState<{ rk: string; values: PlayerAnswers; dirty: boolean }>({
    rk: "",
    values: {},
    dirty: false,
  });

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);

  // Load the room's setup, then follow its game state.
  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    getTuttiMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "tutti") return router.replace(`/sala/${roomId}`);
        setConfig({
          categories: meta.categories ?? [],
          rounds: meta.rounds ?? 5,
          roundSeconds: meta.roundSeconds ?? 0,
          letters: meta.letters ?? EASY_LETTERS,
        });
        unsub = subscribeTutti(roomId, (data) => {
          setState(data.state);
          setAnswers(data.answers);
          setVotes(data.votes);
        });
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
    joinTutti(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const rk = state ? roundKey(state) : "";
  const myValues: PlayerAnswers = draft.rk === rk ? draft.values : (answers[rk]?.[myId] ?? {});

  // Save typed answers shortly after the last keystroke. Not cancelled when the
  // round closes, so the last word typed before "¡Basta!" still gets saved.
  useEffect(() => {
    if (!draft.dirty || !draft.rk) return;
    const t = setTimeout(() => {
      saveAnswers(roomId, draft.rk, myId, draft.values).catch(console.error);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, roomId, myId]);

  const letter = state && config ? letterFor(state.seed, config.letters, state.round) : "";

  // Round timer: when it runs out any client closes the round (applies once).
  const writing = state?.status === "writing";
  const deadline = state && config?.roundSeconds ? state.roundStartedAt + config.roundSeconds * 1000 : 0;
  const now = useServerNow(writing && deadline > 0);
  const timeUp = writing && deadline > 0 && now > 0 && now >= deadline;
  const round = state?.round ?? 0;
  useEffect(() => {
    if (timeUp) endRound(roomId, round, "tiempo").catch(console.error);
  }, [timeUp, roomId, round]);

  // Review done: once every connected player is ready, move on (applies once).
  const reviewing = state?.status === "reviewing";
  const onlinePlayers = state ? state.order.filter((id) => id in presence) : [];
  const allReady = reviewing && onlinePlayers.length > 0 && onlinePlayers.every((id) => state!.ready[id]);
  const totalRounds = config?.rounds ?? 0;
  useEffect(() => {
    if (allReady) advanceRound(roomId, round, totalRounds).catch(console.error);
  }, [allReady, roomId, round, totalRounds]);

  // Scores of every closed round, computed locally from answers + votes.
  const results = useMemo(() => {
    if (!state || !config) return [];
    const closed = state.status === "writing" ? state.round : state.round + 1;
    if (state.status === "waiting") return [];
    return Array.from({ length: closed }, (_, r) => {
      const key = roundKey(state, r);
      return scoreRound(
        state.order,
        config.categories.length,
        letterFor(state.seed, config.letters, r),
        answers[key],
        votes[key]
      );
    });
  }, [state, config, answers, votes]);

  if (!configured) return <FirebaseSetupNotice />;

  const setAnswer = (cat: number, value: string) =>
    setDraft({ rk, values: { ...myValues, [catKey(cat)]: value.slice(0, MAX_ANSWER_LENGTH) }, dirty: true });

  const basta = async () => {
    if (!state) return;
    await saveAnswers(roomId, rk, myId, myValues);
    setDraft((d) => ({ ...d, dirty: false }));
    await endRound(roomId, state.round, myId);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="tutti"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" />
        )}

        {status === "loading" && <RoomLoading text="Repartiendo las hojas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              {state.status === "waiting" && (
                <div className={`${CARD} flex flex-col items-center gap-3 text-center`}>
                  <p className="font-display text-lg font-semibold text-slate-100">Esperando jugadores…</p>
                  <p className="text-sm text-slate-400">
                    {config.rounds} rondas · {config.categories.length} categorías
                    {config.roundSeconds ? ` · ${config.roundSeconds} s por ronda` : ""}. Compartí el enlace;
                    cuando estén todos, cualquiera puede arrancar.
                  </p>
                  <p className="text-xs text-slate-500">{config.categories.join(" · ")}</p>
                  <button onClick={() => startTutti(roomId)} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
                    Empezar partida
                  </button>
                </div>
              )}

              {state.status === "writing" && (
                <WritingView
                  state={state}
                  config={config}
                  letter={letter}
                  values={myValues}
                  onChange={setAnswer}
                  onBasta={basta}
                  roundAnswers={answers[rk] ?? {}}
                  myId={myId}
                  secondsLeft={deadline && now ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null}
                />
              )}

              {state.status === "reviewing" && results[state.round] && (
                <ReviewView
                  state={state}
                  config={config}
                  letter={letter}
                  results={results[state.round]}
                  roundVotes={votes[rk] ?? {}}
                  presence={presence}
                  myId={myId}
                  onVote={(author, cat, reject) => setVote(roomId, rk, author, cat, myId, reject)}
                  onReady={(ready) => setReady(roomId, myId, ready)}
                />
              )}

              {state.status === "finished" && (
                <FinishedView state={state} results={results} myId={myId} onRestart={() => restartTutti(roomId)} />
              )}
            </div>

            <Scoreboard state={state} results={results} presence={presence} myId={myId} />
          </div>
        )}
      </main>
    </div>
  );
}

function LetterBadge({ letter }: { letter: string }) {
  return (
    <div className="animate-glow-pulse flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 font-display text-5xl font-bold text-white">
      {letter}
    </div>
  );
}

function WritingView({
  state,
  config,
  letter,
  values,
  onChange,
  onBasta,
  roundAnswers,
  myId,
  secondsLeft,
}: {
  state: TuttiState;
  config: Config;
  letter: string;
  values: PlayerAnswers;
  onChange: (cat: number, value: string) => void;
  onBasta: () => void;
  roundAnswers: Record<string, PlayerAnswers>;
  myId: string;
  secondsLeft: number | null;
}) {
  const filled = config.categories.filter((_, i) => values[catKey(i)]?.trim()).length;
  const complete = filled === config.categories.length;

  return (
    <div className="flex flex-col gap-4">
      <div className={`${CARD} flex items-center gap-4`}>
        <LetterBadge letter={letter} />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Ronda {state.round + 1} de {config.rounds}
          </p>
          <p className="font-display text-lg font-semibold text-slate-100">Todo con la {letter}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
            {state.order
              .filter((id) => id !== myId)
              .map((id) => {
                const n = config.categories.filter((_, i) => roundAnswers[id]?.[catKey(i)]?.trim()).length;
                return (
                  <span key={id} style={{ color: state.players[id]?.color }}>
                    ✍ {state.players[id]?.name ?? "?"} {n}/{config.categories.length}
                  </span>
                );
              })}
          </div>
        </div>
        {secondsLeft !== null && (
          <span
            className={`rounded-lg px-3 py-1 font-mono text-xl ${
              secondsLeft <= 10 ? "bg-red-500/15 text-red-300" : "bg-slate-800 text-slate-200"
            }`}
          >
            {secondsLeft}s
          </span>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (complete) onBasta();
        }}
        className={`${CARD} flex flex-col gap-2.5`}
      >
        {config.categories.map((cat, i) => {
          const value = values[catKey(i)] ?? "";
          const wrong = value.trim() !== "" && !startsWithLetter(value, letter);
          return (
            <label key={i} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-sm font-medium text-slate-300 sm:w-40 sm:shrink-0">{cat}</span>
              <input
                value={value}
                onChange={(e) => onChange(i, e.target.value)}
                placeholder={`${letter}…`}
                maxLength={MAX_ANSWER_LENGTH}
                autoComplete="off"
                autoFocus={i === 0}
                className={`min-w-0 flex-1 rounded-lg border bg-slate-950/60 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-600 focus:ring-2 ${
                  wrong
                    ? "border-amber-400/60 focus:ring-amber-400/30"
                    : "border-slate-700 focus:border-violet-500 focus:ring-violet-500/30"
                }`}
              />
            </label>
          );
        })}
        <button type="submit" disabled={!complete} className={`mt-2 text-lg ${PRIMARY_BUTTON}`}>
          {complete ? "✋ ¡Basta!" : `Completá todo para decir ¡Basta! (${filled}/${config.categories.length})`}
        </button>
      </form>
    </div>
  );
}

function ReviewView({
  state,
  config,
  letter,
  results,
  roundVotes,
  presence,
  myId,
  onVote,
  onReady,
}: {
  state: TuttiState;
  config: Config;
  letter: string;
  results: Record<string, AnswerResult[]>;
  roundVotes: Record<string, Record<string, boolean>>;
  presence: PresenceMap;
  myId: string;
  onVote: (author: string, cat: number, reject: boolean) => void;
  onReady: (ready: boolean) => void;
}) {
  const endedBy =
    state.endedBy === "tiempo"
      ? "⏰ ¡Se acabó el tiempo!"
      : `✋ ¡Basta! de ${state.endedBy === myId ? "vos" : state.players[state.endedBy]?.name ?? "alguien"}`;
  const iAmReady = !!state.ready[myId];
  const online = state.order.filter((id) => id in presence);

  return (
    <div className="flex flex-col gap-4">
      <div className={`${CARD} flex items-center gap-4`}>
        <LetterBadge letter={letter} />
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Ronda {state.round + 1} de {config.rounds}
          </p>
          <p className="font-display text-lg font-semibold text-slate-100">{endedBy}</p>
          <p className="text-sm text-slate-400">
            Revisá las respuestas y marcá 👎 las que no valen. Se anula la que rechaza más de la mitad.
          </p>
        </div>
      </div>

      {config.categories.map((cat, i) => (
        <div key={i} className={`${CARD} !p-4`}>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{cat}</h3>
          <ul className="flex flex-col gap-1">
            {state.order.map((id) => {
              const r = results[id]?.[i];
              if (!r) return null;
              const mine = id === myId;
              const iRejected = !!roundVotes[voteKey(id, i)]?.[myId];
              return (
                <li key={id} className="flex items-center gap-2 rounded-md px-1 py-1">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: state.players[id]?.color }} />
                  <span className="w-20 shrink-0 truncate text-xs text-slate-400 sm:w-28">
                    {mine ? "Vos" : state.players[id]?.name}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${
                      r.valid ? "text-slate-100" : "text-slate-500 line-through"
                    }`}
                    title={r.wrongLetter && r.text ? `No empieza con ${letter}` : undefined}
                  >
                    {r.text || "—"}
                  </span>
                  <span
                    className={`w-9 shrink-0 text-right font-mono text-sm font-semibold ${
                      r.points === 20 ? "text-emerald-300" : r.points ? "text-cyan-300" : "text-slate-600"
                    }`}
                  >
                    {r.points ? `+${r.points}` : "0"}
                  </span>
                  {!mine && r.text && !r.wrongLetter ? (
                    <button
                      onClick={() => onVote(id, i, !iRejected)}
                      aria-label={iRejected ? "Quitar rechazo" : "Rechazar respuesta"}
                      className={`w-12 shrink-0 rounded-md border px-1 py-0.5 text-xs transition ${
                        iRejected
                          ? "border-red-400/60 bg-red-500/15 text-red-300"
                          : "border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"
                      }`}
                    >
                      👎{r.rejections ? ` ${r.rejections}` : ""}
                    </button>
                  ) : (
                    <span className="w-12 shrink-0 text-center text-xs text-slate-600">
                      {r.rejections ? `👎 ${r.rejections}` : ""}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className={`${CARD} flex flex-col items-center gap-2 text-center`}>
        <button
          onClick={() => onReady(!iAmReady)}
          className={`w-full max-w-xs ${iAmReady ? SECONDARY_BUTTON : PRIMARY_BUTTON}`}
        >
          {iAmReady ? "Esperando a los demás… (tocá para seguir revisando)" : "✓ Listo, siguiente ronda"}
        </button>
        <p className="text-xs text-slate-500">
          Listos: {online.filter((id) => state.ready[id]).length}/{online.length}
        </p>
      </div>
    </div>
  );
}

function totals(state: TuttiState, results: Record<string, AnswerResult[]>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of state.order) out[id] = results.reduce((acc, r) => acc + sumPoints(r[id]), 0);
  return out;
}

function FinishedView({
  state,
  results,
  myId,
  onRestart,
}: {
  state: TuttiState;
  results: Record<string, AnswerResult[]>[];
  myId: string;
  onRestart: () => void;
}) {
  const t = totals(state, results);
  const best = Math.max(0, ...Object.values(t));
  const winners = state.order.filter((id) => t[id] === best);
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

function Scoreboard({
  state,
  results,
  presence,
  myId,
}: {
  state: TuttiState;
  results: Record<string, AnswerResult[]>[];
  presence: PresenceMap;
  myId: string;
}) {
  const t = totals(state, results);
  const current = state.status === "reviewing" ? results[state.round] : undefined;
  const ranked = [...state.order].sort((a, b) => t[b] - t[a]);

  return (
    <aside className={`${CARD} w-full lg:w-64`}>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Puntos</h2>
      <ul className="flex flex-col gap-1.5">
        {ranked.map((id) => {
          const p = state.players[id];
          const roundPts = current ? sumPoints(current[id]) : null;
          return (
            <li key={id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${id in presence ? "" : "opacity-40"}`}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p?.color }} />
              <span className="flex-1 truncate text-sm text-slate-200">
                {p?.name ?? "?"}
                {id === myId && <span className="text-slate-500"> (vos)</span>}
                {state.status === "reviewing" && state.ready[id] && <span className="text-emerald-400"> ✓</span>}
              </span>
              {roundPts !== null && <span className="font-mono text-xs text-cyan-300">+{roundPts}</span>}
              <span className="font-mono text-sm font-semibold text-slate-100">{t[id] ?? 0}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
