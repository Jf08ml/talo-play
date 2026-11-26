"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowUpDown, Bomb, Crosshair, Hand, HandMetal, Keyboard, MonitorPlay, MoveUp, RefreshCw, ShieldCheck, Skull, Target, Trophy, Zap } from "lucide-react";
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
import { MAX_GRENADES, MAX_HP, MAX_SHIELD, WEAPONS, WEAPON_IDS } from "@/lib/fuegoSim";
import { serverNow } from "@/lib/serverTime";
import { CHAOS_INFO, chaosAt } from "@/lib/fuegoChaos";
import { INFECTED, ladderStep } from "@/lib/fuegoModes";
import { useWakeLock } from "@/components/carreras/Controller";
import { TOUCH_LOOK } from "./Controls";

/**
 * The phone as Fuego cruzado's controller when the match is on a big screen,
 * played like on the phone itself: a stick on the left (it appears where the
 * thumb lands; up = forward) and, on the right, a zone to drag and look with
 * the buttons on it. «Disparar» is held and also looks while you drag it;
 * with the sniper scoped it shoots when you lift the finger. «Apuntar» toggles.
 * The rest are presses, counted so none is lost. Shows my shield, health,
 * weapons and ammo (the screen publishes them, `fuego/live`) and vibrates
 * when I'm hit or get a kill. On a computer: WASD move, the arrows look,
 * J shoots, K aims, space jumps, R reloads, Q switches, G grenade, F melee,
 * E picks up.
 */

/** ~30 a second: the look feels direct on the TV without flooding the database. */
const SEND_MS = 33;
const STICK_R = 60;
const DEAD = 0.12;
/** Arrow keys turn the look this fast (rad/s). */
const KEY_LOOK = 2.2;

type Press = "h" | "j" | "r" | "q" | "g" | "m" | "p";

const MOVE_KEYS: Record<string, [number, number]> = { w: [0, 1], s: [0, -1], a: [-1, 0], d: [1, 0] };

