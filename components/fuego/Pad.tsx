"use client";

import ControllerShell, { ControllerActions } from "@/components/ControllerShell";
import { useEffect, useRef, useState } from "react";
import { Keyboard, MonitorPlay, RefreshCw, ShieldCheck, Skull, SlidersHorizontal, Trophy } from "lucide-react";
import {
  NO_PAD,
  RESPAWN_MS,
  fighterColor,
  fighterName,
  guarded,
  isAlive,
  openPad,
  ranking,
  shieldOf,
  subscribeLive,
  teamInfo,
  type FuegoLive,
  type FuegoPad,
  type FuegoState,
  kitOf,
} from "@/lib/fuego";
import { ABILITY_INFO } from "@/lib/fuegoAbilities";
import { MAX_HP, MAX_SHIELD, WEAPONS, WEAPON_IDS } from "@/lib/fuegoSim";
import { serverNow } from "@/lib/serverTime";
import { CHAOS_INFO, chaosAt } from "@/lib/fuegoChaos";
import { INFECTED, ladderStep } from "@/lib/fuegoModes";
import { useWakeLock } from "@/components/carreras/Controller";
import { ControlsEditor, TOUCH_LOOK, TouchControls, newControls, releaseControls } from "./Controls";
import { DEFAULT_TOUCH, loadTouch, saveTouch, type TouchSettings } from "./touchLayout";

/**
 * The phone as Fuego cruzado's controller when the match is on a big screen,
 * with exactly the touch controls of playing on the phone (`TouchControls`:
 * the same layout, editor and saved settings, `fuego.controles`). A loop
 * turns what they hold into the pad sent to the screen: the stick, the look
 * dragged (with your sensitivity), the trigger held, and every other button
 * as a press, counted so none is lost; auto-fire is asked of the screen,
 * which knows when the crosshair is on a rival. Shows my shield, health,
 * weapons and ammo (the screen publishes them, `fuego/live`) and vibrates
 * when I'm hit or get a kill. On a computer: WASD move, the arrows look,
 * J shoots, K aims, space jumps, R reloads, Q switches, G grenade, F melee,
 * E picks up.
 */

/** ~30 a second: the look feels direct on the TV without flooding the database. */
const SEND_MS = 33;
const DEAD = 0.12;
/** Arrow keys turn the look this fast (rad/s). */
const KEY_LOOK = 2.2;

type Press = "h" | "j" | "r" | "q" | "g" | "m" | "p";

const MOVE_KEYS: Record<string, [number, number]> = { w: [0, 1], s: [0, -1], a: [-1, 0], d: [1, 0] };

/** This page load (the screen resyncs when it changes). */
const SID = 1 + Math.floor(Math.random() * 1e9);

/** Counters and look per room and player, kept while the page lives (the screen only uses what changed). */
const counts = new Map<string, Pick<FuegoPad, "h" | "ft" | "j" | "r" | "q" | "g" | "m" | "p" | "lx" | "ly">>();

