"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, LogIn, UserPlus, Users } from "lucide-react";
import type { GameId } from "@/lib/games";
import { inAppBrowser, sendInvite, signInWithGoogle } from "@/lib/account";
import { isFirebaseConfigured } from "@/lib/firebase";
import { colorForClient } from "@/lib/ids";
import { playerTalo } from "@/lib/talos";
import { trackEvent } from "@/lib/analytics";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { statusLabel, useAccount, useFriends } from "./AccountProvider";
import { Talo } from "./Talo";

/** Google's sign-in button for the dark side (rooms). */
export function SignInButton({ className = "", light = false }: { className?: string; light?: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (inAppBrowser()) {
    return (
      <p className={`text-sm ${light ? "text-talo-text-2" : "text-white/70"} ${className}`}>
        Para entrar con Google, abrí Talo en tu navegador (Chrome o Safari): desde el menú «⋯», «Abrir en el navegador».
      </p>
    );
  }
  return (
    <div className={className}>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await signInWithGoogle();
            trackEvent("login", { method: "google" });
          } catch (err) {
            console.error(err);
            setError("No se pudo entrar. Probá de nuevo.");
          } finally {
            setBusy(false);
          }
        }}
        className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[14px] px-4 text-[16px] font-bold transition active:scale-[0.98] disabled:opacity-60 ${
          light ? "bg-talo-ink text-white hover:bg-black" : "bg-white text-talo-ink hover:bg-[#e8e8e8]"
        }`}
      >
        <LogIn className="h-4 w-4" /> {busy ? "Entrando…" : "Entrar con Google"}
      </button>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}

/**
 * My friends with an "Invitar" each (online ones first), to call them to this
 * room: they get a card with "Unirme" wherever they are in Talo. Without an
 * account, a short pitch and the sign-in.
 */
export function FriendInviteList({ game, roomId }: { game: GameId; roomId: string }) {
  const { user, profile } = useAccount();
  const friends = useFriends(user?.uid);
  const identity = useClientIdentity();
  const [sent, setSent] = useState<Record<string, boolean>>({});

  if (!isFirebaseConfigured() || user === undefined) return null;

  if (!user) {
    return (
      <div className="flex flex-col gap-2 rounded-[14px] bg-white/[0.05] p-3.5">
        <p className="text-[15px] font-bold text-white">Invitá a tus amigos sin mandar links</p>
        <p className="text-sm text-white/65">Con una cuenta les llega la invitación directo en Talo, estén donde estén.</p>
        <SignInButton />
      </div>
    );
  }

  const invite = (to: string) => {
    if (!profile) return;
    setSent((m) => ({ ...m, [to]: true }));
    trackEvent("share", { game, method: "amigo" });
    sendInvite(user.uid, { name: identity.name ?? profile.name, clientId: identity.clientId || profile.clientId }, to, roomId, game).catch(
      (err) => {
        console.error(err);
        setSent((m) => ({ ...m, [to]: false }));
      }
    );
  };

  if (!friends.length) {
    return (
      <div className="flex flex-col gap-1 rounded-[14px] bg-white/[0.05] p-3.5 text-sm text-white/70">
        <p className="font-bold text-white">Todavía no tenés amigos en Talo</p>
        <p>
          Pasales tu código de amigo desde{" "}
          <Link href="/amigos" target="_blank" className="font-bold text-talo-hero underline-offset-2 hover:underline">
            Amigos
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
      {friends.map((f) => {
        const p = f.profile;
        if (!p) return null;
        const talo = playerTalo(p.clientId, colorForClient(p.clientId), 30);
        const here = f.status?.room === roomId;
        return (
          <li key={f.uid} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/[0.04]">
            <span className="flex h-9 w-9 shrink-0 items-end justify-center">
              <Talo w={talo.w} h={talo.h} radius={talo.radius} color={talo.color} expr={f.status ? "contento" : "normal"} label={p.name} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold text-white">{p.name}</span>
              <span className={`block truncate text-xs ${f.status ? "text-emerald-400" : "text-white/45"}`}>
                {here ? "Está en esta sala" : statusLabel(f.status)}
              </span>
            </span>
            {!here && (
              <button
                onClick={() => invite(f.uid)}
                disabled={sent[f.uid]}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-talo-hero px-3 py-1.5 text-sm font-bold text-talo-ink transition hover:bg-[#ffe033] active:scale-95 disabled:bg-white/10 disabled:text-white/70"
              >
                {sent[f.uid] ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Invitado
                  </>
                ) : (
                  "Invitar"
                )}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const PILL = "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-semibold ring-1 transition active:scale-95";

/** "Amigos" in `RoomHeader`: a panel with `FriendInviteList`, and how many friends are online. */
export function FriendsButton({ game, roomId }: { game: GameId; roomId: string }) {
  const { user } = useAccount();
  const friends = useFriends(user?.uid);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const online = friends.filter((f) => f.status && f.status.room !== roomId).length;

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  if (!isFirebaseConfigured() || user === undefined) return null;

  return (
    <div ref={box} className="relative flex items-center">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Invitar amigos"
        aria-expanded={open}
        className={`${PILL} relative bg-white/[0.04] text-slate-200 ring-white/10 hover:bg-white/[0.08]`}
      >
        {user ? <Users className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">Amigos</span>
        {online > 0 && !open && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
            {online}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-14 z-50 flex flex-col gap-2 rounded-xl border border-white/10 bg-[#1c1c1c] p-3 shadow-xl sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-80">
          <p className="text-sm font-bold text-white/60">Invitar amigos a esta sala</p>
          <FriendInviteList game={game} roomId={roomId} />
        </div>
      )}
    </div>
  );
}
