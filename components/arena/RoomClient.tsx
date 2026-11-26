"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  MODE_INFO,
  SURVIVAL_MAX,
  awardOutcome,
  chooseTeam,
  getArenaMeta,
  isBot,
  joinArena,
  nextOnlineMatch,
  normalizeMeta,
  shuffleTeams,
  startMatch,
  subscribeArena,
  teamInfo,
  type ArenaMeta,
  type ArenaState,
} from "@/lib/arena";
import { TEAMS, type TeamId } from "@/lib/teams";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { serverNow } from "@/lib/serverTime";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import { OpenRoomBeacon } from "@/components/RoomAccess";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { RoomSettingsEditor } from "@/components/RoomSettings";
import { watchRoomMeta } from "@/lib/roomSettings";
import Battle from "./Battle";
import Pad from "./Pad";
import { SETTINGS } from "./settings";
import { MAPS } from "@/lib/arenaMaps";
import { Bot, Eye, Shuffle, Smartphone } from "lucide-react";
import { useAwardMatch } from "@/hooks/useAwardMatch";
import { PROGRESS_EVENT, levelOf, loadProgress, loadRating, validLook } from "@/lib/arenaProgress";
import { DEFAULT_RATING } from "@/lib/arena";

type Status = "loading" | "not-found" | "ready" | "error";

export function settingsSummary(meta: ArenaMeta): string {
  const extras = [meta.bots && meta.mode !== "supervivencia" && "con bots", meta.events && "eventos", meta.potions && "pociones", meta.regen && "regeneración"].filter(Boolean);
  const where = meta.view === "pantalla" ? " · en pantalla grande" : "";
  const arena = meta.map === "azar" ? "arena al azar" : MAPS[meta.map].label;
  const how =
    meta.mode === "todos"
      ? `Todos contra todos · ${meta.ffa} caballeros · gana quien gane ${meta.wins} rondas`
      : meta.mode === "rey"
        ? `Rey de la colina · ${meta.size} contra ${meta.size}`
        : meta.mode === "supervivencia"
          ? `Supervivencia · hasta ${SURVIVAL_MAX} contra oleadas`
          : `${meta.size} contra ${meta.size} · al mejor de ${meta.wins * 2 - 1} rondas`;
  return `${how} · ${arena}${extras.map((e) => ` · ${e}`).join("")}${where}`;
}

