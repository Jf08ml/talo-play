"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  RESPAWN_MS,
  allies,
  backToWaiting,
  damage,
  fighterName,
  isAlive,
  isBot,
  openPose,
  pickItem,
  publishBoom,
  ranking,
  respawn,
  respawnItems,
  shieldOf,
  startMatch,
  subscribeBooms,
  subscribePoses,
  subscribeProjectiles,
  teamInfo,
  throwProjectile,
  timeUp,
  type DamageHit,
  type FeedEntry,
  type FuegoBoom,
  type FuegoMeta,
  type FuegoPose,
  type FuegoProjectile,
  type FuegoState,
} from "@/lib/fuego";
import {
  Arsenal,
  EYE,
  GRENADE_FUSE,
  MAX_GRENADES,
  MAX_HP,
  MAX_SHIELD,
  MELEE_DAMAGE,
  PICKUP_LABEL,
  Soldier,
  WEAPONS,
  WEAPON_IDS,
  blast,
  botThink,
  castBullet,
  flyProjectile,
  isWeapon,
  launch,
  meleeTarget,
  navGraph,
  newMind,
  pickSpawn,
  rayWorldHit,
  spreadDir,
  worldOf,
  type ArsenalEvent,
  type BotMind,
  type Projectile,
  type Target,
  type WeaponId,
} from "@/lib/fuegoSim";
import { MAPS, type PickupKind } from "@/lib/fuegoMaps";
import { FuegoScene, type Quality } from "@/lib/fuego3d";
import { FuegoAudio } from "@/lib/fuegoAudio";
import { serverNow } from "@/lib/serverTime";
import type { PresenceMap } from "@/lib/presence";
import type { TeamId } from "@/lib/teams";
import { useWakeLock } from "@/components/carreras/Controller";
import { TaloMark } from "@/components/TaloLogo";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import { MOUSE_LOOK, TOUCH_LOOK, TouchControls, newControls, useDesktopControls, useFinePointer, type ControlState } from "./Controls";
import { ListOrdered, Maximize, MousePointerClick, RotateCw, Sparkles, Volume2, VolumeX } from "lucide-react";

const STEP = 1 / 60;
const POSE_MS = 50;
const RADAR_RANGE = 28;
/** Mobile aim help: bullets that pass this close (radians) to someone still hit. */
const TOUCH_ASSIST = 0.06;

interface Ghost {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  vx: number;
  vz: number;
  lastT: number;
  pose: FuegoPose | null;
  /** Shots seen (to draw new ones) and when it last fired. */
  f: number;
  m: number;
  firedAt: number;
}

interface BotRun {
  s: Soldier;
  a: Arsenal;
  mind: BotMind;
  send: ReturnType<typeof openPose>;
  dead: boolean;
  end: [number, number, number];
  m: number;
  g: number;
  pickAt: number;
}

interface LocalProjectile {
  id: string;
  p: Projectile;
  age: number;
  owner: string;
  down: () => void;
}

interface Hud {
  hp: number;
  shield: number;
  weapon: WeaponId;
  mag: number;
  reserve: number;
  other: WeaponId | null;
  grenades: number;
  alive: boolean;
  respawnIn: number;
  killer: string;
  near: string;
  zoomed: boolean;
  reloading: boolean;
  radar: { x: number; y: number; ally: boolean }[];
  watching: string;
  /** Through the scope: distance to what the crosshair is on, and magnification. */
  range: number;
  zoomX: number;
  onTarget: boolean;
  /** Tab held (desktop scoreboard). */
  board: boolean;
}

const SOUND_KEY = "fuego.sound";
const QUALITY_KEY = "fuego.calidad";

function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const WEAPON_WORD: Record<string, string> = {
  rifle: "fusil",
  pistola: "pistola",
  escopeta: "escopeta",
  francotirador: "francotirador",
  lanzacohetes: "cohete",
  cohete: "cohete",
  granada: "granada",
  golpe: "golpe",
};

