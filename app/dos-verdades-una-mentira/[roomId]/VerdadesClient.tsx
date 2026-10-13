"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  MAX_STATEMENT_LENGTH,
  MIN_AUTHORS,
  MIN_PLAYERS,
  VOTE_SECONDS,
  authorOf,
  castVote,
  closeVote,
  getVerdadesMeta,
  joinVerdades,
  nextAuthor,
  playAgain,
  startVerdades,
  startVoting,
  submitStatements,
  subscribeVerdades,
  withdrawStatements,
  type VerdadesState,
} from "@/lib/verdades";
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
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_INPUT } from "@/components/ui";

type Status = "loading" | "not-found" | "ready" | "error";

export default function VerdadesClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [state, setState] = useState<VerdadesState | null>(null);
  const [hostId, setHostId] = useState("");

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  // Presence starts empty: only trust "X isn't here" once I see myself in it.
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    getVerdadesMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "verdades") return router.replace(`/sala/${roomId}`);
        setHostId(meta.hostId ?? "");
        unsub = subscribeVerdades(roomId, setState);
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
    joinVerdades(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const phase = state?.status;
  const now = useServerNow(phase === "voting");
  const deadline = (state?.phaseStartedAt ?? 0) + VOTE_SECONDS * 1000;
  const expired = phase === "voting" && now > 0 && now >= deadline;
  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  const author = state ? authorOf(state) : "";
  const voters = connected.filter((id) => id !== author);

  // Every client runs these; the transactions are guarded, so they apply once.
  const authors = state ? Object.keys(state.statements) : [];
  const everyoneWrote =
    phase === "writing" && presenceLoaded && authors.length >= MIN_AUTHORS && connected.every((id) => !!state?.statements[id]);
  const everyoneVoted =
    phase === "voting" && presenceLoaded && voters.length > 0 && voters.every((id) => state?.votes[id] !== undefined);
  const turnNo = state?.turnNo ?? 0;
  useEffect(() => {
    if (everyoneWrote) startVoting(roomId).catch(console.error);
  }, [everyoneWrote, roomId]);
  useEffect(() => {
    if (expired || everyoneVoted) closeVote(roomId, turnNo).catch(console.error);
  }, [expired, everyoneVoted, roomId, turnNo]);

  if (!configured) return <FirebaseSetupNotice />;

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="verdades"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="verdades" />
        )}

        {status === "loading" && <RoomLoading text="Afilando las mentiras…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="verdades"
              roomId={roomId}
              hostId={hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary="Tres frases cada uno · una es mentira"
              onStart={() => startVerdades(roomId, connected.length)}
            >
              {connected.length < MIN_PLAYERS && (
                <p className="text-center text-sm text-amber-300/90">
                  Hacen falta al menos {MIN_PLAYERS} jugadores para empezar.
                </p>
              )}
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {state.status === "writing" && (
                <WritingPanel roomId={roomId} state={state} myId={myId} connected={connected} />
              )}
              {(state.status === "voting" || state.status === "reveal") && (
                <VotingPanel
                  roomId={roomId}
                  state={state}
                  myId={myId}
                  voters={voters}
                  left={Math.max(0, deadline - now)}
                />
              )}
              {state.status === "finished" && (
                <FinalPanel state={state} myId={myId} onAgain={() => playAgain(roomId, state.gameNo)} />
              )}
            </div>
            <Scoreboard state={state} presence={presence} myId={myId} />
          </div>
        )}
      </main>
    </div>
  );
}

function nameOf(state: VerdadesState, id: string, myId: string): string {
  return id === myId ? "vos" : (state.players[id]?.name ?? "?");
}

