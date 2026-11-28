"use client";

import TvModeButton, { useTvMode } from "@/components/TvModeButton";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  NO_PAD,
  RESPAWN_MS,
  SKY,
  allies,
  backToWaiting,
  captureFlag,
  claimEgg,
  damage,
  fighterColor,
  fighterName,
  guarded,
  isAlive,
  isBot,
  kitOf,
  openPose,
  pickItem,
  placeDropped,
  publishBoom,
  publishLive,
  ranking,
  respawn,
  respawnItems,
  shieldOf,
  scoreOf,
  startMatch,
  subscribeBooms,
  subscribePads,
  subscribePoses,
  subscribeProjectiles,
  takeEgg,
  teamInfo,
  throwProjectile,
  tidyObjectives,
  timeUp,
  touchFlag,
  popBubble,
  type DamageHit,
  type FeedEntry,
  type FuegoBoom,
  type FuegoLive,
  type FuegoMeta,
  type FuegoPad,
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
  topAt,
  worldOf,
  type ArsenalEvent,
  type BotMind,
  type Projectile,
  type Target,
  type WeaponId,
} from "@/lib/fuegoSim";
import { kickLook, newPadSeen, padInput, resetLook, type PadSeen } from "@/lib/fuegoPad";
import {
  EGG_REACH,
  EGG_TARGET_MS,
  FLAG_CAPS,
  FLAG_REACH,
  INFECTED,
  INFECTED_JUMP,
  INFECTED_SPEED,
  LADDER,
  MODE_INFO,
  SURVIVORS,
  eggScore,
  fixedWeapons,
  flagBase,
  isTeamMode,
  ladderStep,
} from "@/lib/fuegoModes";
import { ABILITY_INFO, BLINK_DIST, DASH_SPEED, RADAR_MS, SUPER_JUMP, type AbilityId } from "@/lib/fuegoAbilities";
import { CHAOS_INFO, NO_MODS, RAIN_DAMAGE, RAIN_FALL_S, RAIN_HEIGHT, WARN_MS, chaosAt, chaosMods, nextChaos, rainDrops, type ChaosMods } from "@/lib/fuegoChaos";
import { MAPS, type PickupKind } from "@/lib/fuegoMaps";
import { FuegoScene, type Eye, type ObjectivesDraw, type ViewModel } from "@/lib/fuego3d";
import { useQuality } from "@/hooks/useQuality";
import QualityButton from "@/components/QualityButton";
import { FuegoAudio } from "@/lib/fuegoAudio";
import { serverNow } from "@/lib/serverTime";
import type { PresenceMap } from "@/lib/presence";
import type { TeamId } from "@/lib/teams";
import { useWakeLock } from "@/components/carreras/Controller";
import { TaloMark } from "@/components/TaloLogo";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import { ControlsEditor, MOUSE_LOOK, TOUCH_LOOK, TouchControls, newControls, releaseControls, useDesktopControls, useFinePointer, type ControlState } from "./Controls";
import { Bomb, Crown, Flame, ListOrdered, MousePointerClick, RotateCw, ShieldCheck, SlidersHorizontal, Skull, Volume2, VolumeX, Zap } from "lucide-react";
import FullscreenButton from "@/components/FullscreenButton";
import { DEFAULT_TOUCH, loadTouch, saveTouch, type TouchSettings } from "./touchLayout";
import { Talo } from "@/components/Talo";
import { playerTalo } from "@/lib/talos";

const STEP = 1 / 60;
const POSE_MS = 50;
const LIVE_MS = 150;
const RADAR_RANGE = 28;
const BASE_FOV = 78;
/** Mobile aim help: bullets that pass this close (radians) to someone still hit. */
const TOUCH_ASSIST = 0.06;
const TOAST_MS = 2600;
/** Colors of the balloons that fall in the chaos "lluvia" (the brand's). */
const RAIN_COLORS = ["#FF5FA2", "#FF7A1A", "#2D5BFF", "#00B26B", "#8A4DFF", "#FFC400"];
const keyHash = (k: string) => [...k].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);

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
  /** Abilities seen used (to show the effect when it grows). */
  h: number;
}

/** How someone died: who, with what, and how much the killer had left. */
interface Death {
  killer: string;
  weapon: string;
  hp: number;
  sh: number;
}

/**
 * A soldier this client runs besides its own: a bot (bot host), or — on the
 * big screen — a person playing from their phone's pad (`remote`). The view
 * fields (aiming, recoil, deaths, toasts…) are only used for people.
 */
interface Run {
  s: Soldier;
  a: Arsenal;
  mind: BotMind;
  send: ReturnType<typeof openPose>;
  dead: boolean;
  end: [number, number, number];
  m: number;
  g: number;
  remote?: PadSeen;
  aiming: boolean;
  sinceShot: number;
  meleeT: number;
  land: number;
  deathAt: number;
  deathSpot: { x: number; y: number; z: number; yaw: number };
  death: Death | null;
  lastKiller: string;
  recent: number[];
  hurtAt: number;
  hurtShield: boolean;
  toast: { title: string; sub: string; at: number } | null;
  near: string;
  nearId: string;
  wantPick: boolean;
  prevYaw: number;
  prevPitch: number;
  /** Camera tilt while strafing (big screen views). */
  roll: number;
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
  guard: boolean;
  respawnIn: number;
  killer: string;
  killedWith: string;
  killerHp: number;
  near: string;
  zoomed: boolean;
  aiming: boolean;
  reloading: boolean;
  radar: { x: number; y: number; ally: boolean }[];
  watching: string;
  /** Through the scope: distance to what the crosshair is on, and magnification. */
  range: number;
  zoomX: number;
  onTarget: boolean;
  /** The ability and how ready it is (0–1). */
  ability: { kit: AbilityId; ready: number };
  /** Tab held (desktop scoreboard). */
  board: boolean;
}

/** Big screen: one person's view and what's drawn over it. */
interface ViewHud extends Hud {
  id: string;
  toast: { title: string; sub: string; at: number } | null;
  /** Hit just now: 1 on the shield, 2 on health. */
  hurt: 0 | 1 | 2;
}

interface Toast {
  title: string;
  sub: string;
  id: number;
}

const SOUND_KEY = "fuego.sound";
const QUALITY_KEY = "fuego.calidad";
const NO_SEND = { send: () => {}, close: () => {} } as unknown as ReturnType<typeof openPose>;

function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const WEAPON_WORD: Record<string, string> = {
  rifle: "rociador",
  pistola: "pistola",
  escopeta: "salpicadora",
  francotirador: "francotirador",
  lanzacohetes: "globazo",
  cohete: "globazo",
  granada: "globo de pintura",
  golpe: "manotazo",
};

/** Big screen, split: the views' rectangles (fractions, from the top-left) for 1–4 people. */
export function splitRects(n: number): [number, number, number, number][] {
  if (n <= 1) return [[0, 0, 1, 1]];
  if (n === 2) return [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]];
  if (n === 3) return [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 1, 0.5]];
  return [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
}

/** The people who get a view on the big screen (up to 4), red team first. */
export function splitPeople(state: FuegoState): string[] {
  const order = (id: string) => (state.roster[id] === "red" ? 0 : state.roster[id] === "blue" ? 1 : 0);
  return Object.keys(state.roster)
    .filter((id) => !isBot(id))
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
    .slice(0, 4);
}

/** The medals a kill earns its killer (most special first). */
function medalsFor(e: FeedEntry, recent: number, lastKiller: string, firstBlood: boolean): string[] {
  const out: string[] = [];
  const streak = e.s ?? 0;
  if (streak >= 10 && streak % 5 === 0) out.push(streak === 10 ? "¡Leyenda!" : `¡Racha de ${streak}!`);
  else if (streak === 5) out.push("¡Imparable!");
  if (recent >= 4) out.push("¡Masacre!");
  else if (recent === 3) out.push("¡Triple baja!");
  else if (recent === 2) out.push("¡Doble baja!");
  if (firstBlood) out.push("¡Primera sangre!");
  if (lastKiller && e.v === lastKiller) out.push("¡Venganza!");
  if (e.w === "golpe") out.push("¡Manotazo!");
  else if (e.h) out.push("¡Tiro a la cabeza!");
  return out;
}

/** Where a bot heads for the mode's objective (null: fight and wander as usual). */
function botGoal(s: FuegoState, id: string): { x: number; z: number; rush?: boolean } | null {
  if (s.mode === "bandera") {
    const side = s.roster[id];
    if (side !== "red" && side !== "blue") return null;
    const rival: TeamId = side === "red" ? "blue" : "red";
    const mine = s.flags[side];
    const theirs = s.flags[rival];
    const map = MAPS[s.map];
    if (theirs?.st === "carried" && theirs.by === id) return { ...flagBase(map, side), rush: true };
    if (mine && mine.st !== "base") return mine.st === "dropped" ? { x: mine.x, z: mine.z, rush: true } : null;
    // A third of each team stays home; the rest go for the rival's flag.
    const defender = [...id].reduce((h, ch) => h + ch.charCodeAt(0), 0) % 3 === 0;
    if (defender) return flagBase(map, side);
    if (theirs && theirs.st !== "carried") return { x: theirs.x, z: theirs.z };
    return null;
  }
  if (s.mode === "tesoro" && s.egg && !s.egg.by) return { x: s.egg.x, z: s.egg.z, rush: true };
  return null;
}

/** What the mode asks of you right now, in a few words (or ""). */
function objectiveHint(s: FuegoState, myId: string, screen: boolean): string {
  if (screen || s.status !== "playing" || !(myId in s.roster)) return "";
  if (s.mode === "infectados") return s.roster[myId] === INFECTED ? "Estás infectado: atrapa a los sobrevivientes" : "";
  if (s.mode === "tesoro" && s.egg?.by === myId) return "¡Tienes el huevo! Aguanta";
  if (s.mode === "bandera") {
    const side = s.roster[myId];
    if (side !== "red" && side !== "blue") return "";
    const rival: TeamId = side === "red" ? "blue" : "red";
    if (s.flags[rival]?.st === "carried" && s.flags[rival]?.by === myId) return s.flags[side]?.st === "base" ? "¡Tienes la bandera! Llévala a tu base" : "Tienes la bandera: recupera la tuya para capturar";
    if (s.flags[side]?.st === "carried") return "¡Se llevaron tu bandera!";
  }
  return "";
}

/** Unarmed in this mode: the infected, and the last step of escalada (the punch). */
function unarmedIn(s: FuegoState, id: string): boolean {
  return (s.mode === "infectados" && s.roster[id] === INFECTED) || (s.mode === "escalada" && ladderStep(s.kills[id] ?? 0) === "golpe");
}

/** Carries a flag or the egg (everyone sees them on the radar). */
function carrier(s: FuegoState, id: string): boolean {
  return s.egg?.by === id || Object.values(s.flags).some((f) => f?.st === "carried" && f.by === id);
}

/** "One kill from winning" for whoever is there, or "". */
function nearWin(s: FuegoState, myId: string, now: number): string {
  if (s.status !== "playing") return "";
  if (s.mode === "bandera") {
    const team = (["red", "blue"] as TeamId[]).find((t) => s.score[t] === FLAG_CAPS - 1);
    if (!team) return "";
    return s.roster[myId] === team ? "¡A una captura de ganar!" : `¡El ${teamInfo(team).label} está a una captura!`;
  }
  if (s.mode === "infectados") {
    const left = Object.keys(s.roster).filter((id) => s.roster[id] === SURVIVORS);
    return left.length === 1 ? (left[0] === myId ? "¡Eres el último sobreviviente!" : `¡Queda solo ${fighterName(s, left[0])}!`) : "";
  }
  if (s.mode === "tesoro") {
    const top = ranking(s)[0];
    if (!top || eggScore(s, top, now) < EGG_TARGET_MS - 10000) return "";
    return top === myId ? "¡Te faltan 10 segundos!" : `¡${fighterName(s, top)} está por ganar!`;
  }
  if (s.mode === "escalada") {
    const top = ranking(s).find((id) => ladderStep(s.kills[id] ?? 0) === "golpe");
    return top ? (top === myId ? "¡Último escalón: gana con un manotazo!" : `¡${fighterName(s, top)} va por el manotazo final!`) : "";
  }
  if (s.mode === "equipos") {
    const team = (["red", "blue"] as TeamId[]).find((t) => s.score[t] === s.goal - 1);
    if (!team) return "";
    return s.roster[myId] === team ? "¡A una baja de ganar!" : `¡El ${teamInfo(team).label} está a una baja!`;
  }
  const leader = ranking(s).find((id) => (s.kills[id] ?? 0) === s.goal - 1);
  if (!leader) return "";
  return leader === myId ? "¡A una baja de ganar!" : `¡${fighterName(s, leader)} está a una baja!`;
}

