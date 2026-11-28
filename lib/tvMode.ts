/**
 * «Modo TV»: a lighter way to draw the big-screen games, for smart TVs and
 * TV boxes, which have weak graphics chips. On: an internal resolution capped
 * by the chosen level (the TV scales it up), low quality (no bloom, no
 * real-time shadows), no antialiasing, and adaptive resolution allowed to go
 * down to the level's floor. Only the big screens use it, never a phone or a
 * computer playing.
 *
 * Levels (`TV_LEVELS`): mínima (1280×720, down to half), baja, media and alta
 * TV (1920×1080, fixed). «Automático» (`adaptar`) starts at baja and moves a
 * level down when the screen can't keep `DOWN_FPS`, or up when it has room
 * for long (`UP_FPS`), measured by `startTvMonitor`. Absent/"auto" = adaptar
 * on a TV's browser, off elsewhere. Remembered in `talo.modoTv`; the old "si"
 * means mínima (what it used to be). `talo.modoTv.info` shows the fps chip.
 */

export type TvLevel = "minima" | "baja" | "media" | "alta";

export const TV_LEVEL_ORDER: TvLevel[] = ["minima", "baja", "media", "alta"];

export const TV_LEVELS: Record<TvLevel, { label: string; hint: string; pixels: number; minScale: number }> = {
  minima: { label: "Mínima", hint: "La más liviana, para teles muy lentas", pixels: 1280 * 720, minScale: 0.5 },
  baja: { label: "Baja", hint: "Liviana, un poco más nítida", pixels: 1280 * 720, minScale: 0.75 },
  media: { label: "Media", hint: "Más nítida, para teles con algo de fuerza", pixels: 1600 * 900, minScale: 0.85 },
  alta: { label: "Alta TV", hint: "Full HD fija, para teles o aparatos rápidos", pixels: 1920 * 1080, minScale: 1 },
};

/** "auto": not chosen (adaptar on a TV, off elsewhere); "adaptar": Automático; "no": Normal (Modo TV off). */
export type TvPref = "auto" | "adaptar" | TvLevel | "no";

const KEY = "talo.modoTv";
const INFO_KEY = "talo.modoTv.info";

/** Automático: below this for a while, one level down. */
const DOWN_FPS = 38;
/** Automático: above this for a long while, one level up. */
const UP_FPS = 55;
const DOWN_AFTER_MS = 3000;
const UP_AFTER_MS = 10000;
/** After dropping from a level, don't try it again for this long. */
const RETRY_MS = 90000;

/** A TV's browser: Samsung (Tizen), LG (webOS, NetCast), Android TV / Google TV, Fire TV, Chromecast, Hisense (VIDAA), Philips, Sony (Bravia), HbbTV, Apple TV. */
export function isTvBrowser(ua: string): boolean {
  return /smart-?tv|smarttv|tizen|web0s|webos|netcast|hbbtv|bravia|android tv|googletv|google tv|\baft[a-z]|crkey|vidaa|philipstv|nettv|appletv|opera tv|\btv\b.*\bsafari\b|\bdtv\b|viera|aquos/i.test(ua);
}

let pref: TvPref | null = null;
let info: boolean | null = null;
/** Automático's current level. */
let autoLevel: TvLevel = "baja";
/** When Automático last dropped from each level. */
const droppedAt: Partial<Record<TvLevel, number>> = {};
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function tvPref(): TvPref {
  if (pref) return pref;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "si") pref = "minima";
    else if (saved === "no" || saved === "adaptar" || (saved && saved in TV_LEVELS)) pref = saved as TvPref;
    else pref = "auto";
  } catch {
    pref = "auto";
  }
  return pref;
}

/** What the menu shows as chosen: "auto" resolved for this device. */
export function tvChoice(): Exclude<TvPref, "auto"> {
  if (typeof window === "undefined") return "no";
  const p = tvPref();
  if (p !== "auto") return p;
  return isTvBrowser(navigator.userAgent) ? "adaptar" : "no";
}

