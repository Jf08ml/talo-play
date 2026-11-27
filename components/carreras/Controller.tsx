"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { openInput, type CarInputWire } from "@/lib/carreras";
import { ChevronLeft, ChevronRight, Hand, Keyboard, Smartphone, Gamepad2, Sparkles } from "lucide-react";

export type ControlMode = "botones" | "inclinacion";

const MODE_KEY = "carreras.controlMode";
/** Minimum time between two input writes (pantalla mode). */
const SEND_MS = 50;
/** Tilt (degrees) that turns the wheel all the way. */
const FULL_TILT_DEG = 30;
const DEAD_ZONE = 0.06;

type Zone = "left" | "right" | "brake" | "drift";

/** Keyboard driving (computers): arrows or A/D to steer, down arrow, S or space to brake, Shift to drift. */
const KEY_ZONES: Record<string, Zone> = {
  ArrowLeft: "left",
  a: "left",
  A: "left",
  ArrowRight: "right",
  d: "right",
  D: "right",
  ArrowDown: "brake",
  s: "brake",
  S: "brake",
  " ": "brake",
  Shift: "drift",
};

const FINE_POINTER = "(hover: hover) and (pointer: fine)";
const subscribePointer = (cb: () => void) => {
  const q = window.matchMedia(FINE_POINTER);
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};
/** A mouse (a computer): the keys drive, and the big touch zones give way to a hint. */
function useFinePointer(): boolean {
  return useSyncExternalStore(subscribePointer, () => window.matchMedia(FINE_POINTER).matches, () => false);
}

function readMode(): ControlMode {
  try {
    return localStorage.getItem(MODE_KEY) === "inclinacion" ? "inclinacion" : "botones";
  } catch {
    return "botones";
  }
}

function saveMode(mode: ControlMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Private mode: it just won't be remembered.
  }
}

function screenAngle(): number {
  if (typeof screen !== "undefined" && screen.orientation) return screen.orientation.angle;
  return (window as { orientation?: number }).orientation ?? 0;
}

/**
 * Steering from the phone's tilt: how much gravity points along the screen's
 * left-right axis. Works the same held flat or upright, portrait or landscape.
 */
function tiltSteer(e: DeviceOrientationEvent): number | null {
  if (e.beta === null || e.gamma === null) return null;
  const rad = Math.PI / 180;
  const b = e.beta * rad;
  const g = e.gamma * rad;
  const a = screenAngle() * rad;
  // Gravity in device coordinates is (cosβ·sinγ, −sinβ, ·); the screen's x axis is (cos a, −sin a).
  const raw = Math.cos(b) * Math.sin(g) * Math.cos(a) + Math.sin(b) * Math.sin(a);
  const steer = raw / Math.sin(FULL_TILT_DEG * rad);
  if (Math.abs(steer) < DEAD_ZONE) return 0;
  return Math.max(-1, Math.min(1, steer));
}

type PermissionRequester = { requestPermission?: () => Promise<"granted" | "denied"> };

function tiltNeedsPermission(): boolean {
  return typeof DeviceOrientationEvent !== "undefined" && !!(DeviceOrientationEvent as unknown as PermissionRequester).requestPermission;
}

/** iOS asks for permission to read motion, and only from a tap. */
async function enableTilt(): Promise<boolean> {
  if (typeof DeviceOrientationEvent === "undefined") return false;
  const req = (DeviceOrientationEvent as unknown as PermissionRequester).requestPermission;
  if (!req) return true;
  try {
    return (await req()) === "granted";
  } catch {
    return false;
  }
}

/** Keeps the phone from dimming its screen mid-race. */
export function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (cancelled) l.release().catch(() => {});
          else lock = l;
        })
        .catch(() => {});
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, []);
}

/**
 * Pantalla mode: sends this phone's input to the screen as it changes, at
 * most every SEND_MS (the last value always goes out).
 */
