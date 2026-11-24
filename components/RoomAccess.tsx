"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { onValue, ref } from "firebase/database";
import { Check, Globe, Lock } from "lucide-react";
import { getDb } from "@/lib/firebase";
import type { GameId } from "@/lib/games";
import { subscribePresence, type PresenceMap } from "@/lib/presence";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import {
  BEAT_MS,
  beatOpenRoom,
  isWaiting,
  setAccess,
  subscribeAccess,
  subscribeWaiting,
  unlistOnDisconnect,
  unlistRoom,
  onUnlisted,
  type OpenEntry,
  type RoomAccess,
} from "@/lib/openRooms";

/**
 * Who can walk into a room (`lib/openRooms.ts`): "privada" (link, code, or
 * while asking the Plaza for people) or "abierta" (listed in "Salas
 * abiertas" the whole time, also mid-game). The host changes it — or anyone
 * when the room has no host or the host isn't connected, like "Empezar".
 */
function useRoomAccess(roomId: string, game: GameId) {
  const { clientId, name, color } = useClientIdentity();
  const [access, setAccessState] = useState<RoomAccess>("privada");
  const [hostId, setHostId] = useState("");
  const [presence, setPresence] = useState<PresenceMap>({});
  const playing = !useSyncExternalStore(subscribeWaiting, () => isWaiting(roomId), () => false);

  useEffect(() => subscribeAccess(roomId, setAccessState), [roomId]);
  useEffect(
    () => onValue(ref(getDb(), `rooms/${roomId}/meta/hostId`), (snap) => setHostId(typeof snap.val() === "string" ? snap.val() : "")),
    [roomId]
  );
  useEffect(() => subscribePresence(roomId, setPresence), [roomId]);

  const loaded = clientId in presence;
  const canChange = !hostId || hostId === clientId || (loaded && !(hostId in presence));
  const host = presence[hostId];
  const entry: OpenEntry = {
    game,
    count: Object.keys(presence).length,
    playing,
    name: host?.name ?? name ?? "Alguien",
    color: host?.color ?? color,
    by: clientId,
  };

  const change = (next: RoomAccess) => {
    if (!canChange || next === access) return;
    setAccess(roomId, next, entry).catch(() => {});
  };

  return { access, canChange, change, presence, entry, clientId };
}

/**
 * Keeps an open room listed: the connected player with the lowest id writes
 * its listing every `BEAT_MS` and whenever the count or the phase changes.
 */
function useOpenBeacon(roomId: string, access: RoomAccess, presence: PresenceMap, entry: OpenEntry) {
  const ids = Object.keys(presence).sort();
  const beats = access === "abierta" && !!entry.by && ids[0] === entry.by;
  const key = `${entry.game}|${entry.count}|${entry.playing}|${entry.name}|${entry.color}|${entry.by}`;
  const latest = useRef(entry);
  useEffect(() => {
    latest.current = entry;
  });
  useEffect(() => {
    if (!beats) return;
    beatOpenRoom(roomId, latest.current);
    const cancel = unlistOnDisconnect(roomId);
    const t = setInterval(() => beatOpenRoom(roomId, latest.current), BEAT_MS);
    // Taken down by another device of mine leaving (same player id): list it again.
    const unwatch = onUnlisted(roomId, () => beatOpenRoom(roomId, latest.current));
    return () => {
      clearInterval(t);
      unwatch();
      cancel();
    };
  }, [beats, roomId, key]);
  // Leaving last (to another page) takes the room off the list at once. Declared after the
  // beacon so its listener is gone by then (cleanups run in order).
  const lastOne = useRef(false);
  useEffect(() => {
    lastOne.current = beats && ids.length <= 1;
  });
  useEffect(
    () => () => {
      if (lastOne.current) unlistRoom(roomId);
    },
    [roomId]
  );
}

const OPTIONS: { id: RoomAccess; title: string; text: string; Icon: typeof Lock }[] = [
  {
    id: "privada",
    title: "Privada",
    text: "Entran con el link o el código. Si faltan jugadores, la puedes publicar un rato en la Plaza.",
    Icon: Lock,
  },
  {
    id: "abierta",
    title: "Abierta",
    text: "Aparece en «Salas abiertas» y cualquiera de Talo se suma cuando quiera, también mientras juegan.",
    Icon: Globe,
  },
];

function Choice({
  access,
  canChange,
  onChange,
}: {
  access: RoomAccess;
  canChange: boolean;
  onChange: (a: RoomAccess) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Quién puede entrar" className="grid gap-2 sm:grid-cols-2">
      {OPTIONS.map(({ id, title, text, Icon }) => {
        const on = access === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={!canChange && !on}
            onClick={() => onChange(id)}
            className={`flex items-start gap-2.5 rounded-xl p-3 text-left ring-2 transition ${
              on ? "bg-talo-hero/10 ring-talo-hero" : "ring-white/10 hover:ring-white/30 disabled:opacity-50 disabled:hover:ring-white/10"
            }`}
          >
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${on ? "text-talo-hero" : "text-white/60"}`} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 font-bold text-white">
                {title} {on && <Check className="h-4 w-4 text-talo-hero" />}
              </span>
              <span className="text-[13px] leading-snug text-white/65">{text}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The waiting room's "¿Quién puede entrar?" card. */
export function RoomAccessCard({ roomId, game }: { roomId: string; game: GameId }) {
  const { access, canChange, change } = useRoomAccess(roomId, game);
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
      <h3 className="text-[15px] font-extrabold text-white">¿Quién puede entrar?</h3>
      <Choice access={access} canChange={canChange} onChange={change} />
      {!canChange && <p className="text-xs text-white/50">Lo elige el anfitrión.</p>}
    </div>
  );
}

/**
 * The room header's lock/globe: shows whether the room is open, lets whoever
 * may change it switch it mid-game, and keeps an open room listed.
 */
export function RoomAccessButton({ roomId, game }: { roomId: string; game: GameId }) {
  const { access, canChange, change, presence, entry } = useRoomAccess(roomId, game);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useOpenBeacon(roomId, access, presence, entry);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const Icon = access === "abierta" ? Globe : Lock;
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={access === "abierta" ? "Sala abierta" : "Sala privada"}
        aria-expanded={open}
        title={access === "abierta" ? "Sala abierta" : "Sala privada"}
        className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-bold ring-1 transition active:scale-95 ${
          access === "abierta"
            ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/40 hover:bg-emerald-400/25"
            : "bg-white/[0.04] text-slate-300 ring-white/10 hover:bg-white/[0.08]"
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{access === "abierta" ? "Abierta" : "Privada"}</span>
      </button>
      {open && (
        <div className="fixed inset-x-3 top-14 z-50 flex sm:absolute sm:inset-x-auto sm:left-0 sm:top-9 sm:w-[420px] flex-col gap-2.5 rounded-2xl bg-[#1c1c1c] p-3 shadow-2xl ring-1 ring-white/15">
          <p className="text-[15px] font-extrabold text-white">¿Quién puede entrar?</p>
          <Choice access={access} canChange={canChange} onChange={change} />
          {!canChange && <p className="text-xs text-white/50">Lo elige el anfitrión.</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Keeps an open room listed where the room header isn't on screen (the 3D
 * games' full-screen matches). Draws nothing.
 */
export function OpenRoomBeacon({ roomId, game }: { roomId: string; game: GameId }) {
  const { access, presence, entry } = useRoomAccess(roomId, game);
  useOpenBeacon(roomId, access, presence, entry);
  return null;
}