/** Modo TV on for this device: a level or Automático, chosen or on a TV's browser. */
export function tvModeOn(): boolean {
  return tvChoice() !== "no";
}

/** The level drawing now (Automático's current one), or null with Modo TV off. */
export function tvLevel(): TvLevel | null {
  const c = tvChoice();
  if (c === "no") return null;
  return c === "adaptar" ? autoLevel : c;
}

export function setTvPref(next: Exclude<TvPref, "auto">) {
  pref = next;
  if (next === "adaptar") autoLevel = "baja";
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Lasts this visit.
  }
  notify();
}

/** Whether the fps chip shows. */
export function tvInfoOn(): boolean {
  if (info !== null) return info;
  try {
    info = localStorage.getItem(INFO_KEY) === "1";
  } catch {
    info = false;
  }
  return info;
}

export function setTvInfo(on: boolean) {
  info = on;
  try {
    localStorage.setItem(INFO_KEY, on ? "1" : "0");
  } catch {
    // Lasts this visit.
  }
  notify();
}

export function subscribeTvMode(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The pixel ratio that keeps a `w`×`h` (CSS px) canvas within the current level's pixel budget. */
export function tvDpr(dpr: number, w: number, h: number): number {
  if (!w || !h) return dpr;
  const level = tvLevel() ?? "minima";
  return Math.min(dpr, Math.sqrt(TV_LEVELS[level].pixels / (w * h)));
}

/** How far the scenes' adaptive resolution may go down at the current level. */
export function tvMinScale(): number {
  return TV_LEVELS[tvLevel() ?? "minima"].minScale;
}

// --- Frame-rate monitor --------------------------------------------------
// Its own requestAnimationFrame loop: rAF runs at the rate the page actually
// manages to paint, so it measures the game without touching its loop.

let monitors = 0;
let raf = 0;
let last = 0;
let fpsAvg = 60;
let slowSince = 0;
let fastSince = 0;

function tick(now: number) {
  raf = requestAnimationFrame(tick);
  const dt = last ? now - last : 0;
  last = now;
  // A hidden tab or a long hitch (loading a model) isn't the game's pace.
  if (dt <= 0 || dt > 250) {
    slowSince = fastSince = 0;
    return;
  }
  fpsAvg += (1000 / dt - fpsAvg) * 0.05;
  if (tvChoice() !== "adaptar") return;
  const i = TV_LEVEL_ORDER.indexOf(autoLevel);
  if (fpsAvg < DOWN_FPS) {
    fastSince = 0;
    if (!slowSince) slowSince = now;
    else if (now - slowSince > DOWN_AFTER_MS && i > 0) {
      droppedAt[autoLevel] = now;
      autoLevel = TV_LEVEL_ORDER[i - 1];
      slowSince = 0;
      fpsAvg = 50; // Give the new level a fair start.
      notify();
    }
  } else if (fpsAvg > UP_FPS) {
    slowSince = 0;
    if (!fastSince) fastSince = now;
    else if (now - fastSince > UP_AFTER_MS && i < TV_LEVEL_ORDER.length - 1) {
      const up = TV_LEVEL_ORDER[i + 1];
      fastSince = 0;
      const dropped = droppedAt[up];
      if (dropped === undefined || now - dropped > RETRY_MS) {
        autoLevel = up;
        notify();
      }
    }
  } else {
    slowSince = fastSince = 0;
  }
}

/** Measures the frame rate while a big screen is on (Automático and the fps chip read it). Returns the stop. */
export function startTvMonitor(): () => void {
  monitors++;
  if (monitors === 1) {
    last = 0;
    raf = requestAnimationFrame(tick);
  }
  return () => {
    monitors--;
    if (monitors === 0) cancelAnimationFrame(raf);
  };
}

export function tvFps(): number {
  return fpsAvg;
}
