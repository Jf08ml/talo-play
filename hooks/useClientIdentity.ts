"use client";

import { useCallback, useSyncExternalStore } from "react";
import { generateClientId, colorForClient } from "@/lib/ids";

// Identity is shared by every game in the salón, so keys aren't game-scoped.
const CLIENT_ID_KEY = "salon.clientId";
const NAME_KEY = "salon.playerName";
const NAME_CHANGE_EVENT = "salon:name-changed";

// Keys from when the puzzle was the only game; migrated on first read so
// returning players keep their id (and therefore color) and name.
const LEGACY_KEYS: Record<string, string> = {
  [CLIENT_ID_KEY]: "rompecabezas.clientId",
  [NAME_KEY]: "rompecabezas.playerName",
};

function readMigrated(key: string): string | null {
  const value = localStorage.getItem(key);
  if (value !== null) return value;
  const legacy = localStorage.getItem(LEGACY_KEYS[key]);
  if (legacy === null) return null;
  localStorage.setItem(key, legacy);
  localStorage.removeItem(LEGACY_KEYS[key]);
  return legacy;
}

function subscribeNever() {
  return () => {};
}

function subscribeNameChanges(onStoreChange: () => void) {
  window.addEventListener(NAME_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(NAME_CHANGE_EVENT, onStoreChange);
}

function readClientId(): string {
  let id = readMigrated(CLIENT_ID_KEY);
  if (!id) {
    id = generateClientId();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

function readName(): string | null {
  return readMigrated(NAME_KEY);
}

const getClientIdServerSnapshot = () => "";
const getNameServerSnapshot = () => null;

export interface ClientIdentity {
  clientId: string;
  color: string;
  name: string | null;
  setName: (name: string) => void;
}

export function useClientIdentity(): ClientIdentity {
  const clientId = useSyncExternalStore(
    subscribeNever,
    readClientId,
    getClientIdServerSnapshot
  );
  const name = useSyncExternalStore(
    subscribeNameChanges,
    readName,
    getNameServerSnapshot
  );

  const setName = useCallback((value: string) => {
    localStorage.setItem(NAME_KEY, value);
    window.dispatchEvent(new Event(NAME_CHANGE_EVENT));
  }, []);

  return { clientId, color: clientId ? colorForClient(clientId) : "#999", name, setName };
}
