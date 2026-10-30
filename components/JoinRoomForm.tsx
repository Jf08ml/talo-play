"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

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
    <form onSubmit={submit} className="w-full">
      <label htmlFor="join-code" className="mb-2 block text-sm font-medium text-slate-300">
        ¿Te invitaron? Entrá con el código
      </label>
      <div className="flex gap-2 rounded-xl border border-white/10 bg-slate-950/60 p-1.5 transition focus-within:border-violet-400/70 focus-within:ring-4 focus-within:ring-violet-500/15">
        <input
          id="join-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          maxLength={6}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent px-2.5 font-mono text-lg uppercase tracking-[0.3em] text-slate-100 outline-none placeholder:text-slate-600"
        />
        <button
          type="submit"
          disabled={!code.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:bg-white/10 disabled:text-slate-500"
        >
          Entrar <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
