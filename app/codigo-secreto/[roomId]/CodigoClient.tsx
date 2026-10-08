"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  buildBoard,
  cardKey,
  cardsLeft,
  chooseRole,
  clueProblem,
  endGuessing,
  getCodigoMeta,
  giveClue,
  joinCodigo,
  MAX_CLUE_COUNT,
  MAX_CLUE_LENGTH,
  newCodigoGame,
  revealCard,
  setupProblem,
  startCodigo,
  subscribeCodigo,
  type Board,
  type CardRole,
  type CodigoState,
} from "@/lib/codigo";
import { TEAMS, type TeamId } from "@/lib/teams";
import type { PresenceMap } from "@/lib/presence";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import NamePrompt from "@/components/NamePrompt";
import InviteCard from "@/components/InviteCard";
import { startPermission } from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";

type Status = "loading" | "not-found" | "ready" | "error";

const team = (id: TeamId) => TEAMS.find((t) => t.id === id)!;

export default function CodigoClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [state, setState] = useState<CodigoState | null>(null);
  const [hostId, setHostId] = useState("");

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    getCodigoMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "codigo") return router.replace(`/sala/${roomId}`);
        setHostId(meta.hostId ?? "");
        unsub = subscribeCodigo(roomId, setState);
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
    joinCodigo(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const seed = state?.seed;
  const board = useMemo(() => (seed !== undefined ? buildBoard(seed) : null), [seed]);

  if (!configured) return <FirebaseSetupNotice />;

  const myself = state?.players[myId];

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="codigo"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="codigo" />
        )}

        {status === "loading" && <RoomLoading text="Repartiendo los expedientes…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && board && (
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4">
            {state.status === "waiting" ? (
              <TeamSetup roomId={roomId} hostId={hostId} state={state} presence={presence} myId={myId} />
            ) : (
              <>
                <StatusBar roomId={roomId} state={state} board={board} myId={myId} />
                {state.status === "playing" && myself && !myself.team && (
                  <div className={`${CARD} !p-3 flex flex-wrap items-center justify-center gap-2 text-sm`}>
                    <span className="text-slate-300">Llegaste con la partida empezada. Sumate como agente:</span>
                    {TEAMS.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => chooseRole(roomId, myId, t.id, false)}
                        className="rounded-md border px-3 py-1 font-medium"
                        style={{ borderColor: t.color, color: t.color }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <BoardGrid roomId={roomId} state={state} board={board} myId={myId} />
                  <SidePanel state={state} presence={presence} myId={myId} />
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function TeamSetup({
  roomId,
  hostId,
  state,
  presence,
  myId,
}: {
  roomId: string;
  hostId: string;
  state: CodigoState;
  presence: PresenceMap;
  myId: string;
}) {
  const problem = setupProblem(state.players);
  const { canStart, message } = startPermission(hostId, state.players[hostId]?.name, presence, myId);
  const myself = state.players[myId];
  const unassigned = Object.entries(state.players).filter(([id, p]) => !p.team && id in presence);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {TEAMS.map((t) => {
          const members = Object.entries(state.players).filter(([, p]) => p.team === t.id);
          const spymaster = members.find(([, p]) => p.spymaster);
          const iAmHere = myself?.team === t.id;
          return (
            <div
              key={t.id}
              className="flex flex-col gap-3 rounded-2xl border bg-slate-900/60 p-5 backdrop-blur"
              style={{ borderColor: `${t.color}55`, boxShadow: `0 0 25px ${t.color}22` }}
            >
              <h2 className="font-display text-xl font-semibold" style={{ color: t.color }}>
                {t.label}
              </h2>
              <ul className="flex min-h-16 flex-col gap-1 text-sm">
                {members.length === 0 && <li className="text-slate-600">Nadie todavía</li>}
                {members.map(([id, p]) => (
                  <li key={id} className={`flex items-center gap-2 ${id in presence ? "" : "opacity-40"}`}>
                    <span>{p.spymaster ? "🕵️" : "👤"}</span>
                    <span className="text-slate-200">
                      {p.name}
                      {id === myId && <span className="text-slate-500"> (vos)</span>}
                      {id === hostId && <span title="Anfitrión"> 👑</span>}
                    </span>
                    {p.spymaster && <span className="text-xs text-slate-500">jefe de espías</span>}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap gap-2">
                {!(iAmHere && !myself?.spymaster) && (
                  <button
                    onClick={() => chooseRole(roomId, myId, t.id, false)}
                    className="flex-1 rounded-lg border py-2 text-sm font-medium transition hover:bg-white/5"
                    style={{ borderColor: `${t.color}99`, color: t.color }}
                  >
                    {iAmHere ? "Ser agente" : "Unirme como agente"}
                  </button>
                )}
                {!spymaster && (
                  <button
                    onClick={() => chooseRole(roomId, myId, t.id, true)}
                    className="flex-1 rounded-lg py-2 text-sm font-medium text-white transition hover:brightness-110"
                    style={{ backgroundColor: t.color }}
                  >
                    🕵️ Ser jefe de espías
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {unassigned.length > 0 && (
        <p className="text-center text-sm text-slate-500">
          Sin equipo: {unassigned.map(([id, p]) => (id === myId ? "vos" : p.name)).join(", ")}
        </p>
      )}

      <div className={`${CARD} flex flex-col items-center gap-2 text-center`}>
        {problem ? (
          <p className="text-sm text-amber-300/90">{problem}</p>
        ) : (
          <p className="text-sm text-slate-300">¡Equipos listos! {message}</p>
        )}
        {canStart && (
          <button
            onClick={() => startCodigo(roomId)}
            disabled={problem !== null}
            className={`w-full max-w-xs ${PRIMARY_BUTTON}`}
          >
            Empezar partida
          </button>
        )}
      </div>

      <InviteCard game="codigo" roomId={roomId} />
    </div>
  );
}

function StatusBar({ roomId, state, board, myId }: { roomId: string; state: CodigoState; board: Board; myId: string }) {
  const myself = state.players[myId];
  const turnTeam = team(state.turn);
  const clue = state.phase === "guess" ? state.clues[state.clues.length - 1] : undefined;
  const iGiveClue = state.status === "playing" && state.phase === "clue" && myself?.spymaster && myself.team === state.turn;
  const iGuess = state.status === "playing" && state.phase === "guess" && myself && !myself.spymaster && myself.team === state.turn;

  const counts = (
    <div className="flex items-center gap-3 font-display text-2xl font-bold">
      <span style={{ color: team("red").color }}>{cardsLeft(board, state.revealed, "red")}</span>
      <span className="text-sm font-normal text-slate-600">–</span>
      <span style={{ color: team("blue").color }}>{cardsLeft(board, state.revealed, "blue")}</span>
    </div>
  );

  if (state.status === "finished") {
    const winner = team(state.winner || "red");
    const iWon = myself?.team === state.winner;
    return (
      <div
        className="animate-celebration-in flex flex-col items-center gap-2 rounded-2xl border bg-slate-900 p-5 text-center"
        style={{ borderColor: `${winner.color}66`, boxShadow: `0 0 40px ${winner.color}33` }}
      >
        <p className="font-display text-2xl font-semibold" style={{ color: winner.color }}>
          {iWon ? "🎉 " : ""}¡Ganó el {winner.label}!
        </p>
        <p className="text-sm text-slate-400">
          {state.endReason === "bomb"
            ? `El ${team(state.winner === "red" ? "blue" : "red").label} tocó la bomba 💣`
            : "Encontraron a todos sus agentes."}
        </p>
        <button onClick={() => newCodigoGame(roomId)} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
          Nueva partida
        </button>
      </div>
    );
  }

  return (
    <div className={`${CARD} !py-3 flex flex-wrap items-center gap-x-4 gap-y-2`}>
      {counts}
      <div className="min-w-0 flex-1 text-center">
        <p className="text-sm font-semibold" style={{ color: turnTeam.color }}>
          Turno del {turnTeam.label}
        </p>
        {clue ? (
          <p className="font-display text-xl text-slate-100">
            🔎 {clue.word.toUpperCase()} · {clue.count}
            <span className="ml-2 text-xs font-normal text-slate-500">
              ({state.guessesLeft} {state.guessesLeft === 1 ? "intento" : "intentos"})
            </span>
          </p>
        ) : (
          <p className="text-sm text-slate-400">
            {iGiveClue ? "Te toca dar la pista" : "El jefe de espías está pensando una pista…"}
          </p>
        )}
      </div>
      {iGiveClue && <ClueForm roomId={roomId} state={state} board={board} myId={myId} />}
      {iGuess && (
        <button
          onClick={() => endGuessing(roomId, myId, state.clues.length)}
          className={`px-4 text-sm ${SECONDARY_BUTTON}`}
        >
          Terminar turno
        </button>
      )}
    </div>
  );
}

function ClueForm({ roomId, state, board, myId }: { roomId: string; state: CodigoState; board: Board; myId: string }) {
  const [word, setWord] = useState("");
  const [count, setCount] = useState(1);
  const problem = word.trim() ? clueProblem(word, board, state.revealed) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!word.trim() || problem) return;
    giveClue(roomId, myId, word, count).catch(console.error);
    setWord("");
  };

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-1 sm:w-auto">
      <div className="flex gap-1.5">
        <input
          autoFocus
          value={word}
          onChange={(e) => setWord(e.target.value)}
          maxLength={MAX_CLUE_LENGTH}
          placeholder="Pista"
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 outline-none focus:border-violet-500 sm:w-40"
        />
        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 text-slate-100"
          aria-label="Cantidad de palabras"
        >
          {Array.from({ length: MAX_CLUE_COUNT }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!word.trim() || problem !== null}
          className="rounded-lg bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40"
        >
          Dar pista
        </button>
      </div>
      {problem && <p className="text-xs text-amber-300">{problem}</p>}
    </form>
  );
}

const ROLE_STYLE: Record<CardRole, { bg: string; border: string; text: string }> = {
  red: { bg: "#fb3a5d", border: "#fb3a5d", text: "#fff" },
  blue: { bg: "#0891b2", border: "#22d3ee", text: "#fff" },
  neutral: { bg: "#d6c7a1", border: "#a8977a", text: "#3f3a2e" },
  bomb: { bg: "#020617", border: "#64748b", text: "#e2e8f0" },
};

function BoardGrid({ roomId, state, board, myId }: { roomId: string; state: CodigoState; board: Board; myId: string }) {
  const myself = state.players[myId];
  const seesKey = !!myself?.spymaster || state.status === "finished";
  const canGuess = state.status === "playing" && state.phase === "guess" && !!myself && !myself.spymaster && myself.team === state.turn;

  return (
    <div className="grid flex-1 grid-cols-5 gap-1.5 sm:gap-2.5">
      {board.words.map((word, i) => {
        const role = board.roles[i];
        const revealed = !!state.revealed[cardKey(i)];
        const style = ROLE_STYLE[role];
        const clickable = canGuess && !revealed;
        return (
          <button
            key={`${state.seed}-${i}`}
            onClick={() => clickable && revealCard(roomId, myId, i, board)}
            disabled={!clickable}
            className={`relative flex aspect-[4/3] items-center justify-center rounded-lg border-2 px-0.5 text-center text-[10px] font-bold uppercase leading-tight transition sm:aspect-[3/2] sm:text-sm ${
              clickable ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_0_18px_rgba(139,92,246,0.45)]" : "cursor-default"
            }`}
            style={
              revealed
                ? { backgroundColor: style.bg, borderColor: style.border, color: style.text }
                : seesKey
                  ? {
                      backgroundColor: "#f1ead8",
                      borderColor: style.border,
                      color: "#1e1b16",
                      boxShadow: `inset 0 0 0 3px ${style.border}`,
                    }
                  : { backgroundColor: "#f1ead8", borderColor: "#cbbd9b", color: "#1e1b16" }
            }
          >
            {role === "bomb" && (revealed || seesKey) && <span className="mr-1">💣</span>}
            <span className={revealed ? "opacity-80" : ""}>{word}</span>
          </button>
        );
      })}
    </div>
  );
}

function SidePanel({ state, presence, myId }: { state: CodigoState; presence: PresenceMap; myId: string }) {
  return (
    <aside className="flex w-full flex-col gap-4 lg:w-72">
      {TEAMS.map((t) => (
        <div key={t.id} className={`${CARD} !p-4`} style={{ borderColor: `${t.color}44` }}>
          <h3 className="mb-2 text-sm font-semibold" style={{ color: t.color }}>
            {t.label}
          </h3>
          <ul className="flex flex-col gap-0.5 text-sm">
            {Object.entries(state.players)
              .filter(([, p]) => p.team === t.id)
              .map(([id, p]) => (
                <li key={id} className={id in presence ? "" : "opacity-40"}>
                  {p.spymaster ? "🕵️" : "👤"} <span className="text-slate-200">{p.name}</span>
                  {id === myId && <span className="text-slate-500"> (vos)</span>}
                </li>
              ))}
          </ul>
          {state.clues.filter((c) => c.team === t.id).length > 0 && (
            <p className="mt-2 border-t border-slate-800 pt-2 text-xs text-slate-400">
              Pistas:{" "}
              {state.clues
                .filter((c) => c.team === t.id)
                .map((c) => `${c.word} ${c.count}`)
                .join(" · ")}
            </p>
          )}
        </div>
      ))}
    </aside>
  );
}
