"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  MIN_PLAYERS,
  NIGHT_SECONDS,
  NOBODY,
  ROLES,
  canTarget,
  closeDay,
  closeNight,
  dayVote,
  getLoboMeta,
  joinLobo,
  living,
  nextNight,
  nightAction,
  playAgain,
  startLobo,
  subscribeLobo,
  tally,
  wolvesFor,
  type LoboState,
  type Role,
} from "@/lib/lobo";
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
import { RoomSettingsEditor, type RawMeta } from "@/components/RoomSettings";
import { watchRoomMeta } from "@/lib/roomSettings";
import { SETTINGS } from "../settings";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import { Eye, EyeOff } from "lucide-react";
import { useSoundOn } from "@/hooks/useSound";

type Status = "loading" | "not-found" | "ready" | "error";

export default function LoboClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
  const [config, setConfig] = useState<{ hostId: string; daySeconds: number } | null>(null);
  const [state, setState] = useState<LoboState | null>(null);
  useSoundOn(state?.status, "flip", state?.status !== "finished");
  // Whether my role card is face up: secrets in the village list follow it.
  const [roleShown, setRoleShown] = useState(false);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  // Presence starts empty: only trust "X isn't here" once I see myself in it.
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getLoboMeta>>>>(
      roomId,
      (meta) => {
        if (cancelled) return;
        setRoomMeta(meta);
        if (!meta) return setStatus("not-found");
        if (meta.game !== "lobo") return router.replace(`/sala/${roomId}`);
        setConfig({ hostId: meta.hostId ?? "", daySeconds: meta.daySeconds ?? 180 });
        unsub ??= subscribeLobo(roomId, setState);
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
    joinLobo(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const timed = state?.status === "night" || state?.status === "day";
  const now = useServerNow(timed);
  const seconds = state?.status === "night" ? NIGHT_SECONDS : (config?.daySeconds ?? 180);
  const deadline = (state?.phaseStartedAt ?? 0) + seconds * 1000;
  const expired = timed && now > 0 && now >= deadline;
  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  const livingHere = state ? living(state).filter((id) => id in presence) : [];
  // Players who left don't block: close once every living player still here acted.
  const allActed =
    !!state &&
    presenceLoaded &&
    livingHere.length > 0 &&
    ((state.status === "night" && livingHere.every((id) => state.actions[id])) ||
      (state.status === "day" && livingHere.every((id) => state.votes[id])));
  const round = state?.round ?? 0;
  const phase = state?.status;
  useEffect(() => {
    if (!expired && !allActed) return;
    if (phase === "night") closeNight(roomId, round).catch(console.error);
    if (phase === "day") closeDay(roomId, round).catch(console.error);
  }, [expired, allActed, phase, roomId, round]);

  if (!configured) return <FirebaseSetupNotice />;

  const myRole = state?.roles[myId];
  const inGame = !!myRole;
  const dead = inGame && !state?.alive[myId];
  // The dead and spectators see every role.
  const omniscient = !!state && (!inGame || dead || state.status === "finished");

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="lobo"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="lobo" />
        )}

        {status === "loading" && <RoomLoading text="Cae la noche sobre el pueblo…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="lobo"
              roomId={roomId}
              hostId={config.hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`Día de ${Math.round(config.daySeconds / 60)} min · ${
                connected.length >= MIN_PLAYERS ? `${wolvesFor(connected.length)} ${wolvesFor(connected.length) === 1 ? "lobo" : "lobos"}, vidente y médico` : "lobos, vidente y médico"
              }`}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              minToStart={MIN_PLAYERS}
              onStart={() => startLobo(roomId, connected)}
            />
          </div>
        )}

        {status === "ready" && state && config && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-col gap-4 lg:flex-1">
              {myRole && state.status !== "finished" && (
                <RoleCard role={myRole} dead={dead} shown={roleShown} onToggle={() => setRoleShown((v) => !v)} />
              )}
              {!inGame && state.status !== "finished" && (
                <p className={`${CARD} !p-3 text-center text-sm text-slate-400`}>
                  La partida ya empezó: mirás en silencio y jugás la próxima. 🤫
                </p>
              )}
              {timed && <TimeBar left={Math.max(0, deadline - now)} total={seconds} night={state.status === "night"} />}
              {state.status === "night" && (
                <NightPanel roomId={roomId} state={state} myId={myId} livingHere={livingHere} omniscient={omniscient} />
              )}
              {state.status === "day" && (
                <DayPanel roomId={roomId} state={state} myId={myId} livingHere={livingHere} />
              )}
              {state.status === "dusk" && <DuskPanel roomId={roomId} state={state} myId={myId} />}
              {state.status === "finished" && <FinalPanel roomId={roomId} state={state} myId={myId} />}
            </div>
            <Villagers state={state} presence={presence} myId={myId} omniscient={omniscient} secretsShown={roleShown} />
          </div>
        )}
      </main>
    </div>
  );
}

