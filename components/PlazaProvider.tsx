"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { isFirebaseConfigured } from "@/lib/firebase";
import { subscribeActive, trackOnline } from "@/lib/plaza";
import { readClientId } from "@/hooks/useClientIdentity";
import { trackEvent } from "@/lib/analytics";

// The drawer (chat, rooms looking for players) only loads when opened.
const PlazaDrawer = dynamic(() => import("./PlazaDrawer"), { ssr: false });

type Where = "boton" | "inicio" | "sala" | "link";

const PlazaContext = createContext<{ open: boolean; show: (where: Where) => void; hide: () => void }>({
  open: false,
  show: () => {},
  hide: () => {},
});

export const usePlaza = () => useContext(PlazaContext);

/** People with Talo open right now (0 until it loads, or without Firebase). */
export function useActiveCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => (isFirebaseConfigured() ? subscribeActive(setCount) : undefined), []);
  return count;
}

/**
 * La Plaza for the whole site (root layout): the drawer over any page,
 * opened by the floating button, the home's card, a waiting room or a
 * `?plaza=1` link (old `/plaza` links redirect there). It also counts this
 * tab as on Talo, on every page, with or without an account.
 */
export default function PlazaProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const id = readClientId();
    if (!id) return;
    return trackOnline(id);
  }, []);

  // `?plaza=1` opens it once, and leaves the address clean.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("plaza")) return;
    url.searchParams.delete("plaza");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only readable after mount
    setOpen(true);
    trackEvent("plaza_open", { where: "link" });
  }, []);

  const show = useCallback((where: Where) => {
    setOpen(true);
    trackEvent("plaza_open", { where });
  }, []);
  const hide = useCallback(() => setOpen(false), []);

  return (
    <PlazaContext.Provider value={{ open, show, hide }}>
      {children}
      {open && isFirebaseConfigured() && <PlazaDrawer onClose={hide} />}
    </PlazaContext.Provider>
  );
}
