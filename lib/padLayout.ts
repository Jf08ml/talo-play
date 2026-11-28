/**
 * Phone controllers whose buttons each player can move and resize (like
 * Fuego cruzado's touch controls, shared by the other big-screen games):
 * every control is placed as a fraction of the controller's area and sized
 * by a multiplier, with a transparency, a sensitivity (what it tunes is up to
 * each game: looking, the stick, the tilt) and a fixed or floating stick.
 * Saved per device and game in localStorage.
 */

/** A control's center as a fraction of the area (0–1 from the left and the top) and its size multiplier. */
export interface PadPlace {
  x: number;
  y: number;
  s: number;
}

export interface PadControl {
  label: string;
  /** Height in px at size 1 on a typical phone. */
  size: number;
  /** Width over height (1 = square or round). */
  wide?: number;
}

export interface PadSettings<K extends string> {
  layout: Record<K, PadPlace>;
  /** How opaque the buttons are (0.3–1). */
  opacity: number;
  /** A multiplier: 1 = as the game ships. */
  sens: number;
  /** The stick stays where it's placed instead of appearing under the thumb. */
  fixedStick: boolean;
}

export function padDefaults<K extends string>(layout: Record<K, PadPlace>): PadSettings<K> {
  return { layout, opacity: 1, sens: 1, fixedStick: false };
}

/** The saved settings, with any missing piece (a control added later) from the defaults. */
export function loadPad<K extends string>(key: string, defaults: PadSettings<K>): PadSettings<K> {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<PadSettings<K>> | null;
    if (!raw || typeof raw !== "object") return defaults;
    const layout = { ...defaults.layout };
    for (const id of Object.keys(defaults.layout) as K[]) {
      const p = raw.layout?.[id];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.s)) layout[id] = p;
    }
    return {
      layout,
      opacity: typeof raw.opacity === "number" ? raw.opacity : defaults.opacity,
      sens: typeof raw.sens === "number" ? raw.sens : defaults.sens,
      fixedStick: typeof raw.fixedStick === "boolean" ? raw.fixedStick : defaults.fixedStick,
    };
  } catch {
    return defaults;
  }
}

export function savePad<K extends string>(key: string, s: PadSettings<K>) {
  try {
    localStorage.setItem(key, JSON.stringify(s));
  } catch {
    // Not saved (private mode): it lasts this visit.
  }
}

/** Sizes follow the area: its shorter side over a typical phone's, within bounds. */
export function padUnit(w: number, h: number): number {
  return Math.max(0.75, Math.min(1.5, Math.min(w, h) / 360));
}

/** Where a control goes in the area, in px. */
export function padBox(place: PadPlace, control: PadControl, w: number, h: number): { left: number; top: number; width: number; height: number } {
  const height = control.size * place.s * padUnit(w, h);
  const width = height * (control.wide ?? 1);
  return { left: place.x * w - width / 2, top: place.y * h - height / 2, width, height };
}
