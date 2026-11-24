"use client";

import { useEffect, useRef, useState } from "react";
import {
  CLOSE_GRACE_MS,
  GEM_RESPAWN_MS,
  bankBag,
  closeGolpe,
  dropDiamonds,
  getCaught,
  isBot,
  normalizeLoot,
  openPose,
  robThief,
  sameTeam,
  sendBotPoses,
  subscribeDrops,
  subscribeGems,
  subscribeLoot,
  subscribePoses,
  takeDrop,
  takeGem,
  teamOf,
  teamTotals,
  thiefInfo,
  thieves,
  type GemTaken,
  type GolpeDrop,
  type GolpePose,
  type GolpeState,
  type Loot,
} from "@/lib/golpe";
import { exitsFor, gemAt, generateMap, isWall, type GolpeMap } from "@/lib/golpeMap";
import {
  BAG_MAX,
  FROZEN_MS,
  PICK_REACH,
  SAFE_MS,
  STEAL_COOLDOWN_MS,
  STEAL_REACH,
  STEAL_SHIELD_MS,
  atExit,
  botPace,
  botStick,
  botWantsSteal,
  exposure,
  newBrain,
  newThief,
  stepThief,
  thinkBot,
  watch,
  type BotBrain,
  type Thief,
} from "@/lib/golpeSim";
import { Painter, type ThiefView } from "@/lib/golpeDraw";
import { serverNow } from "@/lib/serverTime";
import { playSound } from "@/lib/sfx";
import type { PresenceMap } from "@/lib/presence";
import { useCountdownTicks } from "@/hooks/useSound";
import { useWakeLock } from "@/components/carreras/Controller";
import { useFinePointer } from "@/components/arena/Controls";
import Hud, { type FeedItem, type HudData } from "./Hud";

interface Controls {
  joy: { id: number; ox: number; oy: number; x: number; y: number } | null;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** "Robar" presses so far. */
  steals: number;
}

const POSE_EVERY_MS = 100;
const FEED_MS = 4000;
const JOY_R = 48;

/** Where a thief appears: its exit, nudged by its id so two don't stack. */
function spawnPoint(m: GolpeMap, slot: number, id: string): [number, number] {
  const e = m.exits[slot] ?? m.exits[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const ox = ((Math.abs(h) % 3) - 1) * 0.45;
  const oy = ((Math.abs(h >> 3) % 3) - 1) * 0.45;
  return [e.sx + ox, e.sy + oy];
}

/** Spots for fallen diamonds around a point, on the floor. */
function scatter(m: GolpeMap, x: number, y: number, n: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    let p = { x, y };
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 0.9;
      const q = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
      if (!isWall(m, q.x, q.y)) {
        p = q;
        break;
      }
    }
    out.push(p);
  }
  return out;
}