/**
 * The match on screen: the map in 3D, your soldier, the bots if you run them,
 * and the HUD. With `screen` (the big screen, `myId` ""), it runs everyone —
 * people from their phones' pads, bots with their brain — decides their hits,
 * and draws a first-person view per person (up to 4), split.
 */
export default function Battle({
  roomId,
  meta,
  state,
  myId,
  presence,
  presenceLoaded,
  screen = false,
}: {
  roomId: string;
  meta: FuegoMeta;
  state: FuegoState;
  myId: string;
  presence: PresenceMap;
  presenceLoaded: boolean;
  screen?: boolean;
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
  const [views, setViews] = useState<ViewHud[]>([]);
  const [marks, setMarks] = useState<Record<string, { n: number; head: boolean; kill: boolean }>>({});
  const [clock, setClock] = useState(0);
  const [hit, setHit] = useState<{ n: number; head: boolean; kill: boolean }>({ n: 0, head: false, kill: false });
  const [hurtDirs, setHurtDirs] = useState<{ a: number; id: number; shield: boolean }[]>([]);
  const [shieldBroke, setShieldBroke] = useState(0);
  const [paintHits, setPaintHits] = useState<{ id: number; x: number; y: number; size: number; rot: number; color: string }[]>([]);
  // The big screen may be a TV: Modo TV draws it lighter.
  const tvMode = useTvMode();
  const tv = screen && tvMode;
  const [quality, toggleQuality] = useQuality(QUALITY_KEY, tv);
  const [toast, setToast] = useState<Toast | null>(null);
  const [aimToggle, setAimToggle] = useState(false);
  // Touch layout, sensitivity and options (remembered per device), and the editor open or not.
  const [touch, setTouch] = useState<TouchSettings>(() => (typeof window === "undefined" ? DEFAULT_TOUCH : loadTouch()));
  const touchRef = useRef(touch);
  const [editing, setEditing] = useState(false);
  const changeTouch = (t: TouchSettings) => {
    setTouch(t);
    saveTouch(t);
  };
  useEffect(() => {
    touchRef.current = touch;
  }, [touch]);
  const aimToggleRef = useRef(false);
  const [board, setBoard] = useState(false);
  const fine = useFinePointer();
  const myAliveNow = !!hud?.alive;
  const canFight = state.status === "playing" && myAliveNow && myId in state.roster;
  const locked = useDesktopControls(controlsRef, canvasRef, fine && !screen, canFight);

  useWakeLock();
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
    const scene = new FuegoScene(canvas, mapId, { quality, tv });
    const world = worldOf(mapId);
    const graph = navGraph(mapId);
    const map = MAPS[mapId];
    const audio = audioRef.current;
    let poses: Record<string, FuegoPose> = {};
    let projIn: Record<string, FuegoProjectile> = {};
    let boomsIn: Record<string, FuegoBoom> = {};
    let pads: Record<string, FuegoPad> = {};
    const unsubPoses = screen ? () => {} : subscribePoses(roomId, (p) => (poses = p));
    const unsubProj = subscribeProjectiles(roomId, (p) => (projIn = p));
    const unsubBooms = subscribeBooms(roomId, (b) => (boomsIn = b));
    const unsubPads = screen ? subscribePads(roomId, (p) => (pads = p)) : () => {};

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
    let myDeath: Death | null = null;
    let myLastKiller = "";
    const look = { yaw: 0, pitch: 0 };
    let sinceShot = 10;
    let meleeT = 0;
    let lastPose = 0;
    let lastLive = 0;
    let hudAt = 0;
    let lastHudKey = "";
    let lastViewsKey = "";
    let lastStride = 0;
    // Auto-fire with a semi-automatic weapon: the trigger pulses so it keeps shooting.
    let autoPulse = false;
    let myRoll = 0;
    let lastCount = -1;
    let shieldWas = MAX_SHIELD;
    let alarmAt = 0;
    let myRecent: number[] = [];
    let whizzAt = 0;
    let land = 0;
    let hurtId = 0;
    let toastId = 0;
    const ghosts = new Map<string, Ghost>();
    const runs = new Map<string, Run>();
    const myProj: LocalProjectile[] = [];
    const remoteProj = new Map<string, { p: Projectile; age: number }>();
    const seenBooms = new Set<string>(Object.keys(boomsIn));
    const seenHits = new Map<string, number>();
    const seenFeed = new Set<string>(Object.keys(stateRef.current.feed));
    let anyKill = Object.values(stateRef.current.kills).some((k) => k > 0);
    const liveSent = new Map<string, string>();
    const called = new Map<string, number>();
    let lastItems: unknown = null;
    let lastInfo = "";
    const mySend = !screen && myId in stateRef.current.roster ? openPose(roomId, myId, true) : null;
    for (const [id, h] of Object.entries(stateRef.current.hits)) seenHits.set(id, h.n);
    const rand = Math.random;
    // Chaos: what the event on now changes, which event that was, and the sky's balloons already burst.
    let mods: ChaosMods = NO_MODS;
    let chaosN = -1;
    const seenRain = new Set<string>();
    // Escalada: each one's step, to tell them when it changes.
    const steps = new Map<string, string>();

    const once = (name: string, fn: () => unknown, every = 1200) => {
      const now = performance.now();
      if (now - (called.get(name) ?? -Infinity) < every) return;
      called.set(name, now);
      Promise.resolve(fn()).catch(console.error);
    };

    const newRun = (sol: Soldier, remote: PadSeen | undefined, dead: boolean, send: ReturnType<typeof openPose>): Run => ({
      s: sol,
      a: new Arsenal(),
      mind: newMind(),
      send,
      dead,
      end: [0, 0, 0],
      m: 0,
      g: 0,
      remote,
      aiming: false,
      sinceShot: 10,
      meleeT: 0,
      land: 0,
      deathAt: 0,
      deathSpot: { x: sol.x, y: sol.y, z: sol.z, yaw: sol.yaw },
      death: null,
      lastKiller: "",
      recent: [],
      hurtAt: 0,
      hurtShield: false,
      toast: null,
      near: "",
      nearId: "",
      wantPick: false,
      prevYaw: sol.yaw,
      prevPitch: 0,
      roll: 0,
    });

    /** Position of a fighter as this client sees it, or null if unknown (left, no pose yet). */
    const posOf = (id: string): (Target & { yaw: number; pitch: number; speed: number }) | null => {
      if (id === myId) return me && !myDead ? { id, x: me.x, y: me.y, z: me.z, yaw: look.yaw, pitch: look.pitch, speed: me.speed } : null;
      const run = runs.get(id);
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

    /** Is the crosshair of someone at (x, y, z) looking along yaw/pitch over an enemy? (Touch aim help.) */
    const overEnemy = (s: FuegoState, id: string, sol: Soldier, yaw: number, pitch: number) => {
      const [dx, dy, dz] = spreadDir(yaw, pitch, [0, 0, 0]);
      return enemiesOf(s, id).some((e) => {
        const ex = e.x - sol.x;
        const ey = e.y + 1.2 - (sol.y + EYE);
        const ez = e.z - sol.z;
        const d = Math.hypot(ex, ey, ez);
        return d < 60 && (ex * dx + ey * dy + ez * dz) / d > Math.cos(0.08);
      });
    };

    /** Volume and pan of a sound at (x, z): for my ears, or (big screen) the nearest person's. */
    const where = (x: number, z: number): [number, number] => {
      if (screen) {
        let d = Infinity;
        for (const run of runs.values()) if (run.remote && !run.dead) d = Math.min(d, Math.hypot(x - run.s.x, z - run.s.z));
        return [1 / (1 + (d === Infinity ? 15 : d) / 10), 0];
      }
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

    const deathOf = (s: FuegoState, id: string, now: number): Death => {
      const killer = s.hits[id]?.from ?? "";
      const entry = Object.entries(s.feed)
        .sort((a, b) => Number(b[0].slice(1)) - Number(a[0].slice(1)))
        .find(([, e]) => e.v === id)?.[1];
      const alive = killer && killer !== id && isAlive(s, killer);
      return { killer, weapon: entry?.w ?? "", hp: alive ? (s.hp[killer] ?? 0) : -1, sh: alive ? Math.round(shieldOf(s, killer, now)) : 0 };
    };

    const poseFor = (sol: Soldier, a: Arsenal, end: [number, number, number], m: number, g: number, aim: boolean, h: number): FuegoPose => ({
      h,
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

    // Abilities: when each one's is ready again, until when its radar shows everyone, and how many times it was used.
    const abilityReady = new Map<string, number>();
    const radarUntil = new Map<string, number>();
    const abilityUses = new Map<string, number>();
    const readiness = (s: FuegoState, id: string) => {
      const left = (abilityReady.get(id) ?? 0) - performance.now();
      return left <= 0 ? 1 : Math.max(0, 1 - left / (ABILITY_INFO[kitOf(s, id)].cooldown * 1000));
    };

    /** Uses `id`'s ability if it's ready (mx/mz: where it's moving, for the dash). Returns whether it went. */
    const triggerAbility = (s: FuegoState, id: string, sol: Soldier, yaw: number, mx: number, mz: number): boolean => {
      const t0 = performance.now();
      if ((abilityReady.get(id) ?? 0) > t0) return false;
      const kit = kitOf(s, id);
      const color = fighterColor(s, id);
      if (kit === "impulso") {
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        let dx = fx * mz + Math.cos(yaw) * mx;
        let dz = fz * mz - Math.sin(yaw) * mx;
        if (Math.hypot(dx, dz) < 0.2) {
          dx = fx;
          dz = fz;
        }
        sol.dash(dx, dz, DASH_SPEED);
      } else if (kit === "salto") {
        if (!sol.onGround) return false;
        sol.superJump(SUPER_JUMP);
      } else if (kit === "teletransporte") {
        const from = { x: sol.x, y: sol.y, z: sol.z };
        if (!sol.blink(world, yaw, BLINK_DIST)) return false;
        scene.abilityFx(kit, from.x, from.y, from.z, color);
      } else if (kit === "radar") {
        radarUntil.set(id, t0 + RADAR_MS);
      } else {
        once(`bubble:${id}`, () => popBubble(roomId, key, id), 500);
      }
      scene.abilityFx(kit, sol.x, sol.y, sol.z, color);
      if (id === myId || runs.get(id)?.remote) audio?.pickup();
      abilityReady.set(id, t0 + ABILITY_INFO[kit].cooldown * 1000);
      abilityUses.set(id, (abilityUses.get(id) ?? 0) + 1);
      return true;
    };

    /** A hit marker for whoever fired: me on my phone, or that person's view on the big screen. */
    const markHit = (id: string, head: boolean, kill: boolean) => {
      if (id === myId && !screen) setHit((h) => ({ n: h.n + 1, head, kill }));
      else if (screen && runs.get(id)?.remote) setMarks((m) => ({ ...m, [id]: { n: (m[id]?.n ?? 0) + 1, head, kill } }));
    };

    /** Where a first-person shot leaves the gun (a bit to the right unless aiming). */
    const muzzleOfEye = (sol: Soldier, dx: number, dy: number, dz: number, aiming: boolean): [number, number, number] => {
      const rx = Math.cos(sol.yaw);
      const rz = -Math.sin(sol.yaw);
      const side = aiming ? 0 : 0.18;
      return [sol.x + dx * 0.7 + rx * side, sol.y + EYE - 0.16 + dy * 0.7, sol.z + dz * 0.7 + rz * side];
    };

    /** A soldier's weapon events: shots (decide hits), rockets/grenades (launch), melee. */
    const handleEvents = (s: FuegoState, id: string, sol: Soldier, a: Arsenal, events: ArsenalEvent[], mine: boolean): { end?: [number, number, number]; m?: boolean; g?: boolean } => {
      const out: { end?: [number, number, number]; m?: boolean; g?: boolean } = {};
      const run = runs.get(id);
      const person = mine || !!run?.remote;
      const eyeY = sol.y + EYE;
      const [vol, pan] = mine ? [1, 0] : where(sol.x, sol.z);
      const assist = mine ? (fine ? 0 : TOUCH_ASSIST) : run?.remote ? TOUCH_ASSIST : 0;
      for (const ev of events) {
        if (ev.type === "shot") {
          const targets = enemiesOf(s, id);
          const byTarget = new Map<string, DamageHit>();
          let first: [number, number, number] | null = null;
          let hitKind: "escudo" | "cuerpo" | "nada" = "nada";
          for (const off of ev.dirs) {
            const [dx, dy, dz] = spreadDir(sol.yaw, sol.pitch, off);
            const res = castBullet(world, { ox: sol.x, oy: eyeY, oz: sol.z, dx, dy, dz }, ev.weapon, targets, assist, mods.head);
            first ??= res.end;
            if (res.hit) {
              const prev = byTarget.get(res.hit.target);
              byTarget.set(res.hit.target, { target: res.hit.target, damage: (prev?.damage ?? 0) + res.hit.damage, head: !!prev?.head || res.hit.head });
              hitKind = shieldOf(s, res.hit.target, serverNow()) > 1 ? "escudo" : "cuerpo";
              if (hitKind === "escudo") scene.shieldHit(res.hit.target);
            }
            const from = mine
              ? muzzleOfEye(sol, dx, dy, dz, controlsRef.current.aim || aimToggleRef.current)
              : run?.remote
                ? muzzleOfEye(sol, dx, dy, dz, run.aiming)
                : (scene.muzzle(id) ?? [sol.x, eyeY - 0.2, sol.z]);
            scene.shot(mine ? null : id, from, res.end[0], res.end[1], res.end[2], ev.weapon, res.hit ? hitKind : "nada", res.normal, fighterColor(s, id));
            if (!mine && !res.hit) nearMiss(from, res.end);
          }
          out.end = first ?? out.end;
          audio?.shot(ev.weapon, vol, pan);
          if (mine) {
            sinceShot = 0;
            look.pitch = Math.min(1.3, look.pitch + WEAPONS[ev.weapon].kick);
          } else if (run) {
            run.sinceShot = 0;
            if (run.remote) kickLook(run.remote, WEAPONS[ev.weapon].kick);
          }
          const hits = [...byTarget.values()];
          if (hits.length) {
            if (person) {
              const head = hits.some((h) => h.head);
              if (mine) audio?.hitMarker(head, false);
              markHit(id, head, false);
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
            else if (run) run.sinceShot = 0;
          } else {
            if (mine) audio?.throwGrenade();
            out.g = true;
          }
        } else if (ev.type === "melee") {
          out.m = true;
          audio?.melee(vol, pan);
          if (mine) meleeT = 0.35;
          else if (run) run.meleeT = 0.35;
          const t = meleeTarget(world, { id, x: sol.x, y: sol.y, z: sol.z, yaw: sol.yaw }, enemiesOf(s, id));
          if (t) {
            if (mine) audio?.hitMarker(false, false);
            if (person) markHit(id, false, false);
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
        if (mine || runs.get(id)?.remote) audio?.pickup();
      }, 900);
    };

    /** Pickups under a soldier's feet: taken if they help, else the weapon in reach to offer. */
    const pickupsAt = (s: FuegoState, id: string, sol: Soldier, a: Arsenal, mine: boolean): { near: string; nearId: string } => {
      let near = "";
      let nearId = "";
      for (const [iid, it] of Object.entries(s.items)) {
        if (Math.hypot(it.x - sol.x, it.z - sol.z) > 1.3) continue;
        // The mode decides the weapon (escalada), or there's none (infected).
        if (isWeapon(it.kind) && (fixedWeapons(s.mode) || unarmedIn(s, id))) continue;
        if (autoPick(a, it.kind, s.hp[id] ?? MAX_HP)) tryPick(s, id, a, iid, mine);
        else if (isWeapon(it.kind) && !a.has(it.kind)) {
          near = PICKUP_LABEL[it.kind];
          nearId = iid;
        }
      }
      return { near, nearId };
    };

    /** A medal (or a plain kill) for the one who did it: my toast, or their view's on the big screen. */
    const celebrate = (id: string, title: string, sub: string) => {
      if (id === myId && !screen) setToast({ title, sub, id: toastId++ });
      const run = runs.get(id);
      if (run?.remote) run.toast = { title, sub, at: performance.now() };
    };

    /** What the HUD shows for one soldier (mine, or a person's view on the big screen). */
    const hudFor = (
      s: FuegoState,
      id: string,
      sol: Soldier | null,
      a: Arsenal,
      yaw: number,
      pitch: number,
      dead: boolean,
      aiming: boolean,
      death: Death | null,
      near: string,
      watching: string,
      boardHeld: boolean,
      now: number
    ): Hud => {
      const radar: Hud["radar"] = [];
      if (sol && !dead) {
        for (const o of Object.keys(s.roster)) {
          if (o === id || !isAlive(s, o)) continue;
          const p = posOf(o);
          if (!p) continue;
          const ally = allies(s, id, o);
          const g = ghosts.get(o);
          const loud = (!ally && (radarUntil.get(id) ?? 0) > performance.now()) || carrier(s, o) || p.speed > 3.5 || (g && performance.now() - g.firedAt < 1500) || (runs.get(o)?.a.cool ?? 0) > 0 || (o === myId && sinceShot < 1.5);
          if (!ally && !loud) continue;
          const dx = p.x - sol.x;
          const dz = p.z - sol.z;
          if (Math.hypot(dx, dz) > RADAR_RANGE) continue;
          // Rotated so up is where they look.
          const c2 = Math.cos(yaw);
          const s2 = Math.sin(yaw);
          radar.push({ x: (dx * c2 - dz * s2) / RADAR_RANGE, y: (dx * s2 + dz * c2) / RADAR_RANGE, ally });
        }
      }
      const other = a.slots.length > 1 ? a.slots[1 - a.current].id : null;
      const zoomed = aiming && a.weapon === "francotirador";
      let scope = { range: 0, zoomX: 1, onTarget: false };
      if (sol && !dead && aiming) {
        const [dx, dy, dz] = spreadDir(yaw, pitch, [0, 0, 0]);
        const res = castBullet(world, { ox: sol.x, oy: sol.y + EYE, oz: sol.z, dx, dy, dz }, a.weapon, enemiesOf(s, id));
        scope = { range: Math.round(res.dist), zoomX: Math.round((BASE_FOV / WEAPONS[a.weapon].zoom) * 10) / 10, onTarget: !!res.hit };
      }
      const killer = death?.killer ?? "";
      return {
        hp: s.hp[id] ?? 0,
        shield: Math.round(shieldOf(s, id, now)),
        weapon: a.weapon,
        mag: a.slot.mag,
        reserve: a.slot.reserve,
        other,
        grenades: a.grenades,
        alive: !!sol && !dead,
        guard: !dead && guarded(s, id, now),
        respawnIn: dead && s.deadAt[id] ? Math.max(0, Math.ceil((s.deadAt[id] + RESPAWN_MS - now) / 1000)) : 0,
        killer: killer && killer !== id ? fighterName(s, killer) : killer === id ? "tú mismo" : "",
        killedWith: death?.weapon ? (WEAPON_WORD[death.weapon] ?? death.weapon) : "",
        killerHp: death && killer !== id ? death.hp : -1,
        near,
        zoomed,
        aiming,
        reloading: a.reloading > 0,
        radar,
        watching,
        ...scope,
        board: boardHeld,
        ability: { kit: kitOf(s, id), ready: readiness(s, id) },
      };
    };

    const tick = (t: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const s = stateRef.current;
      const now = serverNow();
      const ids = Object.keys(s.roster);
      const c = controlsRef.current;
      const inRoster = !screen && myId in s.roster;

      // Chaos: the event on now (the same on every phone), and its weapon and ammo rules on everyone this client runs.
      const slot = s.status === "playing" ? chaosAt(s, now) : null;
      mods = chaosMods(slot?.id);
      if ((slot?.n ?? -1) !== chaosN) {
        if (slot) audio?.go();
        chaosN = slot?.n ?? -1;
      }
      const gear = (a: Arsenal, id: string) => {
        a.infinite = mods.infinite;
        if (s.mode === "escalada") {
          // Escalada: the weapon of your step (the punch is shown with a pistol put away).
          const step = ladderStep(s.kills[id] ?? 0);
          const want = step === "golpe" ? "pistola" : step;
          if (a.slots.length !== 1 || a.weapon !== want || a.forced) a.setOnly(want);
          const was = steps.get(id);
          if (was !== undefined && was !== step) celebrate(id, step === "golpe" ? "¡Último escalón!" : "¡Nueva arma!", step === "golpe" ? "Manotazo: una baja más y ganas" : `Ahora: ${WEAPONS[step].label}`);
          steps.set(id, step);
          return;
        }
        if (mods.weapon && !a.forced) a.force(mods.weapon);
        else if (!mods.weapon && a.forced) a.restore();
      };
      if (inRoster) gear(arms, myId);
      for (const [id, run] of runs) gear(run.a, id);
      /** Chaos and the infected's speed together. */
      const modsFor = (id: string): ChaosMods =>
        s.mode === "infectados" && s.roster[id] === INFECTED ? { ...mods, speed: mods.speed * INFECTED_SPEED, jump: mods.jump * INFECTED_JUMP } : mods;

      // My life: died, waiting, back.
      const stateSaysAlive = isAlive(s, myId);
      if (inRoster) {
        if (!myDead && !stateSaysAlive) {
          myDead = true;
          deathAt = performance.now();
          myDeath = deathOf(s, myId, now);
          if (!fine) releaseControls(c);
          myLastKiller = myDeath.killer !== myId ? myDeath.killer : "";
          if (me) deathSpot = { x: me.x, y: me.y, z: me.z, yaw: look.yaw };
          if (s.mode === "bandera" || s.mode === "tesoro") once("drop:me", () => placeDropped(roomId, key, myId, deathSpot.x, deathSpot.z), 500);
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
          // Back with nothing held (a finger left on the stick when dying must not keep walking).
          if (!fine) releaseControls(c);
          myDeath = null;
          shieldWas = MAX_SHIELD;
          setAimToggle(false);
        }
      }

      // Who runs what: the big screen runs everyone; else the connected person with the lowest id runs the bots.
      const { presence: pres, presenceLoaded: loaded } = presenceRef.current;
      const people = Object.keys(pres).filter((id) => id in s.players).sort();
      const host = s.status === "playing" && (screen || (loaded && people[0] === myId));
      if (host) {
        for (const id of screen ? ids : ids.filter(isBot)) {
          if (runs.has(id)) continue;
          const p = poses[id];
          const sp = spawnFor(s, id);
          const sol = p && p.k === key ? new Soldier(p.x, p.z, p.yw, world) : new Soldier(sp.x, sp.z, sp.yaw, world);
          const remote = screen && !isBot(id) ? newPadSeen(pads[id] ?? NO_PAD, sol.yaw) : undefined;
          runs.set(id, newRun(sol, remote, !isAlive(s, id), screen ? NO_SEND : openPose(roomId, id, false)));
        }
      } else if (runs.size) {
        for (const run of runs.values()) run.send.close();
        runs.clear();
      }
      for (const [id, run] of runs) {
        const alive = isAlive(s, id);
        if (!run.dead && !alive) {
          run.dead = true;
          run.deathAt = performance.now();
          run.deathSpot = { x: run.s.x, y: run.s.y, z: run.s.z, yaw: run.s.yaw };
          run.death = deathOf(s, id, now);
          run.lastKiller = run.death.killer !== id ? run.death.killer : "";
          run.aiming = false;
          if (s.mode === "bandera" || s.mode === "tesoro") once(`drop:${id}`, () => placeDropped(roomId, key, id, run.deathSpot.x, run.deathSpot.z), 500);
          if (run.remote) audio?.death();
        }
        if (run.dead && !alive && s.status === "playing" && now >= (s.deadAt[id] ?? 0) + RESPAWN_MS) once(`respawn:${id}`, () => respawn(roomId, key, id), 800);
        if (run.dead && alive) {
          const sp = spawnFor(s, id);
          run.s = new Soldier(sp.x, sp.z, sp.yaw, world);
          run.a = new Arsenal();
          run.mind = newMind();
          run.dead = false;
          run.death = null;
          run.prevYaw = sp.yaw;
          run.prevPitch = 0;
          if (run.remote) resetLook(run.remote, sp.yaw);
        }
      }

      // Look around (touch looks slower over an enemy: a little aim help).
      let sens = fine ? MOUSE_LOOK : TOUCH_LOOK * touchRef.current.sens;
      const prevYaw = look.yaw;
      const prevPitch = look.pitch;
      const aiming = s.status === "playing" && !myDead && (fine ? c.aim : aimToggleRef.current);
      const zoomFov = aiming ? WEAPONS[arms.weapon].zoom : BASE_FOV;
      // Zoomed in, the view turns slower; on touch only a little slower, or the scope can't be aimed.
      sens *= fine ? zoomFov / BASE_FOV : Math.sqrt(zoomFov / BASE_FOV) * (aiming ? touchRef.current.aimSens : 1);
      // On touch: the crosshair over a rival slows the view (aim help) and, if chosen, shoots by itself.
      const overTarget = !fine && !!me && !myDead && overEnemy(s, myId, me, look.yaw, look.pitch);
      if (overTarget && !aiming) sens *= 0.55;
      look.yaw -= c.lookX * sens;
      look.pitch = Math.max(-1.35, Math.min(1.35, look.pitch - c.lookY * sens));
      c.lookX = 0;
      c.lookY = 0;

      // Hits taken: my direction arrows, flash and sounds; on the big screen, a flash on that person's view.
      for (const [id, h] of Object.entries(s.hits)) {
        const seen = seenHits.get(id) ?? 0;
        if (h.n <= seen) continue;
        seenHits.set(id, h.n);
        const onShield = shieldOf(s, id, now) > 1;
        scene.hurt(id, onShield);
        if (id === myId && me && !screen) {
          const a = Math.atan2(-(h.x - me.x), -(h.z - me.z)) - look.yaw;
          setHurtDirs((list) => [...list.slice(-3), { a, id: hurtId++, shield: onShield }]);
          // Their paint lands on your screen (on your side they came from).
          const side = Math.sin(a) < 0 ? 1 : -1;
          setPaintHits((list) => [
            ...list.slice(-5),
            { id: hurtId++, x: 50 + side * (18 + Math.random() * 26), y: 25 + Math.random() * 50, size: onShield ? 90 : 140 + Math.random() * 80, rot: Math.random() * 360, color: fighterColor(s, h.from) },
          ]);
          audio?.hurt(onShield);
          scene.jolt(0.25);
        }
        const run = runs.get(id);
        if (run?.remote) {
          run.hurtAt = performance.now();
          run.hurtShield = onShield;
        }
      }

      // Kill feed: chimes, medals ("¡Doble baja!", "¡Venganza!"…) for whoever did it.
      for (const [fid, e] of Object.entries(s.feed).sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1))) as [string, FeedEntry][]) {
        if (seenFeed.has(fid)) continue;
        seenFeed.add(fid);
        if (e.k === e.v) continue;
        scene.cheer(e.k);
        const firstBlood = !anyKill;
        anyKill = true;
        const tNow = performance.now();
        const run = runs.get(e.k);
        let recent = 0;
        let lastKiller = "";
        if (e.k === myId && !screen) {
          myRecent = [...myRecent.filter((k2) => tNow - k2 < 4000), tNow];
          recent = myRecent.length;
          lastKiller = myLastKiller;
          if (e.v === myLastKiller) myLastKiller = "";
          audio?.hitMarker(e.h, true);
          markHit(myId, e.h, true);
        } else if (run?.remote) {
          run.recent = [...run.recent.filter((k2) => tNow - k2 < 4000), tNow];
          recent = run.recent.length;
          lastKiller = run.lastKiller;
          if (e.v === run.lastKiller) run.lastKiller = "";
          markHit(e.k, e.h, true);
        } else continue;
        const medals = medalsFor(e, recent, lastKiller, firstBlood);
        celebrate(e.k, medals.slice(0, 2).join(" · ") || "Baja", `Eliminaste a ${fighterName(s, e.v)}`);
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
        if (c.ability) {
          c.ability = false;
          if (me && !myDead && inRoster) triggerAbility(s, myId, me, look.yaw, c.mx, c.mz);
        }
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          const solids = (self: string) =>
            everyone(s)
              .filter((o) => o.id !== self)
              .map((o) => ({ x: o.x, y: o.y, z: o.z }));
          if (me && !myDead && inRoster) {
            const wasAir = !me.onGround;
            me.step({ mx: c.mx, mz: c.mz, yaw: look.yaw, pitch: look.pitch, jump: c.jump, aiming, mods: modsFor(myId) }, world, STEP, solids(myId));
            if (wasAir && me.landed > 0) {
              scene.jolt(Math.min(0.5, me.landed / 25));
              land = Math.min(1, me.landed / 12);
              me.landed = 0;
            }
            const bare = unarmedIn(s, myId);
            autoPulse = !autoPulse;
            const auto =
              touchRef.current.autoFire && overTarget && !bare && arms.weapon !== "francotirador" && arms.weapon !== "lanzacohetes" && (WEAPONS[arms.weapon].auto || autoPulse);
            const evs = arms.step({ fire: (c.fire || auto) && !bare, aim: aiming && !bare, reload: c.reload, swap: c.swap && !bare, grenade: c.grenade && !bare, melee: c.melee || (bare && c.fire) }, STEP);
            const r = handleEvents(s, myId, me, arms, evs, true);
            if (r.end) myEnd = r.end;
            if (r.m) myMelee++;
            if (r.g) myGrenades++;
          }
          if (screen) autoPulse = !autoPulse;
          for (const [id, run] of runs) {
            if (run.dead || !isAlive(s, id)) continue;
            let evs: ArsenalEvent[];
            let pick: string | null = null;
            if (run.remote) {
              // A person on the big screen, from their phone.
              const zoom = run.aiming ? WEAPONS[run.a.weapon].zoom : BASE_FOV;
              let k = Math.sqrt(zoom / BASE_FOV);
              if (!run.aiming && overEnemy(s, id, run.s, run.s.yaw, run.s.pitch)) k *= 0.55;
              const pad = pads[id] ?? NO_PAD;
              const inp = padInput(run.remote, pad, STEP, k, run.s.onGround);
              if (inp.ability) triggerAbility(s, id, run.s, run.s.yaw, inp.move.mx, inp.move.mz);
              run.aiming = inp.aim;
              const wasAir = !run.s.onGround;
              run.s.step({ ...inp.move, aiming: run.aiming, mods: modsFor(id) }, world, STEP, solids(id));
              if (wasAir && run.s.landed > 0) {
                run.land = Math.min(1, run.s.landed / 12);
                run.s.landed = 0;
              }
              const bare = unarmedIn(s, id);
              // Auto-fire chosen on the phone: the screen knows when the crosshair is on a rival.
              const auto =
                !!pad.af &&
                !bare &&
                run.a.weapon !== "francotirador" &&
                run.a.weapon !== "lanzacohetes" &&
                (WEAPONS[run.a.weapon].auto || autoPulse) &&
                overEnemy(s, id, run.s, run.s.yaw, run.s.pitch);
              evs = run.a.step(
                bare ? { fire: false, aim: false, reload: false, swap: false, grenade: false, melee: inp.arms.melee || inp.arms.fire } : { ...inp.arms, fire: inp.arms.fire || auto, aim: run.aiming },
                STEP
              );
              if (inp.pick) run.wantPick = true;
            } else {
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
                goal: botGoal(s, id),
                meleeOnly: unarmedIn(s, id),
              };
              const out = botThink(world, graph, run.s, run.a, run.mind, view, s.level, STEP, rand);
              // Bots use their ability now and then, when it makes sense.
              const kit = kitOf(s, id);
              const fighting = !!run.mind.target;
              const wants =
                kit === "burbuja"
                  ? fighting && shieldOf(s, id, now) < 25
                  : kit === "radar"
                    ? !fighting && rand() < STEP * 0.1
                    : kit === "impulso"
                      ? fighting && rand() < STEP * 0.35
                      : kit === "salto"
                        ? run.mind.stuckT > 0.3 || (fighting && rand() < STEP * 0.12)
                        : !fighting && !!view.goal && rand() < STEP * 0.2;
              if (wants) triggerAbility(s, id, run.s, out.move.yaw, out.move.mx, out.move.mz);
              run.s.step({ ...out.move, mods: modsFor(id) }, world, STEP, solids(id));
              evs = run.a.step(out.arms, STEP, rand);
              pick = out.pick ?? null;
            }
            const r = handleEvents(s, id, run.s, run.a, evs, false);
            if (r.end) run.end = r.end;
            if (r.m) run.m++;
            if (r.g) run.g++;
            if (!run.remote) {
              // Bots take what's under their feet when it helps them.
              for (const [iid, it] of Object.entries(s.items)) {
                if (Math.hypot(it.x - run.s.x, it.z - run.s.z) > 1.3) continue;
                if (isWeapon(it.kind) && (fixedWeapons(s.mode) || unarmedIn(s, id))) continue;
                if (autoPick(run.a, it.kind, s.hp[id] ?? MAX_HP) || (pick === iid && isWeapon(it.kind) && !run.a.has(it.kind))) tryPick(s, id, run.a, iid, false);
              }
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
      for (const run of runs.values()) {
        run.sinceShot += dt;
        run.meleeT = Math.max(0, run.meleeT - dt);
        run.land = Math.max(0, run.land - dt * 4);
      }

      // My rockets and grenades (and the ones of those I run): fly them, explode, hurt.
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
          if (hits.some((h) => h.target !== pr.owner)) {
            if (pr.owner === myId && !screen) audio?.hitMarker(false, false);
            markHit(pr.owner, false, false);
          }
        }
        // Mine are shown right here: skip them when they come back from the database.
        seenBooms.add(publishBoom(roomId, { k: key, o: pr.owner, kind: pr.p.kind, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, z: Math.round(z * 10) / 10, t: Math.round(serverNow()) }));
        const [vol, pan] = where(x, z);
        const near = screen ? 999 : Math.hypot(x - (me?.x ?? 999), z - (me?.z ?? 999));
        scene.explosion(x, y, z, pr.p.kind === "cohete", near, fighterColor(s, pr.owner));
        audio?.explosion(vol, pan);
      }
      // Everyone else's: flown the same way from their launch, drawn.
      const draws: Record<string, { kind: Projectile["kind"]; x: number; y: number; z: number; vx: number; vy: number; vz: number; age?: number; color?: string }> = {};
      for (const pr of myProj) draws[pr.id] = { ...pr.p, age: pr.age, color: fighterColor(s, pr.owner) };
      for (const [pid, raw] of Object.entries(projIn)) {
        if (raw.k !== key || raw.o === myId || runs.has(raw.o)) continue;
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
        draws[pid] = { ...r.p, age: r.age, color: fighterColor(s, raw.o) };
      }
      for (const pid of remoteProj.keys()) if (!(pid in projIn)) remoteProj.delete(pid);
      // Chaos "lluvia": balloons falling from the sky; each phone hurts only the soldiers it runs.
      if (slot?.id === "lluvia" && playing) {
        for (const d of rainDrops(slot, s.seed, map, now, 1000)) {
          const ground = topAt(world, d.x, d.z);
          const color = RAIN_COLORS[Math.abs(keyHash(d.key)) % RAIN_COLORS.length];
          if (now < d.t) {
            draws[`rain${d.key}`] = { kind: "granada", x: d.x, y: ground + 0.2 + ((d.t - now) / 1000) * (RAIN_HEIGHT / RAIN_FALL_S), z: d.z, vx: 0, vy: -1, vz: 0, age: 2, color };
            continue;
          }
          if (seenRain.has(d.key)) continue;
          seenRain.add(d.key);
          const [vol, pan] = where(d.x, d.z);
          scene.explosion(d.x, ground + 0.2, d.z, false, screen ? 999 : Math.hypot(d.x - (me?.x ?? 999), d.z - (me?.z ?? 999)), color);
          audio?.explosion(vol * 0.7, pan);
          const mine: Target[] = [];
          if (me && !myDead && inRoster) mine.push({ id: myId, x: me.x, y: me.y, z: me.z });
          for (const [id, run] of runs) if (!run.dead && isAlive(s, id)) mine.push({ id, x: run.s.x, y: run.s.y, z: run.s.z });
          const hits = blast(world, "granada", d.x, ground + 0.2, d.z, mine).map((h) => ({ ...h, damage: h.damage * RAIN_DAMAGE }));
          if (hits.length) damage(roomId, key, SKY, { x: d.x, z: d.z }, "granada", hits).catch(console.error);
        }
      }
      scene.setProjectiles(draws);
      // Their explosions.
      for (const [bid, b] of Object.entries(boomsIn)) {
        if (seenBooms.has(bid)) continue;
        seenBooms.add(bid);
        if (b.k !== key || now - b.t > 2000) continue;
        const [vol, pan] = where(b.x, b.z);
        const near = screen ? 999 : Math.hypot(b.x - (me?.x ?? 999), b.z - (me?.z ?? 999));
        scene.explosion(b.x, b.y, b.z, b.kind === "cohete", near, b.o ? fighterColor(s, b.o) : undefined);
        audio?.explosion(vol, pan);
      }

      // Pickups in reach: mine, and the people on the big screen.
      let near = "";
      let nearId = "";
      if (me && !myDead && playing && inRoster) ({ near, nearId } = pickupsAt(s, myId, me, arms, true));
      if (c.pick) {
        c.pick = false;
        if (nearId) tryPick(s, myId, arms, nearId, true);
      }
      for (const [id, run] of runs) {
        if (!run.remote) continue;
        const found = !run.dead && playing ? pickupsAt(s, id, run.s, run.a, false) : { near: "", nearId: "" };
        run.near = found.near;
        run.nearId = found.nearId;
        if (run.wantPick) {
          run.wantPick = false;
          if (run.nearId) tryPick(s, id, run.a, run.nearId, false);
        }
      }

      // Everyone else, from their poses.
      const ease = 1 - Math.exp(-dt * 16);
      for (const id of ids) {
        if (id === myId || runs.has(id)) continue;
        const p = poses[id];
        let g = ghosts.get(id);
        if (!p || p.k !== key) {
          if (g) g.pose = null;
          continue;
        }
        if (!g) {
          g = { x: p.x, y: p.y, z: p.z, yaw: p.yw, pitch: p.pt, vx: 0, vz: 0, lastT: 0, pose: null, f: p.f, m: p.m, firedAt: 0, h: p.h ?? 0 };
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
            scene.shot(id, from, p.sx, p.sy, p.sz, weapon, normal ? "nada" : null, normal, fighterColor(s, id));
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
        if ((p.h ?? 0) > g.h) {
          g.h = p.h ?? 0;
          scene.abilityFx(kitOf(s, id), p.x, p.y, p.z, fighterColor(s, id));
        }
      }

      // Calls anyone may make.
      if (s.status === "playing" && now > s.endsAt) once("time", () => timeUp(roomId, key));
      if (playing && Object.values(s.respawns).some((r) => r.at <= now)) once("items", () => respawnItems(roomId, key));

      // My shield: alarm when empty, a sound when it starts filling.
      if (me && !myDead && inRoster) {
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

      // Publish my pose and my bots' (the big screen publishes none: nobody else draws them).
      if (t - lastPose >= POSE_MS) {
        lastPose = t;
        if (me && mySend && !myDead) mySend.send(poseFor(me, arms, myEnd, myMelee, myGrenades, aiming, abilityUses.get(myId) ?? 0));
        for (const [id, run] of runs) if (!run.dead) run.send.send(poseFor(run.s, run.a, run.end, run.m, run.g, false, abilityUses.get(id) ?? 0));
      }
      // Big screen: each phone learns its ammo, weapons and what it can pick up.
      if (screen && t - lastLive >= LIVE_MS) {
        lastLive = t;
        const patch: Record<string, FuegoLive> = {};
        for (const [id, run] of runs) {
          if (!run.remote) continue;
          const other = run.a.slots.length > 1 ? run.a.slots[1 - run.a.current].id : null;
          const live: FuegoLive = {
            w: WEAPON_IDS.indexOf(run.a.weapon),
            o: other ? WEAPON_IDS.indexOf(other) : -1,
            m: run.a.slot.mag,
            r: run.a.slot.reserve,
            g: run.a.grenades,
            n: run.near,
            l: run.a.reloading > 0 ? 1 : 0,
            z: run.aiming ? 1 : 0,
            c: Math.round(readiness(s, id) * 100),
          };
          const k = JSON.stringify(live);
          if (liveSent.get(id) !== k) {
            liveSent.set(id, k);
            patch[id] = live;
          }
        }
        publishLive(roomId, patch);
      }

      // Draw.
      const info = ids
        .filter((id) => id !== myId)
        .map((id) => [id, { color: fighterColor(s, id), label: fighterName(s, id), ally: !screen && allies(s, myId, id) }] as const);
      const infoKey = JSON.stringify(info);
      if (infoKey !== lastInfo) {
        lastInfo = infoKey;
        scene.setSoldiers(Object.fromEntries(info));
      }
      for (const id of ids) {
        if (id === myId) continue;
        const pos = posOf(id);
        const alive = isAlive(s, id);
        const run = runs.get(id);
        const g = ghosts.get(id);
        const deadFor = alive ? 0 : Math.max(0, (now - (s.deadAt[id] ?? now)) / 1000);
        if (pos) {
          const weapon = run ? run.a.weapon : (WEAPON_IDS[g?.pose?.w ?? 0] ?? "rifle");
          // Chaos "fantasmas": only the eyes show, unless it just fired.
          const fired = run ? run.sinceShot < 1.2 : g ? performance.now() - g.firedAt < 1200 : false;
          scene.setSoldier(id, {
            x: pos.x,
            y: pos.y,
            z: pos.z,
            yaw: pos.yaw,
            pitch: pos.pitch,
            weapon,
            speed: pos.speed,
            alive,
            deadFor,
            guard: guarded(s, id, now),
            ghost: mods.ghosts && !fired && !carrier(s, id),
            eyes: mods.head,
            unarmed: unarmedIn(s, id),
          });
        } else if (!alive && (run || g)) {
          const x = run ? run.s.x : g!.x;
          const y = run ? run.s.y : g!.y;
          const z = run ? run.s.z : g!.z;
          scene.setSoldier(id, { x, y, z, yaw: run ? run.s.yaw : g!.yaw, pitch: 0, weapon: "rifle", speed: 0, alive: false, deadFor });
        } else {
          scene.setSoldier(id, null);
        }
      }
      // The mode's objectives, touched by the soldiers this client runs.
      if (playing && (s.mode === "bandera" || s.mode === "tesoro")) {
        const mine: { id: string; sol: Soldier }[] = [];
        if (me && !myDead && inRoster) mine.push({ id: myId, sol: me });
        for (const [id, run] of runs) if (!run.dead && isAlive(s, id)) mine.push({ id, sol: run.s });
        for (const { id, sol } of mine) {
          const near = (x: number, z: number, r: number) => Math.hypot(x - sol.x, z - sol.z) < r;
          if (s.mode === "bandera") {
            const side = s.roster[id];
            if (side !== "red" && side !== "blue") continue;
            for (const team of ["red", "blue"] as TeamId[]) {
              const f = s.flags[team];
              if (!f || f.st === "carried" || !near(f.x, f.z, FLAG_REACH)) continue;
              if (team !== side || f.st === "dropped") once(`flag:${id}:${team}`, () => touchFlag(roomId, key, id, team), 700);
            }
            const rival: TeamId = side === "red" ? "blue" : "red";
            const home = flagBase(map, side);
            if (s.flags[rival]?.st === "carried" && s.flags[rival]?.by === id && s.flags[side]?.st === "base" && near(home.x, home.z, FLAG_REACH + 0.6)) {
              once(`cap:${id}`, () => captureFlag(roomId, key, id), 900);
            }
          } else if (s.egg) {
            if (!s.egg.by && near(s.egg.x, s.egg.z, EGG_REACH)) once(`egg:${id}`, () => takeEgg(roomId, key, id), 700);
            if (s.egg.by === id && eggScore(s, id, now) >= EGG_TARGET_MS) once(`win:${id}`, () => claimEgg(roomId, key, id), 900);
          }
        }
        once("tidy", () => tidyObjectives(roomId, key), 2000);
      }
      const objectives: ObjectivesDraw = { flags: [], egg: null };
      if (s.mode === "bandera") {
        for (const team of ["red", "blue"] as TeamId[]) {
          const f = s.flags[team];
          if (!f) continue;
          const b = flagBase(map, team);
          const base = { x: b.x, y: topAt(world, b.x, b.z), z: b.z };
          const holder = f.st === "carried" ? (f.by === myId && me && !myDead ? { x: me.x, y: me.y, z: me.z } : posOf(f.by)) : null;
          if (holder) objectives.flags.push({ team, x: holder.x, y: holder.y + 1.5, z: holder.z + 0.35, carried: true, base });
          else objectives.flags.push({ team, x: f.x, y: topAt(world, f.x, f.z), z: f.z, carried: false, base });
        }
      } else if (s.egg) {
        const holder = s.egg.by ? posOf(s.egg.by) : null;
        objectives.egg = holder ? { x: holder.x, y: holder.y + 1.75, z: holder.z, held: true } : { x: s.egg.x, y: topAt(world, s.egg.x, s.egg.z), z: s.egg.z, held: false };
        // My own egg isn't drawn on my head (I can't see it).
        if (s.egg.by === myId && !screen) objectives.egg = null;
      }
      scene.setObjectives(objectives);

      if (s.items !== lastItems) {
        lastItems = s.items;
        scene.setPickups(s.items, mapId, map.items);
      }

      /** First-person eye with feel: a bob with the steps and a slight tilt into the strafe. */
    const feltEye = (sol: Soldier, yaw: number, pitch: number, fov: number, roll: number, aiming: boolean): Eye => {
      const amt = sol.onGround ? Math.min(1, sol.speed / 6) * (aiming ? 0.3 : 1) : 0;
      const bob = Math.abs(Math.sin((sol.stride / 2.3) * Math.PI)) * 0.04 * amt;
      return { x: sol.x, y: sol.y + EYE - bob, z: sol.z, yaw, pitch, roll, fov };
    };
    const tilt = (roll: number, mx: number) => roll + (-mx * 0.022 - roll) * (1 - Math.exp(-dt * 8));

    /** Looking at whoever killed them, from a bit above where they fell. */
      const deathCam = (spot: { x: number; y: number; z: number; yaw: number }, killer: string, since: number): Eye => {
        const k = killer ? posOf(killer) : null;
        const yaw = k ? Math.atan2(-(k.x - spot.x), -(k.z - spot.z)) : spot.yaw;
        const up = Math.min(1, since / 1200);
        return { x: spot.x - Math.sin(yaw) * -2 * up, y: spot.y + 1 + up * 3, z: spot.z - Math.cos(yaw) * -2 * up, yaw, pitch: -0.35 * up, fov: 70 };
      };
      /** Following someone from behind (spectators). */
      const spectate = (): { eye: Eye; watching: string } => {
        const alive = ids.filter((id) => isAlive(s, id) && posOf(id));
        const pick = alive[Math.floor(performance.now() / 8000) % Math.max(1, alive.length)];
        const p = pick ? posOf(pick) : null;
        if (!p) return { eye: { x: 0, y: 30, z: map.hz, yaw: 0, pitch: -0.5, fov: BASE_FOV }, watching: "" };
        return { eye: { x: p.x - Math.sin(p.yaw) * -3, y: p.y + 2.6, z: p.z - Math.cos(p.yaw) * -3, yaw: p.yaw, pitch: -0.25, fov: 70 }, watching: fighterName(s, pick) };
      };

      let watching = "";
      if (screen) {
        const viewIds = splitPeople(s).filter((id) => runs.get(id)?.remote);
        if (viewIds.length) {
          const rects = splitRects(viewIds.length);
          scene.renderViews(
            viewIds.map((id, i) => {
              const run = runs.get(id)!;
              const alive = !run.dead && isAlive(s, id);
              const lookDX = run.s.yaw - run.prevYaw;
              const lookDY = run.s.pitch - run.prevPitch;
              run.prevYaw = run.s.yaw;
              run.prevPitch = run.s.pitch;
              const zoomed = run.aiming && run.a.weapon === "francotirador";
              run.roll = tilt(run.roll, alive ? (pads[id]?.x ?? 0) : 0);
              const eye: Eye = alive
                ? feltEye(run.s, run.s.yaw, run.s.pitch, run.aiming ? WEAPONS[run.a.weapon].zoom : BASE_FOV, run.roll, run.aiming)
                : deathCam(run.deathSpot, run.death?.killer ?? "", performance.now() - run.deathAt);
              const vm: ViewModel | null =
                alive && playing
                  ? {
                      weapon: run.a.weapon,
                      sinceShot: run.sinceShot,
                      reload: run.a.reloading > 0 ? 1 - run.a.reloading / WEAPONS[run.a.weapon].reload : 0,
                      switching: run.a.switching,
                      melee: run.meleeT / 0.35,
                      aiming: run.aiming,
                      speed: run.s.speed,
                      lookDX,
                      lookDY,
                      land: run.land,
                      color: fighterColor(s, id),
                      hidden: zoomed,
                      unarmed: unarmedIn(s, id),
                    }
                  : alive
                    ? { weapon: run.a.weapon, sinceShot: 10, reload: 0, switching: 0, melee: 0, aiming: false, speed: 0, lookDX: 0, lookDY: 0, land: 0, color: fighterColor(s, id), hidden: false }
                    : null;
              return { id, eye, view: vm, rect: rects[i] };
            }),
            dt
          );
        } else {
          const sp = spectate();
          scene.render(sp.eye, null, dt);
        }
      } else {
        // Camera: my eyes; when dead, above where I fell looking at who did it; spectators follow someone.
        let eye: Eye;
        myRoll = tilt(myRoll, me && !myDead ? c.mx : 0);
        if (me && !myDead) eye = feltEye(me, look.yaw, look.pitch, zoomFov, myRoll, aiming);
        else if (inRoster) eye = deathCam(deathSpot, myDeath?.killer ?? "", performance.now() - deathAt);
        else {
          const sp = spectate();
          eye = sp.eye;
          watching = sp.watching;
        }
        const zoomed = aiming && arms.weapon === "francotirador";
        land = Math.max(0, land - dt * 4);
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
                color: fighterColor(s, myId),
                hidden: zoomed,
                unarmed: unarmedIn(s, myId),
              }
            : null,
          dt
        );
      }

      // HUD, ten times a second.
      if (t - hudAt > 100) {
        hudAt = t;
        if (screen) {
          const list: ViewHud[] = splitPeople(s)
            .map((id) => [id, runs.get(id)] as const)
            .filter((e): e is readonly [string, Run] => !!e[1]?.remote)
            .map(([id, run]) => {
              const since = performance.now() - run.hurtAt;
              const toastOn = run.toast && performance.now() - run.toast.at < TOAST_MS ? run.toast : null;
              return {
                ...hudFor(s, id, run.s, run.a, run.s.yaw, run.s.pitch, run.dead || !isAlive(s, id), run.aiming, run.death, run.near, "", false, now),
                id,
                toast: toastOn,
                hurt: since < 350 ? (run.hurtShield ? 1 : 2) : 0,
              };
            });
          const vk = JSON.stringify(list);
          if (vk !== lastViewsKey) {
            lastViewsKey = vk;
            setViews(list);
          }
        } else {
          const next = hudFor(s, myId, me, arms, look.yaw, look.pitch, myDead || !me, aiming, myDeath, near, watching, c.board, now);
          const hk = JSON.stringify(next);
          if (hk !== lastHudKey) {
            lastHudKey = hk;
            setHud(next);
          }
        }
        setClock(now);
      }
    };

    frame = requestAnimationFrame(tick);
    // Development only: hand yourself a weapon from the console, for testing (`__fuego.give("francotirador")`).
    const devWindow = window as unknown as { __fuego?: { give: (w: WeaponId) => void } };
    if (process.env.NODE_ENV !== "production" && !screen) devWindow.__fuego = { give: (w) => arms.take(w) };
    return () => {
      cancelAnimationFrame(frame);
      if (!screen) delete devWindow.__fuego;
      unsubPoses();
      unsubProj();
      unsubBooms();
      unsubPads();
      mySend?.close();
      for (const run of runs.values()) run.send.close();
      for (const pr of myProj) pr.down();
      scene.dispose();
    };
  }, [roomId, myId, gameNo, mapId, fine, quality, screen, tv]);

  // Messages fade.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!paintHits.length) return;
    const t = setTimeout(() => setPaintHits([]), 1900);
    return () => clearTimeout(t);
  }, [paintHits]);
  useEffect(() => {
    if (!hurtDirs.length) return;
    const t = setTimeout(() => setHurtDirs([]), 900);
    return () => clearTimeout(t);
  }, [hurtDirs]);

  const now = clock || serverNow();
  const counting = state.status === "playing" && now < state.startedAt;
  const count = Math.ceil((state.startedAt - now) / 1000);
  const left = state.endsAt - now;
  const inRoster = !screen && myId in state.roster;
  const showBoard = board || !!hud?.board;
  const feed = Object.entries(state.feed)
    .sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)))
    .slice(-5)
    .map(([, e]) => e)
    .filter((e) => now - e.t < 8000);
  const alert = nearWin(state, myId, now);
  const objective = objectiveHint(state, myId, screen);
  const chaosNow = state.status === "playing" && !counting ? chaosAt(state, now) : null;
  const chaosSoon = !chaosNow && state.status === "playing" && !counting ? nextChaos(state, now) : null;
  const chaosIn = chaosSoon ? chaosSoon.start - now : Infinity;
  const big = screen ? { zoom: 1.4 } : undefined;

  return (
    <div className="fixed inset-0 z-40 select-none overflow-hidden bg-slate-900" style={{ touchAction: "none" }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Big screen: each person's view with their own HUD. */}
      {screen &&
        state.status !== "waiting" &&
        views.map((v, i) => (
          <ViewOverlay key={v.id} v={v} rect={splitRects(views.length)[i]} state={state} mark={marks[v.id]} playing={state.status === "playing" && !counting} />
        ))}

      {hud?.zoomed && <Scope range={hud.range} zoomX={hud.zoomX} onTarget={hud.onTarget} unit="vmin" />}

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
      {paintHits.map((p) => (
        <PaintSplat key={p.id} x={p.x} y={p.y} size={p.size} rot={p.rot} color={p.color} />
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
          ability={{ label: ABILITY_INFO[hud.ability.kit].label, color: ABILITY_INFO[hud.ability.kit].color, ready: hud.ability.ready }}
          settings={touch}
          bare={unarmedIn(state, myId)}
          weapons={{
            label: WEAPONS[hud.weapon].label,
            mag: hud.mag,
            reserve: hud.reserve,
            other: hud.other ? WEAPONS[hud.other].label : null,
            grenades: hud.grenades,
            reloading: hud.reloading,
          }}
        />
      )}

      {editing && <ControlsEditor settings={touch} onChange={changeTouch} onClose={() => setEditing(false)} />}

      {/* Crosshair, hit marker and the weapon in reach. */}
      {inRoster && hud?.alive && state.status === "playing" && !hud.zoomed && <Crosshair weapon={hud.weapon} aiming={hud.aiming} />}
      {!screen && <HitMarker mark={hit} />}
      {inRoster && hud?.alive && fine && hud.near && state.status === "playing" && (
        <p className="pointer-events-none absolute left-1/2 top-[58%] z-20 -translate-x-1/2 rounded-lg bg-slate-950/70 px-3 py-1 text-sm text-white">
          <kbd className="mr-1.5 rounded bg-white px-1.5 font-bold text-slate-900">E</kbd>Agarrar {hud.near}
        </p>
      )}

      {/* Top: back, score and time, options. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-2.5">
        <div className="pointer-events-auto flex flex-col gap-1.5">
          <Link href="/" aria-label="Volver a Talo" className="w-fit rounded-xl bg-slate-950/60 p-2 backdrop-blur">
            <TaloMark className="h-5 w-5" />
          </Link>
          {inRoster && hud && <Radar points={hud.radar} />}
        </div>

        <div className="flex flex-col items-center gap-1" style={big}>
          <ScorePanel state={state} myId={screen ? "" : myId} now={now} clock={state.status === "playing" && !counting ? formatClock(left) : ""} lastMinute={state.status === "playing" && !counting && left < 60000} />
          {alert && <p className="animate-pulse rounded-full bg-amber-400 px-3 py-0.5 text-xs font-bold text-slate-950">{alert}</p>}
          {objective && <p className="rounded-full bg-white px-3 py-0.5 text-xs font-bold text-slate-950">{objective}</p>}
          {chaosNow && (
            <p className="flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-bold text-white" style={{ background: CHAOS_INFO[chaosNow.id].color }}>
              <Zap className="h-3.5 w-3.5" /> {CHAOS_INFO[chaosNow.id].label} · {Math.max(0, Math.ceil((chaosNow.end - now) / 1000))} s
            </p>
          )}
          {chaosSoon && chaosIn < WARN_MS && chaosIn > 0 && (
            <p className="flex animate-pulse items-center gap-1.5 rounded-full bg-white px-3 py-0.5 text-xs font-bold text-slate-950">
              <Zap className="h-3.5 w-3.5" /> ¡Caos en {Math.ceil(chaosIn / 1000)}!
            </p>
          )}
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <div className="flex gap-1.5">
            <button onClick={() => setSound((v) => (v === "on" ? "off" : "on"))} aria-label={sound === "on" ? "Silenciar" : "Activar sonido"} className="rounded-xl bg-slate-950/60 p-2 text-white backdrop-blur">
              {sound === "on" ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            {!tv && <QualityButton quality={quality} onToggle={toggleQuality} />}
            {screen && <TvModeButton className="rounded-xl bg-slate-950/60 px-2.5 py-2 text-xs text-white backdrop-blur" />}
            <button onClick={() => setBoard((v) => !v)} aria-label="Tabla" className="rounded-xl bg-slate-950/60 p-2 text-white backdrop-blur">
              <ListOrdered className="h-4 w-4" />
            </button>
            {!fine && inRoster && (
              <button
                onClick={() => {
                  releaseControls(controlsRef.current);
                  setEditing(true);
                }}
                aria-label="Ajustar controles"
                className="rounded-xl bg-slate-950/60 p-2 text-white backdrop-blur"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            )}
            <FullscreenButton className="rounded-xl bg-slate-950/60 p-2 text-white backdrop-blur" />
          </div>
          <KillFeed feed={feed} state={state} myId={myId} style={big} />
        </div>
      </div>

      {/* Shield, health, weapon and ammo. */}
      {inRoster && hud?.alive && (
        <>
          <div className={`pointer-events-none absolute left-1/2 z-20 w-64 -translate-x-1/2 ${fine ? "bottom-4" : "top-[5.75rem]"}`}>
            <Bars shield={hud.shield} hp={hud.hp} guard={hud.guard} />
          </div>
          {/* On touch the weapon panel is one of the controls (tap it to switch). */}
          {fine && (
            <div className="pointer-events-none absolute bottom-4 right-4 z-20">
              <WeaponPanel hud={hud} keys align="right" />
            </div>
          )}
        </>
      )}

      {fine && inRoster && !locked && state.status === "playing" && hud?.alive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center">
          <p className="flex max-w-xl items-center gap-2 rounded-xl bg-slate-950/75 px-4 py-2 text-sm text-white backdrop-blur">
            <MousePointerClick className="h-4 w-4 shrink-0" />
            Haz clic para jugar · WASD moverte · clic disparar · clic derecho apuntar · C habilidad · R recargar · Q cambiar arma · G globo · F golpe · E agarrar · espacio saltar · Esc soltar el mouse
          </p>
        </div>
      )}

      {!fine && !screen && (
        <p className="pointer-events-none absolute inset-x-0 top-28 z-20 hidden items-center justify-center gap-1.5 text-xs text-white drop-shadow portrait:flex">
          <RotateCw className="h-3.5 w-3.5" /> Gira el teléfono para jugar mejor
        </p>
      )}

      {chaosNow && now - chaosNow.start < 3200 && (
        <div key={chaosNow.n} className="pointer-events-none absolute inset-x-0 top-[24%] z-20 flex justify-center px-4" style={big}>
          <div className="animate-celebration-in flex flex-col items-center rounded-3xl bg-slate-950/75 px-6 py-3 text-center backdrop-blur">
            <p className="font-display text-4xl sm:text-5xl" style={{ color: CHAOS_INFO[chaosNow.id].color }}>
              {CHAOS_INFO[chaosNow.id].label}
            </p>
            <p className="text-sm text-white sm:text-base">{CHAOS_INFO[chaosNow.id].hint}</p>
          </div>
        </div>
      )}

      {toast && (
        <div key={toast.id} className="pointer-events-none absolute inset-x-0 top-1/3 z-20 flex justify-center">
          <MedalToast title={toast.title} sub={toast.sub} />
        </div>
      )}

      {counting && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center">
          <p className="mb-1 font-display text-2xl text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">{MAPS[state.map].name} · {MODE_INFO[state.mode].label}</p>
          <p className="mb-2 max-w-md px-4 text-center text-sm text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">{MODE_INFO[state.mode].hint}</p>
          <span key={count} className="animate-celebration-in font-display text-[24vmin] text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.7)]">
            {count}
          </span>
        </div>
      )}

      {inRoster && hud && !hud.alive && state.status === "playing" && !counting && <DeathCard hud={hud} talo={playerTalo(myId, fighterColor(state, myId), 72)} />}

      {!inRoster && !screen && hud?.watching && state.status === "playing" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
          <p className="rounded-xl bg-slate-950/75 px-4 py-2 text-sm text-white backdrop-blur">
            Mirando a <b>{hud.watching}</b> · juegas la próxima partida
          </p>
        </div>
      )}

      {showBoard && state.status === "playing" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/40 p-4" onClick={() => setBoard(false)}>
          <Scoreboard state={state} myId={myId} />
        </div>
      )}

      {state.status === "finished" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4">
          <Results roomId={roomId} meta={meta} state={state} myId={myId} presence={presence} />
        </div>
      )}
    </div>
  );
}

