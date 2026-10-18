"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { ArrowUpDown, Bomb, Crosshair, Hand, HandMetal, MoveUp, RefreshCw, Target } from "lucide-react";

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
  board: boolean;
  lookX: number;
  lookY: number;
}

export function newControls(): ControlState {
  return { mx: 0, mz: 0, jump: false, fire: false, aim: false, reload: false, swap: false, grenade: false, melee: false, pick: false, board: false, lookX: 0, lookY: 0 };
}

/** Radians per pixel dragged (touch) or moved (mouse). */
export const TOUCH_LOOK = 0.0062;
export const MOUSE_LOOK = 0.0022;
const STICK_RADIUS = 56;

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

type HoldKey = "fire" | "jump" | "reload" | "swap" | "grenade" | "melee";

/**
 * Touch: a joystick wherever the left thumb lands, drag on the right to
 * look, and buttons. The fire button also turns the camera when you drag the
 * finger that holds it, so you can keep shooting while you aim.
 */
export function TouchControls({
  controlsRef,
  canPick,
  pickLabel,
  aiming,
  onAim,
}: {
  controlsRef: RefObject<ControlState>;
  canPick: boolean;
  pickLabel: string;
  aiming: boolean;
  onAim: () => void;
}) {
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const stickId = useRef<number | null>(null);
  const lookIds = useRef(new Map<number, { x: number; y: number }>());

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const left = e.clientX < window.innerWidth * 0.42;
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

  /** Buttons: `data-hold` says which control; with `data-look` the finger also looks. */
  const holdDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    controlsRef.current[e.currentTarget.dataset.hold as HoldKey] = true;
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
    controlsRef.current[e.currentTarget.dataset.hold as HoldKey] = false;
    lookIds.current.delete(e.pointerId);
  };
  const held = { onPointerDown: holdDown, onPointerMove: holdMove, onPointerUp: holdUp, onPointerCancel: holdUp };
  const small = "flex h-12 w-12 items-center justify-center rounded-full text-white ring-2";

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
          <div className="absolute h-12 w-12 rounded-full bg-white/60" style={{ left: STICK_RADIUS - 24 + stick.dx, top: STICK_RADIUS - 24 + stick.dy }} />
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-10 left-10 flex h-28 w-28 items-center justify-center rounded-full border-2 border-dashed border-white/25 text-[10px] text-white/50">
          mover
        </div>
      )}

      <div className="absolute bottom-4 right-4 flex items-end gap-2.5">
        <div className="flex flex-col items-center gap-2.5">
          <button {...held} data-hold="grenade" aria-label="Granada" className={`${small} bg-lime-600/40 ring-lime-300/60 active:bg-lime-600/80`}>
            <Bomb className="h-5 w-5" />
          </button>
          <button {...held} data-hold="melee" aria-label="Golpe" className={`${small} bg-orange-500/40 ring-orange-300/60 active:bg-orange-500/80`}>
            <HandMetal className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-2.5">
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              onAim();
            }}
            aria-label="Apuntar"
            aria-pressed={aiming}
            className={`${small} ${aiming ? "bg-sky-500/80" : "bg-sky-500/35"} ring-sky-300/60`}
          >
            <Target className="h-5 w-5" />
          </button>
          <button
            {...held}
            data-hold="fire"
            data-look="1"
            aria-label="Disparar"
            className="flex h-24 w-24 items-center justify-center rounded-full bg-rose-500/40 text-white ring-2 ring-rose-300/70 active:bg-rose-500/75"
          >
            <Crosshair className="h-10 w-10" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-2.5">
          <button {...held} data-hold="swap" aria-label="Cambiar arma" className={`${small} bg-white/20 ring-white/40 active:bg-white/40`}>
            <ArrowUpDown className="h-5 w-5" />
          </button>
          <button {...held} data-hold="reload" aria-label="Recargar" className={`${small} bg-white/20 ring-white/40 active:bg-white/40`}>
            <RefreshCw className="h-5 w-5" />
          </button>
          <button {...held} data-hold="jump" aria-label="Saltar" className={`${small} bg-white/20 ring-white/40 active:bg-white/40`}>
            <MoveUp className="h-5 w-5" />
          </button>
        </div>
      </div>
      {canPick && (
        <button
          onPointerDown={(e) => {
            e.stopPropagation();
            controlsRef.current.pick = true;
          }}
          className="absolute bottom-36 right-32 flex h-11 items-center justify-center gap-1 rounded-full bg-amber-500/70 px-3 text-xs font-semibold text-white ring-2 ring-amber-200/70 active:bg-amber-500/90"
        >
          <Hand className="h-4 w-4" /> {pickLabel}
        </button>
      )}
    </div>
  );
}