/** The heist full screen: canvas, HUD and the controls. */
export default function GolpeGame({
  roomId,
  state,
  myId,
  presence,
  presenceLoaded,
}: {
  roomId: string;
  state: GolpeState;
  myId: string;
  presence: PresenceMap;
  presenceLoaded: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const presenceRef = useRef({ presence, presenceLoaded });
  const controlsRef = useRef<Controls>({ joy: null, up: false, down: false, left: false, right: false, steals: 0 });
  const [hud, setHud] = useState<HudData | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const touch = !useFinePointer();
  const touchRef = useRef(touch);

  useWakeLock();
  useEffect(() => {
    touchRef.current = touch;
  }, [touch]);
  useCountdownTicks(hud?.countdown ?? (hud && hud.secondsLeft <= 10 ? hud.secondsLeft : null), 10);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    presenceRef.current = { presence, presenceLoaded };
  }, [presence, presenceLoaded]);

  // Controls: a finger drags a joystick from wherever it lands; WASD / arrows
  // walk; space, E or the button robs.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const c = controlsRef.current;
    const local = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest("[data-control]")) return;
      if (c.joy) return;
      const p = local(e);
      c.joy = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
    };
    const move = (e: PointerEvent) => {
      if (!c.joy || c.joy.id !== e.pointerId) return;
      const p = local(e);
      c.joy.x = p.x;
      c.joy.y = p.y;
    };
    const up = (e: PointerEvent) => {
      if (c.joy?.id === e.pointerId) c.joy = null;
    };
    const key = (e: KeyboardEvent, on: boolean) => {
      const k = e.key.toLowerCase();
      if (k === "arrowup" || k === "w") c.up = on;
      else if (k === "arrowdown" || k === "s") c.down = on;
      else if (k === "arrowleft" || k === "a") c.left = on;
      else if (k === "arrowright" || k === "d") c.right = on;
      else if (k === " " || k === "e" || k === "enter") {
        if (on && !e.repeat) c.steals++;
      } else return;
      e.preventDefault();
    };
    const kd = (e: KeyboardEvent) => key(e, true);
    const ku = (e: KeyboardEvent) => key(e, false);
    const blur = () => {
      c.up = c.down = c.left = c.right = false;
      c.joy = null;
    };
    wrap.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    return () => {
      wrap.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const gameNo = state.gameNo;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const s0 = stateRef.current;
    const map = generateMap(s0.seed, s0.rows);
    const painter = new Painter(ctx, map, s0.mode === "equipos");

    let poses: Record<string, GolpePose> = {};
    let loot: Record<string, Loot> = {};
    let lootLoaded = false;
    let gems: Record<string, GemTaken> = {};
    let drops: Record<string, GolpeDrop> = {};
    const unsubPoses = subscribePoses(roomId, (p) => (poses = p));
    const unsubGems = subscribeGems(roomId, gameNo, (g) => (gems = g));
    const unsubDrops = subscribeDrops(roomId, gameNo, (d) => (drops = d));
    let pendingFeed: FeedItem[] = [];
    let feedKey = 0;
    const seen = new Map<string, Loot>();
    const unsubLoot = subscribeLoot(roomId, gameNo, (l) => {
      const st = stateRef.current;
      const name = (id: string) => (id === myId ? "tú" : thiefInfo(st, id).name);
      for (const [id, now] of Object.entries(l)) {
        const before = seen.get(id) ?? normalizeLoot(null);
        seen.set(id, now);
        if (!lootLoaded) continue;
        if (now.sn > before.sn) {
          const by = now.by === myId ? "Tú" : thiefInfo(st, now.by).name;
          const verb = now.by === myId ? "le robaste" : "le robó";
          const tone = now.by === myId ? "good" : id === myId ? "bad" : null;
          pendingFeed.push({ key: ++feedKey, text: id === myId ? `${by} te robó ${now.k}` : `${by} ${verb} ${now.k} a ${name(id)}`, tone });
          if (id === myId) {
            popups.push({ id: myId, text: `-${now.k}`, color: "#fda4af", life: 1 });
            playSound("bad");
            navigator.vibrate?.(120);
          }
        }
        if (now.cn > before.cn && id !== myId) {
          pendingFeed.push({ key: ++feedKey, text: `¡Alarma! Atraparon a ${name(id)}`, tone: null });
        }
        if (now.bank > before.bank && id !== myId && now.bank - before.bank >= 3) {
          pendingFeed.push({ key: ++feedKey, text: `${name(id)} puso ${now.bank - before.bank} a salvo`, tone: null });
        }
      }
      loot = l;
      lootLoaded = true;
    });
    const myPose = openPose(roomId, myId);

    const popups: { id: string; text: string; color: string; life: number }[] = [];
    let me: Thief | null = null;
    const bots = new Map<string, { th: Thief; brain: BotBrain; robRoll: number }>();
    /** Thieves (mine or my bots) caught and waiting to go back to their exit. */
    const goingBack = new Set<string>();
    const taking = new Set<string>();
    const banking = new Set<string>();
    const drawn = new Map<string, { x: number; y: number; a: number }>();
    let stealsSeen = controlsRef.current.steals;
    let lost = 0;

    let raf = 0;
    let last = performance.now();
    let lastPose = 0;
    let lastHud = 0;
    let closeTried = 0;
    let cam = { x: map.w / 2, y: map.h / 2 };
    let dpr = 1;
    const gemCache = new Map<string, { x: number; y: number }>();
    const gemPos = (i: number, gen: number) => {
      const k = `${i}:${gen}`;
      let p = gemCache.get(k);
      if (!p) {
        p = gemAt(map, i, gen);
        gemCache.set(k, p);
      }
      return p;
    };
    /** Diamonds on the floor right now (with how far into appearing). */
    const floorGems = (now: number) => {
      const out: { i: number; gen: number; x: number; y: number; v: number; fade: number }[] = [];
      for (let i = 0; i < map.gems.length; i++) {
        const taken = gems[`d${i}`];
        const gen = taken?.n ?? 0;
        const since = taken ? now - taken.at - GEM_RESPAWN_MS : Infinity;
        if (since < 0) continue;
        const p = gemPos(i, gen);
        out.push({ i, gen, x: p.x, y: p.y, v: map.gems[i].value, fade: Math.min(1, since / 500) });
      }
      return out;
    };

    const fitCanvas = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
    };

    const poseOf = (th: Thief, now: number): GolpePose => ({
      g: gameNo,
      x: Math.round(th.x * 100) / 100,
      y: Math.round(th.y * 100) / 100,
      a: Math.round(th.a * 100) / 100,
      f: (now < th.frozenUntil ? 1 : 0) | (now - th.lungeAt < 350 ? 2 : 0) | (now < th.safeUntil ? 4 : 0),
      t: now,
    });

    const bagOf = (id: string) => loot[id]?.bag ?? 0;

    /** A thief I run was caught: handcuffs, half the bag on the floor, then back to its exit. */
    const caught = (id: string, th: Thief, now: number) => {
      th.frozenUntil = now + FROZEN_MS;
      th.alert = 0;
      goingBack.add(id);
      const x = th.x;
      const y = th.y;
      getCaught(roomId, gameNo, id)
        .then((n) => {
          if (n > 0) dropDiamonds(roomId, gameNo, scatter(map, x, y, n));
          if (id === myId) lost = n;
        })
        .catch(console.error);
      if (id === myId) {
        lost = 0;
        playSound("bad");
        playSound("end");
        navigator.vibrate?.([80, 60, 180]);
      }
    };

    /** Picks up, banks and robs for a thief I run. */
    const act = (id: string, th: Thief, now: number, team: ReturnType<typeof teamOf>, onFloor: ReturnType<typeof floorGems>) => {
      if (now < th.frozenUntil) return;
      const bag = bagOf(id);
      if (bag > 0 && !banking.has(id) && atExit(map, exitsFor(team), th.x, th.y)) {
        banking.add(id);
        bankBag(roomId, gameNo, id)
          .then((n) => {
            if (n > 0 && id === myId) {
              popups.push({ id, text: `+${n} a salvo`, color: "#FFD400", life: 1.3 });
              playSound("win");
            }
          })
          .catch(console.error)
          .finally(() => banking.delete(id));
      }
      if (bag >= BAG_MAX) return;
      for (const g of onFloor) {
        if (Math.abs(g.x - th.x) > PICK_REACH || Math.abs(g.y - th.y) > PICK_REACH) continue;
        const k = `g${g.i}:${g.gen}`;
        if (taking.has(k)) continue;
        taking.add(k);
        takeGem(roomId, gameNo, id, g.i, g.gen, g.v)
          .then((n) => {
            if (n > 0 && id === myId) {
              popups.push({ id, text: `+${n}`, color: g.v > 1 ? "#FF5FA2" : "#5ee7f7", life: 1 });
              playSound("flip");
            }
          })
          .catch(console.error)
          .finally(() => setTimeout(() => taking.delete(k), 1500));
      }
      for (const [key, d] of Object.entries(drops)) {
        if (Math.abs(d.x - th.x) > PICK_REACH || Math.abs(d.y - th.y) > PICK_REACH) continue;
        const k = `d${key}`;
        if (taking.has(k)) continue;
        taking.add(k);
        takeDrop(roomId, gameNo, id, key)
          .then((n) => {
            if (n > 0 && id === myId) {
              popups.push({ id, text: `+${n}`, color: "#5ee7f7", life: 1 });
              playSound("flip");
            }
          })
          .catch(console.error);
      }
    };

    /** The closest rival someone could rob right now. */
    const robTarget = (id: string, th: Thief, views: ThiefView[], now: number): ThiefView | null => {
      const st = stateRef.current;
      let best: ThiefView | null = null;
      let bestD = STEAL_REACH;
      for (const v of views) {
        if (v.id === id || v.cuffed || v.safe || sameTeam(st, id, v.id)) continue;
        const l = loot[v.id];
        if (!l || l.bag <= 0 || now - l.sat < STEAL_SHIELD_MS) continue;
        const d = Math.hypot(v.x - th.x, v.y - th.y);
        if (d < bestD) {
          bestD = d;
          best = v;
        }
      }
      return best;
    };

    const rob = (id: string, th: Thief, target: ThiefView, now: number) => {
      th.stealAt = now + STEAL_COOLDOWN_MS;
      th.lungeAt = now;
      th.a = Math.atan2(target.y - th.y, target.x - th.x);
      robThief(roomId, gameNo, target.id, id, BAG_MAX - bagOf(id))
        .then((n) => {
          if (n > 0 && id === myId) {
            popups.push({ id, text: `+${n}`, color: "#bef264", life: 1 });
            playSound("capture");
          }
        })
        .catch(console.error);
    };

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const st = stateRef.current;
      if (st.gameNo !== gameNo) return;
      const now = serverNow();
      const gt = (now - st.startedAt) / 1000;
      const running = st.status === "playing" && now < st.endsAt;
      const live = running && now >= st.startedAt;
      const all = thieves(st);
      const mySlot = st.slots[myId];
      const myTeam = teamOf(st, myId);

      fitCanvas();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      // ---- My thief ----
      if (!me && running && mySlot !== undefined && st.players[myId]) {
        const [x, y] = spawnPoint(map, mySlot, myId);
        me = newThief(x, y, now);
        cam = { x, y };
      }
      if (me) {
        if (goingBack.has(myId) && now >= me.frozenUntil) {
          goingBack.delete(myId);
          [me.x, me.y] = spawnPoint(map, mySlot ?? 0, myId);
          me.safeUntil = now + SAFE_MS;
        }
        if (live) {
          const c = controlsRef.current;
          let ix = (c.right ? 1 : 0) - (c.left ? 1 : 0);
          let iy = (c.down ? 1 : 0) - (c.up ? 1 : 0);
          if (c.joy) {
            const dx = c.joy.x - c.joy.ox;
            const dy = c.joy.y - c.joy.oy;
            const d = Math.hypot(dx, dy);
            if (d > 6) {
              ix = dx / Math.max(d, JOY_R);
              iy = dy / Math.max(d, JOY_R);
            }
          }
          stepThief(map, me, ix, iy, bagOf(myId), dt, now);
          if (watch(me, exposure(map, me.x, me.y, gt), dt, now)) caught(myId, me, now);
        }
      }

      // ---- Bots: the connected person with the lowest id runs them ----
      const { presence: pres, presenceLoaded: loaded } = presenceRef.current;
      const people = Object.keys(pres).filter((id) => !isBot(id)).sort();
      const botHost = loaded && people[0] === myId && running;
      if (botHost) {
        for (const id of Object.keys(st.bots)) {
          if (bots.has(id) || st.slots[id] === undefined) continue;
          const p = poses[id];
          const th = p && p.g === gameNo ? newThief(p.x, p.y, now) : newThief(...spawnPoint(map, st.slots[id], id), now);
          bots.set(id, { th, brain: newBrain(st.botLevel), robRoll: 0 });
        }
      } else if (bots.size) {
        bots.clear();
      }

      // ---- Everyone, for drawing and robbing ----
      const views: ThiefView[] = [];
      const view = (id: string, x: number, y: number, a: number, f: number, isMe: boolean, alert: number): ThiefView => {
        const info = thiefInfo(st, id);
        return {
          id,
          name: info.name,
          color: info.color,
          x,
          y,
          a,
          bag: bagOf(id),
          cuffed: !!(f & 1),
          safe: !!(f & 4),
          lunge: f & 2 ? 1 : 0,
          team: teamOf(st, id),
          me: isMe,
          alert,
        };
      };
      for (const id of all) {
        if (id === myId || bots.has(id)) continue;
        const p = poses[id];
        if (!p || p.g !== gameNo) continue;
        let d = drawn.get(id);
        if (!d || Math.hypot(d.x - p.x, d.y - p.y) > 3) d = { x: p.x, y: p.y, a: p.a };
        const k = Math.min(1, dt * 12);
        d = { x: d.x + (p.x - d.x) * k, y: d.y + (p.y - d.y) * k, a: p.a };
        drawn.set(id, d);
        views.push(view(id, d.x, d.y, d.a, p.f, false, 0));
      }
      const fl = (th: Thief) => (now < th.frozenUntil ? 1 : 0) | (now - th.lungeAt < 350 ? 2 : 0) | (now < th.safeUntil ? 4 : 0);
      for (const [id, b] of bots) {
        const lunge = Math.max(0, 1 - (now - b.th.lungeAt) / 350);
        views.push({ ...view(id, b.th.x, b.th.y, b.th.a, fl(b.th), false, 0), lunge });
      }
      if (me) {
        const lunge = Math.max(0, 1 - (now - me.lungeAt) / 350);
        views.push({ ...view(myId, me.x, me.y, me.a, fl(me), true, me.alert), lunge });
      }

      const onFloor = floorGems(now);
      if (live && lootLoaded) {
        // Bots think a few times a second and walk every frame.
        for (const [id, b] of bots) {
          if (goingBack.has(id) && now >= b.th.frozenUntil) {
            goingBack.delete(id);
            [b.th.x, b.th.y] = spawnPoint(map, st.slots[id] ?? 0, id);
            b.th.safeUntil = now + SAFE_MS;
            b.brain.path = [];
          }
          const team = teamOf(st, id);
          if (t >= b.brain.nextThink) {
            b.brain.nextThink = t + 260 + Math.random() * 140;
            const loose = [...onFloor.map((g) => ({ x: g.x, y: g.y, v: g.v })), ...Object.values(drops).map((d) => ({ x: d.x, y: d.y, v: d.v }))];
            thinkBot(b.brain, b.th, { m: map, t: gt, left: (st.endsAt - now) / 1000, bag: bagOf(id), exits: exitsFor(team), loot: loose });
          }
          const [ix, iy] = botStick(b.brain, b.th, map);
          stepThief(map, b.th, ix, iy, bagOf(id), dt, now, botPace(st.botLevel));
          if (watch(b.th, exposure(map, b.th.x, b.th.y, gt), dt, now)) {
            caught(id, b.th, now);
            b.brain.path = [];
          }
          act(id, b.th, now, team, onFloor);
          if (now >= b.th.stealAt && now >= b.th.frozenUntil && bagOf(id) < BAG_MAX) {
            const target = robTarget(id, b.th, views, now);
            if (target && t >= b.robRoll) {
              b.robRoll = t + 1200;
              if (botWantsSteal(st.botLevel)) rob(id, b.th, target, now);
            }
          }
        }
        if (me) {
          act(myId, me, now, myTeam, onFloor);
          const c = controlsRef.current;
          if (c.steals !== stealsSeen) {
            stealsSeen = c.steals;
            const target = now >= me.stealAt && now >= me.frozenUntil ? robTarget(myId, me, views, now) : null;
            if (target && bagOf(myId) < BAG_MAX) rob(myId, me, target, now);
          }
        }
      } else {
        stealsSeen = controlsRef.current.steals;
      }

      // ---- Publish ----
      if (running && t - lastPose > POSE_EVERY_MS) {
        lastPose = t;
        if (me) myPose.send(poseOf(me, now));
        if (bots.size) {
          const out: Record<string, GolpePose> = {};
          for (const [id, b] of bots) out[id] = poseOf(b.th, now);
          sendBotPoses(roomId, out);
        }
      }

      // ---- Closing ----
      if (st.status === "playing" && now > st.endsAt + CLOSE_GRACE_MS && lootLoaded && t - closeTried > 3000) {
        closeTried = t;
        closeGolpe(roomId, gameNo, loot).catch(console.error);
      }

      // ---- Draw ----
      const cellsAcross = me ? (touchRef.current ? 11 : 14) : Math.max(map.w, map.h) + 1;
      const z = Math.min(w, h) / cellsAcross;
      const focus = me ?? { x: map.w / 2, y: map.h / 2 };
      cam.x += (focus.x - cam.x) * Math.min(1, dt * 8);
      cam.y += (focus.y - cam.y) * Math.min(1, dt * 8);
      // Keep the building on screen: no black past its edges (centered when it fits).
      const clampAxis = (c: number, size: number, view: number) => (view >= size ? size / 2 : Math.max(view / 2, Math.min(size - view / 2, c)));
      cam.x = clampAxis(cam.x, map.w, w / z);
      cam.y = clampAxis(cam.y, map.h, h / z);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0b0c10";
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(z, z);
      ctx.translate(-cam.x, -cam.y);
      painter.base();
      painter.sight(gt, !!me && me.alert > 0.25);
      painter.lasers(gt);
      for (const g of onFloor) painter.gem(g.x, g.y, g.v, t / 1000, g.fade, g.i);
      for (const [key, d] of Object.entries(drops)) if (!taking.has(`d${key}`)) painter.gem(d.x, d.y, d.v, t / 1000, 1, key.charCodeAt(key.length - 1));
      painter.cams(gt);
      painter.guards(gt);
      for (const v of [...views].sort((a, b) => a.y - b.y)) painter.thief(v, t / 1000, z);
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.life -= dt * 0.8;
        const v = views.find((x) => x.id === p.id);
        if (p.life <= 0 || !v) popups.splice(i, 1);
        else painter.popup(v.x, v.y, p.text, p.color, p.life, z);
      }
      ctx.restore();

      // Screen space: minimap and joystick.
      const mm = Math.min(120, Math.max(84, Math.min(w, h) * 0.24));
      painter.minimap(
        10,
        10,
        mm,
        views.filter((v) => v.me || !myTeam || v.team === myTeam).map((v) => ({ x: v.x, y: v.y, color: v.color, me: v.me })),
        { x: cam.x, y: cam.y, w: w / z, h: h / z },
        // Almost see-through while my thief is under it.
        me && (me.x - cam.x) * z + w / 2 < 10 + mm + 30 && (me.y - cam.y) * z + h / 2 < 10 + mm + 30 ? 0.25 : 1
      );
      const joy = controlsRef.current.joy;
      if (joy) {
        ctx.beginPath();
        ctx.arc(joy.ox, joy.oy, JOY_R, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.28)";
        ctx.lineWidth = 2;
        ctx.stroke();
        const d = Math.hypot(joy.x - joy.ox, joy.y - joy.oy);
        const k = d > JOY_R ? JOY_R / d : 1;
        ctx.beginPath();
        ctx.arc(joy.ox + (joy.x - joy.ox) * k, joy.oy + (joy.y - joy.oy) * k, 20, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fill();
      }

      // ---- HUD, a few times a second ----
      if (t - lastHud > 200) {
        lastHud = t;
        const bank: Record<string, number> = {};
        for (const id of all) bank[id] = loot[id]?.bank ?? 0;
        const ranking = all
          .map((id) => ({ id, name: thiefInfo(st, id).name, color: thiefInfo(st, id).color, bank: bank[id], me: id === myId }))
          .sort((a, b) => b.bank - a.bank);
        const target = me && live ? robTarget(myId, me, views, now) : null;
        setHud({
          secondsLeft: Math.max(0, Math.ceil((st.endsAt - now) / 1000)),
          countdown: now < st.startedAt ? Math.ceil((st.startedAt - now) / 1000) : null,
          bag: bagOf(myId),
          bank: bank[myId] ?? 0,
          alert: me?.alert ?? 0,
          cuffed: me && now < me.frozenUntil ? Math.ceil((me.frozenUntil - now) / 1000) : null,
          lost,
          canSteal: !!target && bagOf(myId) < BAG_MAX,
          stealReady: !!me && now >= me.stealAt,
          ranking,
          teams: st.mode === "equipos" ? teamTotals(st, bank) : null,
          myTeam,
          watching: !me,
        });
        if (pendingFeed.length) {
          const add = pendingFeed;
          pendingFeed = [];
          setFeed((f) => [...f, ...add].slice(-4));
          for (const item of add) setTimeout(() => setFeed((f) => f.filter((x) => x.key !== item.key)), FEED_MS);
        }
      }
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      unsubPoses();
      unsubGems();
      unsubDrops();
      unsubLoot();
      myPose.close();
    };
  }, [roomId, gameNo, myId]);

  return (
    <div ref={wrapRef} className="relative flex-1 touch-none select-none overflow-hidden bg-[#0b0c10]" onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <Hud
        hud={hud}
        feed={feed}
        touch={touch}
        onSteal={() => {
          controlsRef.current.steals++;
        }}
      />
    </div>
  );
}
