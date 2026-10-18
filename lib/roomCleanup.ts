import { endAt, get, limitToFirst, orderByValue, query, ref, set, update } from "firebase/database";
import { getDb } from "./firebase";
import { serverNow } from "./serverTime";

/**
 * Keeps the database tidy without a backend: rooms nobody used for
 * `MAX_IDLE_DAYS` are deleted by the visitors' own browsers.
 *
 * - `rooms/_index/{roomId}` holds each room's last activity (ms). It's a
 *   plain number per room so finding old rooms never downloads a room
 *   itself. Presence (`joinPresence`) touches it on entering, every
 *   `TOUCH_EVERY_MS` while connected and on disconnect. `_index` can't
 *   clash with a room: codes are six uppercase letters/digits.
 * - `cleanupOldRooms` runs from the home and the lobbies (at most once per
 *   `RUN_EVERY_MS` per browser): it deletes up to `BATCH` idle rooms whose
 *   presence is empty, and indexes up to `BATCH` rooms from before the index
 *   (by their `meta/createdAt`, or 0 if they have none).
 *
 * Photos in Storage aren't deleted here (the Storage rules don't allow it):
 * the bucket's lifecycle rule (`storage-lifecycle.json`) removes old files.
 */

export const MAX_IDLE_DAYS = 3;
const MAX_IDLE_MS = MAX_IDLE_DAYS * 24 * 60 * 60 * 1000;
export const TOUCH_EVERY_MS = 30 * 60 * 1000;
const RUN_EVERY_MS = 30 * 60 * 1000;
const BATCH = 25;
const INDEX = "rooms/_index";
const LAST_RUN_KEY = "salon.limpieza";

export const roomIndexRef = (roomId: string) => ref(getDb(), `${INDEX}/${roomId}`);

/** Marks a room as used now. */
export function touchRoom(roomId: string) {
  return set(roomIndexRef(roomId), serverNow()).catch(() => {});
}

/** Room codes in the database, without downloading the rooms (REST `shallow`). */
async function roomCodes(): Promise<string[]> {
  const base = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL?.replace(/\/$/, "");
  if (!base) return [];
  const res = await fetch(`${base}/rooms.json?shallow=true`);
  if (!res.ok) return [];
  const keys = Object.keys(((await res.json()) as Record<string, true> | null) ?? {});
  return keys.filter((k) => k !== "_index");
}

/** Adds rooms from before the index, dated by when they were created. */
async function backfill(indexed: Set<string>) {
  const missing = (await roomCodes()).filter((code) => !indexed.has(code)).slice(0, BATCH);
  const db = getDb();
  const entries = await Promise.all(
    missing.map(async (code) => {
      const created = (await get(ref(db, `rooms/${code}/meta/createdAt`))).val();
      return [`${INDEX}/${code}`, typeof created === "number" ? created : 0] as const;
    })
  );
  if (entries.length) await update(ref(db), Object.fromEntries(entries));
}

/** Deletes rooms idle for longer than `MAX_IDLE_DAYS`, a batch at a time. */
async function deleteIdle() {
  const db = getDb();
  const cutoff = serverNow() - MAX_IDLE_MS;
  const old = await get(query(ref(db, INDEX), orderByValue(), endAt(cutoff), limitToFirst(BATCH)));
  const changes: Record<string, unknown> = {};
  await Promise.all(
    Object.keys((old.val() as Record<string, number> | null) ?? {}).map(async (code) => {
      // Someone is in it (e.g. a tab left open): it's alive, just refresh it.
      const present = (await get(ref(db, `rooms/${code}/presence`))).exists();
      if (present) changes[`${INDEX}/${code}`] = serverNow();
      else {
        changes[`rooms/${code}`] = null;
        changes[`${INDEX}/${code}`] = null;
      }
    })
  );
  if (Object.keys(changes).length) await update(ref(db), changes);
}

/** One cleanup pass, unless this browser ran one recently. Never throws. */
export async function cleanupOldRooms() {
  try {
    const last = Number(localStorage.getItem(LAST_RUN_KEY) ?? 0);
    if (Date.now() - last < RUN_EVERY_MS) return;
    localStorage.setItem(LAST_RUN_KEY, String(Date.now()));
  } catch {
    return;
  }
  try {
    const indexed = (await get(ref(getDb(), INDEX))).val() as Record<string, number> | null;
    await backfill(new Set(Object.keys(indexed ?? {})));
    await deleteIdle();
  } catch (err) {
    // Housekeeping must never bother anyone playing.
    console.warn("No se pudo limpiar salas viejas", err);
  }
}