/** Big screen: one person's quarter (or half) with their crosshair, bars, ammo, medals and death notice. */
function ViewOverlay({
  v,
  rect,
  state,
  mark,
  playing,
}: {
  v: ViewHud;
  rect: [number, number, number, number];
  state: FuegoState;
  mark?: { n: number; head: boolean; kill: boolean };
  playing: boolean;
}) {
  const [x, y, w, h] = rect;
  const color = fighterColor(state, v.id);
  const bottomRow = y > 0;
  return (
    <div
      className="pointer-events-none absolute overflow-hidden border-2 border-slate-950"
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`, containerType: "size" }}
    >
      {v.zoomed && <Scope range={v.range} zoomX={v.zoomX} onTarget={v.onTarget} unit="cqmin" />}
      {v.hurt > 0 && (
        <div className="absolute inset-0" style={{ boxShadow: v.hurt === 1 ? "inset 0 0 70px 14px rgba(34,211,238,0.45)" : "inset 0 0 80px 20px rgba(220,38,38,0.55)" }} />
      )}
      {v.alive && v.hp <= 35 && !v.zoomed && <div className="absolute inset-0 animate-pulse" style={{ boxShadow: "inset 0 0 90px 24px rgba(185,28,28,0.45)" }} />}
      {v.alive && playing && !v.zoomed && <Crosshair weapon={v.weapon} aiming={v.aiming} />}
      {mark && <HitMarker mark={mark} />}

      {/* Name, shield and health: under the score in the top row, at the top in the bottom row. */}
      <div className={`absolute left-3 flex w-60 flex-col gap-1.5 rounded-2xl bg-slate-950/70 px-3.5 py-2.5 ${bottomRow ? "top-3" : "bottom-3"}`}>
        <span className="flex items-center gap-2 truncate text-lg font-bold" style={{ color }}>
          <Talo {...playerTalo(v.id, color, 22)} expr={v.alive ? "normal" : "triste"} />
          {fighterName(state, v.id)}
          {v.guard && v.alive && <ShieldCheck className="h-4 w-4 shrink-0 text-cyan-300" aria-label="Protegido" />}
          <span className="ml-auto font-mono text-base text-white">{state.kills[v.id] ?? 0}</span>
        </span>
        {v.alive && <Bars shield={v.shield} hp={v.hp} guard={false} />}
      </div>

      {v.alive && (
        <div className="absolute bottom-3 right-3">
          <WeaponPanel hud={v} keys={false} align="right" />
        </div>
      )}
      {v.alive && v.near && playing && (
        <p className="absolute left-1/2 top-[60%] -translate-x-1/2 whitespace-nowrap rounded-lg bg-amber-400 px-3 py-1 text-base font-bold text-slate-950">Agarrar {v.near}</p>
      )}
      {v.alive && v.radar.length > 0 && (
        <div className={`absolute ${bottomRow ? "right-3 top-3" : "left-3 top-16"}`}>
          <Radar points={v.radar} />
        </div>
      )}

      {v.toast && (
        <div key={v.toast.at} className="absolute inset-x-0 top-[26%] flex justify-center">
          <MedalToast title={v.toast.title} sub={v.toast.sub} />
        </div>
      )}
      {!v.alive && playing && (
        <div className="absolute inset-0 bg-red-950/25">
          <DeathCard hud={v} talo={playerTalo(v.id, color, 72)} />
        </div>
      )}
    </div>
  );
}

/** Shield over health, in ten segments each; "Protegido" just after respawning. */
function Bars({ shield, hp, guard }: { shield: number; hp: number; guard: boolean }) {
  return (
    <div className="relative">
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="h-2 flex-1 rounded-sm bg-slate-800/80">
            <div className="h-full rounded-sm bg-cyan-300" style={{ width: `${Math.max(0, Math.min(1, (shield / MAX_SHIELD) * 10 - i)) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="h-1.5 flex-1 rounded-sm bg-slate-800/80">
            <div className={`h-full rounded-sm ${hp <= 35 ? "bg-red-500" : "bg-emerald-400"}`} style={{ width: `${Math.max(0, Math.min(1, (hp / MAX_HP) * 10 - i)) * 100}%` }} />
          </div>
        ))}
      </div>
      {guard && (
        <span className="absolute -top-6 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-cyan-300 px-2 py-0.5 text-[11px] font-bold text-slate-950">
          <ShieldCheck className="h-3 w-3" /> Protegido
        </span>
      )}
    </div>
  );
}

