"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  REGEN_DELAY_MS,
  REGEN_EVERY_MS,
  ROUND_END_MS,
  ROUND_SECONDS,
  alive,
  backToWaiting,
  fighterName,
  forfeit,
  isBot,
  nextRound,
  openPose,
  pickItem,
  regenerate,
  respawnItems,
  roundKey,
  shootArrow,
  startMatch,
  strike,
  subscribeArrows,
  subscribePoses,
  teamFighters,
  teamInfo,
  timeoutRound,
  type ArenaArrow,
  type ArenaMeta,
  type ArenaPose,
  type ArenaState,
} from "@/lib/arena";
import {
  ACTS,
  FIGHTER_RADIUS,
  Fighter,
  ITEM_LABEL,
  MAX_HP,
  MAX_STAMINA,
  PICK_RADIUS,
  PILLAR_SOLIDS,
  START_GEAR,
  WEAPONS,
  arrowAt,
  botInput,
  flyArrow,
  launchArrow,
  meleeStrikes,
  newMind,
  spawnPoint,
  type Arrow,
  type BotEnemy,
  type BotMind,
  type FighterEvent,
  type FighterInput,
  type FighterView,
  type Gear,
  type Strike,
} from "@/lib/arenaSim";
import { ArenaScene, type ArenaCamera, type KnightPose } from "@/lib/arena3d";
import { ArenaAudio } from "@/lib/arenaAudio";
import { serverNow } from "@/lib/serverTime";
import type { PresenceMap } from "@/lib/presence";
import type { TeamId } from "@/lib/teams";
import { useWakeLock } from "@/components/carreras/Controller";
import { TaloMark } from "@/components/TaloLogo";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import { MOUSE_LOOK, TOUCH_LOOK, TouchControls, newControls, useDesktopControls, useFinePointer, type ControlState } from "./Controls";
import { Eye, Maximize, MousePointerClick, RotateCw, Shield, Users, Volume2, VolumeX } from "lucide-react";

const STEP = 1 / 60;
const POSE_MS = 50;
/** A person gone this long from the room falls (so a round never hangs). */
const ABSENT_MS = 5000;
/** After you fall, the camera stays on you this long before following a teammate. */
const DEATH_VIEW_MS = 2500;

interface Ghost {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Velocity estimated from the last two poses, for a little extrapolation. */
  vx: number;
  vz: number;
  lastT: number;
  pose: ArenaPose | null;
}

interface LocalArrow {
  id: number;
  a: Arrow;
  /** Server time it left. */
  t0: number;
  /** Seconds of flight already checked. */
  done: number;
  owner: string;
  team: TeamId;
  down: () => void;
}

interface BotRun {
  f: Fighter;
  mind: BotMind;
  actAt: number;
  lastT: number;
  pickAt: number;
  send: ReturnType<typeof openPose>;
}

interface Hud {
  hp: number;
  stamina: number;
  gear: Gear;
  near: string | null;
  nearLabel: string;
  alive: boolean;
  watching: string;
  draw: number;
}

const SOUND_KEY = "arena.sound";
const CAMERA_KEY = "arena.camera";

function useStored<T extends string>(key: string, fallback: T, other: T): [T, () => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return localStorage.getItem(key) === other ? other : fallback;
    } catch {
      return fallback;
    }
  });
  const toggle = () =>
    setValue((v) => {
      const next = v === fallback ? other : fallback;
      try {
        localStorage.setItem(key, next);
      } catch {
        // Just not remembered.
      }
      return next;
    });
  return [value, toggle];
}

