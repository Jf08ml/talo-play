"use client";

import { useEffect, useState } from "react";
import { NEUTRAL, reduceTalos, type PublicGameEvent, type TaloState } from "@/lib/taloEvents";
import { playerTalo } from "@/lib/talos";
import { Talo } from "./Talo";

export interface TablePlayer {
  id: string;
  name: string;
  color: string;
}

const REACTION_MS = 2600;

/**
 * "En la mesa": the room's players as talos standing in a row, plus dashed
 * empty places (`open`). When someone new appears, the rest look at them,
 * happy, and the newcomer hops: the only event here is a public join.
 */
export default function TaloTable({
  players,
  hostId,
  myId,
  open = 0,
  tagInk = "#111111",
}: {
  players: TablePlayer[];
  hostId?: string;
  myId: string;
  open?: number;
  /** Text color for the name tags (the band's ink). */
  tagInk?: string;
}) {
  const ids = players.map((p) => p.id);
  const key = ids.join(",");
  // Derived from the previous render (no effect): who just arrived.
  const [seen, setSeen] = useState(key);
  const [reaction, setReaction] = useState<{ state: TaloState; newcomer: string } | null>(null);
  if (seen !== key) {
    const before = new Set(seen.split(","));
    const newcomer = ids.find((id) => !before.has(id));
    setSeen(key);
    if (newcomer && seen) {
      const ev: PublicGameEvent = { type: "player_joined", playerId: newcomer };
      setReaction({ state: reduceTalos(ids, {}, ev), newcomer });
    }
  }

  useEffect(() => {
    if (!reaction) return;
    const t = setTimeout(() => setReaction(null), REACTION_MS);
    return () => clearTimeout(t);
  }, [reaction]);

  const total = players.length + open;
  const size = total <= 4 ? 76 : total <= 8 ? 64 : 52;
  const center = (players.length - 1) / 2;

  return (
    <ul aria-label="Jugadores" className="flex flex-wrap items-end justify-center gap-x-3 gap-y-5 sm:gap-x-6">
      {players.map((p, i) => {
        const r = reaction?.state[p.id] ?? NEUTRAL;
        const target = r.lookAt ? ids.indexOf(r.lookAt) : -1;
        // Looking at someone: toward their side of the row. Idle: toward the middle.
        const look: [number, number] =
          target >= 0 ? [Math.sign(target - i) || 0, -0.2] : [Math.max(-1, Math.min(1, (center - i) * 0.6)), -0.15];
        const t = playerTalo(p.id, p.color, size);
        const host = p.id === hostId;
        return (
          <li key={p.id} className="flex flex-col items-center gap-2">
            <span
              className="max-w-[9rem] truncate rounded-md px-2 py-0.5 text-sm font-bold"
              style={host ? { background: "#111111", color: "#FFFFFF" } : { color: tagInk }}
            >
              {p.id === myId ? "Vos" : p.name}
              {host && " · anfitrión"}
            </span>
            <span className={reaction?.newcomer === p.id ? "talo-hop" : "inline-block"}>
              <Talo
                w={t.w}
                h={t.h}
                color={t.color}
                radius={t.radius}
                expr={r.expr}
                look={look}
                blinkDelay={`${(i * 1.9) % 6}s`}
                label={p.name}
              />
            </span>
          </li>
        );
      })}
      {Array.from({ length: open }, (_, i) => (
        <li key={`open-${i}`} className="flex flex-col items-center gap-2 opacity-70">
          <span className="px-2 py-0.5 text-sm font-bold" style={{ color: tagInk }}>
            Esperando…
          </span>
          <Talo
            w={Math.round(size * 0.78)}
            h={size}
            color="rgba(17,17,17,0.14)"
            radius={`${size * 0.39}px ${size * 0.39}px ${size * 0.14}px ${size * 0.14}px`}
            style={{ outline: "2px dashed rgba(17,17,17,0.35)", outlineOffset: -2, borderRadius: `${size * 0.39}px ${size * 0.39}px ${size * 0.14}px ${size * 0.14}px` }}
          />
        </li>
      ))}
    </ul>
  );
}
