"use client";

import { useEffect, useRef, useState } from "react";
import {
  CLOSE_GRACE_MS,
  CRASH_DROP_SHARE,
  CUT_DROP_SHARE,
  DROP_LIFE_MS,
  clearDrops,
  dropRemains,
  eatDrop,
  reportCrash,
  subscribeCrashes,
  subscribeDrops,
  type ViboraDeath,
  type ViboraDrop,
  ONLINE_CROWD,
  addOnlineBot,
  removeOnlineBot,
  submitBest,
  subscribeTop,
  type TopEntry,
  closeVibora,
  cutSnake,
  decodeBody,
  eatPellet,
  encodeBody,
  isBot,
  openPose,
  sendBotPoses,
  snakeInfo,
  subscribeCuts,
  subscribeFood,
  subscribePoses,
  type ViboraCut,
  type ViboraPose,
  type ViboraState,
} from "@/lib/vibora";
import {
  BOOST_MIN,
  BOOST_SPEED,
  CUT_COOLDOWN_MS,
  SEG,
  SPEED,
  applyCut,
  bodyOf,
  eatReach,
  findCrash,
  findCut,
  massForLength,
  newBrain,
  pelletAt,
  radiusOf,
  spawnSnake,
  spreadDrops,
  stepSnake,
  thinkBot,
  type BotBrain,
  type BotView,
  type Pellet,
  type Snake,
} from "@/lib/viboraSim";
import { serverNow } from "@/lib/serverTime";
import { playSound } from "@/lib/sfx";
import type { PresenceMap } from "@/lib/presence";
import { useCountdownTicks } from "@/hooks/useSound";
import { useWakeLock } from "@/components/carreras/Controller";
import { useFinePointer } from "@/components/arena/Controls";
import { Painter } from "@/lib/viboraDraw";
import Hud, { type Crash, type FeedItem, type HudData } from "./Hud";

/** A snake as drawn and hit this frame: local (mine, my bots) or from its pose. */
interface View {
  id: string;
  name: string;
  color: string;
  /** Head first, flat. */
  body: number[];
  a: number;
  mass: number;
  r: number;
  shielded: boolean;
  boosting: boolean;
  burning: boolean;
}

interface Particle {
  x: number;
  y: number;
  /** Flies to this snake's head (or just fades when null). */
  to: string | null;
  color: string;
  life: number;
  vx: number;
  vy: number;
}

interface Controls {
  mouse: { x: number; y: number } | null;
  joy: { id: number; ox: number; oy: number; x: number; y: number } | null;
  /** Last direction from the joystick, kept after letting go. */
  joyAngle: number | null;
  mouseBoost: boolean;
  keyBoost: boolean;
  buttonBoost: boolean;
  left: boolean;
  right: boolean;
}

const POSE_EVERY_MS = 100;
const FEED_MS = 3800;

/** A snake rebuilt from its pose (a new bot host takes over the bots). */
function snakeFromPose(p: ViboraPose): Snake {
  const pts = [p.x, p.y, ...decodeBody(p.p)];
  const trail: number[] = [];
  // Resample the polyline every SEG.
  let need = SEG;
  for (let i = 2; i + 1 < pts.length; i += 2) {
    let ax = pts[i - 2];
    let ay = pts[i - 1];
    const bx = pts[i];
    const by = pts[i + 1];
    let len = Math.hypot(bx - ax, by - ay);
    while (len >= need) {
      ax += ((bx - ax) * need) / len;
      ay += ((by - ay) * need) / len;
      trail.push(ax, ay);
      len -= need;
      need = SEG;
    }
    need -= len;
  }
  return { x: p.x, y: p.y, a: p.a, mass: p.m, trail, boosting: false, burning: false, shieldUntil: p.sh };
}

