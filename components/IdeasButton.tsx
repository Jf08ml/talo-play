"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lightbulb, X } from "lucide-react";

/** Set once the bubble was shown and closed (or the button used), so it never nags again. */
const SEEN_KEY = "talo.ideas.visto";
/** The bubble waits a bit so it doesn't greet someone who just arrived. */
const BUBBLE_DELAY_MS = 25_000;

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private mode: it may show again, that's all.
  }
}

/**
 * Floating "Ideas" button on Talo's light pages (rendered by `SiteFooter`),
 * linking to the community page. The first time, after a while, a bubble
 * invites to vote the next game; closing it or using the button hides it for good.
 */
export default function IdeasButton() {
  const path = usePathname();
  const [bubble, setBubble] = useState(false);

  useEffect(() => {
    if (readSeen()) return;
    const t = setTimeout(() => setBubble(true), BUBBLE_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  if (path === "/ideas") return null;

  const close = () => {
    setBubble(false);
    markSeen();
  };

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2 sm:bottom-6 sm:right-6">
      {bubble && (
        <div
          role="status"
          className="relative w-[min(300px,calc(100vw-32px))] rounded-2xl border-2 border-talo-ink bg-white p-4 pr-10 text-talo-ink shadow-[4px_4px_0_#111]"
        >
          <button
            onClick={close}
            aria-label="Cerrar"
            className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-lg text-talo-text-3 hover:bg-talo-surface"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="text-[17px] font-bold leading-tight">¿Qué juego querés que sumemos?</p>
          <p className="mt-1 text-[15px] text-talo-text-2">Votá o contanos tu idea. Talo lo armamos entre todos.</p>
          <Link
            href="/ideas"
            onClick={markSeen}
            className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-talo-ink px-3.5 text-[15px] font-bold text-white hover:bg-black"
          >
            Dar mi idea
          </Link>
        </div>
      )}
      <Link
        href="/ideas"
        onClick={markSeen}
        aria-label="Ideas y sugerencias"
        className="flex min-h-12 items-center gap-2 rounded-full border-2 border-talo-ink bg-talo-hero px-4 font-bold text-talo-ink shadow-[3px_3px_0_#111] transition hover:bg-[#ffe033] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#111]"
      >
        <Lightbulb className="h-5 w-5" strokeWidth={2.4} />
        <span className="hidden sm:inline">Ideas</span>
      </Link>
    </div>
  );
}
