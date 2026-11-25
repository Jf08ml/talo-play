/*
 * Talo's service worker (registered by components/ServiceWorker.tsx).
 *
 * - Push notifications (lib/push.ts, app/api/push/route.ts): shows them, unless
 *   Talo is open and visible (the page already shows invites and messages).
 * - Tapping one focuses a Talo tab on its URL, or opens one.
 * - No caching on purpose: every visit gets the latest deploy. The empty fetch
 *   handler only marks the site as an installable app for older browsers.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Talo", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((w) => w.visibilityState === "visible" && w.focused)) return;
      await self.registration.showNotification(data.title || "Talo", {
        body: data.body || "",
        icon: "/app-icon/192",
        badge: "/app-icon/192",
        tag: data.tag || undefined,
        renotify: !!data.tag,
        data: { url: data.url || "/" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        if (new URL(w.url).origin !== self.location.origin) continue;
        await w.focus();
        if (w.url !== url && "navigate" in w) await w.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
