"use client";

import { useState, type FormEvent } from "react";
import { GAMES, type GameId } from "@/lib/games";
import { categoryOf, gameColors } from "@/lib/talos";
import { Talo } from "./Talo";

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

  const invite = invitedTo && gameColors(invitedTo);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
      onKeyDown={(e) => e.key === "Escape" && onCancel?.()}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="talo-light w-full max-w-sm overflow-hidden rounded-[28px]"
      >
        {invitedTo && invite && (
          <div
            className="relative flex h-32 flex-col justify-start overflow-hidden px-6 pt-5"
            style={{ background: invite.color, color: invite.ink }}
          >
            <span className="text-[13px] font-bold">Te invitaron a jugar</span>
            <span className="font-display text-2xl leading-tight">{GAMES[invitedTo].title}</span>
            <span className="sr-only">en Talo, {categoryOf(invitedTo).label}</span>
            <span aria-hidden="true" className="absolute -bottom-6 right-5 flex items-end gap-2">
              <Talo w={58} h={58} color="#111111" radius="50%" look={[-1, -0.4]} blinkDelay="1.2s" />
              <Talo w={44} h={74} color="#FFFFFF" radius="22px 22px 10px 10px" look={[-1, -0.6]} blinkDelay="3s" />
            </span>
          </div>
        )}
        <div className="p-6">
          <h2 className="font-display text-[28px] leading-tight">¿Cómo te llamás?</h2>
          <p className="mt-1.5 text-[15px] text-talo-text-2">
            Así te van a ver los demás jugadores. No hace falta registrarse.
          </p>
          <label htmlFor="player-name" className="sr-only">
            Tu nombre
          </label>
          <input
            id="player-name"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Tu nombre"
            maxLength={24}
            className="mt-5 h-14 w-full rounded-xl bg-talo-surface px-4 text-lg font-semibold text-talo-ink outline-none placeholder:font-medium placeholder:text-[#8a8a8a]"
          />
          <div className="mt-4 flex gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="min-h-[54px] flex-1 rounded-[14px] border-2 border-talo-ink font-bold text-talo-ink transition hover:bg-talo-surface"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={!value.trim()}
              className="min-h-[54px] flex-1 rounded-[14px] bg-talo-ink text-[17px] font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#cfcfcf] disabled:text-[#6b6b6b]"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