/** The weapon in hand with its ammo, the other one, and the grenades as pips. */
function WeaponPanel({ hud, keys, align }: { hud: Hud; keys: boolean; align: "left" | "right" }) {
  const def = WEAPONS[hud.weapon];
  const low = !hud.reloading && hud.reserve > 0 && hud.mag <= Math.max(1, Math.floor(def.mag / 4));
  const dry = !hud.reloading && hud.mag === 0 && hud.reserve === 0;
  return (
    <div className={`flex flex-col gap-1 rounded-2xl bg-slate-950/65 px-3.5 py-2.5 text-white backdrop-blur ${align === "right" ? "items-end text-right" : "items-start text-left"}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-300">
        {def.label}
        {hud.reloading && <span className="ml-1.5 normal-case text-amber-300">recargando…</span>}
      </p>
      <p className="font-mono text-3xl font-bold leading-none">
        <span className={hud.mag === 0 && hud.weapon !== "lanzacohetes" ? "text-red-400" : ""}>{hud.mag}</span>
        <span className="ml-1 text-base font-medium text-slate-400">/ {hud.reserve}</span>
      </p>
      {dry && <p className="text-xs font-bold text-red-400">Sin munición: cambia de arma</p>}
      {low && <p className="animate-pulse text-xs font-bold text-amber-300">{keys ? "R: recarga" : "Recarga"}</p>}
      <div className={`flex w-full items-center gap-1.5 text-[11px] font-bold ${align === "right" ? "flex-row-reverse" : ""}`}>
        <Zap className="h-3 w-3 shrink-0" style={{ color: ABILITY_INFO[hud.ability.kit].color }} />
        <span className={hud.ability.ready >= 1 ? "text-white" : "text-slate-500"}>
          {keys && <b className="mr-1">C</b>}
          {ABILITY_INFO[hud.ability.kit].label}
        </span>
        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full rounded-full" style={{ width: `${hud.ability.ready * 100}%`, background: ABILITY_INFO[hud.ability.kit].color }} />
        </span>
      </div>
      <div className={`flex items-center gap-2 text-[11px] text-slate-300 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <span className="flex items-center gap-0.5">
          <Bomb className="h-3 w-3" />
          {Array.from({ length: MAX_GRENADES }, (_, i) => (
            <span key={i} className={`h-2 w-2 rounded-full ${i < hud.grenades ? "bg-lime-400" : "bg-white/15"}`} />
          ))}
        </span>
        {hud.other && (
          <span className="rounded bg-white/10 px-1.5 py-0.5">
            {keys && <b className="mr-1">Q</b>}
            {WEAPONS[hud.other].label}
          </span>
        )}
      </div>
    </div>
  );
}

function MedalToast({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="animate-celebration-in flex flex-col items-center rounded-2xl bg-slate-950/75 px-5 py-2 text-center backdrop-blur">
      <p className="font-display text-2xl text-amber-300">{title}</p>
      <p className="text-sm text-white">{sub}</p>
    </div>
  );
}

/** Paint from whoever hit you, on your screen for a moment. */
function PaintSplat({ x, y, size, rot, color }: { x: number; y: number; size: number; rot: number; color: string }) {
  const drops = [
    [72, 28, 12],
    [22, 78, 9],
    [86, 70, 7],
    [14, 30, 6],
    [58, 92, 8],
  ];
  return (
    <svg
      viewBox="0 0 100 100"
      className="pointer-events-none absolute z-10 animate-[paint-splat_1.8s_ease-out_forwards]"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, ["--rot" as string]: `${rot}deg` }}
      aria-hidden
    >
      <path d="M50 14 C64 12 70 24 80 28 C92 33 88 48 84 56 C80 66 86 78 72 82 C60 86 54 78 44 82 C30 88 18 80 20 66 C22 56 10 50 16 38 C22 26 36 16 50 14 Z" fill={color} />
      {drops.map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill={color} />
      ))}
      <ellipse cx="42" cy="36" rx="12" ry="7" fill="#ffffff" opacity="0.28" />
    </svg>
  );
}

