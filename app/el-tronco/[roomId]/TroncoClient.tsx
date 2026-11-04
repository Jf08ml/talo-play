"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  getTroncoMeta,
  joinTronco,
  nextOnlineRound,
  normalizeMeta,
  playAgain,
  playerInfo,
  startTronco,
  subscribeTronco,
  type TroncoMeta,
  type TroncoState,
} from "@/lib/troncoRoom";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useServerNow } from "@/hooks/useServerNow";
import { serverNow } from "@/lib/serverTime";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { Confetti } from "@/components/Results";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { BackToRoomButton, RoomSettingsEditor } from "@/components/RoomSettings";
import { watchRoomMeta } from "@/lib/roomSettings";
import { CARD, PRIMARY_BUTTON } from "@/components/ui";
import { SETTINGS } from "../settings";

const TroncoGame = dynamic(() => import("@/components/tronco/Game"), { ssr: false });

type Status = "loading" | "not-found" | "ready" | "error";

function summary(meta: TroncoMeta): string {
  return `${meta.bots ? `${meta.bots} ${meta.bots === 1 ? "bot" : "bots"}` : "sin bots"} · velocidad ${meta.pace === "rapido" ? "rápida" : "normal"}`;
}

export default function TroncoClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<TroncoMeta | null>(null);
  const [state, setState] = useState<TroncoState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getTroncoMeta>>>>(
      roomId,
      (raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== "tronco") return router.replace(`/sala/${roomId}`);
        setMeta(normalizeMeta(raw));
        unsub ??= subscribeTronco(roomId, setState);
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
    joinTronco(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  // "Contra bots": no waiting room, it starts as soon as I'm in.
  const autoStarted = useRef(false);
  const soloReady = !!meta?.solo && state?.status === "waiting" && presenceLoaded && !!state.players[myId] && meta.hostId === myId;
  useEffect(() => {
    if (!soloReady || !meta || autoStarted.current) return;
    autoStarted.current = true;
    startTronco(roomId, meta, [myId]).catch(console.error);
  }, [soloReady, meta, roomId, myId]);

  // Online: the next match starts by itself.
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
  const playing = status === "ready" && state && state.status === "playing";

  return (
    <div className={`flex flex-col bg-talo-ink ${playing ? "h-dvh overflow-hidden" : "min-h-dvh"}`}>
      <RoomHeader
        game="tronco"
        roomId={roomId}
        social={!online && !meta?.solo}
        right={status === "ready" && !playing && <PlayerBadges presence={presence} myClientId={myId} />}
      />
      {identity.clientId && !identity.name && <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="tronco" />}

      {status === "loading" && <RoomLoading text="Rodando el tronco…" />}
      {status === "not-found" && <RoomNotFound />}
      {status === "error" && <RoomError message="No se pudo cargar la sala." />}

      {status === "ready" && state && meta && state.status === "waiting" && !online &&
        (meta.solo ? (
          <RoomLoading text="Armando la ronda…" />
        ) : (
          <main className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="tronco"
              roomId={roomId}
              hostId={meta.hostId ?? ""}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={summary(meta)}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={meta} />}
              onStart={() => startTronco(roomId, meta, connected)}
            />
          </main>
        ))}

      {playing && <TroncoGame key={state.gameNo} roomId={roomId} state={state} myId={myId} presence={presence} presenceLoaded={presenceLoaded} />}

      {status === "ready" && state && meta && state.status === "finished" && (
        <main className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
          {state.gameNo > 0 || !online ? <Results state={state} myId={myId} /> : <RoomLoading text="Armando la primera ronda…" />}
          {online ? (
            <NextRound nextAt={state.nextAt} />
          ) : (
            <>
              <AgainButton roomId={roomId} meta={meta} state={state} connected={connected} />
              {!meta.solo && (
                <BackToRoomButton roomId={roomId} stateKey="tronco/state" gameNo={state.gameNo} hostId={meta.hostId ?? ""} presence={presence} myId={myId} />
              )}
              {meta.solo && (
                <Link href="/el-tronco" className="text-center text-xs text-white/50 underline-offset-2 hover:text-white hover:underline">
                  Salir
                </Link>
              )}
            </>
          )}
        </main>
      )}
    </div>
  );
}

function NextRound({ nextAt }: { nextAt: number }) {
  const now = useServerNow(true, 500);
  const left = now ? Math.max(0, Math.ceil((nextAt - now) / 1000)) : 0;
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <p className="text-sm text-white/70">{left > 0 ? `La próxima ronda arranca en ${left} s` : "Arrancando la próxima ronda…"}</p>
      <Link href="/el-tronco" className="text-xs text-white/50 underline-offset-2 hover:text-white hover:underline">
        Salir
      </Link>
    </div>
  );
}

function AgainButton({ roomId, meta, state, connected }: { roomId: string; meta: TroncoMeta; state: TroncoState; connected: string[] }) {
  const [busy, setBusy] = useState(false);
  return (
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
      Otra ronda
    </button>
  );
}

/** Who lasted longest first: the winner, then by when each one fell. */
function Results({ state, myId }: { state: TroncoState; myId: string }) {
  const order = [...state.roster].sort((a, b) => {
    if (a === state.winner) return -1;
    if (b === state.winner) return 1;
    return (state.out[b] ?? Infinity) - (state.out[a] ?? Infinity);
  });
  const iWon = state.winner === myId;
  const winner = playerInfo(state, state.winner);
  const wins = state.wins[myId] ?? 0;
  const secs = (id: string) => Math.max(0, Math.round(((state.out[id] ?? 0) - state.startedAt) / 1000));
  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      {iWon && <Confetti />}
      <div className="text-center">
        <p className="font-display text-3xl text-white">{iWon ? "¡Quedaste en pie!" : state.winner ? `¡Ganó ${winner.name}!` : "¡Terminó!"}</p>
        {wins > 1 && <p className="mt-1 text-xs text-white/50">Llevás {wins} ganadas</p>}
      </div>
      <ol className="flex flex-col gap-1.5">
        {order.map((id, i) => {
          const info = playerInfo(state, id);
          return (
            <li key={id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${id === myId ? "bg-white/[0.08]" : ""}`}>
              <span className="w-6 font-display text-lg text-white/70">{i + 1}</span>
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: info.color }} />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{id === myId ? "Vos" : info.name}</span>
              {id === state.winner ? <Crown className="h-4 w-4 text-talo-hero" /> : <span className="font-mono text-xs text-white/60">cayó a los {secs(id)} s</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
