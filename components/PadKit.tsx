"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { loadPad, padBox, savePad, type PadControl, type PadPlace, type PadSettings } from "@/lib/padLayout";

/**
 * The pieces of a phone controller whose buttons can be moved and resized
 * (the big-screen games: Carreras, Arena medieval, Empujones, El tronco):
 * `PadSurface` places them over the controller's area, with an optional stick
 * (under the thumb on the left, or fixed) and a drag-to-look zone (the rest);
 * `PadEditor` is «Ajustar controles»; `AdjustButton` opens it.
 */

/** The settings saved under `key` (defaults must be a module constant). */
export function usePadSettings<K extends string>(key: string, defaults: PadSettings<K>): [PadSettings<K>, (s: PadSettings<K>) => void] {
  const [settings, setSettings] = useState<PadSettings<K>>(() => (typeof window === "undefined" ? defaults : loadPad(key, defaults)));
  const set = useCallback(
    (s: PadSettings<K>) => {
      setSettings(s);
      savePad(key, s);
    },
    [key]
  );
  return [settings, set];
}

/** An element's size, kept up to date. */
function useAreaSize(ref: RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 360, h: 420 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return size;
}

/** Keeps the finger's events on this element (it can fail on synthetic or already-ended pointers). */
function capture(e: ReactPointerEvent<HTMLElement>) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {}
}

export interface PadStick<K extends string> {
  id: K;
  color: string;
  /** -1…1 each way: x right, y down the screen. Sensitivity already applied. */
  onMove: (x: number, y: number) => void;
  hint?: string;
}

export interface PadEdit<K extends string> {
  open: boolean;
  onClose: () => void;
  onChange: (s: PadSettings<K>) => void;
  defaults: PadSettings<K>;
  /** How each control looks in the editor (`size` in px). */
  face: (id: K, size: { width: number; height: number }) => ReactNode;
  /** Controls that don't show right now (drawn faded so they can still be placed). */
  faded?: K[];
  /** What «Sensibilidad» tunes in this game, if anything. */
  sens?: { label: string; min: number; max: number };
}

/**
 * The controller's area: children get `place(id)` (an absolute style for
 * each control) and stop their own pointer events; touches anywhere else
 * drive the stick (left part) or the look (the rest).
 */
