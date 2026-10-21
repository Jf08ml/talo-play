"use client";

import { useEffect, useRef } from "react";
import { playSound, type SoundName } from "@/lib/sfx";

/**
 * Plays `name` whenever `key` changes after the first render (a move count,
 * the dice, the last guess…), so arriving at a room doesn't make a noise.
 * `null`/`undefined` keys and `when === false` stay quiet.
 */
export function useSoundOn(key: unknown, name: SoundName, when = true) {
  const prev = useRef(key);
  useEffect(() => {
    if (prev.current === key) return;
    prev.current = key;
    if (when && key !== null && key !== undefined) playSound(name);
  }, [key, name, when]);
}
