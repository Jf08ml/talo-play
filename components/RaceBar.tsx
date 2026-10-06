"use client";

import { useEffect, useState } from "react";
import { TEAMS, type RaceState, type TeamId } from "@/lib/room";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Live clock, ticking only while `active` — read from state (not Date.now() in render) so it stays a pure render. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function TeamProgress({
  label,
  color,
  placed,
  total,
  isMine,
}: {
  label: string;
  color: string;
  placed: number;
  total: number;
  isMine: boolean;
}) {
  const pct = total > 0 ? Math.round((placed / total) * 100) : 0;
  return (
    <div className="flex flex-1 items-center gap-2">
      <span className="w-24 shrink-0 truncate text-xs font-medium text-slate-300">
        {label}
        {isMine ? " (vos)" : ""}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 10px 0 ${color}99` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-xs text-slate-400">
        {placed}/{total}
      </span>
    </div>
  );
}

export default function RaceBar({
  race,
  progress,
  myTeam,
  onStart,
}: {
  race: RaceState;
  progress: Record<TeamId, { placed: number; total: number }>;
  myTeam: TeamId;
  onStart: () => void;
}) {
  const now = useNow(race.status === "racing");

  const winnerInfo = race.winner ? TEAMS.find((t) => t.id === race.winner) : null;

  let elapsedMs = 0;
  if (race.startedAt && race.status !== "waiting") {
    const clockEnd =
      race.status === "finished" && race.winner ? race.finishedAt?.[race.winner] : null;
    elapsedMs = (clockEnd ?? now) - race.startedAt;
  }

  return (
    <div className="border-b border-violet-500/15 bg-slate-900/80 px-4 py-2.5 backdrop-blur">
      {race.status === "waiting" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400">
            Esperando que arranque la carrera — las piezas están bloqueadas hasta entonces.
          </p>
          <button
            onClick={onStart}
            className="rounded-lg bg-emerald-500 px-4 py-1.5 text-sm font-medium text-white shadow-[0_0_18px_rgba(52,211,153,0.45)] transition hover:bg-emerald-400"
          >
            🚀 Iniciar carrera
          </button>
        </div>
      )}

      {race.status !== "waiting" && (
        <div className="flex flex-wrap items-center gap-4">
          {race.status === "finished" && winnerInfo ? (
            <span className="whitespace-nowrap rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
              🏆 Ganó {winnerInfo.label} en {formatElapsed(elapsedMs)}
            </span>
          ) : (
            <span className="whitespace-nowrap font-mono text-sm text-slate-300">
              ⏱ {formatElapsed(elapsedMs)}
            </span>
          )}
          <div className="flex flex-1 flex-col gap-1.5 sm:min-w-[260px]">
            {TEAMS.map((team) => (
              <TeamProgress
                key={team.id}
                label={team.label}
                color={team.color}
                placed={progress[team.id]?.placed ?? 0}
                total={progress[team.id]?.total ?? 0}
                isMine={team.id === myTeam}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
