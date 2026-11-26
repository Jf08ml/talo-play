"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { ArrowUpDown, Bomb, Crosshair, Hand, HandMetal, MoveUp, RefreshCw, RotateCcw, Target, Zap } from "lucide-react";
import { BUTTON_INFO, DEFAULT_TOUCH, sizeUnit, type TouchButtonId, type TouchSettings } from "./touchLayout";

/**
 * What the player is pressing, read by the battle loop every frame. Look
 * deltas accumulate until the loop takes them; `pick` is a one-shot press the
 * loop clears; `aim` is held with the mouse and toggled on touch.
 */
export interface ControlState {
  mx: number;
  mz: number;
  jump: boolean;
  fire: boolean;
  aim: boolean;
  reload: boolean;
  swap: boolean;
  grenade: boolean;
  melee: boolean;
  pick: boolean;
  /** Ability: a one-shot press the loop clears. */
  ability: boolean;
  board: boolean;
  lookX: number;
  lookY: number;
}

export function newControls(): ControlState {
  return { mx: 0, mz: 0, jump: false, fire: false, aim: false, reload: false, swap: false, grenade: false, melee: false, pick: false, ability: false, board: false, lookX: 0, lookY: 0 };
}

/**
 * Lets go of everything held: the stick, the trigger and the buttons. Touch
 * controls unmount when you die, often with a finger still on the stick, and
 * the finger's release never arrives — without this the last movement stays
 * and the soldier walks by itself after respawning.
 */
export function releaseControls(c: ControlState) {
  c.mx = 0;
  c.mz = 0;
  c.jump = c.fire = c.reload = c.swap = c.grenade = c.melee = c.pick = c.ability = false;
  c.lookX = 0;
  c.lookY = 0;
}

/** Radians per pixel dragged (touch) or moved (mouse). */
export const TOUCH_LOOK = 0.0062;
export const MOUSE_LOOK = 0.0022;

export function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(pointer: fine)");
    const update = () => setFine(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return fine;
}

/**
 * Mouse and keyboard: click to lock the pointer; WASD/arrows move, mouse
 * looks, left click shoots, right click aims, R reloads, Q / 1 / 2 / wheel
 * switch weapons, G throws a grenade, F or V hits, E picks up, space jumps,
 * Tab shows the scores. The pointer is only captured while `canLock`.
 */