/** The match on screen: the map in 3D, your soldier, the bots if you run them, and the HUD. */
export default function Battle({
  roomId,
  meta,
  state,
  myId,
  presence,
  presenceLoaded,
}: {
  roomId: string;
  meta: FuegoMeta;
  state: FuegoState;
  myId: string;
  presence: PresenceMap;
  presenceLoaded: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const presenceRef = useRef({ presence, presenceLoaded });
  const controlsRef = useRef<ControlState>(newControls());
  const audioRef = useRef<FuegoAudio | null>(null);
  const [sound, setSound] = useState<"on" | "off">(() => {
    try {
      return localStorage.getItem(SOUND_KEY) === "off" ? "off" : "on";
    } catch {
      return "on";
    }
  });
  const [hud, setHud] = useState<Hud | null>(null);
  const [clock, setClock] = useState(0);
  const [hit, setHit] = useState<{ n: number; head: boolean; kill: boolean }>({ n: 0, head: false, kill: false });
  const [hurtDirs, setHurtDirs] = useState<{ a: number; id: number; shield: boolean }[]>([]);
  const [shieldBroke, setShieldBroke] = useState(0);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [aimToggle, setAimToggle] = useState(false);
  const aimToggleRef = useRef(false);
  const [board, setBoard] = useState(false);
  const fine = useFinePointer();
  const myAliveNow = !!hud?.alive;
  const canFight = state.status === "playing" && myAliveNow && myId in state.roster;
  const locked = useDesktopControls(controlsRef, canvasRef, fine, canFight);

  useWakeLock();
  // Quality: remembered, else high with a mouse (computers), low on touch (phones).
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(QUALITY_KEY);
    } catch {
      // Not remembered.
    }
    const initial: Quality = saved === "alta" || saved === "baja" ? saved : window.matchMedia("(pointer: fine)").matches ? "alta" : "baja";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the device after mounting.
    setQuality(initial);
  }, []);
  const toggleQuality = () =>
    setQuality((q) => {
      const next: Quality = q === "alta" ? "baja" : "alta";
      try {
        localStorage.setItem(QUALITY_KEY, next);
      } catch {
        // Not remembered.
      }
      return next;
    });
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    presenceRef.current = { presence, presenceLoaded };
  }, [presence, presenceLoaded]);
  useEffect(() => {
    aimToggleRef.current = aimToggle;
  }, [aimToggle]);
  useEffect(() => {
    const audio = new FuegoAudio();
    audioRef.current = audio;
    return () => {
      audio.dispose();
      audioRef.current = null;
    };
  }, []);
  useEffect(() => {
    audioRef.current?.setMuted(sound === "off");
    try {
      localStorage.setItem(SOUND_KEY, sound);
    } catch {
      // Not remembered.
    }
  }, [sound]);

  const gameNo = state.gameNo;
  const mapId = state.map;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !quality) return;
    const scene = new FuegoScene(canvas, mapId, { quality });
    const world = worldOf(mapId);
    const graph = navGraph(mapId);
    const map = MAPS[mapId];
    const audio = audioRef.current;
    let poses: Record<string, FuegoPose> = {};
    let projIn: Record<string, FuegoProjectile> = {};
    let boomsIn: Record<string, FuegoBoom> = {};
    const unsubPoses = subscribePoses(roomId, (p) => (poses = p));
    const unsubProj = subscribeProjectiles(roomId, (p) => (projIn = p));
    const unsubBooms = subscribeBooms(roomId, (b) => (boomsIn = b));

    let frame = 0;
    let last = performance.now();
    let acc = 0;
    const key = gameNo;
    let me: Soldier | null = null;
    let arms = new Arsenal();
    let myDead = true;
    let myEnd: [number, number, number] = [0, 0, 0];
    let myMelee = 0;
    let myGrenades = 0;
    let deathAt = 0;
    let deathSpot = { x: 0, y: 0, z: 0, yaw: 0 };
    let killerId = "";
    const look = { yaw: 0, pitch: 0 };
    let sinceShot = 10;
    let meleeT = 0;
    let lastPose = 0;
    let hudAt = 0;
    let lastHudKey = "";
    let lastStride = 0;
    let lastCount = -1;
    let shieldWas = MAX_SHIELD;
    let alarmAt = 0;
    let kills: number[] = [];
    let whizzAt = 0;
    let land = 0;
    let hurtId = 0;
    let toastId = 0;
    const ghosts = new Map<string, Ghost>();
    const bots = new Map<string, BotRun>();
    const myProj: LocalProjectile[] = [];
    const remoteProj = new Map<string, { p: Projectile; age: number }>();
    const seenBooms = new Set<string>(Object.keys(boomsIn));
    const seenHits = new Map<string, number>();
    const seenFeed = new Set<string>(Object.keys(stateRef.current.feed));
    const called = new Map<string, number>();
    let lastItems: unknown = null;
    let lastInfo = "";
    const mySend = myId in stateRef.current.roster ? openPose(roomId, myId, true) : null;
    for (const [id, h] of Object.entries(stateRef.current.hits)) seenHits.set(id, h.n);
    const rand = Math.random;

    const once = (name: string, fn: () => unknown, every = 1200) => {
      const now = performance.now();
      if (now - (called.get(name) ?? -Infinity) < every) return;
      called.set(name, now);
      Promise.resolve(fn()).catch(console.error);
    };

    /** Position of a fighter as this client sees it, or null if unknown (left, no pose yet). */
    const posOf = (id: string): (Target & { yaw: number; pitch: number; speed: number }) | null => {
      if (id === myId) return me && !myDead ? { id, x: me.x, y: me.y, z: me.z, yaw: look.yaw, pitch: look.pitch, speed: me.speed } : null;
      const run = bots.get(id);
      if (run) return run.dead ? null : { id, x: run.s.x, y: run.s.y, z: run.s.z, yaw: run.s.yaw, pitch: run.s.pitch, speed: run.s.speed };
      const g = ghosts.get(id);
      if (!g?.pose) return null;
      return { id, x: g.x, y: g.y, z: g.z, yaw: g.yaw, pitch: g.pitch, speed: g.pose.sp };
    };

    /** The soldiers `id` can hurt right now. */
    const enemiesOf = (s: FuegoState, id: string): Target[] =>
      Object.keys(s.roster)
        .filter((o) => o !== id && isAlive(s, o) && !allies(s, id, o))
        .map(posOf)
        .filter((t): t is NonNullable<typeof t> => !!t);

    const everyone = (s: FuegoState): Target[] =>
      Object.keys(s.roster)
        .filter((o) => isAlive(s, o))
        .map(posOf)
        .filter((t): t is NonNullable<typeof t> => !!t);

    /** Volume and pan of a sound at (x, z) for my ears. */
    const where = (x: number, z: number): [number, number] => {
      const ex = me?.x ?? deathSpot.x;
      const ez = me?.z ?? deathSpot.z;
      const dx = x - ex;
      const dz = z - ez;
      const d = Math.hypot(dx, dz);
      const pan = d > 0.5 ? (dx * Math.cos(look.yaw) - dz * Math.sin(look.yaw)) / d : 0;
      return [1 / (1 + d / 10), pan * 0.8];
    };

    const sideOf = (s: FuegoState, id: string): TeamId | null => {
      const side = s.roster[id];
      return side === "red" || side === "blue" ? side : null;
    };

    const spawnFor = (s: FuegoState, id: string) =>
      pickSpawn(
        map,
        sideOf(s, id),
        enemiesOf(s, id).map((t) => ({ x: t.x, z: t.z })),
        rand
      );

    const poseFor = (sol: Soldier, a: Arsenal, end: [number, number, number], m: number, g: number, aim: boolean): FuegoPose => ({
      k: key,
      x: Math.round(sol.x * 100) / 100,
      y: Math.round(sol.y * 100) / 100,
      z: Math.round(sol.z * 100) / 100,
      yw: Math.round(sol.yaw * 1000) / 1000,
      pt: Math.round(sol.pitch * 1000) / 1000,
      w: WEAPON_IDS.indexOf(a.weapon),
      f: a.shots,
      sx: Math.round(end[0] * 10) / 10,
      sy: Math.round(end[1] * 10) / 10,
      sz: Math.round(end[2] * 10) / 10,
      m,
      g,
      r: a.reloading > 0 ? 1 : 0,
      a: aim ? 1 : 0,
      sp: Math.round(sol.speed * 10) / 10,
      t: Math.round(serverNow()),
    });

    /** A soldier's weapon events: shots (decide hits), rockets/grenades (launch), melee. */
    const handleEvents = (s: FuegoState, id: string, sol: Soldier, a: Arsenal, events: ArsenalEvent[], mine: boolean): { end?: [number, number, number]; m?: boolean; g?: boolean } => {
      const out: { end?: [number, number, number]; m?: boolean; g?: boolean } = {};
      const eyeY = sol.y + EYE;
      const [vol, pan] = mine ? [1, 0] : where(sol.x, sol.z);
      for (const ev of events) {
        if (ev.type === "shot") {
          const targets = enemiesOf(s, id);
          const byTarget = new Map<string, DamageHit>();
          let first: [number, number, number] | null = null;
          let hitKind: "escudo" | "cuerpo" | "nada" = "nada";
          for (const off of ev.dirs) {
            const [dx, dy, dz] = spreadDir(sol.yaw, sol.pitch, off);
            const res = castBullet(world, { ox: sol.x, oy: eyeY, oz: sol.z, dx, dy, dz }, ev.weapon, targets, mine && !fine ? TOUCH_ASSIST : 0);
            first ??= res.end;
            if (res.hit) {
              const prev = byTarget.get(res.hit.target);
              byTarget.set(res.hit.target, { target: res.hit.target, damage: (prev?.damage ?? 0) + res.hit.damage, head: !!prev?.head || res.hit.head });
              hitKind = shieldOf(s, res.hit.target, serverNow()) > 1 ? "escudo" : "cuerpo";
              if (hitKind === "escudo") scene.shieldHit(res.hit.target);
            }
            const from = mine ? muzzleOfMe(sol, dx, dy, dz) : scene.muzzle(id) ?? [sol.x, eyeY - 0.2, sol.z];
            scene.shot(mine ? null : id, from, res.end[0], res.end[1], res.end[2], ev.weapon, res.hit ? hitKind : "nada", res.normal);
            if (!mine && !res.hit) nearMiss(from, res.end);
          }
          if (mine) scene.ejectShell(ev.weapon);
          out.end = first ?? out.end;
          audio?.shot(ev.weapon, vol, pan);
          if (mine) {
            sinceShot = 0;
            look.pitch = Math.min(1.3, look.pitch + WEAPONS[ev.weapon].kick);
          }
          const hits = [...byTarget.values()];
          if (hits.length) {
            if (mine) {
              const head = hits.some((h) => h.head);
              audio?.hitMarker(head, false);
              setHit((h) => ({ n: h.n + 1, head, kill: false }));
            }
            damage(roomId, key, id, { x: sol.x, z: sol.z }, ev.weapon, hits).catch(console.error);
          }
        } else if (ev.type === "rocket" || ev.type === "grenade") {
          const kind = ev.type === "rocket" ? "cohete" : "granada";
          const p = launch(kind, { x: sol.x, y: sol.y, z: sol.z, yaw: sol.yaw, pitch: sol.pitch });
          const down = throwProjectile(roomId, { k: key, o: id, kind, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, t: Math.round(serverNow()) });
          myProj.push({ id: `m${myProj.length}-${performance.now()}`, p, age: 0, owner: id, down });
          if (kind === "cohete") {
            audio?.shot("lanzacohetes", vol, pan);
            if (mine) sinceShot = 0;
          } else {
            if (mine) audio?.throwGrenade();
            out.g = true;
          }
        } else if (ev.type === "melee") {
          out.m = true;
          audio?.melee(vol, pan);
          if (mine) meleeT = 0.35;
          const t = meleeTarget(world, { id, x: sol.x, y: sol.y, z: sol.z, yaw: sol.yaw }, enemiesOf(s, id));
          if (t) {
            if (mine) {
              audio?.hitMarker(false, false);
              setHit((h) => ({ n: h.n + 1, head: false, kill: false }));
            }
            damage(roomId, key, id, { x: sol.x, z: sol.z }, "golpe", [{ target: t, damage: MELEE_DAMAGE, head: false }]).catch(console.error);
          }
        } else if (mine && ev.type === "reload") audio?.reload();
        else if (mine && ev.type === "empty") audio?.empty();
        else if (mine && ev.type === "switch") audio?.switchWeapon();
      }
      return out;
    };

    /** A shot that flew close past my head: a whizz. */
    const nearMiss = (from: [number, number, number], end: [number, number, number]) => {
      if (!me || myDead) return;
      const ax = from[0], ay = from[1], az = from[2];
      const bx = end[0] - ax, by = end[1] - ay, bz = end[2] - az;
      const len2 = bx * bx + by * by + bz * bz;
      if (len2 < 1) return;
      const ex = me.x - ax, ey = me.y + EYE - ay, ez = me.z - az;
      const t = Math.max(0, Math.min(1, (ex * bx + ey * by + ez * bz) / len2));
      const d = Math.hypot(ex - bx * t, ey - by * t, ez - bz * t);
      if (d < 1.8 && d > 0.3 && performance.now() - whizzAt > 250) {
        whizzAt = performance.now();
        audio?.whizz(where(ax + bx * t, az + bz * t)[1]);
      }
    };

    const muzzleOfMe = (sol: Soldier, dx: number, dy: number, dz: number): [number, number, number] => {
      const rx = Math.cos(sol.yaw);
      const rz = -Math.sin(sol.yaw);
      const side = controlsRef.current.aim || aimToggleRef.current ? 0 : 0.18;
      return [sol.x + dx * 0.7 + rx * side, sol.y + EYE - 0.16 + dy * 0.7, sol.z + dz * 0.7 + rz * side];
    };

    /** Applies a pickup that went through to the soldier's arsenal. */
    const applyPickup = (a: Arsenal, kind: PickupKind) => {
      if (kind === "granadas") a.grenades = Math.min(MAX_GRENADES, a.grenades + 2);
      else if (isWeapon(kind)) a.take(kind);
    };

    /** Whether walking over a pickup should take it without asking. */
    const autoPick = (a: Arsenal, kind: PickupKind, hp: number) =>
      kind === "botiquin" ? hp < MAX_HP : kind === "granadas" ? a.grenades < MAX_GRENADES : isWeapon(kind) && a.has(kind) && a.slots.find((sl) => sl.id === kind)!.reserve < WEAPONS[kind].reserve;

    const tryPick = (s: FuegoState, id: string, a: Arsenal, itemId: string, mine: boolean) => {
      const kind = s.items[itemId]?.kind;
      if (!kind) return;
      once(`pick:${id}:${itemId}`, async () => {
        const res = await pickItem(roomId, key, id, itemId);
        if (!res.committed) return;
        applyPickup(a, kind);
        if (mine) audio?.pickup();
      }, 900);
    };

    const tick = (t: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const s = stateRef.current;
      const now = serverNow();
      const ids = Object.keys(s.roster);
      const c = controlsRef.current;
      const inRoster = myId in s.roster;

      // My life: died, waiting, back.
      const stateSaysAlive = isAlive(s, myId);
      if (inRoster) {
        if (!myDead && !stateSaysAlive) {
          myDead = true;
          deathAt = performance.now();
          killerId = s.hits[myId]?.from ?? "";
          if (me) deathSpot = { x: me.x, y: me.y, z: me.z, yaw: look.yaw };
          audio?.death();
          scene.jolt(0.8);
        }
        if (myDead && !stateSaysAlive && s.status === "playing" && now >= (s.deadAt[myId] ?? 0) + RESPAWN_MS) once("respawn", () => respawn(roomId, key, myId), 800);
        if (myDead && stateSaysAlive) {
          const sp = spawnFor(s, myId);
          me = new Soldier(sp.x, sp.z, sp.yaw, world);
          arms = new Arsenal();
          look.yaw = sp.yaw;
          look.pitch = 0;
          myDead = false;
          killerId = "";
          shieldWas = MAX_SHIELD;
          setAimToggle(false);
        }
      }

      // Bot host: the connected person with the lowest id runs the bots.
      const { presence: pres, presenceLoaded: loaded } = presenceRef.current;
      const people = Object.keys(pres).filter((id) => id in s.players).sort();
      const botHost = loaded && people[0] === myId && s.status === "playing";
      if (botHost) {
        for (const id of ids.filter(isBot)) {
          if (bots.has(id)) continue;
          const p = poses[id];
          const sp = spawnFor(s, id);
          const sol = p && p.k === key ? new Soldier(p.x, p.z, p.yw, world) : new Soldier(sp.x, sp.z, sp.yaw, world);
          bots.set(id, { s: sol, a: new Arsenal(), mind: newMind(), send: openPose(roomId, id, false), dead: !isAlive(s, id), end: [0, 0, 0], m: 0, g: 0, pickAt: 0 });
        }
      } else if (bots.size) {
        for (const run of bots.values()) run.send.close();
        bots.clear();
      }
      for (const [id, run] of bots) {
        const alive = isAlive(s, id);
        if (!run.dead && !alive) run.dead = true;
        if (run.dead && !alive && now >= (s.deadAt[id] ?? 0) + RESPAWN_MS) once(`respawn:${id}`, () => respawn(roomId, key, id), 800);
        if (run.dead && alive) {
          const sp = spawnFor(s, id);
          run.s = new Soldier(sp.x, sp.z, sp.yaw, world);
          run.a = new Arsenal();
          run.mind = newMind();
          run.dead = false;
        }
      }

      // Look around (touch looks slower over an enemy: a little aim help).
      let sens = fine ? MOUSE_LOOK : TOUCH_LOOK;
      const prevYaw = look.yaw;
      const prevPitch = look.pitch;
      const aiming = s.status === "playing" && !myDead && (fine ? c.aim : aimToggleRef.current);
      const zoomFov = aiming ? WEAPONS[arms.weapon].zoom : 78;
      // Zoomed in, the view turns slower; on touch only a little slower, or the scope can't be aimed.
      sens *= fine ? zoomFov / 78 : Math.sqrt(zoomFov / 78);
      if (!fine && me && !myDead && !aiming) {
        const ens = enemiesOf(s, myId);
        const [dx, dy, dz] = spreadDir(look.yaw, look.pitch, [0, 0, 0]);
        const over = ens.some((e) => {
          const ex = e.x - me!.x;
          const ey = e.y + 1.2 - (me!.y + EYE);
          const ez = e.z - me!.z;
          const d = Math.hypot(ex, ey, ez);
          return d < 60 && (ex * dx + ey * dy + ez * dz) / d > Math.cos(0.08);
        });
        if (over) sens *= 0.55;
      }
      look.yaw -= c.lookX * sens;
      look.pitch = Math.max(-1.35, Math.min(1.35, look.pitch - c.lookY * sens));
      c.lookX = 0;
      c.lookY = 0;

      // Hits I took: direction, flash, sounds.
      for (const [id, h] of Object.entries(s.hits)) {
        const seen = seenHits.get(id) ?? 0;
        if (h.n <= seen) continue;
        seenHits.set(id, h.n);
        if (id === myId && me) {
          const a = Math.atan2(-(h.x - me.x), -(h.z - me.z)) - look.yaw;
          const onShield = shieldOf(s, myId, now) > 1;
          setHurtDirs((list) => [...list.slice(-3), { a, id: hurtId++, shield: onShield }]);
          audio?.hurt(onShield);
          scene.jolt(0.25);
        }
      }

      // Kill feed: chimes, "you eliminated", multi-kills.
      for (const [fid, e] of Object.entries(s.feed) as [string, FeedEntry][]) {
        if (seenFeed.has(fid)) continue;
        seenFeed.add(fid);
        if (e.k === myId && e.v !== myId) {
          kills = [...kills.filter((k2) => performance.now() - k2 < 4000), performance.now()];
          audio?.hitMarker(e.h, true);
          setHit((h2) => ({ n: h2.n + 1, head: e.h, kill: true }));
          const streak = kills.length >= 3 ? "¡Triple baja!" : kills.length === 2 ? "¡Doble baja!" : e.h ? "¡Tiro a la cabeza!" : "";
          setToast({ text: `${streak ? `${streak} · ` : ""}Eliminaste a ${fighterName(s, e.v)}`, id: toastId++ });
        }
      }

      // Countdown and start.
      const playing = s.status === "playing" && now >= s.startedAt;
      const count = s.status === "playing" && now < s.startedAt ? Math.ceil((s.startedAt - now) / 1000) : 0;
      if (count !== lastCount) {
        if (count > 0 && count <= 3) audio?.beep();
        if (count === 0 && lastCount > 0) audio?.go();
        lastCount = count;
      }

      // Physics, at a fixed step.
      if (playing) {
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          const solids = (self: string) =>
            everyone(s)
              .filter((o) => o.id !== self)
              .map((o) => ({ x: o.x, y: o.y, z: o.z }));
          if (me && !myDead) {
            const wasAir = !me.onGround;
            me.step({ mx: c.mx, mz: c.mz, yaw: look.yaw, pitch: look.pitch, jump: c.jump, aiming }, world, STEP, solids(myId));
            if (wasAir && me.landed > 0) {
              scene.jolt(Math.min(0.5, me.landed / 25));
              land = Math.min(1, me.landed / 12);
              me.landed = 0;
            }
            const evs = arms.step({ fire: c.fire, aim: aiming, reload: c.reload, swap: c.swap, grenade: c.grenade, melee: c.melee }, STEP);
            const r = handleEvents(s, myId, me, arms, evs, true);
            if (r.end) myEnd = r.end;
            if (r.m) myMelee++;
            if (r.g) myGrenades++;
          }
          for (const [id, run] of bots) {
            if (run.dead || !isAlive(s, id)) continue;
            const view = {
              enemies: Object.keys(s.roster)
                .filter((o) => o !== id && !allies(s, id, o))
                .map((o) => {
                  const p = posOf(o);
                  return p ? { ...p, alive: isAlive(s, o) } : null;
                })
                .filter((e): e is NonNullable<typeof e> => !!e),
              items: Object.entries(s.items).map(([iid, it]) => ({ id: iid, ...it })),
              hp: s.hp[id] ?? MAX_HP,
              shield: shieldOf(s, id, now),
            };
            const out = botThink(world, graph, run.s, run.a, run.mind, view, s.level, STEP, rand);
            run.s.step(out.move, world, STEP, solids(id));
            const evs = run.a.step(out.arms, STEP, rand);
            const r = handleEvents(s, id, run.s, run.a, evs, false);
            if (r.end) run.end = r.end;
            if (r.m) run.m++;
            if (r.g) run.g++;
            // Bots take what's under their feet when it helps them.
            for (const [iid, it] of Object.entries(s.items)) {
              if (Math.hypot(it.x - run.s.x, it.z - run.s.z) > 1.3) continue;
              if (autoPick(run.a, it.kind, s.hp[id] ?? MAX_HP) || (out.pick === iid && isWeapon(it.kind) && !run.a.has(it.kind))) tryPick(s, id, run.a, iid, false);
            }
          }
        }
      } else {
        acc = 0;
        if (me) {
          me.yaw = look.yaw;
          me.pitch = look.pitch;
        }
      }
      sinceShot += dt;
      meleeT = Math.max(0, meleeT - dt);

      // My rockets and grenades (and my bots'): fly them, explode, hurt.
      for (let i = myProj.length - 1; i >= 0; i--) {
        const pr = myProj[i];
        pr.age += dt;
        const res = flyProjectile(world, pr.p, dt, pr.p.kind === "cohete" ? enemiesOf(s, pr.owner) : []);
        const fuseOut = pr.p.kind === "granada" ? pr.age >= GRENADE_FUSE : pr.age > 5;
        if (!res.boom && !fuseOut) continue;
        myProj.splice(i, 1);
        pr.down();
        const { x, y, z } = pr.p;
        const hits = blast(world, pr.p.kind, x, y, z, everyone(s));
        if (hits.length) {
          damage(roomId, key, pr.owner, { x, z }, pr.p.kind, hits).catch(console.error);
          if (pr.owner === myId && hits.some((h) => h.target !== myId)) {
            audio?.hitMarker(false, false);
            setHit((h) => ({ n: h.n + 1, head: false, kill: false }));
          }
        }
        // Mine are shown right here: skip them when they come back from the database.
        seenBooms.add(publishBoom(roomId, { k: key, kind: pr.p.kind, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, z: Math.round(z * 10) / 10, t: Math.round(serverNow()) }));
        const [vol, pan] = where(x, z);
        const near = Math.hypot(x - (me?.x ?? 999), z - (me?.z ?? 999));
        scene.explosion(x, y, z, pr.p.kind === "cohete", near);
        audio?.explosion(vol, pan);
      }
      // Everyone else's: flown the same way from their launch, drawn.
      const draws: Record<string, { kind: Projectile["kind"]; x: number; y: number; z: number; vx: number; vy: number; vz: number }> = {};
      for (const pr of myProj) draws[pr.id] = { ...pr.p };
      for (const [pid, raw] of Object.entries(projIn)) {
        if (raw.k !== key || raw.o === myId || bots.has(raw.o)) continue;
        let r = remoteProj.get(pid);
        if (!r) {
          r = { p: { kind: raw.kind, x: raw.x, y: raw.y, z: raw.z, vx: raw.vx, vy: raw.vy, vz: raw.vz }, age: 0 };
          const behind = Math.min(4, Math.max(0, (now - raw.t) / 1000));
          for (let k = 0; k < behind; k += STEP) flyProjectile(world, r.p, STEP, []);
          r.age = behind;
          remoteProj.set(pid, r);
        }
        r.age += dt;
        flyProjectile(world, r.p, dt, []);
        draws[pid] = { ...r.p };
      }
      for (const pid of remoteProj.keys()) if (!(pid in projIn)) remoteProj.delete(pid);
      scene.setProjectiles(draws);
      // Their explosions.
      for (const [bid, b] of Object.entries(boomsIn)) {
        if (seenBooms.has(bid)) continue;
        seenBooms.add(bid);
        if (b.k !== key || now - b.t > 2000) continue;
        const [vol, pan] = where(b.x, b.z);
        const near = Math.hypot(b.x - (me?.x ?? 999), b.z - (me?.z ?? 999));
        scene.explosion(b.x, b.y, b.z, b.kind === "cohete", near);
        audio?.explosion(vol, pan);
      }

      // Pickups in reach.
      let near = "";
      let nearId = "";
      if (me && !myDead && playing) {
        for (const [iid, it] of Object.entries(s.items)) {
          if (Math.hypot(it.x - me.x, it.z - me.z) > 1.3) continue;
          if (autoPick(arms, it.kind, s.hp[myId] ?? MAX_HP)) tryPick(s, myId, arms, iid, true);
          else if (isWeapon(it.kind) && !arms.has(it.kind)) {
            near = PICKUP_LABEL[it.kind];
            nearId = iid;
          }
        }
      }
      if (c.pick) {
        c.pick = false;
        if (nearId) tryPick(s, myId, arms, nearId, true);
      }

      // Everyone else, from their poses.
      const ease = 1 - Math.exp(-dt * 16);
      for (const id of ids) {
        if (id === myId || bots.has(id)) continue;
        const p = poses[id];
        let g = ghosts.get(id);
        if (!p || p.k !== key) {
          if (g) g.pose = null;
          continue;
        }
        if (!g) {
          g = { x: p.x, y: p.y, z: p.z, yaw: p.yw, pitch: p.pt, vx: 0, vz: 0, lastT: 0, pose: null, f: p.f, m: p.m, firedAt: 0 };
          ghosts.set(id, g);
        }
        if (g.pose && p.t !== g.lastT && g.lastT) {
          const span = Math.max(0.03, (p.t - g.lastT) / 1000);
          g.vx = (p.x - g.pose.x) / span;
          g.vz = (p.z - g.pose.z) / span;
        }
        if (p.t !== g.lastT) {
          g.lastT = p.t;
          g.pose = p;
        }
        const ahead = Math.max(0, Math.min(0.12, (now - p.t) / 1000));
        const tx = p.x + g.vx * ahead;
        const tz = p.z + g.vz * ahead;
        if (Math.hypot(tx - g.x, tz - g.z) > 4) {
          g.x = tx;
          g.z = tz;
          g.y = p.y;
        } else {
          g.x += (tx - g.x) * ease;
          g.z += (tz - g.z) * ease;
          g.y += (p.y - g.y) * ease;
        }
        let d = p.yw - g.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        g.yaw += d * ease;
        g.pitch += (p.pt - g.pitch) * ease;
        // New shots: tracer and sound.
        if (p.f > g.f) {
          g.f = p.f;
          g.firedAt = performance.now();
          const weapon = WEAPON_IDS[p.w] ?? "rifle";
          if (weapon !== "lanzacohetes") {
            const from = scene.muzzle(id) ?? [g.x, g.y + EYE - 0.2, g.z];
            // Where it landed: a wall (hole and dust) or a soldier (no normal).
            const dx = p.sx - from[0], dy = p.sy - from[1], dz = p.sz - from[2];
            const len = Math.hypot(dx, dy, dz);
            let normal: [number, number, number] | null = null;
            if (len > 0.5) {
              const hitW = rayWorldHit(world, { ox: from[0], oy: from[1], oz: from[2], dx: dx / len, dy: dy / len, dz: dz / len }, len + 0.3);
              if (Math.abs(hitW.t - len) < 0.35) normal = hitW.n;
            }
            scene.shot(id, from, p.sx, p.sy, p.sz, weapon, normal ? "nada" : null, normal);
            nearMiss(from, [p.sx, p.sy, p.sz]);
            const [vol, pan] = where(g.x, g.z);
            audio?.shot(weapon, vol, pan);
          }
        }
        if (p.m > g.m) {
          g.m = p.m;
          const [vol, pan] = where(g.x, g.z);
          audio?.melee(vol, pan);
        }
      }

      // Calls anyone may make.
      if (s.status === "playing" && now > s.endsAt) once("time", () => timeUp(roomId, key));
      if (playing && Object.values(s.respawns).some((r) => r.at <= now)) once("items", () => respawnItems(roomId, key));

      // My shield: alarm when empty, a sound when it starts filling.
      if (me && !myDead) {
        const sh = shieldOf(s, myId, now);
        if (sh < 1 && shieldWas >= 1) {
          audio?.shieldBreak();
          setShieldBroke((n) => n + 1);
        }
        if (sh < 1 && performance.now() - alarmAt > 600) {
          alarmAt = performance.now();
          audio?.shieldAlarm();
        }
        if (sh > shieldWas + 0.5 && shieldWas < 1) audio?.shieldCharge();
        shieldWas = sh;
        if (me.stride - lastStride > 2.3) {
          lastStride = me.stride;
          audio?.step();
        }
      }

      // Publish my pose and my bots'.
      if (t - lastPose >= POSE_MS) {
        lastPose = t;
        if (me && mySend && !myDead) mySend.send(poseFor(me, arms, myEnd, myMelee, myGrenades, aiming));
        for (const run of bots.values()) if (!run.dead) run.send.send(poseFor(run.s, run.a, run.end, run.m, run.g, false));
      }

      // Draw.
      const info = ids
        .filter((id) => id !== myId)
        .map((id) => {
          const side = s.roster[id];
          const color = side === "red" || side === "blue" ? teamInfo(side).color : (s.players[id]?.color ?? "#f97316");
          return [id, { color, label: fighterName(s, id), ally: allies(s, myId, id) }] as const;
        });
      const infoKey = JSON.stringify(info);
      if (infoKey !== lastInfo) {
        lastInfo = infoKey;
        scene.setSoldiers(Object.fromEntries(info));
      }
      for (const id of ids) {
        if (id === myId) continue;
        const pos = posOf(id);
        const alive = isAlive(s, id);
        const run = bots.get(id);
        const g = ghosts.get(id);
        const deadFor = alive ? 0 : Math.max(0, (now - (s.deadAt[id] ?? now)) / 1000);
        if (pos) {
          const weapon = run ? run.a.weapon : (WEAPON_IDS[g?.pose?.w ?? 0] ?? "rifle");
          scene.setSoldier(id, { x: pos.x, y: pos.y, z: pos.z, yaw: pos.yaw, pitch: pos.pitch, weapon, speed: pos.speed, alive, deadFor });
        } else if (!alive && (run || g)) {
          const x = run ? run.s.x : g!.x;
          const y = run ? run.s.y : g!.y;
          const z = run ? run.s.z : g!.z;
          scene.setSoldier(id, { x, y, z, yaw: run ? run.s.yaw : g!.yaw, pitch: 0, weapon: "rifle", speed: 0, alive: false, deadFor });
        } else {
          scene.setSoldier(id, null);
        }
      }
      if (s.items !== lastItems) {
        lastItems = s.items;
        scene.setPickups(s.items, mapId, map.items);
      }

      // Camera: my eyes; when dead, above where I fell looking at who did it; spectators follow someone.
      let eye = { x: 0, y: 30, z: map.hz, yaw: 0, pitch: -0.5, fov: 78 };
      let watching = "";
      if (me && !myDead) {
        eye = { x: me.x, y: me.y + EYE, z: me.z, yaw: look.yaw, pitch: look.pitch, fov: zoomFov };
      } else if (inRoster) {
        const k = posOf(killerId);
        const yaw = k ? Math.atan2(-(k.x - deathSpot.x), -(k.z - deathSpot.z)) : deathSpot.yaw;
        const up = Math.min(1, (performance.now() - deathAt) / 1200);
        eye = { x: deathSpot.x - Math.sin(yaw) * -2 * up, y: deathSpot.y + 1 + up * 3, z: deathSpot.z - Math.cos(yaw) * -2 * up, yaw, pitch: -0.35 * up, fov: 70 };
      } else {
        const alive = ids.filter((id) => isAlive(s, id) && posOf(id));
        const pick = alive[Math.floor(performance.now() / 8000) % Math.max(1, alive.length)];
        const p = pick ? posOf(pick) : null;
        if (p) {
          eye = { x: p.x - Math.sin(p.yaw) * -3, y: p.y + 2.6, z: p.z - Math.cos(p.yaw) * -3, yaw: p.yaw, pitch: -0.25, fov: 70 };
          watching = fighterName(s, pick);
        }
      }
      const zoomed = aiming && arms.weapon === "francotirador";
      land = Math.max(0, land - dt * 4);
      const mySide = s.roster[myId];
      const myColor = mySide === "red" || mySide === "blue" ? teamInfo(mySide).color : (s.players[myId]?.color ?? "#64748b");
      scene.render(
        eye,
        me && !myDead
          ? {
              weapon: arms.weapon,
              sinceShot,
              reload: arms.reloading > 0 ? 1 - arms.reloading / WEAPONS[arms.weapon].reload : 0,
              switching: arms.switching,
              melee: meleeT / 0.35,
              aiming,
              speed: me.speed,
              lookDX: look.yaw - prevYaw,
              lookDY: look.pitch - prevPitch,
              land,
              color: myColor,
              hidden: zoomed,
            }
          : null,
        dt
      );

      // HUD, ten times a second.
      if (t - hudAt > 100) {
        hudAt = t;
        const radar: Hud["radar"] = [];
        if (me && !myDead) {
          for (const id of ids) {
            if (id === myId || !isAlive(s, id)) continue;
            const p = posOf(id);
            if (!p) continue;
            const ally = allies(s, myId, id);
            const g = ghosts.get(id);
            const loud = p.speed > 3.5 || (g && performance.now() - g.firedAt < 1500) || (bots.get(id)?.a.cool ?? 0) > 0;
            if (!ally && !loud) continue;
            const dx = p.x - me.x;
            const dz = p.z - me.z;
            if (Math.hypot(dx, dz) > RADAR_RANGE) continue;
            // Rotated so up is where I look.
            const c2 = Math.cos(look.yaw);
            const s2 = Math.sin(look.yaw);
            radar.push({ x: (dx * c2 - dz * s2) / RADAR_RANGE, y: (dx * s2 + dz * c2) / RADAR_RANGE, ally });
          }
        }
        const other = arms.slots.length > 1 ? arms.slots[1 - arms.current].id : null;
        const scopeInfo = () => {
          if (!me || myDead || !aiming) return { range: 0, zoomX: 1, onTarget: false };
          const [dx, dy, dz] = spreadDir(look.yaw, look.pitch, [0, 0, 0]);
          const res = castBullet(world, { ox: me.x, oy: me.y + EYE, oz: me.z, dx, dy, dz }, arms.weapon, enemiesOf(s, myId));
          return { range: Math.round(res.dist), zoomX: Math.round((78 / WEAPONS[arms.weapon].zoom) * 10) / 10, onTarget: !!res.hit };
        };
        const next: Hud = {
          hp: s.hp[myId] ?? 0,
          shield: Math.round(shieldOf(s, myId, now)),
          weapon: arms.weapon,
          mag: arms.slot.mag,
          reserve: arms.slot.reserve,
          other,
          grenades: arms.grenades,
          alive: !!me && !myDead,
          respawnIn: myDead && s.deadAt[myId] ? Math.max(0, Math.ceil((s.deadAt[myId] + RESPAWN_MS - now) / 1000)) : 0,
          killer: killerId && killerId !== myId ? fighterName(s, killerId) : killerId === myId ? "vos mismo" : "",
          near,
          zoomed,
          reloading: arms.reloading > 0,
          radar,
          watching,
          ...scopeInfo(),
          board: c.board,
        };
        const hk = JSON.stringify(next);
        if (hk !== lastHudKey) {
          lastHudKey = hk;
          setHud(next);
        }
        setClock(now);
      }
    };

    frame = requestAnimationFrame(tick);
    // Development only: hand yourself a weapon from the console, for testing (`__fuego.give("francotirador")`).
    const devWindow = window as unknown as { __fuego?: { give: (w: WeaponId) => void } };
    if (process.env.NODE_ENV !== "production") devWindow.__fuego = { give: (w) => arms.take(w) };
    return () => {
      cancelAnimationFrame(frame);
      delete devWindow.__fuego;
      unsubPoses();
      unsubProj();
      unsubBooms();
      mySend?.close();
      for (const run of bots.values()) run.send.close();
      for (const pr of myProj) pr.down();
      scene.dispose();
    };
  }, [roomId, myId, gameNo, mapId, fine, quality]);

  // Messages fade.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!hurtDirs.length) return;
    const t = setTimeout(() => setHurtDirs([]), 900);
    return () => clearTimeout(t);
  }, [hurtDirs]);

  const now = clock || serverNow();
  const counting = state.status === "playing" && now < state.startedAt;
  const count = Math.ceil((state.startedAt - now) / 1000);
  const left = state.endsAt - now;
  const inRoster = myId in state.roster;
  const fullscreenable = typeof document !== "undefined" && document.fullscreenEnabled;
  const showBoard = board || !!hud?.board;
  const feed = Object.entries(state.feed)
    .sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)))
    .slice(-5)
    .map(([, e]) => e)
    .filter((e) => now - e.t < 8000);
  const myScore = state.kills[myId] ?? 0;
  const leader = ranking(state)[0];

  return (
    <div className="fixed inset-0 z-40 select-none overflow-hidden bg-slate-900" style={{ touchAction: "none" }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {hud?.zoomed && <Scope range={hud.range} zoomX={hud.zoomX} onTarget={hud.onTarget} />}

      {/* Low health: a slow red pulse at the edges. */}
      {inRoster && hud?.alive && hud.hp <= 35 && !hud.zoomed && (
        <div className="pointer-events-none absolute inset-0 animate-pulse" style={{ boxShadow: "inset 0 0 140px 40px rgba(185,28,28,0.5)" }} />
      )}
      {/* Damage: edges (cyan on the shield, red on health) and arrows toward who's shooting. */}
      {hurtDirs.length > 0 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: hurtDirs[hurtDirs.length - 1].shield ? "inset 0 0 90px 18px rgba(34,211,238,0.4)" : "inset 0 0 110px 25px rgba(220,38,38,0.5)" }}
        />
      )}
      {hurtDirs.map((h) => (
        <div key={h.id} className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2" style={{ transform: `translate(-50%, -50%) rotate(${-h.a}rad)` }}>
          <div className={`absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[14px] border-b-[22px] border-x-transparent ${h.shield ? "border-b-cyan-300/80" : "border-b-red-500/85"}`} />
        </div>
      ))}
      {/* The shield just broke. */}
      {shieldBroke > 0 && (
        <div key={shieldBroke} className="pointer-events-none absolute inset-0 animate-[ping_0.5s_ease-out_1] opacity-0" style={{ boxShadow: "inset 0 0 160px 50px rgba(103,232,249,0.6)" }} />
      )}

      {inRoster && hud?.alive && state.status === "playing" && !fine && (
        <TouchControls
          controlsRef={controlsRef}
          canPick={!!hud.near}
          pickLabel={hud.near}
          aiming={aimToggle}
          onAim={() => setAimToggle((v) => !v)}
          fireOnRelease={hud.zoomed}
        />
      )}

      {/* Crosshair and hit marker. */}
      {hud?.alive && state.status === "playing" && !hud.zoomed && <Crosshair weapon={hud.weapon} />}
      {hit.n > 0 && (
        <div key={hit.n} className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-[ping_0.25s_ease-out_1]">
          {[45, 135, 225, 315].map((r) => (
            <span
              key={r}
              className="absolute left-1/2 top-1/2 h-0.5 w-3"
              style={{ transform: `translate(-50%, -50%) rotate(${r}deg) translateX(10px)`, backgroundColor: hit.kill ? "#ef4444" : hit.head ? "#fbbf24" : "#ffffff" }}
            />
          ))}
        </div>
      )}

      {/* Top: back, score and time, options. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-2.5">
        <div className="pointer-events-auto flex flex-col gap-1.5">
          <Link href="/" aria-label="Volver a Talo" className="w-fit rounded-xl bg-slate-950/60 p-2 backdrop-blur">
            <TaloMark className="h-5 w-5" />
          </Link>
          {inRoster && hud && <Radar points={hud.radar} />}
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-3 rounded-2xl bg-slate-950/70 px-4 py-1.5 font-display text-xl font-bold text-white backdrop-blur">
            {state.mode === "equipos" ? (
              <>
                <span style={{ color: teamInfo("red").color }}>{state.score.red}</span>
                <span className="text-sm font-medium text-slate-300">{state.status === "playing" && !counting ? formatClock(left) : `a ${state.goal}`}</span>
                <span style={{ color: teamInfo("blue").color }}>{state.score.blue}</span>
              </>
            ) : (
              <>
                <span className="text-amber-300">{myScore}</span>
                <span className="text-sm font-medium text-slate-300">{state.status === "playing" && !counting ? formatClock(left) : `a ${state.goal}`}</span>
                <span className="text-sm text-slate-300">
                  1º {leader ? `${fighterName(state, leader, myId)} ${state.kills[leader] ?? 0}` : "-"}
                </span>
              </>
            )}
          </div>
          <p className="rounded-full bg-slate-950/50 px-2 text-[11px] text-slate-200">
            {MAPS[state.map].name} · gana {state.mode === "equipos" ? "el equipo" : "quien"} que llegue a {state.goal} bajas
          </p>
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <div className="flex gap-1.5">
            <button onClick={() => setSound((v) => (v === "on" ? "off" : "on"))} aria-label={sound === "on" ? "Silenciar" : "Activar sonido"} className="rounded-xl bg-slate-950/60 p-2 text-white backdrop-blur">
              {sound === "on" ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <button
              onClick={toggleQuality}
              aria-label="Calidad gráfica"
              title="Calidad gráfica: alta tiene brillos y sombras; baja va más fluido en teléfonos viejos"
              className="flex items-center gap-1 rounded-xl bg-slate-950/60 px-2 py-2 text-xs text-white backdrop-blur"
            >
              <Sparkles className="h-4 w-4" /> {quality === "alta" ? "Alta" : "Baja"}
            </button>
            <button onClick={() => setBoard((v) => !v)} aria-label="Tabla" className="rounded-xl bg-slate-950/60 p-2 text-white backdrop-blur">
              <ListOrdered className="h-4 w-4" />
            </button>
            {fullscreenable && (
              <button
                onClick={() => (document.fullscreenElement ? document.exitFullscreen().catch(() => {}) : document.documentElement.requestFullscreen().catch(() => {}))}
                aria-label="Pantalla completa"
                className="rounded-xl bg-slate-950/60 p-2 text-white backdrop-blur"
              >
                <Maximize className="h-4 w-4" />
              </button>
            )}
          </div>
          <ul className="flex flex-col items-end gap-0.5">
            {feed.map((e, i) => (
              <li key={`${e.t}-${i}`} className="rounded-md bg-slate-950/60 px-2 py-0.5 text-[11px] text-white backdrop-blur">
                <span className={e.k === myId ? "text-amber-300" : ""}>{fighterName(state, e.k, myId)}</span>{" "}
                <span className="text-slate-400">
                  [{WEAPON_WORD[e.w] ?? e.w}
                  {e.h ? " 🎯" : ""}]
                </span>{" "}
                <span className={e.v === myId ? "text-red-300" : ""}>{e.v === e.k ? "se eliminó solo" : fighterName(state, e.v, myId)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Shield, health, weapon and ammo. */}
      {inRoster && hud?.alive && (
        <>
          <div className={`pointer-events-none absolute left-1/2 z-20 w-64 -translate-x-1/2 ${fine ? "bottom-4" : "top-[5.25rem]"}`}>
            <div className="flex gap-0.5">
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className="h-2 flex-1 skew-x-[-20deg] rounded-sm bg-slate-800/80">
                  <div className="h-full rounded-sm bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.8)]" style={{ width: `${Math.max(0, Math.min(1, hud.shield / MAX_SHIELD * 10 - i)) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-0.5">
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className="h-1.5 flex-1 skew-x-[-20deg] rounded-sm bg-slate-800/80">
                  <div className={`h-full rounded-sm ${hud.hp <= 35 ? "bg-red-500" : "bg-emerald-400"}`} style={{ width: `${Math.max(0, Math.min(1, hud.hp / MAX_HP * 10 - i)) * 100}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className={`pointer-events-none absolute z-20 rounded-xl bg-slate-950/60 px-3 py-2 text-right text-white backdrop-blur ${fine ? "bottom-4 right-4" : "bottom-44 left-4 text-left"}`}>
            <p className="font-display text-3xl font-bold leading-none">
              {hud.weapon === "lanzacohetes" || hud.mag > 0 ? hud.mag : <span className="text-red-400">0</span>}
              <span className="ml-1 text-base font-medium text-slate-400">/ {hud.reserve}</span>
            </p>
            <p className="mt-0.5 text-xs font-semibold">
              {WEAPONS[hud.weapon].label}
              {hud.reloading && <span className="ml-1 text-amber-300">recargando…</span>}
            </p>
            {!hud.reloading && hud.mag === 0 && hud.reserve === 0 && <p className="text-xs font-bold text-red-400">Sin munición: cambiá de arma</p>}
            {!hud.reloading && hud.reserve > 0 && hud.mag <= Math.max(1, Math.floor(WEAPONS[hud.weapon].mag / 4)) && (
              <p className="animate-pulse text-xs font-bold text-amber-300">{fine ? "R: recargá" : "Recargá"}</p>
            )}
            <p className="text-[11px] text-slate-400">
              {hud.other ? `${WEAPONS[hud.other].label} · ` : ""}💣 {hud.grenades}
            </p>
            {fine && hud.near && <p className="mt-1 text-xs text-amber-200">E: agarrar {hud.near}</p>}
          </div>
        </>
      )}

      {fine && inRoster && !locked && state.status === "playing" && hud?.alive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center">
          <p className="flex max-w-xl items-center gap-2 rounded-xl bg-slate-950/75 px-4 py-2 text-sm text-white backdrop-blur">
            <MousePointerClick className="h-4 w-4 shrink-0" />
            Hacé clic para jugar · WASD moverte · clic disparar · clic derecho apuntar · R recargar · Q cambiar arma · G granada · F golpe · E agarrar · espacio saltar · Esc soltar el mouse
          </p>
        </div>
      )}

      {!fine && (
        <p className="pointer-events-none absolute inset-x-0 top-28 z-20 hidden items-center justify-center gap-1.5 text-xs text-white drop-shadow portrait:flex">
          <RotateCw className="h-3.5 w-3.5" /> Girá el teléfono para jugar mejor
        </p>
      )}

      {toast && (
        <div key={toast.id} className="pointer-events-none absolute inset-x-0 top-1/3 z-20 flex justify-center">
          <p className="animate-celebration-in rounded-xl bg-slate-950/70 px-4 py-2 font-display text-lg font-bold text-amber-300 backdrop-blur">{toast.text}</p>
        </div>
      )}

      {counting && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center">
          <p className="mb-2 font-display text-2xl font-bold text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.8)]">{MAPS[state.map].name}</p>
          <span key={count} className="animate-celebration-in font-display text-[24vmin] font-extrabold text-white drop-shadow-[0_0_30px_rgba(0,0,0,0.7)]">
            {count}
          </span>
        </div>
      )}

      {inRoster && hud && !hud.alive && state.status === "playing" && !counting && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-red-950/20">
          <p className="font-display text-3xl font-bold text-white drop-shadow">{hud.killer ? `Te eliminó ${hud.killer}` : "Te eliminaron"}</p>
          <p className="rounded-xl bg-slate-950/60 px-4 py-1.5 text-white backdrop-blur">Reaparecés en {hud.respawnIn}…</p>
        </div>
      )}

      {!inRoster && hud?.watching && state.status === "playing" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
          <p className="rounded-xl bg-slate-950/75 px-4 py-2 text-sm text-white backdrop-blur">
            Mirando a <b>{hud.watching}</b> · jugás la próxima partida
          </p>
        </div>
      )}

      {showBoard && state.status === "playing" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setBoard(false)}>
          <Scoreboard state={state} myId={myId} />
        </div>
      )}

      {state.status === "finished" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4">
          <Results roomId={roomId} meta={meta} state={state} myId={myId} presence={presence} />
        </div>
      )}
    </div>
  );
}

