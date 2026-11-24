"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Eye, MonitorPlay } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  COUNTDOWN_MS,
  getEmpujonesMeta,
  joinEmpujones,
  normalizeMeta,
  playAgain,
  playerInfo,
  setWatching,
  startMatch,
  subscribeEmpujones,
  subscribeLive,
  type EmpLive,
  type EmpujonesMeta,
  type EmpujonesState,
} from "@/lib/empujonesRoom";
import { roomPath } from "@/lib/games";
import { watchRoomMeta } from "@/lib/roomSettings";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useServerNow } from "@/hooks/useServerNow";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import GameResults, { rankFrom } from "@/components/Results";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { BackToRoomButton, RoomSettingsEditor } from "@/components/RoomSettings";
import { useWakeLock } from "@/components/carreras/Controller";
import Pad from "@/components/empujones/Pad";
import { PRIMARY_BUTTON } from "@/components/ui";
import { SETTINGS } from "../settings";

type Status = "loading" | "not-found" | "ready" | "error";

const LEVEL = { facil: "fáciles", normal: "normales", dificil: "difíciles" } as const;

function summary(meta: EmpujonesMeta): string {
  const bots = meta.bots ? `${meta.bots} ${meta.bots === 1 ? "bot" : "bots"} ${LEVEL[meta.botLevel]}` : "sin bots";
  return `En pantalla grande · ${bots} · gana el primero en llegar a ${meta.target} rondas`;
}

