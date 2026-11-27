import { get, ref, set } from "firebase/database";
import { getDb } from "./firebase";
import { loadCarProgress, mergeCarProgress, storeCarProgress, type CarrerasProgress } from "./carrerasProgress";

/**
 * Carreras' progress on the account (`carrerasProgress/{uid}`, only its owner
 * reads and writes it), like Arena's: the copy with more experience wins.
 */

const path = (uid: string) => `carrerasProgress/${uid}`;

function wire(p: CarrerasProgress) {
  return { xp: Math.floor(p.xp), look: p.look, day: p.day, missions: p.missions, done: p.done, races: p.races, wins: p.wins };
}

/** Brings the account's copy here (if it's ahead) or sends this one up (if this one is). */
export async function syncCarProgress(uid: string): Promise<CarrerasProgress> {
  const local = loadCarProgress();
  const snap = await get(ref(getDb(), path(uid)));
  const remote = snap.exists() ? (snap.val() as Partial<CarrerasProgress>) : null;
  const merged = mergeCarProgress(local, remote);
  if (merged !== local) storeCarProgress(merged);
  else if (!remote || (remote.xp ?? 0) < local.xp || JSON.stringify(remote.look) !== JSON.stringify(local.look)) await set(ref(getDb(), path(uid)), wire(local));
  return merged;
}

/** After a race or a change of look. */
export function pushCarProgress(uid: string, p: CarrerasProgress) {
  set(ref(getDb(), path(uid)), wire(p)).catch(console.error);
}
