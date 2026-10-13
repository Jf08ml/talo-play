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
  normalizeMeta,
  rematch,
  reportWinner,
  startRace,
  subscribeCarreras,
  subscribeInputs,
  writeLive,
  type CarInputWire,
  type CarrerasMeta,
  type CarrerasState,
  type LiveCar,
  type Seat,
} from "@/lib/carreras";
import {
  CAR_LENGTH,
  CAR_WIDTH,
  TRACKS,
  WORLD_H,
  WORLD_W,
  collideCars,
  getTrack,
  gridCars,
  lapsDone,
  stepCar,
  type Car,
  type CarInput,
  type Track,
} from "@/lib/carrerasTrack";
import { subscribePresence, type PresenceMap } from "@/lib/presence";
import { serverNow } from "@/lib/serverTime";
import { formatRaceTime } from "@/lib/format";
import { roomPath } from "@/lib/games";
import { useServerNow } from "@/hooks/useServerNow";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import TrackPreview from "@/components/carreras/TrackPreview";
import { TaloMark } from "@/components/TaloLogo";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import { Maximize, Minimize, Smartphone } from "lucide-react";

type Status = "loading" | "not-found" | "ready" | "error";

const subscribeNever = () => () => {};

const STEP = 1 / 120;
/** Keyboard driving on the screen itself, to try it without phones. */
const KEYS: Record<Seat, { left: string[]; right: string[]; brake: string[] }> = {
  a: { left: ["a", "A"], right: ["d", "D"], brake: ["s", "S"] },
  b: { left: ["ArrowLeft"], right: ["ArrowRight"], brake: ["ArrowDown"] },
};

interface Engine {
  /** Which race (or pre-race grid) these cars belong to. */
  key: string;
  track: Track;
  cars: Partial<Record<Seat, Car>>;
  reported: boolean;
  lastLive: string;
}

/**
 * The race screen (a computer on a TV or projector). It never joins the room
 * as a player: it simulates the cars from the phones' inputs, draws them and
 * reports the winner.
 */
