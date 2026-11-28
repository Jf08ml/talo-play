"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  CARS,
  BOT_NAMES,
  SEATS,
  backToWaiting,
  getCarrerasMeta,
  isBotSeat,
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
  writeRaceStats,
  gasOf,
  type CarInputWire,
  type CarrerasGame,
  type CarrerasMeta,
  type CarrerasState,
  type LiveCar,
  type Seat,
  LapClock,
} from "@/lib/carreras";
import {
  MAX_SPEED,
  botInput,
  collideCars,
  getTrack,
  gridCar,
  lapsDone,
  newBrain,
  stepCar,
  inTunnel,
  slipstream,
  trackLabel,
  wrongWay,
  type BotBrain,
  type Car,
  type CarInput,
} from "@/lib/carrerasTrack";
import { RaceAudio, RaceCues } from "@/lib/carrerasAudio";
import { RaceScene, type CameraMode } from "@/lib/carreras3d";
import { drawMinimap, drawTopView, type DrawCar } from "@/lib/carrerasDraw";
import { subscribePresence, type PresenceMap } from "@/lib/presence";
import { serverNow } from "@/lib/serverTime";
import { roomPath } from "@/lib/games";
import RoomQR from "@/components/RoomQR";
import { RaceStatsTracker } from "@/lib/carrerasProgress";
import { ItemCard } from "./ItemCard";
import {
  SLICK_SECONDS,
  botUsesItem,
  hitRockets,
  hitSlicks,
  itemBoxes,
  rocketAlive,
  rocketPose,
  rocketTarget,
  takeBoxes,
  spendItem,
  type ItemBox,
  type Rocket,
  type Slick,
} from "@/lib/carrerasItems";
import { watchRoomMeta } from "@/lib/roomSettings";
import { useServerNow } from "@/hooks/useServerNow";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import TrackPreview from "@/components/carreras/TrackPreview";
import { Standings, driverName, seatCarLook, stuntOf, useCameraMode, useRaceCloser, useSoundSetting } from "@/components/carreras/shared";
import { TaloMark } from "@/components/TaloLogo";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { PRIMARY_BUTTON } from "@/components/ui";
import { Bot, Eye, Shuffle, Smartphone, Volume2, VolumeX, X } from "lucide-react";
import FullscreenButton from "@/components/FullscreenButton";
import { formatRaceTime } from "@/lib/format";
import { useQuality } from "@/hooks/useQuality";
import QualityButton from "@/components/QualityButton";

type Status = "loading" | "not-found" | "ready" | "error";

const subscribeNever = () => () => {};
const STEP = 1 / 120;
/** Keyboard driving on the screen itself, to try it without phones. */
const KEYS: Partial<Record<Seat, { left: string[]; right: string[]; brake: string[]; drift: string[]; item: string[] }>> = {
  a: { left: ["a", "A"], right: ["d", "D"], brake: ["s", "S"], drift: ["Shift"], item: ["e", "E"] },
  b: { left: ["ArrowLeft"], right: ["ArrowRight"], brake: ["ArrowDown"], drift: ["Enter"], item: ["/", "-"] },
};

/** The race's power-ups on the big screen (3D): it runs them all, nothing is shared. */
interface ItemsRun {
  boxes: ItemBox[];
  /** When each box comes back (server time). */
  hidden: number[];
  slicks: Slick[];
  rockets: Rocket[];
  /** Each car's slicks and rockets already met (each gets each one once). */
  seenSlick: Partial<Record<Seat, Set<string>>>;
  seenRocket: Partial<Record<Seat, Set<string>>>;
  /** «Poder» presses seen per seat (the phone's counter, or a key held last frame). */
  pressed: Partial<Record<Seat, number>>;
  next: number;
}

interface Engine {
  /** Which race (or pre-race grid) these cars belong to. */
  key: string;
  cars: Partial<Record<Seat, Car>>;
  reported: Set<Seat>;
  lastLive: string;
  brains: Partial<Record<Seat, BotBrain>>;
  laps: LapClock;
  wrong: string;
  /** What each car did, for its driver's progress (lib/carrerasProgress.ts). */
  stats: RaceStatsTracker;
  /** The cars still racing when it closed got theirs written. */
  statsSent: boolean;
  /** Power-ups (3D only). */
  items: ItemsRun | null;
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
  const [flash, setFlash] = useState<Partial<Record<Seat, Flash>>>({});
  const [wrong, setWrong] = useState<string>("");
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

