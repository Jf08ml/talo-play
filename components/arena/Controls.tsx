"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { Hand, MoveUp, Shield, Swords } from "lucide-react";

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
  pick: boolean;
  camera: boolean;
  lookX: number;
  lookY: number;
}

export function newControls(): ControlState {
  return { mx: 0, mz: 0, jump: false, attack: false, block: false, pick: false, camera: false, lookX: 0, lookY: 0 };
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
 * with the mouse; WASD or arrows to move, click to attack (hold with the
 * bow), right click or Shift to block, space to jump, E to pick up, V to
 * switch the camera. Returns whether the pointer is locked.
 */
export function useDesktopControls(controlsRef: RefObject<ControlState>, target: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [locked, setLocked] = useState(false);
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
      c.block = has("shift") || mouseBlock;
    };
    let mouseBlock = false;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k.startsWith("arrow") || k === " ") e.preventDefault();
      if (k === "e" || k === "f") c.pick = true;
      if (k === "v" && !e.repeat) c.camera = true;
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
        if (e.target === el) el?.requestPointerLock?.();
        return;
      }
      if (e.button === 0) c.attack = true;
      if (e.button === 2) {
        mouseBlock = true;
        syncMove();
      }
    };
    const mup = (e: MouseEvent) => {
      if (e.button === 0) c.attack = false;
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
        syncMove();
      }
    };
    const blur = () => {
      keys.clear();
      c.attack = false;
      mouseBlock = false;
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
 * drag anywhere on the right to look, and buttons to attack, block, jump and
 * pick up (only when something is in reach).
 */
export function TouchControls({
  controlsRef,
  canPick,
  pickLabel,
  bow,
}: {
  controlsRef: RefObject<ControlState>;
  canPick: boolean;
  pickLabel: string;
  bow: boolean;
}) {
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
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

  /** A button held with a finger (its own pointer, so looking keeps working). */
  const hold = (key: "attack" | "block" | "jump") => ({
    onPointerDown: (e: ReactPointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      controlsRef.current[key] = true;
    },
    onPointerUp: (e: ReactPointerEvent) => {
      e.stopPropagation();
      controlsRef.current[key] = false;
    },
    onPointerCancel: () => {
      controlsRef.current[key] = false;
    },
  });

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

      <div className="absolute bottom-5 right-5 grid grid-cols-2 items-end gap-3">
        <button
          {...hold("block")}
          aria-label="Bloquear"
          disabled={bow}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-500/35 text-white ring-2 ring-sky-300/60 active:bg-sky-500/70 disabled:opacity-30"
        >
          <Shield className="h-7 w-7" />
        </button>
        <button
          {...hold("attack")}
          aria-label="Atacar"
          className="flex h-24 w-24 items-center justify-center rounded-full bg-rose-500/40 text-white ring-2 ring-rose-300/70 active:bg-rose-500/75"
        >
          <Swords className="h-10 w-10" />
        </button>
        <button
          {...hold("jump")}
          aria-label="Saltar"
          className="flex h-14 w-14 items-center justify-center justify-self-center rounded-full bg-white/20 text-white ring-2 ring-white/40 active:bg-white/40"
        >
          <MoveUp className="h-6 w-6" />
        </button>
        {canPick && (
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              controlsRef.current.pick = true;
            }}
            className="flex h-14 items-center justify-center gap-1 rounded-full bg-amber-500/60 px-3 text-xs font-semibold text-white ring-2 ring-amber-200/70 active:bg-amber-500/90"
          >
            <Hand className="h-4 w-4" /> {pickLabel}
          </button>
        )}
      </div>
    </div>
  );
}
