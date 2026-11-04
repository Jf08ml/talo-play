"use client";

import { Heart, Star, Target, BrickWall } from "lucide-react";
import type { Goal } from "@/lib/ladrillazoSim";

/** Lives as hearts (a number past five). */
export function Lives({ lives }: { lives: number }) {
  if (lives > 5) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-sm text-white">
        <Heart className="h-4 w-4 fill-[#FF5FA2] text-[#FF5FA2]" /> {lives}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${lives} vidas`}>
      {Array.from({ length: Math.max(0, lives) }, (_, i) => (
        <Heart key={i} className="h-4 w-4 fill-[#FF5FA2] text-[#FF5FA2]" />
      ))}
    </span>
  );
}

export function goalText(goal: Goal): string {
  return goal === "objetivos" ? "Rompé los objetivos rojos" : goal === "limpiar" ? "Rompé todos los ladrillos" : "Aguantá más que los demás";
}

export function GoalPill({ goal }: { goal: Goal }) {
  const Icon = goal === "objetivos" ? Target : BrickWall;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white/80">
      <Icon className="h-3 w-3" /> {goalText(goal)}
    </span>
  );
}

export function Stars({ n, size = "h-5 w-5" }: { n: number; size?: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${n} de 3 estrellas`}>
      {[0, 1, 2].map((i) => (
        <Star key={i} className={`${size} ${i < n ? "fill-talo-hero text-talo-hero" : "text-white/25"}`} />
      ))}
    </span>
  );
}

export function ProgressBar({ value, color = "#FFD400" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
    </div>
  );
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
