"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { Footprints, Hand, MoveUp, Shield, Smile, Sparkles, Swords, Wind } from "lucide-react";
import { SPECIAL_MAX } from "@/lib/arenaSim";
import { EMOTES } from "@/lib/arenaLooks";

/**
 * What the player is pressing, read by the battle loop every frame. Look
 * deltas accumulate until the loop takes them; `pick` and `camera` are
 * one-shot presses the loop clears.
 */
export interface ControlState {
  mx: number;
  mz: number;
  jump: boolean;
  attack: boolean;
  block: boolean;
  sprint: boolean;
  dodge: boolean;
  kick: boolean;
  special: boolean;
  pick: boolean;
  camera: boolean;
  /** A gesture asked for (`EMOTES` index + 1; 0 none), one-shot like `pick`. */
  emote: number;
  lookX: number;
  lookY: number;
}

export function newControls(): ControlState {
  return { mx: 0, mz: 0, jump: false, attack: false, block: false, sprint: false, dodge: false, kick: false, special: false, pick: false, camera: false, emote: 0, lookX: 0, lookY: 0 };
}

/** Radians per pixel dragged (touch) or moved (mouse). */
export const TOUCH_LOOK = 0.0065;
export const MOUSE_LOOK = 0.0024;
const STICK_RADIUS = 56;

/** Whether this device has a mouse (then it plays with mouse and keyboard). */
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
 * Mouse and keyboard: click the arena to lock the pointer and look around
 * with the mouse; WASD or arrows to move, Shift to run, click to attack
 * (again during the swing for a combo; hold with the bow), right click or F
 * to block, R or the middle button to kick, X for the special, Q to dodge,
 * space to jump, E to pick up, V to switch the camera, 1–4 for the gestures.
 * The pointer is only captured while `canLock` (fighting and standing):
 * it's let go at the end of a round, when you fall and with Esc, so the
 * buttons on screen can be clicked. Returns whether it's locked.
 */
export function useDesktopControls(
  controlsRef: RefObject<ControlState>,
  target: RefObject<HTMLElement | null>,
  enabled: boolean,
  canLock: boolean
): boolean {
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
    const syncMove = () => {
      const has = (...k: string[]) => k.some((key) => keys.has(key));
      c.mx = (has("d", "arrowright") ? 1 : 0) - (has("a", "arrowleft") ? 1 : 0);
      c.mz = (has("w", "arrowup") ? 1 : 0) - (has("s", "arrowdown") ? 1 : 0);
      c.jump = has(" ");
      c.sprint = has("shift");
      c.dodge = has("q", "c");
      c.kick = has("r") || mouseKick;
      c.special = has("x");
      c.block = has("f") || mouseBlock;
    };
    let mouseBlock = false;
    let mouseKick = false;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k.startsWith("arrow") || k === " ") e.preventDefault();
      if (k === "e") c.pick = true;
      if (k === "v" && !e.repeat) c.camera = true;
      if (!e.repeat && k >= "1" && k <= String(EMOTES.length) && k.length === 1) c.emote = Number(k);
      keys.add(k);
      syncMove();
    };
    const up = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
      syncMove();
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
      if (e.button === 0) c.attack = true;
      if (e.button === 1) {
        e.preventDefault();
        mouseKick = true;
        syncMove();
      }
      if (e.button === 2) {
        mouseBlock = true;
        syncMove();
      }
    };
    const mup = (e: MouseEvent) => {
      if (e.button === 0) c.attack = false;
      if (e.button === 1) {
        mouseKick = false;
        syncMove();
      }
      if (e.button === 2) {
        mouseBlock = false;
        syncMove();
      }
    };
    const menu = (e: Event) => e.preventDefault();
    const lockChange = () => {
      const on = document.pointerLockElement === el;
      setLocked(on);
      if (!on) {
        c.attack = false;
        mouseBlock = false;
        mouseKick = false;
        syncMove();
      }
    };
    const blur = () => {
      keys.clear();
      c.attack = false;
      mouseBlock = false;
      mouseKick = false;
      syncMove();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousemove", move);
    window.addEventListener("mousedown", mdown);
    window.addEventListener("mouseup", mup);
    window.addEventListener("blur", blur);
    el?.addEventListener("contextmenu", menu);
    document.addEventListener("pointerlockchange", lockChange);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mousedown", mdown);
      window.removeEventListener("mouseup", mup);
      window.removeEventListener("blur", blur);
      el?.removeEventListener("contextmenu", menu);
      document.removeEventListener("pointerlockchange", lockChange);
      if (document.pointerLockElement === el) document.exitPointerLock?.();
    };
  }, [controlsRef, target, enabled]);
  return locked;
}

