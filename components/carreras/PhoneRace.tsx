"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CARS,
  LapClock,
  SEATS,
  carKey,
  isBotSeat,
  openPose,
  racersOf,
  reportFinish,
  seatOf,
  sendBotPose,
  subscribePoses,
  trackSeedOf,
  type CarInputWire,
  type CarPose,
  type CarrerasMeta,
  type CarrerasState,
  type Seat,
} from "@/lib/carreras";
import {
  MAX_SPEED,
  botInput,
  carFromPose,
  collideCars,
  collideWithGhost,
  getTrack,
  gridCar,
  lapsDone,
  newBrain,
  stepCar,
  wrongWay,
  type BotBrain,
  type Car,
} from "@/lib/carrerasTrack";
import { RaceAudio, RaceCues } from "@/lib/carrerasAudio";
import { RaceScene, type CameraMode } from "@/lib/carreras3d";
import { drawMinimap, type DrawCar } from "@/lib/carrerasDraw";
import { serverNow } from "@/lib/serverTime";
import { formatRaceTime } from "@/lib/format";
import { useServerNow } from "@/hooks/useServerNow";
import { TaloMark } from "@/components/TaloLogo";
import Controller, { useWakeLock } from "./Controller";
import { Standings, driverName, useCameraMode, useSoundSetting } from "./shared";
import { Eye, RotateCw, Volume2, VolumeX } from "lucide-react";
import FullscreenButton from "@/components/FullscreenButton";
import { useQuality } from "@/hooks/useQuality";
import QualityButton from "@/components/QualityButton";

const STEP = 1 / 120;
/** How often this phone publishes its car. */
const POSE_MS = 66;
/** Rivals are extrapolated at most this far from their last sample. */
const MAX_EXTRAPOLATE_S = 0.35;

interface Ghost {
  x: number;
  y: number;
  /** Height, and how far above the road. */
  z: number;
  l: number;
  h: number;
  vx: number;
  vy: number;
  p: number;
}

interface Hud {
  lap: number;
  place: number;
  count: number;
  wrong: boolean;
}

/** A lap just done (its time), shown for a few seconds. */
interface Flash {
  text: string;
  sub: string;
  best: boolean;
  key: number;
}

/** Bots run on this phone (it's the bot host): their cars, brains and what was reported. */
interface BotRun {
  game: number;
  cars: Map<Seat, Car>;
  brains: Map<Seat, BotBrain>;
  reported: Set<Seat>;
}

function poseOf(car: Car, game: number, now: number): CarPose {
  return {
    g: game,
    x: Math.round(car.x * 10) / 10,
    y: Math.round(car.y * 10) / 10,
    z: Math.round(car.z * 10) / 10,
    l: Math.round((car.z - car.ground) * 10) / 10,
    h: Math.round(car.heading * 1000) / 1000,
    vx: Math.round(car.vx),
    vy: Math.round(car.vy),
    p: Math.round(car.progress),
    t: Math.round(now),
  };
}

