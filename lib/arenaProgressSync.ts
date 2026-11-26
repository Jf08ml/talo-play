import { get, ref, set } from "firebase/database";
import { getDb } from "./firebase";
import { loadProgress, mergeProgress, storeProgress, type ArenaProgress } from "./arenaProgress";

/**
 * Arena medieval's progress on the account (`arenaProgress/{uid}`, only its
 * owner reads and writes it): signed in, the progress follows you to other
 * devices. The copy with more experience wins (`mergeProgress`), so playing
 * on two devices never loses a level.
 */

const path = (uid: string) => `arenaProgress/${uid}`;

/** What goes up: just the progress, nothing else. */
function wire(p: ArenaProgress) {
  return { xp: Math.floor(p.xp), look: p.look, day: p.day, challenges: p.challenges, done: p.done, matches: p.matches, wins: p.wins, kos: p.kos };
}

/** Brings the account's copy here (if it's ahead) or sends this one up (if this one is). */
export async function syncProgress(uid: string): Promise<ArenaProgress> {
  const local = loadProgress();
  const snap = await get(ref(getDb(), path(uid)));
  const remote = snap.exists() ? (snap.val() as Partial<ArenaProgress>) : null;
  const merged = mergeProgress(local, remote);
  if (merged !== local) storeProgress(merged);
  else if (!remote || (remote.xp ?? 0) < local.xp || JSON.stringify(remote.look) !== JSON.stringify(local.look)) await set(ref(getDb(), path(uid)), wire(local));
  return merged;
}

/** After a match or a change of look. */
export function pushProgress(uid: string, p: ArenaProgress) {
  set(ref(getDb(), path(uid)), wire(p)).catch(console.error);
}
