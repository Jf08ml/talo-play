"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  CARS,
  SEATS,
  backToWaiting,
  getCarrerasMeta,
  newTrack,
  normalizeMeta,
  racersOf,
  reportFinish,
  roomCarsKey,
  startRace,
  subscribeCarreras,
  subscribeInputs,
  trackSeedOf,
  writeLive,
  type CarInputWire,
  type CarrerasGame,
  type CarrerasMeta,
  type CarrerasState,
  type LiveCar,
  type Seat,
} from "@/lib/carreras";
import {
  MAX_SPEED,
  collideCars,
  getTrack,
  gridCar,
  lapsDone,
  stepCar,
  trackLabel,
  type Car,
  type CarInput,
} from "@/lib/carrerasTrack";
import { RaceAudio, RaceCues } from "@/lib/carrerasAudio";
import { RaceScene, type CameraMode } from "@/lib/carreras3d";
import { drawMinimap, drawTopView, type DrawCar } from "@/lib/carrerasDraw";
import { subscribePresence, type PresenceMap } from "@/lib/presence";
import { serverNow } from "@/lib/serverTime";
import { roomPath } from "@/lib/games";
import { watchRoomMeta } from "@/lib/roomSettings";
import { useServerNow } from "@/hooks/useServerNow";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import TrackPreview from "@/components/carreras/TrackPreview";
import { Standings, driverName, useCameraMode, useRaceCloser, useSoundSetting } from "@/components/carreras/shared";
import { TaloMark } from "@/components/TaloLogo";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { PRIMARY_BUTTON } from "@/components/ui";
import { Eye, Maximize, Minimize, Shuffle, Smartphone, Volume2, VolumeX, X } from "lucide-react";
import { useQuality } from "@/hooks/useQuality";
import QualityButton from "@/components/QualityButton";

type Status = "loading" | "not-found" | "ready" | "error";

const subscribeNever = () => () => {};
const STEP = 1 / 120;
/** Keyboard driving on the screen itself, to try it without phones. */
const KEYS: Partial<Record<Seat, { left: string[]; right: string[]; brake: string[] }>> = {
  a: { left: ["a", "A"], right: ["d", "D"], brake: ["s", "S"] },
  b: { left: ["ArrowLeft"], right: ["ArrowRight"], brake: ["ArrowDown"] },
};

interface Engine {
  /** Which race (or pre-race grid) these cars belong to. */
  key: string;
  cars: Partial<Record<Seat, Car>>;
  reported: Set<Seat>;
  lastLive: string;
}

/** Cars go back on the grid when this changes: a new race, or who's seated while waiting. */
function engineKey(s: CarrerasState): string {
  return s.status === "waiting" ? `w${s.gameNo}:${roomCarsKey(s)}` : `r${s.gameNo}`;
}

/** Seats with a car on track: the racers, or everyone seated before the start. */
function carSeats(s: CarrerasState): Seat[] {
  return s.status === "waiting" ? SEATS.filter((seat) => s.seats[seat]) : racersOf(s);
}

/**
 * The race screen (a computer on a TV or projector). It never joins the room
 * as a player: it simulates every car from the phones' inputs, draws them
 * (split-screen 3D or from above) and reports each finish.
 */