/** Who got you, with what, and how much they had left; then the respawn count. */
function DeathCard({ hud, talo }: { hud: Hud; talo?: ReturnType<typeof playerTalo> }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 p-4 text-center">
      {talo ? <Talo {...talo} expr="triste" /> : <Skull className="h-10 w-10 text-white/80" />}
      <p className="font-display text-3xl text-white drop-shadow">{hud.killer ? (hud.killer === "tú mismo" ? "Te eliminaste solo" : `Te eliminó ${hud.killer}`) : "Te eliminaron"}</p>
      {hud.killer && hud.killer !== "tú mismo" && (
        <p className="rounded-full bg-slate-950/60 px-3 py-1 text-sm text-slate-200">
          {hud.killedWith && <>con {hud.killedWith} · </>}
          {hud.killerHp > 0 ? `le quedaba ${hud.killerHp} de vida` : hud.killerHp === 0 ? "ya cayó también" : ""}
        </p>
      )}
      <p className="rounded-xl bg-slate-950/70 px-4 py-1.5 font-bold text-white">Reapareces en {hud.respawnIn}…</p>
    </div>
  );
}

function HitMarker({ mark }: { mark: { n: number; head: boolean; kill: boolean } }) {
  if (!mark.n) return null;
  return (
    <div key={mark.n} className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-[ping_0.25s_ease-out_1]">
      {[45, 135, 225, 315].map((r) => (
        <span
          key={r}
          className="absolute left-1/2 top-1/2 h-0.5 w-3"
          style={{ transform: `translate(-50%, -50%) rotate(${r}deg) translateX(10px)`, backgroundColor: mark.kill ? "#ef4444" : mark.head ? "#fbbf24" : "#ffffff" }}
        />
      ))}
    </div>
  );
}