export default function Pad({ roomId, clientId, state }: { roomId: string; clientId: string; state: FuegoState }) {
  useWakeLock();
  const key = `${roomId}/${clientId}`;
  const wire = useRef<FuegoPad>({ ...NO_PAD, ...counts.get(key), sid: SID });
  const padRef = useRef<ReturnType<typeof openPad> | null>(null);
  const lastAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [aim, setAim] = useState(false);
  // The touch controls (what they hold, read by the loop below), their settings and the editor.
  const ctl = useRef(newControls());
  const [touch, setTouch] = useState<TouchSettings>(() => (typeof window === "undefined" ? DEFAULT_TOUCH : loadTouch()));
  const touchRef = useRef(touch);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    touchRef.current = touch;
  }, [touch]);
  const changeTouch = (t: TouchSettings) => {
    setTouch(t);
    saveTouch(t);
  };
  const [live, setLive] = useState<FuegoLive | null>(null);
  const [now, setNow] = useState(0);
  const firingRef = useRef(false);
  const aimRef = useRef(false);

  const fighting = state.status === "playing" && clientId in state.roster;
  const alive = fighting && isAlive(state, clientId);
  const weapon = live ? (WEAPON_IDS[live.w] ?? "rifle") : "rifle";
  const scoped = alive && aim && weapon === "francotirador";
  const scopedRef = useRef(scoped);
  useEffect(() => {
    scopedRef.current = scoped;
  }, [scoped]);

  useEffect(() => {
    const p = openPad(roomId, clientId);
    padRef.current = p;
    p.send(wire.current);
    const unsubLive = subscribeLive(roomId, clientId, setLive);
    const tick = setInterval(() => setNow(serverNow()), 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      clearInterval(tick);
      unsubLive();
      p.close();
      padRef.current = null;
    };
  }, [roomId, clientId]);

  /** Changes the pad and sends it now if it's been long enough, else when the gap is over (always the latest). */
  const send = (patch: Partial<FuegoPad>, urgent = false) => {
    wire.current = { ...wire.current, ...patch };
    const w = wire.current;
    counts.set(key, { h: w.h, ft: w.ft, j: w.j, r: w.r, q: w.q, g: w.g, m: w.m, p: w.p, lx: w.lx, ly: w.ly });
    const go = () => {
      timer.current = null;
      lastAt.current = performance.now();
      padRef.current?.send({ ...wire.current });
    };
    if (urgent || performance.now() - lastAt.current >= SEND_MS) {
      if (timer.current) clearTimeout(timer.current);
      go();
    } else if (!timer.current) timer.current = setTimeout(go, SEND_MS - (performance.now() - lastAt.current));
  };
  const setMove = (x: number, y: number) => {
    const len = Math.hypot(x, y);
    const k = len < DEAD ? 0 : Math.min(1, len) / len;
    send({ x: Math.round(x * k * 100) / 100, y: Math.round(y * k * 100) / 100 });
  };
  const turn = (dx: number, dy: number) => {
    const w = wire.current;
    send({ lx: Math.round((w.lx + dx) * 10000) / 10000, ly: Math.round((w.ly + dy) * 10000) / 10000 });
  };
  const press = (c: Press) => {
    send({ [c]: (wire.current[c] ?? 0) + 1 }, true);
    navigator.vibrate?.(12);
  };
  /** The trigger: held, and every press counted so a quick tap still shoots. Scoped, it shoots on release. */
  const trigger = (on: boolean) => {
    if (on === firingRef.current) return;
    firingRef.current = on;
    if (scopedRef.current) {
      if (!on) send({ f: 0, ft: wire.current.ft + 1 }, true);
      return;
    }
    send(on ? { f: 1, ft: wire.current.ft + 1 } : { f: 0 }, true);
  };
  const toggleAim = (on?: boolean) => {
    const next = on ?? !aimRef.current;
    aimRef.current = next;
    setAim(next);
    send({ a: next ? 1 : 0 }, true);
  };

  // Dead or out of the match: let go of the stick, the trigger and the scope. The controls
  // disappear with the finger still on the stick, so its release never arrives.
  useEffect(() => {
    if (alive) return;
    releaseControls(ctl.current);
    if (wire.current.x || wire.current.y) send({ x: 0, y: 0 }, true);
    if (aimRef.current) toggleAim(false);
    if (wire.current.f) send({ f: 0 }, true);
    firingRef.current = false;
    // Only when alive changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alive]);

  // The touch controls → the pad: the stick, the look with my sensitivity, the trigger, presses on each new push.
  useEffect(() => {
    let frame = 0;
    const was = { fire: false, jump: false, reload: false, grenade: false, melee: false, swap: false };
    const presses = { jump: "j", reload: "r", grenade: "g", melee: "m", swap: "q" } as const;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const c = ctl.current;
      const w = wire.current;
      const t = touchRef.current;
      const patch: Partial<FuegoPad> = {};
      let urgent = false;
      const len = Math.hypot(c.mx, c.mz);
      const k = len < DEAD ? 0 : 1;
      const x = Math.round(c.mx * k * 100) / 100;
      const y = Math.round(c.mz * k * 100) / 100;
      if (x !== w.x || y !== w.y) {
        patch.x = x;
        patch.y = y;
      }
      if (c.lookX || c.lookY) {
        const sens = TOUCH_LOOK * t.sens * (aimRef.current ? t.aimSens : 1);
        patch.lx = Math.round((w.lx + c.lookX * sens) * 10000) / 10000;
        patch.ly = Math.round((w.ly + c.lookY * sens) * 10000) / 10000;
        c.lookX = 0;
        c.lookY = 0;
      }
      if (c.fire !== was.fire) {
        was.fire = c.fire;
        patch.f = c.fire ? 1 : 0;
        if (c.fire) patch.ft = w.ft + 1;
        urgent = true;
      }
      for (const key of Object.keys(presses) as (keyof typeof presses)[]) {
        if (c[key] && !was[key]) {
          patch[presses[key]] = (w[presses[key]] ?? 0) + 1;
          urgent = true;
          navigator.vibrate?.(12);
        }
        was[key] = c[key];
      }
      if (c.pick) {
        c.pick = false;
        patch.p = w.p + 1;
        urgent = true;
      }
      if (c.ability) {
        c.ability = false;
        patch.h = w.h + 1;
        urgent = true;
      }
      const af = t.autoFire ? 1 : 0;
      if ((w.af ?? 0) !== af) patch.af = af;
      if (Object.keys(patch).length) send(patch, urgent);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
    // The loop only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hit: vibrate (harder when it reached health). A kill of mine: a double tick.
  const hitN = state.hits[clientId]?.n ?? 0;
  const lastHit = useRef(hitN);
  useEffect(() => {
    if (hitN > lastHit.current) navigator.vibrate?.(shieldOf(state, clientId, serverNow()) > 1 ? 35 : [90, 40, 60]);
    lastHit.current = hitN;
  }, [hitN, state, clientId]);
  const myKills = state.kills[clientId] ?? 0;
  const lastKills = useRef(myKills);
  useEffect(() => {
    if (myKills > lastKills.current) navigator.vibrate?.([25, 50, 25]);
    lastKills.current = myKills;
  }, [myKills]);

  // Keyboard (computers).
  useEffect(() => {
    const down = new Set<string>();
    let frame = 0;
    let last = performance.now();
    const loop = (t: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const lx = (down.has("arrowright") ? 1 : 0) - (down.has("arrowleft") ? 1 : 0);
      const ly = (down.has("arrowdown") ? 1 : 0) - (down.has("arrowup") ? 1 : 0);
      if (lx || ly) turn(lx * KEY_LOOK * dt, ly * KEY_LOOK * 0.6 * dt);
    };
    frame = requestAnimationFrame(loop);
    const apply = () => {
      let x = 0;
      let y = 0;
      for (const k of down) {
        const m = MOVE_KEYS[k];
        if (m) {
          x += m[0];
          y += m[1];
        }
      }
      const n = Math.hypot(x, y) || 1;
      setMove(x / n, y / n);
      trigger(down.has("j"));
    };
    const presses: Record<string, Press> = { " ": "j", r: "r", q: "q", g: "g", f: "m", e: "p", c: "h" };
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.target instanceof HTMLInputElement) return;
      if (!e.repeat && presses[k]) press(presses[k]);
      else if (!e.repeat && k === "k") toggleAim();
      else if (!(k in MOVE_KEYS) && k !== "j" && !k.startsWith("arrow")) return;
      e.preventDefault();
      down.add(k);
      apply();
    };
    const onUp = (e: KeyboardEvent) => {
      if (down.delete(e.key.toLowerCase())) apply();
    };
    const clear = () => {
      down.clear();
      apply();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clear);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clear);
    };
    // The handlers only touch refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const color = clientId in state.roster ? fighterColor(state, clientId) : "#94a3b8";
  const side = state.roster[clientId];
  const label = !side ? "Mirando" : side === "ffa" ? `${state.kills[clientId] ?? 0} bajas` : `${teamInfo(side).label} · ${state.kills[clientId] ?? 0} bajas`;
  const t = now || serverNow();
  const hp = state.hp[clientId] ?? 0;
  const shield = Math.round(shieldOf(state, clientId, t));
  const counting = state.status === "playing" && t < state.startedAt;
  const respawnIn = !alive && fighting && state.deadAt[clientId] ? Math.max(0, Math.ceil((state.deadAt[clientId] + RESPAWN_MS - t) / 1000)) : 0;
  const killer = state.hits[clientId]?.from ?? "";
  const chaos = state.status === "playing" ? chaosAt(state, t) : null;
  // Unarmed (infected, last step of escalada): the big button punches.
  const bare = (state.mode === "infectados" && side === INFECTED) || (state.mode === "escalada" && ladderStep(state.kills[clientId] ?? 0) === "golpe");
  const kit = ABILITY_INFO[kitOf(state, clientId)];
  const playingNow = state.status === "playing" && !!side && !counting && alive;

  if (playingNow) {
    return (
      <div className="fixed inset-0 select-none bg-talo-ink text-white [touch-action:none]">
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm font-bold text-white/20">
          <MonitorPlay className="mx-auto mb-1 h-6 w-6" /> Mira la tele
        </p>
        <TouchControls
          controlsRef={ctl}
          settings={touch}
          canPick={!!live?.n}
          pickLabel={live?.n ?? ""}
          aiming={aim}
          onAim={() => toggleAim()}
          fireOnRelease={scoped}
          bare={bare}
          ability={{ label: kit.label, color: kit.color, ready: (live?.c ?? 100) / 100 }}
          weapons={{
            label: WEAPONS[weapon].label,
            mag: live?.m ?? 0,
            reserve: live?.r ?? 0,
            other: live && live.o >= 0 ? WEAPONS[WEAPON_IDS[live.o]].label : null,
            grenades: live?.g ?? 2,
            reloading: !!live?.l,
          }}
        />
        {/* Status on top, small and out of the thumbs' way. */}
        <div className="pointer-events-none absolute left-1/2 top-1.5 z-20 flex w-[min(460px,58vw)] -translate-x-1/2 flex-col gap-1">
          <div className="flex items-center gap-2 rounded-xl bg-slate-950/70 px-2.5 py-1.5">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
            <span className="truncate text-xs font-bold">{label}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.min(100, (shield / MAX_SHIELD) * 100)}%` }} />
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full ${hp <= 35 ? "bg-red-500" : "bg-emerald-400"}`} style={{ width: `${(hp / MAX_HP) * 100}%` }} />
              </div>
            </div>
            {guarded(state, clientId, t) && <ShieldCheck className="h-4 w-4 shrink-0 text-cyan-300" aria-label="Protegido" />}
          </div>
          {chaos && (
            <p className="rounded-lg px-2 py-0.5 text-center text-[11px] font-bold text-white" style={{ background: CHAOS_INFO[chaos.id].color }}>
              {CHAOS_INFO[chaos.id].label} · {Math.max(0, Math.ceil((chaos.end - t) / 1000))} s
            </p>
          )}
        </div>
        <button
          onClick={() => {
            releaseControls(ctl.current);
            setEditing(true);
          }}
          aria-label="Ajustar controles"
          className="absolute left-2 top-2 z-20 rounded-xl bg-slate-950/70 p-2 text-white"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
        <ControllerActions game="fuego" className="absolute right-2 top-2 z-20" />
        {editing && <ControlsEditor settings={touch} onChange={changeTouch} onClose={() => setEditing(false)} />}
      </div>
    );
  }

  return (
    <ControllerShell className="gap-2">
      <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-3 py-2">
        <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-sm font-bold">
            <span className="truncate">{label}</span>
            {alive && live && (
              <span className="flex shrink-0 items-center gap-2 text-white/80">
                {WEAPONS[weapon].label}
                {live.l ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-300" /> : null}
              </span>
            )}
          </div>
          {fighting && (
            <div className="mt-1.5 flex flex-col gap-1">
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${(shield / MAX_SHIELD) * 100}%` }} />
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full transition-all ${hp <= 35 ? "bg-red-500" : "bg-emerald-400"}`} style={{ width: `${(hp / MAX_HP) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
        {alive && guarded(state, clientId, t) && <ShieldCheck className="h-5 w-5 shrink-0 text-cyan-300" aria-label="Protegido" />}
        <ControllerActions game="fuego" />
      </div>

      {chaos && (
        <p className="rounded-xl px-3 py-1 text-center text-sm font-bold text-white" style={{ background: CHAOS_INFO[chaos.id].color }}>
          {CHAOS_INFO[chaos.id].label}: {CHAOS_INFO[chaos.id].hint.toLowerCase()} · {Math.max(0, Math.ceil((chaos.end - t) / 1000))} s
        </p>
      )}

      {state.status === "finished" ? (
        <Over state={state} clientId={clientId} />
      ) : !side ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-white/60">Estás mirando esta partida en la pantalla grande. Entras en la próxima.</div>
      ) : counting ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="font-display text-6xl text-talo-hero">{Math.max(1, Math.ceil((state.startedAt - t) / 1000))}</p>
          <p className="text-sm text-white/60">Mira la tele: tu parte de la pantalla es la de tu nombre.</p>
        </div>
      ) : !alive ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <Skull className="h-10 w-10 text-white/50" />
          <p className="font-display text-2xl">{killer && killer !== clientId ? `Te eliminó ${fighterName(state, killer)}` : "Te eliminaron"}</p>
          <p className="text-sm text-white/60">Reapareces en {respawnIn}…</p>
        </div>
      ) : null}

      <p className="pointer-events-none hidden items-center justify-center gap-1.5 text-xs text-white/40 [@media(hover:hover)_and_(pointer:fine)]:flex">
        <Keyboard className="h-3.5 w-3.5" /> WASD moverte · flechas mirar · J disparar · K apuntar · C habilidad · espacio saltar · R recargar · Q cambiar arma · G globo · F golpe · E agarrar
      </p>
    </ControllerShell>
  );
}

function Over({ state, clientId }: { state: FuegoState; clientId: string }) {
  const side = state.roster[clientId];
  const order = ranking(state);
  const place = order.findIndex((id) => (state.kills[id] ?? 0) === (state.kills[clientId] ?? 0)) + 1;
  const title =
    state.winner === "draw"
      ? "¡Empate!"
      : state.winner === "red" || state.winner === "blue"
        ? side === state.winner
          ? "¡Ganó tu equipo!"
          : `Ganó el ${teamInfo(state.winner).label}`
        : state.winner === clientId
          ? "¡Ganaste!"
          : `Ganó ${fighterName(state, state.winner)}`;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <Trophy className="h-10 w-10 text-talo-hero" />
      <p className="font-display text-2xl">{title}</p>
      {side && (
        <p className="text-sm text-white/70">
          {state.kills[clientId] ?? 0} bajas · {state.deaths[clientId] ?? 0} muertes · mejor racha {state.best[clientId] ?? 0}
          {side === "ffa" && ` · ${place}º`}
        </p>
      )}
      <p className="text-sm text-white/50">La revancha se arma desde la pantalla grande.</p>
    </div>
  );
}
