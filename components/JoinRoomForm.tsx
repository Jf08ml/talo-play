"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

/**
 * "¿Te invitaron?": join any room by code. Goes through `/sala/{code}`, which
 * looks up the room's game and redirects, so it works for every game.
 *
 * The code is typed over six gray boxes: a monospaced font whose advance plus
 * the letter spacing equals one box plus its gap, so each letter lands in its
 * box. Codes have letters and digits (lib/ids.ts).
 */
export default function JoinRoomForm({ id = "join-code" }: { id?: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!code) return;
    router.push(`/sala/${code}`);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5 sm:gap-3">
      <label htmlFor={id} className="text-[15px] font-bold text-talo-ink">
        ¿Te invitaron? Escribí el código
      </label>
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Boxes 39.6/44 px wide with 6/8 px gaps; JetBrains Mono advances 0.6em. */}
        <div className="relative h-[54px] w-[268px] shrink-0 overflow-hidden rounded-[10px] outline-offset-3 outline-talo-blue focus-within:outline-3 sm:h-[60px] sm:w-[304px]">
          <div aria-hidden="true" className="absolute inset-0 flex gap-1.5 sm:gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="h-full flex-1 rounded-[10px] bg-talo-surface" />
            ))}
          </div>
          <input
            id={id}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6))}
            maxLength={6}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="······"
            className="absolute inset-y-0 left-0 w-[calc(100%+40px)] bg-transparent pl-[12.3px] font-code text-[25px] tracking-[30.6px] text-talo-ink outline-none placeholder:text-[#C4C4C4] sm:pl-[13px] sm:text-[30px] sm:tracking-[34px]"
          />
        </div>
        <button
          type="submit"
          aria-label="Entrar a la sala"
          className="flex h-[54px] min-w-[54px] flex-1 items-center justify-center gap-2 rounded-xl bg-talo-ink px-5 text-lg font-bold text-white transition hover:bg-black sm:h-[60px] sm:flex-none sm:px-[26px]"
        >
          <span className="hidden sm:inline">Entrar</span>
          <ArrowRight className="h-[22px] w-[22px] sm:hidden" strokeWidth={2.6} />
        </button>
      </div>
    </form>
  );
}