function Avatar({ state, id }: { state: VerdadesState; id: string }) {
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

const PLACEHOLDERS = ["Una vez conocí a un famoso…", "Sé tocar un instrumento…", "Nunca me subí a un avión…"];

function WritingPanel({
  roomId,
  state,
  myId,
  connected,
}: {
  roomId: string;
  state: VerdadesState;
  myId: string;
  connected: string[];
}) {
  const mine = state.statements[myId];
  const [texts, setTexts] = useState<string[]>(() => mine?.s ?? ["", "", ""]);
  const [lie, setLie] = useState<number | null>(mine?.lie ?? null);
  const ready = connected.filter((id) => state.statements[id]);
  const authors = Object.keys(state.statements).length;
  const complete = texts.every((t) => t.trim()) && lie !== null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!complete || lie === null) return;
    submitStatements(roomId, myId, texts, lie).catch(console.error);
  };

  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      {mine ? (
        <>
          <div className="text-center">
            <p className="font-display text-lg font-semibold text-slate-100">¡Listo! Tus frases:</p>
            <p className="text-sm text-slate-400">Esperando a que escriban los demás…</p>
          </div>
          <ol className="flex flex-col gap-1.5 text-sm">
            {mine.s.map((t, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg bg-slate-950/40 px-3 py-2">
                <span className="text-slate-500">{i + 1}.</span>
                <span className="flex-1 text-slate-200">{t}</span>
                {i === mine.lie && <span className="text-xs font-semibold text-rose-300">MENTIRA</span>}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={() => withdrawStatements(roomId, myId)} className={`px-4 text-sm ${SECONDARY_BUTTON}`}>
              Cambiar mis frases
            </button>
            {authors >= MIN_AUTHORS && ready.length < connected.length && (
              <button onClick={() => startVoting(roomId)} className={`px-4 text-sm ${PRIMARY_BUTTON}`}>
                Empezar sin esperar
              </button>
            )}
          </div>
        </>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="text-center">
            <p className="font-display text-lg font-semibold text-slate-100">Escribí tres cosas sobre vos</p>
            <p className="text-sm text-slate-400">Dos verdaderas y una mentira. Tocá «mentira» en la inventada.</p>
          </div>
          {texts.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={t}
                onChange={(e) => setTexts((ts) => ts.map((x, j) => (j === i ? e.target.value : x)))}
                maxLength={MAX_STATEMENT_LENGTH}
                placeholder={PLACEHOLDERS[i]}
                className={`min-w-0 flex-1 ${TEXT_INPUT}`}
              />
              <button
                type="button"
                onClick={() => setLie(i)}
                aria-pressed={lie === i}
                className={`shrink-0 rounded-lg border px-2.5 py-2 text-xs font-semibold transition ${
                  lie === i
                    ? "border-rose-400 bg-rose-500/20 text-rose-200"
                    : "border-slate-700 text-slate-500 hover:text-slate-300"
                }`}
              >
                mentira
              </button>
            </div>
          ))}
          <button type="submit" disabled={!complete} className={PRIMARY_BUTTON}>
            Listo
          </button>
          {!complete && texts.every((x) => x.trim()) && (
            <p className="text-center text-xs text-amber-300/90">Marcá cuál de las tres es la mentira.</p>
          )}
        </form>
      )}
      <p className="text-center text-xs text-slate-500">
        Listos: {ready.length} de {connected.length}
        {ready.length > 0 && ` (${ready.map((id) => nameOf(state, id, myId)).join(", ")})`}
      </p>
    </div>
  );
}