function nameOf(state: LoboState, id: string, myId: string): string {
  return id === myId ? "Vos" : (state.players[id]?.name ?? "?");
}

function RoleCard({ role, dead, shown, onToggle }: { role: Role; dead: boolean; shown: boolean; onToggle: () => void }) {
  const info = ROLES[role];
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
        info.team === "lobos" && shown ? "border-red-500/50 bg-red-950/40" : "border-slate-700 bg-slate-900/70"
      }`}
    >
      <span className="text-3xl">{shown ? info.emoji : "🂠"}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs uppercase tracking-wide text-slate-500">
          Tu rol {dead && "· estás eliminado/a"}
        </span>
        <span className="block font-display text-lg font-semibold text-slate-100">{shown ? info.label : "Tocá para verlo (que nadie mire)"}</span>
        {shown && <span className="block text-sm text-slate-400">{info.goal}</span>}
      </span>
      {shown ? <EyeOff className="h-5 w-5 text-slate-500" /> : <Eye className="h-5 w-5 text-slate-500" />}
    </button>
  );
}

function TimeBar({ left, total, night }: { left: number; total: number; night: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ease-linear ${
            night ? "bg-gradient-to-r from-indigo-500 to-violet-500" : "bg-gradient-to-r from-amber-400 to-orange-500"
          }`}
          style={{ width: `${Math.min(100, (left / (total * 1000)) * 100)}%` }}
        />
      </div>
      <span className="w-12 text-right font-mono text-xs text-slate-400">
        {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}
      </span>
    </div>
  );
}

