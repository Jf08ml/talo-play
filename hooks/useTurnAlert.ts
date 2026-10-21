"use client";

import { useEffect, useRef } from "react";
import { playSound } from "@/lib/sfx";

const ALERT_TITLE = "🔔 ¡Te toca!";

/**
 * Tells the player it's their turn when they may not be looking: a short
 * vibration and a chime as the turn arrives, and while the tab is in the background the
 * title blinks "¡Te toca!" (back to normal once they return or the turn passes).
 */
export function useTurnAlert(myTurn: boolean) {
  const wasMyTurn = useRef(myTurn);

  useEffect(() => {
    if (myTurn && !wasMyTurn.current) {
      navigator.vibrate?.([70, 50, 70]);
      playSound("turn");
    }
    wasMyTurn.current = myTurn;
    if (!myTurn) return;

    const original = document.title;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
      document.title = original;
    };
    const update = () => {
      if (!document.hidden) return stop();
      if (timer) return;
      document.title = ALERT_TITLE;
      timer = setInterval(() => {
        document.title = document.title === ALERT_TITLE ? original : ALERT_TITLE;
      }, 1000);
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      stop();
    };
  }, [myTurn]);
}