/** Keeps the finger's events on this element (it can fail on synthetic or already-ended pointers). */
function capture(e: ReactPointerEvent<HTMLElement>) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {}
}

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
  const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const [firing, setFiring] = useState(false);
  const [aim, setAim] = useState(false);
  const [live, setLive] = useState<FuegoLive | null>(null);
  const [now, setNow] = useState(0);
  const stickId = useRef<number | null>(null);
  const looks = useRef(new Map<number, { x: number; y: number }>());
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
    setFiring(on);
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

  // Dead or out of the match: let go of the trigger and the scope.
  useEffect(() => {
    if (alive) return;
    if (aimRef.current) toggleAim(false);
    if (wire.current.f) send({ f: 0 }, true);
    firingRef.current = false;
    // Only when alive changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alive]);

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

  const stickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stickId.current !== null) return;
    stickId.current = e.pointerId;
    capture(e);
    const r = e.currentTarget.getBoundingClientRect();
    setStick({ ox: e.clientX - r.left, oy: e.clientY - r.top, x: 0, y: 0 });
  };
  const stickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== stickId.current || !stick) return;
    const r = e.currentTarget.getBoundingClientRect();
    let dx = e.clientX - r.left - stick.ox;
    let dy = e.clientY - r.top - stick.oy;
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) {
      dx = (dx / len) * STICK_R;
      dy = (dy / len) * STICK_R;
    }
    setStick({ ...stick, x: dx, y: dy });
    setMove(dx / STICK_R, -dy / STICK_R);
  };
  const stickUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== stickId.current) return;
    stickId.current = null;
    setStick(null);
    setMove(0, 0);
  };

  // Look: drag anywhere on the right side, or with the finger on «Disparar».
  const lookDown = (e: ReactPointerEvent<HTMLElement>) => {
    looks.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    capture(e);
  };
  const lookMove = (e: ReactPointerEvent<HTMLElement>) => {
    const l = looks.current.get(e.pointerId);
    if (!l) return;
    // Scoped, the view turns slower (like on the phone itself).
    const k = TOUCH_LOOK * (scopedRef.current ? 0.45 : 1);
    turn((e.clientX - l.x) * k, (e.clientY - l.y) * k);
    l.x = e.clientX;
    l.y = e.clientY;
  };
  const lookUp = (e: ReactPointerEvent<HTMLElement>) => {
    looks.current.delete(e.pointerId);
  };

  const tap = (c: Press) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      press(c);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  const fireProps = {
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      lookDown(e);
      trigger(true);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      lookMove(e);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      lookUp(e);
      trigger(false);
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) => {
      lookUp(e);
      firingRef.current = false;
      setFiring(false);
      if (wire.current.f) send({ f: 0 }, true);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

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
  const btn = "flex flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-bold leading-none active:bg-white/30";

  return (
    <div className="flex h-dvh flex-col gap-2 bg-talo-ink p-2.5 text-white select-none [touch-action:none]">
      <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-3 py-2">
        <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-sm font-bold">
            <span className="truncate">{label}</span>
            {alive && live && (
              <span className="flex shrink-0 items-center gap-2 text-white/80">
                {WEAPONS[weapon].label}
                <span className={`font-mono ${live.m === 0 ? "text-red-400" : ""}`}>
                  {live.m}
                  <span className="text-white/40">/{live.r}</span>
                </span>
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
        <MonitorPlay className="h-5 w-5 shrink-0 text-white/40" aria-label="Mira la pantalla grande" />
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
      ) : (
        <div className="flex min-h-0 flex-1 gap-2.5">
          <div
            onPointerDown={stickDown}
            onPointerMove={stickMove}
            onPointerUp={stickUp}
            onPointerCancel={stickUp}
            className="relative flex-[5] overflow-hidden rounded-[24px] bg-white/[0.06] ring-1 ring-white/[0.08]"
          >
            {stick ? (
              <>
                <span className="absolute h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/25" style={{ left: stick.ox, top: stick.oy }} />
                <span className="absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-talo-ink" style={{ left: stick.ox + stick.x, top: stick.oy + stick.y, background: color }} />
              </>
            ) : (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-white/40">
                <span className="h-24 w-24 rounded-full border-2 border-dashed border-white/25" />
                <span className="px-3 text-sm font-bold">Moverte</span>
              </div>
            )}
            {/* The ability, by the stick. */}
            {(() => {
              const kit = ABILITY_INFO[kitOf(state, clientId)];
              const ready = (live?.c ?? 100) / 100;
              return (
                <button
                  type="button"
                  {...tap("h")}
                  aria-label={kit.label}
                  className={`${btn} absolute bottom-3 left-3 h-14 w-20 overflow-hidden text-white`}
                  style={{ background: ready >= 1 ? kit.color : "rgba(255,255,255,0.08)" }}
                >
                  <span className="absolute inset-x-0 bottom-0 bg-white/25" style={{ height: `${ready * 100}%` }} />
                  <Zap className="relative h-5 w-5" />
                  <span className="relative">{kit.label}</span>
                </button>
              );
            })()}
            {/* Jump within the thumb's reach of the stick too. */}
            <button type="button" {...tap("j")} aria-label="Saltar" className={`${btn} absolute bottom-3 right-3 h-14 w-14 bg-white/[0.14]`}>
              <MoveUp className="h-5 w-5" />
              Saltar
            </button>
          </div>

          <div
            onPointerDown={lookDown}
            onPointerMove={lookMove}
            onPointerUp={lookUp}
            onPointerCancel={lookUp}
            className="relative flex-[6] overflow-hidden rounded-[24px] bg-white/[0.03] ring-1 ring-white/[0.08]"
          >
            <span className="pointer-events-none absolute left-4 top-3 text-sm font-bold text-white/35">Arrastra aquí para mirar</span>
            {live?.n && (
              <button type="button" {...tap("p")} className={`${btn} absolute left-3 top-10 h-12 flex-row gap-1.5 bg-talo-hero px-3 text-sm text-talo-ink active:bg-talo-hero`}>
                <Hand className="h-4 w-4" /> Agarrar {live.n}
              </button>
            )}
            <div className="absolute right-2.5 top-2.5 flex gap-2">
              <button type="button" {...tap("m")} aria-label="Golpe" className={`${btn} h-12 w-14 bg-white/[0.14]`}>
                <HandMetal className="h-4 w-4" />
                Golpe
              </button>
              <button type="button" {...tap("g")} aria-label="Granada" className={`${btn} h-12 w-14 bg-white/[0.14] ${live && live.g === 0 ? "opacity-40" : ""}`}>
                <Bomb className="h-4 w-4" />
                <span className="flex gap-0.5">
                  {Array.from({ length: MAX_GRENADES }, (_, i) => (
                    <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < (live?.g ?? 2) ? "bg-lime-400" : "bg-white/20"}`} />
                  ))}
                </span>
              </button>
            </div>
            <div className="absolute bottom-3 right-3 flex items-end gap-2.5">
              <div className="flex flex-col gap-2">
                <button type="button" {...tap("q")} aria-label="Cambiar arma" className={`${btn} h-12 w-20 bg-white/[0.14]`}>
                  <ArrowUpDown className="h-4 w-4" />
                  {live && live.o >= 0 ? WEAPONS[WEAPON_IDS[live.o]].label : "Cambiar"}
                </button>
                <button type="button" {...tap("r")} aria-label="Recargar" className={`${btn} h-12 w-20 bg-white/[0.14]`}>
                  <RefreshCw className="h-4 w-4" />
                  Recargar
                </button>
              </div>
              <div className="flex flex-col items-center gap-2.5">
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleAim();
                  }}
                  aria-pressed={aim}
                  className={`${btn} h-12 w-24 flex-row gap-1.5 text-sm ${aim ? "bg-sky-400 text-talo-ink" : "bg-white/[0.14]"}`}
                >
                  <Target className="h-4 w-4" /> Apuntar
                </button>
                {bare ? (
                <button
                  type="button"
                  {...tap("m")}
                  className="relative flex h-28 w-28 flex-col items-center justify-center rounded-full border-[3px] border-talo-ink font-display text-lg text-talo-ink active:scale-95"
                  style={{ background: color }}
                >
                  <HandMetal className="h-8 w-8" />
                  Manotazo
                </button>
                ) : (
                <button
                  type="button"
                  {...fireProps}
                  aria-label={scoped ? "Apuntar y soltar para disparar" : "Disparar"}
                  className={`relative flex h-28 w-28 flex-col items-center justify-center rounded-full border-[3px] border-talo-ink font-display text-lg text-talo-ink transition-transform ${firing ? "scale-95 brightness-110" : ""}`}
                  style={{ background: scoped ? "#38bdf8" : color }}
                >
                  <Crosshair className="h-8 w-8" />
                  {scoped ? "Suelta" : "Disparar"}
                </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="pointer-events-none hidden items-center justify-center gap-1.5 text-xs text-white/40 [@media(hover:hover)_and_(pointer:fine)]:flex">
        <Keyboard className="h-3.5 w-3.5" /> WASD moverte · flechas mirar · J disparar · K apuntar · C habilidad · espacio saltar · R recargar · Q cambiar arma · G globo · F golpe · E agarrar
      </p>
    </div>
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