function PlayerButton({
  state,
  id,
  myId,
  chosen,
  onClick,
  extra,
}: {
  state: LoboState;
  id: string;
  myId: string;
  chosen: boolean;
  onClick: () => void;
  extra?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
        chosen ? "border-violet-400 bg-violet-500/15 shadow-[0_0_18px_rgba(139,92,246,0.35)]" : "border-slate-700 bg-slate-950/40 hover:border-slate-500"
      }`}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ backgroundColor: state.players[id]?.color ?? "#64748b" }}
      >
        {state.players[id]?.name.slice(0, 1).toUpperCase() ?? "?"}
      </span>
      <span className="min-w-0 flex-1 truncate text-slate-100">{nameOf(state, id, myId)}</span>
      {extra && <span className="text-xs text-slate-400">{extra}</span>}
    </button>
  );
}

function NightPanel({
  roomId,
  state,
  myId,
  livingHere,
  omniscient,
}: {
  roomId: string;
  state: LoboState;
  myId: string;
  livingHere: string[];
  omniscient: boolean;
}) {
  const role = state.roles[myId];
  const alive = !!state.alive[myId];
  const mine = state.actions[myId];
  const acted = livingHere.filter((id) => state.actions[id]).length;
  const targets = role && alive ? living(state).filter((id) => canTarget(state, myId, role, id)) : [];
  const wolfPicks = Object.entries(state.actions).filter(([id]) => state.roles[id] === "lobo");

  return (
    <div className={`${CARD} flex flex-col gap-4 bg-gradient-to-b from-indigo-950/60 to-slate-900/60`}>
      <div className="text-center">
        <p className="font-display text-2xl font-semibold text-indigo-100">🌙 Noche {state.round}</p>
        <p className="text-sm text-slate-400">Todos eligen en secreto. Que nadie mire tu pantalla.</p>
      </div>

      {role && alive && !mine && (
        <>
          <p className="text-center font-medium text-slate-200">{ROLES[role].night}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {targets.map((id) => {
              const wolfVotes = role === "lobo" ? wolfPicks.filter(([, t]) => t === id).length : 0;
              return (
                <PlayerButton
                  key={id}
                  state={state}
                  id={id}
                  myId={myId}
                  chosen={false}
                  extra={wolfVotes ? `🐺×${wolfVotes}` : undefined}
                  onClick={() => nightAction(roomId, myId, state.round, id, livingHere)}
                />
              );
            })}
          </div>
        </>
      )}

      {role && alive && mine && (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-slate-200">
            Elegiste a <strong>{nameOf(state, mine, myId)}</strong>.
          </p>
          {role === "vidente" && (
            <p
              className={`animate-celebration-in rounded-xl px-4 py-2 font-display text-xl font-bold ${
                state.roles[mine] === "lobo" ? "bg-red-500/20 text-red-300" : "bg-emerald-500/15 text-emerald-300"
              }`}
            >
              {state.roles[mine] === "lobo" ? "🐺 ¡Es un lobo!" : "😇 No es lobo"}
            </p>
          )}
          {role === "lobo" && wolfPicks.length > 1 && (
            <p className="text-xs text-slate-400">
              La manada: {wolfPicks.map(([id, t]) => `${nameOf(state, id, myId)} → ${nameOf(state, t, myId)}`).join(" · ")}
            </p>
          )}
          <p className="text-sm text-slate-500">Esperando que amanezca…</p>
        </div>
      )}

      {omniscient && Object.keys(state.actions).length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-slate-500">
          {Object.entries(state.actions).map(([id, t]) => (
            <li key={id}>
              {ROLES[state.roles[id]]?.emoji} {nameOf(state, id, myId)} → {nameOf(state, t, myId)}
            </li>
          ))}
        </ul>
      )}

      <p className="text-center text-xs text-slate-500">
        Eligieron {acted} de {livingHere.length}
      </p>
    </div>
  );
}

function DayPanel({ roomId, state, myId, livingHere }: { roomId: string; state: LoboState; myId: string; livingHere: string[] }) {
  const alive = !!state.alive[myId];
  const mine = state.votes[myId];
  const counts = new Map(tally(state.votes));
  const voted = livingHere.filter((id) => state.votes[id]).length;

  return (
    <div className="flex flex-col gap-4">
      <div className={`${CARD} animate-celebration-in text-center bg-gradient-to-b from-amber-950/40 to-slate-900/60`}>
        <p className="font-display text-2xl font-semibold text-amber-100">☀️ Amanece en el pueblo</p>
        <p className="mt-2 text-lg text-slate-200">
          {state.dawn.killed
            ? `Los lobos atacaron a ${nameOf(state, state.dawn.killed, myId)}. ${state.dawn.killed === myId ? "Quedaste fuera 💀" : "💀"}`
            : state.dawn.saved
              ? "Los lobos atacaron… ¡pero el médico llegó a tiempo! Nadie murió. 🩺"
              : "Nadie murió esta noche."}
        </p>
      </div>

      <div className={`${CARD} flex flex-col gap-3`}>
        <p className="text-center text-sm text-slate-300">
          {alive ? "Discutan y voten a quién eliminar. Podés cambiar el voto hasta que voten todos." : "Los vivos están votando…"}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {living(state).map((id) => (
            <PlayerButton
              key={id}
              state={state}
              id={id}
              myId={myId}
              chosen={mine === id}
              extra={counts.get(id) ? `🗳️ ${counts.get(id)}` : undefined}
              onClick={() => alive && dayVote(roomId, myId, state.round, id, livingHere)}
            />
          ))}
          <button
            onClick={() => alive && dayVote(roomId, myId, state.round, NOBODY, livingHere)}
            className={`rounded-xl border px-3 py-2.5 text-sm transition ${
              mine === NOBODY ? "border-violet-400 bg-violet-500/15" : "border-slate-700 bg-slate-950/40 hover:border-slate-500"
            } text-slate-300`}
          >
            Nadie {counts.get(NOBODY) ? `🗳️ ${counts.get(NOBODY)}` : ""}
          </button>
        </div>
        <p className="text-center text-xs text-slate-500">
          Votaron {voted} de {livingHere.length}. Un empate no elimina a nadie.
        </p>
      </div>
    </div>
  );
}

function DuskPanel({ roomId, state, myId }: { roomId: string; state: LoboState; myId: string }) {
  const id = state.lynch.id;
  const role = id ? state.roles[id] : undefined;
  return (
    <div className={`${CARD} animate-celebration-in flex flex-col items-center gap-3 text-center`}>
      <p className="font-display text-2xl font-semibold text-slate-100">🌇 El pueblo decidió</p>
      {id && role ? (
        <p className="text-lg text-slate-200">
          Eliminaron a {nameOf(state, id, myId)}, que era… <strong>{ROLES[role].emoji} {ROLES[role].label}</strong>
        </p>
      ) : (
        <p className="text-lg text-slate-300">{state.lynch.tie ? "Hubo empate: nadie fue eliminado." : "Decidieron no eliminar a nadie."}</p>
      )}
      <button onClick={() => nextNight(roomId, state.round)} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
        Cae la noche 🌙
      </button>
    </div>
  );
}

function FinalPanel({ roomId, state, myId }: { roomId: string; state: LoboState; myId: string }) {
  const myRole = state.roles[myId];
  const iWon = !!myRole && ROLES[myRole].team === state.winner;
  return (
    <div className="animate-celebration-in flex flex-col items-center gap-3 rounded-2xl border border-violet-500/25 bg-slate-900 p-6 text-center">
      <p className="font-display text-2xl font-bold text-slate-100">
        {state.winner === "lobos" ? "🐺 ¡Ganaron los lobos!" : "🧑‍🌾 ¡Ganó el pueblo!"}
      </p>
      {myRole && <p className="text-slate-300">{iWon ? "🎉 Tu equipo ganó." : "Tu equipo perdió esta vez."}</p>}
      {state.lynch.id && (
        <p className="text-sm text-slate-400">Último eliminado: {nameOf(state, state.lynch.id, myId)}</p>
      )}
      {!state.lynch.id && state.dawn.killed && (
        <p className="text-sm text-slate-400">Última víctima de los lobos: {nameOf(state, state.dawn.killed, myId)}</p>
      )}
      <button onClick={() => playAgain(roomId, state.gameNo)} className={`w-full max-w-xs ${SECONDARY_BUTTON}`}>
        Jugar de nuevo (roles nuevos)
      </button>
    </div>
  );
}

function Villagers({
  state,
  presence,
  myId,
  omniscient,
  secretsShown,
}: {
  state: LoboState;
  presence: PresenceMap;
  myId: string;
  omniscient: boolean;
  /** My role card is face up; otherwise what only I know stays hidden from onlookers. */
  secretsShown: boolean;
}) {
  const myRole = secretsShown ? state.roles[myId] : undefined;
  const ids = Object.keys(state.roles).sort((a, b) => Number(!!state.alive[b]) - Number(!!state.alive[a]));
  const seerSeen = myRole === "vidente" ? Object.values(state.seerLog) : [];
  return (
    <aside className={`${CARD} !p-4 w-full lg:w-72`}>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">El pueblo</h2>
      <ol className="flex flex-col gap-1.5 text-sm">
        {ids.map((id) => {
          const role = state.roles[id];
          // What I know: everything if omniscient; fellow wolves if I'm one; what the seer saw.
          const known =
            omniscient ||
            (id === myId && secretsShown) ||
            (myRole === "lobo" && role === "lobo") ||
            (seerSeen.includes(id) && role === "lobo") ||
            !state.alive[id];
          const seenGood = !omniscient && myRole === "vidente" && seerSeen.includes(id) && role !== "lobo";
          return (
            <li key={id} className={`flex items-center gap-2 ${state.alive[id] ? "" : "opacity-50"} ${id in presence ? "" : "italic"}`}>
              <span className={`flex-1 truncate ${state.alive[id] ? "" : "line-through"}`} style={{ color: state.players[id]?.color }}>
                {nameOf(state, id, myId)}
              </span>
              {!state.alive[id] && <span>💀</span>}
              <span className="w-6 text-center" title={known ? ROLES[role].label : seenGood ? "No es lobo" : "?"}>
                {known ? ROLES[role].emoji : seenGood ? "😇" : "❔"}
              </span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