    const inputFor = (seat: Seat, s: CarrerasState, pace: number): CarInput => {
      if (s.status === "finished" || s.results[seat] !== undefined) return { steer: 0, brake: false, gas: false };
      if (isBotSeat(s, seat)) {
        const brain = (engine!.brains[seat] ??= newBrain(s.botLevel, SEATS.indexOf(seat)));
        return botInput(engine!.cars[seat]!, track, brain, STEP, pace);
      }
      const k = KEYS[seat];
      const keys = keysRef.current;
      const has = (list: string[]) => list.some((key) => keys.has(key));
      if (k && (has(k.left) || has(k.right) || has(k.brake) || has(k.drift))) {
        return { steer: (has(k.right) ? 1 : 0) - (has(k.left) ? 1 : 0), brake: has(k.brake), drift: has(k.drift) };
      }
      const wire = inputsRef.current[s.seats[seat]];
      // No phone connected (or it dropped): the car brakes instead of driving into a wall.
      return wire ? { steer: wire.s ?? 0, brake: !!wire.b, drift: !!wire.d, gas: gasOf(wire) } : { steer: 0, brake: false, gas: false };
    };

    /** Times «Poder» was pressed for this seat so far (the phone's counter; the test keys count each new hold). */
    const keyHeld: Partial<Record<Seat, boolean>> = {};
    const keyPresses: Partial<Record<Seat, number>> = {};
    const pressesFor = (seat: Seat, s: CarrerasState): number => {
      const k = KEYS[seat];
      if (k) {
        const held = k.item.some((key) => keysRef.current.has(key));
        if (held && !keyHeld[seat]) keyPresses[seat] = (keyPresses[seat] ?? 0) + 1;
        keyHeld[seat] = held;
      }
      return (inputsRef.current[s.seats[seat]]?.i ?? 0) + (keyPresses[seat] ?? 0);
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
        engine = {
          key: engineKey(s),
          cars,
          reported: new Set(),
          lastLive: "",
          brains: {},
          laps: new LapClock(),
          wrong: "",
          stats: new RaceStatsTracker(),
          statsSent: false,
          items: is3d ? { boxes: itemBoxes(track), hidden: [], slicks: [], rockets: [], seenSlick: {}, seenRocket: {}, pressed: {}, next: 0 } : null,
        };
        scene?.setCars({});
        setFlash({});
        setWrong("");
      }
      const seats = SEATS.filter((seat) => engine!.cars[seat]);
      scene?.setCars(Object.fromEntries(seats.map((seat) => [seat, seatCarLook(s, seat)])));