/** Score and time: teams with a bar each toward the goal; free-for-all with your place (or the top 3). */
function ScorePanel({ state, myId, now, clock, lastMinute }: { state: FuegoState; myId: string; now: number; clock: string; lastMinute: boolean }) {
  const goal = state.mode === "bandera" ? FLAG_CAPS : state.mode === "escalada" ? LADDER.length : state.mode === "tesoro" ? EGG_TARGET_MS / 1000 : state.goal;
  const time = (
    <span className={`min-w-14 text-center font-mono text-base font-bold ${lastMinute ? "animate-pulse text-red-400" : "text-slate-200"}`}>{clock || `a ${goal}`}</span>
  );
  if (state.mode === "infectados") {
    const n = (side: string) => Object.values(state.roster).filter((v) => v === side).length;
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-slate-950/70 px-4 py-1.5 text-white backdrop-blur">
        <span className="flex flex-col items-center leading-none">
          <span className="font-display text-2xl" style={{ color: teamInfo("blue").color }}>{n(SURVIVORS)}</span>
          <span className="text-[10px] text-slate-400">sobreviven</span>
        </span>
        {time}
        <span className="flex flex-col items-center leading-none">
          <span className="font-display text-2xl text-lime-400">{n(INFECTED)}</span>
          <span className="text-[10px] text-slate-400">infectados</span>
        </span>
      </div>
    );
  }
  if (isTeamMode(state.mode)) {
    const bar = (team: TeamId, dir: "left" | "right") => (
      <div className="flex w-24 flex-col gap-1">
        <span className={`font-display text-2xl leading-none ${dir === "left" ? "text-left" : "text-right"}`} style={{ color: teamInfo(team).color }}>
          {state.score[team]}
        </span>
        <span className={`flex h-1.5 overflow-hidden rounded-full bg-white/10 ${dir === "right" ? "justify-end" : ""}`}>
          <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (state.score[team] / goal) * 100)}%`, background: teamInfo(team).color }} />
        </span>
      </div>
    );
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-slate-950/70 px-4 py-2 text-white backdrop-blur">
        {bar("red", "left")}
        {time}
        {bar("blue", "right")}
      </div>
    );
  }
  const order = ranking(state);
  const pts = (id: string) => scoreOf(state, id, now);
  if (myId && myId in state.roster) {
    const place = order.findIndex((id) => pts(id) === pts(myId)) + 1;
    const leader = order[0];
    const unit = state.mode === "tesoro" ? `de ${goal} s` : state.mode === "escalada" ? `escalón ${Math.min(LADDER.length, pts(myId) + 1)} de ${LADDER.length}` : `${place}º de ${order.length}`;
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-slate-950/70 px-4 py-1.5 text-white backdrop-blur">
        <span className="flex flex-col items-center leading-none">
          <span className="font-display text-2xl text-amber-300">{pts(myId)}</span>
          <span className="text-[10px] text-slate-400">{unit}</span>
        </span>
        {time}
        <span className="flex max-w-32 items-center gap-1 truncate text-sm text-slate-200">
          <Crown className="h-3.5 w-3.5 shrink-0 text-amber-300" />
          {leader === myId ? "Vas primero" : `${fighterName(state, leader, myId)} ${pts(leader)}`}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-950/70 px-4 py-1.5 text-white backdrop-blur">
      {time}
      {order.slice(0, 3).map((id, i) => (
        <span key={id} className="flex items-center gap-1.5 text-sm font-bold">
          {i === 0 && <Crown className="h-3.5 w-3.5 text-amber-300" />}
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: fighterColor(state, id) }} />
          <span className="max-w-24 truncate">{fighterName(state, id)}</span>
          <span className="font-mono text-amber-300">{pts(id)}</span>
        </span>
      ))}
    </div>
  );
}

function KillFeed({ feed, state, myId, style }: { feed: FeedEntry[]; state: FuegoState; myId: string; style?: React.CSSProperties }) {
  return (
    <ul className="flex flex-col items-end gap-0.5" style={style}>
      {feed.map((e, i) => (
        e.w === "captura" ? (
          <li key={`${e.t}-${i}`} className="flex items-center gap-1.5 rounded-md bg-slate-950/70 px-2 py-0.5 text-[11px] text-white">
            <b style={{ color: fighterColor(state, e.k) }}>{fighterName(state, e.k, myId)}</b> capturó la bandera 🚩
          </li>
        ) : (
        <li key={`${e.t}-${i}`} className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] text-white backdrop-blur ${e.k === myId ? "bg-amber-500/40" : e.v === myId ? "bg-red-600/40" : "bg-slate-950/60"}`}>
          <b style={{ color: fighterColor(state, e.k) }}>{fighterName(state, e.k, myId)}</b>
          <span className="text-slate-300">
            {WEAPON_WORD[e.w] ?? e.w}
            {e.h ? " 🎯" : ""}
          </span>
          <b style={{ color: e.v === e.k ? undefined : fighterColor(state, e.v) }}>{e.v === e.k ? "se eliminó solo" : fighterName(state, e.v, myId)}</b>
          {(e.s ?? 0) >= 3 && (
            <span className="flex items-center gap-0.5 rounded bg-orange-500 px-1 font-bold text-white">
              <Flame className="h-3 w-3" />
              {e.s}
            </span>
          )}
        </li>
        )
      ))}
    </ul>
  );
}