/**
 * Touch controls over the arena: a joystick wherever the left thumb lands,
 * drag anywhere on the right to look, and buttons to attack, block, dodge,
 * jump, kick, the special (its ring fills with the meter; `special` 0–100)
 * and pick up (only when something is in reach). `kick` is the kick's
 * readiness (0–1).
 */
export function TouchControls({
  controlsRef,
  canPick,
  pickLabel,
  bow,
  special,
  kick,
}: {
  controlsRef: RefObject<ControlState>;
  canPick: boolean;
  pickLabel: string;
  bow: boolean;
  special: number;
  kick: number;
}) {
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const [emotes, setEmotes] = useState(false);
  const stickId = useRef<number | null>(null);
  const lookIds = useRef(new Map<number, { x: number; y: number }>());

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const left = e.clientX < window.innerWidth * 0.45;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (left && stickId.current === null) {
      stickId.current = e.pointerId;
      setStick({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
    } else {
      lookIds.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const c = controlsRef.current;
    if (e.pointerId === stickId.current && stick) {
      let dx = e.clientX - stick.x;
      let dy = e.clientY - stick.y;
      const d = Math.hypot(dx, dy);
      if (d > STICK_RADIUS) {
        dx *= STICK_RADIUS / d;
        dy *= STICK_RADIUS / d;
      }
      c.mx = dx / STICK_RADIUS;
      c.mz = -dy / STICK_RADIUS;
      setStick({ ...stick, dx, dy });
      return;
    }
    const last = lookIds.current.get(e.pointerId);
    if (last) {
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

  /**
   * Buttons held with a finger (each its own pointer, so looking keeps
   * working). The button says which control it holds in `data-hold`; with
   * `data-look`, dragging that same finger also turns the camera, so you can
   * keep swinging or blocking while you aim.
   */
  type HoldKey = "attack" | "block" | "jump" | "dodge" | "kick" | "special";
  const holdKey = (e: ReactPointerEvent<HTMLButtonElement>) => e.currentTarget.dataset.hold as HoldKey;
  const holdDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    controlsRef.current[holdKey(e)] = true;
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
    controlsRef.current[holdKey(e)] = false;
    lookIds.current.delete(e.pointerId);
  };
  const held = { onPointerDown: holdDown, onPointerMove: holdMove, onPointerUp: holdUp, onPointerCancel: holdUp };
  const full = special >= SPECIAL_MAX;
  const fill = Math.round((Math.min(SPECIAL_MAX, special) / SPECIAL_MAX) * 100);

  return (
    <div
      className="absolute inset-0 z-10 select-none"
      style={{ touchAction: "none" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {stick ? (
        <div className="pointer-events-none absolute" style={{ left: stick.x - STICK_RADIUS, top: stick.y - STICK_RADIUS }}>
          <div className="h-28 w-28 rounded-full border-2 border-white/40 bg-white/10" />
          <div
            className="absolute h-12 w-12 rounded-full bg-white/60"
            style={{ left: STICK_RADIUS - 24 + stick.dx, top: STICK_RADIUS - 24 + stick.dy }}
          />
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-10 left-10 flex h-28 w-28 items-center justify-center rounded-full border-2 border-dashed border-white/25 text-[10px] text-white/50">
          mover
        </div>
      )}

      {/* Gestures: a small button that opens the four. */}
      <div className="absolute right-5 top-28 flex flex-col items-end gap-2">
        <button
          onPointerDown={(e) => {
            e.stopPropagation();
            setEmotes((v) => !v);
          }}
          aria-label="Gestos"
          className={`flex h-11 w-11 items-center justify-center rounded-full text-white ring-2 ${emotes ? "bg-white/40 ring-white/80" : "bg-white/15 ring-white/40"}`}
        >
          <Smile className="h-5 w-5" />
        </button>
        {emotes && (
          <div className="flex gap-1.5 rounded-full bg-slate-950/70 p-1.5">
            {EMOTES.map((em, i) => (
              <button
                key={em.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  controlsRef.current.emote = i + 1;
                  setEmotes(false);
                }}
                aria-label={em.label}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-xl active:bg-white/40"
              >
                {em.emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {canPick && (
        <button
          onPointerDown={(e) => {
            e.stopPropagation();
            controlsRef.current.pick = true;
          }}
          className="absolute bottom-[13.5rem] right-5 flex h-12 items-center justify-center gap-1 rounded-full bg-amber-500/60 px-3 text-xs font-semibold text-white ring-2 ring-amber-200/70 active:bg-amber-500/90"
        >
          <Hand className="h-4 w-4" /> {pickLabel}
        </button>
      )}

      <div className="absolute bottom-5 right-5 grid grid-cols-3 items-end gap-3">
        <button
          {...held}
          data-hold="dodge"
          aria-label="Esquivar"
          className="flex h-14 w-14 items-center justify-center self-center rounded-full bg-emerald-500/35 text-white ring-2 ring-emerald-300/60 active:bg-emerald-500/70"
        >
          <Wind className="h-6 w-6" />
        </button>
        <button
          {...held}
          data-hold="block"
          data-look="1"
          aria-label="Bloquear"
          disabled={bow}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-500/35 text-white ring-2 ring-sky-300/60 active:bg-sky-500/70 disabled:opacity-30"
        >
          <Shield className="h-7 w-7" />
        </button>
        <button
          {...held}
          data-hold="attack"
          data-look="1"
          aria-label="Atacar"
          className="flex h-24 w-24 items-center justify-center rounded-full bg-rose-500/40 text-white ring-2 ring-rose-300/70 active:bg-rose-500/75"
        >
          <Swords className="h-10 w-10" />
        </button>
        <button
          {...held}
          data-hold="jump"
          aria-label="Saltar"
          className="flex h-14 w-14 items-center justify-center justify-self-center rounded-full bg-white/20 text-white ring-2 ring-white/40 active:bg-white/40"
        >
          <MoveUp className="h-6 w-6" />
        </button>
        <button
          {...held}
          data-hold="kick"
          aria-label="Patear"
          className="flex h-14 w-14 items-center justify-center justify-self-center rounded-full bg-orange-500/35 text-white ring-2 ring-orange-300/60 transition-opacity active:bg-orange-500/70"
          style={{ opacity: kick >= 1 ? 1 : 0.35 + kick * 0.4 }}
        >
          <Footprints className="h-6 w-6" />
        </button>
        {/* The special: its ring fills with the meter and lights up when full. */}
        <button
          {...held}
          data-hold="special"
          aria-label="Golpe especial"
          className={`flex h-16 w-16 items-center justify-center justify-self-center rounded-full p-1 ${full ? "animate-pulse" : ""}`}
          style={{ background: `conic-gradient(${full ? "#fde047" : "#a78bfa"} ${fill}%, rgba(255,255,255,0.15) 0)` }}
        >
          <span className={`flex h-full w-full items-center justify-center rounded-full ${full ? "bg-yellow-400/80 text-slate-950" : "bg-slate-950/70 text-white/50"}`}>
            <Sparkles className="h-6 w-6" />
          </span>
        </button>
      </div>
    </div>
  );
}
