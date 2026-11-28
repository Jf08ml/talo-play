"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { openInput, type CarInputWire } from "@/lib/carreras";
import { ChevronLeft, ChevronRight, ChevronsUp, Gauge, Hand, Keyboard, Smartphone, Gamepad2, Sparkles } from "lucide-react";
import { ITEMS, isItem, type ItemId } from "@/lib/carrerasItems";
import { ITEM_ICONS } from "./ItemCard";
import { AdjustButton, PadSurface, usePadSettings } from "@/components/PadKit";
import { padDefaults, type PadControl } from "@/lib/padLayout";

type PadId = "izquierda" | "derecha" | "derrape" | "frenar" | "acelerar" | "poder";
const CONTROLS: Record<PadId, PadControl> = {
  izquierda: { label: "Doblar a la izquierda", size: 140, wide: 0.42 },
  derecha: { label: "Doblar a la derecha", size: 140, wide: 0.42 },
  derrape: { label: "Derrape", size: 100, wide: 1.2 },
  frenar: { label: "Frenar", size: 66, wide: 1.05 },
  acelerar: { label: "Acelerar", size: 66, wide: 1.05 },
  poder: { label: "Poder", size: 62, wide: 1.6 },
};
/** Over the race the strip is low: wider steering buttons. */
const OVERLAY_CONTROLS: Record<PadId, PadControl> = {
  ...CONTROLS,
  izquierda: { ...CONTROLS.izquierda, wide: 0.85 },
  derecha: { ...CONTROLS.derecha, wide: 0.85 },
};
/** The phone as a pad next to a big screen: a page to fill (steering on the left, the rest in a column on the right). */
const PANEL = padDefaults<PadId>({
  izquierda: { x: 0.145, y: 0.5, s: 1.7 },
  derecha: { x: 0.425, y: 0.5, s: 1.7 },
  poder: { x: 0.78, y: 0.12, s: 1.4 },
  derrape: { x: 0.78, y: 0.38, s: 1.25 },
  frenar: { x: 0.78, y: 0.64, s: 1.4 },
  acelerar: { x: 0.78, y: 0.86, s: 1.4 },
});
/** The pad next to a big screen with the phone sideways: steering on the left, the rest spread to the right. */
const WIDE = padDefaults<PadId>({
  izquierda: { x: 0.112, y: 0.56, s: 1.5 },
  derecha: { x: 0.315, y: 0.56, s: 1.5 },
  poder: { x: 0.5, y: 0.3, s: 1.35 },
  frenar: { x: 0.5, y: 0.76, s: 1.35 },
  acelerar: { x: 0.66, y: 0.3, s: 1.35 },
  derrape: { x: 0.85, y: 0.58, s: 1.75 },
});
/** Over the race on the phone itself: a wide, low strip, everything in a row. */
const OVERLAY = padDefaults<PadId>({
  izquierda: { x: 0.075, y: 0.5, s: 0.95 },
  derecha: { x: 0.205, y: 0.5, s: 0.95 },
  poder: { x: 0.47, y: 0.52, s: 1.1 },
  acelerar: { x: 0.6, y: 0.52, s: 1.15 },
  frenar: { x: 0.72, y: 0.52, s: 1.2 },
  derrape: { x: 0.885, y: 0.52, s: 1.25 },
});

export type ControlMode = "botones" | "inclinacion";

const MODE_KEY = "carreras.controlMode";
/** Minimum time between two input writes (pantalla mode). */
const SEND_MS = 50;
/** Tilt (degrees) that turns the wheel all the way. */
const FULL_TILT_DEG = 30;
const DEAD_ZONE = 0.06;

type Zone = "left" | "right" | "brake" | "drift" | "gas";

/** Keyboard driving (computers): arrows or A/D to steer, down arrow, S or space to brake, Shift to drift (E, «Poder», is counted apart). */
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
  ArrowUp: "gas",
  w: "gas",
  W: "gas",
};

