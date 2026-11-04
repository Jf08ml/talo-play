"use client";

import { useState, useSyncExternalStore } from "react";
import { Share2 } from "lucide-react";
import type { GameId } from "@/lib/games";
import { canNativeShare, copyInvite, shareInvite, whatsappUrl } from "@/lib/share";
import { trackEvent } from "@/lib/analytics";
import { FriendInviteList } from "./FriendInvite";

const subscribeNever = () => () => {};

const OUTLINE =
  "flex min-h-[54px] items-center justify-center gap-2 rounded-[14px] border-2 text-[17px] font-bold transition active:scale-[0.98]";

/** The room code in boxes plus the ways to invite: WhatsApp, copy link and, on phones, the share sheet. */
export default function InviteCard({ game, roomId }: { game: GameId; roomId: string }) {
  const [copied, setCopied] = useState(false);
  // Only known in the browser; false during SSR.
  const nativeShare = useSyncExternalStore(subscribeNever, canNativeShare, () => false);

  const copy = async () => {
    trackEvent("share", { game, method: "copiar" });
    if ((await copyInvite(game, roomId)) === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-extrabold text-white">Sumá a los que faltan</h3>
        <p className="text-[15px] text-white/70">Pasales el link o este código para que entren con su nombre.</p>
      </div>
      <div role="img" aria-label={`Código de la sala: ${roomId.split("").join(" ")}`} className="flex gap-1.5">
        {roomId.split("").map((c, i) => (
          <span
            key={i}
            className="grid h-[60px] flex-1 place-items-center rounded-xl bg-white/[0.08] font-code text-[28px] text-white"
          >
            {c}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={whatsappUrl(game, roomId)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent("share", { game, method: "whatsapp" })}
          className={`${OUTLINE} w-full border-white bg-white px-4 sm:w-auto sm:flex-1 text-talo-ink hover:bg-[#e8e8e8]`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2c.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
          </svg>
          Mandar por WhatsApp
        </a>
        <button
          onClick={copy}
          className={`${OUTLINE} min-w-[108px] flex-1 px-3.5 sm:flex-none ${
            copied ? "border-talo-hero bg-talo-hero text-talo-ink" : "border-white/70 text-white hover:border-white hover:bg-white/10"
          }`}
        >
          {copied ? "Copiado" : "Copiar link"}
        </button>
        {nativeShare && (
          <button
            onClick={() => {
              trackEvent("share", { game, method: "nativo" });
              shareInvite(game, roomId);
            }}
            aria-label="Compartir"
            className={`${OUTLINE} w-[54px] shrink-0 border-white/70 text-white hover:border-white hover:bg-white/10`}
          >
            <Share2 className="h-5 w-5" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-white/10 pt-3.5">
        <h4 className="text-[15px] font-bold text-white/80">O invitá a tus amigos de Talo</h4>
        <FriendInviteList game={game} roomId={roomId} />
      </div>
    </div>
  );
}
