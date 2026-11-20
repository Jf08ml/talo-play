"use client";

import { useEffect, useState } from "react";

/**
 * Full screen on every device. The Fullscreen API works on Android, iPad and
 * computers (older Safari only with the `webkit` prefix); iPhones have none
 * for pages, so there the way is Talo added to the home screen (it opens
 * without Safari's bars, `app/manifest.ts`). Browser only.
 */

type FsDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const doc = () => document as FsDocument;

/** The page can go full screen with the API (not on iPhones). */
export function fullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  return !!(doc().fullscreenEnabled || doc().webkitFullscreenEnabled);
}

export function fullscreenActive(): boolean {
  if (typeof document === "undefined") return false;
  return !!(doc().fullscreenElement || doc().webkitFullscreenElement);
}

/** Opened from the home screen (or as an installed app): already without browser bars. */
export function runningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS reports itself as a Mac with touch.
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export async function enterFullscreen(el: HTMLElement = document.documentElement): Promise<void> {
  const target = el as FsElement;
  try {
    if (target.requestFullscreen) await target.requestFullscreen({ navigationUI: "hide" });
    else await target.webkitRequestFullscreen?.();
  } catch {
    // Refused (not from a tap, or the browser said no): nothing to do.
  }
}

export async function exitFullscreen(): Promise<void> {
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else await doc().webkitExitFullscreen?.();
  } catch {
    // Already out.
  }
}

/**
 * What a full-screen button can do here: `api` toggles it, `install` explains
 * how to add Talo to the home screen (iPhone), `none` hides the button
 * (already standalone, or a browser with neither).
 */
export type FullscreenMode = "api" | "install" | "none";

export function useFullscreen(target?: () => HTMLElement | null) {
  const [state, setState] = useState<{ mode: FullscreenMode; active: boolean }>({ mode: "none", active: false });

  useEffect(() => {
    const mode: FullscreenMode = runningStandalone() ? "none" : fullscreenSupported() ? "api" : isIOS() ? "install" : "none";
    const update = () => setState({ mode, active: fullscreenActive() });
    update();
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, []);

  const toggle = () => {
    if (fullscreenActive()) exitFullscreen();
    else enterFullscreen(target?.() ?? document.documentElement);
  };

  return { ...state, toggle };
}
