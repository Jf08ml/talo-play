import { onValue, ref, runTransaction, update, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";
import { makeSeed } from "./random";

/**
 * A room's settings after creation. Every game keeps them in `rooms/{id}/meta`
 * (some also copy them into their state); clients follow the meta live with
 * `watchRoomMeta`, so a change made in the waiting room shows up for everyone.
 *
 * Settings change only while the game's state is `waiting` (or anytime for
 * endless games, `anyStatus`). `backToWaiting` brings a finished game back to
 * the waiting room so the host can change them before the next one.
 */

/** Follows a room's meta; `cb(null)` if the room doesn't exist. */
export function watchRoomMeta<M>(
  roomId: string,
  cb: (meta: Partial<M> | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onValue(
    ref(getDb(), `rooms/${roomId}/meta`),
    (snap) => cb(snap.exists() ? (snap.val() as Partial<M>) : null),
    onError
  );
}

type Raw = Record<string, unknown> & { status?: string; gameNo?: number };

/** RTDB rejects `undefined`; `null` deletes the key. */
function clean(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === undefined ? null : v]));
}

/**
 * Saves new settings: `meta` fields into the room's meta and `state` fields
 * into the game's state at `rooms/{id}/{stateKey}` (e.g. "tutti/state"),
 * only while that state is waiting.
 */
export async function saveRoomSettings(
  roomId: string,
  stateKey: string,
  meta: Record<string, unknown>,
  state: Record<string, unknown> = {},
  { anyStatus = false }: { anyStatus?: boolean } = {}
): Promise<void> {
  const res = await runTransaction(ref(getDb(), `rooms/${roomId}/${stateKey}`), (raw: Raw | null) => {
    // No local copy yet: return it as is so the SDK fetches the real one and retries.
    if (!raw) return raw;
    if (!anyStatus && raw.status !== "waiting") return undefined;
    return { ...raw, ...clean(state) };
  });
  if (!res.committed) throw new Error("La partida ya empezó: la configuración se cambia en la sala de espera.");
  await update(ref(getDb(), `rooms/${roomId}/meta`), clean(meta));
}

/**
 * Back to the waiting room after a game (to change settings or let people in).
 * Starting again builds a fresh game, as on the first start; games with a
 * seed get a new one, so the next game isn't a copy of the last.
 */
export function backToWaiting(roomId: string, stateKey: string, expectedGameNo?: number) {
  return runTransaction(ref(getDb(), `rooms/${roomId}/${stateKey}`), (raw: Raw | null) => {
    if (!raw) return raw;
    if (raw.status === "waiting") return undefined;
    if (expectedGameNo !== undefined && (raw.gameNo ?? 0) !== expectedGameNo) return undefined;
    const seed = typeof raw.seed === "number" ? { seed: makeSeed() } : {};
    return { ...raw, ...seed, status: "waiting", gameNo: (raw.gameNo ?? 0) + 1 };
  });
}
