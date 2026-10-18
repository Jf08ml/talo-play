"use client";

import { useEffect, useState } from "react";
import {
  CARS,
  FINISH_GRACE_MS,
  backToWaiting,
  closeRace,
  racersOf,
  rematch,
  seatOf,
  standings,
  type CarrerasState,
  type Seat,
} from "@/lib/carreras";
import type { CameraMode } from "@/lib/carreras3d";
import type { PresenceMap } from "@/lib/presence";
import { serverNow } from "@/lib/serverTime";
import { formatRaceTime } from "@/lib/format";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import { Shuffle } from "lucide-react";

export function CarDot({ seat, className = "h-5 w-8" }: { seat: Seat; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-md ${className}`}
      style={{ backgroundColor: CARS[seat].color, boxShadow: `0 0 10px ${CARS[seat].glow}` }}
    />
  );
}

export function driverName(state: CarrerasState, seat: Seat, myId = ""): string {
  const id = state.seats[seat];
  if (id && id === myId) return "Vos";
  return state.players[id]?.name ?? CARS[seat].label;
}

/**
 * Once someone finished, closes the race when the grace time runs out or
 * when everyone still driving has left. Any client can do it (idempotent).
 */
export function useRaceCloser(roomId: string, state: CarrerasState | null, presence: PresenceMap, presenceLoaded: boolean) {
  const racing = state?.status === "racing" && state.firstAt > 0;
  const gameNo = state?.gameNo ?? 0;
  const firstAt = state?.firstAt ?? 0;
  const pending = state && racing ? racersOf(state).filter((seat) => state.results[seat] === undefined) : [];
  const othersGone = presenceLoaded && pending.every((seat) => !(state!.seats[seat] in presence));

  useEffect(() => {
    if (!racing) return;
    if (othersGone) {
      closeRace(roomId, gameNo, true).catch(console.error);
      return;
    }
    const wait = Math.max(0, firstAt + FINISH_GRACE_MS - serverNow()) + 200;
    const id = setTimeout(() => closeRace(roomId, gameNo, false).catch(console.error), wait);
    return () => clearTimeout(id);
  }, [racing, othersGone, roomId, gameNo, firstAt]);
}

const CAMERA_KEY = "carreras.camera";

/** Behind the car or from the cockpit, remembered per device. */
export function useCameraMode(): [CameraMode, () => void] {
  const [mode, setMode] = useState<CameraMode>(() => {
    try {
      return localStorage.getItem(CAMERA_KEY) === "cabina" ? "cabina" : "detras";
    } catch {
      return "detras";
    }
  });
  const toggle = () =>
    setMode((m) => {
      const next = m === "detras" ? "cabina" : "detras";
      try {
        localStorage.setItem(CAMERA_KEY, next);
      } catch {
        // Not remembered, that's all.
      }
      return next;
    });
  return [mode, toggle];
}

const SOUND_KEY = "carreras.sound";

/** Sound on or off, remembered per device (on by default). */
export function useSoundSetting(): [boolean, () => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const toggle = () =>
    setOn((v) => {
      try {
        localStorage.setItem(SOUND_KEY, v ? "off" : "on");
      } catch {
        // Not remembered, that's all.
      }
      return !v;
    });
  return [on, toggle];
}

/** Final positions with times, plus rematch (on a new track too, if it's random) / change drivers. */
export function Standings({
  roomId,
  state,
  myId = "",
  big = false,
  randomTrack = false,
}: {
  roomId: string;
  state: CarrerasState;
  myId?: string;
  big?: boolean;
  randomTrack?: boolean;
}) {
  const rows = standings(state);
  const mySeat = seatOf(state, myId);
  const winner = state.winner || null;
  const title = !winner
    ? "Nadie llegó a la meta"
    : winner === mySeat
      ? "🏆 ¡Ganaste!"
      : `🏆 ¡Ganó ${driverName(state, winner, myId)}!`;
  return (
    <div
      className={`animate-celebration-in flex w-full flex-col items-center gap-4 rounded-3xl bg-slate-950/90 text-center shadow-2xl ring-1 ring-white/10 backdrop-blur ${
        big ? "max-w-xl px-10 py-8" : "max-w-sm p-5"
      }`}
    >
      <p
        className={`font-display font-bold ${big ? "text-5xl" : "text-2xl"}`}
        style={{ color: winner ? CARS[winner].color : "#e2e8f0" }}
      >
        {title}
      </p>
      <ol className="flex w-full flex-col gap-1.5">
        {rows.map(({ seat, ms }, i) => (
          <li
            key={seat}
            className={`flex items-center gap-3 rounded-xl bg-slate-900/80 px-3 py-2 ${big ? "text-xl" : "text-sm"}`}
          >
            <span className="w-8 font-display font-bold text-slate-300">{ms !== null ? `${i + 1}°` : "–"}</span>
            <CarDot seat={seat} className={big ? "h-6 w-10" : "h-4 w-7"} />
            <span className="min-w-0 flex-1 truncate text-left text-slate-100">
              {driverName(state, seat, myId)}
              {state.wins[state.seats[seat]] ? (
                <span className="text-slate-500"> · {state.wins[state.seats[seat]]} ganadas</span>
              ) : null}
            </span>
            <span className="font-mono text-slate-300">{ms !== null ? formatRaceTime(ms) : "no llegó"}</span>
          </li>
        ))}
      </ol>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <button onClick={() => rematch(roomId, state.gameNo)} className={`${big ? "text-lg" : ""} ${PRIMARY_BUTTON}`}>
          Revancha
        </button>
        {randomTrack && (
          <button onClick={() => rematch(roomId, state.gameNo, true)} className={`${SECONDARY_BUTTON} flex items-center justify-center gap-2`}>
            <Shuffle className="h-4 w-4" /> Revancha en otra pista
          </button>
        )}
        <button onClick={() => backToWaiting(roomId, state.gameNo)} className={SECONDARY_BUTTON}>
          Cambiar pilotos, pista o vueltas
        </button>
      </div>
    </div>
  );
}
