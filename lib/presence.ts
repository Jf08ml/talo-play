import {
  ref,
  onValue,
  onDisconnect,
  set,
  remove,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/database";
import { getDb } from "./firebase";
import type { TeamId } from "./teams";
import { TOUCH_EVERY_MS, roomIndexRef, touchRoom } from "./roomCleanup";

export interface PresenceInfo {
  name: string;
  color: string;
  joinedAt: number | object;
  team?: TeamId;
}

export type PresenceMap = Record<string, PresenceInfo>;

/**
 * Registers this client's presence in the room and wires up onDisconnect
 * cleanup. Returns an unsubscribe function that removes presence immediately
 * (call it on deliberate leave / unmount).
 *
 * It also keeps the room's last activity (`lib/roomCleanup.ts`) fresh: on
 * entering, every half hour while here and when the connection drops, so a
 * room in use is never cleaned up.
 */
export function joinPresence(
  roomId: string,
  clientId: string,
  info: { name: string; color: string; team?: TeamId }
): () => void {
  const db = getDb();
  const myRef = ref(db, `rooms/${roomId}/presence/${clientId}`);
  const connectedRef = ref(db, ".info/connected");

  const unsubConnected = onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
      touchRoom(roomId);
      onDisconnect(roomIndexRef(roomId)).set(serverTimestamp()).catch(() => {});
      onDisconnect(myRef)
        .remove()
        .then(() => {
          const payload: PresenceInfo = {
            name: info.name,
            color: info.color,
            joinedAt: serverTimestamp(),
          };
          if (info.team) payload.team = info.team;
          set(myRef, payload);
        });
    }
  });

  const touching = setInterval(() => touchRoom(roomId), TOUCH_EVERY_MS);

  return () => {
    clearInterval(touching);
    unsubConnected();
    remove(myRef);
    touchRoom(roomId);
  };
}

export function subscribePresence(
  roomId: string,
  cb: (presence: PresenceMap) => void
): Unsubscribe {
  const db = getDb();
  return onValue(ref(db, `rooms/${roomId}/presence`), (snap) => {
    cb((snap.val() as PresenceMap) ?? {});
  });
}
