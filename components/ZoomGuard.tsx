"use client";

import { useEffect } from "react";

/**
 * Keeps the page from zooming during games (root layout). The viewport
 * already says `user-scalable=no`, which Android honors but iOS Safari
 * ignores for pinching, so on iOS the pinch gesture itself is cancelled.
 * Games that zoom on their own (the puzzle board) still get their touches;
 * only the page's zoom is stopped. Double-tap zoom is off via CSS
 * (`touch-action: manipulation` in globals.css).
 */
export default function ZoomGuard() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", stop, { passive: false });
    document.addEventListener("gesturechange", stop, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
    };
  }, []);
  return null;
}
