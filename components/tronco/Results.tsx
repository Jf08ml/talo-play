"use client";

import { Crown } from "lucide-react";
import { playerInfo, type TroncoState } from "@/lib/troncoRoom";
import { Confetti } from "@/components/Results";
import { CARD } from "@/components/ui";

/**
 * The end of a match: who lasted longest first (the winner, then by when each
 * one fell). `big` is the TV version (bigger type, no "Tú").
 */
export default function TroncoResults({ state, myId, big = false }: { state: TroncoState; myId: string; big?: boolean }) {
  const order = [...state.roster].sort((a, b) => {
    if (a === state.winner) return -1;
    if (b === state.winner) return 1;
    return (state.out[b] ?? Infinity) - (state.out[a] ?? Infinity);
  });
  const iWon = !!myId && state.winner === myId;
  const winner = playerInfo(state, state.winner);
  const wins = state.wins[myId] ?? 0;
  const secs = (id: string) => Math.max(0, Math.round(((state.out[id] ?? 0) - state.startedAt) / 1000));
  return (
    <div className={`${CARD} flex flex-col ${big ? "gap-6 !p-8" : "gap-4"}`}>
      {(iWon || (big && state.winner)) && <Confetti />}
      <div className="text-center">
        <p className={`font-display text-white ${big ? "text-6xl" : "text-3xl"}`}>
          {iWon ? "¡Quedaste en pie!" : state.winner ? `¡Ganó ${winner.name}!` : "¡Terminó!"}
        </p>
        {wins > 1 && <p className="mt-1 text-xs text-white/50">Llevas {wins} ganadas</p>}
      </div>
      <ol className={`flex flex-col ${big ? "gap-2" : "gap-1.5"}`}>
        {order.map((id, i) => {
          const info = playerInfo(state, id);
          const w = state.wins[id] ?? 0;
          return (
            <li key={id} className={`flex items-center gap-3 rounded-xl px-3 ${big ? "py-3" : "py-2"} ${id === myId ? "bg-white/[0.08]" : ""}`}>
              <span className={`w-8 font-display text-white/70 ${big ? "text-3xl" : "text-lg"}`}>{i + 1}</span>
              <span className={`shrink-0 rounded-full ${big ? "h-5 w-5" : "h-3 w-3"}`} style={{ background: info.color }} />
              <span className={`min-w-0 flex-1 truncate font-bold text-white ${big ? "text-2xl" : "text-sm"}`}>
                {id === myId ? "Tú" : info.name}
                {big && w > 0 && <span className="ml-2 text-base font-normal text-white/50">{w === 1 ? "1 ganada" : `${w} ganadas`}</span>}
              </span>
              {id === state.winner ? (
                <Crown className={`text-talo-hero ${big ? "h-7 w-7" : "h-4 w-4"}`} />
              ) : (
                <span className={`font-mono text-white/60 ${big ? "text-lg" : "text-xs"}`}>cayó a los {secs(id)} s</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
