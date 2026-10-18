"use client";

import { useEffect, useState } from "react";
import type { Quality } from "@/lib/postfx";

/**
 * The graphics quality of a 3D game, remembered per game under `storageKey`.
 * Until the user picks one: high with a mouse (computers), low on touch
 * (phones). Null on the first render, before it's known.
 */
export function useQuality(storageKey: string): [Quality | null, () => void] {
  const [quality, setQuality] = useState<Quality | null>(null);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(storageKey);
    } catch {
      // Not remembered.
    }
    const initial: Quality = saved === "alta" || saved === "baja" ? saved : window.matchMedia("(pointer: fine)").matches ? "alta" : "baja";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the device after mounting.
    setQuality(initial);
  }, [storageKey]);
  const toggle = () =>
    setQuality((q) => {
      const next: Quality = q === "alta" ? "baja" : "alta";
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // Not remembered.
      }
      return next;
    });
  return [quality, toggle];
}
