import {
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import {
  get,
  limitToLast,
  onDisconnect,
  onValue,
  push,
  query,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update,
  type Unsubscribe,
} from "firebase/database";
import { getAuthInstance, getDb } from "./firebase";
import { generateRoomCode } from "./ids";
import type { GameId } from "./games";

/**
 * Accounts and friends (optional: playing never needs one). Signing in is
 * Google through Firebase Auth; everything else lives in the Realtime
 * Database, guarded by `database.rules.json`:
 *
 * - `profiles/{uid}` — public card: `name`, `clientId` (the player id the
 *   account plays with on every device, so the talo and color match) and
 *   `code`, the friend code. `codes/{code}` = uid, to find someone by code.
 * - `requests/{to}/{from}` — a pending friend request; `friends/{a}/{b}` =
 *   true on both sides once accepted; `blocks/{uid}/{other}` stops requests.
 * - `status/{uid}` — online (removed on disconnect) and the room being
 *   played (`room`, `game`), readable by that user's friends only.
 * - `invites/{to}/{pushId}` — "come play": from, name, room, game. Only a
 *   friend can write one.
 */

export interface Profile {
  name: string;
  clientId: string;
  code: string;
}

export interface Status {
  room?: string;
  game?: GameId;
  at?: number;
}

export interface Invite {
  key: string;
  from: string;
  name: string;
  clientId: string;
  room: string;
  game: GameId;
  at: number;
}

/** Invites older than this aren't shown. */
export const INVITE_TTL_MS = 10 * 60 * 1000;

const db = () => getDb();

// ---- Signing in ---------------------------------------------------------------

export function subscribeAuth(cb: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(getAuthInstance(), cb);
}

/** Apps' own browsers (TikTok, Instagram, Facebook…) where Google refuses to sign in. */
export function inAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /FBAN|FBAV|Instagram|musical_ly|BytedanceWebview|TikTok|Line\/|Snapchat|; wv\)/i.test(navigator.userAgent);
}

export async function signInWithGoogle(): Promise<void> {
  const auth = getAuthInstance();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
      return;
    }
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
    throw err;
  }
}

/** Signs out, first taking down the online status (afterwards the rules wouldn't let us). */
export async function signOutAccount() {
  if (statusUid) {
    const myRef = ref(db(), `status/${statusUid}`);
    statusUid = null;
    await onDisconnect(myRef).cancel().catch(() => {});
    await remove(myRef).catch(() => {});
  }
  await signOut(getAuthInstance());
}

// ---- Profile --------------------------------------------------------------------

export function subscribeProfile(uid: string, cb: (p: Profile | null) => void): Unsubscribe {
  return onValue(
    ref(db(), `profiles/${uid}`),
    (snap) => cb(snap.exists() ? (snap.val() as Profile) : null),
    () => cb(null)
  );
}

export async function getProfile(uid: string): Promise<Profile | null> {
  const snap = await get(ref(db(), `profiles/${uid}`));
  return snap.exists() ? (snap.val() as Profile) : null;
}

/**
 * The account's profile, made on the first sign-in from what this device
 * has: its player id (so the talo stays the same) and its name (or Google's).
 */
export async function ensureProfile(user: User, clientId: string, name: string | null): Promise<Profile> {
  const existing = await getProfile(user.uid);
  if (existing) return existing;
  let code = "";
  for (let i = 0; i < 6 && !code; i++) {
    const candidate = generateRoomCode();
    const res = await runTransaction(ref(db(), `codes/${candidate}`), (cur) => (cur === null ? user.uid : undefined));
    if (res.committed) code = candidate;
  }
  if (!code) throw new Error("No se pudo crear el código de amigo");
  const fallback = (user.displayName ?? "").trim().split(/\s+/)[0] || "Jugador";
  const profile: Profile = { name: (name ?? fallback).slice(0, 24), clientId, code };
  await set(ref(db(), `profiles/${user.uid}`), profile);
  return profile;
}

export function saveProfileName(uid: string, name: string) {
  return set(ref(db(), `profiles/${uid}/name`), name.trim().slice(0, 24));
}

// ---- Friends --------------------------------------------------------------------

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export type AddResult = "sent" | "friends" | "accepted" | "self" | "unknown" | "already";

/** A friend request by code; if they had already asked me, it becomes a friendship. */
export async function addFriendByCode(me: string, rawCode: string): Promise<AddResult> {
  const code = normalizeCode(rawCode);
  if (code.length !== 6) return "unknown";
  const snap = await get(ref(db(), `codes/${code}`));
  const other = snap.val() as string | null;
  if (!other) return "unknown";
  if (other === me) return "self";
  if ((await get(ref(db(), `friends/${me}/${other}`))).exists()) return "friends";
  if ((await get(ref(db(), `requests/${me}/${other}`))).exists()) {
    await acceptRequest(me, other);
    return "accepted";
  }
  if ((await get(ref(db(), `requests/${other}/${me}`))).exists()) return "already";
  await set(ref(db(), `requests/${other}/${me}`), { at: serverTimestamp() });
  return "sent";
}