/** Sniper scope: dark around the lens, mil-dot reticle, range to what's under the crosshair. */
function Scope({ range, zoomX, onTarget }: { range: number; zoomX: number; onTarget: boolean }) {
  const color = onTarget ? "#ef4444" : "#0f172a";
  return (
    <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(circle at center, rgba(96,165,250,0.06) 0 31vmin, rgba(0,0,0,0.6) 32vmin, rgba(0,0,0,0.96) 33vmin)" }}>
      <div className="absolute left-1/2 top-1/2 h-[64vmin] w-[64vmin] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[inset_0_0_40px_10px_rgba(0,0,0,0.65)]" />
      <div className="absolute left-1/2 top-1/2 h-[64vmin] w-[2px] -translate-x-1/2 -translate-y-1/2" style={{ background: `linear-gradient(${color} 0 44%, transparent 44% 56%, ${color} 56%)` }} />
      <div className="absolute left-1/2 top-1/2 h-[2px] w-[64vmin] -translate-x-1/2 -translate-y-1/2" style={{ background: `linear-gradient(90deg, ${color} 0 44%, transparent 44% 56%, ${color} 56%)` }} />
      {[-3, -2, -1, 1, 2, 3].map((k) => (
        <span key={`h${k}`} className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ backgroundColor: color, marginLeft: `${k * 4}vmin` }} />
      ))}
      {[1, 2, 3].map((k) => (
        <span key={`v${k}`} className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ backgroundColor: color, marginTop: `${k * 4}vmin` }} />
      ))}
      <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ backgroundColor: onTarget ? "#ef4444" : "#e11d48" }} />
      <p className="absolute left-1/2 top-1/2 ml-[18vmin] mt-[3vmin] font-mono text-sm font-bold text-emerald-300 drop-shadow">
        {range} m · x{zoomX}
      </p>
    </div>
  );
}