export default function PantallaClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<CarrerasMeta | null>(null);
  const [state, setState] = useState<CarrerasState | null>(null);
  const [presence, setPresence] = useState<PresenceMap>({});
  const [hud, setHud] = useState<Partial<Record<Seat, LiveCar>>>({});

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<CarrerasState | null>(null);
  const inputsRef = useRef<Record<string, CarInputWire>>({});
  const keysRef = useRef(new Set<string>());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    const unsubs: (() => void)[] = [];

    getCarrerasMeta(roomId)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== "carreras") return router.replace(`/sala/${roomId}`);
        setMeta(normalizeMeta(raw));
        unsubs.push(
          subscribeCarreras(roomId, setState),
          subscribePresence(roomId, setPresence),
          subscribeInputs(roomId, (inputs) => {
            inputsRef.current = inputs;
          })
        );
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
  }, [configured, roomId, router]);

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

  // The race loop: fixed-step physics, then a draw, every animation frame.
  const trackId = meta?.track;
  const laps = meta?.laps ?? 5;
  useEffect(() => {
    if (!trackId) return;
    const track = getTrack(trackId);
    let engine: Engine | null = null;
    let frame = 0;
    let last = performance.now();
    let acc = 0;

    const inputFor = (seat: Seat, s: CarrerasState): CarInput => {
      const k = KEYS[seat];
      const keys = keysRef.current;
      const has = (list: string[]) => list.some((key) => keys.has(key));
      if (has(k.left) || has(k.right) || has(k.brake)) {
        return { steer: (has(k.right) ? 1 : 0) - (has(k.left) ? 1 : 0), brake: has(k.brake) };
      }
      const wire = inputsRef.current[s.seats[seat]];
      // No phone connected (or it dropped): the car brakes instead of driving into a wall.
      return wire ? { steer: wire.s ?? 0, brake: !!wire.b } : { steer: 0, brake: true };
    };

    const resetFor = (s: CarrerasState): Engine => {
      const grid = gridCars(track, 2);
      const cars: Partial<Record<Seat, Car>> = {};
      SEATS.forEach((seat, i) => {
        if (s.seats[seat] || s.status === "waiting") cars[seat] = grid[i];
      });
      return { key: engineKey(s), track, cars, reported: false, lastLive: "" };
    };

    const tick = (t: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const s = stateRef.current;
      if (!s) return;

      if (!engine || engine.key !== engineKey(s)) engine = resetFor(s);

      const now = serverNow();
      const moving = s.status !== "waiting" && now >= s.startedAt;
      if (moving) {
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          for (const seat of SEATS) {
            const car = engine.cars[seat];
            if (car) stepCar(car, inputFor(seat, s), track, STEP);
          }
          if (engine.cars.a && engine.cars.b) collideCars(engine.cars.a, engine.cars.b);
        }
      } else {
        acc = 0;
      }

      // Finish line.
      if (s.status === "racing" && moving && !engine.reported) {
        const done = SEATS.filter((seat) => (engine!.cars[seat]?.progress ?? -Infinity) >= laps * track.length);
        if (done.length) {
          engine.reported = true;
          const first = done.sort((x, y) => engine!.cars[y]!.progress - engine!.cars[x]!.progress)[0];
          reportWinner(roomId, s.gameNo, first, now - s.startedAt).catch(console.error);
        }
      }

      // Laps and places, for the HUD and the phones (only when they change).
      if (s.status !== "waiting") {
        const ranked = SEATS.filter((seat) => engine!.cars[seat]).sort(
          (x, y) => engine!.cars[y]!.progress - engine!.cars[x]!.progress
        );
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

      draw(canvasRef.current, track, engine, s);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [trackId, laps, roomId]);

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

  const name = (seat: Seat) => (state ? state.players[state.seats[seat]]?.name ?? "" : "");
  const here = (seat: Seat) => !!state?.seats[seat] && state.seats[seat] in presence;
  const left = state ? Math.ceil((state.startedAt - now) / 1000) : 0;
  const counting = state?.status === "racing" && now > 0 && left > 0;
  const go = state?.status === "racing" && now > 0 && left <= 0 && now - state.startedAt < 900;

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0b2a18] text-slate-100">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {status === "loading" && <RoomLoading text="Armando la pista…" />}
      {status === "not-found" && <RoomNotFound />}
      {status === "error" && <RoomError message="No se pudo cargar la sala." />}

      {status === "ready" && state && meta && (
        <>
          {/* Top bar: brand, code and each car's lap/place. */}
          <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3 p-3 sm:p-4">
            <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-slate-950/70 px-3 py-2 backdrop-blur">
              <Link href="/" aria-label="Volver a Talo">
                <TaloMark className="h-6 w-6" />
              </Link>
              <span className="font-mono text-lg font-bold tracking-widest text-cyan-200">{roomId}</span>
            </div>
            {state.status !== "waiting" && (
              <div className="flex gap-2">
                {SEATS.filter((seat) => state.seats[seat]).map((seat) => (
                  <div
                    key={seat}
                    className="flex items-center gap-3 rounded-xl bg-slate-950/70 px-4 py-2 backdrop-blur"
                    style={{ boxShadow: `inset 0 0 0 2px ${CARS[seat].color}` }}
                  >
                    <span className="font-display text-3xl font-bold">{hud[seat] ? `${hud[seat]!.place}°` : "–"}</span>
                    <div>
                      <p className="max-w-40 truncate text-sm font-semibold" style={{ color: CARS[seat].color }}>
                        {name(seat)}
                        {!here(seat) && <span className="text-slate-400"> (sin conexión)</span>}
                      </p>
                      <p className="text-xs text-slate-300">
                        Vuelta {Math.min(hud[seat]?.lap ?? 1, meta.laps)}/{meta.laps}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={toggleFullscreen}
              className="pointer-events-auto rounded-xl bg-slate-950/70 p-2.5 text-slate-300 backdrop-blur hover:text-white"
              aria-label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            >
              {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          </div>

          {state.status === "waiting" && (
            <div className="relative z-10 flex flex-1 items-center justify-center p-4">
              <JoinCard roomId={roomId} meta={meta} name={name} here={here} />
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

          {state.status === "finished" && state.winner && (
            <div className="relative z-10 flex flex-1 items-center justify-center p-4">
              <div className="animate-celebration-in flex flex-col items-center gap-3 rounded-3xl bg-slate-950/85 px-10 py-8 text-center shadow-2xl backdrop-blur">
                <p className="text-6xl">🏆</p>
                <p className="font-display text-5xl font-bold" style={{ color: CARS[state.winner].color }}>
                  ¡Ganó {name(state.winner) || CARS[state.winner].label}!
                </p>
                <p className="text-lg text-slate-300">Tiempo: {formatRaceTime(state.winnerMs)}</p>
                {SEATS.filter((seat) => state.seats[seat]).length > 1 && (
                  <p className="text-sm text-slate-400">
                    {SEATS.map((seat) => `${name(seat)} ${state.wins[state.seats[seat]] ?? 0}`).join(" · ")}
                  </p>
                )}
                <div className="mt-2 flex gap-3">
                  <button onClick={() => rematch(roomId, state.gameNo)} className={`px-8 ${PRIMARY_BUTTON}`}>
                    Revancha
                  </button>
                  <button onClick={() => backToWaiting(roomId, state.gameNo)} className={`px-6 ${SECONDARY_BUTTON}`}>
                    Cambiar pilotos
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Cars are put back on the grid when this changes: a new race, or leaving/entering the waiting screen. */
function engineKey(s: CarrerasState): string {
  return `${s.gameNo}:${s.status === "waiting" ? "w" : "r"}`;
}

function JoinCard({
  roomId,
  meta,
  name,
  here,
}: {
  roomId: string;
  meta: CarrerasMeta;
  name: (seat: Seat) => string;
  here: (seat: Seat) => boolean;
}) {
  const host = useSyncExternalStore(subscribeNever, () => window.location.host, () => "");
  const ready = SEATS.some(here);
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-6 rounded-3xl bg-slate-950/85 p-8 text-center shadow-2xl backdrop-blur">
      <div className="flex items-center gap-3 text-slate-300">
        <Smartphone className="h-7 w-7 text-cyan-300" />
        <p className="text-xl">Entrá desde tu teléfono</p>
      </div>
      <div>
        <p className="font-mono text-2xl text-slate-300">
          {host}
          {roomPath("carreras", "")}
          <span className="text-cyan-200">{roomId}</span>
        </p>
        <p className="mt-2 font-mono text-8xl font-bold tracking-[0.2em] text-cyan-200 drop-shadow-[0_0_20px_rgba(34,211,238,0.4)]">
          {roomId}
        </p>
        <p className="mt-1 text-sm text-slate-500">o en la página de Talo: «¿Te invitaron?» y este código</p>
      </div>

      <div className="grid w-full grid-cols-2 gap-4">
        {SEATS.map((seat) => (
          <div
            key={seat}
            className="flex items-center gap-3 rounded-2xl bg-slate-900 p-4"
            style={{ boxShadow: `inset 0 0 0 2px ${CARS[seat].color}${here(seat) ? "" : "55"}` }}
          >
            <span className="h-8 w-14 shrink-0 rounded-lg" style={{ backgroundColor: CARS[seat].color }} />
            <div className="min-w-0 text-left">
              <p className="text-xs uppercase tracking-wide text-slate-500">{CARS[seat].label}</p>
              <p className={`truncate text-xl font-semibold ${here(seat) ? "text-slate-100" : "text-slate-500"}`}>
                {here(seat) ? name(seat) : "Esperando piloto…"}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 text-sm text-slate-400">
        <TrackPreview track={meta.track} className="h-14 w-24" />
        <span>
          {TRACKS[meta.track].label} · {meta.laps} vueltas
        </span>
      </div>

      <button onClick={() => startRace(roomId)} disabled={!ready} className={`w-full max-w-sm text-lg ${PRIMARY_BUTTON}`}>
        {ready ? "¡Largar!" : "Esperando pilotos…"}
      </button>
      <p className="text-xs text-slate-500">
        También se puede largar desde un teléfono. Para probar sin teléfonos: A/D y S, o las flechas.
      </p>
    </div>
  );
}

// ---- Drawing --------------------------------------------------------------

function tracePath(ctx: CanvasRenderingContext2D, track: Track) {
  ctx.beginPath();
  ctx.moveTo(track.xs[0], track.ys[0]);
  for (let i = 1; i < track.xs.length; i++) ctx.lineTo(track.xs[i], track.ys[i]);
  ctx.closePath();
}

function draw(canvas: HTMLCanvasElement | null, track: Track, engine: Engine, s: CarrerasState) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const cw = Math.round(canvas.clientWidth * dpr);
  const ch = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#0b2a18";
  ctx.fillRect(0, 0, cw, ch);

  const scale = Math.min(cw / WORLD_W, ch / WORLD_H);
  ctx.setTransform(scale, 0, 0, scale, (cw - WORLD_W * scale) / 2, (ch - WORLD_H * scale) / 2);

  // Grass.
  ctx.fillStyle = "#14532d";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.fillStyle = "#166534";
  for (let x = 0; x < WORLD_W; x += 120) ctx.fillRect(x, 0, 60, WORLD_H);

  const w = track.def.width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Curbs (red and white), asphalt, center line.
  tracePath(ctx, track);
  ctx.lineWidth = w + 18;
  ctx.strokeStyle = "#f8fafc";
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.strokeStyle = "#dc2626";
  ctx.setLineDash([22, 22]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = w;
  ctx.strokeStyle = "#3f3f46";
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(248,250,252,0.35)";
  ctx.setLineDash([26, 26]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Checkered start/finish line at the first sample.
  const dx = track.xs[1] - track.xs[0];
  const dy = track.ys[1] - track.ys[0];
  ctx.save();
  ctx.translate(track.xs[0], track.ys[0]);
  ctx.rotate(Math.atan2(dy, dx));
  const sq = 9;
  for (let r = 0; r < Math.ceil(w / sq); r++) {
    for (let c = 0; c < 2; c++) {
      ctx.fillStyle = (r + c) % 2 ? "#0f172a" : "#f8fafc";
      ctx.fillRect(c * sq - sq, r * sq - w / 2, sq, sq);
    }
  }
  ctx.restore();

  // Cars.
  for (const seat of SEATS) {
    const car = engine.cars[seat];
    if (!car) continue;
    const color = CARS[seat].color;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.heading);
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-CAR_LENGTH / 2, -CAR_WIDTH / 2, CAR_LENGTH, CAR_WIDTH, 6);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "rgba(15,23,42,0.75)";
    ctx.fillRect(2, -CAR_WIDTH / 2 + 3, 8, CAR_WIDTH - 6);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(CAR_LENGTH / 2 - 3, -CAR_WIDTH / 2 + 2, 3, 4);
    ctx.fillRect(CAR_LENGTH / 2 - 3, CAR_WIDTH / 2 - 6, 3, 4);
    ctx.restore();

    if (car.bump > 0) {
      ctx.fillStyle = "#fde047";
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 14 + Math.random() * 10;
        ctx.fillRect(car.x + Math.cos(a) * r, car.y + Math.sin(a) * r, 3, 3);
      }
    }

    // Driver's name above the car.
    const label = s.players[s.seats[seat]]?.name;
    if (label) {
      ctx.font = "600 16px system-ui, sans-serif";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(2,6,23,0.7)";
      ctx.beginPath();
      ctx.roundRect(car.x - tw / 2 - 6, car.y - 44, tw + 12, 22, 6);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, car.x, car.y - 33);
    }
  }
}
