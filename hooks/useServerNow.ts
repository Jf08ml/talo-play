"use client";

import { useEffect, useState } from "react";
import { serverNow } from "@/lib/serverTime";

/** Server-aligned "now" that re-renders every `intervalMs` while `active`. */
export function useServerNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(serverNow());
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);

  return now;
}
