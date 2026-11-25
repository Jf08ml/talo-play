"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dices, Globe, Loader2, Swords, X, Zap } from "lucide-react";
import { GAMES, roomPath, type GameId } from "@/lib/games";
import { QUICK_GAMES, createDuel, enterWorld, type QuickGame } from "@/lib/quickPlay";
import { searchMatch } from "@/lib/matchmaking";
import { randomOf } from "@/lib/boardBot";
import { trackEvent } from "@/lib/analytics";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import NamePrompt from "./NamePrompt";
import GameIcon from "./GameIcon";

/**
 * «Jugar ya» (home): a big button that opens a sheet with the games that
 * start in seconds, alone: duels find a rival (`lib/matchmaking.ts`), worlds
 * enter a public room. «Sorpréndeme» picks one at random. Asks for a name
 * first when there's none.
 */
export default function QuickPlay({ className = "" }: { className?: string }) {
  const identity = useClientIdentity();
  const [askName, setAskName] = useState(false);
  const [open, setOpen] = useState(false);

  const start = () => {
    if (!identity.clientId) return;
    if (identity.name) setOpen(true);
    else setAskName(true);
  };

  return (
    <>
      <button
        onClick={start}
        className={`flex min-h-[60px] items-center justify-center gap-2.5 rounded-[18px] bg-talo-ink px-7 text-[19px] font-bold text-white transition hover:bg-black ${className}`}
      >
        <Zap className="h-5 w-5 fill-talo-hero text-talo-hero" /> Jugar ya
      </button>
      {askName && (
        <NamePrompt
          submitLabel="Seguir"
          onCancel={() => setAskName(false)}
          onSubmit={(name) => {
            identity.setName(name);
            setAskName(false);
            setOpen(true);
          }}
        />
      )}
      {open && identity.name && (
        <QuickSheet me={{ clientId: identity.clientId, name: identity.name, color: identity.color }} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

const DUELS = QUICK_GAMES.filter((q) => q.kind === "duelo");
const WORLDS = QUICK_GAMES.filter((q) => q.kind === "mundo");

function QuickSheet({ me, onClose }: { me: { clientId: string; name: string; color: string }; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<GameId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const close = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  });
  useEffect(() => () => cancelRef.current?.(), []);

  const go = (q: QuickGame, random: boolean) => {
    setBusy(q.game);
    setError(null);
    trackEvent("quick_play", { game: q.game, random });
    const fail = (err: unknown) => {
      console.error(err);
      cancelRef.current = null;
      setBusy(null);
      setError("No se pudo entrar. Prueba de nuevo.");
    };
    if (q.kind === "mundo") {
      enterWorld(q.game)
        .then((id) => {
          trackEvent("create_room", { game: q.game, mode: "online" });
          router.push(roomPath(q.game, id));
        })
        .catch(fail);
      return;
    }
    cancelRef.current = searchMatch(
      q.queue ?? q.game,
      me,
      (vs) => createDuel(q.game, me.clientId, vs),
      (found) => {
        cancelRef.current = null;
        if (found.created) trackEvent("create_room", { game: q.game, mode: found.bot ? "online_bot" : "online" });
        router.push(roomPath(q.game, found.roomId));
      },
      fail
    );
  };

  const surprise = () => go(randomOf(QUICK_GAMES), true);

  const cancelSearch = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    setBusy(null);
  };

  const row = (q: QuickGame) => (
    <button
      key={q.game}
      onClick={() => go(q, false)}
      disabled={!!busy}
      className="flex min-h-[56px] items-center gap-2.5 rounded-2xl bg-talo-surface px-2.5 py-2 text-left transition hover:bg-[#ececec] disabled:opacity-50 sm:gap-3 sm:px-3"
    >
      <GameIcon game={q.game} size="md" />
      <span className="min-w-0 flex-1 text-[15px] font-bold leading-tight sm:text-[16px]">{GAMES[q.game].title}</span>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Jugar ya"
    >
      <div
        className="talo-light flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-white sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-6 pb-3 pt-5">
          <div className="flex-1">
            <p className="font-display text-[28px] leading-tight">¿A qué jugamos?</p>
            <p className="mt-1 text-[15px] text-talo-text-2">Toca un juego y en segundos estás jugando con alguien.</p>
          </div>
          <button onClick={close} aria-label="Cerrar" className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] hover:bg-talo-surface">
            <X className="h-5 w-5" />
          </button>
        </div>

        {busy ? (
          <div className="flex flex-col items-center gap-4 px-6 pb-8 pt-6 text-center" role="status">
            <GameIcon game={busy} size="lg" />
            <p className="font-display text-[22px] leading-tight">{GAMES[busy].title}</p>
            <p className="flex items-center gap-2 text-[16px] font-semibold">
              <Loader2 className="h-5 w-5 animate-spin" />
              {QUICK_GAMES.find((q) => q.game === busy)?.kind === "duelo" ? "Buscando rival…" : "Entrando…"}
            </p>
            <button onClick={cancelSearch} className="min-h-[48px] rounded-[14px] border-2 border-talo-ink px-6 font-bold hover:bg-talo-surface">
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-5 overflow-y-auto px-6 pb-6">
            <button
              onClick={surprise}
              className="flex min-h-[60px] items-center justify-center gap-2.5 rounded-2xl bg-talo-hero text-[18px] font-bold text-talo-ink transition hover:brightness-95"
            >
              <Dices className="h-5 w-5" /> Sorpréndeme
            </button>
            {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
            <section className="flex flex-col gap-2.5">
              <h3 className="flex items-center gap-2 text-[14px] font-bold uppercase tracking-wide text-talo-text-2">
                <Swords className="h-4 w-4" /> Uno contra uno
              </h3>
              <div className="grid grid-cols-2 gap-2">{DUELS.map(row)}</div>
            </section>
            <section className="flex flex-col gap-2.5">
              <h3 className="flex items-center gap-2 text-[14px] font-bold uppercase tracking-wide text-talo-text-2">
                <Globe className="h-4 w-4" /> Con gente de todos lados
              </h3>
              <div className="grid grid-cols-2 gap-2">{WORLDS.map(row)}</div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
