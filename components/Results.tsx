"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { playSound } from "@/lib/sfx";
import { NEUTRAL, reduceTalos, type TaloReaction, type TaloState } from "@/lib/taloEvents";
import { playerTalo } from "@/lib/talos";
import { Talo } from "./Talo";

// The end-of-game screen shared by the games: who won (ties too), a podium
// for the top three, the rest in a list, and confetti when you won.

export interface RankEntry {
  id: string;
  name: string;
  color?: string;
  score: number;
}

// The talos' flat colors (lib/talos.ts).
const CONFETTI_COLORS = ["#FFD400", "#FF5FA2", "#FF7A1A", "#2D5BFF", "#00B26B", "#8A4DFF"];

/** A one-off burst of confetti over the whole screen (skipped with reduced motion). */
export function Confetti({ pieces = 140 }: { pieces?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    playSound("win");
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
  { place: 2, height: "h-16" },
  { place: 1, height: "h-24" },
  { place: 3, height: "h-12" },
];

/** A ranked player as their talo, reacting to the (public) final result. */
function RankTalo({ entry, reaction, look, size }: { entry: RankEntry; reaction: TaloReaction; look: [number, number]; size: number }) {
  const t = playerTalo(entry.id, entry.color ?? "#64748b", size);
  return (
    <Talo w={t.w} h={t.h} color={t.color} radius={t.radius} expr={reaction.expr} look={look} label={entry.name} />
  );
}

/**
 * The final screen. `ranking` comes sorted best first; `myId` names "Vos".
 * `title` overrides the automatic "¡Ganaste!" / "Ganó X"; `children` adds
 * highlights under the podium and `actions` the buttons (play again…).
 * The talos react to the final result, which everyone sees at once: the
 * winner wears the crown, the rest look at them (ties: all the winners smile).
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

  const celebrating = celebrate ?? iWon;
  // The confetti brings its own fanfare; otherwise a soft closing jingle.
  useEffect(() => {
    if (!celebrating) playSound("end");
  }, [celebrating]);

  const ids = ranking.map((r) => r.id);
  const talos: TaloState =
    winners.length === 1
      ? reduceTalos(ids, {}, { type: "game_ended", winner: winners[0].id, others: ids.filter((id) => id !== winners[0].id) })
      : reduceTalos(ids, {}, { type: "round_ended", winners: winners.map((w) => w.id), losers: [] });

  const podium = ranking.length >= 2 ? ranking.slice(0, 3) : [];
  const rest = ranking.slice(podium.length);

  return (
    <div className="animate-celebration-in relative flex flex-col items-center gap-5 overflow-hidden rounded-[28px] bg-[#1c1c1c] p-6 text-center ring-1 ring-white/[0.08]">
      {celebrating && <Confetti />}
      <div className="relative flex flex-col items-center gap-1.5">
        {podium.length === 0 && ranking[0] && (
          <div className="mb-2">
            <RankTalo entry={ranking[0]} reaction={talos[ranking[0].id] ?? NEUTRAL} look={[0, 0]} size={84} />
          </div>
        )}
        <p className="font-display text-[32px] leading-tight text-white">{title ?? auto}</p>
        {(subtitle ?? autoSub) && <p className="text-[15px] text-white/70">{subtitle ?? autoSub}</p>}
      </div>

      {podium.length > 0 && (
        <div
          className={`relative grid w-full items-end gap-2 ${podium.length === 2 ? "max-w-[16rem] grid-cols-2" : "max-w-sm grid-cols-3"}`}
        >
          {PODIUM.slice(0, podium.length === 2 ? 2 : 3).map(({ place, height }, col) => {
            const entry = podium[place - 1];
            if (!entry) return <div key={col} />;
            const p = pos[place - 1];
            const reaction = talos[entry.id] ?? NEUTRAL;
            // On the podium the winner stands in the middle: the rest look toward it.
            const look: [number, number] = reaction.lookAt ? [col === 0 ? 1 : -1, -0.3] : [0, 0];
            return (
              <div key={entry.id} className="flex min-w-0 flex-col items-center gap-1.5">
                <RankTalo entry={entry} reaction={reaction} look={look} size={place === 1 ? 72 : 56} />
                <span className={`w-full truncate text-sm font-bold ${entry.id === myId ? "text-talo-hero" : "text-white"}`}>
                  {entry.id === myId ? "Vos" : entry.name}
                </span>
                <span className="font-mono text-xs text-white/60">{entry.score}</span>
                <div
                  className={`flex w-full items-start justify-center rounded-t-xl pt-1.5 ${height} ${
                    p === 1 ? "bg-talo-hero text-talo-ink" : "bg-white/10 text-white"
                  }`}
                >
                  <span className="font-display text-2xl">{p}</span>
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
              className={`flex items-center gap-3 rounded-[10px] px-3 py-1.5 ${r.id === myId ? "bg-talo-hero/15 ring-1 ring-talo-hero/40" : "bg-white/[0.05]"}`}
            >
              <span className="w-5 text-right font-mono text-white/50">{pos[podium.length + i]}</span>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color ?? "#64748b" }} />
              <span className="flex-1 truncate text-left text-white">{r.id === myId ? "Vos" : r.name}</span>
              <span className="font-mono text-white/80">{r.score}</span>
            </li>
          ))}
        </ol>
      )}

      {children && <div className="relative flex w-full flex-col items-center gap-2 text-sm text-white/80">{children}</div>}

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
