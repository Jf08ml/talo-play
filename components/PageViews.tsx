"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { sendGAEvent } from "@next/third-parties/google";
import { countVisit, isOwnBrowser } from "@/lib/dailyStats";

const PROD = process.env.NODE_ENV === "production";
/** How long to wait for the new page's title before sending its view anyway. */
const TITLE_WAIT_MS = 1500;
/** Titles that aren't a page (`useTurnAlert` blinks this one). */
const FAKE_TITLE = /¡Te toca!/;

/**
 * Page views for Google Analytics, sent by us instead of GA's "browser history"
 * page views. GA reads `document.title` the moment the URL changes, before
 * Next swaps the title, so every view went to the previous page (the home got
 * them, lobbies showed users without views). Here a client-side navigation
 * waits for the new title (rooms stream theirs from `generateMetadata`) and
 * then sends `page_view` with it. The first load's view is GA's own `config`
 * one, already right.
 *
 * It also `set`s the page title for every later event, so `user_engagement`
 * sent while the tab blinks "¡Te toca!" isn't filed under that title.
 *
 * Needs, in GA: Admin → Data streams → web → Enhanced measurement → Page views →
 * advanced settings → "Page changes based on browser history events" OFF,
 * or each navigation counts twice.
 *
 * Also counts the day's visit in our own stats (lib/dailyStats.ts).
 */
export default function PageViews() {
  const pathname = usePathname();
  const first = useRef(true);
  const lastTitle = useRef("");

  useEffect(() => {
    countVisit();
    // The team's own browsers (marked on /estadisticas) go to GA as internal
    // traffic, which GA's "Internal traffic" data filter drops once it's active.
    if (PROD && isOwnBrowser()) {
      const w = window as unknown as { dataLayer?: unknown[] };
      w.dataLayer = w.dataLayer || [];
      try {
        sendGAEvent("set", { traffic_type: "internal" });
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!PROD) return;
    const isFirst = first.current;
    first.current = false;
    const previous = lastTitle.current;
    const started = Date.now();
    let frame = 0;

    const check = () => {
      const title = document.title;
      const ready = !FAKE_TITLE.test(title) && (isFirst || title !== previous);
      if (!ready && Date.now() - started < TITLE_WAIT_MS) {
        frame = requestAnimationFrame(check);
        return;
      }
      const clean = FAKE_TITLE.test(title) ? previous : title;
      lastTitle.current = clean;
      // GA's init script may not have run yet; it keeps an existing queue.
      const w = window as unknown as { dataLayer?: unknown[] };
      w.dataLayer = w.dataLayer || [];
      try {
        sendGAEvent("set", { page_title: clean });
        if (!isFirst) {
          sendGAEvent("event", "page_view", {
            page_title: clean,
            page_location: window.location.href,
            page_path: pathname,
          });
        }
      } catch {
        // Analytics must never break a page.
      }
    };
    frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
