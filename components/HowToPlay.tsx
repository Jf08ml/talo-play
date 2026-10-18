"use client";

import { useEffect, useState } from "react";
import { BookOpen, Lightbulb, Target, X } from "lucide-react";
import { GAMES, type GameId } from "@/lib/games";
import { GUIDES } from "@/lib/guides";
import { trackEvent } from "@/lib/analytics";
import GuideArt from "./GuideArt";
import GameIcon from "./GameIcon";

/** A game's full instructions: goal, numbered sections (with diagrams) and tips. */
export function GuideBody({ game }: { game: GameId }) {
  const guide = GUIDES[game];
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="flex gap-2 rounded-xl bg-violet-500/10 p-3 text-violet-100 ring-1 ring-violet-400/20">
        <Target className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
        <span>
          <span className="font-semibold">Objetivo: </span>
          {guide.goal}
        </span>
      </p>
      <ol className="flex flex-col gap-4">
        {guide.sections.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-200">
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="font-semibold text-slate-100">{s.title}</p>
              {s.text.map((t) => (
                <p key={t} className="leading-relaxed text-slate-400">
                  {t}
                </p>
              ))}
              {s.art && (
                <div className="mt-1 max-w-md">
                  <GuideArt art={s.art} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {guide.tips && (
        <div className="rounded-xl bg-amber-400/5 p-3 ring-1 ring-amber-300/15">
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-amber-200">
            <Lightbulb className="h-4 w-4" /> Consejos
          </p>
          <ul className="list-disc space-y-1 pl-5 text-slate-400">
            {guide.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The instructions in a dialog over the page (Esc or the backdrop closes it). */
export function RulesDialog({ game, onClose }: { game: GameId; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Cómo se juega ${GAMES[game].title}`}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-violet-500/20 bg-slate-900 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-slate-800 px-4 py-3">
          <GameIcon game={game} size="sm" />
          <p className="flex-1 font-display font-semibold text-slate-100">Cómo se juega {GAMES[game].title}</p>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">
          <GuideBody game={game} />
        </div>
      </div>
    </div>
  );
}

/** A button that opens the game's instructions. */
export function RulesButton({
  game,
  where,
  className,
  label = "Reglas",
}: {
  game: GameId;
  where: "lobby" | "sala" | "partida";
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          trackEvent("open_rules", { game, where });
          setOpen(true);
        }}
        className={
          className ??
          "flex items-center gap-1.5 rounded-md bg-violet-500/15 px-2.5 py-1 text-xs font-semibold text-violet-200 ring-1 ring-violet-400/30 transition hover:bg-violet-500/25"
        }
      >
        <BookOpen className="h-3.5 w-3.5" />
        {label}
      </button>
      {open && <RulesDialog game={game} onClose={() => setOpen(false)} />}
    </>
  );
}
