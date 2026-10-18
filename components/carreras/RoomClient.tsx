"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  CARS,
  SEATS,
  getCarrerasMeta,
  joinCarreras,
  leaveSeat,
  newTrack,
  normalizeMeta,
  seatOf,
  startRace,
  subscribeCarreras,
  subscribeLive,
  takeSeat,
  trackSeedOf,
  type CarrerasGame,
  type CarrerasLive,
  type CarrerasMeta,
  type CarrerasState,
  type Seat,
} from "@/lib/carreras";
import { trackLabel } from "@/lib/carrerasTrack";
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
import Controller, { useInputSender, useWakeLock } from "@/components/carreras/Controller";
import PhoneRace from "@/components/carreras/PhoneRace";
import TrackPreview from "@/components/carreras/TrackPreview";
import { CarDot, Standings, driverName, useRaceCloser } from "@/components/carreras/shared";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { RoomSettingsEditor } from "@/components/RoomSettings";
import { watchRoomMeta } from "@/lib/roomSettings";
import { carrerasSettings } from "./settings";
import { MonitorPlay, Shuffle, Smartphone } from "lucide-react";

type Status = "loading" | "not-found" | "ready" | "error";

/** A racing room on a phone (both games): seats, then the controller or the 3D race. */
export default function RoomClient({ game, roomId }: { game: CarrerasGame; roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<CarrerasMeta | null>(null);
  const [state, setState] = useState<CarrerasState | null>(null);
  const [live, setLive] = useState<CarrerasLive | null>(null);
  const settings = useMemo(() => carrerasSettings(game), [game]);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    const unsubs: (() => void)[] = [];

    // Followed live: the host can change track, laps or mode while waiting.
    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getCarrerasMeta>>>>(
      roomId,
      (raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== game) return router.replace(`/sala/${roomId}`);
        setMeta(normalizeMeta(raw));
        if (unsubs.length === 0) {
          // Live places only come from a big screen; following them always is harmless.
          unsubs.push(subscribeCarreras(roomId, setState), subscribeLive(roomId, setLive));
        }
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
  }, [configured, game, roomId, identity.clientId, identity.name, router]);

  const hasState = state !== null;
  useEffect(() => {
    if (!hasState || !identity.clientId || !identity.name) return;
    joinCarreras(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  useRaceCloser(roomId, state, presence, presenceLoaded);

  if (!configured) return <FirebaseSetupNotice />;

  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);
  const mySeat = state ? seatOf(state, myId) : null;
  const racing = status === "ready" && state && meta && state.status !== "waiting";

  // Telefono mode: the race takes the whole screen.
  if (racing && meta.mode === "telefono") {
    return <PhoneRace roomId={roomId} meta={meta} state={state} myId={myId} />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game={game}
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo={game} />
        )}

        {status === "loading" && <RoomLoading text="Calentando motores…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && meta && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game={game}
              roomId={roomId}
              hostId={meta.hostId ?? ""}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`Pista ${trackLabel(meta.track)} · ${meta.laps} vueltas · ${
                meta.mode === "pantalla" ? "en pantalla grande" : "cada uno en su teléfono"
              }`}
              settings={<RoomSettingsEditor settings={settings} roomId={roomId} meta={meta} />}
              onStart={() => startRace(roomId)}
            >
              <ModeHint roomId={roomId} meta={meta} />
              <TrackCard roomId={roomId} meta={meta} state={state} />
              <SeatPicker roomId={roomId} state={state} myId={myId} isAway={isAway} />
            </WaitingRoom>
          </div>
        )}

        {racing && (
          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 p-4">
            {state.status === "finished" && (
              <div className="flex justify-center">
                <Standings roomId={roomId} state={state} myId={myId} randomTrack={meta.track === "aleatoria"} />
              </div>
            )}
            {state.status === "racing" &&
              (mySeat && state.racers.includes(mySeat) ? (
                <Driver roomId={roomId} myId={myId} seat={mySeat} meta={meta} state={state} live={live} />
              ) : (
                <Spectator roomId={roomId} state={state} myId={myId} isAway={isAway} />
              ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ModeHint({ roomId, meta }: { roomId: string; meta: CarrerasMeta }) {
  if (meta.mode === "telefono") {
    return (
      <div className="flex gap-2.5 rounded-xl bg-violet-500/10 p-3 text-sm text-violet-100 ring-1 ring-violet-400/20">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0" />
        <p>Cada uno ve la carrera en 3D en su teléfono y maneja desde ahí. Conviene ponerlo horizontal.</p>
      </div>
    );
  }
  return (
    <div className="flex gap-2.5 rounded-xl bg-cyan-500/10 p-3 text-sm text-cyan-100 ring-1 ring-cyan-400/20">
      <MonitorPlay className="mt-0.5 h-5 w-5 shrink-0" />
      <p>
        La carrera se ve en una pantalla grande. Si todavía no está abierta, entrá desde la compu a{" "}
        <Link href={`${roomPath(meta.game, roomId)}/pantalla`} className="font-semibold underline">
          la pista de esta sala
        </Link>
        . Tu teléfono va a ser el volante.
      </p>
    </div>
  );
}

/** The track's shape (and, if it's random, a button for another one). */
function TrackCard({ roomId, meta, state }: { roomId: string; meta: CarrerasMeta; state: CarrerasState }) {
  const random = meta.track === "aleatoria";
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-950/40 p-3 ring-1 ring-slate-800">
      <TrackPreview track={meta.track} seed={trackSeedOf(meta, state)} className="h-14 w-24 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-100">Pista {trackLabel(meta.track)}</p>
        <p className="text-xs text-slate-500">{random ? "Armada al azar para esta sala" : `${meta.laps} vueltas`}</p>
      </div>
      {random && (
        <button
          onClick={() => newTrack(roomId, state.trackSeed)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-400"
        >
          <Shuffle className="h-3.5 w-3.5" /> Otra pista
        </button>
      )}
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
  const seated = SEATS.filter((seat) => state.seats[seat]).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {SEATS.map((seat) => {
          const occupant = state.seats[seat];
          const free = !occupant || isAway(occupant);
          return (
            <div
              key={seat}
              className="flex flex-col items-center gap-1.5 rounded-xl border bg-slate-950/40 p-3 text-center"
              style={{ borderColor: `${CARS[seat].color}55` }}
            >
              <CarDot seat={seat} className="h-5 w-9" />
              <p className="text-xs uppercase tracking-wide text-slate-500">{CARS[seat].label}</p>
              <p className={`text-sm font-medium ${occupant && !isAway(occupant) ? "text-slate-100" : "text-slate-500"}`}>
                {occupant ? driverName(state, seat, myId) : "Libre"}
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
        {seated < 2
          ? "Hasta 4 pilotos: mandales el link (o largá solo para practicar contra el reloj)."
          : mySeat
            ? "Cuando larguen, tu teléfono es el volante."
            : seated === SEATS.length
              ? "Los cuatro autos tienen piloto: vas a mirar la carrera."
              : "Elegí un auto libre para correr."}
      </p>
    </div>
  );
}

/** Pantalla mode, my phone as a controller. */
function Driver({
  roomId,
  myId,
  seat,
  meta,
  state,
  live,
}: {
  roomId: string;
  myId: string;
  seat: Seat;
  meta: CarrerasMeta;
  state: CarrerasState;
  live: CarrerasLive | null;
}) {
  const send = useInputSender(roomId, myId);
  const now = useServerNow(true, 100);
  useWakeLock();
  const info = live?.gameNo === state.gameNo ? live.cars[seat] : undefined;
  const left = Math.ceil((state.startedAt - now) / 1000);
  const counting = now > 0 && left > 0;
  const result = state.results[seat];

  return (
    <>
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
              : result !== undefined
                ? `¡Llegaste! ${formatRaceTime(result)}`
                : info
                  ? `Vuelta ${Math.min(info.lap, meta.laps)}/${meta.laps}`
                  : `${meta.laps} vueltas`}
          </p>
        </div>
        <p className="font-display text-3xl font-bold text-slate-100">{counting ? left : info ? `${info.place}°` : ""}</p>
      </div>
      {result === undefined ? (
        <Controller color={CARS[seat].color} locked={counting} onInput={send} />
      ) : (
        <p className="rounded-xl bg-slate-900/70 p-4 text-center text-slate-300">Esperando a que lleguen los demás…</p>
      )}
    </>
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
            <CarDot seat={seat} /> {driverName(state, seat, myId)} se fue: tomar su auto
          </button>
        );
      })}
    </div>
  );
}
