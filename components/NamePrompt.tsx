"use client";

import { useState, type FormEvent } from "react";

export default function NamePrompt({
  onSubmit,
}: {
  onSubmit: (name: string) => void;
}) {
  const [value, setValue] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed.slice(0, 24));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-violet-500/20 bg-slate-900 p-6 shadow-[0_0_40px_rgba(139,92,246,0.2)]"
      >
        <h2 className="font-display text-lg font-semibold text-slate-100">
          ¿Cómo te llamás?
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Tu nombre se mostrará a los demás jugadores de la sala.
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Tu nombre"
          maxLength={24}
          className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="mt-4 w-full rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 py-2 font-medium text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          Entrar a la sala
        </button>
      </form>
    </div>
  );
}
