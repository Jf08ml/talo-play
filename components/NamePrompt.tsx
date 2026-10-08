"use client";

import { useState, type FormEvent } from "react";
import { GAMES, type GameId } from "@/lib/games";
import { TaloMark } from "./TaloLogo";
import GameIcon from "./GameIcon";

export default function NamePrompt({
  onSubmit,
  onCancel,
  initialValue = "",
  submitLabel = "Entrar",
  invitedTo,
}: {
  onSubmit: (name: string) => void;
  /** When provided the prompt can be dismissed (e.g. when changing an existing name). */
  onCancel?: () => void;
  initialValue?: string;
  submitLabel?: string;
  /** Shown to people arriving by an invite link, so they know what they're joining. */
  invitedTo?: GameId;
}) {
  const [value, setValue] = useState(initialValue);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed.slice(0, 24));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
      onKeyDown={(e) => e.key === "Escape" && onCancel?.()}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-violet-500/20 bg-slate-900 p-6 shadow-[0_0_40px_rgba(139,92,246,0.2)]"
      >
        {invitedTo && (
          <div className="mb-4 flex items-center gap-3 rounded-xl bg-violet-500/10 p-3 ring-1 ring-violet-400/20">
            <TaloMark className="h-8 w-8 shrink-0" />
            <p className="text-sm text-slate-300">
              Te invitaron a jugar{" "}
              <span className="inline-flex items-center gap-1 align-middle font-semibold text-slate-100">
                <GameIcon game={invitedTo} size="sm" /> {GAMES[invitedTo].title}
              </span>{" "}
              en Talo
            </p>
          </div>
        )}
        <h2 className="font-display text-lg font-semibold text-slate-100">
          ¿Cómo te llamás?
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Así te van a ver los demás jugadores. No hace falta registrarse.
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Tu nombre"
          maxLength={24}
          className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
        />
        <div className="mt-4 flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-slate-700 py-2 font-medium text-slate-300 transition hover:bg-slate-800"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={!value.trim()}
            className="flex-1 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 py-2 font-medium text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
