import { ref, runTransaction } from "firebase/database";
import { getDb } from "./firebase";

/**
 * Runs `fn` on a game's shared state inside an RTDB transaction. `normalize`
 * turns the raw value into a full state (or null if it doesn't exist yet);
 * `fn` returns the next state, or null to leave it untouched.
 *
 * Normalizers must give every field a concrete value: RTDB drops empty
 * arrays/objects on write and rejects `undefined`.
 */
export function transactState<S>(
  path: string,
  normalize: (raw: Partial<S> | null) => S | null,
  fn: (state: S) => S | null
) {
  return runTransaction(ref(getDb(), path), (raw: Partial<S> | null) => {
    const state = normalize(raw);
    // No local copy yet: return the raw value so the SDK fetches the real one and retries.
    if (!state) return raw;
    return fn(state) ?? undefined;
  });
}
