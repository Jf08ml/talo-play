"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Crown, Trophy } from "lucide-react";

// The end-of-game screen shared by the games: who won (ties too), a podium
// for the top three, the rest in a list, and confetti when you won.

export interface RankEntry {
  id: string;
  name: string;
  color?: string;
  score: number;
}

const CONFETTI_COLORS = ["#a855f7", "#d946ef", "#22d3ee", "#facc15", "#34d399", "#fb7185"];

/** A one-off burst of confetti over the whole screen (skipped with reduced motion). */
export function Confetti({ pieces = 140 }: { pieces?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Two cannons from the bottom corners, aimed up and inwards.
    const parts = Array.from({ length: pieces }, (_, i) => {
      const left = i % 2 === 0;
      const angle = -Math.PI / 2 + (left ? 1 : -1) * (0.25 + Math.random() * 0.45);
      const speed = h * (0.022 + Math.random() * 0.014);
      return {
        x: left ? 0 : w,
        y: h,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.random() * 12,
      };
    });

    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of parts) {
        if (frame < p.delay) {
          alive = true;
          continue;
        }
        p.vy += h * 0.0006;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.spin;
        if (p.y > h + 20) continue;
        alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        // Flat paper: its width wobbles as it turns.
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size * Math.abs(Math.cos(p.rot * 2)) + 1, p.size / 2);
        ctx.restore();
      }
      if (alive && frame < 600) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pieces]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-50 h-full w-full" />;
}

/** Ranking order with shared places: equal scores get the same position. */
function places(ranking: RankEntry[]): number[] {
  return ranking.map((r, i) => (i > 0 && ranking[i - 1].score === r.score ? -1 : i + 1)).reduce<number[]>((acc, p, i) => {
    acc.push(p === -1 ? acc[i - 1] : p);
    return acc;
  }, []);
}

const PODIUM = [
  { place: 2, height: "h-16", ring: "ring-slate-300/60", label: "text-slate-300" },
  { place: 1, height: "h-24", ring: "ring-amber-300/80", label: "text-amber-300" },
  { place: 3, height: "h-12", ring: "ring-orange-400/60", label: "text-orange-300" },
];