function VotingPanel({
  roomId,
  state,
  myId,
  voters,
  left,
}: {
  roomId: string;
  state: VerdadesState;
  myId: string;
  voters: string[];
  left: number;
}) {
  const author = authorOf(state);
  const st = state.statements[author];
  const isAuthor = author === myId;
  const revealing = state.status === "reveal";
  const myVote = state.votes[myId];
  const voted = voters.filter((id) => state.votes[id] !== undefined).length;
  if (!st) return null;

  const fooled = Object.keys(state.votes).filter((v) => state.votes[v] !== st.lie).length;
  const right = Object.keys(state.votes).filter((v) => state.votes[v] === st.lie).length;
  const message = !revealing
    ? null
    : isAuthor
      ? fooled === 0
        ? "Nadie se la creyó. 😅"
        : `Engañaste a ${fooled}: +${fooled} para vos.`
      : myVote === undefined
        ? `${right} ${right === 1 ? "acertó" : "acertaron"}.`
        : myVote === st.lie
          ? "¡La descubriste! +1."
          : `Te la creíste: +1 para ${nameOf(state, author, myId)}.`;

  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          Turno {state.turnNo + 1} de {state.order.length}
        </span>
        {!revealing && (
          <span>
            Votaron {voted} de {voters.length}
          </span>
        )}
      </div>
      <div key={state.turnNo} className="animate-celebration-in flex flex-col items-center gap-1 text-center">
        <Avatar state={state} id={author} />
        <p className="font-display text-xl font-semibold text-slate-100">
          {revealing
            ? "La mentira era…"
            : isAuthor
              ? "Están votando tus frases"
              : `¿Cuál es la mentira de ${nameOf(state, author, myId)}?`}
        </p>
      </div>
      {!revealing && (
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-[width] duration-200 ease-linear"
            style={{ width: `${Math.min(100, (left / (VOTE_SECONDS * 1000)) * 100)}%` }}
          />
        </div>
      )}
      <div className="flex flex-col gap-2">
        {st.s.map((text, i) => {
          const isLie = i === st.lie;
          const who = revealing ? Object.keys(state.votes).filter((v) => state.votes[v] === i) : [];
          const picked = myVote === i;
          return (
            <button
              key={i}
              onClick={() => castVote(roomId, state.turnNo, myId, i, Math.max(1, voters.length))}
              disabled={revealing || isAuthor}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                revealing
                  ? isLie
                    ? "border-rose-400 bg-rose-500/15 shadow-[0_0_20px_rgba(244,63,94,0.3)]"
                    : "border-emerald-500/40 bg-emerald-500/5"
                  : picked
                    ? "border-indigo-400 bg-indigo-500/15 shadow-[0_0_18px_rgba(129,140,248,0.35)]"
                    : isAuthor
                      ? "border-slate-700 bg-slate-950/40"
                      : "border-slate-700 bg-slate-950/40 hover:border-slate-500"
              }`}
            >
              <span className="flex-1 text-slate-100">{text}</span>
              {(revealing || isAuthor) && (
                <span className={`text-xs font-semibold ${isLie ? "text-rose-300" : "text-emerald-300"}`}>
                  {isLie ? "MENTIRA" : "VERDAD"}
                </span>
              )}
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
      {!revealing && !isAuthor && (
        <p className="text-center text-sm text-slate-400">
          {myVote === undefined ? "Tocá la que creas que es mentira." : "Votaste. Podés cambiarlo hasta que voten todos."}
        </p>
      )}
      {revealing && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-slate-300">{message}</p>
          <button onClick={() => nextAuthor(roomId, state.turnNo)} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
            {state.turnNo + 1 >= state.order.length ? "Ver resultados" : "Siguiente"}
          </button>
        </div>
      )}
    </div>
  );
}

function FinalPanel({ state, myId, onAgain }: { state: VerdadesState; myId: string; onAgain: () => void }) {
  const ranking = Object.keys(state.scores).sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0));
  const tie = ranking.length > 1 && state.scores[ranking[0]] === state.scores[ranking[1]];
  const winner = tie ? "" : ranking[0];
  return (
    <div className="animate-celebration-in flex flex-col items-center gap-3 rounded-2xl border border-indigo-500/25 bg-slate-900 p-6 text-center shadow-[0_0_40px_rgba(129,140,248,0.15)]">
      <p className="font-display text-2xl font-semibold text-slate-100">
        {winner ? (winner === myId ? "🎉 ¡Ganaste!" : `🏆 ¡Ganó ${nameOf(state, winner, myId)}!`) : "🏁 ¡Terminó!"}
      </p>
      <p className="text-sm text-slate-400">¿Otra vuelta? Cada uno escribe tres frases nuevas.</p>
      <button onClick={onAgain} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
        Jugar de nuevo
      </button>
    </div>
  );
}

function Scoreboard({ state, presence, myId }: { state: VerdadesState; presence: PresenceMap; myId: string }) {
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
            {state.status === "writing" && state.statements[id] && <span className="text-xs text-emerald-400">✓</span>}
            <span className="w-8 text-right font-mono text-slate-200">{state.scores[id] ?? 0}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-slate-800 pt-2 text-xs text-slate-500">
        Descubrir una mentira suma 1. Cada uno que se cree la tuya, también.
      </p>
    </aside>
  );
}
