"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, MessagesSquare } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase";
import { subscribeCalls, subscribeOnline } from "@/lib/plaza";

/** The home's way into the Plaza: who's there now and how many rooms want players. */
export default function PlazaBanner() {
  const [people, setPeople] = useState(0);
  const [calls, setCalls] = useState(0);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const a = subscribeOnline((p) => setPeople(p.length));
    const b = subscribeCalls((c) => setCalls(c.length));
    return () => {
      a();
      b();
    };
  }, []);

  const live = [people > 0 && `${people} ${people === 1 ? "persona" : "personas"} ahora`, calls > 0 && `${calls} ${calls === 1 ? "sala busca" : "salas buscan"} gente`]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href="/plaza"
      className="group flex items-center gap-4 rounded-[24px] bg-talo-ink p-5 text-white transition-transform duration-200 hover:-translate-y-1 sm:gap-6 sm:p-7"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-talo-hero text-talo-ink sm:h-16 sm:w-16">
        <MessagesSquare className="h-6 w-6 sm:h-8 sm:w-8" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-display text-[24px] leading-none text-talo-hero sm:text-[32px]">La Plaza</span>
        <span className="text-[15px] font-medium leading-snug text-white/85 sm:text-[17px]">
          ¿Son pocos? Encontrá gente para jugar y sumate a las salas que buscan jugadores.
        </span>
        {live && (
          <span className="flex items-center gap-2 text-sm font-bold text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> {live}
          </span>
        )}
      </span>
      <ArrowRight className="h-6 w-6 shrink-0 text-talo-hero transition-transform group-hover:translate-x-1" />
    </Link>
  );
}