function Avatar({ entry, big }: { entry: RankEntry; big?: boolean }) {
  return (
    <span
      className={`flex items-center justify-center rounded-full font-bold text-white ${big ? "h-14 w-14 text-xl" : "h-11 w-11 text-base"}`}
      style={{ backgroundColor: entry.color ?? "#64748b", boxShadow: `0 0 18px ${entry.color ?? "#64748b"}88` }}
    >
      {entry.name.slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

/**
 * The final screen. `ranking` comes sorted best first; `myId` names "Vos".
 * `title` overrides the automatic "¡Ganaste!" / "Ganó X"; `children` adds
 * highlights under the podium and `actions` the buttons (play again…).
 */
export default function GameResults({
  ranking,
  myId,
  unit = "puntos",
  title,
  subtitle,
  celebrate,
  children,
  actions,
}: {
  ranking: RankEntry[];
  myId: string;
  unit?: string;
  title?: string;
  subtitle?: string;
  /** Confetti; by default when you are among the winners. */
  celebrate?: boolean;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const pos = places(ranking);
  const best = ranking[0]?.score ?? 0;
  const winners = ranking.filter((r) => r.score === best && best > 0);
  const iWon = winners.some((w) => w.id === myId);
  const nameOf = (r: RankEntry, capital = false) => (r.id === myId ? (capital ? "Vos" : "vos") : r.name);
  const auto = !winners.length
    ? "¡Terminó!"
    : iWon
      ? winners.length > 1
        ? "¡Empate en el primer puesto!"
        : "¡Ganaste!"
      : winners.length > 1
        ? "¡Empate!"
        : `¡Ganó ${winners[0].name}!`;
  const autoSub = winners.length
    ? winners.length > 1
      ? `${winners.map((w, i) => nameOf(w, i === 0)).join(" y ")} con ${best} ${unit}`
      : `Con ${best} ${unit}`
    : undefined;

  const podium = ranking.length >= 2 ? ranking.slice(0, 3) : [];
  const rest = ranking.slice(podium.length);

  return (
    <div
      className={`animate-celebration-in relative flex flex-col items-center gap-5 overflow-hidden rounded-2xl border bg-slate-900/90 p-6 text-center backdrop-blur ${
        iWon ? "border-amber-300/30 shadow-[0_0_50px_rgba(251,191,36,0.18)]" : "border-violet-500/20 shadow-[0_0_40px_rgba(139,92,246,0.12)]"
      }`}
    >
      {(celebrate ?? iWon) && <Confetti />}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-72 rounded-full bg-gradient-to-r from-violet-600/25 via-fuchsia-500/25 to-amber-400/20 blur-3xl"
      />
      <div className="relative flex flex-col items-center gap-1">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 shadow-[0_0_24px_rgba(251,191,36,0.45)]">
          <Trophy className="h-6 w-6 text-amber-950" />
        </span>
        <p className="mt-2 font-display text-3xl font-bold text-slate-100">{title ?? auto}</p>
        {(subtitle ?? autoSub) && <p className="text-sm text-slate-400">{subtitle ?? autoSub}</p>}
      </div>

      {podium.length > 0 && (
        <div
          className={`relative grid w-full items-end gap-2 ${podium.length === 2 ? "max-w-[16rem] grid-cols-2" : "max-w-sm grid-cols-3"}`}
        >
          {PODIUM.slice(0, podium.length === 2 ? 2 : 3).map(({ place, height, ring, label }, col) => {
            const entry = podium[place - 1];
            if (!entry) return <div key={col} />;
            const p = pos[place - 1];
            return (
              <div key={entry.id} className="flex min-w-0 flex-col items-center gap-1.5">
                {p === 1 && <Crown className="h-5 w-5 text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]" />}
                <span className={`rounded-full ring-2 ${ring}`}>
                  <Avatar entry={entry} big={place === 1} />
                </span>
                <span className={`w-full truncate text-sm font-semibold ${entry.id === myId ? "text-violet-200" : "text-slate-200"}`}>
                  {entry.id === myId ? "Vos" : entry.name}
                </span>
                <span className="font-mono text-xs text-slate-400">{entry.score}</span>
                <div
                  className={`flex w-full items-start justify-center rounded-t-xl border-x border-t border-white/10 bg-gradient-to-b from-slate-700/80 to-slate-800/40 pt-1.5 ${height}`}
                >
                  <span className={`font-display text-2xl font-bold ${label}`}>{p}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rest.length > 0 && (
        <ol className="flex w-full max-w-sm flex-col gap-1 text-sm">
          {rest.map((r, i) => (
            <li
              key={r.id}
              className={`flex items-center gap-3 rounded-lg px-3 py-1.5 ${r.id === myId ? "bg-violet-500/10 ring-1 ring-violet-400/30" : "bg-slate-800/50"}`}
            >
              <span className="w-5 text-right font-mono text-slate-500">{pos[podium.length + i]}</span>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color ?? "#64748b" }} />
              <span className="flex-1 truncate text-left text-slate-200">{r.id === myId ? "Vos" : r.name}</span>
              <span className="font-mono text-slate-300">{r.score}</span>
            </li>
          ))}
        </ol>
      )}

      {children && <div className="relative flex w-full flex-col items-center gap-2 text-sm text-slate-300">{children}</div>}

      {actions && <div className="relative flex w-full max-w-xs flex-col items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Builds a sorted ranking from a game's `players` and `scores` maps. */
export function rankFrom(
  players: Record<string, { name?: string; color?: string } | undefined>,
  scores: Record<string, number | undefined>,
  ids: string[] = Object.keys(scores)
): RankEntry[] {
  return ids
    .map((id) => ({ id, name: players[id]?.name ?? "?", color: players[id]?.color, score: scores[id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
}
