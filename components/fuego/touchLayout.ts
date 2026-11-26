/**
 * Fuego cruzado's touch controls, laid out like the big mobile shooters do
 * (Call of Duty Mobile, PUBG Mobile, Free Fire, Fortnite): the left thumb
 * moves (a stick that appears where it lands, low on the left) with a second
 * trigger above it; the right thumb looks and rests on a big fire button,
 * with aim up-left of it, reload above, jump in the corner, the grenade and
 * the ability on the edge, and the weapon panel at the bottom middle (tap it
 * to switch). Everything can be moved and resized from «Ajustar controles»,
 * with sensitivity, opacity, auto-fire, the left trigger and a fixed stick;
 * saved per device (`fuego.controles`).
 */

export type TouchButtonId = "stick" | "fire" | "fire2" | "aim" | "reload" | "jump" | "melee" | "grenade" | "ability" | "weapons" | "pick";

/** A control's center as a fraction of the screen (0–1 from the left and the top) and its size multiplier. */
export interface ButtonPlace {
  x: number;
  y: number;
  s: number;
}

export interface TouchSettings {
  layout: Record<TouchButtonId, ButtonPlace>;
  /** How opaque the buttons are (0.3–1). */
  opacity: number;
  /** Look sensitivity, and an extra factor while aiming. */
  sens: number;
  aimSens: number;
  /** Shoots by itself while the crosshair is on a rival (not with the sniper or the balloon launcher). */
  autoFire: boolean;
  /** A second trigger on the left, above the stick. */
  leftFire: boolean;
  /** The stick stays where it's placed instead of appearing under the thumb. */
  fixedStick: boolean;
}

export const BUTTON_INFO: Record<TouchButtonId, { label: string; size: number }> = {
  stick: { label: "Joystick", size: 112 },
  fire: { label: "Disparar", size: 84 },
  fire2: { label: "Disparo izquierdo", size: 60 },
  aim: { label: "Apuntar", size: 56 },
  reload: { label: "Recargar", size: 48 },
  jump: { label: "Saltar", size: 58 },
  melee: { label: "Golpe", size: 48 },
  grenade: { label: "Globo", size: 50 },
  ability: { label: "Habilidad", size: 58 },
  weapons: { label: "Armas", size: 46 },
  pick: { label: "Agarrar", size: 44 },
};

export const DEFAULT_LAYOUT: Record<TouchButtonId, ButtonPlace> = {
  stick: { x: 0.15, y: 0.7, s: 1 },
  fire2: { x: 0.09, y: 0.36, s: 1 },
  fire: { x: 0.84, y: 0.66, s: 1 },
  aim: { x: 0.72, y: 0.52, s: 1 },
  reload: { x: 0.87, y: 0.4, s: 1 },
  jump: { x: 0.94, y: 0.86, s: 1 },
  melee: { x: 0.72, y: 0.82, s: 1 },
  grenade: { x: 0.955, y: 0.58, s: 1 },
  ability: { x: 0.955, y: 0.31, s: 1 },
  weapons: { x: 0.5, y: 0.9, s: 1 },
  pick: { x: 0.6, y: 0.64, s: 1 },
};

export const DEFAULT_TOUCH: TouchSettings = {
  layout: DEFAULT_LAYOUT,
  opacity: 0.85,
  sens: 1,
  aimSens: 0.7,
  autoFire: false,
  leftFire: true,
  fixedStick: false,
};

const KEY = "fuego.controles";

/** The saved settings, with any missing piece (a control added later) from the defaults. */
export function loadTouch(): TouchSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<TouchSettings> | null;
    if (!raw) return DEFAULT_TOUCH;
    return { ...DEFAULT_TOUCH, ...raw, layout: { ...DEFAULT_LAYOUT, ...(raw.layout ?? {}) } };
  } catch {
    return DEFAULT_TOUCH;
  }
}

export function saveTouch(t: TouchSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    // Not saved (private mode): it lasts this visit.
  }
}

/** Sizes follow the phone: the shorter side over a typical 390 px phone, within bounds. */
export function sizeUnit(w: number, h: number): number {
  return Math.max(0.85, Math.min(1.35, Math.min(w, h) / 390));
}
