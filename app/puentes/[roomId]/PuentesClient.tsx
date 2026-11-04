"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  DIFFICULTIES,
  getPuentesMeta,
  joinPuentes,
  nextOnlineRound,
  normalizeMeta,
  playAgain,
  playerInfo,
  roundPuzzle,
  startPuentes,
  subscribePuentes,
  type PuentesMeta,
  type PuentesState,
} from "@/lib/puentesRoom";
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
import Reveal from "@/components/puentes/Reveal";
import { SETTINGS } from "../settings";

const RaceGame = dynamic(() => import("@/components/puentes/RaceGame"), { ssr: false });

type Status = "loading" | "not-found" | "ready" | "error";

function summary(meta: PuentesMeta): string {
  const diff = DIFFICULTIES.find((d) => d.id === meta.difficulty)?.label ?? "";
  return `${meta.rounds} rondas · ${diff}${meta.tricks ? " · con trampas" : ""}`;
}

export default function PuentesClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<PuentesMeta | null>(null);
  const [state, setState] = useState<PuentesState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getPuentesMeta>>>>(
      roomId,
      (raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== "puentes") return router.replace(`/sala/${roomId}`);
        setMeta(normalizeMeta(raw));
        unsub ??= subscribePuentes(roomId, setState);
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
    joinPuentes(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  // Online: the next round starts by itself.
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

  if (!configured) return <FirebaseSetupNotice />;
  const connected = Object.keys(presence);

  return (
    <div className="flex min-h-dvh flex-col bg-talo-ink">
      <RoomHeader game="puentes" roomId={roomId} social={!online} right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />} />
      {identity.clientId && !identity.name && <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="puentes" />}

      {status === "loading" && <RoomLoading text="Tendiendo puentes…" />}
      {status === "not-found" && <RoomNotFound />}
      {status === "error" && <RoomError message="No se pudo cargar la sala." />}

      {status === "ready" && state && meta && state.status === "waiting" && !online && (
        <main className="mx-auto w-full max-w-2xl p-4">
          <WaitingRoom
            game="puentes"
            roomId={roomId}
            hostId={meta.hostId ?? ""}
            players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
            presence={presence}
            myId={myId}
            summary={summary(meta)}
            settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={meta} />}
            onStart={() => startPuentes(roomId, meta, connected)}
          />
        </main>
      )}

      {status === "ready" && state && state.status === "playing" && (
        <RaceGame roomId={roomId} state={state} myId={myId} presence={presence} presenceLoaded={presenceLoaded} />
      )}

      {status === "ready" && state && meta && state.status === "finished" &&
        (online ? (
          state.gameNo > 0 ? (
            <>
              <RaceGame roomId={roomId} state={state} myId={myId} presence={presence} presenceLoaded={presenceLoaded} />
              <NextRound nextAt={state.nextAt} />
            </>
          ) : (
            <RoomLoading text="Armando el primer mapa…" />
          )
        ) : (
          <FinalResults roomId={roomId} meta={meta} state={state} myId={myId} connected={connected} presence={presence} />
        ))}
    </div>
  );
}

function NextRound({ nextAt }: { nextAt: number }) {
  const now = useServerNow(true, 500);
  const left = now ? Math.max(0, Math.ceil((nextAt - now) / 1000)) : 0;
  return (
    <div className="flex flex-col items-center gap-2 pb-6 text-center">
      <p className="text-sm text-white/70">{left > 0 ? `El próximo mapa arranca en ${left} s` : "Arrancando el próximo mapa…"}</p>
      <Link href="/puentes" className="text-xs text-white/50 underline-offset-2 hover:text-white hover:underline">
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
  meta: PuentesMeta;
  state: PuentesState;
  myId: string;
  connected: string[];
  presence: Parameters<typeof BackToRoomButton>[0]["presence"];
}) {
  const [busy, setBusy] = useState(false);
  const pz = useMemo(() => roundPuzzle(state), [state]);
  const ranking = state.roster.map((id) => ({ id, ...playerInfo(state, id), score: state.scores[id] ?? 0 })).sort((a, b) => b.score - a.score);
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
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
            Otra partida
          </button>
        }
      />
      <p className="mt-2 text-center text-xs font-bold uppercase tracking-wide text-white/50">El último mapa</p>
      <Reveal pz={pz} />
      <BackToRoomButton roomId={roomId} stateKey="puentes/state" gameNo={state.gameNo} hostId={meta.hostId ?? ""} presence={presence} myId={myId} />
    </main>
  );
}
