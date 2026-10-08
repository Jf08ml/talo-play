"use client";

import { useEffect, useState } from "react";
import { joinPresence, subscribePresence, type PresenceMap } from "@/lib/presence";

/**
 * Joins a room's presence list while `me` is set and returns everyone
 * connected. Re-joins if the name or color changes.
 */
export function useRoomPresence(
  roomId: string,
  me: { clientId: string; name: string; color: string } | null
): PresenceMap {
  const [presence, setPresence] = useState<PresenceMap>({});
  const clientId = me?.clientId;
  const name = me?.name;
  const color = me?.color;

  useEffect(() => {
    if (!clientId || !name || !color) return;
    const leave = joinPresence(roomId, clientId, { name, color });
    const unsub = subscribePresence(roomId, setPresence);
    return () => {
      leave();
      unsub();
    };
  }, [roomId, clientId, name, color]);

  return presence;
}
