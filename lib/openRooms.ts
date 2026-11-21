import { onDisconnect, onValue, ref, remove, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { GAMES, type GameId } from "./games";
import { serverNow } from "./serverTime";
import { subscribeCalls } from "./plaza";

/**
 * Open rooms: who can walk into a room.
 *
 * - `rooms/{id}/meta/access` — "privada" (the default, also when absent):
 *   only with the link or the code, or while it asks the Plaza for people
 *   ("Buscar gente", `plaza/calls`). "abierta": listed in "Salas abiertas"
 *   (home, the game's lobby, the Plaza) the whole time, also mid-game, and
 *   anyone can walk in (each game already seats or seats-next-round whoever
 *   arrives late).
 * - `openRooms/{id}` — the listing of an open room: game, how many are in,
 *   waiting or playing, whose room. There's no backend, so the room keeps it
 *   alive itself: the connected player with the lowest id rewrites it every
 *   `BEAT_MS` (and when the count or the phase changes); readers skip
 *   entries older than `TTL_MS` and delete the very old ones. The rules only
 *   accept it while the room's meta says "abierta".
 */

export type RoomAccess = "privada" | "abierta";

export const BEAT_MS = 60 * 1000;
const TTL_MS = 3 * 60 * 1000;
const DELETE_AFTER_MS = 30 * 60 * 1000;

const db = () => getDb();

export function subscribeAccess(roomId: string, cb: (access: RoomAccess) => void): Unsubscribe {
  return onValue(ref(db(), `rooms/${roomId}/meta/access`), (snap) => cb(snap.val() === "abierta" ? "abierta" : "privada"));
}

export interface OpenEntry {
  game: GameId;
  count: number;
  playing: boolean;
  name: string;
  color: string;
  by: string;
}

function entryValue(e: OpenEntry) {
  return {
    game: e.game,
    count: Math.max(0, Math.min(99, e.count)),
    playing: e.playing,
    name: (e.name || "Alguien").slice(0, 24),
    color: e.color.slice(0, 16),
    by: e.by.slice(0, 32),
    at: serverTimestamp(),
  };
}

/** Opens or closes the room; opening lists it at once. */
export function setAccess(roomId: string, access: RoomAccess, entry: OpenEntry) {
  return update(ref(db()), {
    [`rooms/${roomId}/meta/access`]: access,
    [`openRooms/${roomId}`]: access === "abierta" ? entryValue(entry) : null,
  });
}

/** Keeps an open room listed (see `BEAT_MS`). */
export function beatOpenRoom(roomId: string, entry: OpenEntry) {
  return set(ref(db(), `openRooms/${roomId}`), entryValue(entry)).catch(() => {});
}

/**
 * While I keep a room listed, closing my tab takes it off the list: if others
 * stay, the next one in line lists it again at once (the count changed).
 */
export function unlistOnDisconnect(roomId: string): () => void {
  const r = ref(db(), `openRooms/${roomId}`);
  onDisconnect(r).remove().catch(() => {});
  return () => {
    onDisconnect(r).cancel().catch(() => {});
  };
}

/** Calls back when the room's listing is gone (someone else took it down while I'm still here). */
export function onUnlisted(roomId: string, cb: () => void): Unsubscribe {
  return onValue(ref(db(), `openRooms/${roomId}`), (snap) => {
    if (!snap.exists()) cb();
  });
}

/** The last one left the room: off the list now, not when it goes stale. */
export function unlistRoom(roomId: string) {
  return remove(ref(db(), `openRooms/${roomId}`)).catch(() => {});
}

/** A room someone can walk into: open, or asking the Plaza for people. */
export interface ListedRoom {
  room: string;
  game: GameId;
  count: number;
  playing: boolean;
  name: string;
  color: string;
  by: string;
  at: number;
  /** Open all the time ("abierta") or only while it looks for people ("busca"). */
  kind: "abierta" | "busca";
}

function str(v: unknown, max: number, fallback = ""): string {
  return typeof v === "string" && v ? v.slice(0, max) : fallback;
}

function subscribeOpen(cb: (rooms: ListedRoom[]) => void): Unsubscribe {
  let cleaned = false;
  return onValue(ref(db(), "openRooms"), (snap) => {
    const now = serverNow();
    const out: ListedRoom[] = [];
    const stale: Record<string, null> = {};
    snap.forEach((child) => {
      const v = child.val() as Record<string, unknown> | null;
      const room = child.key ?? "";
      const at = typeof v?.at === "number" ? v.at : 0;
      if (now - at > DELETE_AFTER_MS) stale[`openRooms/${room}`] = null;
      if (!v || typeof v.game !== "string" || !(v.game in GAMES) || now - at > TTL_MS) return;
      out.push({
        room,
        game: v.game as GameId,
        count: typeof v.count === "number" ? v.count : 1,
        playing: v.playing === true,
        name: str(v.name, 24, "Alguien"),
        color: str(v.color, 16, "#999"),
        by: str(v.by, 32),
        at,
        kind: "abierta",
      });
    });
    // No backend: whoever reads the list sweeps rooms nobody kept alive.
    if (!cleaned && Object.keys(stale).length) {
      cleaned = true;
      update(ref(db()), stale).catch(() => {});
    }
    cb(out);
  });
}

/**
 * Every room one can walk into now: open rooms plus waiting rooms asking the
 * Plaza for people. Waiting ones first, then the fuller ones.
 */
export function subscribeListedRooms(cb: (rooms: ListedRoom[]) => void): Unsubscribe {
  let open: ListedRoom[] = [];
  let calls: ListedRoom[] = [];
  const emit = () => {
    const byRoom = new Map<string, ListedRoom>();
    for (const c of calls) byRoom.set(c.room, c);
    // An open room that also asks for people shows once, as open (it's live).
    for (const o of open) byRoom.set(o.room, o);
    cb(
      [...byRoom.values()].sort(
        (a, b) => Number(a.playing) - Number(b.playing) || b.count - a.count || b.at - a.at
      )
    );
  };
  const a = subscribeOpen((rooms) => {
    open = rooms;
    emit();
  });
  const b = subscribeCalls((list) => {
    calls = list.map((c) => ({ ...c, playing: false, kind: "busca" as const }));
    emit();
  });
  return () => {
    a();
    b();
  };
}

// ---- Is this tab in a waiting room? (the open room's listing says so) -------------

const waiting = new Map<string, number>();
const listeners = new Set<() => void>();

/** The waiting room marks its room as waiting while it's on screen. */
export function markWaiting(roomId: string): () => void {
  waiting.set(roomId, (waiting.get(roomId) ?? 0) + 1);
  listeners.forEach((l) => l());
  return () => {
    const n = (waiting.get(roomId) ?? 1) - 1;
    if (n <= 0) waiting.delete(roomId);
    else waiting.set(roomId, n);
    listeners.forEach((l) => l());
  };
}

export function subscribeWaiting(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function isWaiting(roomId: string): boolean {
  return waiting.has(roomId);
}
