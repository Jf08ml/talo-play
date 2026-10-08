"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CARD, SECONDARY_BUTTON } from "./ui";

/**
 * Join any room by code. Goes through `/sala/{code}`, which looks up the
 * room's game and redirects, so it works from any lobby for any game.
 */
export default function JoinRoomForm() {
  const router = useRouter();
  const [code, setCode] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    router.push(`/sala/${trimmed}`);
  };

  return (
    <form onSubmit={submit} className={`${CARD} flex flex-col gap-4`}>
      <h2 className="font-display text-lg font-semibold text-slate-100">Unirse a una sala</h2>
      <p className="text-sm text-slate-400">
        Pedile el código de sala a quien te invitó (o abrí directamente el enlace que te
        compartió).
      </p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Código de sala"
        maxLength={6}
        className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-center font-mono text-lg tracking-widest text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
      />
      <button type="submit" disabled={!code.trim()} className={`mt-auto ${SECONDARY_BUTTON}`}>
        Unirme
      </button>
    </form>
  );
}