/** An arena room: teams while waiting, then the battle full screen. */
export default function RoomClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<ArenaMeta | null>(null);
  const [state, setState] = useState<ArenaState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    // Followed live: the host can change the settings while waiting.
    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getArenaMeta>>>>(
      roomId,
      (raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== "arena") return router.replace(`/sala/${roomId}`);
        setMeta(normalizeMeta(raw));
        unsub ??= subscribeArena(roomId, setState);
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
  const size = meta?.size ?? 1;
  const mode = meta?.mode ?? "equipos";
  const ffa = meta?.ffa ?? 4;
  // My knight's look and level (and the hidden rating) go with my player info, again whenever they change.
  const [progressNo, setProgressNo] = useState(0);
  useEffect(() => {
    const bump = () => setProgressNo((n) => n + 1);
    window.addEventListener(PROGRESS_EVENT, bump);
    return () => window.removeEventListener(PROGRESS_EVENT, bump);
  }, []);
  useEffect(() => {
    if (!hasState || !identity.clientId || !identity.name) return;
    const p = loadProgress();
    const lv = levelOf(p.xp).level;
    const player = { name: identity.name, color: identity.color, look: validLook(p.look, lv), lv, sk: Math.round(loadRating(DEFAULT_RATING)) };
    joinArena(roomId, identity.clientId, player, { size, mode, ffa }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color, size, mode, ffa, progressNo]);

  // Ranking, once the match (all its rounds) is over: teams are 1st or 2nd of two («equipos»,
  // «rey»), «todos» places everyone by rounds won and knockouts, «supervivencia» has no places.
  useAwardMatch("arena", roomId, state?.gameNo ?? 0, state ? awardOutcome(state, myId) : null);

  // Public arena: the next match starts by itself with whoever is here.
  const online = !!state?.online;
  // Also when the battle on now was left with only bots (its people are gone): start one with whoever is here.
  const abandoned =
    online && !!state && (state.status === "fighting" || state.status === "roundEnd") && !Object.keys(state.roster).some((id) => !isBot(id) && id in presence);
  const waitingNext = online && !!state && (state.status === "waiting" || state.status === "finished" || abandoned) && presenceLoaded && !!state.players[myId];
  const nextAt = state?.nextAt ?? 0;
  const connectedKey = Object.keys(presence).sort().join(",");
  useEffect(() => {
    if (!waitingNext) return;
    const wait = Math.max(0, nextAt - serverNow()) + 300 + Math.random() * 500;
    const t = setTimeout(() => nextOnlineMatch(roomId, connectedKey.split(",")).catch(console.error), wait);
    return () => clearTimeout(t);
  }, [waitingNext, nextAt, roomId, connectedKey]);

  if (!configured) return <FirebaseSetupNotice />;

  if (status === "ready" && state && meta && online) {
    return state.status === "waiting" ? (
      <div className="flex min-h-dvh flex-col">
        {identity.clientId && !identity.name && <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la arena" invitedTo="arena" />}
        <RoomLoading text="Armando la batalla…" />
      </div>
    ) : (
      <Battle roomId={roomId} meta={meta} state={state} myId={myId} presence={presence} presenceLoaded={presenceLoaded} />
    );
  }

  // Big screen: the fight is on the TV; this phone is the pad.
  if (status === "ready" && state && meta && state.status !== "waiting" && meta.view === "pantalla") {
    return (
      <>
        <OpenRoomBeacon roomId={roomId} game="arena" />
        <Pad roomId={roomId} clientId={myId} state={state} />
      </>
    );
  }

  if (status === "ready" && state && meta && state.status !== "waiting") {
    return (
      <>
        <OpenRoomBeacon roomId={roomId} game="arena" />
        <Battle roomId={roomId} meta={meta} state={state} myId={myId} presence={presence} presenceLoaded={presenceLoaded} />
      </>
    );
  }

  const connected = Object.keys(presence);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader game="arena" roomId={roomId} right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />} />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la arena" invitedTo="arena" />}

        {status === "loading" && <RoomLoading text="Afilando espadas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && meta && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="arena"
              roomId={roomId}
              hostId={meta.hostId ?? ""}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={settingsSummary(meta)}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={meta} />}
              onStart={() => startMatch(roomId, meta, connected)}
            >
              <div className="flex gap-2.5 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-100 ring-1 ring-amber-400/20">
                <Smartphone className="mt-0.5 h-5 w-5 shrink-0" />
                <p>
                  {MODE_INFO[meta.mode].label}: {MODE_INFO[meta.mode].hint} Cada uno pelea desde su teléfono (horizontal) o su computadora con mouse y
                  teclado. Las armas están tiradas por la arena: ¡corre a buscarlas!
                </p>
              </div>
              <TeamPicker roomId={roomId} meta={meta} state={state} myId={myId} connected={connected} presenceLoaded={presenceLoaded} />
            </WaitingRoom>
          </div>
        )}
      </main>
    </div>
  );
}

