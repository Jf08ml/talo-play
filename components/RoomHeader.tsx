"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { GAMES, type GameId } from "@/lib/games";
import { shareInvite } from "@/lib/share";
import { trackEvent } from "@/lib/analytics";
import { countPlay } from "@/lib/playStats";
import { TaloMark } from "./TaloLogo";
import GameIcon from "./GameIcon";
import { RulesButton } from "./HowToPlay";
import VoiceButton from "./VoiceButton";
import ChatButton from "./ChatButton";
import { FriendsButton } from "./FriendInvite";
import { setActivity } from "@/lib/account";
import { Check, Share2, Volume2, VolumeX } from "lucide-react";
import { installUnlock, isMuted, setMuted, subscribeMuted } from "@/lib/sfx";

// Games with their own audio and sound switch (lib/*Audio.ts).
const OWN_AUDIO = new Set<GameId>(["fuego", "arena", "carreras", "carreras3d", "pasteleria"]);

/** Turns the shared game sounds (lib/sfx.ts) on and off, for every game. */
function SoundButton() {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  useEffect(installUnlock, []);
  return (
    <button
      onClick={() => setMuted(!muted)}
      aria-label={muted ? "Activar sonido" : "Silenciar"}
      aria-pressed={!muted}
      className="flex h-7 items-center rounded-md bg-white/[0.04] px-2 text-slate-300 ring-1 ring-white/10 transition hover:bg-white/[0.08] active:scale-95"
    >
      {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
    </button>
  );
}

/**
 * Top bar shared by every game's room: back to Talo, which game, room code
 * and an always-visible "Invitar" and "Reglas". `badges` go after the code (e.g. mode);
 * `right` is the game's own status area (progress, players…). The room's text
 * and voice chats (`ChatButton`, `VoiceButton`) are here too, unless `social`
 * is false (public worlds); `chatLocked` (a reason) closes the text chat while
 * typing would give an answer away.
 */
export default function RoomHeader({
  game,
  roomId,
  badges,
  right,
  social = true,
  chatLocked,
}: {
  game: GameId;
  roomId: string;
  badges?: ReactNode;
  right?: ReactNode;
  social?: boolean;
  chatLocked?: string | false;
}) {
  const [copied, setCopied] = useState(false);

  // Every room has this header: entering one counts as playing its game (lib/playStats.ts).
  useEffect(() => countPlay(game, roomId), [game, roomId]);
  // Friends with an account see "Jugando a …" and can join (lib/account.ts).
  useEffect(() => {
    setActivity(roomId, game);
    return () => setActivity(null);
  }, [game, roomId]);

  const invite = async () => {
    trackEvent("share", { game, method: "header" });
    if ((await shareInvite(game, roomId)) === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <header className="relative z-30 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-white/[0.08] bg-talo-ink px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <Link href="/" aria-label="Volver a Talo" className="flex items-center gap-1.5 hover:opacity-80">
          <TaloMark className="h-7 w-7" />
        </Link>
        <span className="flex items-center gap-1.5 font-display text-[15px] text-white">
          <GameIcon game={game} size="sm" /> <span className="hidden sm:inline">{GAMES[game].title}</span>
        </span>
        <span className="hidden h-4 w-px bg-white/10 sm:inline" />
        <span className="rounded-md bg-white/[0.08] px-2 py-1 font-code text-sm tracking-[0.15em] text-white">
          {roomId}
        </span>
        {badges}
        <button
          onClick={invite}
          aria-label="Invitar"
          className="flex h-7 items-center gap-1.5 rounded-md bg-talo-hero px-2 text-xs font-bold text-talo-ink transition hover:bg-[#ffe033] active:scale-95 sm:px-2.5"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
          {/* On a phone the label only shows as feedback, so the bar fits one line. */}
          <span className={copied ? "" : "hidden sm:inline"}>{copied ? "¡Link copiado!" : "Invitar"}</span>
        </button>
        <RulesButton game={game} where="partida" compact />
        {!OWN_AUDIO.has(game) && <SoundButton />}
        {social && <FriendsButton game={game} roomId={roomId} />}
        {social && <ChatButton roomId={roomId} locked={chatLocked} />}
        {social && <VoiceButton roomId={roomId} />}
      </div>

      {right && <div className="ml-auto flex items-center justify-end gap-4">{right}</div>}
    </header>
  );
}