      const now = serverNow();
      const moving = s.status !== "waiting" && now >= s.startedAt;
      const lights = cues.countdown(s.gameNo, s.status === "waiting" ? -1 : Math.max(0, Math.ceil((s.startedAt - now) / 1000)));
      scene?.setStartLights(lights);
      // A light rubber band for bots: a bit slower far ahead of the people, a bit faster far behind.
      const people = seats.filter((seat) => !isBotSeat(s, seat));
      const lead = people.length ? Math.max(...people.map((seat) => engine!.cars[seat]!.progress)) : 0;
      const paceOf = (seat: Seat) => {
        if (!people.length) return 1;
        const gap = (engine!.cars[seat]!.progress - lead) / track.length;
        return gap > 0.2 ? 0.92 : gap < -0.25 ? 1.06 : 1;
      };
      if (moving) {
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          for (const seat of seats) {
            const hit = stepCar(engine.cars[seat]!, inputFor(seat, s, paceOf(seat)), track, STEP);
            if (cues.hit(seat, hit)) scene?.impact(seat, hit);
            engine.stats.step(seat, engine.cars[seat]!, hit, STEP);
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
        // Slipstream: every car behind any other (people and bots alike).
        for (const seat of seats) {
          if (s.results[seat] !== undefined) continue;
          slipstream(engine.cars[seat]!, seats.filter((o) => o !== seat).map((o) => engine!.cars[o]!), dt);
        }
      } else {
        acc = 0;
      }

      // Power-ups: boxes, «Poder», oil and rockets (3D). Whoever's behind gets better ones.
      const items = engine.items;
      if (items && s.status === "racing" && moving) {
        const progress: Record<string, number> = Object.fromEntries(seats.map((seat) => [seat, engine!.cars[seat]!.progress]));
        const order = [...seats].sort((x, y) => progress[y] - progress[x]);
        for (const seat of seats) {
          const car = engine.cars[seat]!;
          if (s.results[seat] !== undefined) continue;
          takeBoxes(car, items.boxes, items.hidden, now, order.indexOf(seat) + 1, seats.length);
          let use = false;
          if (isBotSeat(s, seat)) {
            const behind = Math.min(...seats.filter((o) => o !== seat && progress[o] < progress[seat]).map((o) => progress[seat] - progress[o]), Infinity);
            use = botUsesItem(car, { behind, ahead: order.indexOf(seat) > 0, straight: Math.abs(car.drift) === 0 });
          } else {
            const count = pressesFor(seat, s);
            const seen = items.pressed[seat];
            items.pressed[seat] = count;
            use = seen !== undefined && count > seen;
          }
          if (use) {
            const act = spendItem(car);
            if (act?.kind === "aceite") items.slicks.push({ id: `s${items.next++}`, x: act.x, y: act.y, z: act.z, t: now });
            else if (act?.kind === "cohete") {
              const target = rocketTarget(seat, progress);
              if (target) items.rockets.push({ id: `r${items.next++}`, by: seat, target, p0: car.progress, t0: now });
            }
          }
          hitSlicks(car, items.slicks, now, (items.seenSlick[seat] ??= new Set()));
          for (const r of hitRockets(seat, car, items.rockets, now, (items.seenRocket[seat] ??= new Set()))) {
            const shooter = engine.cars[r.by as Seat];
            if (shooter) shooter.rocketHits++;
          }
        }
        items.slicks = items.slicks.filter((sl) => now - sl.t < SLICK_SECONDS * 1000);
        items.rockets = items.rockets.filter((r) => rocketAlive(r, now, progress[r.target]));
      }
      if (scene && items) {
        scene.setItemWorld({
          boxes: items.boxes.map((b, i) => ({ ...b, on: (items.hidden[i] ?? 0) <= now })),
          slicks: items.slicks,
          rockets: items.rockets.map((r) => rocketPose(track, r, now)),
        });
      }

      // Finish line, once per car; a chime on every other lap; lap times and the last lap on each view.
      if (s.status === "racing" && moving) {
        const raceMs = now - s.startedAt;
        let wrongNow = "";
        for (const seat of seats) {
          const car = engine.cars[seat]!;
          const done = lapsDone(car, track);
          cues.lap(seat, done, laps);
          engine.stats.lap(seat, Math.min(done, laps));
          const lapMs = engine.laps.update(seat, done, raceMs);
          if (lapMs && done < laps) {
            const best = engine.laps.best(seat) === lapMs;
            setFlash((f) => ({
              ...f,
              [seat]: { text: done === laps - 1 ? "¡Última vuelta!" : `Vuelta ${done + 1}`, sub: formatRaceTime(lapMs), best, at: now },
            }));
          }
          if (!engine.reported.has(seat) && !isBotSeat(s, seat) && wrongWay(car, track)) wrongNow += seat;
          if (engine.reported.has(seat) || car.progress < laps * track.length) continue;
          engine.reported.add(seat);
          audio?.finish(engine.reported.size === 1);
          scene?.confetti(seat);
          reportFinish(roomId, s.gameNo, seat, raceMs, engine.laps.best(seat)).catch(console.error);
          if (!isBotSeat(s, seat)) writeRaceStats(roomId, s.gameNo, seat, engine.stats.get(seat));
        }
        if (wrongNow !== engine.wrong) {
          engine.wrong = wrongNow;
          setWrong(wrongNow);
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
          cues.stunt(seat, car, dt, pan);
          audio.engine(seat, Math.hypot(car.vx, car.vy) / MAX_SPEED, (slip - 50) / 150, seats.length > 1 ? 0.7 : 1, pan, isBotSeat(s, seat) || gasOf(inputsRef.current[s.seats[seat]]));
        });
        audio.silence(seats);
        // A player's car under a tunnel's roof: everything echoes.
        audio.setTunnel(seats.some((seat) => !isBotSeat(s, seat) && inTunnel(track, engine!.cars[seat]!.s)));
      }