function TeamPicker({
  roomId,
  meta,
  state,
  myId,
  connected,
  presenceLoaded,
}: {
  roomId: string;
  meta: ArenaMeta;
  state: ArenaState;
  myId: string;
  connected: string[];
  presenceLoaded: boolean;
}) {
  if (meta.mode === "todos" || meta.mode === "supervivencia") {
    return <FighterPicker roomId={roomId} meta={meta} state={state} myId={myId} connected={connected} presenceLoaded={presenceLoaded} />;
  }
  const here = (id: string) => !presenceLoaded || connected.includes(id);
  const members = (team: TeamId) => Object.keys(state.teams).filter((id) => state.teams[id] === team && here(id));
  const mine = state.teams[myId] ?? null;
  const watchers = Object.keys(state.players).filter((id) => !state.teams[id] && here(id));
  const red = members("red").length;
  const blue = members("blue").length;
  const ready = meta.bots ? red + blue > 0 : red > 0 && blue > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {TEAMS.map((t) => {
          const list = members(t.id);
          const full = list.length >= meta.size;
          return (
            <div key={t.id} className="flex flex-col gap-1.5 rounded-xl border bg-slate-950/40 p-3" style={{ borderColor: `${t.color}66` }}>
              <p className="text-center text-sm font-semibold" style={{ color: t.color }}>
                {t.label}
              </p>
              {Array.from({ length: meta.size }, (_, i) => {
                const id = list[i];
                return (
                  <p key={i} className={`flex items-center justify-center gap-1 rounded-lg bg-slate-900/70 px-2 py-1.5 text-center text-sm ${id ? "text-slate-100" : "text-slate-500"}`}>
                    {id ? (
                      id === myId ? "Tú" : state.players[id]?.name
                    ) : meta.bots ? (
                      <>
                        <Bot className="h-3.5 w-3.5" /> bot
                      </>
                    ) : (
                      "libre"
                    )}
                  </p>
                );
              })}
              {mine !== t.id && (
                <button
                  onClick={() => chooseTeam(roomId, myId, t.id, meta)}
                  disabled={full}
                  className="rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-40"
                  style={{ borderColor: t.color, color: t.color }}
                >
                  {full ? "Completo" : "Unirme"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
        {mine && (
          <button onClick={() => chooseTeam(roomId, myId, null, meta)} className="flex items-center gap-1 text-slate-500 hover:text-slate-300">
            <Eye className="h-3.5 w-3.5" /> Prefiero mirar
          </button>
        )}
        {connected.length > 1 && (
          <button onClick={() => shuffleTeams(roomId, connected, meta.size)} className="flex items-center gap-1 rounded-md border border-slate-600 px-2 py-1 text-slate-300 hover:border-slate-400">
            <Shuffle className="h-3.5 w-3.5" /> Mezclar equipos
          </button>
        )}
      </div>
      {watchers.length > 0 && (
        <p className="text-center text-xs text-slate-500">
          Mirando: {watchers.map((id) => (id === myId ? "tú" : state.players[id]?.name)).join(", ")}
        </p>
      )}
      <p className="text-center text-xs text-slate-500">
        {ready
          ? meta.bots && (red < meta.size || blue < meta.size)
            ? "Los lugares libres los ocupan bots."
            : "¡Listos para la batalla!"
          : meta.bots
            ? "Elige un equipo para pelear."
            : `Hace falta al menos uno en cada equipo (${teamInfo("red").label.toLowerCase()} y ${teamInfo("blue").label.toLowerCase()}).`}
      </p>
    </div>
  );
}

/** «Todos contra todos» and «Supervivencia»: no teams, just who fights (up to the mode's places) and who watches. */
function FighterPicker({
  roomId,
  meta,
  state,
  myId,
  connected,
  presenceLoaded,
}: {
  roomId: string;
  meta: ArenaMeta;
  state: ArenaState;
  myId: string;
  connected: string[];
  presenceLoaded: boolean;
}) {
  const here = (id: string) => !presenceLoaded || connected.includes(id);
  const fighting = Object.keys(state.teams).filter(here);
  const watchers = Object.keys(state.players).filter((id) => !state.teams[id] && here(id));
  const survival = meta.mode === "supervivencia";
  const places = survival ? SURVIVAL_MAX : meta.ffa;
  const mine = !!state.teams[myId];
  const full = Object.keys(state.teams).length >= places;
  const bots = survival ? 0 : meta.bots ? Math.max(0, places - fighting.length) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5 rounded-xl border border-amber-400/40 bg-slate-950/40 p-3">
        <p className="text-center text-sm font-semibold text-amber-200">{survival ? "Defensores" : "Caballeros"}</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {fighting.map((id) => (
            <p key={id} className="truncate rounded-lg bg-slate-900/70 px-2 py-1.5 text-center text-sm text-slate-100">
              {id === myId ? "Tú" : state.players[id]?.name}
            </p>
          ))}
          {Array.from({ length: bots }, (_, i) => (
            <p key={`b${i}`} className="flex items-center justify-center gap-1 rounded-lg bg-slate-900/70 px-2 py-1.5 text-center text-sm text-slate-500">
              <Bot className="h-3.5 w-3.5" /> bot
            </p>
          ))}
        </div>
        {mine ? (
          <button onClick={() => chooseTeam(roomId, myId, null, meta)} className="mx-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
            <Eye className="h-3.5 w-3.5" /> Prefiero mirar
          </button>
        ) : (
          <button
            onClick={() => chooseTeam(roomId, myId, "red", meta)}
            disabled={full}
            className="mx-auto rounded-md border border-amber-300 px-3 py-1 text-xs font-medium text-amber-200 disabled:opacity-40"
          >
            {full ? "Completo" : "Pelear"}
          </button>
        )}
      </div>
      {watchers.length > 0 && (
        <p className="text-center text-xs text-slate-500">
          Mirando: {watchers.map((id) => (id === myId ? "tú" : state.players[id]?.name)).join(", ")}
        </p>
      )}
      <p className="text-center text-xs text-slate-500">
        {survival
          ? `Hasta ${SURVIVAL_MAX} personas juntas contra oleadas de bots.`
          : fighting.length + bots >= 2
            ? bots
              ? "Los lugares libres los ocupan bots."
              : "¡Listos para la batalla!"
            : "Hacen falta al menos dos caballeros (o activa los bots)."}
      </p>
    </div>
  );
}