/** Sniper scope: dark around the lens, mil-dot reticle, range to what's under the crosshair. `unit` sizes it to the window or to a split view. */
function Scope({ range, zoomX, onTarget, unit }: { range: number; zoomX: number; onTarget: boolean; unit: "vmin" | "cqmin" }) {
  const color = onTarget ? "#ef4444" : "#0f172a";
  const u = (n: number) => `${n}${unit}`;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ background: `radial-gradient(circle at center, rgba(96,165,250,0.06) 0 ${u(31)}, rgba(0,0,0,0.6) ${u(32)}, rgba(0,0,0,0.96) ${u(33)})` }}
    >
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[inset_0_0_40px_10px_rgba(0,0,0,0.65)]" style={{ width: u(64), height: u(64) }} />
      <div className="absolute left-1/2 top-1/2 w-[2px] -translate-x-1/2 -translate-y-1/2" style={{ height: u(64), background: `linear-gradient(${color} 0 44%, transparent 44% 56%, ${color} 56%)` }} />
      <div className="absolute left-1/2 top-1/2 h-[2px] -translate-x-1/2 -translate-y-1/2" style={{ width: u(64), background: `linear-gradient(90deg, ${color} 0 44%, transparent 44% 56%, ${color} 56%)` }} />
      {[-3, -2, -1, 1, 2, 3].map((k) => (
        <span key={`h${k}`} className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ backgroundColor: color, marginLeft: u(k * 4) }} />
      ))}
      {[1, 2, 3].map((k) => (
        <span key={`v${k}`} className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ backgroundColor: color, marginTop: u(k * 4) }} />
      ))}
      <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ backgroundColor: onTarget ? "#ef4444" : "#e11d48" }} />
      <p className="absolute left-1/2 top-1/2 font-mono text-sm font-bold text-emerald-300 drop-shadow" style={{ marginLeft: u(18), marginTop: u(3) }}>
        {range} m · x{zoomX}
      </p>
    </div>
  );
}

