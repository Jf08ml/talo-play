"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * "¿Te invitaron?": join any room by code. Goes through `/sala/{code}`, which
 * looks up the room's game and redirects, so it works for every game.
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
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-2xl border border-cyan-400/20 bg-slate-900/60 p-3 backdrop-blur sm:flex-row sm:items-center sm:gap-3 sm:pl-5"
    >
      <span className="text-sm font-medium text-slate-300">¿Te invitaron?</span>
      <div className="flex flex-1 gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Código de sala"
          maxLength={6}
          autoComplete="off"
          aria-label="Código de sala"
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-center font-mono text-lg tracking-widest text-slate-100 outline-none placeholder:text-sm placeholder:tracking-normal placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
        />
        <button
          type="submit"
          disabled={!code.trim()}
          className="rounded-lg bg-cyan-500/20 px-4 font-semibold text-cyan-200 ring-1 ring-cyan-400/40 transition hover:bg-cyan-500/30 disabled:opacity-40"
        >
          Entrar
        </button>
      </div>
    </form>
  );
}
