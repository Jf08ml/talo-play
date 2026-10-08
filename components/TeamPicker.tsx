"use client";

import { TEAMS, type TeamId } from "@/lib/teams";
import type { PresenceMap } from "@/lib/presence";

export default function TeamPicker({
  presence,
  onPick,
}: {
  presence: PresenceMap;
  onPick: (team: TeamId) => void;
}) {
  const counts: Record<TeamId, number> = { red: 0, blue: 0 };
  for (const info of Object.values(presence)) {
    if (info.team === "red" || info.team === "blue") counts[info.team]++;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-violet-500/20 bg-slate-900 p-6 shadow-[0_0_40px_rgba(139,92,246,0.2)]">
        <h2 className="text-center font-display text-lg font-semibold text-slate-100">
          ⚔️ Elegí tu equipo
        </h2>
        <p className="mt-1 text-center text-sm text-slate-400">
          Cada equipo arma su propia copia del rompecabezas. ¡Gana el más rápido!
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {TEAMS.map((team) => (
            <button
              key={team.id}
              onClick={() => onPick(team.id)}
              className="flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition hover:brightness-125"
              style={{
                borderColor: team.color,
                backgroundColor: `${team.color}1a`,
                boxShadow: `0 0 20px 0 ${team.color}33`,
              }}
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full text-xl"
                style={{ backgroundColor: team.color, boxShadow: `0 0 16px 0 ${team.color}99` }}
              >
                {team.id === "red" ? "🔴" : "🔵"}
              </span>
              <span className="font-medium text-slate-100">{team.label}</span>
              <span className="text-xs text-slate-400">
                {counts[team.id]} {counts[team.id] === 1 ? "jugador" : "jugadores"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