/** The crosshair per weapon; it closes in while aiming. */
function Crosshair({ weapon, aiming }: { weapon: WeaponId; aiming: boolean }) {
  if (weapon === "escopeta") {
    return <div className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 shadow transition-all ${aiming ? "h-10 w-10" : "h-14 w-14"}`} />;
  }
  if (weapon === "lanzacohetes") {
    return (
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-white/80">
        <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </div>
    );
  }
  const gap = (weapon === "rifle" ? 7 : 5) * (aiming ? 0.5 : 1);
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
          className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${p.ally ? "bg-sky-300" : "bg-red-500"}`}
          style={{ left: `${50 + p.x * 50}%`, top: `${50 + p.y * 50}%` }}
        />
      ))}
    </div>
  );
}

function Scoreboard({ state, myId }: { state: FuegoState; myId: string }) {
  const ids = ranking(state);
  return (
    <div className="w-full max-w-lg rounded-3xl bg-slate-950/90 p-4 text-white shadow-2xl ring-1 ring-white/10">
      {state.mode === "equipos" && (
        <p className="mb-2 text-center font-display text-2xl">
          <span style={{ color: teamInfo("red").color }}>{state.score.red}</span> – <span style={{ color: teamInfo("blue").color }}>{state.score.blue}</span>
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-400">
            <th className="py-1">Jugador</th>
            {state.mode === "tesoro" && <th className="w-14 text-right">Huevo</th>}
            <th className="w-14 text-right">Bajas</th>
            <th className="w-16 text-right">Muertes</th>
            <th className="w-14 text-right">Racha</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id, i) => (
            <tr key={id} className={id === myId ? "text-amber-300" : ""}>
              <td className="flex items-center gap-2 py-1">
                <Talo {...playerTalo(id, fighterColor(state, id), 20)} expr={i === 0 && (state.kills[id] ?? 0) > 0 ? "contento" : "normal"} />
                {fighterName(state, id, myId)}
                {i === 0 && (state.kills[id] ?? 0) > 0 && <Crown className="h-3.5 w-3.5 text-amber-300" />}
                {isBot(id) && <span className="text-xs text-slate-500">bot</span>}
              </td>
              {state.mode === "tesoro" && <td className="text-right font-mono text-amber-300">{scoreOf(state, id, serverNow())} s</td>}
              <td className="text-right font-mono">{state.kills[id] ?? 0}</td>
              <td className="text-right font-mono text-slate-400">{state.deaths[id] ?? 0}</td>
              <td className="text-right font-mono text-slate-400">{state.best[id] ?? 0}</td>
            </tr>
          ))}
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
      : state.mode === "infectados"
        ? state.winner === SURVIVORS
          ? "🏆 ¡Sobrevivieron!"
          : "🧟 ¡Ganaron los infectados!"
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
  const ids = ranking(state);
  const mvp = ids[0];
  const streaker = [...ids].sort((a, b) => (state.best[b] ?? 0) - (state.best[a] ?? 0))[0];
  const awards: { icon: ReactNode; label: string; who: string; value: string }[] = [];
  if (mvp && (state.kills[mvp] ?? 0) > 0) awards.push({ icon: <Crown className="h-5 w-5 text-amber-300" />, label: "Más bajas", who: mvp, value: `${state.kills[mvp]}` });
  if (streaker && (state.best[streaker] ?? 0) >= 2) awards.push({ icon: <Flame className="h-5 w-5 text-orange-400" />, label: "Mejor racha", who: streaker, value: `${state.best[streaker]} seguidas` });
  // The winner's talo (or one in the winning team's color).
  const winnerTalo =
    state.winner === "draw" ? null : team ? playerTalo(`equipo-${state.winner}`, team.color, 84) : state.winner ? playerTalo(state.winner, fighterColor(state, state.winner), 84) : null;
  return (
    <div className="animate-celebration-in flex w-full max-w-lg flex-col items-center gap-4 rounded-3xl bg-slate-950/90 p-5 text-center shadow-2xl ring-1 ring-white/10 backdrop-blur">
      {winnerTalo && <Talo {...winnerTalo} expr="ganador" />}
      <p className="font-display text-3xl" style={{ color: team?.color ?? "#fbbf24" }}>
        {title}
      </p>
      {awards.length > 0 && (
        <div className="grid w-full grid-cols-2 gap-2">
          {awards.map((a) => (
            <div key={a.label} className="flex items-center gap-2.5 rounded-2xl bg-white/[0.06] px-3 py-2 text-left">
              {a.icon}
              <span className="min-w-0">
                <span className="block text-[11px] text-slate-400">{a.label}</span>
                <span className="block truncate text-sm font-bold text-white">
                  <span style={{ color: fighterColor(state, a.who) }}>{fighterName(state, a.who, myId)}</span> · {a.value}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
      <Scoreboard state={state} myId={myId} />
      <div className="flex w-full max-w-xs flex-col gap-2">
        <button onClick={() => startMatch(roomId, meta, connected)} className={PRIMARY_BUTTON}>
          Revancha
        </button>
        <button onClick={() => backToWaiting(roomId, state.gameNo)} className={SECONDARY_BUTTON}>
          Volver a la sala (cambiar configuración)
        </button>
      </div>
    </div>
  );
}
