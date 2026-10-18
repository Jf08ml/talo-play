"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  chooseTeam,
  getFuegoMeta,
  joinFuego,
  normalizeMeta,
  shuffleTeams,
  startMatch,
  subscribeFuego,
  type FuegoMeta,
  type FuegoState,
} from "@/lib/fuego";
import { MAPS } from "@/lib/fuegoMaps";
import { TEAMS } from "@/lib/teams";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import Battle from "./Battle";
import { Bot, Shuffle, Smartphone } from "lucide-react";

type Status = "loading" | "not-found" | "ready" | "error";

const LEVEL_LABEL = { facil: "fáciles", normal: "normales", dificil: "difíciles" } as const;

export function settingsSummary(meta: FuegoMeta): string {
  const map = MAPS[meta.map];
  const mode = meta.mode === "equipos" ? `${meta.size / 2} contra ${meta.size / 2}` : `todos contra todos (${meta.size})`;
  return `${map.name} · ${mode} · a ${meta.goal} bajas · ${meta.minutes} min${meta.bots ? ` · bots ${LEVEL_LABEL[meta.level]}` : ""}`;
}

/** A Fuego cruzado room: the waiting room (teams if it's a team game), then the match full screen. */
export default function RoomClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<FuegoMeta | null>(null);
  const [state, setState] = useState<FuegoState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | null = null;
    getFuegoMeta(roomId)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== "fuego") return router.replace(`/sala/${roomId}`);
        setMeta(normalizeMeta(raw));
        unsub = subscribeFuego(roomId, setState);
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
    joinFuego(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;

  if (status === "ready" && state && meta && state.status !== "waiting") {
    return <Battle roomId={roomId} meta={meta} state={state} myId={myId} presence={presence} presenceLoaded={presenceLoaded} />;
  }

  const connected = Object.keys(presence);
  const people = connected.filter((id) => state?.players[id]).length;
  const missing = meta ? (meta.bots ? people < 1 : people < 2) : true;

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader game="fuego" roomId={roomId} right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />} />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la partida" invitedTo="fuego" />}

        {status === "loading" && <RoomLoading text="Cargando armas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && meta && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="fuego"
              roomId={roomId}
              hostId={meta.hostId ?? ""}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={settingsSummary(meta)}
              onStart={() => startMatch(roomId, meta, connected)}
            >
              <div className="flex gap-2.5 rounded-xl bg-sky-500/10 p-3 text-sm text-sky-100 ring-1 ring-sky-400/20">
                <Smartphone className="mt-0.5 h-5 w-5 shrink-0" />
                <p>
                  Cada uno juega desde su teléfono (horizontal) o su compu con mouse y teclado. Arrancás con fusil, pistola y dos
                  granadas: las armas pesadas están repartidas por el mapa.
                </p>
              </div>
              {meta.mode === "equipos" && <TeamPicker roomId={roomId} state={state} myId={myId} connected={connected} size={meta.size} bots={meta.bots} />}
              {meta.mode === "todos" && meta.bots && people < meta.size && (
                <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
                  <Bot className="h-3.5 w-3.5" /> Los lugares libres ({meta.size - Math.min(people, meta.size)}) los ocupan bots.
                </p>
              )}
              {missing && <p className="text-center text-sm text-amber-300/90">Hacen falta al menos 2 jugadores (o activar los bots).</p>}
            </WaitingRoom>
          </div>
        )}
      </main>
    </div>
  );
}

function TeamPicker({
  roomId,
  state,
  myId,
  connected,
  size,
  bots,
}: {
  roomId: string;
  state: FuegoState;
  myId: string;
  connected: string[];
  size: number;
  bots: boolean;
}) {
  const half = size / 2;
  const members = (team: "red" | "blue") => connected.filter((id) => state.players[id] && (state.teams[id] ?? "red") === team);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {TEAMS.map((t) => {
          const list = members(t.id);
          return (
            <div key={t.id} className="flex flex-col gap-1.5 rounded-xl border bg-slate-950/40 p-3" style={{ borderColor: `${t.color}66` }}>
              <p className="text-center text-sm font-semibold" style={{ color: t.color }}>
                {t.label}
              </p>
              {Array.from({ length: Math.max(half, list.length) }, (_, i) => {
                const id = list[i];
                return (
                  <p key={i} className={`flex items-center justify-center gap-1 rounded-lg bg-slate-900/70 px-2 py-1.5 text-center text-sm ${id ? "text-slate-100" : "text-slate-500"}`}>
                    {id ? (id === myId ? "Vos" : state.players[id]?.name) : bots ? (
                      <>
                        <Bot className="h-3.5 w-3.5" /> bot
                      </>
                    ) : (
                      "libre"
                    )}
                  </p>
                );
              })}
              {(state.teams[myId] ?? "red") !== t.id && (
                <button onClick={() => chooseTeam(roomId, myId, t.id)} className="rounded-md border px-3 py-1 text-xs font-medium" style={{ borderColor: t.color, color: t.color }}>
                  Unirme
                </button>
              )}
            </div>
          );
        })}
      </div>
      {connected.length > 1 && (
        <button onClick={() => shuffleTeams(roomId, connected)} className="mx-auto flex items-center gap-1 rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:border-slate-400">
          <Shuffle className="h-3.5 w-3.5" /> Mezclar equipos
        </button>
      )}
    </div>
  );
}
