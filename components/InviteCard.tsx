"use client";

import { useState, useSyncExternalStore } from "react";
import type { GameId } from "@/lib/games";
import { canNativeShare, copyInvite, shareInvite, whatsappUrl } from "@/lib/share";

const subscribeNever = () => () => {};

/** Big room code plus the three ways to invite: WhatsApp, the phone's share sheet, copy link. */
export default function InviteCard({ game, roomId }: { game: GameId; roomId: string }) {
  const [copied, setCopied] = useState(false);
  // Only known in the browser; false during SSR.
  const nativeShare = useSyncExternalStore(subscribeNever, canNativeShare, () => false);

  const copy = async () => {
    if ((await copyInvite(game, roomId)) === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-cyan-400/20 bg-slate-950/50 p-4 text-center">
      <p className="text-sm text-slate-400">Invitá a los demás con este código o mandales el link</p>
      <p className="font-mono text-4xl font-bold tracking-[0.25em] text-cyan-200 drop-shadow-[0_0_12px_rgba(34,211,238,0.35)]">
        {roomId}
      </p>
      <div className="grid w-full max-w-sm grid-cols-2 gap-2">
        <a
          href={whatsappUrl(game, roomId)}
          target="_blank"
          rel="noopener noreferrer"
          className="col-span-2 flex items-center justify-center gap-2 rounded-lg bg-[#25D366] py-2.5 font-semibold text-[#06290f] transition hover:brightness-110"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2c.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
          </svg>
          Invitar por WhatsApp
        </a>
        {nativeShare && (
          <button
            onClick={() => shareInvite(game, roomId)}
            className="rounded-lg border border-slate-600 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
          >
            📤 Compartir
          </button>
        )}
        <button
          onClick={copy}
          className={`rounded-lg border border-slate-600 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 ${
            nativeShare ? "" : "col-span-2"
          }`}
        >
          {copied ? "¡Link copiado!" : "🔗 Copiar link"}
        </button>
      </div>
    </div>
  );
}
