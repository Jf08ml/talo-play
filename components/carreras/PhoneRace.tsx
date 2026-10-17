"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CARS,
  SEATS,
  openPose,
  racersOf,
  reportFinish,
  seatOf,
  subscribePoses,
  trackSeedOf,
  type CarInputWire,
  type CarPose,
  type CarrerasMeta,
  type CarrerasState,
  type Seat,
} from "@/lib/carreras";
import { MAX_SPEED, collideWithGhost, getTrack, gridCar, lapsDone, stepCar, type Car } from "@/lib/carrerasTrack";
import { RaceAudio, RaceCues } from "@/lib/carrerasAudio";
import { RaceScene, type CameraMode } from "@/lib/carreras3d";
import { drawMinimap, type DrawCar } from "@/lib/carrerasDraw";
import { serverNow } from "@/lib/serverTime";
import { formatRaceTime } from "@/lib/format";
import { useServerNow } from "@/hooks/useServerNow";
import { TaloMark } from "@/components/TaloLogo";
import Controller, { useWakeLock } from "./Controller";
import { Standings, driverName, useCameraMode, useSoundSetting } from "./shared";
import { Eye, Maximize, RotateCw, Volume2, VolumeX } from "lucide-react";

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
 */
export default function PhoneRace({
  roomId,
  meta,
  state,
  myId,
}: {
  roomId: string;
  meta: CarrerasMeta;
  state: CarrerasState;
  myId: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const inputRef = useRef<CarInputWire>({ s: 0, b: false });
  const posesRef = useRef<Record<string, CarPose>>({});
  const [camera, toggleCamera] = useCameraMode();
  const cameraRef = useRef<CameraMode>(camera);
  const [hud, setHud] = useState<Hud | null>(null);
  const [sound, toggleSound] = useSoundSetting();
  const audioRef = useRef<RaceAudio | null>(null);
  const now = useServerNow(true, 100);

  useWakeLock();

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

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
    if (!canvas) return;
    const track = getTrack(trackId, trackSeed);
    const scene = new RaceScene(canvas, track, { maxDpr: 1.5 });
    const audio = audioRef.current;
    const cues = new RaceCues(audio);
    let frame = 0;
    let last = performance.now();
    let acc = 0;
    let own: Car | null = null;
    let ownGame = -1;
    let reportedGame = -1;
    let lastPose = 0;
    let lastHud = "";
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

      scene.setCars(
        Object.fromEntries(racers.map((r) => [r, { color: CARS[r].color, label: driverName(s, r) }]))
      );

      // My car.
      if (isDriver && (!own || ownGame !== s.gameNo)) {
        own = gridCar(track, SEATS.indexOf(seat!));
        ownGame = s.gameNo;
        acc = 0;
      }
      if (!isDriver) own = null;

      const moving = s.status !== "waiting" && now >= s.startedAt;
      scene.setStartLights(cues.countdown(s.gameNo, s.status === "waiting" ? -1 : Math.max(0, Math.ceil((s.startedAt - now) / 1000))));
      if (own && moving) {
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          const done = s.status === "finished" || s.results[seat!] !== undefined;
          const input = done
            ? { steer: 0, brake: false, gas: false }
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
      }
      if (own) {
        cues.air("own", own.air);
        cues.boost("own", own.boost);
      }
      if (own && s.status === "racing" && moving) cues.lap("own", lapsDone(own, track), laps);
      if (own && s.status === "racing" && moving && reportedGame !== s.gameNo && own.progress >= laps * track.length) {
        reportedGame = s.gameNo;
        audio?.finish(Object.keys(s.results).length === 0);
        reportFinish(roomId, s.gameNo, seat!, now - s.startedAt).catch(console.error);
      }
      if (own && poseSender.current && t - lastPose >= POSE_MS) {
        lastPose = t;
        poseSender.current.send({
          g: s.gameNo,
          x: Math.round(own.x * 10) / 10,
          y: Math.round(own.y * 10) / 10,
          z: Math.round(own.z * 10) / 10,
          l: Math.round((own.z - own.ground) * 10) / 10,
          h: Math.round(own.heading * 1000) / 1000,
          vx: Math.round(own.vx),
          vy: Math.round(own.vy),
          p: Math.round(own.progress),
          t: Math.round(now),
        });
      }

      // Rivals: extrapolate from their last sample, then ease toward it.
      const k = 1 - Math.exp(-dt * 12);
      for (const r of racers) {
        if (r === seat && own) continue;
        const pose = posesRef.current[s.seats[r]];
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
      for (const r of [...ghosts.keys()]) if (!racers.includes(r) || (r === seat && own)) ghosts.delete(r);

      // Places: finishers by time, then by distance driven.
      const progressOf = (r: Seat) => (r === seat && own ? own.progress : ghosts.get(r)?.p ?? -Infinity);
      const ranked = [...racers].sort((x, y) => {
        const fx = s.results[x];
        const fy = s.results[y];
        if (fx !== undefined || fy !== undefined) return (fx ?? Infinity) - (fy ?? Infinity);
        return progressOf(y) - progressOf(x);
      });

      const dots: DrawCar[] = [];
      for (const r of racers) {
        if (r === seat && own) {
          scene.setPose(r, { x: own.x, y: own.y, z: own.z, ground: own.ground, heading: own.heading, vx: own.vx, vy: own.vy, bump: own.bump });
          dots.push({ x: own.x, y: own.y, heading: own.heading, color: CARS[r].color });
        } else {
          const g = ghosts.get(r);
          if (!g) continue;
          scene.setPose(r, { x: g.x, y: g.y, z: g.z, ground: g.z - g.l, heading: g.h, vx: g.vx, vy: g.vy });
          dots.push({ x: g.x, y: g.y, heading: g.h, color: CARS[r].color });
        }
      }

      // Engines: mine loud, rivals by how close they are to the camera's car.
      const follow = own ? seat! : ranked[0];
      if (audio) {
        if (s.status === "waiting") audio.silence();
        else {
          const me = follow ? (follow === seat && own ? { x: own.x, y: own.y } : ghosts.get(follow)) : undefined;
          for (const r of racers) {
            const c = r === seat && own ? { x: own.x, y: own.y, vx: own.vx, vy: own.vy, h: own.heading } : ghosts.get(r);
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
        const next = { lap: lapsDone(own, track) + 1, place: ranked.indexOf(seat!) + 1, count: racers.length };
        const key = `${next.lap}:${next.place}:${next.count}`;
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
  }, [trackId, trackSeed, laps, roomId, myId, racersKey]);

  const left = Math.ceil((state.startedAt - now) / 1000);
  const counting = state.status === "racing" && now > 0 && left > 0;
  const go = state.status === "racing" && now > 0 && left <= 0 && now - state.startedAt < 900;
  const myResult = mySeat ? state.results[mySeat] : undefined;
  const fullscreenable = typeof document !== "undefined" && document.fullscreenEnabled;

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
              <span className="font-display text-2xl font-bold">{hud.place}°</span>
              <span className="text-sm text-slate-300">/{hud.count}</span>
              <span className="ml-2 text-sm text-slate-200">
                Vuelta {Math.min(hud.lap, meta.laps)}/{meta.laps}
              </span>
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
            <button
              onClick={toggleCamera}
              className="flex items-center gap-1 rounded-xl bg-slate-950/60 px-2.5 py-2 text-xs text-white backdrop-blur"
            >
              <Eye className="h-4 w-4" /> {camera === "detras" ? "Detrás" : "Cabina"}
            </button>
            {fullscreenable && (
              <button
                onClick={() =>
                  document.fullscreenElement
                    ? document.exitFullscreen().catch(() => {})
                    : document.documentElement.requestFullscreen().catch(() => {})
                }
                aria-label="Pantalla completa"
                className="flex items-center justify-center rounded-xl bg-slate-950/60 p-2 text-white backdrop-blur"
              >
                <Maximize className="h-4 w-4" />
              </button>
            )}
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
