"use client";

import { useEffect } from "react";
import { listenInstall } from "@/lib/install";

/**
 * Root layout: registers the service worker (`public/sw.js`: push
 * notifications, installable app; no caching) and starts listening for the
 * browser's install prompt early, before any button asks for it.
 */
listenInstall();

export default function ServiceWorker() {
  useEffect(() => {
    listenInstall();
    if (!("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