function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The match on screen: the arena in 3D, your fighter, the bots if you run them, and the HUD. */
export default function Battle({
  roomId,
  meta,
  state,
  myId,
  presence,
  presenceLoaded,
}: {
  roomId: string;
  meta: ArenaMeta;
  state: ArenaState;
  myId: string;
  presence: PresenceMap;
  presenceLoaded: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const presenceRef = useRef({ presence, presenceLoaded });
  const controlsRef = useRef<ControlState>(newControls());
  const [camera, toggleCamera] = useStored<ArenaCamera>(CAMERA_KEY, "primera", "tercera");
  const cameraRef = useRef(camera);
  const [sound, toggleSound] = useStored<"on" | "off">(SOUND_KEY, "on", "off");
  const audioRef = useRef<ArenaAudio | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [hurt, setHurt] = useState(false);
  const [healed, setHealed] = useState(false);
  const [clock, setClock] = useState(0);
  const spectateRef = useRef(0);
  const fine = useFinePointer();
  const canFight = state.status === "fighting" && !!hud?.alive && myId in state.roster;
  const locked = useDesktopControls(controlsRef, canvasRef, fine, canFight);

  useWakeLock();
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    presenceRef.current = { presence, presenceLoaded };
  }, [presence, presenceLoaded]);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);
  const toggleCameraRef = useRef(toggleCamera);
  useEffect(() => {
    toggleCameraRef.current = toggleCamera;
  }, [toggleCamera]);

  useEffect(() => {
    const audio = new ArenaAudio();
    audioRef.current = audio;
    return () => {
      audio.dispose();
      audioRef.current = null;
    };
  }, []);
  useEffect(() => {
    audioRef.current?.setMuted(sound === "off");
  }, [sound]);

  const inRoster = myId in state.roster;
  const gameNo = state.gameNo;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new ArenaScene(canvas, { maxDpr: 1.5 });
    const audio = audioRef.current;
    let poses: Record<string, ArenaPose> = {};
    let arrowsIn: Record<string, ArenaArrow> = {};
    const unsubPoses = subscribePoses(roomId, (p) => (poses = p));
    const unsubArrows = subscribeArrows(roomId, (a) => (arrowsIn = a));

    let frame = 0;
    let last = performance.now();
    let acc = 0;
    let key = -1;
    let me: Fighter | null = null;
    let myActAt = 0;
    let myLastT = 0;
    let lastPose = 0;
    let lastHud = "";
    let hudAt = 0;
    const look = { yaw: 0, pitch: 0 };
    const ghosts = new Map<string, Ghost>();
    const bots = new Map<string, BotRun>();
    const myArrows: LocalArrow[] = [];
    let arrowNo = 0;
    const seenHits = new Map<string, number>();
    const deadAt = new Map<string, number>();
    const absentSince = new Map<string, number>();
    const called = new Map<string, number>();
    let lastCount = -1;
    let lastStatus = "";
    let lastGear = "";
    let lastItems: unknown = null;
    let pickPending = 0;
    let hurtTimer: ReturnType<typeof setTimeout> | undefined;
    let healTimer: ReturnType<typeof setTimeout> | undefined;
    let lastHp = -1;
    /** First-person feel: tilt when strafing, wider view when running or dodging. */
    const feel = { roll: 0, fov: 72 };
    const mySend = myId in stateRef.current.roster ? openPose(roomId, myId, true) : null;

    /** Calls a state change once in a while (every client may; transactions keep it single). */
    const once = (name: string, fn: () => unknown, every = 1500) => {
      const now = performance.now();
      if (now - (called.get(name) ?? -Infinity) < every) return;
      called.set(name, now);
      Promise.resolve(fn()).catch(console.error);
    };

    const gearOf = (s: ArenaState, id: string): Gear => s.gear[id] ?? START_GEAR;

    /** How a fighter looks to this client right now. */
    const viewOf = (
      s: ArenaState,
      id: string
    ): FighterView & { act: string; actAt: number; actLen: number; draw: number; speed: number; pitch: number; combo: number; running: boolean } => {
      const team = s.roster[id];
      const local = id === myId ? me : bots.get(id)?.f;
      if (local) {
        return {
          id,
          team,
          x: local.x,
          y: local.y,
          z: local.z,
          yaw: local.yaw,
          pitch: local.pitch,
          blocking: local.blocking,
          shield: gearOf(s, id).sh,
          alive: alive(s, id),
          act: local.act,
          actAt: id === myId ? myActAt : bots.get(id)!.actAt,
          actLen: local.actLen,
          draw: local.draw,
          speed: local.speed,
          combo: local.combo,
          running: local.sprinting,
          dodging: local.act === "dodge",
        };
      }
      const g = ghosts.get(id);
      const p = g?.pose;
      return {
        id,
        team,
        x: g?.x ?? 0,
        y: g?.y ?? 0,
        z: g?.z ?? 0,
        yaw: g?.yaw ?? 0,
        pitch: g?.pitch ?? 0,
        blocking: !!p?.b,
        shield: gearOf(s, id).sh,
        alive: alive(s, id),
        act: p ? ACTS[p.a] ?? "idle" : "idle",
        actAt: p?.at ?? 0,
        actLen: p?.al ?? 0,
        draw: p?.dr ?? 0,
        speed: p?.sp ?? 0,
        combo: p?.cb ?? 0,
        running: !!p?.rn,
        dodging: !!p && ACTS[p.a] === "dodge",
      };
    };

    /** Volume and pan of a sound at (x, z) for the camera's fighter. */
    let earX = 0;
    let earZ = 0;
    let earYaw = 0;
    const where = (x: number, z: number): [number, number] => {
      const dx = x - earX;
      const dz = z - earZ;
      const d = Math.hypot(dx, dz);
      const pan = d > 0.5 ? (dx * Math.cos(earYaw) - dz * Math.sin(earYaw)) / d : 0;
      return [1 / (1 + d / 7), pan * 0.8];
    };

    const poseFor = (f: Fighter, actAt: number): ArenaPose => ({
      k: key,
      x: Math.round(f.x * 100) / 100,
      y: Math.round(f.y * 100) / 100,
      z: Math.round(f.z * 100) / 100,
      yw: Math.round(f.yaw * 1000) / 1000,
      pt: Math.round(f.pitch * 1000) / 1000,
      a: ACTS.indexOf(f.act),
      at: Math.round(actAt),
      al: Math.round(f.actLen * 1000) / 1000,
      b: f.blocking ? 1 : 0,
      dr: Math.round(f.draw * 100) / 100,
      sp: Math.round(f.speed * 10) / 10,
      cb: f.combo,
      rn: f.sprinting ? 1 : 0,
      t: Math.round(serverNow()),
    });

    /** Someone's swing landed or an arrow left: work out the hits and write them. */
    const handleEvents = (s: ArenaState, id: string, f: Fighter, events: FighterEvent[]) => {
      const gear = gearOf(s, id);
      const team = s.roster[id];
      for (const ev of events) {
        const [vol, pan] = where(f.x, f.z);
        if (ev.type === "windup") audio?.swing(gear.w === "hacha" || gear.w === "maza" ? 0.8 : gear.w === "daga" ? 0 : 0.35, vol, pan);
        if (ev.type === "dodge") audio?.swing(0.1, vol * 0.7, pan);
        if (ev.type === "strike") {
          const views = Object.keys(s.roster).map((o) => viewOf(s, o));
          const hits = meleeStrikes(viewOf(s, id), gear, views);
          if (!hits.length) continue;
          for (const h of hits) {
            const t = views.find((v) => v.id === h.target)!;
            scene.burst(t.x, t.y + 1.3, t.z, h.blocked ? "block" : "hit");
            const [v2, p2] = where(t.x, t.z);
            if (h.blocked) audio?.clang(v2, p2);
            else audio?.thud(v2, p2);
          }
          if (id === myId) scene.jolt(0.6);
          strike(roomId, key, id, { x: f.x, z: f.z }, withPlaces(hits, views)).catch(console.error);
        }
        if (ev.type === "shoot") {
          audio?.bow(vol, pan);
          const a = launchArrow(f, ev.draw);
          const t0 = serverNow();
          const down = shootArrow(roomId, { k: key, o: id, x: a.x, y: a.y, z: a.z, vx: a.vx, vy: a.vy, vz: a.vz, t: Math.round(t0) });
          myArrows.push({ id: arrowNo++, a, t0, done: 0, owner: id, team, down });
        }
      }
    };

    const withPlaces = (hits: Strike[], views: FighterView[]) =>
      hits.map((h) => {
        const v = views.find((o) => o.id === h.target)!;
        return { ...h, x: v.x, z: v.z };
      });

    const tick = (t: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const s = stateRef.current;
      const now = serverNow();
      const k = roundKey(s);
      const ids = Object.keys(s.roster);

      // A new round: everyone back to their gate.
      if (k !== key) {
        key = k;
        ghosts.clear();
        deadAt.clear();
        for (const run of bots.values()) run.send.close();
        bots.clear();
        for (const a of myArrows.splice(0)) a.down();
        for (const [id, h] of Object.entries(s.hits)) seenHits.set(id, h.n);
        if (myId in s.roster) {
          const team = s.roster[myId];
          const sp = spawnPoint(team, teamFighters(s, team).indexOf(myId), teamFighters(s, team).length);
          me = new Fighter(sp.x, sp.z, sp.yaw);
          look.yaw = sp.yaw;
          look.pitch = 0;
        } else {
          me = null;
        }
        acc = 0;
        lastCount = -1;
      }

      // Bot host: the connected person with the lowest id runs the bots.
      const { presence: pres, presenceLoaded: loaded } = presenceRef.current;
      const people = Object.keys(pres).filter((id) => id in s.players).sort();
      // Only once I see myself in the room, so two phones never both run them.
      const botHost = loaded && people[0] === myId;
      const botIds = ids.filter(isBot);
      if (botHost && s.status !== "waiting") {
        for (const id of botIds) {
          if (bots.has(id)) continue;
          const team = s.roster[id];
          const list = teamFighters(s, team);
          const p = poses[id];
          const sp = spawnPoint(team, list.indexOf(id), list.length);
          const f = p && p.k === key ? new Fighter(p.x, p.z, p.yw) : new Fighter(sp.x, sp.z, sp.yaw);
          bots.set(id, { f, mind: newMind(), actAt: now, lastT: 0, pickAt: 0, send: openPose(roomId, id, false) });
        }
      } else if (bots.size) {
        for (const run of bots.values()) run.send.close();
        bots.clear();
      }

      // Look around (always, also during the countdown).
      const c = controlsRef.current;
      const sens = fine ? MOUSE_LOOK : TOUCH_LOOK;
      look.yaw -= c.lookX * sens;
      look.pitch = Math.max(-1.2, Math.min(1.2, look.pitch - c.lookY * sens));
      c.lookX = 0;
      c.lookY = 0;
      if (c.camera) {
        c.camera = false;
        toggleCameraRef.current();
      }

      // Hits taken: flinch, lose stamina, see and hear them.
      for (const [id, h] of Object.entries(s.hits)) {
        const seen = seenHits.get(id) ?? 0;
        if (h.n <= seen) continue;
        seenHits.set(id, h.n);
        const local = id === myId ? me : bots.get(id)?.f;
        local?.receive(h.b, h.d, h.x, h.z);
        if (id === myId) {
          scene.jolt(h.b ? 0.5 : 1);
          if (!h.b) {
            audio?.hurt();
            setHurt(true);
            clearTimeout(hurtTimer);
            hurtTimer = setTimeout(() => setHurt(false), 350);
          }
        }
        // The attacker's own phone already showed it.
        if (h.from !== myId && !bots.has(h.from)) {
          const v = viewOf(s, id);
          scene.burst(v.x, v.y + 1.3, v.z, h.b ? "block" : "hit");
          const [vol, pan] = where(v.x, v.z);
          if (h.b) audio?.clang(vol, pan);
          else audio?.thud(vol, pan);
        }
      }

      // Falls.
      for (const id of ids) {
        if (alive(s, id) || deadAt.has(id)) continue;
        deadAt.set(id, performance.now());
        if (s.status === "fighting" || s.status === "roundEnd") {
          const v = viewOf(s, id);
          const [vol, pan] = where(v.x, v.z);
          audio?.fall(vol, pan);
          audio?.cheer(0.5);
          scene.cheer();
        }
      }

      // Countdown, start, round results.
      const fighting = s.status === "fighting" && now >= s.startedAt;
      const count = s.status === "fighting" && now < s.startedAt ? Math.ceil((s.startedAt - now) / 1000) : 0;
      if (count !== lastCount) {
        if (count > 0 && count <= 3) audio?.beep();
        if (count === 0 && lastCount > 0) audio?.horn();
        lastCount = count;
      }
      if (s.status !== lastStatus) {
        if (s.status === "roundEnd" || s.status === "finished") {
          audio?.cheer(1);
          scene.cheer();
        }
        lastStatus = s.status;
      }
      const myGear = JSON.stringify(gearOf(s, myId));
      if (myGear !== lastGear) {
        if (lastGear && s.status === "fighting") audio?.pickup();
        lastGear = myGear;
      }

      // Physics, at a fixed step.
      const myAlive = !!me && alive(s, myId);
      if (fighting) {
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          const solidsFor = (self: string) => [
            ...PILLAR_SOLIDS,
            ...ids.filter((o) => o !== self && alive(s, o)).map((o) => {
              const v = viewOf(s, o);
              return { x: v.x, z: v.z, r: FIGHTER_RADIUS };
            }),
          ];
          if (me && myAlive) {
            const input: FighterInput = {
              mx: c.mx,
              mz: c.mz,
              yaw: look.yaw,
              pitch: look.pitch,
              jump: c.jump,
              attack: c.attack,
              block: c.block,
              sprint: c.sprint || (!fine && c.mz > 0.6 && Math.hypot(c.mx, c.mz) > 0.92),
              dodge: c.dodge,
            };
            const before = me.act;
            const evs = me.step(input, gearOf(s, myId), STEP, solidsFor(myId));
            // A new act (or the same one again, like a second flinch): note when it started.
            if (me.act !== before || me.actT < myLastT) myActAt = serverNow() - me.actT * 1000;
            myLastT = me.actT;
            handleEvents(s, myId, me, evs);
          }
          for (const [id, run] of bots) {
            if (!alive(s, id)) continue;
            const team = s.roster[id];
            const enemies: BotEnemy[] = ids
              .filter((o) => s.roster[o] !== team)
              .map((o) => {
                const v = viewOf(s, o);
                return { ...v, act: v.act as BotEnemy["act"], actAt: v.actAt, weapon: gearOf(s, o).w };
              });
            const items = Object.entries(s.items).map(([iid, it]) => ({ id: iid, ...it }));
            const { input, pick } = botInput(run.f, gearOf(s, id), s.hp[id] ?? 0, run.mind, { enemies, items }, STEP, Math.random);
            if (pick && performance.now() - run.pickAt > 800) {
              run.pickAt = performance.now();
              pickItem(roomId, key, id, pick, run.f.x, run.f.z).catch(console.error);
            }
            const before = run.f.act;
            const evs = run.f.step(input, gearOf(s, id), STEP, solidsFor(id));
            if (run.f.act !== before || run.f.actT < run.lastT) run.actAt = serverNow() - run.f.actT * 1000;
            run.lastT = run.f.actT;
            handleEvents(s, id, run.f, evs);
          }
        }
      } else {
        acc = 0;
        // Before the fight: still face where you look.
        if (me) {
          me.yaw = look.yaw;
          me.pitch = look.pitch;
        }
      }

      // Arrows I (or my bots) shot: fly them and decide what they hit.
      for (let i = myArrows.length - 1; i >= 0; i--) {
        const ar = myArrows[i];
        const tNow = (serverNow() - ar.t0) / 1000;
        const views = ids.map((o) => viewOf(s, o));
        const res = flyArrow(ar.a, ar.done, tNow, ar.team, views);
        ar.done = tNow;
        if (!res.stop) continue;
        ar.down();
        myArrows.splice(i, 1);
        const [x, y, z] = arrowAt(ar.a, tNow);
        const [vol, pan] = where(x, z);
        if (res.strike) {
          const v = views.find((o) => o.id === res.strike!.target)!;
          scene.burst(v.x, Math.max(v.y + 0.8, y), v.z, res.strike.blocked ? "block" : "hit");
          if (res.strike.blocked) audio?.clang(vol, pan);
          else audio?.thud(vol, pan);
          const shooter = ar.owner === myId ? me : bots.get(ar.owner)?.f;
          strike(roomId, key, ar.owner, { x: shooter?.x ?? x, z: shooter?.z ?? z }, withPlaces([res.strike], views), true).catch(console.error);
        } else {
          audio?.thunk(vol, pan);
          scene.burst(x, Math.max(0.05, y), z, "dust");
        }
      }

      // Picking up what's in reach.
      let near: string | null = null;
      let nearD = PICK_RADIUS;
      if (me && myAlive) {
        for (const [iid, it] of Object.entries(s.items)) {
          const d = Math.hypot(it.x - me.x, it.z - me.z);
          if (d < nearD) {
            nearD = d;
            near = iid;
          }
        }
      }
      if (c.pick) {
        c.pick = false;
        if (near && me && performance.now() - pickPending > 500) {
          pickPending = performance.now();
          pickItem(roomId, key, myId, near, me.x, me.z).catch(console.error);
        }
      }

      // Everyone else, from their poses.
      const ease = 1 - Math.exp(-dt * 18);
      for (const id of ids) {
        if (id === myId || bots.has(id)) continue;
        const p = poses[id];
        let g = ghosts.get(id);
        if (!g) {
          const team = s.roster[id];
          const list = teamFighters(s, team);
          const sp = spawnPoint(team, list.indexOf(id), list.length);
          g = { x: sp.x, y: 0, z: sp.z, yaw: sp.yaw, pitch: 0, vx: 0, vz: 0, lastT: 0, pose: null };
          ghosts.set(id, g);
        }
        if (p && p.k === key) {
          if (g.pose && p.t !== g.lastT && g.lastT) {
            const span = Math.max(0.03, (p.t - g.lastT) / 1000);
            g.vx = (p.x - g.pose.x) / span;
            g.vz = (p.z - g.pose.z) / span;
          }
          if (p.t !== g.lastT) {
            g.lastT = p.t;
            g.pose = p;
          }
          const ahead = Math.max(0, Math.min(0.15, (now - p.t) / 1000));
          const tx = p.x + g.vx * ahead;
          const tz = p.z + g.vz * ahead;
          if (Math.hypot(tx - g.x, tz - g.z) > 4) {
            g.x = tx;
            g.z = tz;
          } else {
            g.x += (tx - g.x) * ease;
            g.z += (tz - g.z) * ease;
          }
          g.y += (p.y - g.y) * ease;
          let d = p.yw - g.yaw;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          g.yaw += d * ease;
          g.pitch += (p.pt - g.pitch) * ease;
        }
      }

      // People who left mid-round fall, so the round can end.
      if (s.status === "fighting" && loaded) {
        for (const id of ids) {
          if (isBot(id) || !alive(s, id)) continue;
          if (id in pres) {
            absentSince.delete(id);
            continue;
          }
          const since = absentSince.get(id) ?? performance.now();
          absentSince.set(id, since);
          if (performance.now() - since > ABSENT_MS) {
            const v = viewOf(s, id);
            once(`forfeit:${id}`, () => forfeit(roomId, key, id, v.x, v.z), 3000);
          }
        }
      }
      if (s.status === "fighting" && now > s.startedAt + ROUND_SECONDS * 1000) once("timeout", () => timeoutRound(roomId, key));
      if (s.status === "roundEnd" && now > s.roundEndedAt + ROUND_END_MS) once("next", () => nextRound(roomId, key));
      if (fighting && Object.values(s.respawns).some((r) => r.at <= now)) once("respawn", () => respawnItems(roomId, key));
      if (fighting && s.regen) {
        for (const id of [myId, ...bots.keys()]) {
          if (!alive(s, id) || (s.hp[id] ?? 0) >= MAX_HP || now - (s.hits[id]?.t ?? 0) < REGEN_DELAY_MS) continue;
          once(`regen:${id}`, () => regenerate(roomId, key, id), REGEN_EVERY_MS);
        }
      }
      const myHp = s.hp[myId] ?? 0;
      if (lastHp >= 0 && myHp > lastHp && s.status === "fighting") {
        audio?.heal();
        setHealed(true);
        clearTimeout(healTimer);
        healTimer = setTimeout(() => setHealed(false), 450);
      }
      lastHp = myHp;

      // Publish my pose and my bots'.
      if (t - lastPose >= POSE_MS) {
        lastPose = t;
        if (me && mySend) mySend.send(poseFor(me, myActAt));
        for (const run of bots.values()) run.send.send(poseFor(run.f, run.actAt));
      }

      // Draw.
      scene.setFighters(
        Object.fromEntries(ids.map((id) => [id, { team: s.roster[id], label: id === myId ? "Vos" : fighterName(s, id) }]))
      );
      for (const id of ids) {
        const v = viewOf(s, id);
        const pose: KnightPose = {
          x: v.x,
          y: v.y,
          z: v.z,
          yaw: v.yaw,
          pitch: v.pitch,
          act: v.act as KnightPose["act"],
          actT: (now - v.actAt) / 1000,
          actLen: v.actLen,
          blocking: v.blocking,
          draw: v.draw,
          speed: v.speed,
          running: v.running,
          combo: v.combo,
          alive: v.alive,
          gear: gearOf(s, id),
        };
        if (id === myId && me) {
          pose.actT = me.actT;
          pose.yaw = myAlive ? look.yaw : me.yaw;
          pose.pitch = look.pitch;
        }
        const run = bots.get(id);
        if (run) pose.actT = run.f.actT;
        scene.setPose(id, pose);
        scene.setHealth(id, s.hp[id] ?? 0);
      }
      if (s.items !== lastItems) {
        lastItems = s.items;
        scene.setItems(s.items);
      }
      const flying: Record<string, { x: number; y: number; z: number; vx: number; vy: number; vz: number }> = {};
      for (const ar of myArrows) {
        const tt = (serverNow() - ar.t0) / 1000;
        const [x, y, z] = arrowAt(ar.a, tt);
        flying[`m${ar.id}`] = { x, y, z, vx: ar.a.vx, vy: ar.a.vy - 9.8 * tt, vz: ar.a.vz };
      }
      for (const [aid, a] of Object.entries(arrowsIn)) {
        if (a.k !== key || a.o === myId || bots.has(a.o)) continue;
        const tt = (now - a.t) / 1000;
        if (tt < 0 || tt > 4) continue;
        const [x, y, z] = arrowAt({ ...a, damage: 0 }, tt);
        if (y < 0) continue;
        flying[aid] = { x, y, z, vx: a.vx, vy: a.vy - 9.8 * tt, vz: a.vz };
      }
      scene.setArrows(flying);

      // Whose eyes: mine while I'm up; after falling, a teammate (or anyone standing).
      let follow: string | null = null;
      let watching = "";
      const myFallAt = deadAt.get(myId);
      if (me && (myAlive || (myFallAt !== undefined && performance.now() - myFallAt < DEATH_VIEW_MS) || !fighting)) {
        follow = myId;
      } else {
        const myTeam = s.roster[myId];
        const standing = ids.filter((id) => alive(s, id));
        const mates = standing.filter((id) => s.roster[id] === myTeam);
        const pool = mates.length ? mates : standing.length ? standing : ids;
        if (pool.length) {
          follow = pool[spectateRef.current % pool.length];
          watching = fighterName(s, follow, myId);
        }
      }
      const fv = follow ? viewOf(s, follow) : null;
      const fe = 1 - Math.exp(-dt * 8);
      feel.roll += ((myAlive ? -c.mx * 0.035 : 0) - feel.roll) * fe;
      feel.fov += (72 + (me?.sprinting ? 9 : 0) + (me?.act === "dodge" ? 12 : 0) - feel.fov) * fe;
      const camLook = follow === myId ? { ...look, roll: feel.roll, fov: feel.fov } : { yaw: fv?.yaw ?? 0, pitch: -0.2 };
      const mode: ArenaCamera = follow === myId && myAlive ? cameraRef.current : "tercera";
      if (fv) {
        earX = fv.x;
        earZ = fv.z;
        earYaw = camLook.yaw;
      }
      scene.render(follow, mode, camLook, dt);

      // HUD, ten times a second.
      if (t - hudAt > 100) {
        hudAt = t;
        const gear = gearOf(s, myId);
        const next: Hud = {
          hp: s.hp[myId] ?? 0,
          stamina: me ? Math.round(me.stamina) : 0,
          gear,
          near,
          nearLabel: near ? ITEM_LABEL[s.items[near].kind] : "",
          alive: myAlive,
          watching,
          draw: me?.act === "draw" ? Math.round(me.draw * 10) / 10 : 0,
        };
        const hk = JSON.stringify(next);
        if (hk !== lastHud) {
          lastHud = hk;
          setHud(next);
        }
        setClock(now);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(hurtTimer);
      clearTimeout(healTimer);
      unsubPoses();
      unsubArrows();
      mySend?.close();
      for (const run of bots.values()) run.send.close();
      for (const a of myArrows) a.down();
      scene.dispose();
    };
  }, [roomId, myId, gameNo, fine]);

  const now = clock || serverNow();
  const counting = state.status === "fighting" && now < state.startedAt;
  const count = Math.ceil((state.startedAt - now) / 1000);
  const justStarted = state.status === "fighting" && now >= state.startedAt && now - state.startedAt < 1200;
  const roundLeft = state.startedAt + ROUND_SECONDS * 1000 - now;
  const bow = hud?.gear.w === "arco";
  const fullscreenable = typeof document !== "undefined" && document.fullscreenEnabled;

  return (
    <div ref={wrapRef} className="fixed inset-0 z-40 select-none overflow-hidden bg-[#f2c48d]" style={{ touchAction: "none" }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Being hit: a red flash at the edges. */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{ opacity: hurt ? 1 : 0, boxShadow: "inset 0 0 120px 30px rgba(220,38,38,0.65)" }}
      />
      {/* Healing: a green glow. */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{ opacity: healed ? 1 : 0, boxShadow: "inset 0 0 120px 30px rgba(74,222,128,0.5)" }}
      />

      {inRoster && hud?.alive && state.status === "fighting" && !fine && (
        <TouchControls controlsRef={controlsRef} canPick={!!hud.near} pickLabel={hud.nearLabel} bow={bow} />
      )}

      {/* Crosshair. */}
      {hud?.alive && state.status === "fighting" && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2">
          <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-white/80 shadow" />
          <div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-white/80 shadow" />
        </div>
      )}

      {/* Top bar: back, score and round, options. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-2.5">
        <div className="pointer-events-auto flex flex-col gap-1.5">
          <Link href="/" aria-label="Volver a Talo" className="w-fit rounded-xl bg-slate-950/60 p-2 backdrop-blur">
            <TaloMark className="h-5 w-5" />
          </Link>
          <TeamBars state={state} team="red" myId={myId} />
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-3 rounded-2xl bg-slate-950/70 px-4 py-1.5 font-display text-2xl font-bold text-white backdrop-blur">
            <span style={{ color: teamInfo("red").color }}>{state.score.red}</span>
            <span className="text-sm font-medium text-slate-300">
              Ronda {state.round}
              {state.status === "fighting" && !counting && <> · {formatClock(roundLeft)}</>}
            </span>
            <span style={{ color: teamInfo("blue").color }}>{state.score.blue}</span>
          </div>
          <p className="rounded-full bg-slate-950/50 px-2 text-[11px] text-slate-200">Gana el primero en llegar a {state.need}</p>
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <div className="flex gap-1.5">
            <button onClick={toggleSound} aria-label={sound === "on" ? "Silenciar" : "Activar sonido"} className="rounded-xl bg-slate-950/60 p-2 text-white backdrop-blur">
              {sound === "on" ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button onClick={toggleCamera} className="flex items-center gap-1 rounded-xl bg-slate-950/60 px-2.5 py-2 text-xs text-white backdrop-blur">
              <Eye className="h-4 w-4" /> {camera === "primera" ? "1ª persona" : "3ª persona"}
            </button>
            {fullscreenable && (
              <button
                onClick={() =>
                  document.fullscreenElement
                    ? document.exitFullscreen().catch(() => {})
                    : document.documentElement.requestFullscreen().catch(() => {})
                }
                aria-label="Pantalla completa"
                className="rounded-xl bg-slate-950/60 p-2 text-white backdrop-blur"
              >
                <Maximize className="h-4 w-4" />
              </button>
            )}
          </div>
          <TeamBars state={state} team="blue" myId={myId} />
        </div>
      </div>

      {/* My health, stamina and gear. */}
      {inRoster && hud && (
        <div className={`pointer-events-none absolute z-20 w-52 rounded-xl bg-slate-950/60 p-2 text-white backdrop-blur ${fine ? "bottom-4 left-4" : "bottom-44 left-4"}`}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-semibold">
              {WEAPONS[hud.gear.w].label}
              {hud.gear.sh && (
                <span className="ml-1 inline-flex items-center gap-0.5 text-sky-300">
                  <Shield className="inline h-3 w-3" /> escudo
                </span>
              )}
            </span>
            <span>{hud.hp} ♥</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-green-400 transition-all" style={{ width: `${(hud.hp / MAX_HP) * 100}%` }} />
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-amber-300" style={{ width: `${(hud.stamina / MAX_STAMINA) * 100}%` }} />
          </div>
          {bow && hud.draw > 0 && (
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-sky-300" style={{ width: `${hud.draw * 100}%` }} />
            </div>
          )}
          {fine && hud.near && <p className="mt-1 text-xs text-amber-200">E: agarrar {hud.nearLabel}</p>}
        </div>
      )}

      {fine && inRoster && !locked && state.status === "fighting" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center">
          <p className="flex items-center gap-2 rounded-xl bg-slate-950/75 px-4 py-2 text-sm text-white backdrop-blur">
            <MousePointerClick className="h-4 w-4" />
            Hacé clic en la arena para pelear · WASD moverte · Shift correr · clic atacar (de nuevo = combo) · clic derecho o F bloquear · Q esquivar · E agarrar · espacio saltar · V cámara · Esc soltar el mouse
          </p>
        </div>
      )}

      {!fine && (
        <p className="pointer-events-none absolute inset-x-0 top-24 z-20 hidden items-center justify-center gap-1.5 text-xs text-white drop-shadow portrait:flex">
          <RotateCw className="h-3.5 w-3.5" /> Girá el teléfono para pelear mejor
        </p>
      )}

      {/* Countdown and "fight!". */}
      {(counting || justStarted) && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center">
          {counting && state.round > 0 && <p className="mb-2 font-display text-2xl font-bold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.8)]">Ronda {state.round}</p>}
          <span
            key={counting ? count : "go"}
            className="animate-celebration-in font-display text-[24vmin] font-extrabold drop-shadow-[0_0_30px_rgba(0,0,0,0.7)]"
            style={{ color: counting ? "#f8fafc" : "#fbbf24" }}
          >
            {counting ? count : "¡A pelear!"}
          </span>
        </div>
      )}

      {/* Watching (fell, or not fighting this match). */}
      {hud && !hud.alive && state.status === "fighting" && hud.watching && (
        <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center">
          <div className="flex items-center gap-2 rounded-xl bg-slate-950/75 px-4 py-2 text-sm text-white backdrop-blur">
            <span>
              {inRoster ? "Te eliminaron · " : ""}Mirando a <b>{hud.watching}</b>
            </span>
            <button onClick={() => (spectateRef.current += 1)} className="flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-xs">
              <Users className="h-3.5 w-3.5" /> Otro
            </button>
          </div>
        </div>
      )}

      {state.status === "roundEnd" && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <p
            className="animate-celebration-in rounded-3xl bg-slate-950/70 px-8 py-5 text-center font-display text-4xl font-bold backdrop-blur"
            style={{ color: state.roundWinner === "draw" ? "#e2e8f0" : teamInfo(state.roundWinner as TeamId).color }}
          >
            {state.roundWinner === "draw" ? "Ronda empatada" : `¡Ronda para el ${teamInfo(state.roundWinner as TeamId).label}!`}
          </p>
        </div>
      )}

      {state.status === "finished" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4">
          <Results roomId={roomId} meta={meta} state={state} myId={myId} presence={presence} />
        </div>
      )}
    </div>
  );
}