export function useDesktopControls(controlsRef: RefObject<ControlState>, target: RefObject<HTMLElement | null>, enabled: boolean, canLock: boolean): boolean {
  const [locked, setLocked] = useState(false);
  const canLockRef = useRef(canLock);
  useEffect(() => {
    canLockRef.current = canLock;
    if (!canLock && document.pointerLockElement && document.pointerLockElement === target.current) document.exitPointerLock?.();
  }, [canLock, target]);
  useEffect(() => {
    if (!enabled) return;
    const el = target.current;
    const c = controlsRef.current;
    const keys = new Set<string>();
    const sync = () => {
      const has = (...k: string[]) => k.some((key) => keys.has(key));
      c.mx = (has("d", "arrowright") ? 1 : 0) - (has("a", "arrowleft") ? 1 : 0);
      c.mz = (has("w", "arrowup") ? 1 : 0) - (has("s", "arrowdown") ? 1 : 0);
      c.jump = has(" ");
      c.reload = has("r");
      c.swap = has("q", "1", "2");
      c.grenade = has("g");
      c.melee = has("f", "v");
      c.board = has("tab");
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k.startsWith("arrow") || k === " " || k === "tab") e.preventDefault();
      if (k === "e") c.pick = true;
      if (k === "c" && !e.repeat) c.ability = true;
      keys.add(k);
      sync();
    };
    const up = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
      sync();
    };
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement !== el) return;
      c.lookX += e.movementX;
      c.lookY += e.movementY;
    };
    const mdown = (e: MouseEvent) => {
      if (document.pointerLockElement !== el) {
        if (e.target === el && canLockRef.current) el?.requestPointerLock?.();
        return;
      }
      if (e.button === 0) c.fire = true;
      if (e.button === 2) c.aim = true;
    };
    const mup = (e: MouseEvent) => {
      if (e.button === 0) c.fire = false;
      if (e.button === 2) c.aim = false;
    };
    let wheelOff: ReturnType<typeof setTimeout> | undefined;
    const wheel = (e: WheelEvent) => {
      if (document.pointerLockElement !== el || Math.abs(e.deltaY) < 1) return;
      c.swap = true;
      clearTimeout(wheelOff);
      wheelOff = setTimeout(() => (c.swap = false), 60);
    };
    const menu = (e: Event) => e.preventDefault();
    const lockChange = () => {
      const on = document.pointerLockElement === el;
      setLocked(on);
      if (!on) {
        c.fire = false;
        c.aim = false;
      }
    };
    const blur = () => {
      keys.clear();
      c.fire = false;
      c.aim = false;
      sync();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", move);
    window.addEventListener("mousedown", mdown);
    window.addEventListener("mouseup", mup);
    window.addEventListener("wheel", wheel, { passive: true });
    window.addEventListener("blur", blur);
    el?.addEventListener("contextmenu", menu);
    document.addEventListener("pointerlockchange", lockChange);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mousedown", mdown);
      window.removeEventListener("mouseup", mup);
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("blur", blur);
      el?.removeEventListener("contextmenu", menu);
      document.removeEventListener("pointerlockchange", lockChange);
      clearTimeout(wheelOff);
      if (document.pointerLockElement === el) document.exitPointerLock?.();
    };
  }, [controlsRef, target, enabled]);
  return locked;
}

type HoldKey = "fire" | "jump" | "reload" | "grenade" | "melee";

