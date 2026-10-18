"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  MIN_PLAYERS,
  VOTE_SECONDS,
  castVote,
  closeVote,
  getProbableMeta,
  joinProbable,
  nextQuestion,
  normalizeMeta,
  playAgain,
  promptFor,
  promptPool,
  startProbable,
  subscribeProbable,
  tally,
  topVoted,
  type ProbableState,
} from "@/lib/probable";
import { PROBABLE_DECKS } from "@/lib/probablePrompts";
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
import { Crown } from "lucide-react";

type Status = "loading" | "not-found" | "ready" | "error";
interface Config {
  hostId: string;
  pool: string[];
  total: number;
  summary: string;
}

export default function ProbableClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [state, setState] = useState<ProbableState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  // Presence starts empty: only trust "X isn't here" once I see myself in it.
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getProbableMeta>>>>(
      roomId,
      (meta) => {
        if (cancelled) return;
        setRoomMeta(meta);
        if (!meta) return setStatus("not-found");
        if (meta.game !== "probable") return router.replace(`/sala/${roomId}`);
        const m = normalizeMeta(meta);
        const pool = promptPool(m);
        const decks = PROBABLE_DECKS.filter((d) => m.decks.includes(d.id)).map((d) => `${d.emoji} ${d.label}`);
        if (m.customPrompts?.length) decks.push("✏️ Propias");
        const total = Math.min(m.questions, pool.length);
        setConfig({ hostId: meta.hostId ?? "", pool, total, summary: `${total} preguntas · ${decks.join(", ")}` });
        unsub ??= subscribeProbable(roomId, setState);
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
    joinProbable(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const voting = state?.status === "voting";
  const now = useServerNow(voting);
  const deadline = (state?.phaseStartedAt ?? 0) + VOTE_SECONDS * 1000;
  const expired = voting && now > 0 && now >= deadline;
  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  // Votes from everyone still here (someone may have left without voting).
  const allVoted =
    voting && presenceLoaded && connected.length > 0 && connected.every((id) => !!state?.votes[id]);
  const qNo = state?.qNo ?? 0;
  useEffect(() => {
    if (expired || allVoted) closeVote(roomId, qNo).catch(console.error);
  }, [expired, allVoted, roomId, qNo]);

  if (!configured) return <FirebaseSetupNotice />;

  const prompt = state && config ? promptFor(state.seed, config.pool, state.qNo) : "";

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="probable"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="probable" />
        )}

        {status === "loading" && <RoomLoading text="Barajando las frases…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="probable"
              roomId={roomId}
              hostId={config.hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={config.summary}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              onStart={() => startProbable(roomId, connected.length)}
            >
              {connected.length < MIN_PLAYERS && (
                <p className="text-center text-sm text-amber-300/90">
                  Hacen falta al menos {MIN_PLAYERS} jugadores para empezar.
                </p>
              )}
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && config && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {state.status !== "finished" && (
                <PromptCard prompt={prompt} qNo={state.qNo} total={config.total} />
              )}
              {state.status === "voting" && (
                <VotePanel
                  roomId={roomId}
                  state={state}
                  myId={myId}
                  presence={presence}
                  candidates={connected}
                  left={Math.max(0, deadline - now)}
                />
              )}
              {state.status === "reveal" && (
                <RevealPanel
                  state={state}
                  myId={myId}
                  last={state.qNo + 1 >= config.total}
                  onNext={() => nextQuestion(roomId, state.qNo, config.total)}
                />
              )}
              {state.status === "finished" && (
                <FinalPanel
                  state={state}
                  myId={myId}
                  pool={config.pool}
                  onAgain={() => playAgain(roomId, state.gameNo)}
                />
              )}
              {state.status === "finished" && (
                <BackToRoomButton roomId={roomId} stateKey="probable/state" hostId={config.hostId} presence={presence} myId={myId} />
              )}
            </div>
            <Scoreboard state={state} presence={presence} myId={myId} />
          </div>
        )}
      </main>
    </div>
  );
}

