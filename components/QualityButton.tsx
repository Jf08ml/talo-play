"use client";

import { Sparkles } from "lucide-react";
import type { Quality } from "@/lib/postfx";

/** The 3D games' graphics switch: high (glow and shadows) or low (smoother on older phones). */
export default function QualityButton({ quality, onToggle, className = "" }: { quality: Quality | null; onToggle: () => void; className?: string }) {
  return (
    <button
      onClick={onToggle}
      aria-label="Calidad gráfica"
      title="Calidad gráfica: alta tiene brillos y sombras; baja va más fluido en teléfonos viejos"
      className={`flex items-center gap-1 rounded-xl bg-slate-950/60 px-2 py-2 text-xs text-white backdrop-blur ${className}`}
    >
      <Sparkles className="h-4 w-4" /> {quality === "baja" ? "Baja" : "Alta"}
    </button>
  );
}