const GAS_KEY = "carreras.acelerador";
/** «Automático» (the car speeds up by itself) or «Manual» (hold «Acelerar»). */
type GasMode = "auto" | "manual";
function readGas(): GasMode {
  try {
    return localStorage.getItem(GAS_KEY) === "manual" ? "manual" : "auto";
  } catch {
    return "auto";
  }
}

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
function tiltSteer(e: DeviceOrientationEvent, sens = 1): number | null {
  if (e.beta === null || e.gamma === null) return null;
  const rad = Math.PI / 180;
  const b = e.beta * rad;
  const g = e.gamma * rad;
  const a = screenAngle() * rad;
  // Gravity in device coordinates is (cosβ·sinγ, −sinβ, ·); the screen's x axis is (cos a, −sin a).
  const raw = Math.cos(b) * Math.sin(g) * Math.cos(a) + Math.sin(b) * Math.sin(a);
  const steer = raw / Math.sin((FULL_TILT_DEG / Math.max(0.3, sens)) * rad);
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
    if (
      last &&
      last.wire.s === wire.s &&
      last.wire.b === wire.b &&
      !!last.wire.d === !!wire.d &&
      (last.wire.i ?? 0) === (wire.i ?? 0) &&
      !!last.wire.m === !!wire.m &&
      !!last.wire.g === !!wire.g
    )
      return;
    lastSent.current = { wire, at: Date.now() };
    sender.current?.send(wire);
  };

  return (wire: CarInputWire) => {
    pending.current = { s: Math.round(wire.s * 20) / 20, b: wire.b, d: !!wire.d, i: wire.i ?? 0, ...(wire.m ? { m: true, g: !!wire.g } : {}) };
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
  powers = false,
  item = null,
  bar,
  actions,
}: {
  color: string;
  /** Countdown still running: controls show, but the car won't move yet. */
  locked: boolean;
  onInput: (input: CarInputWire) => void;
  variant?: "panel" | "overlay";
  /** The race has power-ups (3D): show «Poder». */
  powers?: boolean;
  /** The power held, and whether its roulette still turns. */
  item?: { id: string; rolling: boolean } | null;
  /** Panel: what goes first in the top row (the car, lap, place). */
  bar?: ReactNode;
  /** Panel: what goes last in the top row (full screen, «Salir»). */
  actions?: ReactNode;
}) {
  const [mode, setMode] = useState<ControlMode>(readMode);
  const [gasMode, setGasMode] = useState<GasMode>(readGas);
  const manual = gasMode === "manual";
  const [tiltError, setTiltError] = useState<string | null>(null);
  const [tiltReady, setTiltReady] = useState(false);
  const [pressed, setPressed] = useState<Record<Zone, boolean>>({ left: false, right: false, brake: false, drift: false, gas: false });
  const [tilt, setTilt] = useState(0);
  const tiltRef = useRef(0);
  const pointers = useRef(new Map<number, Zone>());
  const keys = useRef(new Set<Zone>());
  const fine = useFinePointer();
  const [showTouch, setShowTouch] = useState(false);
  const current = useRef<CarInputWire>({ s: 0, b: false });
  // «Poder» presses so far (sent as a counter, so a quick tap is never lost between two sends).
  const presses = useRef(0);
  const [itemDown, setItemDown] = useState(false);
  const overlay = variant === "overlay";
  const landscape = useLandscape();
  // Each shape keeps its own layout: over the race, the pad sideways and the pad upright.
  const look = overlay ? "celular" : landscape ? "horizontal" : "pantalla";
  const padControls = look === "pantalla" ? CONTROLS : OVERLAY_CONTROLS;
  const padDefaultsNow = look === "celular" ? OVERLAY : look === "horizontal" ? WIDE : PANEL;
  const [settings, setSettings] = usePadSettings(`carreras.controles2.${look}`, padDefaultsNow);
  const [editing, setEditing] = useState(false);

  const emit = (wire: CarInputWire) => {
    // Manual throttle: holding «Derrape» also accelerates (the other thumb is on the steering, none is left for «Acelerar»).
    current.current = { ...wire, i: presses.current, m: manual, g: manual && (!!wire.g || !!wire.d) };
    onInput(current.current);
  };
  const pressItem = () => {
    presses.current++;
    emit(current.current);
  };

  // Buttons: every finger is tracked by pointer id, so left + brake works at once; held keys count too.
  const updateFromPointers = () => {
    const zones = new Set([...pointers.current.values(), ...keys.current]);
    const next = { left: zones.has("left"), right: zones.has("right"), brake: zones.has("brake"), drift: zones.has("drift"), gas: zones.has("gas") };
    setPressed(next);
    const keySteer = (keys.current.has("right") ? 1 : 0) - (keys.current.has("left") ? 1 : 0);
    const steer = mode === "botones" || keySteer ? (next.right ? 1 : 0) - (next.left ? 1 : 0) : tiltRef.current;
    emit({ s: steer, b: next.brake, d: next.drift, g: next.gas });
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
      if (powers && (e.key === "e" || e.key === "E") && !typing(e) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (e.type === "keydown" && !e.repeat) pressItem();
        return;
      }
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
      const steer = tiltSteer(e, settings.sens);
      if (steer === null) return;
      setTilt(steer);
      tiltRef.current = steer;
      // Held arrow keys win over the tilt.
      if (!keys.current.has("left") && !keys.current.has("right")) emit({ s: steer, b: current.current.b, d: current.current.d, g: current.current.g });
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
    emit({ s: 0, b: current.current.b, d: current.current.d, g: current.current.g });
  };

  const switchGas = (next: GasMode) => {
    try {
      localStorage.setItem(GAS_KEY, next);
    } catch {
      // Private mode: it just won't be remembered.
    }
    setGasMode(next);
  };
  // The mode changed: tell the race at once (the gas goes back to automatic, or waits for «Acelerar»).
  useEffect(() => {
    emit(current.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual]);

  // A tilt mode remembered from last time still needs iOS's permission: ask on the first tap.
  const needsTiltTap = mode === "inclinacion" && !tiltReady && tiltNeedsPermission();

  const keysHint = (
    <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-200">
      <Keyboard className="h-4 w-4" />
      <span>
        <Key>←</Key> <Key>→</Key> o <Key>A</Key> <Key>D</Key> doblar
      </span>
      <span>
        <Key>Shift</Key> derrapar (en el aire: truco)
      </span>
      {powers && (
        <span>
          <Key>E</Key> usar poder
        </span>
      )}
      {manual && (
        <span>
          <Key>↑</Key> o <Key>W</Key> acelerar
        </span>
      )}
      <span>
        <Key>↓</Key> o <Key>Espacio</Key> frenar
      </span>
    </p>
  );

  const modeToggle = (
    <div className={`grid grid-cols-2 gap-1 rounded-xl p-1 ring-1 bg-slate-950/60 ring-white/15`}>
      {(["botones", "inclinacion"] as ControlMode[]).map((m) => (
        <button
          key={m}
          onClick={() => switchMode(m)}
          className={`flex items-center justify-center gap-1.5 rounded-lg font-medium transition px-2 py-1 text-xs ${
            mode === m ? "bg-violet-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.5)]" : "text-slate-300"
          }`}
        >
          {m === "botones" ? <Gamepad2 className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
          {m === "botones" ? "Botones" : "Inclinación"}
        </button>
      ))}
    </div>
  );

  const gasToggle = (
    <button
      type="button"
      onClick={() => switchGas(manual ? "auto" : "manual")}
      className={`pointer-events-auto flex items-center justify-center gap-1.5 rounded-xl font-medium ring-1 bg-slate-950/60 px-2 py-1 text-xs ring-white/15 text-slate-200`}
      aria-label={`Acelerador ${manual ? "manual" : "automático"}: tocar para cambiar`}
    >
      <Gauge className="h-4 w-4" /> <span className="hidden min-[420px]:inline">Acelerador:</span> <b className={manual ? "text-lime-300" : "text-sky-300"}>{manual ? "Manual" : "Automático"}</b>
    </button>
  );

  const zoneClass = (on: boolean) =>
    `flex h-full w-full select-none items-center justify-center rounded-3xl border-2 transition-transform ${
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

  // «Poder»: what's held (its icon and color), the roulette still turning, or nothing yet.
  const held = item && isItem(item.id) ? item : null;
  const ItemIcon = held ? ITEM_ICONS[held.id as ItemId] : Sparkles;
  const itemColor = held && !held.rolling ? ITEMS[held.id as ItemId].color : "#64748b";
  const steerIcon = look === "pantalla" ? "h-16 w-16" : "h-12 w-12";

  /** How each control looks (the pad and the editor). */
  const face = (id: PadId) => {
    switch (id) {
      case "izquierda":
      case "derecha": {
        const Icon = id === "izquierda" ? ChevronLeft : ChevronRight;
        return (
          <span className={zoneClass(id === "izquierda" ? pressed.left : pressed.right)} style={{ borderColor: color }}>
            <Icon className={steerIcon} style={{ color }} />
          </span>
        );
      }
      case "frenar":
        return (
          <span className={`${zoneClass(pressed.brake)} flex-col gap-0.5 border-slate-400/70 text-slate-100`}>
            <Hand className="h-6 w-6" />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Frenar</span>
          </span>
        );
      case "acelerar":
        return (
          <span className={`${zoneClass(pressed.gas)} flex-col gap-1 border-lime-400/80 text-lime-100`}>
            <ChevronsUp className="h-8 w-8" />
            <span className="text-[11px] font-bold uppercase tracking-wide">Acelerar</span>
          </span>
        );
      case "derrape":
        // Held while steering: a drift (sparks under the car), let go for the mini-turbo; a tap in the air, a trick.
        return (
          <span className={`${zoneClass(pressed.drift)} flex-col gap-1 border-amber-300/80 text-amber-100`}>
            <Sparkles className="h-9 w-9" />
            <span className="text-xs font-bold uppercase tracking-wide">Derrape</span>
          </span>
        );
      case "poder":
        return (
          <span
            className={`${zoneClass(itemDown)} flex-col gap-0.5 ${held && !held.rolling ? "animate-pulse" : ""}`}
            style={{
              borderColor: itemColor,
              color: held && !held.rolling ? "#ffffff" : itemColor,
              backgroundColor: held && !held.rolling ? `${itemColor}cc` : undefined,
              boxShadow: held && !held.rolling ? `0 0 22px ${itemColor}` : undefined,
            }}
          >
            <ItemIcon className={`h-6 w-6 ${held?.rolling ? "animate-spin" : ""}`} />
            <span className="text-[11px] font-bold uppercase tracking-wide">{held ? (held.rolling ? "…" : ITEMS[held.id as ItemId].label) : "Sin poder"}</span>
          </span>
        );
    }
  };

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

  const tiltMode = mode === "inclinacion";
  const hidden: PadId[] = [...(tiltMode ? (["izquierda", "derecha"] as PadId[]) : []), ...(manual ? [] : (["acelerar"] as PadId[])), ...(powers ? [] : (["poder"] as PadId[]))];
  const pad = (
    <PadSurface
      controls={padControls}
      settings={settings}
      edit={{
        open: editing,
        onClose: () => setEditing(false),
        onChange: setSettings,
        defaults: padDefaultsNow,
        face: (id) => face(id),
        faded: hidden,
        sens: { label: "Sensibilidad inclinación", min: 0.5, max: 2 },
      }}
      className="min-h-0 flex-1"
    >
      {(place) =>
        (Object.keys(CONTROLS) as PadId[])
          .filter((id) => !hidden.includes(id))
          .map((id) =>
            id === "poder" ? (
              <button
                key={id}
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  setItemDown(true);
                  pressItem();
                }}
                onPointerUp={() => setItemDown(false)}
                onPointerCancel={() => setItemDown(false)}
                onPointerLeave={() => setItemDown(false)}
                style={place(id)}
                aria-label={held ? `Usar ${ITEMS[held.id as ItemId].label}` : "Poder (sin poder todavía)"}
              >
                {face(id)}
              </button>
            ) : (
              <div
                key={id}
                data-zone={{ izquierda: "left", derecha: "right", derrape: "drift", frenar: "brake", acelerar: "gas" }[id]}
                onPointerDown={down}
                style={place(id)}
              >
                {face(id)}
              </div>
            )
          )
      }
    </PadSurface>
  );

  const adjust = <AdjustButton onClick={() => setEditing(true)} className={overlay ? "!bg-slate-950/60" : ""} />;

  if (overlay) {
    return (
      <div className="absolute inset-x-0 bottom-0 flex h-[46%] flex-col gap-2 p-3" style={{ touchAction: "none" }} onContextMenu={(e) => e.preventDefault()}>
        <div className="flex items-center gap-2">
          {modeToggle}
          {gasToggle}
          {adjust}
          {tiltMode && !needsTiltTap && wheel("h-10 w-10")}
        </div>
        {tiltError && <p className="text-xs text-amber-300">{tiltError}</p>}
        {tiltMode && needsTiltTap ? tiltTap : pad}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" style={{ touchAction: "none" }} onContextMenu={(e) => e.preventDefault()}>
      <div className="flex flex-wrap items-center gap-2">
        {bar && <div className="flex min-w-0 flex-1 items-center gap-2 max-[560px]:basis-full">{bar}</div>}
        {modeToggle}
        {gasToggle}
        {tiltMode && !needsTiltTap && wheel("h-9 w-9")}
        {adjust}
        {actions}
      </div>
      {tiltError && <p className="text-center text-xs text-amber-300">{tiltError}</p>}
      {locked && <p className="text-center text-xs text-slate-400">{manual ? "Prepárate: cuando larguen, mantén «Acelerar»." : "Prepárate: el auto acelera solo cuando largan."}</p>}
      {tiltMode && needsTiltTap ? <div className="flex min-h-0 flex-1">{tiltTap}</div> : pad}
      {fine && <div className="rounded-xl bg-slate-900/80 p-1.5 ring-1 ring-slate-700">{keysHint}</div>}
    </div>
  );
}

const LANDSCAPE = "(orientation: landscape)";
const subscribeLandscape = (cb: () => void) => {
  const q = window.matchMedia(LANDSCAPE);
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};
/** The phone held sideways. */
function useLandscape(): boolean {
  return useSyncExternalStore(subscribeLandscape, () => window.matchMedia(LANDSCAPE).matches, () => false);
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md bg-white/15 px-1.5 py-0.5 font-mono text-[11px] text-white ring-1 ring-white/20">{children}</kbd>;
}
