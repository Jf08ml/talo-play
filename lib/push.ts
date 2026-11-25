import { ref, remove, set } from "firebase/database";
import { getAuthInstance, getDb } from "./firebase";
import type { GameId } from "./games";

/**
 * Push notifications for accounts: friend invites, friend requests (sent and
 * accepted) and friends' messages. Standard Web Push with our own VAPID keys
 * (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, private one on the server); no Firebase
 * Cloud Messaging.
 *
 * A device that turns them on saves its subscription at `push/{uid}/{key}`
 * (key = a hash of the endpoint). Readable by the owner and by whoever may
 * notify them (friends, or someone with a pending request to them), so the
 * server route `/api/push` can read them with the sender's own token and the
 * rules do the checking: no admin credentials anywhere.
 *
 * Sending is fire-and-forget from the client right after the action
 * (`notify`); the service worker (`public/sw.js`) skips it when Talo is
 * already open and visible.
 */

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushKind = "invite" | "request" | "accepted" | "dm";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !!VAPID_PUBLIC_KEY &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** iPhone/iPad only allow web push from the app added to the home screen. */
export function needsInstallForPush(): boolean {
  if (typeof window === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function keyOf(endpoint: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(hash).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register("/sw.js");
}

/** Whether this device currently gets my notifications. */
export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

/** Asks for permission and subscribes this device for `uid`. Returns false if the person said no. */
export async function enablePush(uid: string): Promise<boolean> {
  if (!pushSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
  await set(ref(getDb(), `push/${uid}/${await keyOf(json.endpoint)}`), {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    at: Date.now(),
  });
  return true;
}

/** Stops notifications on this device. */
export async function disablePush(uid: string): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await remove(ref(getDb(), `push/${uid}/${await keyOf(sub.endpoint)}`)).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/**
 * Asks the server to notify `to` (a friend, or someone I just sent a request
 * to). Never throws: a missed notification isn't worth an error.
 */
export function notify(kind: PushKind, to: string, extra: { room?: string; game?: GameId; text?: string } = {}) {
  const user = getAuthInstance().currentUser;
  if (!user || !VAPID_PUBLIC_KEY) return;
  user
    .getIdToken()
    .then((token) =>
      fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind, to, ...extra }),
        keepalive: true,
      })
    )
    .catch(() => {});
}
