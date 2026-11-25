"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  DIFFICULTIES,
  getGravedadMeta,
  joinGravedad,
  nextOnlineRound,
  normalizeMeta,
  playAgain,
  playerInfo,
  startGravedad,
  subscribeGravedad,
  type GravedadMeta,
  type GravedadState,
} from "@/lib/gravedadRoom";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useServerNow } from "@/hooks/useServerNow";
import { serverNow } from "@/lib/serverTime";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import GameResults from "@/components/Results";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { BackToRoomButton, RoomSettingsEditor } from "@/components/RoomSettings";
import { watchRoomMeta } from "@/lib/roomSettings";
import { PRIMARY_BUTTON } from "@/components/ui";
import { SETTINGS } from "../settings";
import { placeIn, useAwardMatch } from "@/hooks/useAwardMatch";

const RaceGame = dynamic(() => import("@/components/gravedad/RaceGame"), { ssr: false });

type Status = "loading" | "not-found" | "ready" | "error";

function summary(meta: GravedadMeta): string {
  const diff = DIFFICULTIES.find((d) => d.id === meta.difficulty)?.label ?? "";
  return `${meta.rounds} carreras · niveles ${diff.toLowerCase()}${meta.bots ? ` · ${meta.bots} ${meta.bots === 1 ? "bot" : "bots"}` : ""}`;
}

export default function GravedadClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<GravedadMeta | null>(null);
  const [state, setState] = useState<GravedadState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getGravedadMeta>>>>(
      roomId,
      (raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== "gravedad") return router.replace(`/sala/${roomId}`);
        setMeta(normalizeMeta(raw));
        unsub ??= subscribeGravedad(roomId, setState);
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
    joinGravedad(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  // Online: the next race starts by itself.
  const online = !!state?.online;
  const waitingNext = online && !!state && state.status !== "playing" && presenceLoaded && !!state.players[myId];
  const nextAt = state?.nextAt ?? 0;
  const connectedKey = Object.keys(presence).sort().join(",");
  useEffect(() => {
    if (!waitingNext) return;
    const wait = Math.max(0, nextAt - serverNow()) + Math.random() * 400;
    const t = setTimeout(() => nextOnlineRound(roomId, connectedKey.split(",")).catch(console.error), wait);
    return () => clearTimeout(t);
  }, [waitingNext, nextAt, roomId, connectedKey]);

  // Ranking: my place by points once every round is played. Bots are shown as bots in friends'
  // rooms; online they pass for people, so they count as such.
  useAwardMatch(
    "gravedad",
    roomId,
    `${state?.gameNo ?? 0}:${state?.seed ?? 0}`,
    state?.status === "finished" && state.roster.includes(myId)
      ? {
          place: placeIn(state.roster.map((id) => ({ id, score: state.scores[id] ?? 0 })), myId),
          players: state.roster.length,
          vsBotsOnly: !state.online && state.roster.every((id) => id === myId || id in state.bots),
        }
      : null
  );

  if (!configured) return <FirebaseSetupNotice />;
  const connected = Object.keys(presence);
  const race = (
    <RaceGame roomId={roomId} state={state!} myId={myId} myColor={identity.color} presence={presence} presenceLoaded={presenceLoaded} />
  );

  return (
    <div className="flex h-dvh flex-col bg-talo-ink">
      <RoomHeader game="gravedad" roomId={roomId} social={!online} right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />} />
      {identity.clientId && !identity.name && <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="gravedad" />}

      {status === "loading" && <RoomLoading text="Dando vuelta la gravedad…" />}
      {status === "not-found" && <RoomNotFound />}
      {status === "error" && <RoomError message="No se pudo cargar la sala." />}

      {status === "ready" && state && meta && state.status === "waiting" && !online && (
        <main className="mx-auto w-full max-w-2xl overflow-y-auto p-4">
          <WaitingRoom
            game="gravedad"
            roomId={roomId}
            hostId={meta.hostId ?? ""}
            players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
            presence={presence}
            myId={myId}
            summary={summary(meta)}
            settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={meta} />}
            onStart={() => startGravedad(roomId, meta, connected)}
          />
        </main>
      )}

      {status === "ready" && state && state.status === "playing" && race}

      {status === "ready" && state && meta && state.status === "finished" &&
        (online ? (
          state.gameNo > 0 ? (
            <>
              {race}
              <NextRace nextAt={state.nextAt} />
            </>
          ) : (
            <RoomLoading text="Preparando la primera carrera…" />
          )
        ) : (
          <FinalResults roomId={roomId} meta={meta} state={state} myId={myId} connected={connected} presence={presence} />
        ))}
    </div>
  );
}

function NextRace({ nextAt }: { nextAt: number }) {
  const now = useServerNow(true, 500);
  const left = now ? Math.max(0, Math.ceil((nextAt - now) / 1000)) : 0;
  return (
    <div className="flex items-center justify-center gap-4 bg-black/60 py-2 text-center">
      <p className="text-sm text-white/70">{left > 0 ? `La próxima carrera arranca en ${left} s` : "Arrancando la próxima carrera…"}</p>
      <Link href="/gravedad-loca" className="text-xs text-white/50 underline-offset-2 hover:text-white hover:underline">
        Salir
      </Link>
    </div>
  );
}

function FinalResults({
  roomId,
  meta,
  state,
  myId,
  connected,
  presence,
}: {
  roomId: string;
  meta: GravedadMeta;
  state: GravedadState;
  myId: string;
  connected: string[];
  presence: Parameters<typeof BackToRoomButton>[0]["presence"];
}) {
  const [busy, setBusy] = useState(false);
  const ranking = state.roster.map((id) => ({ id, ...playerInfo(state, id), score: state.scores[id] ?? 0 })).sort((a, b) => b.score - a.score);
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-3 overflow-y-auto p-4">
      <GameResults
        ranking={ranking}
        myId={myId}
        actions={
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              playAgain(roomId, state.gameNo, meta, connected)
                .catch(console.error)
                .finally(() => setBusy(false));
            }}
            className={`w-full ${PRIMARY_BUTTON}`}
          >
            Otra carrera
          </button>
        }
      />
      <BackToRoomButton roomId={roomId} stateKey="gravedad/state" gameNo={state.gameNo} hostId={meta.hostId ?? ""} presence={presence} myId={myId} />
    </main>
  );
}
