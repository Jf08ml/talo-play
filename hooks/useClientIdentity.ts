"use client";

import { useCallback, useSyncExternalStore } from "react";
import { generateClientId, colorForClient } from "@/lib/ids";

const CLIENT_ID_KEY = "rompecabezas.clientId";
const NAME_KEY = "rompecabezas.playerName";
const NAME_CHANGE_EVENT = "rompecabezas:name-changed";

function subscribeNever() {
  return () => {};
}

function subscribeNameChanges(onStoreChange: () => void) {
  window.addEventListener(NAME_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(NAME_CHANGE_EVENT, onStoreChange);
}

function readClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = generateClientId();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

function readName(): string | null {
  return localStorage.getItem(NAME_KEY);
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
