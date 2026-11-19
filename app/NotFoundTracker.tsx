"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

/** Tells GA which URL led to a 404, so broken links can be found and fixed. */
export default function NotFoundTracker() {
  useEffect(() => {
    trackEvent("page_not_found", { path: (location.pathname + location.search).slice(0, 100) });
  }, []);
  return null;
}
