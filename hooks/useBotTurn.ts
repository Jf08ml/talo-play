import { useEffect, useRef } from "react";
import { botDelay } from "@/lib/boardBot";

/**
 * Plays the computer's move after a short "thinking" pause while `active`
 * (it's the bot's turn). `moveKey` changes with every move, so each turn is
 * scheduled once. Every client in the room schedules it; the game's
 * move-count guard lets only the first one through.
 */
export function useBotTurn(active: boolean, moveKey: string | number, play: () => unknown) {
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
    }, botDelay());
    return () => clearTimeout(t);
  }, [active, moveKey]);
}