/** The screen's size, kept up to date (controls are placed as fractions of it). */
function useViewport(): { w: number; h: number } {
  const [v, setV] = useState({ w: 800, h: 400 });
  useEffect(() => {
    const update = () => setV({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return v;
}

/** Where a control goes, in pixels (a square of its size centered on its place). */
function boxOf(id: TouchButtonId, t: TouchSettings, v: { w: number; h: number }): { left: number; top: number; size: number } {
  const p = t.layout[id];
  const size = BUTTON_INFO[id].size * p.s * sizeUnit(v.w, v.h);
  return { left: p.x * v.w - size / 2, top: p.y * v.h - size / 2, size };
}

/** What the weapon panel shows: the weapon in hand, its ammo, the other one and the balloons. */
export interface WeaponChip {
  label: string;
  mag: number;
  reserve: number;
  other: string | null;
  grenades: number;
  reloading: boolean;
}

/** How each control looks (shared by the game and the editor). */
function Face({ id, size, fireOnRelease, aiming, ability, weapons, pickLabel }: { id: TouchButtonId; size: number; fireOnRelease?: boolean; aiming?: boolean; ability?: { label: string; color: string; ready: number }; weapons?: WeaponChip; pickLabel?: string }) {
  const round = "flex h-full w-full items-center justify-center rounded-full text-white ring-2";
  const icon = { width: size * 0.42, height: size * 0.42 };
  switch (id) {
    case "stick":
      return <div className="flex h-full w-full items-center justify-center rounded-full border-2 border-dashed border-white/30 text-[10px] text-white/60">mover</div>;
    case "fire":
      return (
        <div className={`${round} relative ${fireOnRelease ? "bg-sky-500/45 ring-sky-300/80" : "bg-rose-500/45 ring-rose-300/80"}`}>
          <Crosshair style={icon} />
          {fireOnRelease && <span className="absolute -top-6 whitespace-nowrap rounded bg-slate-950/70 px-1.5 text-[10px]">suelta para disparar</span>}
        </div>
      );
    case "fire2":
      return (
        <div className={`${round} bg-rose-500/35 ring-rose-300/60`}>
          <Crosshair style={icon} />
        </div>
      );
    case "aim":
      return (
        <div className={`${round} ${aiming ? "bg-sky-500/85" : "bg-sky-500/35"} ring-sky-300/70`}>
          <Target style={icon} />
        </div>
      );
    case "reload":
      return (
        <div className={`${round} bg-white/20 ring-white/45`}>
          <RefreshCw style={icon} />
        </div>
      );
    case "jump":
      return (
        <div className={`${round} bg-white/20 ring-white/45`}>
          <MoveUp style={icon} />
        </div>
      );
    case "melee":
      return (
        <div className={`${round} bg-orange-500/40 ring-orange-300/60`}>
          <HandMetal style={icon} />
        </div>
      );
    case "grenade":
      return (
        <div className={`${round} relative bg-lime-600/40 ring-lime-300/60`}>
          <Bomb style={icon} />
          {weapons && <span className="absolute -bottom-1 -right-1 rounded-full bg-slate-950/80 px-1.5 text-[10px] font-bold">{weapons.grenades}</span>}
        </div>
      );
    case "ability": {
      const a = ability ?? { label: "Habilidad", color: "#FF7A1A", ready: 1 };
      return (
        <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-full text-[9px] font-bold leading-tight text-white ring-2 ring-white/50" style={{ background: a.ready >= 1 ? a.color : "rgba(15,23,42,0.6)" }}>
          <span className="absolute inset-x-0 bottom-0 bg-white/25" style={{ height: `${a.ready * 100}%` }} />
          <Zap className="relative" style={{ width: size * 0.36, height: size * 0.36 }} />
          <span className="relative max-w-full truncate px-1">{a.label}</span>
        </div>
      );
    }
    case "weapons": {
      const w = weapons ?? { label: "Rociador", mag: 32, reserve: 160, other: "Pistola", grenades: 2, reloading: false };
      return (
        <div className="flex h-full items-center gap-2 whitespace-nowrap rounded-2xl bg-slate-950/65 px-3 text-white ring-1 ring-white/20">
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[10px] font-bold uppercase text-slate-300">{w.reloading ? "recargando…" : w.label}</span>
            <span className={`font-mono text-lg font-bold ${w.mag === 0 ? "text-red-400" : ""}`}>
              {w.mag}
              <span className="text-xs text-slate-400">/{w.reserve}</span>
            </span>
          </span>
          {w.other && (
            <span className="flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-[11px] font-bold">
              <ArrowUpDown className="h-3.5 w-3.5" />
              {w.other}
            </span>
          )}
        </div>
      );
    }
    case "pick":
      return (
        <div className="flex h-full items-center justify-center gap-1 whitespace-nowrap rounded-full bg-amber-500/80 px-3 text-xs font-semibold text-white ring-2 ring-amber-200/70">
          <Hand className="h-4 w-4" /> {pickLabel ?? "Agarrar"}
        </div>
      );
  }
}

/** Wide controls (the weapon panel, the pick-up chip) are as tall as their size, and as wide as their content. */
const WIDE: TouchButtonId[] = ["weapons", "pick"];

function placeStyle(id: TouchButtonId, t: TouchSettings, v: { w: number; h: number }): CSSProperties {
  const b = boxOf(id, t, v);
  if (WIDE.includes(id)) return { left: b.left + b.size / 2, top: b.top, height: b.size, transform: "translateX(-50%)" };
  return { left: b.left, top: b.top, width: b.size, height: b.size };
}

/**
 * Touch: the controls where `settings` puts them. The left side's stick
 * appears under the thumb (or stays put with `fixedStick`); a drag anywhere
 * else turns the view. «Disparar» also turns the view while you drag it, so
 * you can shoot and aim at once; with `fireOnRelease` (the sniper's scope)
 * holding it aims and lifting the finger shoots. Tapping the weapon panel
 * switches weapons.
 */
export function TouchControls({
  controlsRef,
  settings,
  canPick,
  pickLabel,
  aiming,
  onAim,
  fireOnRelease,
  ability,
  weapons,
}: {
  controlsRef: RefObject<ControlState>;
  settings: TouchSettings;
  canPick: boolean;
  pickLabel: string;
  aiming: boolean;
  onAim: () => void;
  fireOnRelease: boolean;
  /** The ability's button: name, color and how ready it is (0–1). */
  ability?: { label: string; color: string; ready: number };
  weapons: WeaponChip;
}) {
  // Leaving (dying, the match ending) lets go of whatever the fingers were holding.
  useEffect(() => {
    const c = controlsRef.current;
    return () => releaseControls(c);
  }, [controlsRef]);
  const releaseRef = useRef(fireOnRelease);
  useEffect(() => {
    releaseRef.current = fireOnRelease;
  }, [fireOnRelease]);
  const v = useViewport();
  const stickBox = boxOf("stick", settings, v);
  const radius = stickBox.size / 2;
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const stickId = useRef<number | null>(null);
  const lookIds = useRef(new Map<number, { x: number; y: number }>());
  /** Which fingers hold which buttons (two can hold «fire»: both triggers). */
  const holds = useRef(new Map<number, HoldKey>());

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const left = e.clientX < window.innerWidth * 0.45;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (left && stickId.current === null) {
      stickId.current = e.pointerId;
      const center = settings.fixedStick ? { x: stickBox.left + radius, y: stickBox.top + radius } : { x: e.clientX, y: e.clientY };
      setStick({ ...center, dx: 0, dy: 0 });
      if (settings.fixedStick) move(e.clientX - center.x, e.clientY - center.y, center);
    } else {
      lookIds.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  };
  const move = (rawX: number, rawY: number, base: { x: number; y: number }) => {
    let dx = rawX;
    let dy = rawY;
    const d = Math.hypot(dx, dy);
    if (d > radius) {
      dx *= radius / d;
      dy *= radius / d;
    }
    const c = controlsRef.current;
    c.mx = dx / radius;
    c.mz = -dy / radius;
    setStick({ x: base.x, y: base.y, dx, dy });
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId === stickId.current && stick) {
      move(e.clientX - stick.x, e.clientY - stick.y, stick);
      return;
    }
    const last = lookIds.current.get(e.pointerId);
    if (last) {
      const c = controlsRef.current;
      c.lookX += e.clientX - last.x;
      c.lookY += e.clientY - last.y;
      lookIds.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId === stickId.current) {
      stickId.current = null;
      controlsRef.current.mx = 0;
      controlsRef.current.mz = 0;
      setStick(null);
    }
    lookIds.current.delete(e.pointerId);
  };

  /** Held buttons: `data-hold` is the control; with `data-look` the finger also turns the view. */
  const holdDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const key = e.currentTarget.dataset.hold as HoldKey;
    holds.current.set(e.pointerId, key);
    if (!(key === "fire" && releaseRef.current)) controlsRef.current[key] = true;
    if (e.currentTarget.dataset.look) lookIds.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const holdMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const last = lookIds.current.get(e.pointerId);
    if (!last) return;
    controlsRef.current.lookX += e.clientX - last.x;
    controlsRef.current.lookY += e.clientY - last.y;
    lookIds.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const holdUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const key = e.currentTarget.dataset.hold as HoldKey;
    holds.current.delete(e.pointerId);
    lookIds.current.delete(e.pointerId);
    const c = controlsRef.current;
    if (key === "fire" && releaseRef.current && e.type === "pointerup") {
      // Scoped: lifting the finger is the trigger (a short press, so the loop sees it).
      c.fire = true;
      setTimeout(() => (c.fire = false), 70);
      return;
    }
    // Still held by another finger (the other trigger)? Keep it.
    if ([...holds.current.values()].includes(key)) return;
    c[key] = false;
  };
  const noMenu = (e: React.MouseEvent) => e.preventDefault();
  const held = { onPointerDown: holdDown, onPointerMove: holdMove, onPointerUp: holdUp, onPointerCancel: holdUp, onContextMenu: noMenu };

  /** One-shot presses, by `data-tap`: aim toggles, the ability, switching weapons, picking up. */
  const tapDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const c = controlsRef.current;
    const what = e.currentTarget.dataset.tap;
    if (what === "aim") onAim();
    else if (what === "ability") {
      if ((ability?.ready ?? 0) >= 1) c.ability = true;
    } else if (what === "pick") c.pick = true;
    else if (what === "weapons") {
      c.swap = true;
      setTimeout(() => (c.swap = false), 90);
    }
  };
  const tapped = { onPointerDown: tapDown, onContextMenu: noMenu };

  const face = (id: TouchButtonId) => (
    <Face id={id} size={boxOf(id, settings, v).size} fireOnRelease={fireOnRelease} aiming={aiming} ability={ability} weapons={weapons} pickLabel={pickLabel} />
  );
  const at = (id: TouchButtonId) => ({ type: "button" as const, "aria-label": BUTTON_INFO[id].label, className: "absolute touch-none", style: placeStyle(id, settings, v) });

  return (
    <div className="absolute inset-0 z-10 select-none" style={{ touchAction: "none" }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {stick ? (
        <div className="pointer-events-none absolute" style={{ left: stick.x - radius, top: stick.y - radius, width: radius * 2, height: radius * 2 }}>
          <div className="h-full w-full rounded-full border-2 border-white/40 bg-white/10" />
          <div className="absolute rounded-full bg-white/65" style={{ width: radius * 0.85, height: radius * 0.85, left: radius * 0.575 + stick.dx, top: radius * 0.575 + stick.dy }} />
        </div>
      ) : (
        <div className="pointer-events-none absolute" style={{ ...placeStyle("stick", settings, v), opacity: settings.opacity }}>
          <Face id="stick" size={stickBox.size} />
        </div>
      )}

      <div style={{ opacity: settings.opacity }}>
        <button {...at("fire")} {...held} data-hold="fire" data-look="1">
          {face("fire")}
        </button>
        {settings.leftFire && (
          <button {...at("fire2")} {...held} data-hold="fire">
            {face("fire2")}
          </button>
        )}
        <button {...at("aim")} {...tapped} data-tap="aim">
          {face("aim")}
        </button>
        <button {...at("reload")} {...held} data-hold="reload">
          {face("reload")}
        </button>
        <button {...at("jump")} {...held} data-hold="jump">
          {face("jump")}
        </button>
        <button {...at("melee")} {...held} data-hold="melee">
          {face("melee")}
        </button>
        <button {...at("grenade")} {...held} data-hold="grenade">
          {face("grenade")}
        </button>
        {ability && (
          <button {...at("ability")} {...tapped} data-tap="ability">
            {face("ability")}
          </button>
        )}
        <button {...at("weapons")} {...tapped} data-tap="weapons">
          {face("weapons")}
        </button>
        {canPick && (
          <button {...at("pick")} {...tapped} data-tap="pick">
            {face("pick")}
          </button>
        )}
      </div>
    </div>
  );
}

const EDITABLE: TouchButtonId[] = ["stick", "fire", "fire2", "aim", "reload", "jump", "melee", "grenade", "ability", "weapons", "pick"];

/**
 * «Ajustar controles»: every control on screen, to drag where it's
 * comfortable and resize; plus opacity, sensitivity, auto-fire, the left
 * trigger and a fixed stick. Changes apply live (`onChange`); the match goes
 * on underneath.
 */
export function ControlsEditor({ settings, onChange, onClose }: { settings: TouchSettings; onChange: (t: TouchSettings) => void; onClose: () => void }) {
  const v = useViewport();
  const [selected, setSelected] = useState<TouchButtonId>("fire");
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(true);
  const drag = useRef<{ id: TouchButtonId; pointer: number; ox: number; oy: number } | null>(null);
  const set = (patch: Partial<TouchSettings>) => onChange({ ...settings, ...patch });
  const place = (id: TouchButtonId, patch: Partial<TouchSettings["layout"][TouchButtonId]>) =>
    onChange({ ...settings, layout: { ...settings.layout, [id]: { ...settings.layout[id], ...patch } } });

  const down = (id: TouchButtonId) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = settings.layout[id];
    drag.current = { id, pointer: e.pointerId, ox: e.clientX - p.x * v.w, oy: e.clientY - p.y * v.h };
    setSelected(id);
    setDragging(true);
  };
  const moveTo = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    place(d.id, { x: Math.max(0.03, Math.min(0.97, (e.clientX - d.ox) / v.w)), y: Math.max(0.05, Math.min(0.97, (e.clientY - d.oy) / v.h)) });
  };
  const end = () => {
    drag.current = null;
    setDragging(false);
  };

  const toggle = (key: "autoFire" | "leftFire" | "fixedStick", label: string) => (
    <label className="flex items-center gap-2 text-xs text-white">
      <input type="checkbox" checked={settings[key]} onChange={(e) => set({ [key]: e.target.checked })} className="h-4 w-4 accent-yellow-400" />
      {label}
    </label>
  );
  const slider = (label: string, value: number, min: number, max: number, onValue: (n: number) => void) => (
    <label className="flex items-center gap-2 text-xs text-white">
      <span className="w-28 shrink-0 truncate">{label}</span>
      <input type="range" min={min} max={max} step={0.05} value={value} onChange={(e) => onValue(Number(e.target.value))} className="w-full accent-yellow-400" />
      <span className="w-9 shrink-0 text-right font-mono">{value.toFixed(2)}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 select-none bg-slate-950/55" style={{ touchAction: "none" }} onPointerMove={moveTo} onPointerUp={end} onPointerCancel={end}>
      {EDITABLE.map((id) => (
        <div
          key={id}
          onPointerDown={down(id)}
          className={`absolute cursor-grab rounded-full ${selected === id ? "outline outline-2 outline-offset-4 outline-yellow-400" : ""} ${id === "fire2" && !settings.leftFire ? "opacity-30" : ""}`}
          style={{ ...placeStyle(id, settings, v), opacity: id === "fire2" && !settings.leftFire ? 0.3 : settings.opacity }}
        >
          <Face id={id} size={boxOf(id, settings, v).size} />
        </div>
      ))}

      {/* Options: on top, out of the way while dragging. */}
      <div
        className={`absolute left-1/2 top-2 flex w-[min(560px,94vw)] -translate-x-1/2 flex-col gap-2 rounded-2xl bg-slate-950/90 p-3 ring-1 ring-white/15 transition-opacity ${dragging ? "pointer-events-none opacity-20" : ""}`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-base text-yellow-300">Ajustar controles</p>
          <div className="flex gap-1.5">
            <button onClick={() => setOpen((o) => !o)} className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white">
              {open ? "Ocultar opciones" : "Opciones"}
            </button>
            <button onClick={() => onChange(DEFAULT_TOUCH)} className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white">
              <RotateCcw className="h-3.5 w-3.5" /> Restablecer
            </button>
            <button onClick={onClose} className="rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-bold text-slate-950">
              Listo
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-300">Arrastra cada botón a donde te quede cómodo (oculta las opciones para llegar a los de abajo). La partida sigue mientras ajustas.</p>
        {slider(`Tamaño: ${BUTTON_INFO[selected].label}`, settings.layout[selected].s, 0.6, 1.6, (n) => place(selected, { s: n }))}
        {open && (
          <>
            <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {slider("Transparencia", settings.opacity, 0.3, 1, (n) => set({ opacity: n }))}
              {slider("Sensibilidad", settings.sens, 0.4, 2, (n) => set({ sens: n }))}
              {slider("Al apuntar", settings.aimSens, 0.3, 1.5, (n) => set({ aimSens: n }))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {toggle("autoFire", "Disparo automático")}
              {toggle("leftFire", "Disparo a la izquierda")}
              {toggle("fixedStick", "Joystick fijo")}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