export function useInputSender(roomId: string, clientId: string): (input: CarInputWire) => void {
  const sender = useRef<ReturnType<typeof openInput> | null>(null);
  const pending = useRef<CarInputWire>({ s: 0, b: false });
  const lastSent = useRef<{ wire: CarInputWire; at: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const s = openInput(roomId, clientId);
    sender.current = s;
    s.send({ s: 0, b: false });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      s.close();
      sender.current = null;
      lastSent.current = null;
    };
  }, [roomId, clientId]);

  const flush = () => {
    timer.current = null;
    const wire = pending.current;
    const last = lastSent.current;
    if (last && last.wire.s === wire.s && last.wire.b === wire.b && !!last.wire.d === !!wire.d) return;
    lastSent.current = { wire, at: Date.now() };
    sender.current?.send(wire);
  };

  return (wire: CarInputWire) => {
    pending.current = { s: Math.round(wire.s * 20) / 20, b: wire.b, d: !!wire.d };
    if (timer.current) return;
    const wait = lastSent.current ? SEND_MS - (Date.now() - lastSent.current.at) : 0;
    if (wait <= 0) flush();
    else timer.current = setTimeout(flush, wait);
  };
}

/**
 * The phone as a steering wheel. Gas is automatic; the player steers (two
 * buttons under the left thumb, or tilting the phone), holds «Derrape» (the
 * right thumb) to drift and «Frenar» to slow down or reverse. `panel` fills a page (pantalla mode); `overlay` sits on top of the
 * 3D view (telefono mode).
 */