function angleLerp(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/**
 * Telefono mode: this phone simulates and draws its own car in 3D, publishes
 * its pose, and draws the rivals from theirs. Spectators follow the leader.
 * The bot host (`botHost`: the connected person with the lowest id) also
 * drives the bots and publishes them; another phone takes over from their
 * last poses if it leaves.
 */
export default function PhoneRace({
  roomId,
  meta,
  state,
  myId,
  botHost,
}: {
  roomId: string;
  meta: CarrerasMeta;
  state: CarrerasState;
  myId: string;
  botHost: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const lapTimeRef = useRef<HTMLSpanElement>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const botHostRef = useRef(botHost);
  const stateRef = useRef(state);
  const inputRef = useRef<CarInputWire>({ s: 0, b: false });
  const posesRef = useRef<Record<string, CarPose>>({});
  const [camera, toggleCamera] = useCameraMode();
  const cameraRef = useRef<CameraMode>(camera);
  const [hud, setHud] = useState<Hud | null>(null);
  const [sound, toggleSound] = useSoundSetting();
  const [quality, toggleQuality] = useQuality("carreras.calidad");
  const audioRef = useRef<RaceAudio | null>(null);
  const now = useServerNow(true, 100);

  useWakeLock();

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);
  useEffect(() => {
    botHostRef.current = botHost;
  }, [botHost]);
  // Lap notices go away by themselves.
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 2800);
    return () => clearTimeout(id);
  }, [flash]);

  useEffect(() => subscribePoses(roomId, (p) => (posesRef.current = p)), [roomId]);

  // Sound lives as long as the race view (a new context would need another tap to start).
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

  const mySeat = seatOf(state, myId);
  const driving = !!mySeat && state.racers.includes(mySeat);

  // Publish my car while I'm driving.
  const poseSender = useRef<ReturnType<typeof openPose> | null>(null);
  useEffect(() => {
    if (!driving) return;
    const sender = openPose(roomId, myId);
    poseSender.current = sender;
    return () => {
      sender.close();
      poseSender.current = null;
    };
  }, [driving, roomId, myId]);

  const trackId = meta.track;
  const trackSeed = trackSeedOf(meta, state);
  const laps = meta.laps;
  const racersKey = state.racers;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !quality) return;
    const track = getTrack(trackId, trackSeed);
    const scene = new RaceScene(canvas, track, { quality });
    const audio = audioRef.current;
    const cues = new RaceCues(audio);
    const lapClock = new LapClock();
    let frame = 0;
    let last = performance.now();
    let acc = 0;
    let own: Car | null = null;
    let ownGame = -1;
    let reportedGame = -1;
    let lastPose = 0;
    let lastBotPose = 0;
    let lastHud = "";
    let lastSpeed = -1;
    let lastLapText = "";
    let bots: BotRun | null = null;
    // In development `window.__carrerasAuto = true` drives my car like a bot (for testing).
    const autoBrain = process.env.NODE_ENV !== "production" ? newBrain("dificil", 0) : null;
    const ghosts = new Map<Seat, Ghost>();

    const tick = (t: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const s = stateRef.current;
      const racers = racersOf(s);
      const seat = seatOf(s, myId);
      const isDriver = !!seat && racers.includes(seat);
      const now = serverNow();
      const raceMs = now - s.startedAt;

      scene.setCars(
        Object.fromEntries(
          racers.map((r) => [r, { color: CARS[r].color, accent: CARS[r].accent, number: SEATS.indexOf(r) + 1, label: driverName(s, r) }])
        )
      );

      // My car.
      if (isDriver && (!own || ownGame !== s.gameNo)) {
        own = gridCar(track, SEATS.indexOf(seat!));
        ownGame = s.gameNo;
        acc = 0;
      }
      if (!isDriver) own = null;

      // The bots, if this phone runs them: from their last published pose (another phone ran them) or the grid.
      const botSeats = racers.filter((r) => isBotSeat(s, r));
      if (!botHostRef.current || !botSeats.length || s.status === "waiting") bots = null;
      else {
        if (!bots || bots.game !== s.gameNo) bots = { game: s.gameNo, cars: new Map(), brains: new Map(), reported: new Set() };
        for (const r of botSeats) {
          if (bots.cars.has(r)) continue;
          const pose = posesRef.current[carKey(s, r)];
          bots.cars.set(r, pose && pose.g === s.gameNo ? carFromPose(track, pose) : gridCar(track, SEATS.indexOf(r)));
          bots.brains.set(r, newBrain(s.botLevel, SEATS.indexOf(r)));
          // Already past the line in an earlier host's run: don't report it twice.
          if (s.results[r] !== undefined) bots.reported.add(r);
        }
      }
      const runBots = bots;

      const moving = s.status !== "waiting" && now >= s.startedAt;
      scene.setStartLights(cues.countdown(s.gameNo, s.status === "waiting" ? -1 : Math.max(0, Math.ceil((s.startedAt - now) / 1000))));
      if (moving && (own || runBots)) {
        // A light rubber band for bots, against the people's leader.
        const people = racers.filter((r) => !isBotSeat(s, r)).map((r) => (r === seat && own ? own.progress : ghosts.get(r)?.p ?? -Infinity));
        const lead = people.length ? Math.max(...people) : -Infinity;
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          if (own) {
            const done = s.status === "finished" || s.results[seat!] !== undefined;
            const auto = autoBrain && (window as { __carrerasAuto?: boolean }).__carrerasAuto;
            const input = done
              ? { steer: 0, brake: false, gas: false }
              : auto
                ? botInput(own, track, autoBrain, STEP)
                : { steer: inputRef.current.s, brake: inputRef.current.b };
            const hit = stepCar(own, input, track, STEP);
            if (cues.hit("wall", hit)) scene.impact(seat!, hit);
            for (const [r, g] of ghosts) {
              const bump = collideWithGhost(own, g);
              if (cues.hit(r, bump)) {
                scene.impact(seat!, bump);
                scene.impact(r, bump);
              }
            }
          }
          if (runBots) {
            for (const [r, car] of runBots.cars) {
              const gap = Number.isFinite(lead) ? (car.progress - lead) / track.length : 0;
              const pace = gap > 0.2 ? 0.92 : gap < -0.25 ? 1.06 : 1;
              const done = s.status === "finished" || s.results[r] !== undefined || runBots.reported.has(r);
              const input = done ? { steer: 0, brake: false, gas: false } : botInput(car, track, runBots.brains.get(r)!, STEP, pace);
              const hit = stepCar(car, input, track, STEP);
              if (cues.hit(r, hit)) scene.impact(r, hit);
              for (const ghost of ghosts.values()) collideWithGhost(car, ghost);
            }
            const list = [...runBots.cars.entries()];
            for (let i = 0; i < list.length; i++) {
              for (let j = i + 1; j < list.length; j++) collideCars(list[i][1], list[j][1]);
              if (own) {
                const bump = collideCars(own, list[i][1]);
                if (cues.hit(list[i][0], bump)) {
                  scene.impact(seat!, bump);
                  scene.impact(list[i][0], bump);
                }
              }
            }
          }
        }
      } else {
        acc = 0;
      }
      if (own) {
        cues.air("own", own.air);
        cues.boost("own", own.boost);
      }
      if (own && s.status === "racing" && moving) {
        const done = lapsDone(own, track);
        cues.lap("own", done, laps);
        const lapMs = lapClock.update("own", done, raceMs);
        if (lapMs && done < laps) {
          setFlash({
            text: done === laps - 1 ? "¡Última vuelta!" : `Vuelta ${done + 1}`,
            sub: formatRaceTime(lapMs),
            best: lapClock.best("own") === lapMs && done > 1,
            key: now,
          });
        }
      }
      if (own && s.status === "racing" && moving && reportedGame !== s.gameNo && own.progress >= laps * track.length) {
        reportedGame = s.gameNo;
        audio?.finish(Object.keys(s.results).length === 0);
        scene.confetti(seat!);
        reportFinish(roomId, s.gameNo, seat!, raceMs, lapClock.best("own")).catch(console.error);
      }
      if (runBots && s.status === "racing" && moving) {
        for (const [r, car] of runBots.cars) {
          lapClock.update(r, lapsDone(car, track), raceMs);
          if (runBots.reported.has(r) || car.progress < laps * track.length) continue;
          runBots.reported.add(r);
          scene.confetti(r);
          reportFinish(roomId, s.gameNo, r, raceMs, lapClock.best(r)).catch(console.error);
        }
      }
      if (own && poseSender.current && t - lastPose >= POSE_MS) {
        lastPose = t;
        poseSender.current.send(poseOf(own, s.gameNo, now));
      }
      if (runBots && t - lastBotPose >= POSE_MS) {
        lastBotPose = t;
        for (const [r, car] of runBots.cars) sendBotPose(roomId, r, poseOf(car, s.gameNo, now));
      }

      // Rivals: extrapolate from their last sample, then ease toward it.
      const k = 1 - Math.exp(-dt * 12);
      for (const r of racers) {
        if ((r === seat && own) || runBots?.cars.has(r)) continue;
        const pose = posesRef.current[carKey(s, r)];
        let target: Ghost;
        if (pose && pose.g === s.gameNo) {
          const ahead = Math.max(0, Math.min(MAX_EXTRAPOLATE_S, (now - pose.t) / 1000));
          target = {
            x: pose.x + pose.vx * ahead,
            y: pose.y + pose.vy * ahead,
            z: pose.z ?? 0,
            l: pose.l ?? 0,
            h: pose.h,
            vx: pose.vx,
            vy: pose.vy,
            p: pose.p,
          };
        } else {
          const g = gridCar(track, SEATS.indexOf(r));
          target = { x: g.x, y: g.y, z: g.z, l: 0, h: g.heading, vx: 0, vy: 0, p: g.progress };
        }
        const cur = ghosts.get(r);
        if (!cur || Math.hypot(cur.x - target.x, cur.y - target.y) > 150) ghosts.set(r, target);
        else {
          cur.x += (target.x - cur.x) * k;
          cur.y += (target.y - cur.y) * k;
          cur.z += (target.z - cur.z) * k;
          cur.l += (target.l - cur.l) * k;
          cur.h = angleLerp(cur.h, target.h, k);
          cur.vx = target.vx;
          cur.vy = target.vy;
          cur.p = target.p;
        }
      }
      for (const r of [...ghosts.keys()]) if (!racers.includes(r) || (r === seat && own) || runBots?.cars.has(r)) ghosts.delete(r);

      // Every car as plain numbers, wherever it's simulated.
      const carOf = (r: Seat) => {
        if (r === seat && own) return { x: own.x, y: own.y, z: own.z, ground: own.ground, h: own.heading, vx: own.vx, vy: own.vy, p: own.progress, bump: own.bump };
        const b = runBots?.cars.get(r);
        if (b) return { x: b.x, y: b.y, z: b.z, ground: b.ground, h: b.heading, vx: b.vx, vy: b.vy, p: b.progress, bump: b.bump };
        const g = ghosts.get(r);
        return g ? { x: g.x, y: g.y, z: g.z, ground: g.z - g.l, h: g.h, vx: g.vx, vy: g.vy, p: g.p, bump: 0 } : null;
      };

      // Places: finishers by time, then by distance driven.
      const progressOf = (r: Seat) => carOf(r)?.p ?? -Infinity;
      const ranked = [...racers].sort((x, y) => {
        const fx = s.results[x];
        const fy = s.results[y];
        if (fx !== undefined || fy !== undefined) return (fx ?? Infinity) - (fy ?? Infinity);
        return progressOf(y) - progressOf(x);
      });

      const dots: DrawCar[] = [];
      for (const r of racers) {
        const c = carOf(r);
        if (!c) continue;
        scene.setPose(r, { x: c.x, y: c.y, z: c.z, ground: c.ground, heading: c.h, vx: c.vx, vy: c.vy, bump: c.bump });
        dots.push({ x: c.x, y: c.y, heading: c.h, color: CARS[r].color });
      }

      // Engines: mine loud, rivals by how close they are to the camera's car.
      const follow = own ? seat! : ranked[0];
      if (audio) {
        if (s.status === "waiting") audio.silence();
        else {
          const me = follow ? carOf(follow) : null;
          for (const r of racers) {
            const c = carOf(r);
            if (!c) continue;
            const isMine = r === follow;
            const dist = me ? Math.hypot(c.x - me.x, c.y - me.y) : 0;
            const volume = isMine ? 1 : Math.max(0, 1 - dist / 500) * 0.6;
            const slip = isMine ? Math.abs(-c.vx * Math.sin(c.h) + c.vy * Math.cos(c.h)) : 0;
            audio.engine(r, Math.hypot(c.vx, c.vy) / MAX_SPEED, (slip - 50) / 150, volume);
          }
          audio.silence(racers);
        }
      }
      scene.render(follow ? [{ key: follow }] : [], cameraRef.current, dt);
      drawMinimap(minimapRef.current, track, dots);

      if (own) {
        // Speed and lap clock straight into the DOM: no re-render every frame.
        const kmh = Math.round((Math.max(0, own.vx * Math.cos(own.heading) + own.vy * Math.sin(own.heading)) / MAX_SPEED) * 220);
        if (speedRef.current && kmh !== lastSpeed) {
          lastSpeed = kmh;
          speedRef.current.textContent = String(kmh);
        }
        const lapText = s.status === "racing" && moving && s.results[seat!] === undefined ? formatRaceTime(lapClock.current("own", raceMs)) : "";
        if (lapTimeRef.current && lapText !== lastLapText) {
          lastLapText = lapText;
          lapTimeRef.current.textContent = lapText;
        }
        const next = {
          lap: lapsDone(own, track) + 1,
          place: ranked.indexOf(seat!) + 1,
          count: racers.length,
          wrong: moving && s.results[seat!] === undefined && wrongWay(own, track),
        };
        const key = `${next.lap}:${next.place}:${next.count}:${next.wrong}`;
        if (key !== lastHud) {
          lastHud = key;
          setHud(next);
        }
      }
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      scene.dispose();
      audio?.silence();
    };
  }, [trackId, trackSeed, laps, roomId, myId, racersKey, quality]);

  const left = Math.ceil((state.startedAt - now) / 1000);
  const counting = state.status === "racing" && now > 0 && left > 0;
  const go = state.status === "racing" && now > 0 && left <= 0 && now - state.startedAt < 900;
  const myResult = mySeat ? state.results[mySeat] : undefined;

  return (
    <div className="fixed inset-0 z-40 select-none overflow-hidden bg-sky-300" style={{ touchAction: "none" }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Top bar: place and lap, minimap, camera. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto flex items-center gap-2">
          <Link href="/" aria-label="Volver a Talo" className="rounded-xl bg-slate-950/60 p-2 backdrop-blur">
            <TaloMark className="h-5 w-5" />
          </Link>
          {driving && hud && (
            <div className="rounded-xl bg-slate-950/60 px-3 py-1.5 text-white backdrop-blur" style={{ boxShadow: `inset 0 0 0 2px ${CARS[mySeat!].color}` }}>
              <p>
                <span className="font-display text-2xl font-bold">{hud.place}°</span>
                <span className="text-sm text-slate-300">/{hud.count}</span>
                <span className="ml-2 text-sm text-slate-200">
                  Vuelta {Math.min(hud.lap, meta.laps)}/{meta.laps}
                </span>
              </p>
              <p className="flex items-baseline gap-2 font-mono text-xs text-slate-300">
                <span>
                  <span ref={speedRef} className="text-base font-bold text-white">0</span> km/h
                </span>
                <span ref={lapTimeRef} />
              </p>
            </div>
          )}
          {!driving && (
            <p className="rounded-xl bg-slate-950/60 px-3 py-1.5 text-sm text-slate-200 backdrop-blur">Mirando la carrera</p>
          )}
        </div>
        <div className="pointer-events-auto flex items-start gap-2">
          <canvas ref={minimapRef} className="h-16 w-28 rounded-xl bg-slate-950/40 backdrop-blur" />
          <div className="flex flex-col gap-2">
            <button
              onClick={toggleSound}
              aria-label={sound ? "Silenciar" : "Activar sonido"}
              className="flex items-center justify-center rounded-xl bg-slate-950/60 p-2 text-white backdrop-blur"
            >
              {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <QualityButton quality={quality} onToggle={toggleQuality} />
            <button
              onClick={toggleCamera}
              className="flex items-center gap-1 rounded-xl bg-slate-950/60 px-2.5 py-2 text-xs text-white backdrop-blur"
            >
              <Eye className="h-4 w-4" /> {camera === "detras" ? "Detrás" : "Cabina"}
            </button>
            <FullscreenButton className="flex items-center justify-center rounded-xl bg-slate-950/60 p-2 text-white backdrop-blur" />
          </div>
        </div>
      </div>

      <p className="pointer-events-none absolute inset-x-0 top-20 hidden items-center justify-center gap-1.5 text-xs text-white/90 drop-shadow portrait:flex">
        <RotateCw className="h-3.5 w-3.5" /> Girá el teléfono para ver mejor la pista
      </p>

      {(counting || go) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            key={counting ? left : "go"}
            className="animate-celebration-in font-display text-[28vmin] font-extrabold drop-shadow-[0_0_30px_rgba(0,0,0,0.7)]"
            style={{ color: counting ? "#f8fafc" : "#4ade80" }}
          >
            {counting ? left : "¡YA!"}
          </span>
        </div>
      )}

      {driving && hud?.wrong && myResult === undefined && (
        <div className="pointer-events-none absolute inset-x-0 top-1/4 flex justify-center px-4">
          <div className="animate-celebration-in rounded-2xl bg-red-600/85 px-5 py-2 text-center text-white backdrop-blur">
            <p className="font-display text-3xl font-bold">¡Contramano!</p>
            <p className="text-sm text-red-100">Pegá la vuelta</p>
          </div>
        </div>
      )}

      {driving && flash && !hud?.wrong && myResult === undefined && (
        <div className="pointer-events-none absolute inset-x-0 top-1/4 flex justify-center px-4">
          <div key={flash.key} className="animate-celebration-in rounded-2xl bg-slate-950/75 px-5 py-2 text-center text-white backdrop-blur">
            <p className="font-display text-3xl font-bold">{flash.text}</p>
            <p className={`font-mono text-lg ${flash.best ? "text-fuchsia-300" : "text-slate-200"}`}>
              {flash.sub}
              {flash.best && " · tu mejor vuelta"}
            </p>
          </div>
        </div>
      )}

      {state.status === "racing" && myResult !== undefined && (
        <div className="pointer-events-none absolute inset-x-0 top-1/4 flex justify-center px-4">
          <div className="animate-celebration-in rounded-2xl bg-slate-950/80 px-5 py-3 text-center text-white backdrop-blur">
            <p className="font-display text-2xl font-bold">¡Llegaste! {formatRaceTime(myResult)}</p>
            <p className="text-sm text-slate-300">Esperando a los demás…</p>
          </div>
        </div>
      )}

      {driving && state.status === "racing" && myResult === undefined && (
        <Controller
          color={CARS[mySeat!].color}
          locked={counting}
          variant="overlay"
          onInput={(input) => (inputRef.current = input)}
        />
      )}

      {state.status === "finished" && (
        <div className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-slate-950/30 p-4">
          <Standings roomId={roomId} state={state} myId={myId} randomTrack={meta.track === "aleatoria"} />
        </div>
      )}
    </div>
  );
}