export default function ScreenClient({ game, roomId }: { game: CarrerasGame; roomId: string }) {
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<CarrerasMeta | null>(null);
  const [state, setState] = useState<CarrerasState | null>(null);
  const [presence, setPresence] = useState<PresenceMap>({});
  const [presenceLoaded, setPresenceLoaded] = useState(false);
  const [hud, setHud] = useState<Partial<Record<Seat, LiveCar>>>({});
  const [camera, toggleCamera] = useCameraMode();
  const [quality, toggleQuality] = useQuality("carreras.calidad");
  const [sound, toggleSound] = useSoundSetting();

  const canvas3dRef = useRef<HTMLCanvasElement>(null);
  const canvas2dRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<CarrerasState | null>(null);
  const cameraRef = useRef<CameraMode>(camera);
  const inputsRef = useRef<Record<string, CarInputWire>>({});
  const keysRef = useRef(new Set<string>());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    const unsubs: (() => void)[] = [];

    // Followed live: the host can change track, laps or mode from a phone while waiting.
    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getCarrerasMeta>>>>(
      roomId,
      (raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== game) return router.replace(`/sala/${roomId}`);
        const m = normalizeMeta(raw);
        if (m.mode !== "pantalla") return router.replace(roomPath(game, roomId));
        setMeta(m);
        if (unsubs.length > 0) return;
        unsubs.push(
          subscribeCarreras(roomId, setState),
          subscribePresence(roomId, (p) => {
            setPresence(p);
            setPresenceLoaded(true);
          }),
          subscribeInputs(roomId, (inputs) => {
            inputsRef.current = inputs;
          })
        );
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
  }, [configured, game, roomId, router]);

  useEffect(() => {
    const keys = keysRef.current;
    const down = (e: KeyboardEvent) => {
      keys.add(e.key);
      if (e.key.startsWith("Arrow")) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useRaceCloser(roomId, state, presence, presenceLoaded);

  // Sound lives as long as the page (a new context would need another tap to start).
  const audioRef = useRef<RaceAudio | null>(null);
  useEffect(() => {
    const audio = new RaceAudio();
    audioRef.current = audio;
    return () => {
      audio.dispose();
      audioRef.current = null;
    };
  }, []);
  useEffect(() => {
    audioRef.current?.setMuted(!sound);
  }, [sound]);

  // The race loop: fixed-step physics, then a draw, every animation frame.
  const trackId = meta?.track;
  const trackSeed = meta ? trackSeedOf(meta, state) : 0;
  const hasState = state !== null;
  const laps = meta?.laps ?? 5;
  const is3d = game === "carreras3d";
  useEffect(() => {
    if (!trackId || !hasState || !canvas3dRef.current || (is3d && !quality)) return;
    const track = getTrack(trackId, trackSeed);
    const scene = is3d ? new RaceScene(canvas3dRef.current, track, { quality: quality ?? "alta" }) : null;
    const audio = audioRef.current;
    const cues = new RaceCues(audio);
    let engine: Engine | null = null;
    let frame = 0;
    let last = performance.now();
    let acc = 0;

    const inputFor = (seat: Seat, s: CarrerasState): CarInput => {
      if (s.status === "finished" || s.results[seat] !== undefined) return { steer: 0, brake: false, gas: false };
      const k = KEYS[seat];
      const keys = keysRef.current;
      const has = (list: string[]) => list.some((key) => keys.has(key));
      if (k && (has(k.left) || has(k.right) || has(k.brake))) {
        return { steer: (has(k.right) ? 1 : 0) - (has(k.left) ? 1 : 0), brake: has(k.brake) };
      }
      const wire = inputsRef.current[s.seats[seat]];
      // No phone connected (or it dropped): the car brakes instead of driving into a wall.
      return wire ? { steer: wire.s ?? 0, brake: !!wire.b } : { steer: 0, brake: false, gas: false };
    };

    const tick = (t: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const s = stateRef.current;
      if (!s) return;

      if (!engine || engine.key !== engineKey(s)) {
        const cars: Partial<Record<Seat, Car>> = {};
        for (const seat of carSeats(s)) cars[seat] = gridCar(track, SEATS.indexOf(seat));
        engine = { key: engineKey(s), cars, reported: new Set(), lastLive: "" };
        scene?.setCars({});
      }
      const seats = SEATS.filter((seat) => engine!.cars[seat]);
      scene?.setCars(Object.fromEntries(seats.map((seat) => [seat, { color: CARS[seat].color, label: driverName(s, seat) }])));

      const now = serverNow();
      const moving = s.status !== "waiting" && now >= s.startedAt;
      const lights = cues.countdown(s.gameNo, s.status === "waiting" ? -1 : Math.max(0, Math.ceil((s.startedAt - now) / 1000)));
      scene?.setStartLights(lights);
      if (moving) {
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          for (const seat of seats) {
            const hit = stepCar(engine.cars[seat]!, inputFor(seat, s), track, STEP);
            if (cues.hit(seat, hit)) scene?.impact(seat, hit);
          }
          for (let i = 0; i < seats.length; i++) {
            for (let j = i + 1; j < seats.length; j++) {
              const hit = collideCars(engine.cars[seats[i]]!, engine.cars[seats[j]]!);
              if (cues.hit(seats[i] + seats[j], hit)) {
                scene?.impact(seats[i], hit);
                scene?.impact(seats[j], hit);
              }
            }
          }
        }
      } else {
        acc = 0;
      }

      // Finish line, once per car; a chime on every other lap.
      if (s.status === "racing" && moving) {
        for (const seat of seats) {
          const car = engine.cars[seat]!;
          cues.lap(seat, lapsDone(car, track), laps);
          if (engine.reported.has(seat) || car.progress < laps * track.length) continue;
          engine.reported.add(seat);
          audio?.finish(engine.reported.size === 1);
          scene?.confetti(seat);
          reportFinish(roomId, s.gameNo, seat, now - s.startedAt).catch(console.error);
        }
      }

      // Engines, jumps and boosts: panned to each player's half of the screen in 3D, to where the car is in 2D.
      if (s.status === "waiting") {
        audio?.silence();
      } else if (audio) {
        seats.forEach((seat, i) => {
          const car = engine!.cars[seat]!;
          const slip = Math.abs(-car.vx * Math.sin(car.heading) + car.vy * Math.cos(car.heading));
          const pan = is3d ? (seats.length === 1 ? 0 : i % 2 ? 0.6 : -0.6) : (car.x / track.worldW) * 1.6 - 0.8;
          cues.air(seat, car.air, pan);
          cues.boost(seat, car.boost, pan);
          audio.engine(seat, Math.hypot(car.vx, car.vy) / MAX_SPEED, (slip - 50) / 150, seats.length > 1 ? 0.7 : 1, pan);
        });
        audio.silence(seats);
      }

      // Places: finishers by time, then by distance driven.
      const ranked = [...seats].sort((x, y) => {
        const fx = s.results[x];
        const fy = s.results[y];
        if (fx !== undefined || fy !== undefined) return (fx ?? Infinity) - (fy ?? Infinity);
        return engine!.cars[y]!.progress - engine!.cars[x]!.progress;
      });
      if (s.status !== "waiting") {
        const cars: Partial<Record<Seat, LiveCar>> = {};
        ranked.forEach((seat, i) => {
          cars[seat] = { lap: lapsDone(engine!.cars[seat]!, track) + 1, place: i + 1 };
        });
        const key = JSON.stringify(cars);
        if (key !== engine.lastLive) {
          engine.lastLive = key;
          setHud(cars);
          writeLive(roomId, { gameNo: s.gameNo, cars });
        }
      }

      const drawCars: DrawCar[] = seats.map((seat) => {
        const car = engine!.cars[seat]!;
        return {
          x: car.x,
          y: car.y,
          z: car.z,
          ground: car.ground,
          heading: car.heading,
          color: CARS[seat].color,
          label: driverName(s, seat),
          bump: car.bump,
        };
      });
      if (!scene) {
        drawTopView(canvas2dRef.current, track, drawCars);
      } else {
        for (const seat of seats) {
          const car = engine.cars[seat]!;
          scene.setPose(seat, { x: car.x, y: car.y, z: car.z, ground: car.ground, heading: car.heading, vx: car.vx, vy: car.vy, bump: car.bump });
        }
        // Before the start with nobody seated: an aerial view of the track.
        scene.render(seats.length ? seats.map((key) => ({ key })) : [{ key: "" }], cameraRef.current, dt);
        drawMinimap(minimapRef.current, track, drawCars);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      scene?.dispose();
      audio?.silence();
    };
  }, [trackId, trackSeed, hasState, laps, roomId, is3d, quality]);

  const now = useServerNow(state?.status === "racing", 100);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  if (!configured) return <FirebaseSetupNotice />;

  const here = (seat: Seat) => !!state?.seats[seat] && state.seats[seat] in presence;
  const left = state ? Math.ceil((state.startedAt - now) / 1000) : 0;
  const counting = state?.status === "racing" && now > 0 && left > 0;
  const go = state?.status === "racing" && now > 0 && left <= 0 && now - state.startedAt < 900;
  const onTrack = state ? carSeats(state) : [];

  const chip = "pointer-events-auto flex items-center gap-1.5 rounded-xl bg-slate-950/70 px-3 py-2 text-sm text-slate-200 backdrop-blur hover:text-white";

  return (
    <div className={`fixed inset-0 flex flex-col text-slate-100 ${is3d ? "bg-sky-300" : "bg-[#0b2a18]"}`}>
      <canvas ref={canvas3dRef} className={`absolute inset-0 h-full w-full ${is3d ? "" : "hidden"}`} />
      <canvas ref={canvas2dRef} className={`absolute inset-0 h-full w-full ${is3d ? "hidden" : ""}`} />

      {status === "loading" && <RoomLoading text="Armando la pista…" />}
      {status === "not-found" && <RoomNotFound />}
      {status === "error" && <RoomError message="No se pudo cargar la sala." />}

      {status === "ready" && state && meta && (
        <>
          {/* One tag per split-screen view, in the same order the 3D views are laid out. */}
          {is3d && state.status !== "waiting" && (
            <ViewTags seats={onTrack} state={state} hud={hud} laps={meta.laps} here={here} />
          )}

          <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3 p-3">
            <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-slate-950/70 px-3 py-2 backdrop-blur">
              <Link href="/" aria-label="Volver a Talo">
                <TaloMark className="h-6 w-6" />
              </Link>
              <span className="font-mono text-lg font-bold tracking-widest text-cyan-200">{roomId}</span>
            </div>
            {!is3d && state.status !== "waiting" && (
              <div className="flex flex-wrap justify-center gap-2">
                {onTrack.map((seat) => (
                  <SeatTag key={seat} seat={seat} state={state} hud={hud} laps={meta.laps} here={here} />
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={toggleSound} className={chip} aria-label={sound ? "Silenciar" : "Activar sonido"} title={sound ? "Silenciar" : "Activar sonido"}>
                {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              {is3d && <QualityButton quality={quality} onToggle={toggleQuality} className="pointer-events-auto !rounded-xl !bg-slate-950/70 !px-3 !text-sm" />}
              {is3d && (
                <button onClick={toggleCamera} className={chip}>
                  <Eye className="h-4 w-4" /> {camera === "detras" ? "Detrás" : "Cabina"}
                </button>
              )}
              {state.status === "racing" && (
                <button onClick={() => backToWaiting(roomId, state.gameNo)} className={chip} aria-label="Cancelar carrera" title="Cancelar carrera">
                  <X className="h-4 w-4" />
                </button>
              )}
              <button onClick={toggleFullscreen} className={chip} aria-label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}>
                {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {is3d && state.status !== "waiting" && (
            <canvas
              ref={minimapRef}
              className="pointer-events-none absolute bottom-3 left-1/2 z-10 h-28 w-48 -translate-x-1/2 rounded-2xl bg-slate-950/45 backdrop-blur"
            />
          )}

          {state.status === "waiting" && (
            <div className="relative z-10 flex flex-1 items-center justify-center overflow-y-auto p-4">
              <JoinCard roomId={roomId} meta={meta} state={state} here={here} />
            </div>
          )}

          {(counting || go) && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <span
                key={counting ? left : "go"}
                className="animate-celebration-in font-display text-[22vmin] font-extrabold drop-shadow-[0_0_40px_rgba(0,0,0,0.8)]"
                style={{ color: counting ? "#f8fafc" : "#4ade80" }}
              >
                {counting ? left : "¡YA!"}
              </span>
            </div>
          )}

          {state.status === "finished" && (
            <div className="relative z-10 flex flex-1 items-center justify-center p-4">
              <Standings roomId={roomId} state={state} big randomTrack={meta.track === "aleatoria"} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SeatTag({
  seat,
  state,
  hud,
  laps,
  here,
}: {
  seat: Seat;
  state: CarrerasState;
  hud: Partial<Record<Seat, LiveCar>>;
  laps: number;
  here: (seat: Seat) => boolean;
}) {
  const done = state.results[seat] !== undefined;
  return (
    <div
      className="flex items-center gap-3 rounded-xl bg-slate-950/70 px-4 py-2 backdrop-blur"
      style={{ boxShadow: `inset 0 0 0 2px ${CARS[seat].color}` }}
    >
      <span className="font-display text-3xl font-bold">{hud[seat] ? `${hud[seat]!.place}°` : "–"}</span>
      <div>
        <p className="max-w-40 truncate text-sm font-semibold" style={{ color: CARS[seat].color }}>
          {driverName(state, seat)}
          {!here(seat) && <span className="text-slate-400"> (sin conexión)</span>}
        </p>
        <p className="text-xs text-slate-300">
          {done ? "¡Llegó! 🏁" : `Vuelta ${Math.min(hud[seat]?.lap ?? 1, laps)}/${laps}`}
        </p>
      </div>
    </div>
  );
}

/** Each player's tag at the bottom of their own split-screen view. */
function ViewTags({
  seats,
  state,
  hud,
  laps,
  here,
}: {
  seats: Seat[];
  state: CarrerasState;
  hud: Partial<Record<Seat, LiveCar>>;
  laps: number;
  here: (seat: Seat) => boolean;
}) {
  const n = Math.max(1, seats.length);
  const cols = n === 1 ? 1 : 2;
  const rows = n <= 2 ? 1 : 2;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 grid"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
    >
      {seats.map((seat) => (
        <div key={seat} className="relative" style={{ boxShadow: n > 1 ? "inset 0 0 0 2px rgba(2,6,23,0.6)" : undefined }}>
          <div className="absolute bottom-3 left-3">
            <SeatTag seat={seat} state={state} hud={hud} laps={laps} here={here} />
          </div>
        </div>
      ))}
    </div>
  );
}

function JoinCard({
  roomId,
  meta,
  state,
  here,
}: {
  roomId: string;
  meta: CarrerasMeta;
  state: CarrerasState;
  here: (seat: Seat) => boolean;
}) {
  const host = useSyncExternalStore(subscribeNever, () => window.location.host, () => "");
  const ready = SEATS.some(here);
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-5 rounded-3xl bg-slate-950/85 p-8 text-center shadow-2xl backdrop-blur">
      <div className="flex items-center gap-3 text-slate-300">
        <Smartphone className="h-7 w-7 text-cyan-300" />
        <p className="text-xl">Entrá desde tu teléfono</p>
      </div>
      <div>
        <p className="font-mono text-2xl text-slate-300">
          {host}
          {roomPath(meta.game, "")}
          <span className="text-cyan-200">{roomId}</span>
        </p>
        <p className="mt-2 font-mono text-8xl font-bold tracking-[0.2em] text-cyan-200 drop-shadow-[0_0_20px_rgba(34,211,238,0.4)]">
          {roomId}
        </p>
        <p className="mt-1 text-sm text-slate-500">o en la página de Talo: «¿Te invitaron?» y este código</p>
      </div>

      <div className="grid w-full grid-cols-2 gap-3">
        {SEATS.map((seat) => (
          <div
            key={seat}
            className="flex items-center gap-3 rounded-2xl bg-slate-900 p-3"
            style={{ boxShadow: `inset 0 0 0 2px ${CARS[seat].color}${here(seat) ? "" : "40"}` }}
          >
            <span className="h-7 w-12 shrink-0 rounded-lg" style={{ backgroundColor: CARS[seat].color, opacity: here(seat) ? 1 : 0.4 }} />
            <p className={`truncate text-lg font-semibold ${here(seat) ? "text-slate-100" : "text-slate-500"}`}>
              {here(seat) ? driverName(state, seat) : "Libre"}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 text-sm text-slate-400">
        <TrackPreview track={meta.track} seed={trackSeedOf(meta, state)} className="h-14 w-24" />
        <span>
          Pista {trackLabel(meta.track)} · {meta.laps} vueltas
        </span>
        {meta.track === "aleatoria" && (
          <button
            onClick={() => newTrack(roomId, state.trackSeed)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-slate-200 hover:border-slate-400"
          >
            <Shuffle className="h-4 w-4" /> Otra pista
          </button>
        )}
      </div>

      <button onClick={() => startRace(roomId)} disabled={!ready} className={`w-full max-w-sm text-lg ${PRIMARY_BUTTON}`}>
        {ready ? "¡Largar!" : "Esperando pilotos…"}
      </button>
      <p className="text-xs text-slate-500">
        Hasta 4 pilotos. También se puede largar desde un teléfono. Para probar sin teléfonos: A/D y S, o las flechas.
      </p>
    </div>
  );
}