/** Empujones on a phone: the waiting room, then the controller (the island is on the big screen). */
export default function EmpujonesClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<EmpujonesMeta | null>(null);
  const [state, setState] = useState<EmpujonesState | null>(null);
  const [live, setLive] = useState<EmpLive | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    const unsubs: (() => void)[] = [];
    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getEmpujonesMeta>>>>(
      roomId,
      (raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== "empujones") return router.replace(`/sala/${roomId}`);
        setMeta(normalizeMeta(raw));
        if (!unsubs.length) unsubs.push(subscribeEmpujones(roomId, setState), subscribeLive(roomId, setLive));
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
      unsubs.forEach((u) => u());
    };
  }, [configured, roomId, identity.clientId, identity.name, router]);

  const hasState = state !== null;
  useEffect(() => {
    if (!hasState || !identity.clientId || !identity.name) return;
    joinEmpujones(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;
  const connected = Object.keys(presence);
  const playing = status === "ready" && state?.status === "playing";

  return (
    <div className={`flex flex-col bg-talo-ink ${playing ? "h-dvh overflow-hidden" : "min-h-dvh"}`}>
      <RoomHeader game="empujones" roomId={roomId} right={status === "ready" && !playing && <PlayerBadges presence={presence} myClientId={myId} />} />
      {identity.clientId && !identity.name && <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="empujones" />}

      {status === "loading" && <RoomLoading text="Inflando la isla…" />}
      {status === "not-found" && <RoomNotFound />}
      {status === "error" && <RoomError message="No se pudo cargar la sala." />}

      {status === "ready" && state && meta && state.status === "waiting" && (
        <main className="mx-auto w-full max-w-2xl p-4">
          <WaitingRoom
            game="empujones"
            roomId={roomId}
            hostId={meta.hostId ?? ""}
            players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
            presence={presence}
            myId={myId}
            summary={summary(meta)}
            settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={meta} />}
            onStart={() => startMatch(roomId, connected)}
          >
            <ScreenCard roomId={roomId} />
            <TryPad roomId={roomId} myId={myId} state={state} color={identity.color} />
          </WaitingRoom>
        </main>
      )}

      {playing && state && <Playing roomId={roomId} state={state} live={live} myId={myId} />}

      {status === "ready" && state && meta && state.status === "finished" && (
        <main className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
          <GameResults
            ranking={rankFrom(Object.fromEntries(state.roster.map((id) => [id, playerInfo(state, id)])), state.score, state.roster)}
            myId={myId}
            unit="rondas"
            actions={
              <>
                <button onClick={() => playAgain(roomId, state.gameNo, connected).catch(console.error)} className={`w-full ${PRIMARY_BUTTON}`}>
                  Otra partida
                </button>
                <BackToRoomButton roomId={roomId} stateKey="empujones/state" gameNo={state.gameNo} hostId={meta.hostId ?? ""} presence={presence} myId={myId} />
              </>
            }
          />
        </main>
      )}
    </div>
  );
}

/** In the waiting room: the controller already works, to try it on the screen's island. */
function TryPad({ roomId, myId, state, color }: { roomId: string; myId: string; state: EmpujonesState; color: string }) {
  const watching = !!state.watching[myId];
  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-white/[0.08] bg-[#1c1c1c] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-white">{watching ? "Vas a mirar" : "Prueba el control"}</p>
          <p className="mt-0.5 text-sm text-white/60">
            {watching ? "No vas a tener talo en la isla. Puedes cambiarlo hasta que empiece." : "Tu talo ya está en la isla de la pantalla: camina y empuja mientras esperan."}
          </p>
        </div>
        <button
          onClick={() => setWatching(roomId, myId, !watching).catch(console.error)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-bold text-white/80 hover:border-white/40"
        >
          <Eye className="h-3.5 w-3.5" /> {watching ? "Quiero jugar" : "Prefiero mirar"}
        </button>
      </div>
      {!watching && (
        <div className="flex">
          <Pad roomId={roomId} clientId={myId} color={color} />
        </div>
      )}
    </div>
  );
}

/** Mid-match: my controller (or, if I'm not in this match, a note to watch the screen). */
function Playing({ roomId, state, live, myId }: { roomId: string; state: EmpujonesState; live: EmpLive | null; myId: string }) {
  useWakeLock();
  const now = useServerNow(true, 200);
  const inMatch = state.roster.includes(myId);
  const info = playerInfo(state, myId);
  const sameRound = live && live.g === state.gameNo && live.r === state.round;
  const out = !!sameRound && live.out.split(",").includes(myId);
  const left = now ? Math.ceil((state.startedAt - now) / 1000) : 0;
  const between = !!now && now < state.startedAt - COUNTDOWN_MS && state.lastRound === state.round - 1;
  const counting = !between && left > 0;
  const won = state.score[myId] ?? 0;

  // A buzz when someone hits me with a dash, a long one when I fall in.
  const hits = sameRound ? live.hits[myId] ?? 0 : 0;
  const lastHits = useRef(0);
  useEffect(() => {
    if (hits > lastHits.current) navigator.vibrate?.(60);
    lastHits.current = hits;
  }, [hits]);
  useEffect(() => {
    if (out) navigator.vibrate?.([120, 60, 200]);
  }, [out]);

  if (!inMatch) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <MonitorPlay className="h-10 w-10 text-talo-hero" />
        <p className="font-display text-2xl text-white">Mira la isla en la pantalla</p>
        <p className="text-sm text-white/60">Esta partida ya empezó: entras en la próxima.</p>
      </main>
    );
  }

  const lastWinner = state.lastWinner ? (state.lastWinner === myId ? "¡La ganaste tú!" : `Ganó ${playerInfo(state, state.lastWinner).name}`) : "Se cayeron todos";
  const line = between
    ? `Ronda ${state.lastRound + 1}: ${lastWinner}`
    : counting
      ? `Ronda ${state.round + 1} en ${left}…`
      : out
        ? "¡Al agua! Espera la próxima ronda"
        : "¡Empuja a los demás al agua!";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 p-3">
      <div className="flex items-center gap-3 rounded-[20px] bg-[#1c1c1c] p-3 ring-1 ring-white/[0.08]" style={{ boxShadow: `inset 0 0 0 2px ${info.color}` }}>
        <span className="h-9 w-9 shrink-0 rounded-full border-[3px] border-talo-ink" style={{ background: info.color }} />
        <div className="min-w-0 flex-1">
          <p className={`truncate font-bold ${out ? "text-[#FF5FA2]" : "text-white"}`}>{line}</p>
          <p className="text-xs text-white/50">Mira tu talo en la pantalla: es el de este color.</p>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="flex gap-1">
            {Array.from({ length: state.target }, (_, i) => (
              <span key={i} className={`h-3 w-3 rounded-full ${i < won ? "bg-talo-hero" : "bg-white/15"}`} />
            ))}
          </span>
          <span className="mt-1 text-[11px] text-white/40">
            {won} de {state.target}
          </span>
        </div>
      </div>
      <Pad roomId={roomId} clientId={myId} color={info.color} locked={out || counting || between} />
    </main>
  );
}

const noSubscribe = () => () => {};

/** How to open the big screen, if it isn't open yet. */
function ScreenCard({ roomId }: { roomId: string }) {
  const path = `${roomPath("empujones", roomId)}/pantalla`;
  const host = useSyncExternalStore(noSubscribe, () => window.location.host, () => "taloplay.com");
  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-white/[0.08] bg-[#1c1c1c] p-5">
      <div className="flex items-start gap-3">
        <MonitorPlay className="mt-0.5 h-6 w-6 shrink-0 text-talo-hero" />
        <div>
          <p className="font-bold text-white">La isla se ve en una pantalla grande</p>
          <p className="mt-1 text-sm text-white/60">Si todavía no está abierta, abre este link en la computadora conectada a la tele o al proyector. Tu celular es el control.</p>
        </div>
      </div>
      <p className="break-all rounded-xl bg-black/40 px-3 py-2 font-code text-sm text-white/80">
        {host}
        {path}
      </p>
      <a href={path} target="_blank" rel="noreferrer" className="text-center text-sm font-bold text-talo-hero underline-offset-2 hover:underline">
        Abrir la pantalla en este dispositivo
      </a>
    </div>
  );
}
