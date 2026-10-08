import { onValue, ref } from "firebase/database";
import { getDb } from "./firebase";

/**
 * Server-aligned clock. Timestamps written for timers (turn deadlines, race
 * clocks) use this instead of Date.now(), so players whose computer clocks
 * disagree still see the same countdown.
 */

let offset = 0;
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  onValue(ref(getDb(), ".info/serverTimeOffset"), (snap) => {
    offset = (snap.val() as number | null) ?? 0;
  });
}

export function serverNow(): number {
  listen();
  return Date.now() + offset;
}
