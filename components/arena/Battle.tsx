"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ENV,
  HILL_TARGET,
  REGEN_DELAY_MS,
  REGEN_EVERY_MS,
  RESPAWN_MS,
  ROUND_END_MS,
  allFighters,
  alive,
  backToWaiting,
  dropEventItems,
  dropPose,
  envHit,
  fallOff,
  ffaRanking,
  fighterColor,
  fighterName,
  forfeit,
  hillTick,
  isBot,
  respawnFighter,
  roundSeconds,
  sideOf,
  spawnOf,
  waveSkill,
  wavesSurvived,
  nextRound,
  openPose,
  pickItem,
  regenerate,
  respawnItems,
  roundKey,
  shootArrow,
  spendSpecial,
  startMatch,
  strike,
  subscribeArrows,
  subscribePads,
  NO_PAD,
  type ArenaPad,
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
  IDLE_INPUT,
  ITEM_LABEL,
  KICK_COOLDOWN,
  MAX_HP,
  MAX_STAMINA,
  PICK_RADIUS,
  SPECIALS,
  SPECIAL_MAX,
  START_GEAR,
  WEAPONS,
  arrowAt,
  botInput,
  flyArrow,
  kickStrikes,
  lateParry,
  launchArrow,
  meleeStrikes,
  newMind,
  spawnPoint,
  specialOf,
  specialStrikes,
  type Arrow,
  type BotEnemy,
  type BotMind,
  type FighterEvent,
  type FighterInput,
  type FighterView,
  type Gear,
  type Strike,
} from "@/lib/arenaSim";
import { ArenaScene, type ArenaCamera, type KnightPose, type WorldFx } from "@/lib/arena3d";
import {
  EVENT_INFO,
  EVENT_LEAD,
  RAIN_DAMAGE,
  RAIN_R,
  RING_DAMAGE,
  eventAt,
  eventItems,
  fogAt,
  getMap,
  hillHolder,
  rainDrops,
  ringRadius,
  roundEvents,
  topAt,
  trapDanger,
  trapHits,
  type ArenaEvent,
  type RainDrop,
} from "@/lib/arenaMaps";
import { newPadSeen, padInput, type PadSeen } from "@/lib/arenaPad";
import { ArenaAudio } from "@/lib/arenaAudio";
import { serverNow } from "@/lib/serverTime";
import type { PresenceMap } from "@/lib/presence";
import type { TeamId } from "@/lib/teams";
import { useWakeLock } from "@/components/carreras/Controller";
import { useQuality } from "@/hooks/useQuality";
import QualityButton from "@/components/QualityButton";
import { TaloMark } from "@/components/TaloLogo";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import { MOUSE_LOOK, TOUCH_LOOK, TouchControls, newControls, useDesktopControls, useFinePointer, type ControlState } from "./Controls";
import { Eye, MousePointerClick, RotateCw, Shield, Sparkles, Users, Volume2, VolumeX } from "lucide-react";
import FullscreenButton from "@/components/FullscreenButton";

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
  team: string;
  down: () => void;
}

interface BotRun {
  f: Fighter;
  mind: BotMind;
  actAt: number;
  lastT: number;
  pickAt: number;
  send: ReturnType<typeof openPose>;
  /** Big screen: a person driven by their phone's pad (presses already used). */
  remote?: PadSeen;
}

/** Big screen, split: the views' rectangles (fractions, from the top-left) for 1–4 people. */
export function splitRects(n: number): [number, number, number, number][] {
  if (n <= 1) return [[0, 0, 1, 1]];
  if (n === 2) return [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]];
  if (n === 3) return [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 1, 0.5]];
  return [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
}

/** The people who get a view on the big screen (up to 4; more = the overview). */
export function splitPeople(state: ArenaState): string[] {
  const people = Object.keys(state.roster)
    .filter((id) => !isBot(id))
    .sort((a, b) => (state.roster[a] === state.roster[b] ? a.localeCompare(b) : state.roster[a] === "red" ? -1 : 1));
  return people.length <= 4 ? people : [];
}

/** Big screen: what a pose sender looks like when nobody needs the poses. */
const NO_SEND = { send: () => {}, close: () => {} } as unknown as ReturnType<typeof openPose>;


interface Hud {
  hp: number;
  stamina: number;
  gear: Gear;
  near: string | null;
  nearLabel: string;
  alive: boolean;
  watching: string;
  draw: number;
  /** Special meter (0–`SPECIAL_MAX`) and the kick's readiness (0–1, 1 = ready). */
  special: number;
  kick: number;
}

/** How long a callout ("¡Parada perfecta!") stays on screen. */
const CALLOUT_MS = 1100;
/**
 * A blow on someone run by another phone is settled this long after it
 * lands, so a guard raised just before it (in server time) has time to
 * arrive over the network and count as a perfect parry.
 */
const PARRY_GRACE_MS = 150;

