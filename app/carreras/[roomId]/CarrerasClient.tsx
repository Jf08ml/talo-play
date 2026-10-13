"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  CARS,
  SEATS,
  backToWaiting,
  getCarrerasMeta,
  joinCarreras,
  leaveSeat,
  normalizeMeta,
  rematch,
  seatOf,
  startRace,
  subscribeCarreras,
  subscribeLive,
  takeSeat,
  type CarrerasLive,
  type CarrerasMeta,
  type CarrerasState,
  type Seat,
} from "@/lib/carreras";
import { TRACKS } from "@/lib/carrerasTrack";
import { formatRaceTime } from "@/lib/format";
import { roomPath } from "@/lib/games";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useServerNow } from "@/hooks/useServerNow";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import Controller from "@/components/carreras/Controller";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import { MonitorPlay } from "lucide-react";

type Status = "loading" | "not-found" | "ready" | "error";

export default function CarrerasClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<CarrerasMeta | null>(null);
  const [state, setState] = useState<CarrerasState | null>(null);
  const [live, setLive] = useState<CarrerasLive | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    const unsubs: (() => void)[] = [];

    getCarrerasMeta(roomId)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== "carreras") return router.replace(`/sala/${roomId}`);
        setMeta(normalizeMeta(raw));
        unsubs.push(subscribeCarreras(roomId, setState), subscribeLive(roomId, setLive));
        setStatus("ready");
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [configured, roomId, identity.clientId, identity.name, router]);

  const hasState = state !== null;
  useEffect(() => {
    if (!hasState || !identity.clientId || !identity.name) return;
    joinCarreras(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const now = useServerNow(state?.status === "racing");

  if (!configured) return <FirebaseSetupNotice />;

  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);
  const mySeat = state ? seatOf(state, myId) : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="carreras"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="carreras" />
        )}

        {status === "loading" && <RoomLoading text="Calentando motores…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && meta && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="carreras"
              roomId={roomId}
              hostId={meta.hostId ?? ""}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`${TRACKS[meta.track].label} · ${meta.laps} vueltas`}
              onStart={() => startRace(roomId)}
            >
              <ScreenHint roomId={roomId} />
              <SeatPicker roomId={roomId} state={state} myId={myId} isAway={isAway} />
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && meta && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 p-4">
            {state.status === "finished" && <ResultBanner roomId={roomId} state={state} myId={myId} />}
            {mySeat ? (
              <>
                <RaceInfo seat={mySeat} meta={meta} state={state} live={live} now={now} />
                {state.status === "racing" && (
                  <Controller roomId={roomId} clientId={myId} color={CARS[mySeat].color} locked={now < state.startedAt} />
                )}
              </>
            ) : (
              <Spectator roomId={roomId} state={state} myId={myId} isAway={isAway} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function playerName(state: CarrerasState, id: string, myId: string): string {
  if (id === myId) return "Vos";
  return state.players[id]?.name ?? "?";
}

function CarDot({ seat, className = "h-5 w-5" }: { seat: Seat; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-md ${className}`}
      style={{ backgroundColor: CARS[seat].color, boxShadow: `0 0 10px ${CARS[seat].glow}` }}
    />
  );
}

function ScreenHint({ roomId }: { roomId: string }) {
  return (
    <div className="flex gap-2.5 rounded-xl bg-cyan-500/10 p-3 text-sm text-cyan-100 ring-1 ring-cyan-400/20">
      <MonitorPlay className="mt-0.5 h-5 w-5 shrink-0" />
      <p>
        La carrera se ve en una pantalla grande. Si todavía no está abierta, entrá desde la compu a{" "}
        <Link href={`${roomPath("carreras", roomId)}/pantalla`} className="font-semibold underline">
          la pista de esta sala
        </Link>
        . Tu teléfono va a ser el volante.
      </p>
    </div>
  );
}

function SeatPicker({
  roomId,
  state,
  myId,
  isAway,
}: {
  roomId: string;
  state: CarrerasState;
  myId: string;
  isAway: (id: string) => boolean;
}) {
  const mySeat = seatOf(state, myId);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {SEATS.map((seat) => {
          const occupant = state.seats[seat];
          const free = !occupant || isAway(occupant);
          return (
            <div
              key={seat}
              className="flex flex-col items-center gap-2 rounded-xl border bg-slate-950/40 p-3 text-center"
              style={{ borderColor: `${CARS[seat].color}55` }}
            >
              <CarDot seat={seat} className="h-6 w-10" />
              <p className="text-xs uppercase tracking-wide text-slate-500">{CARS[seat].label}</p>
              <p className={`text-sm font-medium ${occupant && !isAway(occupant) ? "text-slate-100" : "text-slate-500"}`}>
                {occupant ? playerName(state, occupant, myId) : "Libre"}
                {occupant && isAway(occupant) && " (se fue)"}
              </p>
              {occupant !== myId && free && (
                <button
                  onClick={() => takeSeat(roomId, myId, seat, occupant)}
                  className="rounded-md border px-3 py-1 text-xs font-medium"
                  style={{ borderColor: CARS[seat].color, color: CARS[seat].color }}
                >
                  Manejar este
                </button>
              )}
              {occupant === myId && (
                <button onClick={() => leaveSeat(roomId, myId)} className="text-xs text-slate-500 hover:text-slate-300">
                  Prefiero mirar
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-center text-xs text-slate-500">
        {!state.seats.a || !state.seats.b
          ? "Falta un piloto: mandale el link a tu rival (o largá solo para practicar)."
          : mySeat
            ? "Cuando larguen, tu teléfono es el volante."
            : "Los dos autos tienen piloto: vas a mirar la carrera."}
      </p>
    </div>
  );
}

function RaceInfo({
  seat,
  meta,
  state,
  live,
  now,
}: {
  seat: Seat;
  meta: CarrerasMeta;
  state: CarrerasState;
  live: CarrerasLive | null;
  now: number;
}) {
  const info = live?.gameNo === state.gameNo ? live.cars[seat] : undefined;
  const left = Math.ceil((state.startedAt - now) / 1000);
  const counting = state.status === "racing" && now > 0 && left > 0;
  return (
    <div
      className="flex items-center gap-3 rounded-xl border bg-slate-900/70 p-3"
      style={{ borderColor: CARS[seat].color, boxShadow: `0 0 20px ${CARS[seat].glow}` }}
    >
      <CarDot seat={seat} className="h-8 w-12" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-100">{CARS[seat].label}</p>
        <p className="text-xs text-slate-400">
          {counting
            ? "Largan en…"
            : info
              ? `Vuelta ${Math.min(info.lap, meta.laps)}/${meta.laps}`
              : `${meta.laps} vueltas`}
        </p>
      </div>
      <p className="font-display text-3xl font-bold text-slate-100">
        {counting ? left : info ? `${info.place}°` : ""}
      </p>
    </div>
  );
}

function ResultBanner({ roomId, state, myId }: { roomId: string; state: CarrerasState; myId: string }) {
  const mySeat = seatOf(state, myId);
  const winner = state.winner || null;
  const iWon = !!winner && winner === mySeat;
  const winnerName = winner ? playerName(state, state.seats[winner], myId) : "";
  const title = iWon ? "🏆 ¡Ganaste!" : winner ? (mySeat ? `😬 Ganó ${winnerName}` : `🏆 ¡Ganó ${winnerName}!`) : "";
  return (
    <div
      className={`animate-celebration-in flex flex-col items-center gap-3 rounded-2xl border bg-slate-900 p-4 text-center ${
        iWon ? "border-emerald-500/25 shadow-[0_0_40px_rgba(52,211,153,0.2)]" : "border-violet-500/20"
      }`}
    >
      <p className="font-display text-xl font-semibold text-slate-100">{title}</p>
      {state.winnerMs > 0 && <p className="text-sm text-slate-400">Tiempo: {formatRaceTime(state.winnerMs)}</p>}
      <div className="grid w-full max-w-xs gap-2">
        <button onClick={() => rematch(roomId, state.gameNo)} className={mySeat ? PRIMARY_BUTTON : SECONDARY_BUTTON}>
          Revancha
        </button>
        <button onClick={() => backToWaiting(roomId, state.gameNo)} className="text-sm text-slate-400 hover:text-slate-200">
          Cambiar pilotos
        </button>
      </div>
    </div>
  );
}

function Spectator({
  roomId,
  state,
  myId,
  isAway,
}: {
  roomId: string;
  state: CarrerasState;
  myId: string;
  isAway: (id: string) => boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl bg-slate-900/70 p-4 text-center text-slate-300 ring-1 ring-slate-700">
        <MonitorPlay className="mx-auto mb-2 h-8 w-8 text-cyan-300" />
        Mirá la carrera en la pantalla grande. Vas a poder manejar en la próxima.
      </p>
      {SEATS.map((seat) => {
        const id = state.seats[seat];
        if (!id || !isAway(id)) return null;
        return (
          <button
            key={seat}
            onClick={() => takeSeat(roomId, myId, seat, id)}
            className="flex items-center justify-center gap-2 rounded-lg border border-cyan-400/60 py-2 text-sm text-cyan-300"
          >
            <CarDot seat={seat} /> {playerName(state, id, myId)} se fue: tomar su auto
          </button>
        );
      })}
    </div>
  );
}