export function acceptRequest(me: string, from: string) {
  return update(ref(db()), {
    [`friends/${me}/${from}`]: true,
    [`friends/${from}/${me}`]: true,
    [`requests/${me}/${from}`]: null,
  });
}

export function declineRequest(me: string, from: string) {
  return remove(ref(db(), `requests/${me}/${from}`));
}

export function removeFriend(me: string, other: string) {
  return update(ref(db()), { [`friends/${me}/${other}`]: null, [`friends/${other}/${me}`]: null });
}

/** No more requests from them; drops the friendship and any request. */
export async function blockUser(me: string, other: string) {
  await set(ref(db(), `blocks/${me}/${other}`), true);
  await update(ref(db()), {
    [`friends/${me}/${other}`]: null,
    [`friends/${other}/${me}`]: null,
    [`requests/${me}/${other}`]: null,
  });
}

/** Ids under `path/{uid}` (my friends, my requests…), as a list. */
function subscribeKeys(path: string, cb: (ids: string[]) => void): Unsubscribe {
  return onValue(
    ref(db(), path),
    (snap) => cb(Object.keys(snap.val() ?? {})),
    () => cb([])
  );
}

export const subscribeFriends = (me: string, cb: (ids: string[]) => void) => subscribeKeys(`friends/${me}`, cb);
export const subscribeRequests = (me: string, cb: (ids: string[]) => void) => subscribeKeys(`requests/${me}`, cb);

/** A friend's status; null = offline (or not my friend any more). */
export function subscribeStatus(uid: string, cb: (s: Status | null) => void): Unsubscribe {
  return onValue(
    ref(db(), `status/${uid}`),
    (snap) => cb(snap.exists() ? (snap.val() as Status) : null),
    () => cb(null)
  );
}

// ---- My status -------------------------------------------------------------------

let activity: Status = {};
let statusUid: string | null = null;

function writeStatus() {
  if (!statusUid) return;
  const value: Record<string, unknown> = { at: serverTimestamp() };
  if (activity.room && activity.game) {
    value.room = activity.room;
    value.game = activity.game;
  }
  set(ref(db(), `status/${statusUid}`), value).catch(() => {});
}

/** Keeps `status/{uid}` while connected (removed on disconnect). Returns the stop. */
export function keepOnline(uid: string): () => void {
  statusUid = uid;
  const myRef = ref(db(), `status/${uid}`);
  const unsub = onValue(ref(db(), ".info/connected"), (snap) => {
    if (snap.val() !== true) return;
    onDisconnect(myRef)
      .remove()
      .then(writeStatus)
      .catch(() => {});
  });
  return () => {
    unsub();
    if (statusUid === uid) statusUid = null;
    onDisconnect(myRef).cancel().catch(() => {});
    remove(myRef).catch(() => {});
  };
}

/** The room being played now (from `RoomHeader`), or null when leaving it. */
export function setActivity(room: string | null, game?: GameId) {
  const next: Status = room && game ? { room, game } : {};
  if (next.room === activity.room && next.game === activity.game) return;
  activity = next;
  writeStatus();
}

// ---- Invites ---------------------------------------------------------------------

export function sendInvite(me: string, from: { name: string; clientId: string }, to: string, room: string, game: GameId) {
  return push(ref(db(), `invites/${to}`), {
    from: me,
    name: from.name.slice(0, 24),
    clientId: from.clientId,
    room,
    game,
    at: serverTimestamp(),
  });
}

export function subscribeInvites(me: string, cb: (invites: Invite[]) => void): Unsubscribe {
  return onValue(
    query(ref(db(), `invites/${me}`), limitToLast(10)),
    (snap) => {
      const out: Invite[] = [];
      snap.forEach((c) => {
        out.push({ key: c.key!, ...(c.val() as Omit<Invite, "key">) });
      });
      cb(out);
    },
    () => cb([])
  );
}

export function dismissInvite(me: string, key: string) {
  return remove(ref(db(), `invites/${me}/${key}`));
}

// ---- Deleting the account -------------------------------------------------------------

/** Removes everything the account has in the database, then the account itself. */
export async function deleteAccount(user: User, profile: Profile | null) {
  const uid = user.uid;
  const friends = Object.keys((await get(ref(db(), `friends/${uid}`))).val() ?? {});
  const paths: Record<string, null> = {
    [`profiles/${uid}`]: null,
    [`friends/${uid}`]: null,
    [`requests/${uid}`]: null,
    [`blocks/${uid}`]: null,
    [`invites/${uid}`]: null,
    [`status/${uid}`]: null,
  };
  for (const f of friends) paths[`friends/${f}/${uid}`] = null;
  if (profile?.code) paths[`codes/${profile.code}`] = null;
  // Deleting needs a recent sign-in: ask Google again first, so nothing is half done.
  await reauthenticateWithPopup(user, new GoogleAuthProvider());
  await onDisconnect(ref(db(), `status/${uid}`)).cancel();
  await update(ref(db()), paths);
  await user.delete();
}