/** The match full screen: canvas, HUD and the controls. */
export default function ViboraGame({
  roomId,
  state,
  myId,
  presence,
  presenceLoaded,
}: {
  roomId: string;
  state: ViboraState;
  myId: string;
  presence: PresenceMap;
  presenceLoaded: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const presenceRef = useRef({ presence, presenceLoaded });
  const controlsRef = useRef<Controls>({
    mouse: null,
    joy: null,
    joyAngle: null,
    mouseBoost: false,
    keyBoost: false,
    buttonBoost: false,
    left: false,
    right: false,
  });
  const [hud, setHud] = useState<HudData | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [top, setTop] = useState<TopEntry[]>([]);
  const [hint, setHint] = useState(true);
  const [crashed, setCrashed] = useState<Crash | null>(null);
  const respawnRef = useRef(false);
  const touch = !useFinePointer();

  useWakeLock();
  useCountdownTicks(hud?.countdown ?? (hud && hud.secondsLeft !== null && hud.secondsLeft <= 10 ? hud.secondsLeft : null), 10);
  const online = state.online;
  useEffect(() => (online ? subscribeTop(setTop) : undefined), [online]);
  // Online there's no countdown to show the controls on: a few seconds at the start.
  useEffect(() => {
    const t = setTimeout(() => setHint(false), 9000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    presenceRef.current = { presence, presenceLoaded };
  }, [presence, presenceLoaded]);

  // Controls: the mouse points (click or space boosts); a finger drags a
  // joystick from wherever it lands; arrows / A-D turn.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const c = controlsRef.current;
    const local = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      // Buttons over the map are their own controls.
      if ((e.target as Element).closest("[data-control]")) return;
      const p = local(e);
      if (e.pointerType === "mouse") {
        c.mouse = p;
        if (e.button === 0) c.mouseBoost = true;
      } else if (!c.joy) {
        c.joy = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
      }
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      if (e.pointerType === "mouse") c.mouse = p;
      else if (c.joy && c.joy.id === e.pointerId) {
        c.joy.x = p.x;
        c.joy.y = p.y;
        if (Math.hypot(p.x - c.joy.ox, p.y - c.joy.oy) > 8) c.joyAngle = Math.atan2(p.y - c.joy.oy, p.x - c.joy.ox);
      }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === "mouse") c.mouseBoost = false;
      else if (c.joy?.id === e.pointerId) c.joy = null;
    };
    const key = (e: KeyboardEvent, on: boolean) => {
      const k = e.key.toLowerCase();
      if (k === " ") c.keyBoost = on;
      else if (k === "arrowleft" || k === "a") c.left = on;
      else if (k === "arrowright" || k === "d") c.right = on;
      else if (k === "arrowup" || k === "w") c.keyBoost = on;
      else return;
      e.preventDefault();
    };
    const kd = (e: KeyboardEvent) => key(e, true);
    const ku = (e: KeyboardEvent) => key(e, false);
    const leave = () => (c.mouseBoost = false);
    wrap.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", leave);
    return () => {
      wrap.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", leave);
    };
  }, []);

  const gameNo = state.gameNo;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const s0 = stateRef.current;
    const { seed, radius, pellets: pelletCount } = s0;
    const painter = new Painter(ctx);
    const popups: { x: number; y: number; text: string; color: string; life: number }[] = [];
    let look = 0;

    let poses: Record<string, ViboraPose> = {};
    const decoded = new Map<string, { t: number; at: number; body: number[] }>();
    let eaten: Record<string, number> = {};
    let cuts: Record<string, ViboraCut> = {};
    let cutsLoaded = false;
    /** Last cut applied per snake I run, and last cut announced per victim. */
    const applied = new Map<string, number>();
    const announced = new Map<string, number>();

    const unsubPoses = subscribePoses(roomId, (p) => (poses = p));
    const unsubFood = subscribeFood(roomId, gameNo, (e) => (eaten = e));
    const unsubCuts = subscribeCuts(roomId, gameNo, (c) => {
      cuts = c;
      if (!cutsLoaded) {
        // Cuts from before arriving are old news, and don't touch a fresh snake.
        for (const [id, cut] of Object.entries(c)) announced.set(id, cut.n);
        if (c[myId]) applied.set(myId, Math.max(applied.get(myId) ?? 0, c[myId].n));
      }
      cutsLoaded = true;
    });
    const myPose = openPose(roomId, myId);
    let crashes: Record<string, ViboraDeath> = {};
    let crashesLoaded = false;
    const crashSeen = new Map<string, number>();
    const unsubCrashes = subscribeCrashes(roomId, gameNo, (c) => {
      if (!crashesLoaded) for (const [id, d] of Object.entries(c)) crashSeen.set(id, d.n);
      crashesLoaded = true;
      crashes = c;
    });
    let drops: Record<string, ViboraDrop> = {};
    const unsubDrops = subscribeDrops(roomId, (d) => (drops = d));

    const cache: (Pellet & { gen: number; born: number })[] = [];
    const pellet = (i: number) => {
      const gen = eaten[`f${i}`] ?? 0;
      let p = cache[i];
      if (!p || p.gen !== gen) {
        p = { ...pelletAt(seed, i, gen, radius), gen, born: p ? performance.now() : 0 };
        cache[i] = p;
      }
      return p;
    };
    const eating = new Set<string>();
    const cutting = new Set<string>();

    let me: Snake | null = null;
    /** Online: I crashed and haven't asked to play again. */
    let out = false;
    let life = { start: 0, best: 0, cuts: 0, rank: 0 };
    let lastFocus = { x: 0, y: 0 };
    let lastSweep = 0;
    const bots = new Map<string, { s: Snake; brain: BotBrain }>();
    /** Bots that crashed, so they aren't rebuilt before they leave the state. */
    const gone = new Set<string>();
    const runnersNow = (): [string, Snake][] => [
      ...(me ? [[myId, me] as [string, Snake]] : []),
      ...[...bots].map(([id, b]) => [id, b.s] as [string, Snake]),
    ];
    const particles: Particle[] = [];
    const odometer = new Map<string, { x: number; y: number; d: number }>();
    let feedKey = 0;
    let pendingFeed: FeedItem[] = [];
    let cutFlash = 0;

    let raf = 0;
    let last = performance.now();
    let lastPose = 0;
    let lastHud = 0;
    let lastEatSound = 0;
    let closeTried = 0;
    // Online: how many snakes the world wants (a random walk) and when to look again.
    let crowd = ONLINE_CROWD[0] + 1 + Math.floor(Math.random() * 3);
    let nextCrowd = 0;
    let lastTop = 0;
    const bestSent = new Map<string, number>();
    let cam = { x: 0, y: 0, zoom: 0 };
    let dpr = 1;

    const fitCanvas = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
    };

    const poseOf = (s: Snake, c: number, now: number): ViboraPose => ({
      g: gameNo,
      x: Math.round(s.x * 10) / 10,
      y: Math.round(s.y * 10) / 10,
      a: Math.round(s.a * 1000) / 1000,
      m: Math.round(s.mass * 10) / 10,
      f: (s.boosting ? 1 : 0) | (s.burning ? 2 : 0),
      p: encodeBody(s),
      sh: s.shieldUntil,
      c,
      t: now,
    });

    const localView = (id: string, s: Snake, now: number): View => {
      const info = snakeInfo(stateRef.current, id);
      return {
        id,
        name: info.name,
        color: info.color,
        body: bodyOf(s),
        a: s.a,
        mass: s.mass,
        r: radiusOf(s.mass),
        shielded: now < s.shieldUntil,
        boosting: s.boosting,
        burning: s.burning,
      };
    };

    /** Announces a new cut (everyone) and sends its pieces flying to the cutter. */
    const announce = (victim: string, cut: ViboraCut, views: View[]) => {
      const st = stateRef.current;
      const by = cut.by === myId ? "Vos" : snakeInfo(st, cut.by).name;
      const who = victim === myId ? "a vos" : `a ${snakeInfo(st, victim).name}`;
      const tone = cut.by === myId ? "good" : victim === myId ? "bad" : null;
      const verb = cut.by === myId ? "le cortaste la cola" : "le cortó la cola";
      pendingFeed.push({ key: ++feedKey, text: `${by} ${verb} ${who} · +${Math.floor(cut.gain)}`, tone, kind: "cut" });
      const v = views.find((x) => x.id === victim);
      if (!v) return;
      let acc = 0;
      for (let i = 2; i + 1 < v.body.length; i += 2) {
        acc += Math.hypot(v.body[i] - v.body[i - 2], v.body[i + 1] - v.body[i - 1]);
        if (acc < cut.keep || particles.length > 400) continue;
        if ((i / 2) % 2) continue;
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 120;
        particles.push({ x: v.body[i], y: v.body[i + 1], to: cut.by, color: v.color, life: 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
      }
    };

    /** The part of a body past `keep` (the cut-off tail). */
    const tailOf = (body: number[], keep: number) => {
      let acc = 0;
      for (let i = 2; i + 1 < body.length; i += 2) {
        acc += Math.hypot(body[i] - body[i - 2], body[i + 1] - body[i - 1]);
        if (acc >= keep) return body.slice(i);
      }
      return [];
    };

    /** A snake I run crashed (online): its remains fall and it's out. */
    const crash = (id: string, s: Snake, by: string, now: number) => {
      const st = stateRef.current;
      const info = snakeInfo(st, id);
      const body = bodyOf(s);
      dropRemains(roomId, spreadDrops(body, s.mass * CRASH_DROP_SHARE, 40), info.color);
      reportCrash(roomId, gameNo, id, info.name, by, by ? snakeInfo(st, by).name : "", s.mass).catch(console.error);
      for (let i = 0; i + 1 < body.length && particles.length < 500; i += 6) {
        const a = Math.random() * Math.PI * 2;
        const sp = 60 + Math.random() * 160;
        particles.push({ x: body[i], y: body[i + 1], to: null, color: info.color, life: 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
      }
      if (id === myId) {
        const best = Math.floor(Math.max(life.best, s.mass));
        if (best >= 20) submitBest(id, info, best).catch(console.error);
        me = null;
        out = true;
        myPose.clear();
        setCrashed({ by: by ? snakeInfo(st, by).name : "", best, seconds: Math.round((now - life.start) / 1000), cuts: life.cuts, bestRank: life.rank });
        playSound("capture");
        playSound("end");
      } else {
        bots.delete(id);
        gone.add(id);
        removeOnlineBot(roomId, id).catch(console.error);
      }
    };

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const st = stateRef.current;
      if (st.gameNo !== gameNo) return;
      const now = serverNow();
      const open = st.online || now < st.endsAt;
      const live = st.status === "playing" && now >= st.startedAt && open;
      const running = st.status === "playing" && open;

      fitCanvas();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      // ---- Remote snakes ----
      const views: View[] = [];
      for (const [id, p] of Object.entries(poses)) {
        if (p.g !== gameNo || id === myId || bots.has(id) || !(st.players[id] || st.bots[id])) continue;
        let d = decoded.get(id);
        if (!d || d.t !== p.t) {
          d = { t: p.t, at: t, body: decodeBody(p.p) };
          decoded.set(id, d);
        }
        // Moved on a bit from the last pose, so it doesn't stutter.
        const ahead = (Math.min(250, t - d.at) / 1000) * (p.f & 1 ? BOOST_SPEED : SPEED);
        const info = snakeInfo(st, id);
        views.push({
          id,
          name: info.name,
          color: info.color,
          body: [p.x + Math.cos(p.a) * ahead, p.y + Math.sin(p.a) * ahead, p.x, p.y, ...d.body],
          a: p.a,
          mass: p.m,
          r: radiusOf(p.m),
          shielded: now < p.sh,
          boosting: !!(p.f & 1),
          burning: !!(p.f & 2),
        });
      }

      // ---- My snake ----
      if (!me && running && st.players[myId] && (!out || respawnRef.current)) {
        me = spawnSnake(radius, views.map((v) => ({ x: v.body[0], y: v.body[1] })), now);
        applied.set(myId, cuts[myId]?.n ?? 0);
        out = false;
        respawnRef.current = false;
        life = { start: now, best: me.mass, cuts: 0, rank: 0 };
        setCrashed(null);
        cam = { x: me.x, y: me.y, zoom: cam.zoom };
      }
      if (me && live) {
        const c = controlsRef.current;
        let target: number | null = null;
        if (c.left || c.right) target = me.a + (c.right ? 1.2 : 0) - (c.left ? 1.2 : 0);
        else if (c.joy || (c.joyAngle !== null && !c.mouse)) target = c.joyAngle;
        else if (c.mouse) {
          const sx = (me.x - cam.x) * cam.zoom + w / 2;
          const sy = (me.y - cam.y) * cam.zoom + h / 2;
          if (Math.hypot(c.mouse.x - sx, c.mouse.y - sy) > 6) target = Math.atan2(c.mouse.y - sy, c.mouse.x - sx);
        }
        stepSnake(me, target, c.mouseBoost || c.keyBoost || c.buttonBoost, dt, radius);
        look = target ?? me.a;
      }

      // ---- Bots: the connected person with the lowest id runs them ----
      const { presence: pres, presenceLoaded: loaded } = presenceRef.current;
      const people = Object.keys(pres).filter((id) => !isBot(id)).sort();
      const botHost = loaded && people[0] === myId && running;
      if (botHost) {
        for (const id of Object.keys(st.bots)) {
          if (bots.has(id) || gone.has(id)) continue;
          const p = poses[id];
          const fromPose = p && p.g === gameNo;
          const s = fromPose ? snakeFromPose(p) : spawnSnake(radius, views.map((v) => ({ x: v.body[0], y: v.body[1] })), now);
          applied.set(id, fromPose ? p.c : (cuts[id]?.n ?? 0));
          bots.set(id, { s, brain: newBrain(id) });
          const at = views.findIndex((v) => v.id === id);
          if (at >= 0) views.splice(at, 1);
        }
        for (const id of [...bots.keys()]) if (!st.bots[id]) bots.delete(id);
        // Online, bots come and go like people, keeping the world lively.
        if (st.online && t > nextCrowd) {
          nextCrowd = t + 6000 + Math.random() * 14000;
          crowd = Math.max(ONLINE_CROWD[0], Math.min(ONLINE_CROWD[1], crowd + Math.round(Math.random() * 2 - 1)));
          const want = Math.max(0, crowd - people.length);
          const have = Object.keys(st.bots);
          if (have.length < want) {
            // A few at a time, and sooner while the world is filling up.
            const names = people.map((id) => pres[id]?.name ?? "");
            (async () => {
              for (let k = 0; k < Math.min(3, want - have.length); k++) await addOnlineBot(roomId, names);
            })().catch(console.error);
            if (want - have.length > 3) nextCrowd = t + 1500;
          } else if (have.length && (have.length > want || Math.random() < 0.12)) {
            const leaving = have.reduce((a, b) => ((bots.get(a)?.s.mass ?? 0) <= (bots.get(b)?.s.mass ?? 0) ? a : b));
            removeOnlineBot(roomId, leaving).catch(console.error);
          }
        }
      } else if (bots.size) {
        bots.clear();
      }

      // Everybody, for hits and drawing.
      if (me) views.push(localView(myId, me, now));
      for (const [id, b] of bots) views.push(localView(id, b.s, now));

      if (live && bots.size) {
        const near: Pellet[] = [];
        for (let i = 0; i < pelletCount; i++) near.push(pellet(i));
        const others: BotView[] = views.map((v) => ({ id: v.id, body: v.body, mass: v.mass, r: v.r, shielded: v.shielded }));
        for (const [id, b] of bots) {
          thinkBot(b.s, b.brain, id, others, near, radius, t);
          stepSnake(b.s, b.brain.target, b.brain.boost, dt, radius);
        }
      }

      // ---- Cuts I have to apply ----
      if (cutsLoaded) {
        const mine: [string, Snake][] = [...(me ? [[myId, me] as [string, Snake]] : []), ...[...bots].map(([id, b]) => [id, b.s] as [string, Snake])];
        for (const [id, s] of mine) {
          const cut = cuts[id];
          if (!cut || cut.n <= (applied.get(id) ?? 0)) continue;
          applied.set(id, cut.n);
          const before = s.mass;
          applyCut(s, cut.keep);
          s.shieldUntil = Math.max(s.shieldUntil, cut.at + CUT_COOLDOWN_MS);
          if (id === myId) {
            popups.push({ x: s.x, y: s.y, text: `-${Math.floor(before - s.mass)}`, color: "#fda4af", life: 1 });
            cutFlash = t;
            playSound("bad");
          }
        }
        for (const [victim, cut] of Object.entries(cuts)) {
          if (cut.n <= (announced.get(victim) ?? 0)) continue;
          announced.set(victim, cut.n);
          announce(victim, cut, views);
        }
      }

      if (crashesLoaded) {
        for (const [id, d] of Object.entries(crashes)) {
          if (d.n <= (crashSeen.get(id) ?? 0)) continue;
          crashSeen.set(id, d.n);
          if (id === myId) continue;
          const text = !d.by ? `${d.name} chocó contra el borde` : d.by === myId ? `${d.name} chocó contra vos` : `${d.name} chocó contra ${d.byName}`;
          pendingFeed.push({ key: ++feedKey, text, tone: d.by === myId ? "good" : null, kind: "crash" });
        }
      }

      // ---- Crashes (online): the edge, or a head into a head or neck ----
      if (live && st.online) {
        for (const [id, s] of runnersNow()) {
          if (now < s.shieldUntil) continue;
          if (s.burning) {
            crash(id, s, "", now);
            continue;
          }
          const r = radiusOf(s.mass);
          const hit = views.find((v) => v.id !== id && !v.shielded && findCrash(s.x, s.y, r, s.mass, v));
          if (hit) crash(id, s, hit.id, now);
        }
        if (me) life.best = Math.max(life.best, me.mass);
      }

      // ---- Eating and cutting, for the snakes I run ----
      if (live) {
        for (const [id, s] of runnersNow()) {
          const r = radiusOf(s.mass);
          for (const [key, d] of Object.entries(drops)) {
            if (eating.has(key) || now - d.at > DROP_LIFE_MS) continue;
            if (Math.abs(d.x - s.x) > 80 || Math.abs(d.y - s.y) > 80) continue;
            if (Math.hypot(d.x - s.x, d.y - s.y) > eatReach(r, d.v)) continue;
            eating.add(key);
            eatDrop(roomId, key)
              .then((ok) => {
                if (!ok) return;
                s.mass += d.v;
                if (id === myId && performance.now() - lastEatSound > 90) {
                  lastEatSound = performance.now();
                  playSound("flip");
                }
              })
              .catch(console.error);
          }
          for (let i = 0; i < pelletCount; i++) {
            const p = pellet(i);
            if (Math.abs(p.x - s.x) > 60 || Math.abs(p.y - s.y) > 60) continue;
            if (Math.hypot(p.x - s.x, p.y - s.y) > eatReach(r, p.v)) continue;
            const k = `${i}:${p.gen}`;
            if (eating.has(k)) continue;
            eating.add(k);
            eatPellet(roomId, gameNo, i, p.gen)
              .then((ok) => {
                if (!ok) return;
                s.mass += p.v;
                if (id === myId && performance.now() - lastEatSound > 90) {
                  lastEatSound = performance.now();
                  playSound("flip");
                }
              })
              .catch(console.error);
          }
          for (const v of views) {
            if (v.id === id || v.shielded || cutting.has(v.id)) continue;
            const prev = cuts[v.id];
            if (prev && now - prev.at < CUT_COOLDOWN_MS) continue;
            const keep = findCut(s.x, s.y, r, v.body, v.r, v.mass);
            if (keep === null) continue;
            const gain = Math.max(1, v.mass - massForLength(keep));
            // Online the cutter eats half at once; the rest falls for anyone.
            const eatNow = st.online ? Math.ceil(gain * (1 - CUT_DROP_SHARE)) : gain;
            const tail = st.online ? tailOf(v.body, keep) : [];
            cutting.add(v.id);
            cutSnake(roomId, gameNo, v.id, id, keep, eatNow)
              .then((ok) => {
                if (!ok) return;
                s.mass += eatNow;
                if (st.online) dropRemains(roomId, spreadDrops(tail, gain - eatNow, 16), v.color);
                if (id === myId) {
                  life.cuts++;
                  popups.push({ x: s.x, y: s.y, text: `+${eatNow}`, color: "#bef264", life: 1 });
                  playSound("capture");
                  playSound("good");
                }
              })
              .catch(console.error)
              .finally(() => setTimeout(() => cutting.delete(v.id), 400));
          }
        }
      }

      // ---- Publish ----
      if (running && t - lastPose > POSE_EVERY_MS) {
        lastPose = t;
        if (me) myPose.send(poseOf(me, applied.get(myId) ?? 0, now));
        if (bots.size) {
          const out: Record<string, ViboraPose> = {};
          for (const [id, b] of bots) out[id] = poseOf(b.s, applied.get(id) ?? 0, now);
          sendBotPoses(roomId, out);
        }
      }

      // ---- Closing ----
      // Remains nobody ate go away (the bot host sweeps them).
      if (botHost && t - lastSweep > 10_000) {
        lastSweep = t;
        clearDrops(roomId, Object.keys(drops).filter((k) => now - drops[k].at > DROP_LIFE_MS));
      }

      // ---- Today's top (online) ----
      if (st.online && live && t - lastTop > 5000) {
        lastTop = t;
        for (const [id, s] of runnersNow()) {
          const m = Math.floor(s.mass);
          if (m < 20 || m < (bestSent.get(id) ?? 0) + 5) continue;
          bestSent.set(id, m);
          submitBest(id, snakeInfo(st, id), m).catch(console.error);
        }
      }

      if (!st.online && st.status === "playing" && now > st.endsAt + CLOSE_GRACE_MS && t - closeTried > 3000) {
        closeTried = t;
        const sizes: Record<string, number> = {};
        for (const v of views) sizes[v.id] = v.mass;
        closeVibora(roomId, gameNo, sizes).catch(console.error);
      }

      // ---- Draw ----
      for (const v of views) {
        const o = odometer.get(v.id);
        if (!o) odometer.set(v.id, { x: v.body[0], y: v.body[1], d: 0 });
        else {
          o.d += Math.min(60, Math.hypot(v.body[0] - o.x, v.body[1] - o.y));
          o.x = v.body[0];
          o.y = v.body[1];
        }
      }
      if (me) lastFocus = { x: me.x, y: me.y };
      const fx = lastFocus.x;
      const fy = lastFocus.y;
      const span = 720 + Math.min(1100, (me?.mass ?? 0) * 1.8);
      const zoomGoal = Math.min(w, h) / span;
      if (!cam.zoom) cam = { x: fx, y: fy, zoom: zoomGoal };
      cam.x += (fx - cam.x) * Math.min(1, dt * 7);
      cam.y += (fy - cam.y) * Math.min(1, dt * 7);
      cam.zoom += (zoomGoal - cam.zoom) * Math.min(1, dt * 1.5);
      const z = cam.zoom;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#05040a";
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(z, z);
      ctx.translate(-cam.x, -cam.y);
      painter.arena(radius, t, st.online);

      const halfW = w / 2 / z + 40;
      const halfH = h / 2 / z + 40;
      for (let i = 0; i < pelletCount; i++) {
        const p = pellet(i);
        if (Math.abs(p.x - cam.x) > halfW || Math.abs(p.y - cam.y) > halfH) continue;
        if (eating.has(`${i}:${p.gen}`)) continue;
        painter.pellet(p.x, p.y, p.v, p.hue, p.born ? Math.min(1, (t - p.born) / 400) : 1, t, i);
      }
      for (const [key, d] of Object.entries(drops)) {
        const age = now - d.at;
        if (age > DROP_LIFE_MS || eating.has(key)) continue;
        if (Math.abs(d.x - cam.x) > halfW || Math.abs(d.y - cam.y) > halfH) continue;
        painter.drop(d.x, d.y, d.v, d.c, Math.min(1, (DROP_LIFE_MS - age) / 6000), t);
      }

      // Snakes: the small ones under, mine on top. Online, the hard part of
      // a snake near my head lights up red: that's what you must not hit.
      const leader = views.reduce<View | null>((a, v) => (!a || v.mass > a.mass ? v : a), null);
      const order = [...views].sort((a, b) => (a.id === myId ? 1 : b.id === myId ? -1 : a.mass - b.mass));
      for (const v of order) {
        const b = v.body;
        if (Math.abs(b[0] - cam.x) > halfW + lengthGuess(v) || Math.abs(b[1] - cam.y) > halfH + lengthGuess(v)) continue;
        let danger = 0;
        if (st.online && me && v.id !== myId && !v.shielded) {
          danger = Math.max(0, Math.min(1, (430 - Math.hypot(b[0] - me.x, b[1] - me.y)) / 260));
        }
        painter.snake(v, t, odometer.get(v.id)?.d ?? 0, danger, v.id === myId ? look : v.a);
      }
      // Edge sparks.
      for (const v of views) {
        if (!v.burning || Math.random() > 0.6) continue;
        const a = Math.random() * Math.PI * 2;
        particles.push({ x: v.body[0], y: v.body[1], to: null, color: "#fb7185", life: 0.6, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160 });
      }
      // Pieces of a cut flying to whoever ate them, and crash debris.
      ctx.globalCompositeOperation = "lighter";
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const target = p.to ? views.find((v) => v.id === p.to) : null;
        if (target) {
          const dx = target.body[0] - p.x;
          const dy = target.body[1] - p.y;
          const d = Math.hypot(dx, dy);
          p.vx += (dx / (d || 1)) * 900 * dt;
          p.vy += (dy / (d || 1)) * 900 * dt;
          p.vx *= 1 - Math.min(1, dt * 2.5);
          p.vy *= 1 - Math.min(1, dt * 2.5);
          p.life -= dt * 0.45;
          if (d < target.r) p.life = 0;
        } else {
          p.life -= dt * 1.6;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.min(1, p.life * 1.5);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.to ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      for (const v of views) if (v.id !== myId) painter.nameTag(v, z, v.id === leader?.id && views.length > 1);
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.life -= dt * 0.8;
        if (p.life <= 0) popups.splice(i, 1);
        else painter.popup(p.x, p.y, p.text, p.color, p.life, z);
      }
      ctx.restore();

      // Screen space: vignette (red near the edge), minimap, joystick.
      const edgeNear = me ? Math.max(0, Math.min(1, (Math.hypot(me.x, me.y) - (radius - 320)) / 300)) : 0;
      painter.vignette(w, h, edgeNear);
      const mm = Math.min(54, Math.max(38, Math.min(w, h) * 0.11));
      painter.minimap(views, radius, myId, leader?.id ?? null, { x: 14 + mm, y: h - 14 - mm, size: mm }, { x: cam.x, y: cam.y, w: w / z, h: h / z });
      const joy = controlsRef.current.joy;
      if (joy) {
        ctx.beginPath();
        ctx.arc(joy.ox, joy.oy, 44, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.28)";
        ctx.lineWidth = 2;
        ctx.stroke();
        const d = Math.hypot(joy.x - joy.ox, joy.y - joy.oy);
        const k = d > 44 ? 44 / d : 1;
        ctx.beginPath();
        ctx.arc(joy.ox + (joy.x - joy.ox) * k, joy.oy + (joy.y - joy.oy) * k, 19, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fill();
      }

      // ---- HUD, a few times a second ----
      if (t - lastHud > 200) {
        lastHud = t;
        const ranked = [...views].sort((a, b) => b.mass - a.mass);
        const rank = ranked.findIndex((v) => v.id === myId) + 1;
        if (rank && (!life.rank || rank < life.rank)) life.rank = rank;
        setHud({
          mass: Math.floor(me?.mass ?? 0),
          rank,
          total: ranked.length,
          top: ranked.slice(0, 5).map((v) => ({ id: v.id, name: v.id === myId ? "Vos" : v.name, color: v.color, mass: Math.floor(v.mass) })),
          leaderId: ranked[0]?.id ?? null,
          gap: me && rank > 1 ? Math.floor(ranked[rank - 2].mass - me.mass) + 1 : null,
          secondsLeft: st.online ? null : Math.max(0, Math.ceil((st.endsAt - now) / 1000)),
          countdown: now < st.startedAt ? Math.ceil((st.startedAt - now) / 1000) : null,
          edge: edgeNear,
          hurt: t - cutFlash < 600,
          boostReady: !!me && me.mass >= BOOST_MIN,
          boosting: !!me?.boosting,
        });
        if (pendingFeed.length) {
          const add = pendingFeed;
          pendingFeed = [];
          setFeed((f) => [...f, ...add].slice(-4));
          for (const item of add) setTimeout(() => setFeed((f) => f.filter((x) => x.key !== item.key)), FEED_MS);
        }
      }
    };

    const lengthGuess = (v: View) => v.mass * 5 + 120;

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      unsubPoses();
      unsubFood();
      unsubCuts();
      unsubCrashes();
      unsubDrops();
      myPose.close();
    };
  }, [roomId, gameNo, myId]);

  return (
    <div ref={wrapRef} className="relative flex-1 touch-none select-none overflow-hidden bg-[#05040a]" onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <Hud
        hud={hud}
        feed={feed}
        online={online}
        myId={myId}
        top={top}
        crashed={crashed}
        touch={touch}
        hint={online && hint}
        onBoost={(on) => {
          controlsRef.current.buttonBoost = on;
        }}
        onRespawn={() => {
          respawnRef.current = true;
        }}
      />
    </div>
  );
}
