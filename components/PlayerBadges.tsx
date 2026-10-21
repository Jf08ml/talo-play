"use client";

import type { PresenceMap } from "@/lib/presence";

const MAX_SHOWN = 4;

export default function PlayerBadges({
  presence,
  myClientId,
}: {
  presence: PresenceMap;
  myClientId: string;
}) {
  const entries = Object.entries(presence);
  // A long row of avatars would push the header to a second line on phones.
  const shown = entries.length > MAX_SHOWN ? entries.slice(0, MAX_SHOWN - 1) : entries;
  const hidden = entries.length - shown.length;

  return (
    <div className="flex items-center -space-x-2">
      {shown.map(([id, info]) => (
        <div
          key={id}
          title={id === myClientId ? `${info.name} (vos)` : info.name}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-900 text-xs font-semibold text-white shadow sm:h-8 sm:w-8"
          style={{ backgroundColor: info.color, boxShadow: `0 0 10px 0 ${info.color}88` }}
        >
          {info.name?.slice(0, 1).toUpperCase() || "?"}
        </div>
      ))}
      {hidden > 0 && (
        <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-900 bg-slate-700 text-[10px] font-semibold text-slate-200 sm:h-8 sm:w-8">
          +{hidden}
        </div>
      )}
      <span className="pl-3.5 text-sm text-slate-400">
        <span className="sm:hidden">{entries.length}</span>
        <span className="hidden sm:inline">
          {entries.length} {entries.length === 1 ? "jugador" : "jugadores"} conectado
          {entries.length === 1 ? "" : "s"}
        </span>
      </span>
    </div>
  );
}