function Crosshair({ weapon }: { weapon: WeaponId }) {
  if (weapon === "escopeta") {
    return <div className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 shadow" />;
  }
  if (weapon === "lanzacohetes") {
    return (
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-white/80">
        <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </div>
    );
  }
  const gap = weapon === "rifle" ? 7 : 5;
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0">
      <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" />
      {[0, 90, 180, 270].map((r) => (
        <span key={r} className="absolute left-0 top-0 h-0.5 w-2.5 bg-white/90 shadow" style={{ transform: `rotate(${r}deg) translateX(${gap}px) translateY(-1px)` }} />
      ))}
    </div>
  );
}

/** Motion tracker: allies always, enemies only when they run or shoot. */
function Radar({ points }: { points: { x: number; y: number; ally: boolean }[] }) {
  return (
    <div className="relative h-24 w-24 overflow-hidden rounded-full border border-cyan-400/40 bg-slate-950/55 backdrop-blur">
      <div className="absolute left-1/2 top-0 h-full w-px bg-cyan-300/20" />
      <div className="absolute left-0 top-1/2 h-px w-full bg-cyan-300/20" />
      <div className="absolute left-1/2 top-1/2 h-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/20" />
      <div className="absolute left-1/2 top-1/2 h-0 w-0 -translate-x-1/2 -translate-y-1/2 border-x-[5px] border-b-[8px] border-x-transparent border-b-cyan-200" />
      {points.map((p, i) => (
        <span
          key={i}
          className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${p.ally ? "bg-sky-300" : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]"}`}
          style={{ left: `${50 + p.x * 50}%`, top: `${50 + p.y * 50}%` }}
        />
      ))}
    </div>
  );
}

