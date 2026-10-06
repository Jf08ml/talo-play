"use client";

import type { PresenceMap } from "@/lib/presence";

export default function PlayerBadges({
  presence,
  myClientId,
}: {
  presence: PresenceMap;
  myClientId: string;
}) {
  const entries = Object.entries(presence);

  return (
    <div className="flex items-center -space-x-2">
      {entries.map(([id, info]) => (
        <div
          key={id}
          title={id === myClientId ? `${info.name} (vos)` : info.name}
          className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-900 text-xs font-semibold text-white shadow"
          style={{ backgroundColor: info.color, boxShadow: `0 0 10px 0 ${info.color}88` }}
        >
          {info.name?.slice(0, 1).toUpperCase() || "?"}
        </div>
      ))}
      <span className="pl-4 text-sm text-slate-400">
        <span className="sm:hidden">{entries.length}</span>
        <span className="hidden sm:inline">
          {entries.length} {entries.length === 1 ? "jugador" : "jugadores"} conectado
          {entries.length === 1 ? "" : "s"}
        </span>
      </span>
    </div>
  );
}
