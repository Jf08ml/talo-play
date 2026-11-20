"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Send, X } from "lucide-react";
import { subscribeFriends } from "@/lib/account";
import { DM_MAX_CHARS, markSeen, sendDm, subscribeDm, subscribeLastDm, subscribeSeen, type DirectMessage } from "@/lib/dm";
import { Talo } from "./Talo";
import { playerTalo } from "@/lib/talos";
import { colorForClient } from "@/lib/ids";

/**
 * Friends with a message I haven't read: their last message is theirs and
 * newer than when I last opened our chat. Empty without an account.
 */
export function useUnreadChats(uid: string | undefined): Set<string> {
  const [friends, setFriends] = useState<{ uid: string; ids: string[] } | null>(null);
  const [last, setLast] = useState<Record<string, DirectMessage | null>>({});
  const [seen, setSeen] = useState<{ uid: string; map: Record<string, number> } | null>(null);
  const ids = uid && friends?.uid === uid ? friends.ids : [];
  const key = uid ? `${uid}:${ids.join(",")}` : "";

  useEffect(() => {
    if (!uid) return;
    const a = subscribeFriends(uid, (found) => setFriends({ uid, ids: found }));
    const b = subscribeSeen(uid, (map) => setSeen({ uid, map }));
    return () => {
      a();
      b();
    };
  }, [uid]);

  useEffect(() => {
    if (!key) return;
    const [me, list] = key.split(":");
    const offs = (list ? list.split(",") : []).map((id) => subscribeLastDm(me, id, (m) => setLast((all) => ({ ...all, [id]: m }))));
    return () => offs.forEach((off) => off());
  }, [key]);

  const seenMap = uid && seen?.uid === uid ? seen.map : {};
  return new Set(ids.filter((id) => last[id] && last[id]!.from === id && last[id]!.at > (seenMap[id] ?? 0)));
}

/** A chat with one friend, over the page. */
export default function FriendChat({
  me,
  other,
  name,
  clientId,
  onClose,
}: {
  me: string;
  other: string;
  name: string;
  /** The friend's player id, for their talo. */
  clientId: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<DirectMessage[] | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const talo = playerTalo(clientId, colorForClient(clientId), 34);

  useEffect(() => subscribeDm(me, other, setMessages), [me, other]);

  // Open = read: every new message counts as seen, and the list follows it.
  const count = messages?.length ?? 0;
  useEffect(() => {
    markSeen(me, other);
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [me, other, count]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setError(false);
    const sending = text;
    setText("");
    sendDm(me, other, sending).catch(() => {
      setText(sending);
      setError(true);
    });
  };

  return createPortal(
    <div className="talo-light fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Chat con ${name}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] border-2 border-talo-ink bg-white sm:h-[640px] sm:rounded-[24px]"
      >
        <div className="flex items-center gap-3 border-b-2 border-talo-ink px-4 py-3">
          <span className="flex h-9 w-10 items-end justify-center">
            <Talo w={talo.w} h={talo.h} radius={talo.radius} color={talo.color} expr="contento" label={name} />
          </span>
          <p className="min-w-0 flex-1 truncate font-display text-[22px]">{name}</p>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-xl p-2 hover:bg-black/5">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto bg-[#f6f6f6] px-3 py-4">
          {messages === null ? (
            <p className="m-auto text-black/50">Cargando…</p>
          ) : messages.length === 0 ? (
            <p className="m-auto max-w-xs text-center text-black/55">Todavía no se escribieron. ¡Mandale un saludo!</p>
          ) : (
            messages.map((m) => {
              const mine = m.from === me;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <p
                    className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
                      mine ? "rounded-br-md bg-talo-ink text-white" : "rounded-bl-md border-2 border-talo-ink bg-white"
                    }`}
                  >
                    {m.text}
                    <span className={`ml-2 align-bottom text-[11px] ${mine ? "text-white/55" : "text-black/40"}`}>
                      {new Date(m.at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </p>
                </div>
              );
            })
          )}
        </div>
        <form onSubmit={submit} className="flex items-center gap-2 border-t-2 border-talo-ink px-3 py-3">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, DM_MAX_CHARS))}
            placeholder={`Escribile a ${name}…`}
            aria-label="Mensaje"
            enterKeyHint="send"
            className="min-h-11 min-w-0 flex-1 rounded-xl border-2 border-talo-ink px-3 text-[15px] outline-none focus:ring-2 focus:ring-talo-hero"
          />
          <button type="submit" disabled={!text.trim()} aria-label="Mandar" className="flex min-h-11 items-center gap-1.5 rounded-xl bg-talo-ink px-4 font-bold text-talo-hero disabled:opacity-40">
            <Send className="h-4 w-4" />
          </button>
        </form>
        {error && <p className="px-4 pb-3 text-sm font-semibold text-red-700">No se pudo mandar. Si ya no son amigos, no se pueden escribir.</p>}
      </div>
    </div>,
    document.body
  );
}
