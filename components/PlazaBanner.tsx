"use client";

import { useEffect, useState } from "react";
import { ArrowRight, MessagesSquare } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase";
import { subscribeCalls, subscribeOnline } from "@/lib/plaza";
import { useActiveCount, usePlaza } from "./PlazaProvider";

/** The home's card for the Plaza: how many are on Talo now, who's chatting, rooms that want players. Opens the drawer. */
export default function PlazaBanner() {
  const { show } = usePlaza();
  const active = useActiveCount();
  const [inPlaza, setInPlaza] = useState(0);
  const [calls, setCalls] = useState(0);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const a = subscribeOnline((p) => setInPlaza(p.length));
    const b = subscribeCalls((c) => setCalls(c.length));
    return () => {
      a();
      b();
    };
  }, []);

  const extra = [inPlaza > 0 && `${inPlaza} en la Plaza`, calls > 0 && `${calls} ${calls === 1 ? "sala busca" : "salas buscan"} gente`]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      onClick={() => show("inicio")}
      className="group flex w-full items-center gap-4 rounded-[24px] bg-talo-ink p-5 text-left text-white transition-transform duration-200 hover:-translate-y-1 sm:gap-6 sm:p-7"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-talo-hero text-talo-ink sm:h-16 sm:w-16">
        <MessagesSquare className="h-6 w-6 sm:h-8 sm:w-8" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-[24px] leading-none text-talo-hero sm:text-[32px]">La Plaza</span>
          {active > 0 && (
            <span className="flex items-center gap-1.5 text-[15px] font-bold text-emerald-300 sm:text-[17px]">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              {active} {active === 1 ? "jugador activo" : "jugadores activos"} en Talo
            </span>
          )}
        </span>
        <span className="text-[15px] font-medium leading-snug text-white/85 sm:text-[17px]">
          ¿Son pocos? Encuentra gente para jugar y únete a las salas que buscan jugadores.
        </span>
        {extra && <span className="text-sm font-semibold text-white/60">{extra}</span>}
      </span>
      <ArrowRight className="h-6 w-6 shrink-0 text-talo-hero transition-transform group-hover:translate-x-1" />
    </button>
  );
}
