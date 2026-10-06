"use client";

export default function ProgressBar({ placed, total }: { placed: number; total: number }) {
  const pct = total > 0 ? Math.round((placed / total) * 100) : 0;
  const done = placed === total && total > 0;

  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 w-40 overflow-hidden rounded-full bg-slate-800 sm:w-56">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            done
              ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]"
              : "bg-gradient-to-r from-violet-500 to-cyan-400 shadow-[0_0_10px_rgba(139,92,246,0.5)]"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="whitespace-nowrap text-sm font-medium text-slate-300">
        {placed}/{total} piezas{done ? " · ¡Completo! 🎉" : ""}
      </span>
    </div>
  );
}