export function PadSurface<K extends string>({
  controls,
  settings,
  stick,
  onLook,
  edit,
  className = "",
  children,
}: {
  controls: Record<K, PadControl>;
  settings: PadSettings<K>;
  stick?: PadStick<K>;
  /** Pixels dragged, times the sensitivity. */
  onLook?: (dx: number, dy: number) => void;
  edit?: PadEdit<K>;
  className?: string;
  children: (place: (id: K) => CSSProperties, size: (id: K) => { width: number; height: number }) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useAreaSize(ref);
  const [active, setActive] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const stickId = useRef<number | null>(null);
  const looks = useRef(new Map<number, { x: number; y: number }>());
  const moveRef = useRef(stick?.onMove);
  useEffect(() => {
    moveRef.current = stick?.onMove;
  }, [stick?.onMove]);
  // Leaving (the match ending, the pad unmounting) lets go of the stick.
  useEffect(() => () => {
    if (stickId.current !== null) moveRef.current?.(0, 0);
  }, []);

  const box = (id: K) => padBox(settings.layout[id], controls[id], w, h);
  const place = (id: K): CSSProperties => {
    const b = box(id);
    return { position: "absolute", left: b.left, top: b.top, width: b.width, height: b.height };
  };
  const size = (id: K) => {
    const b = box(id);
    return { width: b.width, height: b.height };
  };
  const stickBox = stick ? box(stick.id) : null;
  const radius = stickBox ? stickBox.height / 2 : 60;

  const steer = (rawX: number, rawY: number, base: { x: number; y: number }) => {
    let dx = rawX;
    let dy = rawY;
    const d = Math.hypot(dx, dy);
    if (d > radius) {
      dx *= radius / d;
      dy *= radius / d;
    }
    setActive({ x: base.x, y: base.y, dx, dy });
    // More sensitive = full speed with less travel.
    const travel = radius / Math.max(0.3, settings.sens);
    const k = Math.min(1, d / travel) / (d || 1);
    stick?.onMove(rawX * k, rawY * k);
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (stick && stickBox && stickId.current === null && (x < w * 0.45 || !onLook)) {
      capture(e);
      stickId.current = e.pointerId;
      const base = settings.fixedStick ? { x: stickBox.left + stickBox.width / 2, y: stickBox.top + stickBox.height / 2 } : { x, y };
      steer(x - base.x, y - base.y, base);
      return;
    }
    if (onLook) {
      capture(e);
      looks.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId === stickId.current && active) {
      const r = e.currentTarget.getBoundingClientRect();
      steer(e.clientX - r.left - active.x, e.clientY - r.top - active.y, active);
      return;
    }
    const last = looks.current.get(e.pointerId);
    if (last && onLook) {
      onLook((e.clientX - last.x) * settings.sens, (e.clientY - last.y) * settings.sens);
      looks.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId === stickId.current) {
      stickId.current = null;
      setActive(null);
      stick?.onMove(0, 0);
    }
    looks.current.delete(e.pointerId);
  };

  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative select-none overflow-hidden ${className}`}
      style={{ touchAction: "none" }}
    >
      {stick &&
        stickBox &&
        (active ? (
          <div className="pointer-events-none absolute" style={{ left: active.x - radius, top: active.y - radius, width: radius * 2, height: radius * 2 }}>
            <div className="h-full w-full rounded-full border-2 border-white/30 bg-white/[0.06]" />
            <div
              className="absolute rounded-full border-[3px] border-talo-ink"
              style={{ width: radius * 0.9, height: radius * 0.9, left: radius * 0.55 + active.dx, top: radius * 0.55 + active.dy, background: stick.color }}
            />
          </div>
        ) : (
          <div className="pointer-events-none absolute flex flex-col items-center justify-center gap-1 text-center" style={{ ...place(stick.id), opacity: settings.opacity }}>
            <span className="flex h-full w-full items-center justify-center rounded-full border-2 border-dashed border-white/30 px-2 text-xs font-bold text-white/45">{stick.hint ?? "mover"}</span>
          </div>
        ))}
      <div style={{ opacity: settings.opacity }}>{children(place, size)}</div>
      {edit?.open && <PadEditor controls={controls} settings={settings} stickId={stick?.id} area={ref} edit={edit} />}
    </div>
  );
}

/**
 * «Ajustar controles»: every control where it sits, to drag where it's
 * comfortable and resize; plus transparency, sensitivity and a fixed stick.
 * Changes apply (and are saved) at once.
 */
function PadEditor<K extends string>({
  controls,
  settings,
  stickId,
  area,
  edit,
}: {
  controls: Record<K, PadControl>;
  settings: PadSettings<K>;
  stickId?: K;
  area: RefObject<HTMLDivElement | null>;
  edit: PadEdit<K>;
}) {
  const ids = Object.keys(controls) as K[];
  const [selected, setSelected] = useState<K>(ids[0]);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(true);
  const [rect, setRect] = useState({ left: 0, top: 0, w: 360, h: 420 });
  const drag = useRef<{ id: K; pointer: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const r = area.current?.getBoundingClientRect();
      if (r) setRect({ left: r.left, top: r.top, w: r.width || 1, h: r.height || 1 });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [area]);

  const set = (patch: Partial<PadSettings<K>>) => edit.onChange({ ...settings, ...patch });
  const placeOf = (id: K, patch: Partial<PadPlace>) => edit.onChange({ ...settings, layout: { ...settings.layout, [id]: { ...settings.layout[id], ...patch } } });

  const down = (id: K) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    capture(e);
    const p = settings.layout[id];
    drag.current = { id, pointer: e.pointerId, ox: e.clientX - (rect.left + p.x * rect.w), oy: e.clientY - (rect.top + p.y * rect.h) };
    setSelected(id);
    setDragging(true);
  };
  const moveTo = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const x = (e.clientX - d.ox - rect.left) / rect.w;
    const y = (e.clientY - d.oy - rect.top) / rect.h;
    placeOf(d.id, { x: Math.max(0.04, Math.min(0.96, x)), y: Math.max(0.04, Math.min(0.96, y)) });
  };
  const end = () => {
    drag.current = null;
    setDragging(false);
  };
  const stop = (e: ReactPointerEvent) => e.stopPropagation();

  const slider = (label: string, value: number, min: number, max: number, onValue: (n: number) => void) => (
    <label className="flex items-center gap-2 text-xs text-white">
      <span className="w-32 shrink-0 truncate">{label}</span>
      <input type="range" min={min} max={max} step={0.05} value={value} onChange={(e) => onValue(Number(e.target.value))} className="w-full accent-yellow-400" />
      <span className="w-9 shrink-0 text-right font-mono">{value.toFixed(2)}</span>
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-50 select-none bg-slate-950/60"
      style={{ touchAction: "none" }}
      onPointerDown={stop}
      onPointerMove={moveTo}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {/* The controller's area, outlined, with every control in it. */}
      <div className="pointer-events-none absolute rounded-2xl border border-dashed border-white/25" style={{ left: rect.left, top: rect.top, width: rect.w, height: rect.h }} />
      {ids.map((id) => {
        const b = padBox(settings.layout[id], controls[id], rect.w, rect.h);
        const faded = edit.faded?.includes(id);
        return (
          <div
            key={id}
            onPointerDown={down(id)}
            className={`absolute cursor-grab rounded-2xl ${selected === id ? "outline outline-2 outline-offset-4 outline-yellow-400" : ""}`}
            style={{ left: rect.left + b.left, top: rect.top + b.top, width: b.width, height: b.height, opacity: faded ? 0.3 : settings.opacity }}
          >
            <div className="pointer-events-none h-full w-full">
              {id === stickId ? (
                <span className="flex h-full w-full items-center justify-center rounded-full border-2 border-dashed border-white/60 text-xs font-bold text-white/80">Joystick</span>
              ) : (
                edit.face(id, { width: b.width, height: b.height })
              )}
            </div>
          </div>
        );
      })}

      {/* Options: on top, out of the way while dragging. */}
      <div
        className={`absolute left-1/2 top-2 flex w-[min(560px,94vw)] -translate-x-1/2 flex-col gap-2 rounded-2xl bg-slate-950/95 p-3 ring-1 ring-white/15 transition-opacity ${dragging ? "pointer-events-none opacity-20" : ""}`}
        onPointerDown={stop}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-base text-yellow-300">Ajustar controles</p>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white">
              {open ? "Ocultar" : "Opciones"}
            </button>
            <button type="button" onClick={() => edit.onChange(edit.defaults)} className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white">
              <RotateCcw className="h-3.5 w-3.5" /> Restablecer
            </button>
            <button type="button" onClick={edit.onClose} className="rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-bold text-slate-950">
              Listo
            </button>
          </div>
        </div>
        {open && (
          <>
            <p className="text-[11px] text-slate-300">Arrastra cada botón a donde te quede cómodo y elige su tamaño. Si las opciones tapan alguno, ocúltalas.</p>
            {slider(`Tamaño: ${controls[selected].label}`, settings.layout[selected].s, 0.5, 2.2, (n) => placeOf(selected, { s: n }))}
            {slider("Transparencia", settings.opacity, 0.3, 1, (n) => set({ opacity: n }))}
            {edit.sens && slider(edit.sens.label, settings.sens, edit.sens.min, edit.sens.max, (n) => set({ sens: n }))}
            {stickId && (
              <label className="flex items-center gap-2 text-xs text-white">
                <input type="checkbox" checked={settings.fixedStick} onChange={(e) => set({ fixedStick: e.target.checked })} className="h-4 w-4 accent-yellow-400" />
                Joystick fijo (si no, aparece donde apoyas el dedo)
              </label>
            )}
          </>
        )}
        {!open && slider(`Tamaño: ${controls[selected].label}`, settings.layout[selected].s, 0.5, 2.2, (n) => placeOf(selected, { s: n }))}
      </div>
    </div>
  );
}

/** Opens «Ajustar controles». */
export function AdjustButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label="Ajustar controles"
      className={`flex items-center gap-1.5 rounded-xl bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white/80 ring-1 ring-white/15 hover:bg-white/15 ${className}`}
    >
      <SlidersHorizontal className="h-4 w-4" /> Ajustar
    </button>
  );
}
