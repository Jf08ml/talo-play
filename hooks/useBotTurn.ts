import { useEffect, useRef } from "react";
import { botDelay } from "@/lib/boardBot";
import { joinPresence } from "@/lib/presence";

/**
 * Plays the computer's move after a human-like pause while `active` (it's the
 * bot's turn). `moveKey` changes with every move, so each turn is scheduled
 * once; `scale` stretches the pause (see `botDelay`). Every client in the
 * room schedules it; the game's move-count guard lets only the first through.
 */
export function useBotTurn(active: boolean, moveKey: string | number, play: () => unknown, scale = 1) {
  const playRef = useRef(play);
  useEffect(() => {
    playRef.current = play;
  });
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => {
      Promise.resolve()
        .then(() => playRef.current())
        .catch(console.error);
    }, botDelay(scale));
    return () => clearTimeout(t);
  }, [active, moveKey, scale]);
}

/**
 * Keeps the bot in the room's presence while I'm playing against it, so it
 * shows as connected like anyone else (and leaves with me).
 */
export function useBotPresence(roomId: string, botId: string, player: { name: string; color: string } | undefined, mine: boolean) {
  const name = player?.name ?? "";
  const color = player?.color ?? "";
  useEffect(() => {
    if (!botId || !name || !mine) return;
    return joinPresence(roomId, botId, { name, color });
  }, [roomId, botId, name, color, mine]);
}
