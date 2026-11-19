"use client";

import { useEffect, useState } from "react";
import { Box, Square } from "lucide-react";
import { useQuality } from "@/hooks/useQuality";
import QualityButton from "@/components/QualityButton";

export type GolfView = "2d" | "3d";

const VIEW_KEY = "minigolf.vista";

/**
 * The view (flat from above or 3D) and, in 3D, the graphics quality (shadows
 * on "alta"), remembered in this browser. Until picked: 3D with a mouse, 2D
 * on touch (it shows the whole hole on a small screen).
 */
export function useGolfView() {
  const [view, setView] = useState<GolfView | null>(null);
  const [quality, toggleQuality] = useQuality("minigolf.calidad");
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(VIEW_KEY);
    } catch {
      // Not remembered.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the device after mounting.
    setView(saved === "2d" || saved === "3d" ? saved : window.matchMedia("(pointer: fine)").matches ? "3d" : "2d");
  }, []);
  const toggleView = () =>
    setView((v) => {
      const next: GolfView = v === "3d" ? "2d" : "3d";
      try {
        localStorage.setItem(VIEW_KEY, next);
      } catch {
        // Not remembered.
      }
      return next;
    });
  return { view: view ?? "2d", ready: view !== null, toggleView, quality, toggleQuality, shadows: quality === "alta" };
}

/** "2D / 3D" and, in 3D, the quality switch. */
export default function ViewButtons({ g }: { g: ReturnType<typeof useGolfView> }) {
  return (
    <span className="flex items-center gap-1.5">
      {g.view === "3d" && <QualityButton quality={g.quality} onToggle={g.toggleQuality} />}
      <button
        onClick={g.toggleView}
        aria-label={g.view === "3d" ? "Ver en 2D" : "Ver en 3D"}
        title={g.view === "3d" ? "Ver desde arriba (2D)" : "Ver en 3D"}
        className="flex items-center gap-1 rounded-xl bg-slate-950/60 px-2 py-2 text-xs font-bold text-white ring-1 ring-white/10"
      >
        {g.view === "3d" ? <Square className="h-4 w-4" /> : <Box className="h-4 w-4" />} {g.view === "3d" ? "2D" : "3D"}
      </button>
    </span>
  );
}
