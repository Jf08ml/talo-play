"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, MessageCircle, Send, X } from "lucide-react";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { isFirebaseConfigured } from "@/lib/firebase";
import { MAX_CHARS, QUICK_PHRASES, sendChat, subscribeChat, type ChatMessage } from "@/lib/chat";

const PILL = "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-semibold ring-1 transition active:scale-95";
const TOAST_MS = 5000;

// When each room's chat was last looked at, kept for the page's life so the
// header remounting (waiting room → game) doesn't bring the old ones back as new.
const lastSeen = new Map<string, number>();

/**
 * The room's text chat in `RoomHeader`: a panel with the last messages, quick
 * phrases and a box to write; while closed, a counter and a bubble with the
 * newest message. `locked` (a reason) closes it during a game's guessing phase,
 * so nobody gives the answer away.
 */
export default function ChatButton({ roomId, locked }: { roomId: string; locked?: string | false }) {
  const { clientId, name, color } = useClientIdentity();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [seen, setSeen] = useState(() => lastSeen.get(roomId) ?? Date.now());
  const [toast, setToast] = useState<ChatMessage | null>(null);
  const [showLock, setShowLock] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const toasted = useRef<string | null>(null);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    if (!configured) return;
    return subscribeChat(roomId, setMessages);
  }, [roomId, configured]);

  // A bubble for a message that just arrived (unseen, so not the ones there on entering).
  useEffect(() => {
    if (open || locked) return;
    const fresh = messages.at(-1);
    if (!fresh || fresh.by === clientId || fresh.at <= seen || fresh.id === toasted.current) return;
    toasted.current = fresh.id;
    setToast(fresh);
  }, [messages, open, locked, clientId, seen]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const markSeen = () => {
    const now = Math.max(Date.now(), messages.at(-1)?.at ?? 0);
    lastSeen.set(roomId, now);
    setSeen(now);
  };

  useEffect(() => {
    if (!open) return;
    list.current?.scrollTo({ top: list.current.scrollHeight });
    const now = Math.max(Date.now(), messages.at(-1)?.at ?? 0);
    lastSeen.set(roomId, now);
  }, [open, messages, roomId]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) {
        setOpen(false);
        markSeen();
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  });

  useEffect(() => {
    if (!showLock) return;
    const t = setTimeout(() => setShowLock(false), 3000);
    return () => clearTimeout(t);
  }, [showLock]);

  if (!configured || !clientId) return null;

  const isOpen = open && !locked;
  const unread = messages.filter((m) => m.by !== clientId && m.at > seen).length;

  const send = (value: string) => {
    if (!name || locked) return;
    sendChat(roomId, { by: clientId, name, color }, value).catch(console.error);
  };

  const toggle = () => {
    if (locked) {
      setShowLock(true);
      return;
    }
    if (isOpen) markSeen();
    setToast(null);
    setOpen(!isOpen);
  };

  return (
    <div ref={box} className="relative flex items-center">
      <button
        onClick={toggle}
        aria-label={locked ? "Chat cerrado" : isOpen ? "Cerrar el chat" : "Abrir el chat"}
        aria-expanded={isOpen}
        className={`${PILL} relative ${
          locked
            ? "bg-slate-800 text-slate-500 ring-slate-700"
            : "bg-violet-500/15 text-violet-200 ring-violet-400/30 hover:bg-violet-500/25"
        }`}
      >
        {locked ? <Lock className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">Chat</span>
        {!locked && !isOpen && unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-fuchsia-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {showLock && locked && (
        <div className="fixed inset-x-3 top-14 z-50 rounded-lg border border-slate-600/50 bg-slate-900 px-3 py-2 text-xs text-slate-300 shadow-xl sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-64">
          {locked}
        </div>
      )}

      {toast && !isOpen && !locked && (
        <button
          onClick={toggle}
          className="fixed inset-x-3 top-14 z-50 flex items-start gap-2 rounded-xl border border-violet-500/25 bg-slate-900/95 px-3 py-2 text-left text-sm shadow-xl backdrop-blur sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-72"
        >
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: toast.color }} />
          <span className="min-w-0">
            <span className="font-semibold" style={{ color: toast.color }}>
              {toast.name}
            </span>{" "}
            <span className="break-words text-slate-200">{toast.text}</span>
          </span>
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-x-3 top-14 z-50 flex max-h-[70dvh] flex-col rounded-xl border border-violet-500/20 bg-slate-900 shadow-xl sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-80">
          <div className="flex items-center justify-between px-3 pb-1 pt-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Chat de la sala</p>
            <button
              onClick={toggle}
              aria-label="Cerrar el chat"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={list} className="min-h-24 flex-1 space-y-1.5 overflow-y-auto px-3 py-1">
            {messages.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Todavía no escribió nadie. ¡Arrancá vos!</p>}
            {messages.map((m) => (
              <p key={m.id} className="break-words text-sm leading-snug text-slate-200">
                <span className="font-semibold" style={{ color: m.color }}>
                  {m.by === clientId ? "Vos" : m.name}
                </span>{" "}
                {m.text}
              </p>
            ))}
          </div>

          <div className="flex gap-1.5 overflow-x-auto px-3 py-2">
            {QUICK_PHRASES.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                disabled={!name}
                className="shrink-0 rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300 transition hover:bg-slate-800 active:scale-95 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
              setText("");
            }}
            className="flex gap-2 border-t border-slate-800 p-2"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_CHARS}
              placeholder={name ? "Escribí un mensaje…" : "Poné tu nombre para escribir"}
              disabled={!name}
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-500"
            />
            <button
              type="submit"
              disabled={!name || !text.trim()}
              aria-label="Enviar"
              className="rounded-lg bg-violet-600 px-3 text-white transition hover:bg-violet-500 active:scale-95 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
