"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Smartphone } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  getViboraMeta,
  joinVibora,
  normalizeMeta,
  playAgain,
  snakeInfo,
  startVibora,
  subscribeVibora,
  type ViboraMeta,
  type ViboraState,
} from "@/lib/vibora";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
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

const ViboraGame = dynamic(() => import("@/components/vibora/Game"), { ssr: false });

type Status = "loading" | "not-found" | "ready" | "error";

function summary(meta: ViboraMeta): string {
  return `${meta.minutes} min · ${meta.snakes ? `${meta.snakes} víboras en el mapa` : "solo los de la sala"}`;
}

export default function ViboraClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<ViboraMeta | null>(null);
  const [state, setState] = useState<ViboraState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getViboraMeta>>>>(
      roomId,
      (raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== "vibora") return router.replace(`/sala/${roomId}`);
        setMeta(normalizeMeta(raw));
        unsub ??= subscribeVibora(roomId, setState);
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
    joinVibora(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;

  const connected = Object.keys(presence);
  const playing = status === "ready" && state && meta && state.status === "playing";

  return (
    <div className={`flex flex-col ${playing ? "h-dvh overflow-hidden" : "min-h-dvh"}`}>
      <RoomHeader
        game="vibora"
        roomId={roomId}
        voice={!meta?.online}
        right={status === "ready" && !playing && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      {identity.clientId && !identity.name && <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="vibora" />}

      {status === "loading" && <RoomLoading text="Despertando a las víboras…" />}
      {status === "not-found" && <RoomNotFound />}
      {status === "error" && <RoomError message="No se pudo cargar la sala." />}

      {status === "ready" && state && meta && state.status === "waiting" && (
        <main className="mx-auto w-full max-w-2xl p-4">
          <WaitingRoom
            game="vibora"
            roomId={roomId}
            hostId={meta.hostId ?? ""}
            players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
            presence={presence}
            myId={myId}
            summary={summary(meta)}
            settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={meta} />}
            onStart={() => startVibora(roomId, meta, connected)}
          >
            <div className="flex gap-2.5 rounded-xl bg-lime-500/10 p-3 text-sm text-lime-100 ring-1 ring-lime-400/20">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0" />
              <p>Cada uno juega desde su teléfono o su compu. Comé bolitas para crecer y cruzate delante de los demás para cortarles la cola.</p>
            </div>
          </WaitingRoom>
        </main>
      )}

      {playing && <ViboraGame roomId={roomId} state={state} myId={myId} presence={presence} presenceLoaded={presenceLoaded} />}

      {status === "ready" && state && meta && state.status === "finished" && (
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4">
          <Results roomId={roomId} meta={meta} state={state} myId={myId} connected={connected} />
          <BackToRoomButton roomId={roomId} stateKey="vibora/state" gameNo={state.gameNo} hostId={meta.hostId ?? ""} presence={presence} myId={myId} />
        </main>
      )}
    </div>
  );
}

function Results({
  roomId,
  meta,
  state,
  myId,
  connected,
}: {
  roomId: string;
  meta: ViboraMeta;
  state: ViboraState;
  myId: string;
  connected: string[];
}) {
  const [busy, setBusy] = useState(false);
  const ranking = Object.entries(state.final)
    .map(([id, score]) => ({ id, ...snakeInfo(state, id), score }))
    .sort((a, b) => b.score - a.score);
  const wins = state.wins[myId] ?? 0;
  return (
    <GameResults
      ranking={ranking}
      myId={myId}
      subtitle={wins > 1 ? `Llevás ${wins} partidas ganadas` : undefined}
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
          Otra partida
        </button>
      }
    />
  );
}
