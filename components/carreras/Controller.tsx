"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { openInput, type CarInputWire } from "@/lib/carreras";
import { ChevronLeft, ChevronRight, Hand, Smartphone, Gamepad2 } from "lucide-react";

export type ControlMode = "botones" | "inclinacion";

const MODE_KEY = "carreras.controlMode";
/** Minimum time between two input writes (pantalla mode). */
const SEND_MS = 50;
/** Tilt (degrees) that turns the wheel all the way. */
const FULL_TILT_DEG = 30;
const DEAD_ZONE = 0.06;

type Zone = "left" | "right" | "brake";

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
    if (last && last.wire.s === wire.s && last.wire.b === wire.b) return;
    lastSent.current = { wire, at: Date.now() };
    sender.current?.send(wire);
  };

  return (wire: CarInputWire) => {
    pending.current = { s: Math.round(wire.s * 20) / 20, b: wire.b };
    if (timer.current) return;
    const wait = lastSent.current ? SEND_MS - (Date.now() - lastSent.current.at) : 0;
    if (wait <= 0) flush();
    else timer.current = setTimeout(flush, wait);
  };
}

/**
 * The phone as a steering wheel. Gas is automatic; the player steers (two
 * big buttons, or tilting the phone) and holds "Frenar" to slow down or
 * reverse. `panel` fills a page (pantalla mode); `overlay` sits on top of the
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
  const [pressed, setPressed] = useState<Record<Zone, boolean>>({ left: false, right: false, brake: false });
  const [tilt, setTilt] = useState(0);
  const pointers = useRef(new Map<number, Zone>());
  const current = useRef<CarInputWire>({ s: 0, b: false });

  const emit = (wire: CarInputWire) => {
    current.current = wire;
    onInput(wire);
  };

  // Buttons: every finger is tracked by pointer id, so left + brake works at once.
  const updateFromPointers = () => {
    const zones = new Set(pointers.current.values());
    const next = { left: zones.has("left"), right: zones.has("right"), brake: zones.has("brake") };
    setPressed(next);
    const steer = mode === "botones" ? (next.right ? 1 : 0) - (next.left ? 1 : 0) : current.current.s;
    emit({ s: steer, b: next.brake });
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

  // Tilt.
  useEffect(() => {
    if (mode !== "inclinacion") return;
    const onTilt = (e: DeviceOrientationEvent) => {
      const steer = tiltSteer(e);
      if (steer === null) return;
      setTilt(steer);
      emit({ s: steer, b: current.current.b });
    };
    window.addEventListener("deviceorientation", onTilt);
    return () => window.removeEventListener("deviceorientation", onTilt);
  });

  const switchMode = async (next: ControlMode) => {
    setTiltError(null);
    if (next === "inclinacion" && !(await enableTilt())) {
      setTiltError("No pudimos leer la inclinación del teléfono. Revisá los permisos o usá los botones.");
      return;
    }
    if (next === "inclinacion") setTiltReady(true);
    saveMode(next);
    setMode(next);
    setTilt(0);
    emit({ s: 0, b: current.current.b });
  };

  // A tilt mode remembered from last time still needs iOS's permission: ask on the first tap.
  const needsTiltTap = mode === "inclinacion" && !tiltReady && tiltNeedsPermission();
  const overlay = variant === "overlay";

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

  const brake = (big: boolean) => (
    <div
      data-zone="brake"
      onPointerDown={down}
      className={`${zoneClass(pressed.brake)} flex-col gap-1 border-slate-400/70 text-slate-100 ${big ? "flex-1" : ""}`}
    >
      <Hand className={big ? "h-10 w-10" : "h-8 w-8"} />
      <span className="text-xs font-semibold uppercase tracking-wide">Frenar</span>
    </div>
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
      Tocá para activar la inclinación
    </button>
  );

  if (overlay) {
    return (
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[46%] items-stretch gap-3 p-3"
        style={{ touchAction: "none" }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {mode === "botones" ? (
          <>
            <div data-zone="left" onPointerDown={down} className={`pointer-events-auto flex-1 ${zoneClass(pressed.left)}`} style={{ borderColor: color }}>
              <ChevronLeft className="h-16 w-16" style={{ color }} />
            </div>
            <div className="pointer-events-auto flex w-[28%] flex-col gap-2">
              {modeToggle}
              {brake(true)}
            </div>
            <div data-zone="right" onPointerDown={down} className={`pointer-events-auto flex-1 ${zoneClass(pressed.right)}`} style={{ borderColor: color }}>
              <ChevronRight className="h-16 w-16" style={{ color }} />
            </div>
          </>
        ) : (
          <div className="pointer-events-auto flex flex-1 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              {modeToggle}
              {!needsTiltTap && wheel("h-12 w-12")}
            </div>
            {tiltError && <p className="text-xs text-amber-300">{tiltError}</p>}
            {needsTiltTap ? tiltTap : brake(true)}
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
        <div className="grid min-h-56 flex-1 grid-cols-[1fr_0.7fr_1fr] gap-3">
          <div data-zone="left" onPointerDown={down} className={zoneClass(pressed.left)} style={{ borderColor: color }}>
            <ChevronLeft className="h-20 w-20" style={{ color }} />
          </div>
          {brake(false)}
          <div data-zone="right" onPointerDown={down} className={zoneClass(pressed.right)} style={{ borderColor: color }}>
            <ChevronRight className="h-20 w-20" style={{ color }} />
          </div>
        </div>
      ) : needsTiltTap ? (
        <div className="flex min-h-56 flex-1">{tiltTap}</div>
      ) : (
        <div className="flex min-h-56 flex-1 flex-col gap-3">
          <div className="flex flex-col items-center gap-2 py-2">
            {wheel("h-24 w-24")}
            <p className="text-xs text-slate-400">Inclinalo como un volante, con la pantalla hacia vos.</p>
          </div>
          {brake(true)}
        </div>
      )}

      <p className="text-center text-xs text-slate-500">
        {locked ? "Preparate: el auto acelera solo cuando largan." : "El auto acelera solo. Frená para doblar cerrado o ir marcha atrás."}
      </p>
    </div>
  );
}