/** A blow waiting for `PARRY_GRACE_MS` before it's written. */
interface PendingBlow {
  at: number;
  key: number;
  id: string;
  /** Server time it landed, and where the attacker stood. */
  strikeAt: number;
  fromX: number;
  fromZ: number;
  hits: Strike[];
  views: FighterView[];
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
  screen = false,
}: {
  roomId: string;
  meta: ArenaMeta;
  state: ArenaState;
  myId: string;
  presence: PresenceMap;
  presenceLoaded: boolean;
  /**
   * Big screen (`/pantalla`): no fighter of its own; it runs everyone — people
   * from their phones' pads (`subscribePads`), bots with their brain — decides
   * the hits and shows the whole arena from above.
   */
  screen?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const presenceRef = useRef({ presence, presenceLoaded });
  const controlsRef = useRef<ControlState>(newControls());
  const [camera, toggleCamera] = useStored<ArenaCamera>(CAMERA_KEY, "primera", "tercera");
  const cameraRef = useRef(camera);
  const [sound, toggleSound] = useStored<"on" | "off">(SOUND_KEY, "on", "off");
  const [quality, toggleQuality] = useQuality("arena.calidad");
  const audioRef = useRef<ArenaAudio | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [hurt, setHurt] = useState(false);
  const [healed, setHealed] = useState(false);
  const [callout, setCallout] = useState<{ text: string; color: string; n: number } | null>(null);
  /** A mid-round event's banner, and the hill's holder («rey»). */
  const [banner, setBanner] = useState<{ title: string; sub: string; n: number } | null>(null);
  const [holder, setHolder] = useState("");
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
    if (!canvas || !quality) return;
    const map = getMap(stateRef.current.map);
    const scene = new ArenaScene(canvas, { quality, map: map.id });
    // On a TV the names are read from the couch (big over the whole arena, normal in a split view).
    let tagScale = 0;
    const audio = audioRef.current;
    let poses: Record<string, ArenaPose> = {};
    let arrowsIn: Record<string, ArenaArrow> = {};
    const unsubPoses = subscribePoses(roomId, (p) => (poses = p));
    const unsubArrows = subscribeArrows(roomId, (a) => (arrowsIn = a));
    let pads: Record<string, ArenaPad> = {};
    const unsubPads = screen ? subscribePads(roomId, (p) => (pads = p)) : () => {};

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
    let calloutTimer: ReturnType<typeof setTimeout> | undefined;
    let calloutN = 0;
    let bannerTimer: ReturnType<typeof setTimeout> | undefined;
    /** This round's events, the rain's drops of the one on (by its number), and the last frame's round clock. */
    let events: ArenaEvent[] = [];
    let rain: { n: number; drops: RainDrop[] } | null = null;
    let lastT = -Infinity;
    let shownEvent = -1;
    let lastHolder = "";
    /** Map damage already sent (fighter:source:tick), and who was standing last frame (to notice a «rey» comeback or a new wave). */
    const envSent = new Set<string>();
    const wasAlive = new Map<string, boolean>();
    const say = (text: string, color: string) => {
      setCallout({ text, color, n: ++calloutN });
      clearTimeout(calloutTimer);
      calloutTimer = setTimeout(() => setCallout(null), CALLOUT_MS);
    };
    /** When each fighter last started a special (so a full meter isn't used twice before the state catches up). */
    const spentAt = new Map<string, number>();
    const pending: PendingBlow[] = [];
    let lastHp = -1;
    /** First-person feel: tilt when strafing, wider view when running or dodging. */
    const feel = { roll: 0, fov: 72 };
    /** Watching someone else: whom, and the camera's own (smoothed) yaw. */
    let specFollow: string | null = null;
    let specYaw = 0;
    const mySend = myId in stateRef.current.roster ? openPose(roomId, myId, true) : null;

    /** Calls a state change once in a while (every client may; transactions keep it single). */
    const once = (name: string, fn: () => unknown, every = 1500) => {
      const now = performance.now();
      if (now - (called.get(name) ?? -Infinity) < every) return;
      called.set(name, now);
      Promise.resolve(fn()).catch(console.error);
    };

    const gearOf = (s: ArenaState, id: string): Gear => s.gear[id] ?? START_GEAR;
    /** Where a fighter starts (or comes back) on this map. */
    const spawnFor = (s: ArenaState, id: string) => {
      const sp = spawnOf(s, id);
      return spawnPoint(sp.team, sp.index, sp.count, map, sp.ffa);
    };

    /** How a fighter looks to this client right now. */
    const viewOf = (
      s: ArenaState,
      id: string
    ): FighterView & { act: string; actAt: number; actLen: number; draw: number; speed: number; pitch: number; combo: number; running: boolean } => {
      const team = sideOf(s, id);
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
          blockAge: local.parryAge,
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
        // When its block started (if it can still parry), seen from now.
        blockAge: p?.b && p.bt ? Math.max(0, (serverNow() - p.bt) / 1000) : undefined,
      };
    };

    /** Whether `id` may start its special: a full meter, not just spent. */
    const specialReady = (s: ArenaState, id: string) =>
      (s.special[id] ?? 0) >= SPECIAL_MAX && performance.now() - (spentAt.get(id) ?? -Infinity) > 2500;

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
      bt: Number.isFinite(f.parryAge) ? Math.round(serverNow() - f.parryAge * 1000) : 0,
      dr: Math.round(f.draw * 100) / 100,
      sp: Math.round(f.speed * 10) / 10,
      cb: f.combo,
      rn: f.sprinting ? 1 : 0,
      t: Math.round(serverNow()),
    });

    /** How a hit looks and sounds where it lands. */
    const showHit = (x: number, y: number, z: number, id: string, h: { parried?: boolean; kick?: boolean; blocked: boolean; guardBreak?: boolean }) => {
      const [vol, pan] = where(x, z);
      if (h.parried) {
        scene.burst(x, y + 1.3, z, "parry");
        audio?.parry(vol, pan);
      } else if (h.kick) {
        scene.burst(x, y + 1.0, z, "kick");
        scene.hitFlash(id);
        audio?.kickHit(vol, pan);
        if (h.guardBreak) audio?.clang(vol * 0.7, pan);
      } else if (h.blocked) {
        scene.burst(x, y + 1.3, z, "block");
        audio?.clang(vol, pan);
      } else {
        scene.burst(x, y + 1.3, z, "hit");
        scene.hitFlash(id);
        audio?.thud(vol, pan);
      }
    };

    /** Blows that landed (a swing, a kick, a special): show them, reel back if parried, and write them. */
    const landed = (id: string, f: Fighter, hits: Strike[], views: FighterView[]) => {
      if (!hits.length) return;
      for (const h of hits) {
        const t = views.find((v) => v.id === h.target)!;
        showHit(t.x, t.y, t.z, h.target, h);
      }
      const parrier = hits.find((h) => h.parried);
      if (parrier) {
        const t = views.find((v) => v.id === parrier.target)!;
        f.parried(t.x, t.z);
        if (id === myId) {
          scene.jolt(0.9);
          say("¡Te pararon!", "#fca5a5");
        }
      } else if (id === myId) {
        scene.jolt(hits.some((h) => h.special) ? 1.1 : 0.6);
        if (hits.some((h) => h.guardBreak)) say("¡Guardia rota!", "#fde68a");
      }
      strike(roomId, key, id, { x: f.x, z: f.z }, withPlaces(hits, views)).catch(console.error);
    };

    /**
     * A blow that a guard could stop: settled now, or — if it cleanly hits
     * someone another phone runs — after `PARRY_GRACE_MS`, in case their
     * parry is still on its way.
     */
    const blow = (id: string, f: Fighter, hits: Strike[], views: FighterView[]) => {
      if (hits.some((h) => !h.blocked && ghosts.has(h.target))) {
        pending.push({ at: performance.now() + PARRY_GRACE_MS, key, id, strikeAt: serverNow(), fromX: f.x, fromZ: f.z, hits, views });
      } else landed(id, f, hits, views);
    };

    /** Blows whose grace is over: a parry if the target's guard went up just before, else as decided. */
    const settleBlows = (s: ArenaState) => {
      for (let i = pending.length - 1; i >= 0; i--) {
        const pb = pending[i];
        if (performance.now() < pb.at && pb.key === key) continue;
        pending.splice(i, 1);
        const f = pb.id === myId ? me : bots.get(pb.id)?.f;
        if (!f || pb.key !== key) continue;
        const hits = pb.hits.map((h) => {
          const p = ghosts.get(h.target)?.pose;
          if (h.blocked || !p?.b || !p.bt) return h;
          // How long before the blow the guard went up (a little after = clock slack, not a parry).
          const age = (pb.strikeAt - p.bt) / 1000;
          if (age < -0.03) return h;
          return lateParry(h, { ...viewOf(s, h.target), blocking: true, blockAge: Math.max(0, age) }, pb.fromX, pb.fromZ);
        });
        landed(pb.id, f, hits, pb.views);
      }
    };

    /** Someone's swing landed or an arrow left: work out the hits and write them. */
    const handleEvents = (s: ArenaState, id: string, f: Fighter, evs: FighterEvent[]) => {
      const gear = gearOf(s, id);
      const team = sideOf(s, id);
      for (const ev of evs) {
        const [vol, pan] = where(f.x, f.z);
        if (ev.type === "windup") {
          const heavy = gear.w === "hacha" || gear.w === "maza" || gear.w === "martillo" ? 0.8 : gear.w === "mangual" ? 0.55 : gear.w === "daga" ? 0 : 0.35;
          audio?.swing(heavy, vol, pan);
        }
        if (ev.type === "dodge") audio?.swing(0.1, vol * 0.7, pan);
        if (ev.type === "strike") {
          const views = Object.keys(s.roster).map((o) => viewOf(s, o));
          blow(id, f, meleeStrikes(viewOf(s, id), gear, views, map), views);
        }
        if (ev.type === "kickHit") {
          const views = Object.keys(s.roster).map((o) => viewOf(s, o));
          landed(id, f, kickStrikes(viewOf(s, id), views, map), views);
        }
        if (ev.type === "special") {
          spentAt.set(id, performance.now());
          spendSpecial(roomId, key, id).catch(console.error);
        }
        if (ev.type === "specialHit") {
          const views = Object.keys(s.roster).map((o) => viewOf(s, o));
          const hits = specialStrikes(viewOf(s, id), ev.kind, views, map);
          // The slam can't be parried.
          if (ev.kind === "terremoto") landed(id, f, hits, views);
          else blow(id, f, hits, views);
        }
        if (ev.type === "shoot") {
          audio?.bow(vol, pan);
          const a = launchArrow(f, ev.draw, ev.yawOff);
          const t0 = serverNow();
          const down = shootArrow(roomId, { k: key, o: id, x: a.x, y: a.y, z: a.z, vx: a.vx, vy: a.vy, vz: a.vz, t: Math.round(t0) });
          myArrows.push({ id: arrowNo++, a, t0, done: 0, owner: id, team, down });
        }
        if (ev.type === "fell") {
          // Off the bridge: out (whoever pushed counts it).
          once(`fall:${id}:${key}`, () => fallOff(roomId, key, id), 2500);
          if (id === myId) say("¡Al abismo!", "#fca5a5");
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
        events = s.events ? roundEvents(map, s.seed, k, Math.min(900, roundSeconds(s))) : [];
        rain = null;
        lastT = -Infinity;
        shownEvent = -1;
        envSent.clear();
        wasAlive.clear();
        if (myId in s.roster) {
          const sp = spawnFor(s, myId);
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
      // The big screen runs everyone: bots and the people on their pads.
      const botHost = screen || (loaded && people[0] === myId);
      const botIds = screen ? ids : ids.filter(isBot);
      if (botHost && s.status !== "waiting") {
        // Bots that left the match (a beaten wave): gone, with their poses.
        for (const [id, run] of bots) {
          if (id in s.roster) continue;
          run.send.close();
          bots.delete(id);
          if (!screen) dropPose(roomId, id);
        }
        for (const id of botIds) {
          if (bots.has(id)) continue;
          const p = poses[id];
          const sp = spawnFor(s, id);
          const f = p && p.k === key ? new Fighter(p.x, p.z, p.yw) : new Fighter(sp.x, sp.z, sp.yaw);
          if (p && p.k === key) f.y = p.y;
          const pad = pads[id] ?? NO_PAD;
          bots.set(id, {
            f,
            mind: newMind(s.mode === "supervivencia" && isBot(id) ? waveSkill(s.wave) : 1),
            actAt: now,
            lastT: 0,
            pickAt: 0,
            send: screen ? NO_SEND : openPose(roomId, id, false),
            remote: screen && !isBot(id) ? newPadSeen(pad, f.yaw) : undefined,
          });
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
        // The map's hits were already felt by whoever runs the fighter (they wrote them).
        if (h.from !== ENV) local?.receive(h.b, h.d, h.x, h.z, { parried: !!h.pr, guardBreak: !!h.g, kick: !!h.kk, push: h.pw, stagger: h.st });
        if (id === myId) {
          scene.jolt(h.pr ? 0.4 : h.b ? 0.5 : 1);
          if (h.pr) say("¡Parada perfecta!", "#fde047");
          else if (h.g) say("¡Te rompieron la guardia!", "#fca5a5");
          if (!h.b) {
            audio?.hurt();
            setHurt(true);
            clearTimeout(hurtTimer);
            hurtTimer = setTimeout(() => setHurt(false), 350);
          }
        }
        // The attacker's own phone already showed it.
        if (h.from === ENV) {
          if (!(id === myId || bots.has(id))) scene.hitFlash(id);
        } else if (h.from !== myId && !bots.has(h.from)) {
          const v = viewOf(s, id);
          showHit(v.x, v.y, v.z, id, { parried: !!h.pr, kick: !!h.kk, blocked: h.b, guardBreak: !!h.g });
        }
      }

      // Back on their feet («rey» after a while, the fallen between waves): where they start again.
      for (const id of ids) {
        const up = alive(s, id);
        const was = wasAlive.get(id);
        wasAlive.set(id, up);
        if (!up || was !== false) continue;
        deadAt.delete(id);
        const sp = spawnFor(s, id);
        if (id === myId && me) {
          me.reset(sp.x, sp.z, sp.yaw);
          look.yaw = sp.yaw;
          look.pitch = 0;
        } else bots.get(id)?.f.reset(sp.x, sp.z, sp.yaw);
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

      // The round's clock on the map: the traps, and the events (banner, weapons, rain, ring, fog).
      const roundT = s.status === "waiting" ? -1 : (now - s.startedAt) / 1000;
      const live = s.status === "fighting" && now >= s.startedAt;
      const ev = live && events.length ? eventAt(events, roundT, EVENT_LEAD) : null;
      if (ev && ev.n !== shownEvent) {
        shownEvent = ev.n;
        const info = EVENT_INFO[ev.kind];
        setBanner({ title: info.title, sub: info.sub, n: ev.n });
        clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => setBanner(null), 4200);
        audio?.horn();
        audio?.cheer(0.6);
        scene.cheer();
      }
      if (ev?.kind === "armas" && roundT >= ev.at && s.evDrop < ev.n) {
        const drop = eventItems(map, s.seed, ev);
        once(`armas:${key}:${ev.n}`, () => dropEventItems(roomId, key, ev.n, drop), 3000);
      }
      if (ev?.kind === "lluvia" && rain?.n !== ev.n) rain = { n: ev.n, drops: rainDrops(map, s.seed, ev) };
      const ringR = live && events.length ? ringRadius(map, events, roundT) : null;
      const fogNow = events.length && s.status !== "waiting" ? fogAt(events, roundT) : 0;
      const rainShown: WorldFx["rain"] = [];
      const landing: RainDrop[] = [];
      if (rain && live) {
        for (const d of rain.drops) {
          if (roundT >= d.t - EVENT_LEAD && roundT < d.t) rainShown.push({ x: d.x, y: topAt(map, d.x, d.z), z: d.z, k: 1 - (d.t - roundT) / EVENT_LEAD });
          if (d.t > lastT && d.t <= roundT) landing.push(d);
        }
      }
      lastT = roundT;
      for (const d of landing) {
        const y = topAt(map, d.x, d.z);
        scene.burst(d.x, (Number.isFinite(y) ? y : 0) + 0.1, d.z, "dust");
        const [vol, pan] = where(d.x, d.z);
        audio?.thunk(vol, pan);
      }
      /** For bots: what hurts there now or soon. */
      const dangerAt = (x: number, z: number) =>
        trapDanger(map, roundT, x, z, 1.2, s.mode === "rey") || (ringR !== null && Math.hypot(x, z) > ringR - 1.2) || rainShown.some((d) => Math.hypot(x - d.x, z - d.z) < RAIN_R + 0.6);

      // Physics, at a fixed step.
      const myAlive = !!me && alive(s, myId);
      if (fighting) {
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          const solidsFor = (self: string) =>
            ids
              .filter((o) => o !== self && alive(s, o))
              .map((o) => {
                const v = viewOf(s, o);
                return { x: v.x, z: v.z, r: FIGHTER_RADIUS };
              });
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
              kick: c.kick,
              special: c.special && specialReady(s, myId),
            };
            const before = me.act;
            const evs = me.step(input, gearOf(s, myId), STEP, solidsFor(myId), map);
            // A new act (or the same one again, like a second flinch): note when it started.
            if (me.act !== before || me.actT < myLastT) myActAt = serverNow() - me.actT * 1000;
            myLastT = me.actT;
            handleEvents(s, myId, me, evs);
          }
          // Fallen into the abyss: keep falling.
          if (me && !myAlive && me.y < -0.2) me.step(IDLE_INPUT, gearOf(s, myId), STEP, [], map);
          for (const [id, run] of bots) {
            if (!alive(s, id)) {
              if (run.f.y < -0.2) run.f.step({ ...IDLE_INPUT, yaw: run.f.yaw }, gearOf(s, id), STEP, [], map);
              continue;
            }
            // «Supervivencia»: the next wave waits at its gate.
            if (s.mode === "supervivencia" && s.roster[id] === "blue" && serverNow() < s.waveAt) continue;
            const team = sideOf(s, id);
            const enemies: BotEnemy[] = ids
              .filter((o) => sideOf(s, o) !== team)
              .map((o) => {
                const v = viewOf(s, o);
                return { ...v, act: v.act as BotEnemy["act"], actAt: v.actAt, actLen: v.actLen, weapon: gearOf(s, o).w };
              });
            const items = Object.entries(s.items).map(([iid, it]) => ({ id: iid, ...it }));
            const ready = specialReady(s, id);
            const world = {
              enemies,
              items,
              now: serverNow(),
              special: ready ? SPECIAL_MAX : 0,
              map,
              danger: dangerAt,
              hill: s.mode === "rey" ? map.hill : undefined,
              sight: fogNow > 0.4 ? 11 : undefined,
              t: roundT,
            };
            const { input, pick } = run.remote
              ? padInput(run.f, run.remote, pads[id] ?? NO_PAD, world, STEP, ready)
              : botInput(run.f, gearOf(s, id), s.hp[id] ?? 0, run.mind, world, STEP, Math.random);
            input.special = input.special && ready;
            if (pick && performance.now() - run.pickAt > 800) {
              run.pickAt = performance.now();
              pickItem(roomId, key, id, pick, run.f.x, run.f.z).catch(console.error);
            }
            const before = run.f.act;
            const evs = run.f.step(input, gearOf(s, id), STEP, solidsFor(id), map);
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

      settleBlows(s);

      /**
       * The map's damage on the fighters this client runs (me, my bots; the
       * big screen: everyone): traps, outside the ring, the rain landing.
       * Each source and tick is sent once; the transaction keeps it once.
       */
      const hurtLocal = (id: string, f: Fighter) => {
        if (!live || !alive(s, id)) return;
        const lift = Number.isFinite(f.floor) ? f.y - f.floor : 99;
        const send = (src: string, tag: number, damage: number) => {
          const k = `${id}:${src}:${tag}`;
          if (envSent.has(k)) return false;
          envSent.add(k);
          envHit(roomId, key, id, src, tag, damage, f.x, f.z).catch(console.error);
          return true;
        };
        for (const h of trapHits(map, roundT, f.x, f.z, lift, FIGHTER_RADIUS)) {
          if (send(h.src, h.tag, h.damage) && h.push) {
            f.shove(h.push[0], h.push[1]);
            const [vol, pan] = where(f.x, f.z);
            audio?.clang(vol * 0.8, pan);
            scene.burst(f.x, f.y + 0.5, f.z, "hit");
          }
        }
        if (ringR !== null && Math.hypot(f.x, f.z) > ringR) send("ring", Math.floor(roundT), RING_DAMAGE);
        for (const d of landing) {
          if (Math.hypot(f.x - d.x, f.z - d.z) <= RAIN_R && lift < 2.5 && !(f.blocking && gearOf(s, id).sh)) send("rain", Math.round(d.t * 1000), RAIN_DAMAGE);
        }
      };
      if (me) hurtLocal(myId, me);
      for (const [id, run] of bots) hurtLocal(id, run.f);

      // «Rey»: who holds the hill; the bot host (or the big screen) counts its seconds, anyone if nobody has for a while.
      const hold =
        s.mode === "rey" && s.status === "fighting"
          ? hillHolder(
              map,
              ids.map((id) => {
                const v = viewOf(s, id);
                return { side: sideOf(s, id), x: v.x, z: v.z, y: v.y, alive: v.alive };
              })
            )
          : "";
      if (hold !== lastHolder) {
        lastHolder = hold;
        setHolder(hold);
      }
      if (live && s.mode === "rey" && (hold === "red" || hold === "blue")) {
        const sec = Math.floor(roundT);
        if ((screen || botHost || sec - s.hillSec > 3) && sec > s.hillSec) once(`hill:${key}:${sec}`, () => hillTick(roomId, key, sec, hold), 5000);
      }
      // «Rey»: the fallen I run get up again after a while.
      if (s.mode === "rey" && live) {
        for (const id of [myId, ...bots.keys()]) {
          const at = s.downAt[id];
          if (at === undefined || alive(s, id) || now < at + RESPAWN_MS) continue;
          once(`respawn:${id}:${at}`, () => respawnFighter(roomId, key, id), 1500);
        }
      }

      // Arrows I (or my bots) shot: fly them and decide what they hit.
      for (let i = myArrows.length - 1; i >= 0; i--) {
        const ar = myArrows[i];
        const tNow = (serverNow() - ar.t0) / 1000;
        const views = ids.map((o) => viewOf(s, o));
        const res = flyArrow(ar.a, ar.done, tNow, ar.team, views, map);
        ar.done = tNow;
        if (!res.stop) continue;
        ar.down();
        myArrows.splice(i, 1);
        const [x, y, z] = arrowAt(ar.a, tNow);
        const [vol, pan] = where(x, z);
        if (res.strike) {
          const v = views.find((o) => o.id === res.strike!.target)!;
          scene.burst(v.x, Math.max(v.y + 0.8, y), v.z, res.strike.blocked ? "block" : "hit");
          if (!res.strike.blocked) scene.hitFlash(v.id);
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
          const sp = spawnFor(s, id);
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
      if (s.status === "fighting" && now > s.startedAt + roundSeconds(s) * 1000) once("timeout", () => timeoutRound(roomId, key));
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
      scene.setWorld({ t: roundT, hill: s.mode === "rey" ? hold : undefined, ring: ringR, fog: fogNow, rain: rainShown });
      scene.setFighters(
        Object.fromEntries(
          ids.map((id) => [id, { team: s.roster[id], label: id === myId ? "Tú" : fighterName(s, id), color: s.mode === "todos" ? fighterColor(s, id) : undefined }])
        )
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
        const myTeam = sideOf(s, myId);
        const standing = ids.filter((id) => alive(s, id));
        const mates = standing.filter((id) => sideOf(s, id) === myTeam);
        const pool = mates.length ? mates : standing.length ? standing : ids;
        if (pool.length) {
          follow = pool[spectateRef.current % pool.length];
          watching = fighterName(s, follow, myId);
        }
      }
      const fv = follow ? viewOf(s, follow) : null;
      const fe = 1 - Math.exp(-dt * 8);
      feel.roll += ((myAlive ? -c.mx * 0.035 : 0) - feel.roll) * fe;
      const lunging = me?.act === "special" && me.specialKind === "estocada" && me.actT >= SPECIALS.estocada.windup;
      feel.fov += (72 + (me?.sprinting ? 9 : 0) + (me?.act === "dodge" || lunging ? 12 : 0) - feel.fov) * fe;
      // Watching someone else: the camera turns slower than their knight (bots turn sharply,
      // and remote poses arrive in bursts), so it glides instead of jerking.
      if (follow !== myId && fv) {
        if (follow !== specFollow) {
          specFollow = follow;
          specYaw = fv.yaw;
        }
        let d = fv.yaw - specYaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        specYaw += d * (1 - Math.exp(-dt * 3));
      }
      const camLook = follow === myId ? { ...look, roll: feel.roll, fov: feel.fov } : { yaw: specYaw, pitch: -0.22, smooth: true };
      const mode: ArenaCamera = follow === myId && myAlive ? cameraRef.current : "tercera";
      if (fv && !screen) {
        earX = fv.x;
        earZ = fv.z;
        earYaw = camLook.yaw;
      }
      if (screen) {
        const views = splitPeople(s);
        const wantTags = views.length ? 1 : 1.8;
        if (tagScale !== wantTags) {
          tagScale = wantTags;
          scene.setTagScale(wantTags);
        }
        if (!views.length) {
          scene.renderOverview(ids.filter((id) => alive(s, id)), dt);
        } else {
          const rects = splitRects(views.length);
          scene.renderSplit(
            views.map((id, i) => {
              // Where each person looks (their drags), or the fighter's facing until their run starts.
              const look = bots.get(id)?.remote;
              const v = viewOf(s, id);
              return { id, yaw: look?.yaw ?? v.yaw, pitch: look?.pitch ?? 0, rect: rects[i] };
            }),
            dt
          );
        }
      } else scene.render(follow, mode, camLook, dt);

      // Kicks and specials seen this frame (anyone's): their sounds, and the slam shakes the ground nearby.
      for (const fx of scene.takeFx()) {
        const [vol, pan] = where(fx.x, fx.z);
        const mine = fx.id === myId || bots.has(fx.id);
        if (fx.kind === "kick") audio?.kick(vol, pan);
        else if (fx.kind === "special" && fx.special) audio?.charge(SPECIALS[fx.special].windup, vol, pan);
        else if (fx.kind === "specialHit") {
          if (fx.special === "terremoto") {
            audio?.slam(vol, pan);
            const d = Math.hypot(fx.x - earX, fx.z - earZ);
            if (d < 7) scene.jolt(1.2 * (1 - d / 7));
            if (!screen) {
              audio?.cheer(0.3);
              scene.cheer();
            }
          } else if (fx.special === "torbellino") audio?.whirl(vol, pan);
          else if (fx.special === "estocada") audio?.lunge(vol, pan);
          else if (fx.special === "triple" && !mine) audio?.bow(vol, pan);
        }
      }

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
          special: s.special[myId] ?? 0,
          kick: me ? Math.round((1 - me.kickCd / KICK_COOLDOWN) * 10) / 10 : 1,
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
      clearTimeout(calloutTimer);
      clearTimeout(bannerTimer);
      unsubPoses();
      unsubArrows();
      unsubPads();
      mySend?.close();
      for (const run of bots.values()) run.send.close();
      for (const a of myArrows) a.down();
      scene.dispose();
    };
  }, [roomId, myId, gameNo, fine, quality, screen]);

  const now = clock || serverNow();
  const counting = state.status === "fighting" && now < state.startedAt;
  const count = Math.ceil((state.startedAt - now) / 1000);
  const justStarted = state.status === "fighting" && now >= state.startedAt && now - state.startedAt < 1200;
  const roundLeft = state.startedAt + roundSeconds(state) * 1000 - now;
  const mode = state.mode;
  const respawnIn = mode === "rey" && inRoster && hud && !hud.alive && state.downAt[myId] !== undefined ? Math.max(0, Math.ceil((state.downAt[myId] + RESPAWN_MS - now) / 1000)) : null;
  const wavePause = mode === "supervivencia" && state.status === "fighting" && state.wave > 1 && now < state.waveAt ? Math.ceil((state.waveAt - now) / 1000) : null;
  const bow = hud?.gear.w === "arco";
  const specialFull = !!hud && hud.special >= SPECIAL_MAX;
  const specialName = hud ? SPECIALS[specialOf(hud.gear.w)].label : "";

  return (
    <div ref={wrapRef} className="fixed inset-0 z-40 select-none overflow-hidden bg-[#f2c48d]" style={{ touchAction: "none" }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Big screen, split: each person's name and health on their view, and the lines between views. */}
      {screen && splitPeople(state).length > 0 && state.status !== "waiting" && (
        <div className="pointer-events-none absolute inset-0 z-10">
          {splitPeople(state).map((id, i, all) => {
            const [x, y, w, h] = splitRects(all.length)[i];
            const color = fighterColor(state, id);
            const hp = state.hp[id] ?? 0;
            return (
              <div
                key={id}
                className="absolute border border-black/70"
                style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }}
              >
                <div className={`absolute flex w-64 flex-col gap-1.5 rounded-2xl bg-slate-950/70 px-4 py-2.5 backdrop-blur ${y > 0 ? "left-4 top-4" : "bottom-4 left-4"}`}>
                  <span className="truncate text-xl font-bold" style={{ color }}>
                    {fighterName(state, id)}
                  </span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-white/15">
                    <span className="block h-full rounded-full transition-all" style={{ width: `${(hp / MAX_HP) * 100}%`, background: color }} />
                  </span>
                </div>
                {state.status === "fighting" && hp <= 0 && (
                  <p className="absolute inset-0 flex items-center justify-center font-display text-4xl text-white/80">
                    {mode === "rey" ? "Vuelve en un momento" : "Eliminado"}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

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
        <TouchControls controlsRef={controlsRef} canPick={!!hud.near} pickLabel={hud.nearLabel} bow={bow} special={hud.special} kick={hud.kick} />
      )}

      {/* Parries, broken guards. */}
      {callout && !screen && (
        <div className="pointer-events-none absolute inset-x-0 top-[22%] z-20 flex justify-center">
          <span
            key={callout.n}
            className="animate-celebration-in font-display text-4xl drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] sm:text-5xl"
            style={{ color: callout.color }}
          >
            {callout.text}
          </span>
        </div>
      )}

      {/* Crosshair. */}
      {hud?.alive && state.status === "fighting" && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2">
          <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-white/80 shadow" />
          <div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-white/80 shadow" />
        </div>
      )}

      {/* Top bar: back, score and round, options (bigger on a TV). */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-2.5"
        style={screen ? { zoom: 1.6 } : undefined}
      >
        <div className="pointer-events-auto flex flex-col gap-1.5">
          <Link href="/" aria-label="Volver a Talo" className="w-fit rounded-xl bg-slate-950/60 p-2 backdrop-blur">
            <TaloMark className="h-5 w-5" />
          </Link>
          {!(screen && splitPeople(state).length) && <SideBars state={state} side="left" myId={myId} />}
        </div>

        <div className="flex flex-col items-center gap-1">
          <ScoreBoard state={state} myId={myId} clock={state.status === "fighting" && !counting && Number.isFinite(roundLeft) ? formatClock(roundLeft) : ""} holder={holder} />
          {banner && (
            <div key={banner.n} className="animate-celebration-in mt-2 flex flex-col items-center rounded-2xl bg-slate-950/75 px-5 py-2.5 text-center backdrop-blur">
              <span className="font-display text-2xl text-amber-300 drop-shadow sm:text-3xl">{banner.title}</span>
              <span className="text-xs text-slate-200 sm:text-sm">{banner.sub}</span>
            </div>
          )}
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <div className="flex gap-1.5">
            <button onClick={toggleSound} aria-label={sound === "on" ? "Silenciar" : "Activar sonido"} className="rounded-xl bg-slate-950/60 p-2 text-white backdrop-blur">
              {sound === "on" ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <QualityButton quality={quality} onToggle={toggleQuality} />
            {!screen && (
              <button onClick={toggleCamera} className="flex items-center gap-1 rounded-xl bg-slate-950/60 px-2.5 py-2 text-xs text-white backdrop-blur">
                <Eye className="h-4 w-4" /> {camera === "primera" ? "1ª persona" : "3ª persona"}
              </button>
            )}
            <FullscreenButton className="rounded-xl bg-slate-950/60 p-2 text-white backdrop-blur" />
          </div>
          {!(screen && splitPeople(state).length) && <SideBars state={state} side="right" myId={myId} />}
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
          {/* The special meter: fills with hits, blocks and parries. */}
          <div className="mt-1.5 flex items-center gap-1.5">
            <Sparkles className={`h-3 w-3 shrink-0 ${specialFull ? "text-yellow-300" : "text-violet-300"}`} />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all ${specialFull ? "animate-pulse bg-yellow-300" : "bg-violet-400"}`}
                style={{ width: `${(Math.min(SPECIAL_MAX, hud.special) / SPECIAL_MAX) * 100}%` }}
              />
            </div>
          </div>
          {specialFull && hud.alive && (
            <p className="mt-1 text-xs font-semibold text-yellow-200">
              {fine ? "X: " : ""}
              {specialName} listo
            </p>
          )}
          {bow && hud.draw > 0 && (
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-sky-300" style={{ width: `${hud.draw * 100}%` }} />
            </div>
          )}
          {fine && hud.near && <p className="mt-1 text-xs text-amber-200">E: agarrar {hud.nearLabel}</p>}
        </div>
      )}

      {fine && inRoster && !locked && state.status === "fighting" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-20 flex justify-center px-4">
          <p className="flex max-w-3xl items-center gap-2 rounded-xl bg-slate-950/75 px-4 py-2 text-sm text-white backdrop-blur">
            <MousePointerClick className="h-4 w-4" />
            Haz clic en la arena para pelear · WASD moverte · Shift correr · clic atacar (de nuevo = combo) · clic derecho o F bloquear (justo antes del golpe = parada perfecta) · R o rueda patear · X golpe especial · Q esquivar · E agarrar · espacio saltar · V cámara · Esc soltar el mouse
          </p>
        </div>
      )}

      {!fine && !screen && (
        <p className="pointer-events-none absolute inset-x-0 top-24 z-20 hidden items-center justify-center gap-1.5 text-xs text-white drop-shadow portrait:flex">
          <RotateCw className="h-3.5 w-3.5" /> Gira el teléfono para pelear mejor
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

      {/* «Rey»: back soon. «Supervivencia»: between waves. */}
      {respawnIn !== null && state.status === "fighting" && !screen && (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] z-20 flex justify-center">
          <p className="rounded-2xl bg-slate-950/70 px-6 py-3 font-display text-3xl text-white backdrop-blur">{respawnIn > 0 ? `Vuelves en ${respawnIn}` : "¡De vuelta!"}</p>
        </div>
      )}
      {wavePause !== null && (
        <div className="pointer-events-none absolute inset-x-0 top-[30%] z-20 flex flex-col items-center gap-1 text-center">
          <p className="animate-celebration-in font-display text-4xl text-lime-300 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] sm:text-5xl">¡Oleada {state.wave - 1} superada!</p>
          <p className="rounded-full bg-slate-950/70 px-4 py-1 text-sm text-white backdrop-blur">
            Se viene la oleada {state.wave} en {wavePause} s · los caídos vuelven a pelear
          </p>
        </div>
      )}

      {/* Watching (fell, or not fighting this match). */}
      {!screen && hud && !hud.alive && state.status === "fighting" && hud.watching && respawnIn === null && (
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
          <RoundBanner state={state} myId={myId} />
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

/** Fighters with their health, in a corner. */
function Bars({ state, ids, color, right, myId }: { state: ArenaState; ids: string[]; color: (id: string) => string; right: boolean; myId: string }) {
  return (
    <div className={`flex flex-col gap-1 ${right ? "items-end" : ""}`}>
      {ids.map((id) => {
        const hp = state.hp[id] ?? 0;
        const c = color(id);
        const back = state.mode === "rey" && hp <= 0 && state.downAt[id] !== undefined;
        return (
          <div key={id} className="w-28 rounded-lg bg-slate-950/55 px-1.5 py-1 backdrop-blur sm:w-36">
            <p className={`truncate text-[11px] font-semibold ${hp > 0 ? "text-white" : back ? "text-slate-400" : "text-slate-500 line-through"}`} style={{ color: hp > 0 ? c : undefined }}>
              {fighterName(state, id, myId)}
              {isBot(id) && !state.online && state.mode !== "supervivencia" && <span className="font-normal text-slate-400"> · bot</span>}
            </p>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full transition-all" style={{ width: `${hp}%`, backgroundColor: c }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** One corner's fighters: a team (red left, blue right), or in «todos» half of everyone each. */
function SideBars({ state, side, myId }: { state: ArenaState; side: "left" | "right"; myId: string }) {
  if (state.mode === "todos") {
    const all = allFighters(state);
    const half = Math.ceil(all.length / 2);
    return <Bars state={state} ids={side === "left" ? all.slice(0, half) : all.slice(half)} color={(id) => fighterColor(state, id)} right={side === "right"} myId={myId} />;
  }
  const team: TeamId = side === "left" ? "red" : "blue";
  let ids = teamFighters(state, team);
  // «Supervivencia»: the wave's bots standing (the fallen ones aren't worth a line).
  if (state.mode === "supervivencia" && team === "blue") ids = ids.filter((id) => (state.hp[id] ?? 0) > 0);
  return <Bars state={state} ids={ids} color={() => teamInfo(team).color} right={side === "right"} myId={myId} />;
}

/** The score at the top, by mode: rounds, the hill's seconds, or the wave. */
function ScoreBoard({ state, myId, clock, holder }: { state: ArenaState; myId: string; clock: string; holder: string }) {
  const box = "flex items-center gap-3 rounded-2xl bg-slate-950/70 px-4 py-1.5 font-display text-2xl font-bold text-white backdrop-blur";
  const note = "rounded-full bg-slate-950/50 px-2 text-[11px] text-slate-200";
  if (state.mode === "todos") {
    const mine = state.fscore[myId] ?? 0;
    return (
      <>
        <div className={box}>
          <span className="text-sm font-medium text-slate-300">
            Ronda {state.round}
            {clock && <> · {clock}</>}
          </span>
        </div>
        <p className={note}>
          Todos contra todos · gana quien gane {state.need} {state.need === 1 ? "ronda" : "rondas"}
          {myId in state.roster ? ` · llevas ${mine}` : ""}
        </p>
      </>
    );
  }
  if (state.mode === "rey") {
    const zone = holder === "red" || holder === "blue" ? `La zona es del ${teamInfo(holder).label}` : holder === "contest" ? "La zona está en disputa" : "La zona está libre";
    return (
      <>
        <div className={box}>
          <span style={{ color: teamInfo("red").color }}>{state.hill.red}</span>
          <span className="text-sm font-medium text-slate-300">
            Rey de la colina
            {clock && <> · {clock}</>}
          </span>
          <span style={{ color: teamInfo("blue").color }}>{state.hill.blue}</span>
        </div>
        <div className="flex w-56 gap-1">
          {(["red", "blue"] as TeamId[]).map((t) => (
            <div key={t} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-900/80">
              <div className="h-full rounded-full transition-all" style={{ width: `${(Math.min(HILL_TARGET, state.hill[t]) / HILL_TARGET) * 100}%`, background: teamInfo(t).color }} />
            </div>
          ))}
        </div>
        <p className={note}>
          {zone} · gana el primero en llegar a {HILL_TARGET}
        </p>
      </>
    );
  }
  if (state.mode === "supervivencia") {
    const left = Object.keys(state.roster).filter((id) => state.roster[id] === "blue" && (state.hp[id] ?? 0) > 0).length;
    return (
      <>
        <div className={box}>
          <span className="text-sm font-medium text-slate-300">Oleada</span>
          <span className="text-amber-300">{state.wave}</span>
        </div>
        <p className={note}>
          Supervivencia · {left} {left === 1 ? "enemigo" : "enemigos"} en pie
        </p>
      </>
    );
  }
  return (
    <>
      <div className={box}>
        <span style={{ color: teamInfo("red").color }}>{state.score.red}</span>
        <span className="text-sm font-medium text-slate-300">
          Ronda {state.round}
          {clock && <> · {clock}</>}
        </span>
        <span style={{ color: teamInfo("blue").color }}>{state.score.blue}</span>
      </div>
      <p className={note}>Gana el primero en llegar a {state.need}</p>
    </>
  );
}

/** The round's result, by mode. */
function RoundBanner({ state, myId }: { state: ArenaState; myId: string }) {
  let text: string;
  let color = "#e2e8f0";
  if (state.mode === "todos") {
    text = state.champ ? (state.champ === myId ? "¡Ganaste la ronda!" : `¡${fighterName(state, state.champ)} gana la ronda!`) : "Ronda sin ganador";
    if (state.champ) color = fighterColor(state, state.champ);
  } else if (state.mode === "supervivencia") {
    const n = wavesSurvived(state);
    text = `Cayeron todos · ${n} ${n === 1 ? "oleada" : "oleadas"}`;
  } else if (state.roundWinner === "draw" || !state.roundWinner) {
    text = "Ronda empatada";
  } else {
    const t = teamInfo(state.roundWinner);
    color = t.color;
    text = state.mode === "rey" ? `¡El ${t.label} es el rey de la colina!` : `¡Ronda para el ${t.label}!`;
  }
  return (
    <p className="animate-celebration-in rounded-3xl bg-slate-950/70 px-8 py-5 text-center font-display text-4xl font-bold backdrop-blur" style={{ color }}>
      {text}
    </p>
  );
}

/** The end of the match: who won (by mode), knockouts, and play again or change teams. */
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
  const mode = state.mode;
  const winner = state.winner ? teamInfo(state.winner) : null;
  const mine = state.roster[myId];
  let title: string;
  let color = winner?.color ?? "#e2e8f0";
  let sub: string;
  let ids = Object.keys(state.roster).sort((a, b) => (state.kills[b] ?? 0) - (state.kills[a] ?? 0));
  const places = new Map<string, number>();
  if (mode === "todos") {
    const champ = state.champion;
    title = !champ ? "Terminó la batalla" : champ === myId ? "🏆 ¡Ganaste!" : `🏆 ¡Ganó ${fighterName(state, champ)}!`;
    color = champ ? fighterColor(state, champ) : "#e2e8f0";
    sub = "Todos contra todos";
    const ranking = ffaRanking(state);
    ids = ranking.map((r) => r.id);
    for (const r of ranking) places.set(r.id, r.place);
  } else if (mode === "supervivencia") {
    const n = wavesSurvived(state);
    const people = ids.filter((id) => !isBot(id));
    title = `${people.length > 1 ? "Sobrevivieron" : "Sobreviviste"} ${n} ${n === 1 ? "oleada" : "oleadas"}`;
    color = "#bef264";
    sub = `Cayeron en la oleada ${state.wave}`;
    ids = people;
  } else {
    title = !winner ? "Terminó la batalla" : mine ? (mine === state.winner ? "🏆 ¡Ganaron!" : "Perdieron esta vez") : `🏆 ¡Ganó el ${winner.label}!`;
    sub =
      mode === "rey"
        ? `Rey de la colina · ${teamInfo("red").label} ${state.hill.red} – ${state.hill.blue} ${teamInfo("blue").label}`
        : `${winner?.label ?? ""} ${state.score[state.winner || "red"]} – ${state.score[state.winner === "red" ? "blue" : "red"]}`;
  }
  const connected = Object.keys(presence);
  return (
    <div className="animate-celebration-in flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl bg-slate-950/90 p-5 text-center shadow-2xl ring-1 ring-white/10 backdrop-blur">
      <p className="font-display text-3xl font-bold" style={{ color }}>
        {title}
      </p>
      <p className="text-sm text-slate-400">{sub}</p>
      <ol className="flex w-full flex-col gap-1.5">
        {ids.map((id) => (
          <li key={id} className="flex items-center gap-2 rounded-xl bg-slate-900/80 px-3 py-2 text-sm">
            {places.has(id) && <span className="w-5 shrink-0 font-mono text-slate-400">{places.get(id)}.</span>}
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: fighterColor(state, id) }} />
            <span className="min-w-0 flex-1 truncate text-left text-slate-100">
              {fighterName(state, id, myId)}
              {isBot(id) && !state.online && <span className="text-slate-500"> · bot</span>}
              {!isBot(id) && state.wins[id] ? <span className="text-slate-500"> · {state.wins[id]} ganadas</span> : null}
            </span>
            {mode === "todos" && <span className="font-mono text-amber-200">★ {state.fscore[id] ?? 0}</span>}
            <span className="font-mono text-slate-300">⚔ {state.kills[id] ?? 0}</span>
          </li>
        ))}
      </ol>
      {state.online ? (
        <NextBattle nextAt={state.nextAt} />
      ) : (
        <div className="flex w-full max-w-xs flex-col gap-2">
          <button onClick={() => startMatch(roomId, meta, connected)} className={PRIMARY_BUTTON}>
            {mode === "supervivencia" ? "Otra vez" : "Revancha"}
          </button>
          <button onClick={() => backToWaiting(roomId, state.gameNo)} className={SECONDARY_BUTTON}>
            Cambiar equipos o configuración
          </button>
        </div>
      )}
    </div>
  );
}

/** Public arena: when the next battle starts, and a way out. */
function NextBattle({ nextAt }: { nextAt: number }) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 500);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((nextAt - now) / 1000));
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-2">
      <p className="text-sm text-slate-300">{left > 0 ? `La próxima batalla empieza en ${left} s` : "Armando la próxima batalla…"}</p>
      <Link href="/arena-medieval" className="text-xs text-slate-400 underline-offset-2 hover:text-white hover:underline">
        Salir de la arena
      </Link>
    </div>
  );
}