function Scoreboard({ state, myId }: { state: FuegoState; myId: string }) {
  const ids = ranking(state);
  return (
    <div className="w-full max-w-md rounded-3xl bg-slate-950/90 p-4 text-white shadow-2xl ring-1 ring-white/10">
      {state.mode === "equipos" && (
        <p className="mb-2 text-center font-display text-2xl font-bold">
          <span style={{ color: teamInfo("red").color }}>{state.score.red}</span> – <span style={{ color: teamInfo("blue").color }}>{state.score.blue}</span>
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-400">
            <th className="py-1">Jugador</th>
            <th className="w-14 text-right">Bajas</th>
            <th className="w-16 text-right">Muertes</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const side = state.roster[id];
            return (
              <tr key={id} className={id === myId ? "text-amber-300" : ""}>
                <td className="flex items-center gap-2 py-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: side === "red" || side === "blue" ? teamInfo(side).color : (state.players[id]?.color ?? "#f97316") }} />
                  {fighterName(state, id, myId)}
                  {isBot(id) && <span className="text-xs text-slate-500">bot</span>}
                </td>
                <td className="text-right font-mono">{state.kills[id] ?? 0}</td>
                <td className="text-right font-mono text-slate-400">{state.deaths[id] ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Results({ roomId, meta, state, myId, presence }: { roomId: string; meta: FuegoMeta; state: FuegoState; myId: string; presence: PresenceMap }) {
  const team = state.winner === "red" || state.winner === "blue" ? teamInfo(state.winner) : null;
  const mine = state.roster[myId];
  const title =
    state.winner === "draw"
      ? "¡Empate!"
      : team
        ? mine === state.winner
          ? "🏆 ¡Ganó tu equipo!"
          : mine
            ? "Ganó el otro equipo"
            : `🏆 ¡Ganó el ${team.label}!`
        : state.winner === myId
          ? "🏆 ¡Ganaste!"
          : `🏆 Ganó ${fighterName(state, state.winner, myId)}`;
  const connected = Object.keys(presence);
  return (
    <div className="animate-celebration-in flex w-full max-w-md flex-col items-center gap-4 rounded-3xl bg-slate-950/90 p-5 text-center shadow-2xl ring-1 ring-white/10 backdrop-blur">
      <p className="font-display text-3xl font-bold" style={{ color: team?.color ?? "#fbbf24" }}>
        {title}
      </p>
      <Scoreboard state={state} myId={myId} />
      <div className="flex w-full max-w-xs flex-col gap-2">
        <button onClick={() => startMatch(roomId, meta, connected)} className={PRIMARY_BUTTON}>
          Revancha
        </button>
        <button onClick={() => backToWaiting(roomId, state.gameNo)} className={SECONDARY_BUTTON}>
          Volver a la sala
        </button>
      </div>
    </div>
  );
}

