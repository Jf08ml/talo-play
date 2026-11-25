import { limitToLast, onValue, push, query, ref, serverTimestamp, set, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { notify } from "./push";

/**
 * Chats between friends (`/amigos`): `dms/{a}/{b}/{pushId}` with the two uids
 * sorted (a < b), `{from, text, at}`. Only those two can read it, and only
 * while they're friends can they write (`database.rules.json`).
 * `dmSeen/{me}/{other}` = when I last read that chat, for the unread dots.
 */

export const DM_MAX_CHARS = 500;
const KEEP = 60;

export interface DirectMessage {
  id: string;
  from: string;
  text: string;
  at: number;
}

const pair = (a: string, b: string) => (a < b ? `${a}/${b}` : `${b}/${a}`);

export function subscribeDm(me: string, other: string, cb: (messages: DirectMessage[]) => void): Unsubscribe {
  return onValue(query(ref(getDb(), `dms/${pair(me, other)}`), limitToLast(KEEP)), (snap) => {
    const out: DirectMessage[] = [];
    snap.forEach((child) => {
      const v = child.val() as Partial<DirectMessage> | null;
      if (v && typeof v.text === "string" && typeof v.from === "string") {
        out.push({ id: child.key ?? "", from: v.from, text: v.text.slice(0, DM_MAX_CHARS), at: typeof v.at === "number" ? v.at : Date.now() });
      }
    });
    cb(out);
  });
}

export function sendDm(me: string, other: string, text: string) {
  const clean = text.trim().slice(0, DM_MAX_CHARS);
  if (!clean) return Promise.resolve();
  return push(ref(getDb(), `dms/${pair(me, other)}`), { from: me, text: clean, at: serverTimestamp() }).then(() => notify("dm", other, { text: clean }));
}

export function markSeen(me: string, other: string) {
  return set(ref(getDb(), `dmSeen/${me}/${other}`), serverTimestamp()).catch(() => {});
}

/** The last message of my chat with `other` (or null). */
export function subscribeLastDm(me: string, other: string, cb: (last: DirectMessage | null) => void): Unsubscribe {
  return onValue(query(ref(getDb(), `dms/${pair(me, other)}`), limitToLast(1)), (snap) => {
    let last: DirectMessage | null = null;
    snap.forEach((child) => {
      const v = child.val() as Partial<DirectMessage> | null;
      if (v && typeof v.from === "string") last = { id: child.key ?? "", from: v.from, text: String(v.text ?? ""), at: typeof v.at === "number" ? v.at : 0 };
    });
    cb(last);
  });
}

export function subscribeSeen(me: string, cb: (seen: Record<string, number>) => void): Unsubscribe {
  return onValue(ref(getDb(), `dmSeen/${me}`), (snap) => cb((snap.val() as Record<string, number> | null) ?? {}));
}
