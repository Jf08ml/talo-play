"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  MIN_PER_TEAM,
  canStart,
  changeActor,
  chooseTeam,
  endTurn,
  getMimicaMeta,
  joinMimica,
  membersOf,
  nextWord,
  normalizeMeta,
  playAgain,
  shuffleTeams,
  startActing,
  startMimica,
  subscribeMimica,
  wordFor,
  type MimicaState,
} from "@/lib/mimica";
import { TEAMS, type TeamId } from "@/lib/teams";
import { formatClock } from "@/lib/format";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useServerNow } from "@/hooks/useServerNow";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import { Shuffle } from "lucide-react";

type Status = "loading" | "not-found" | "ready" | "error";
type Config = { hostId: string; seconds: number; turns: number };

const teamInfo = (id: TeamId) => TEAMS.find((t) => t.id === id)!;

export default function MimicaClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [config, setConfig] = useState<Config | null>(null);
  const [state, setState] = useState<MimicaState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  // Presence starts empty: only trust "X isn't here" once I see myself in it.
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    getMimicaMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "mimica") return router.replace(`/sala/${roomId}`);
        setConfig({ ...normalizeMeta(meta), hostId: meta.hostId ?? "" });
        unsub = subscribeMimica(roomId, setState);
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
    joinMimica(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const acting = state?.status === "acting";
  const now = useServerNow(acting, 250);
  const seconds = config?.seconds ?? 60;
  const deadline = (state?.startedAt ?? 0) + seconds * 1000;
  const expired = acting && now > 0 && now >= deadline;
  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  const totalTurns = (config?.turns ?? 4) * 2;
  const turnNo = state?.turnNo ?? 0;

  // The clock runs out: every client tries, the turn number guards it.
  useEffect(() => {
    if (expired) endTurn(roomId, turnNo, totalTurns, connected).catch(console.error);
    // `connected` is read at that moment; it shouldn't re-trigger the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired, roomId, turnNo, totalTurns]);

  if (!configured) return <FirebaseSetupNotice />;

  const myTeam = state?.players[myId]?.team ?? "";

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="mimica"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="mimica" />
        )}

        {status === "loading" && <RoomLoading text="Preparando el escenario…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="mimica"
              roomId={roomId}
              hostId={config.hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, name: p.name, color: p.color }))}
              presence={presence}
              myId={myId}
              summary={`${config.turns} turnos por equipo · ${config.seconds} s cada uno`}
              onStart={() => startMimica(roomId, connected)}
            >
              <TeamSetup roomId={roomId} state={state} myId={myId} connected={connected} />
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && config && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 p-4">
            <ScoreBar state={state} />
            {!myTeam && state.status !== "finished" && (
              <div className={`${CARD} !p-3 flex flex-col items-center gap-2 text-center text-sm text-slate-300`}>
                Llegaste con la partida empezada. Sumate a un equipo:
                <TeamButtons roomId={roomId} myId={myId} />
              </div>
            )}
            {state.status === "ready" && (
              <ReadyPanel roomId={roomId} state={state} myId={myId} connected={connected} presenceLoaded={presenceLoaded} total={totalTurns} />
            )}
            {state.status === "acting" && (
              <ActingPanel roomId={roomId} state={state} myId={myId} left={Math.max(0, deadline - now)} seconds={seconds} />
            )}
            {state.status === "finished" && (
              <FinalPanel
                state={state}
                myTeam={myTeam}
                canAgain={canStart(state, connected)}
                onAgain={() => playAgain(roomId, state.gameNo, connected)}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function TeamButtons({ roomId, myId }: { roomId: string; myId: string }) {
  return (
    <div className="flex gap-2">
      {TEAMS.map((t) => (
        <button
          key={t.id}
          onClick={() => chooseTeam(roomId, myId, t.id)}
          className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
          style={{ borderColor: t.color, color: t.color }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function TeamSetup({
  roomId,
  state,
  myId,
  connected,
}: {
  roomId: string;
  state: MimicaState;
  myId: string;
  connected: string[];
}) {
  const myTeam = state.players[myId]?.team ?? "";
  const unassigned = connected.filter((id) => !state.players[id]?.team);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {TEAMS.map((t) => {
          const members = membersOf(state, t.id, connected);
          return (
            <div
              key={t.id}
              className="flex flex-col gap-2 rounded-xl border bg-slate-950/40 p-3"
              style={{ borderColor: `${t.color}66` }}
            >
              <p className="text-center text-sm font-semibold" style={{ color: t.color }}>
                {t.label}
              </p>
              <ul className="flex min-h-10 flex-col gap-1 text-sm text-slate-200">
                {members.map((id) => (
                  <li key={id} className="truncate text-center">
                    {id === myId ? "Vos" : state.players[id]?.name}
                  </li>
                ))}
              </ul>
              {myTeam !== t.id && (
                <button
                  onClick={() => chooseTeam(roomId, myId, t.id)}
                  className="rounded-md border px-2 py-1 text-xs font-medium"
                  style={{ borderColor: t.color, color: t.color }}
                >
                  Unirme
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={() => shuffleTeams(roomId, connected)}
        className="flex items-center justify-center gap-1.5 self-center text-xs text-slate-400 hover:text-slate-200"
      >
        <Shuffle className="h-3.5 w-3.5" /> Mezclar equipos al azar
      </button>
      {unassigned.length > 0 && (
        <p className="text-center text-xs text-slate-500">
          Sin equipo: {unassigned.map((id) => (id === myId ? "vos" : state.players[id]?.name)).join(", ")}
        </p>
      )}
      {!canStart(state, connected) && (
        <p className="text-center text-sm text-amber-300/90">
          Cada equipo necesita al menos {MIN_PER_TEAM} jugadores conectados.
        </p>
      )}
    </div>
  );
}

function ScoreBar({ state }: { state: MimicaState }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {TEAMS.map((t) => {
        const active = state.status !== "finished" && state.team === t.id;
        return (
          <div
            key={t.id}
            className={`flex items-center justify-between rounded-xl border bg-slate-900/70 px-4 py-2.5 transition ${active ? "" : "opacity-60"}`}
            style={{ borderColor: active ? t.color : "#33415580", boxShadow: active ? `0 0 20px ${t.color}55` : undefined }}
          >
            <span className="text-sm font-semibold" style={{ color: t.color }}>
              {t.label}
            </span>
            <span className="font-mono text-2xl font-bold text-slate-100">{state.scores[t.id]}</span>
          </div>
        );
      })}
    </div>
  );
}

function ReadyPanel({
  roomId,
  state,
  myId,
  connected,
  presenceLoaded,
  total,
}: {
  roomId: string;
  state: MimicaState;
  myId: string;
  connected: string[];
  presenceLoaded: boolean;
  total: number;
}) {
  const team = teamInfo(state.team);
  const isActor = state.actor === myId;
  const actorName = state.players[state.actor]?.name ?? "?";
  const actorGone = presenceLoaded && (!state.actor || !connected.includes(state.actor));
  const inTeam = state.players[myId]?.team === state.team;
  return (
    <div className={`${CARD} flex flex-col items-center gap-4 py-8 text-center`}>
      <p className="text-xs uppercase tracking-wide text-slate-500">
        Turno {state.turnNo + 1} de {total}
      </p>
      <p className="font-display text-2xl font-semibold" style={{ color: team.color }}>
        Turno del {team.label}
      </p>
      {isActor ? (
        <>
          <p className="text-slate-300">Actuás vos. Que tu equipo no vea tu pantalla.</p>
          <button onClick={() => startActing(roomId, myId, state.turnNo)} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
            ¡Empezar!
          </button>
        </>
      ) : (
        <p className="text-slate-300">
          Actúa <span className="font-semibold text-slate-100">{actorName}</span>
          {actorGone ? " (se fue)" : ". Cuando esté listo/a, arranca el reloj."}
        </p>
      )}
      {(actorGone || inTeam || isActor) && (
        <button onClick={() => changeActor(roomId, state.turnNo, connected)} className={`px-4 text-xs ${SECONDARY_BUTTON}`}>
          Que actúe otro del equipo
        </button>
      )}
    </div>
  );
}

function ActingPanel({
  roomId,
  state,
  myId,
  left,
  seconds,
}: {
  roomId: string;
  state: MimicaState;
  myId: string;
  left: number;
  seconds: number;
}) {
  const team = teamInfo(state.team);
  const isActor = state.actor === myId;
  const myTeam = state.players[myId]?.team ?? "";
  const rival = !!myTeam && myTeam !== state.team;
  const word = wordFor(state.seed, state.wordNo);
  const urgent = left <= 10_000;

  return (
    <div className={`${CARD} flex flex-col items-center gap-5 py-6 text-center`}>
      <p className={`font-mono text-5xl font-bold ${urgent ? "text-rose-400" : "text-slate-100"}`}>{formatClock(left)}</p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full transition-[width] duration-200 ease-linear"
          style={{ width: `${(left / (seconds * 1000)) * 100}%`, backgroundColor: team.color }}
        />
      </div>

      {isActor || rival ? (
        <div key={state.wordNo} className="animate-celebration-in flex flex-col items-center gap-1">
          <span className="text-xs uppercase tracking-wide text-slate-500">
            {rival ? "Controlá: la palabra es" : word.cat}
          </span>
          <span className="font-display text-4xl font-bold text-slate-100">{word.w}</span>
          {rival && <span className="text-xs text-slate-500">{word.cat}</span>}
        </div>
      ) : (
        <p className="font-display text-3xl font-semibold" style={{ color: team.color }}>
          {myTeam === state.team ? "¡Adivinen!" : "Mirá cómo actúan…"}
        </p>
      )}

      <p className="text-sm text-slate-400">
        Adivinadas: <span className="font-semibold text-emerald-300">{state.hits}</span> · Pasadas: {state.passes}
      </p>

      {isActor && (
        <div className="grid w-full max-w-sm grid-cols-2 gap-2">
          <button
            onClick={() => nextWord(roomId, myId, state.wordNo, true)}
            className="rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white transition hover:bg-emerald-500"
          >
            ¡Adivinaron!
          </button>
          <button
            onClick={() => nextWord(roomId, myId, state.wordNo, false)}
            className="rounded-xl border border-slate-600 py-4 text-lg font-medium text-slate-300 transition hover:bg-slate-800"
          >
            Pasar
          </button>
        </div>
      )}
    </div>
  );
}

function FinalPanel({
  state,
  myTeam,
  canAgain,
  onAgain,
}: {
  state: MimicaState;
  myTeam: TeamId | "";
  canAgain: boolean;
  onAgain: () => void;
}) {
  const { red, blue } = state.scores;
  const winner: TeamId | null = red === blue ? null : red > blue ? "red" : "blue";
  const iWon = !!winner && winner === myTeam;
  return (
    <div
      className={`animate-celebration-in flex flex-col items-center gap-3 rounded-2xl border bg-slate-900 p-6 text-center ${
        iWon ? "border-emerald-500/25 shadow-[0_0_40px_rgba(52,211,153,0.2)]" : "border-violet-500/20"
      }`}
    >
      <p className="font-display text-2xl font-semibold text-slate-100">
        {winner ? (
          <>
            🏆 ¡Ganó el <span style={{ color: teamInfo(winner).color }}>{teamInfo(winner).label}</span>!
          </>
        ) : (
          "🤝 ¡Empate!"
        )}
      </p>
      {canAgain ? (
        <button onClick={onAgain} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
          Jugar de nuevo
        </button>
      ) : (
        <p className="text-xs text-amber-300/90">Cada equipo necesita al menos {MIN_PER_TEAM} jugadores conectados.</p>
      )}
    </div>
  );
}
