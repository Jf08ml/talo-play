"use client";

import type { ReactNode } from "react";
import { ArrowLeftRight } from "lucide-react";
import { SEATS2, seatOf2, type Seat2, type SeatPlayer } from "@/lib/twoSeats";
import type { PresenceMap } from "@/lib/presence";

interface SeatsView {
  seats: Record<Seat2, string>;
  players: Record<string, SeatPlayer>;
}

export function seatName(state: SeatsView, id: string, myId: string): string {
  if (id === myId) return "Vos";
  return state.players[id]?.name ?? "?";
}

/** The two seats of a one-on-one game, for the waiting room. */
export default function TwoSeatPicker({
  state,
  myId,
  isAway,
  labels,
  onTake,
  onLeave,
  onSwap,
  note,
}: {
  state: SeatsView;
  myId: string;
  isAway: (id: string) => boolean;
  labels: Record<Seat2, { label: string; piece: ReactNode }>;
  onTake: (seat: Seat2, occupant: string) => void;
  onLeave: () => void;
  onSwap: () => void;
  /** Shown under the seats once both are taken and I'm playing. */
  note: string;
}) {
  const mySeat = seatOf2(state, myId);
  const ready = state.seats.a && state.seats.b;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        {SEATS2.map((seat, i) => {
          const occupant = state.seats[seat];
          const free = !occupant || isAway(occupant);
          return [
            i === 1 && (
              <button
                key="swap"
                onClick={onSwap}
                disabled={!ready}
                title="Cambiar colores"
                aria-label="Cambiar colores"
                className="self-center rounded-full border border-slate-700 p-2 text-slate-400 transition hover:text-slate-100 disabled:opacity-30"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>
            ),
            <div
              key={seat}
              className="flex flex-col items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/40 p-3 text-center"
            >
              {labels[seat].piece}
              <p className="text-xs uppercase tracking-wide text-slate-500">{labels[seat].label}</p>
              <p className={`text-sm font-medium ${occupant && !isAway(occupant) ? "text-slate-100" : "text-slate-500"}`}>
                {occupant ? seatName(state, occupant, myId) : "Libre"}
                {occupant && isAway(occupant) && " (se fue)"}
              </p>
              {occupant !== myId && free && (
                <button
                  onClick={() => onTake(seat, occupant)}
                  className="rounded-md border border-cyan-400/60 px-3 py-1 text-xs font-medium text-cyan-300"
                >
                  Jugar con estas
                </button>
              )}
              {occupant === myId && (
                <button onClick={onLeave} className="text-xs text-slate-500 hover:text-slate-300">
                  Prefiero mirar
                </button>
              )}
            </div>,
          ];
        })}
      </div>
      <p className="text-center text-xs text-slate-500">
        {!ready
          ? "Falta un jugador: mandale el link a tu rival."
          : mySeat
            ? note
            : "Las dos sillas están ocupadas: vas a mirar la partida."}
      </p>
    </div>
  );
}

/** "Mirando: …" under the board. */
export function Spectators({ state, presence, myId }: { state: SeatsView; presence: PresenceMap; myId: string }) {
  const watching = Object.keys(presence).filter((id) => !seatOf2(state, id));
  if (watching.length === 0) return null;
  return (
    <p className="text-center text-xs text-slate-500">
      Mirando: {watching.map((id) => (id === myId ? "vos" : (presence[id]?.name ?? "?"))).join(", ")}
    </p>
  );
}