      // Places: finishers by time, then by distance driven.
      const ranked = [...seats].sort((x, y) => {
        const fx = s.results[x];
        const fy = s.results[y];
        if (fx !== undefined || fy !== undefined) return (fx ?? Infinity) - (fy ?? Infinity);
        return engine!.cars[y]!.progress - engine!.cars[x]!.progress;
      });
      if (s.status === "racing" && moving) ranked.forEach((seat, i) => engine!.stats.place(seat, i + 1));
      // Closed with cars still out: their drivers get what they did too.
      if (s.status === "finished" && !engine.statsSent) {
        engine.statsSent = true;
        for (const seat of seats) if (!engine.reported.has(seat) && !isBotSeat(s, seat)) writeRaceStats(roomId, s.gameNo, seat, engine.stats.get(seat));
      }
      if (s.status !== "waiting") {
        const cars: Partial<Record<Seat, LiveCar>> = {};
        ranked.forEach((seat, i) => {
          const car = engine!.cars[seat]!;
          cars[seat] = { lap: lapsDone(car, track) + 1, place: i + 1, ...(car.item ? { it: car.item, ro: car.roll > 0 } : {}) };
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
          scene.setPose(seat, { x: car.x, y: car.y, z: car.z, ground: car.ground, heading: car.heading, vx: car.vx, vy: car.vy, bump: car.bump, ...stuntOf(car) });
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

  if (!configured) return <FirebaseSetupNotice />;

  const here = (seat: Seat) => (!!state && isBotSeat(state, seat)) || (!!state?.seats[seat] && state.seats[seat] in presence);
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
            <ViewTags seats={onTrack} state={state} hud={hud} laps={meta.laps} here={here} flash={flash} wrong={wrong} now={now} />
          )}

          <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3 p-3">
            <div className="flex flex-col items-start gap-2">
              <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-slate-950/70 px-3 py-2 backdrop-blur">
                <Link href="/" aria-label="Volver a Talo">
                  <TaloMark className="h-6 w-6" />
                </Link>
                <span className="font-mono text-lg font-bold tracking-widest text-cyan-200">{roomId}</span>
              </div>
              {/* For whoever arrives mid-race: scan and they're in for the next one. */}
              {state.status !== "waiting" && <RoomQR game={meta.game} roomId={roomId} className="h-24 w-24" />}
            </div>
            {!is3d && state.status !== "waiting" && (
              <div className="flex flex-wrap justify-center gap-2">
                {onTrack.map((seat) => (
                  <SeatTag key={seat} seat={seat} state={state} hud={hud} laps={meta.laps} here={here} flash={flash[seat]} wrong={wrong.includes(seat)} now={now} />
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
              <FullscreenButton className={chip} iconClassName="h-4 w-4" />
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

/** A lap just done (its time) or the last lap starting, shown for a few seconds over a car's view. */
interface Flash {
  text: string;
  sub: string;
  best: boolean;
  /** Server time it appeared. */
  at: number;
}

const FLASH_MS = 2800;

function SeatTag({
  seat,
  state,
  hud,
  laps,
  here,
  flash,
  wrong,
  now,
}: {
  seat: Seat;
  state: CarrerasState;
  hud: Partial<Record<Seat, LiveCar>>;
  laps: number;
  here: (seat: Seat) => boolean;
  flash?: Flash;
  wrong?: boolean;
  now: number;
}) {
  const done = state.results[seat] !== undefined;
  const bot = isBotSeat(state, seat);
  const showFlash = !!flash && now - flash.at < FLASH_MS;
  return (
    <div
      className="flex items-center gap-3 rounded-xl bg-slate-950/70 px-4 py-2 backdrop-blur"
      style={{ boxShadow: `inset 0 0 0 2px ${CARS[seat].color}` }}
    >
      <span className="font-display text-3xl font-bold">{hud[seat] ? `${hud[seat]!.place}°` : "–"}</span>
      <div>
        <p className="flex max-w-44 items-center gap-1 truncate text-sm font-semibold" style={{ color: CARS[seat].color }}>
          {bot && <Bot className="h-4 w-4 shrink-0" />}
          <span className="truncate">{driverName(state, seat)}</span>
          {!here(seat) && <span className="text-slate-400"> (sin conexión)</span>}
        </p>
        <p className="text-xs text-slate-300">
          {done ? "¡Llegó! 🏁" : wrong ? <span className="font-bold text-red-400">¡Contramano!</span> : showFlash ? `${flash!.text} · ${flash!.sub}` : `Vuelta ${Math.min(hud[seat]?.lap ?? 1, laps)}/${laps}`}
        </p>
      </div>
    </div>
  );
}

/** Each player's tag at the bottom of their own split-screen view, plus big notices in the middle of it. */
function ViewTags({
  seats,
  state,
  hud,
  laps,
  here,
  flash,
  wrong,
  now,
}: {
  seats: Seat[];
  state: CarrerasState;
  hud: Partial<Record<Seat, LiveCar>>;
  laps: number;
  here: (seat: Seat) => boolean;
  flash: Partial<Record<Seat, Flash>>;
  wrong: string;
  now: number;
}) {
  const n = Math.max(1, seats.length);
  const cols = n === 1 ? 1 : 2;
  const rows = n <= 2 ? 1 : 2;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 grid"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
    >
      {seats.map((seat) => {
        const f = flash[seat];
        const showFlash = !!f && now - f.at < FLASH_MS && state.results[seat] === undefined;
        const isWrong = wrong.includes(seat);
        return (
          <div key={seat} className="relative" style={{ boxShadow: n > 1 ? "inset 0 0 0 2px rgba(2,6,23,0.6)" : undefined }}>
            {(showFlash || isWrong) && (
              <div className="absolute inset-x-0 top-[22%] flex justify-center">
                <div
                  key={isWrong ? "wrong" : f!.at}
                  className={`animate-celebration-in rounded-2xl px-5 py-2 text-center backdrop-blur ${isWrong ? "bg-red-600/85" : "bg-slate-950/75"}`}
                >
                  <p className={`font-display font-bold text-white ${n > 2 ? "text-2xl" : "text-4xl"}`}>{isWrong ? "¡Contramano!" : f!.text}</p>
                  {!isWrong && (
                    <p className={`font-mono ${n > 2 ? "text-base" : "text-xl"} ${f!.best ? "text-fuchsia-300" : "text-slate-200"}`}>
                      {f!.sub}
                      {f!.best && " · tu mejor vuelta"}
                    </p>
                  )}
                  {isWrong && <p className="text-sm text-red-100">Pega la vuelta</p>}
                </div>
              </div>
            )}
            <div className="absolute bottom-3 left-3">
              <SeatTag seat={seat} state={state} hud={hud} laps={laps} here={here} flash={f} wrong={isWrong} now={now} />
            </div>
            {hud[seat]?.it && state.results[seat] === undefined && (
              <div className="absolute right-3 top-3">
                <ItemCard id={hud[seat]!.it!} rolling={!!hud[seat]!.ro} size={n > 2 ? "sm" : "lg"} hint="«Poder» en tu celular" />
              </div>
            )}
          </div>
        );
      })}
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
  // The free cars bots will drive if nobody takes them.
  const botSeats = SEATS.filter((seat) => !state.seats[seat]).slice(0, state.botCount);
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-5 rounded-3xl bg-slate-950/85 p-8 text-center shadow-2xl backdrop-blur">
      <div className="flex items-center gap-3 text-slate-300">
        <Smartphone className="h-7 w-7 text-cyan-300" />
        <p className="text-xl">Entra desde tu teléfono</p>
      </div>
      <div className="flex w-full flex-col items-center gap-6 sm:flex-row sm:justify-center">
        <RoomQR game={meta.game} roomId={roomId} className="h-44 w-44 shrink-0 sm:h-52 sm:w-52" />
        <div className="min-w-0 sm:text-left">
          <p className="text-lg text-slate-200">Escanéalo con la cámara del celular, o escribe:</p>
          <p className="mt-2 break-all font-mono text-sm text-slate-300 sm:text-xl">
            {host}
            {roomPath(meta.game, "")}
            <span className="text-cyan-200">{roomId}</span>
          </p>
          <p className="mt-2 font-mono text-5xl font-bold tracking-[0.15em] sm:text-7xl sm:tracking-[0.2em] text-cyan-200 drop-shadow-[0_0_20px_rgba(34,211,238,0.4)]">
            {roomId}
          </p>
          <p className="mt-1 text-sm text-slate-500">o en la página de Talo: «¿Te invitaron?» y este código</p>
        </div>
      </div>

      <div className="grid w-full grid-cols-2 gap-3">
        {SEATS.map((seat) => (
          <div
            key={seat}
            className="flex items-center gap-3 rounded-2xl bg-slate-900 p-3"
            style={{ boxShadow: `inset 0 0 0 2px ${CARS[seat].color}${here(seat) ? "" : "40"}` }}
          >
            <span className="h-7 w-12 shrink-0 rounded-lg" style={{ backgroundColor: CARS[seat].color, opacity: here(seat) ? 1 : 0.4 }} />
            <p className={`flex min-w-0 items-center gap-1.5 truncate text-lg font-semibold ${here(seat) ? "text-slate-100" : "text-slate-500"}`}>
              {here(seat) ? (
                driverName(state, seat)
              ) : botSeats.includes(seat) ? (
                <>
                  <Bot className="h-5 w-5 shrink-0" /> {BOT_NAMES[seat]} (bot, si nadie entra)
                </>
              ) : (
                "Libre"
              )}
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
        Hasta 4 pilotos{state.botCount > 0 ? ", los autos libres los manejan bots" : ""}. También se puede largar desde un teléfono. Para probar sin teléfonos: A/D, S y Shift (derrape), o las flechas y Enter.
      </p>
    </div>
  );
}