/** A team's fighters with their health, in a corner. */
function TeamBars({ state, team, myId }: { state: ArenaState; team: TeamId; myId: string }) {
  const ids = teamFighters(state, team);
  const color = teamInfo(team).color;
  return (
    <div className={`flex flex-col gap-1 ${team === "blue" ? "items-end" : ""}`}>
      {ids.map((id) => {
        const hp = state.hp[id] ?? 0;
        return (
          <div key={id} className="w-28 rounded-lg bg-slate-950/55 px-1.5 py-1 backdrop-blur sm:w-36">
            <p className={`truncate text-[11px] font-semibold ${hp > 0 ? "text-white" : "text-slate-500 line-through"}`} style={{ color: hp > 0 ? color : undefined }}>
              {fighterName(state, id, myId)}
              {isBot(id) && <span className="font-normal text-slate-400"> · bot</span>}
            </p>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full transition-all" style={{ width: `${hp}%`, backgroundColor: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The end of the match: who won, knockouts, and play again or change teams. */
function Results({
  roomId,
  meta,
  state,
  myId,
  presence,
}: {
  roomId: string;
  meta: ArenaMeta;
  state: ArenaState;
  myId: string;
  presence: PresenceMap;
}) {
  const winner = state.winner ? teamInfo(state.winner) : null;
  const mine = state.roster[myId];
  const title = !winner ? "Terminó la batalla" : mine ? (mine === state.winner ? "🏆 ¡Ganaron!" : "Perdieron esta vez") : `🏆 ¡Ganó el ${winner.label}!`;
  const ids = Object.keys(state.roster).sort((a, b) => (state.kills[b] ?? 0) - (state.kills[a] ?? 0));
  const connected = Object.keys(presence);
  return (
    <div className="animate-celebration-in flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl bg-slate-950/90 p-5 text-center shadow-2xl ring-1 ring-white/10 backdrop-blur">
      <p className="font-display text-3xl font-bold" style={{ color: winner?.color ?? "#e2e8f0" }}>
        {title}
      </p>
      <p className="text-sm text-slate-400">
        {winner?.label} {state.score[state.winner || "red"]} – {state.score[state.winner === "red" ? "blue" : "red"]}
      </p>
      <ol className="flex w-full flex-col gap-1.5">
        {ids.map((id) => (
          <li key={id} className="flex items-center gap-2 rounded-xl bg-slate-900/80 px-3 py-2 text-sm">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: teamInfo(state.roster[id]).color }} />
            <span className="min-w-0 flex-1 truncate text-left text-slate-100">
              {fighterName(state, id, myId)}
              {isBot(id) && <span className="text-slate-500"> · bot</span>}
              {!isBot(id) && state.wins[id] ? <span className="text-slate-500"> · {state.wins[id]} ganadas</span> : null}
            </span>
            <span className="font-mono text-slate-300">⚔ {state.kills[id] ?? 0}</span>
          </li>
        ))}
      </ol>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <button onClick={() => startMatch(roomId, meta, connected)} className={PRIMARY_BUTTON}>
          Revancha
        </button>
        <button onClick={() => backToWaiting(roomId, state.gameNo)} className={SECONDARY_BUTTON}>
          Cambiar equipos
        </button>
      </div>
    </div>
  );
}