function nameOf(state: ProbableState, id: string, myId: string): string {
  return id === myId ? "vos" : (state.players[id]?.name ?? "?");
}

function Avatar({ state, id, size = "h-7 w-7 text-xs" }: { state: ProbableState; id: string; size?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${size}`}
      style={{ backgroundColor: state.players[id]?.color ?? "#64748b" }}
      title={state.players[id]?.name}
    >
      {state.players[id]?.name.slice(0, 1).toUpperCase() ?? "?"}
    </span>
  );
}

function PromptCard({ prompt, qNo, total }: { prompt: string; qNo: number; total: number }) {
  return (
    <div
      key={qNo}
      className="animate-celebration-in flex flex-col items-center gap-2 rounded-2xl border border-pink-500/30 bg-gradient-to-br from-pink-950/60 to-slate-900 p-6 text-center shadow-[0_0_35px_rgba(236,72,153,0.18)]"
    >
      <span className="text-xs uppercase tracking-wide text-slate-500">
        Pregunta {qNo + 1} de {total}
      </span>
      <p className="font-display text-sm font-medium text-pink-200">¿Quién es más probable que…</p>
      <p className="font-display text-2xl font-bold text-slate-100 sm:text-3xl">{prompt}?</p>
    </div>
  );
}

function TimeBar({ left, total }: { left: number; total: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
      <div
        className="h-full rounded-full bg-gradient-to-r from-pink-500 to-orange-400 transition-[width] duration-200 ease-linear"
        style={{ width: `${Math.min(100, (left / (total * 1000)) * 100)}%` }}
      />
    </div>
  );
}

function VotePanel({
  roomId,
  state,
  myId,
  presence,
  candidates,
  left,
}: {
  roomId: string;
  state: ProbableState;
  myId: string;
  presence: PresenceMap;
  candidates: string[];
  left: number;
}) {
  const myVote = state.votes[myId];
  const votersNeeded = Math.max(1, candidates.length);
  const voted = candidates.filter((id) => state.votes[id]).length;

  return (
    <div className={`${CARD} flex flex-col gap-3`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-slate-300">{myVote ? "Votaste. Podés cambiarlo hasta que voten todos." : "Tocá a quien elijas (vale votarte)."}</p>
        <span className="shrink-0 text-xs text-slate-500">
          Votaron {voted} de {candidates.length}
        </span>
      </div>
      <TimeBar left={left} total={VOTE_SECONDS} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {candidates.map((id) => {
          const chosen = myVote === id;
          return (
            <button
              key={id}
              onClick={() => castVote(roomId, state.qNo, myId, id, votersNeeded)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                chosen
                  ? "border-pink-400 bg-pink-500/15 shadow-[0_0_18px_rgba(236,72,153,0.35)]"
                  : "border-slate-700 bg-slate-950/40 hover:border-slate-500"
              } ${id in presence ? "" : "opacity-50"}`}
            >
              <Avatar state={state} id={id} />
              <span className="min-w-0 flex-1 truncate text-slate-100">{id === myId ? "Yo" : nameOf(state, id, myId)}</span>
              {state.votes[id] && (
                <span title="Ya votó" className="text-xs text-emerald-400">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RevealPanel({
  state,
  myId,
  last,
  onNext,
}: {
  state: ProbableState;
  myId: string;
  last: boolean;
  onNext: () => void;
}) {
  const rows = tally(state.votes);
  const top = topVoted(state.votes);
  const max = rows[0]?.[1] ?? 0;
  const myVote = state.votes[myId];
  const withMajority = !!myVote && top.includes(myVote);

  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      {top.length === 0 ? (
        <p className="text-center font-display text-xl font-semibold text-slate-100">Nadie votó 🤷</p>
      ) : (
        <div className="animate-celebration-in flex flex-col items-center gap-2 text-center">
          <div className="flex -space-x-2">
            {top.map((id) => (
              <Avatar key={id} state={state} id={id} size="h-14 w-14 text-xl ring-4 ring-slate-900" />
            ))}
          </div>
          <p className="flex items-center gap-2 font-display text-2xl font-bold text-slate-100">
            <Crown className="h-6 w-6 text-amber-300" />
            {top.length === 1
              ? top[0] === myId
                ? "¡Sos vos!"
                : `¡${nameOf(state, top[0], myId)}!`
              : `Empate: ${top.map((id) => nameOf(state, id, myId)).join(" y ")}`}
          </p>
          <p className="text-sm text-slate-400">
            {max} {max === 1 ? "voto" : "votos"}
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map(([target, n]) => {
          const voters = Object.keys(state.votes).filter((v) => state.votes[v] === target);
          return (
            <li key={target} className="flex items-center gap-2 text-sm">
              <Avatar state={state} id={target} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-slate-200">{target === myId ? "Vos" : nameOf(state, target, myId)}</span>
                  <span className="font-mono text-xs text-slate-400">{n}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-pink-500 to-orange-400"
                    style={{ width: `${(n / Math.max(1, max)) * 100}%` }}
                  />
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  Lo votaron: {voters.map((v) => nameOf(state, v, myId)).join(", ")}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {myVote && (
        <p className={`text-center text-sm ${withMajority ? "text-emerald-300" : "text-slate-400"}`}>
          {withMajority ? "Votaste con la mayoría: +1 punto." : "Esta vez no coincidiste con la mayoría."}
        </p>
      )}

      <button onClick={onNext} className={`w-full max-w-xs self-center ${PRIMARY_BUTTON}`}>
        {last ? "Ver resultados" : "Siguiente pregunta"}
      </button>
    </div>
  );
}

function FinalPanel({
  state,
  myId,
  pool,
  onAgain,
}: {
  state: ProbableState;
  myId: string;
  pool: string[];
  onAgain: () => void;
}) {
  const titled = Object.keys(state.titles).sort((a, b) => (state.titles[b] ?? 0) - (state.titles[a] ?? 0));
  const champion = titled[0];
  const questions = Object.keys(state.history)
    .map((k) => Number(k.slice(1)))
    .sort((a, b) => a - b);

  return (
    <div className="animate-celebration-in flex flex-col gap-4 rounded-2xl border border-pink-500/25 bg-slate-900 p-6 shadow-[0_0_40px_rgba(236,72,153,0.15)]">
      <div className="text-center">
        <p className="font-display text-2xl font-semibold text-slate-100">🏁 ¡Terminó!</p>
        {champion && (
          <p className="mt-1 text-slate-300">
            {champion === myId ? "Vos" : nameOf(state, champion, myId)} se llevó más títulos ({state.titles[champion]}). El grupo ya
            sabe todo de {champion === myId ? "vos" : "esa persona"}…
          </p>
        )}
      </div>

      {questions.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {questions.map((q) => (
            <li key={q} className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-slate-950/40 px-3 py-2">
              <span className="text-slate-400">…{promptFor(state.seed, pool, q)}:</span>
              <span className="font-semibold text-slate-100">
                {state.history[`q${q}`]
                  .split(",")
                  .map((id) => (id === myId ? "vos" : nameOf(state, id, myId)))
                  .join(" y ")}
              </span>
            </li>
          ))}
        </ul>
      )}

      <button onClick={onAgain} className={`w-full max-w-xs self-center ${PRIMARY_BUTTON}`}>
        Jugar de nuevo
      </button>
    </div>
  );
}

function Scoreboard({ state, presence, myId }: { state: ProbableState; presence: PresenceMap; myId: string }) {
  const rows = Object.keys(state.players)
    .filter((id) => id in presence || (state.scores[id] ?? 0) > 0 || (state.titles[id] ?? 0) > 0)
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
            {(state.titles[id] ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-amber-300/80" title="Títulos">
                <Crown className="h-3 w-3" />
                {state.titles[id]}
              </span>
            )}
            <span className="w-8 text-right font-mono text-slate-200">{state.scores[id] ?? 0}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-slate-800 pt-2 text-xs text-slate-500">
        Sumás 1 punto cada vez que votás a quien termina más votado.
      </p>
    </aside>
  );
}
