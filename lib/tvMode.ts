/**
 * «Modo TV»: a lighter way to draw the big-screen games, for smart TVs and
 * TV boxes, which have weak graphics chips. On: an internal resolution of at
 * most `TV_MAX_PIXELS` (the TV scales it up), low quality (no bloom, no
 * real-time shadows), no antialiasing, and adaptive resolution allowed to go
 * lower. Only the big screens use it, never a phone or a computer playing.
 * Automatic on a TV's browser; anyone can turn it on or off from the screen
 * («Modo TV», remembered in `talo.modoTv`).
 */

/** At most 1280×720 drawn pixels. */
export const TV_MAX_PIXELS = 1280 * 720;
/** How far adaptive resolution may go down with Modo TV on (otherwise 0.6). */
export const TV_MIN_SCALE = 0.5;

export type TvPref = "auto" | "si" | "no";

const KEY = "talo.modoTv";

/** A TV's browser: Samsung (Tizen), LG (webOS, NetCast), Android TV / Google TV, Fire TV, Chromecast, Hisense (VIDAA), Philips, Sony (Bravia), HbbTV, Apple TV. */
export function isTvBrowser(ua: string): boolean {
  return /smart-?tv|smarttv|tizen|web0s|webos|netcast|hbbtv|bravia|android tv|googletv|google tv|\baft[a-z]|crkey|vidaa|philipstv|nettv|appletv|opera tv|\btv\b.*\bsafari\b|\bdtv\b|viera|aquos/i.test(ua);
}

let pref: TvPref | null = null;
const listeners = new Set<() => void>();

export function tvPref(): TvPref {
  if (pref) return pref;
  try {
    const saved = localStorage.getItem(KEY);
    pref = saved === "si" || saved === "no" ? saved : "auto";
  } catch {
    pref = "auto";
  }
  return pref;
}

/** Modo TV on for this device: chosen, or a TV's browser. */
export function tvModeOn(): boolean {
  if (typeof window === "undefined") return false;
  const p = tvPref();
  return p === "si" || (p === "auto" && isTvBrowser(navigator.userAgent));
}

export function setTvMode(on: boolean) {
  pref = on ? "si" : "no";
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // Lasts this visit.
  }
  listeners.forEach((l) => l());
}

export function subscribeTvMode(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The pixel ratio that keeps a `w`×`h` (CSS px) canvas within the TV's pixel budget. */
export function tvDpr(dpr: number, w: number, h: number): number {
  if (!w || !h) return dpr;
  return Math.min(dpr, Math.sqrt(TV_MAX_PIXELS / (w * h)));
}
