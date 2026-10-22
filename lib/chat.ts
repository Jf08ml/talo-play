import { limitToLast, onValue, push, query, ref, serverTimestamp, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";

/**
 * The room's text chat (`components/ChatButton.tsx`): plain pushes to
 * `rooms/{id}/chat`, outside any game state, deleted with the room by the old
 * rooms cleanup. Only the last `KEEP` messages are read.
 */

export const MAX_CHARS = 200;
const KEEP = 60;

export interface ChatMessage {
  id: string;
  by: string;
  name: string;
  color: string;
  text: string;
  /** Server time (ms); a message just sent has none until the server confirms it. */
  at: number;
}

export const QUICK_PHRASES = ["¡Bien jugado!", "Te toca", "¡Una más!", "Ya vuelvo", "Jajaja", "👍", "😂", "🔥", "👏", "😮"];

export function subscribeChat(roomId: string, cb: (messages: ChatMessage[]) => void): Unsubscribe {
  return onValue(query(ref(getDb(), `rooms/${roomId}/chat`), limitToLast(KEEP)), (snap) => {
    const messages: ChatMessage[] = [];
    snap.forEach((child) => {
      const v = child.val() as Partial<ChatMessage> | null;
      if (v && typeof v.text === "string" && typeof v.by === "string") {
        messages.push({
          id: child.key ?? "",
          by: v.by,
          name: typeof v.name === "string" ? v.name : "Jugador",
          color: typeof v.color === "string" ? v.color : "#999",
          text: v.text.slice(0, MAX_CHARS),
          at: typeof v.at === "number" ? v.at : Date.now(),
        });
      }
    });
    cb(messages);
  });
}

/** Between two messages of the same player, against flooding. */
const MIN_GAP_MS = 700;
let lastSent = 0;

export function sendChat(roomId: string, from: { by: string; name: string; color: string }, text: string) {
  const clean = text.trim().slice(0, MAX_CHARS);
  const now = Date.now();
  if (!clean || now - lastSent < MIN_GAP_MS) return Promise.resolve();
  lastSent = now;
  return push(ref(getDb(), `rooms/${roomId}/chat`), { ...from, text: clean, at: serverTimestamp() });
}
