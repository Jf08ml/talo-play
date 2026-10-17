"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  chooseTeam,
  getArenaMeta,
  joinArena,
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
import { useRoomPresence } from "@/hooks/useRoomPresence";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import Battle from "./Battle";
import { Bot, Eye, Shuffle, Smartphone } from "lucide-react";

type Status = "loading" | "not-found" | "ready" | "error";

export function settingsSummary(meta: ArenaMeta): string {
  const extras = [meta.bots && "con bots", meta.potions && "pociones", meta.regen && "regeneración"].filter(Boolean);
  return `${meta.size} contra ${meta.size} · al mejor de ${meta.wins * 2 - 1} rondas${extras.map((e) => ` · ${e}`).join("")}`;
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
    let unsub: (() => void) | null = null;
    getArenaMeta(roomId)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== "arena") return router.replace(`/sala/${roomId}`);
        setMeta(normalizeMeta(raw));
        unsub = subscribeArena(roomId, setState);
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
  const size = meta?.size ?? 1;
  useEffect(() => {
    if (!hasState || !identity.clientId || !identity.name) return;
    joinArena(roomId, identity.clientId, { name: identity.name, color: identity.color }, size).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color, size]);

  if (!configured) return <FirebaseSetupNotice />;

  if (status === "ready" && state && meta && state.status !== "waiting") {
    return <Battle roomId={roomId} meta={meta} state={state} myId={myId} presence={presence} presenceLoaded={presenceLoaded} />;
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
              onStart={() => startMatch(roomId, meta, connected)}
            >
              <div className="flex gap-2.5 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-100 ring-1 ring-amber-400/20">
                <Smartphone className="mt-0.5 h-5 w-5 shrink-0" />
                <p>
                  Cada uno pelea desde su teléfono (horizontal) o su compu con mouse y teclado. Las armas están tiradas por la arena:
                  ¡corré a buscarlas!
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
                      id === myId ? "Vos" : state.players[id]?.name
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
                  onClick={() => chooseTeam(roomId, myId, t.id, meta.size)}
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
          <button onClick={() => chooseTeam(roomId, myId, null, meta.size)} className="flex items-center gap-1 text-slate-500 hover:text-slate-300">
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
          Mirando: {watchers.map((id) => (id === myId ? "vos" : state.players[id]?.name)).join(", ")}
        </p>
      )}
      <p className="text-center text-xs text-slate-500">
        {ready
          ? meta.bots && (red < meta.size || blue < meta.size)
            ? "Los lugares libres los ocupan bots."
            : "¡Listos para la batalla!"
          : meta.bots
            ? "Elegí un equipo para pelear."
            : `Hace falta al menos uno en cada equipo (${teamInfo("red").label.toLowerCase()} y ${teamInfo("blue").label.toLowerCase()}).`}
      </p>
    </div>
  );
}
