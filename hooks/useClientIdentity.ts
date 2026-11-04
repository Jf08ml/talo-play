"use client";

import { useCallback, useSyncExternalStore } from "react";
import { generateClientId, colorForClient } from "@/lib/ids";

// Identity is shared by every game in Talo, so keys aren't game-scoped.
const CLIENT_ID_KEY = "salon.clientId";
const NAME_KEY = "salon.playerName";
const NAME_CHANGE_EVENT = "salon:name-changed";
const ID_CHANGE_EVENT = "salon:id-changed";

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

function subscribeIdChanges(onStoreChange: () => void) {
  window.addEventListener(ID_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(ID_CHANGE_EVENT, onStoreChange);
}

export function subscribeNameChanges(onStoreChange: () => void) {
  window.addEventListener(NAME_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(NAME_CHANGE_EVENT, onStoreChange);
}

export function readClientId(): string {
  let id = readMigrated(CLIENT_ID_KEY);
  if (!id) {
    id = generateClientId();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function readName(): string | null {
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
    subscribeIdChanges,
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

/**
 * Takes on an account's identity on this device (lib/account.ts): its client
 * id (so the talo and color are the same everywhere) and its name. Never
 * called inside a room, where the id is the player's seat.
 */
export function adoptIdentity(clientId: string, name: string | null) {
  if (clientId && clientId !== localStorage.getItem(CLIENT_ID_KEY)) {
    localStorage.setItem(CLIENT_ID_KEY, clientId);
    window.dispatchEvent(new Event(ID_CHANGE_EVENT));
  }
  if (name && name !== localStorage.getItem(NAME_KEY)) {
    localStorage.setItem(NAME_KEY, name);
    window.dispatchEvent(new Event(NAME_CHANGE_EVENT));
  }
}
