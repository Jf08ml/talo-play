"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  cardOf,
  getGolfMeta,
  joinGolf,
  nextOnlineGame,
  normalizeMeta,
  playAgain,
  playerInfo,
  startGolf,
  subscribeGolf,
  totalOf,
  type GolfMeta,
  type GolfState,
} from "@/lib/minigolf";
import { DIFFICULTIES, generateHole } from "@/lib/minigolfHoles";
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
import Scorecard from "@/components/minigolf/Scorecard";
import { SETTINGS } from "../settings";

const RoomGame = dynamic(() => import("@/components/minigolf/RoomGame"), { ssr: false });

type Status = "loading" | "not-found" | "ready" | "error";

function summary(meta: GolfMeta): string {
  const diff = DIFFICULTIES.find((d) => d.id === meta.difficulty)?.label ?? "";
  return `${meta.holes} hoyos · ${diff}${meta.bots ? ` · ${meta.bots} ${meta.bots === 1 ? "bot" : "bots"}` : ""}`;
}

export default function MinigolfClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<GolfMeta | null>(null);
  const [state, setState] = useState<GolfState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getGolfMeta>>>>(
      roomId,
      (raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== "minigolf") return router.replace(`/sala/${roomId}`);
        setMeta(normalizeMeta(raw));
        unsub ??= subscribeGolf(roomId, setState);
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
    joinGolf(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  // Online: the next game starts by itself.
  const online = !!state?.online;
  const waitingNext = online && !!state && state.status !== "playing" && presenceLoaded && !!state.players[myId];
  const nextAt = state?.nextAt ?? 0;
  const connectedKey = Object.keys(presence).sort().join(",");
  useEffect(() => {
    if (!waitingNext) return;
    const wait = Math.max(0, nextAt - serverNow()) + Math.random() * 400;
    const t = setTimeout(() => nextOnlineGame(roomId, connectedKey.split(",")).catch(console.error), wait);
    return () => clearTimeout(t);
  }, [waitingNext, nextAt, roomId, connectedKey]);

  if (!configured) return <FirebaseSetupNotice />;
  const connected = Object.keys(presence);
  const playingNow = status === "ready" && state && state.status === "playing";

  return (
    <div className={`flex flex-col bg-talo-ink ${playingNow ? "h-dvh" : "min-h-dvh"}`}>
      <RoomHeader game="minigolf" roomId={roomId} social={!online} right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />} />
      {identity.clientId && !identity.name && <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="minigolf" />}

      {status === "loading" && <RoomLoading text="Cortando el pasto…" />}
      {status === "not-found" && <RoomNotFound />}
      {status === "error" && <RoomError message="No se pudo cargar la sala." />}

      {status === "ready" && state && meta && state.status === "waiting" && !online && (
        <main className="mx-auto w-full max-w-2xl p-4">
          <WaitingRoom
            game="minigolf"
            roomId={roomId}
            hostId={meta.hostId ?? ""}
            players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
            presence={presence}
            myId={myId}
            summary={summary(meta)}
            settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={meta} />}
            onStart={() => startGolf(roomId, meta, connected)}
          />
        </main>
      )}

      {playingNow && <RoomGame roomId={roomId} state={state} myId={myId} presence={presence} presenceLoaded={presenceLoaded} />}

      {status === "ready" && state && meta && state.status === "finished" &&
        (online ? (
          state.gameNo > 0 ? (
            <OnlineEnd state={state} myId={myId} />
          ) : (
            <RoomLoading text="Armando el primer recorrido…" />
          )
        ) : (
          <FinalResults roomId={roomId} meta={meta} state={state} myId={myId} connected={connected} presence={presence} />
        ))}
    </div>
  );
}

function usePars(state: GolfState) {
  return useMemo(
    () => Array.from({ length: state.holes }, (_, i) => generateHole((state.seed + i * 7919) >>> 0, state.difficulty).par),
    [state.seed, state.holes, state.difficulty]
  );
}

function ranking(state: GolfState) {
  return state.roster
    .map((id) => ({ id, ...playerInfo(state, id), card: cardOf(state, id), score: totalOf(state, id) }))
    .sort((a, b) => a.score - b.score);
}

function OnlineEnd({ state, myId }: { state: GolfState; myId: string }) {
  const now = useServerNow(true, 500);
  const pars = usePars(state);
  const rows = ranking(state);
  const left = now ? Math.max(0, Math.ceil((state.nextAt - now) / 1000)) : 0;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-3 p-4">
      <GameResults ranking={rows} myId={myId} unit="golpes" subtitle={rows[0] ? `Ganó con ${rows[0].score} golpes` : undefined} />
      <Scorecard pars={pars} rows={rows} myId={myId} />
      <p className="text-center text-sm text-white/70">{left > 0 ? `El próximo recorrido arranca en ${left} s` : "Arrancando el próximo recorrido…"}</p>
      <Link href="/minigolf" className="self-center text-xs text-white/50 underline-offset-2 hover:text-white hover:underline">
        Salir
      </Link>
    </main>
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
  meta: GolfMeta;
  state: GolfState;
  myId: string;
  connected: string[];
  presence: Parameters<typeof BackToRoomButton>[0]["presence"];
}) {
  const [busy, setBusy] = useState(false);
  const pars = usePars(state);
  const rows = ranking(state);
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-3 p-4">
      <GameResults
        ranking={rows}
        myId={myId}
        unit="golpes"
        subtitle={rows[0] ? `Con ${rows[0].score} golpes` : undefined}
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
            Otro recorrido
          </button>
        }
      />
      <Scorecard pars={pars} rows={rows} myId={myId} />
      <BackToRoomButton roomId={roomId} stateKey="golf/state" gameNo={state.gameNo} hostId={meta.hostId ?? ""} presence={presence} myId={myId} />
    </main>
  );
}