export default function Controller({
  color,
  locked,
  onInput,
  variant = "panel",
}: {
  color: string;
  /** Countdown still running: controls show, but the car won't move yet. */
  locked: boolean;
  onInput: (input: CarInputWire) => void;
  variant?: "panel" | "overlay";
}) {
  const [mode, setMode] = useState<ControlMode>(readMode);
  const [tiltError, setTiltError] = useState<string | null>(null);
  const [tiltReady, setTiltReady] = useState(false);
  const [pressed, setPressed] = useState<Record<Zone, boolean>>({ left: false, right: false, brake: false, drift: false });
  const [tilt, setTilt] = useState(0);
  const tiltRef = useRef(0);
  const pointers = useRef(new Map<number, Zone>());
  const keys = useRef(new Set<Zone>());
  const fine = useFinePointer();
  const [showTouch, setShowTouch] = useState(false);
  const current = useRef<CarInputWire>({ s: 0, b: false });

  const emit = (wire: CarInputWire) => {
    current.current = wire;
    onInput(wire);
  };

  // Buttons: every finger is tracked by pointer id, so left + brake works at once; held keys count too.
  const updateFromPointers = () => {
    const zones = new Set([...pointers.current.values(), ...keys.current]);
    const next = { left: zones.has("left"), right: zones.has("right"), brake: zones.has("brake"), drift: zones.has("drift") };
    setPressed(next);
    const keySteer = (keys.current.has("right") ? 1 : 0) - (keys.current.has("left") ? 1 : 0);
    const steer = mode === "botones" || keySteer ? (next.right ? 1 : 0) - (next.left ? 1 : 0) : tiltRef.current;
    emit({ s: steer, b: next.brake, d: next.drift });
  };

  const down = (e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault();
    pointers.current.set(e.pointerId, e.currentTarget.dataset.zone as Zone);
    updateFromPointers();
  };

  useEffect(() => {
    const up = (e: PointerEvent) => {
      if (!pointers.current.delete(e.pointerId)) return;
      updateFromPointers();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  });

  // Keyboard.
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
    const onKey = (e: KeyboardEvent) => {
      const zone = KEY_ZONES[e.key];
      if (!zone || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      const had = keys.current.has(zone);
      if (e.type === "keydown") keys.current.add(zone);
      else keys.current.delete(zone);
      if (had !== keys.current.has(zone)) updateFromPointers();
    };
    // Switching windows mid-press: let go of everything.
    const release = () => {
      if (!keys.current.size) return;
      keys.current.clear();
      updateFromPointers();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", release);
    };
  });

  // Tilt.
  useEffect(() => {
    if (mode !== "inclinacion") return;
    const onTilt = (e: DeviceOrientationEvent) => {
      const steer = tiltSteer(e);
      if (steer === null) return;
      setTilt(steer);
      tiltRef.current = steer;
      // Held arrow keys win over the tilt.
      if (!keys.current.has("left") && !keys.current.has("right")) emit({ s: steer, b: current.current.b, d: current.current.d });
    };
    window.addEventListener("deviceorientation", onTilt);
    return () => window.removeEventListener("deviceorientation", onTilt);
  });

  const switchMode = async (next: ControlMode) => {
    setTiltError(null);
    if (next === "inclinacion" && !(await enableTilt())) {
      setTiltError("No pudimos leer la inclinación del teléfono. Revisa los permisos o usa los botones.");
      return;
    }
    if (next === "inclinacion") setTiltReady(true);
    saveMode(next);
    setMode(next);
    setTilt(0);
    tiltRef.current = 0;
    emit({ s: 0, b: current.current.b, d: current.current.d });
  };

  // A tilt mode remembered from last time still needs iOS's permission: ask on the first tap.
  const needsTiltTap = mode === "inclinacion" && !tiltReady && tiltNeedsPermission();
  const overlay = variant === "overlay";

  const keysHint = (
    <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-200">
      <Keyboard className="h-4 w-4" />
      <span>
        <Key>←</Key> <Key>→</Key> o <Key>A</Key> <Key>D</Key> doblar
      </span>
      <span>
        <Key>Shift</Key> derrapar (en el aire: truco)
      </span>
      <span>
        <Key>↓</Key> o <Key>Espacio</Key> frenar
      </span>
    </p>
  );

  const modeToggle = (
    <div className={`grid grid-cols-2 gap-1 rounded-xl p-1 ring-1 ${overlay ? "bg-slate-950/60 ring-white/15" : "bg-slate-900/80 ring-slate-700"}`}>
      {(["botones", "inclinacion"] as ControlMode[]).map((m) => (
        <button
          key={m}
          onClick={() => switchMode(m)}
          className={`flex items-center justify-center gap-1.5 rounded-lg font-medium transition ${overlay ? "px-2 py-1 text-xs" : "py-2 text-sm"} ${
            mode === m ? "bg-violet-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.5)]" : "text-slate-300"
          }`}
        >
          {m === "botones" ? <Gamepad2 className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
          {m === "botones" ? "Botones" : "Inclinación"}
        </button>
      ))}
    </div>
  );

  const zoneClass = (on: boolean) =>
    `flex select-none items-center justify-center rounded-3xl border-2 transition-transform ${
      on ? "scale-[0.97] bg-white/25" : overlay ? "bg-white/10 backdrop-blur-[2px]" : "bg-white/5"
    }`;

  const wheel = (size: string) => (
    <div
      className={`relative flex items-center justify-center rounded-full border-[8px] ${size}`}
      style={{ borderColor: color, transform: `rotate(${tilt * 90}deg)`, transition: "transform 60ms linear" }}
    >
      <span className="absolute top-0 h-4 w-1.5 rounded-full bg-white" />
      <span className="h-1.5 w-full" style={{ backgroundColor: color }} />
    </div>
  );

  const brake = (className = "") => (
    <div
      data-zone="brake"
      onPointerDown={down}
      className={`${zoneClass(pressed.brake)} flex-col gap-0.5 border-slate-400/70 text-slate-100 ${className}`}
    >
      <Hand className="h-6 w-6" />
      <span className="text-[11px] font-semibold uppercase tracking-wide">Frenar</span>
    </div>
  );

  // Held while steering: a drift (sparks under the car), let go for the mini-turbo; a tap in the air, a trick.
  const drift = (className = "") => (
    <div
      data-zone="drift"
      onPointerDown={down}
      className={`${zoneClass(pressed.drift)} flex-col gap-1 border-amber-300/80 text-amber-100 ${className}`}
    >
      <Sparkles className="h-9 w-9" />
      <span className="text-xs font-bold uppercase tracking-wide">Derrape</span>
    </div>
  );

  const steerButtons = (icon: string) => (
    <>
      <div data-zone="left" onPointerDown={down} className={`pointer-events-auto flex-1 ${zoneClass(pressed.left)}`} style={{ borderColor: color }}>
        <ChevronLeft className={icon} style={{ color }} />
      </div>
      <div data-zone="right" onPointerDown={down} className={`pointer-events-auto flex-1 ${zoneClass(pressed.right)}`} style={{ borderColor: color }}>
        <ChevronRight className={icon} style={{ color }} />
      </div>
    </>
  );

  const tiltTap = (
    <button
      onClick={async () => {
        if (await enableTilt()) setTiltReady(true);
        else switchMode("botones");
      }}
      className="flex flex-1 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-violet-400/60 bg-slate-950/50 p-4 text-violet-100"
    >
      <Smartphone className="h-10 w-10" />
      Toca para activar la inclinación
    </button>
  );

  // On a computer, over the race: just the keys (the touch zones only on request).
  if (overlay && fine && !showTouch) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-slate-950/60 px-4 py-2 backdrop-blur">
          {keysHint}
          <button onClick={() => setShowTouch(true)} className="text-xs text-slate-400 underline hover:text-slate-200">
            Usar botones
          </button>
        </div>
      </div>
    );
  }

  if (overlay) {
    return (
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[46%] items-stretch gap-3 p-3"
        style={{ touchAction: "none" }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {mode === "botones" ? (
          <>
            <div className="flex w-[46%] gap-2">{steerButtons("h-14 w-14")}</div>
            <div className="pointer-events-auto flex flex-1 flex-col gap-2">
              {modeToggle}
              <div className="flex flex-1 gap-2">
                {drift("flex-[1.6]")}
                {brake("flex-1")}
              </div>
            </div>
          </>
        ) : (
          <div className="pointer-events-auto flex flex-1 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              {modeToggle}
              {!needsTiltTap && wheel("h-12 w-12")}
            </div>
            {tiltError && <p className="text-xs text-amber-300">{tiltError}</p>}
            {needsTiltTap ? (
              tiltTap
            ) : (
              <div className="flex flex-1 gap-2">
                {brake("flex-1")}
                {drift("flex-[1.6]")}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3" style={{ touchAction: "none" }} onContextMenu={(e) => e.preventDefault()}>
      {modeToggle}
      {tiltError && <p className="text-center text-xs text-amber-300">{tiltError}</p>}

      {mode === "botones" ? (
        <div className="grid min-h-56 flex-1 grid-cols-2 gap-3">
          <div className="flex gap-2">{steerButtons("h-16 w-16")}</div>
          <div className="flex flex-col gap-2">
            {drift("flex-[1.6]")}
            {brake("flex-1")}
          </div>
        </div>
      ) : needsTiltTap ? (
        <div className="flex min-h-56 flex-1">{tiltTap}</div>
      ) : (
        <div className="flex min-h-56 flex-1 flex-col gap-3">
          <div className="flex flex-col items-center gap-2 py-2">
            {wheel("h-24 w-24")}
            <p className="text-xs text-slate-400">Inclínalo como un volante, con la pantalla hacia ti.</p>
          </div>
          <div className="flex flex-1 gap-3">
            {brake("flex-1")}
            {drift("flex-[1.6]")}
          </div>
        </div>
      )}

      {fine && <div className="rounded-xl bg-slate-900/80 p-2 ring-1 ring-slate-700">{keysHint}</div>}
      <p className="text-center text-xs text-slate-500">
        {locked ? "Prepárate: el auto acelera solo cuando largan." : "El auto acelera solo. Mantén «Derrape» mientras doblas y suéltalo para el mini-turbo; tócalo en el aire para un truco."}
      </p>
    </div>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md bg-white/15 px-1.5 py-0.5 font-mono text-[11px] text-white ring-1 ring-white/20">{children}</kbd>;
}
