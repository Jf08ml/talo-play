"use client";

import { useEffect, useState } from "react";
import {
  CARS,
  BOT_NAMES,
  SEATS,
  FINISH_GRACE_MS,
  backToWaiting,
  closeRace,
  isBotSeat,
  racersOf,
  rematch,
  seatOf,
  standings,
  type CarrerasState,
  type Seat,
} from "@/lib/carreras";
import type { CameraMode, CarLook } from "@/lib/carreras3d";
import { TRICK_SECONDS, driftTier, type Car } from "@/lib/carrerasTrack";
import { DEFAULT_CAR_LOOK, botCarLook, carPaint, validCarLook } from "@/lib/carrerasProgress";
import type { PresenceMap } from "@/lib/presence";
import { serverNow } from "@/lib/serverTime";
import { formatRaceTime } from "@/lib/format";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import { Shuffle, Timer } from "lucide-react";

export function CarDot({ seat, className = "h-5 w-8" }: { seat: Seat; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-md ${className}`}
      style={{ backgroundColor: CARS[seat].color, boxShadow: `0 0 10px ${CARS[seat].glow}` }}
    />
  );
}

export function driverName(state: CarrerasState, seat: Seat, myId = ""): string {
  if (isBotSeat(state, seat)) return `${BOT_NAMES[seat]} (bot)`;
  const id = state.seats[seat];
  if (id && id === myId) return "Tú";
  return state.players[id]?.name ?? CARS[seat].label;
}

/** What the scene shows of a car's drift (side × (1 + mini-turbo)) and trick spin (0…1). */
export function stuntOf(car: Car): { drift: number; spin: number } {
  return {
    drift: car.drift ? car.drift * (1 + driftTier(car)) : 0,
    spin: car.trick > 0 ? 1 - car.trick / TRICK_SECONDS : 0,
  };
}

/** A bot's level for its looks, by how well it drives. */
const BOT_LOOK_LEVEL = { facil: 3, normal: 8, dificil: 14 } as const;

/**
 * How a seat's car looks on every screen: the driver's own look (only what
 * their level unlocks) with "Nombre · Nv N" on its tag, a seeded look for a
 * bot, or the seat's plain car. The tag keeps the seat's color, so a
 * repainted car is still easy to match with the tags and the minimap.
 */
export function seatCarLook(state: CarrerasState, seat: Seat, label = driverName(state, seat)): CarLook {
  const index = SEATS.indexOf(seat);
  const player = isBotSeat(state, seat) ? undefined : state.players[state.seats[seat]];
  const lv = Math.max(0, Math.floor(player?.lv ?? 0));
  const ids = player?.look
    ? validCarLook(player.look, Math.max(1, lv))
    : isBotSeat(state, seat)
      ? botCarLook(state.trackSeed * 7 + index + 1, BOT_LOOK_LEVEL[state.botLevel] ?? 8)
      : DEFAULT_CAR_LOOK;
  const p = carPaint(ids, CARS[seat].color, CARS[seat].accent, index + 1);
  return {
    body: p.body,
    color: p.color,
    accent: p.accent,
    number: p.number,
    label: lv ? `${label} · Nv ${lv}` : label,
    tag: CARS[seat].color,
    metal: p.metal || undefined,
    rims: p.rims,
    rimGlow: p.rimGlow || undefined,
    neon: p.neon || undefined,
    flames: p.flames,
  };
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
  // Bots are always there (whoever runs them is): with bots still driving, the grace time decides.
  const othersGone = presenceLoaded && pending.every((seat) => !isBotSeat(state!, seat) && !(state!.seats[seat] in presence));

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
  const fastest = rows.reduce<{ seat: Seat; ms: number } | null>((best, { seat }) => {
    const ms = state.best[seat];
    return ms && (!best || ms < best.ms) ? { seat, ms } : best;
  }, null);
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
            <span className="flex flex-col items-end leading-tight">
              <span className="font-mono text-slate-300">{ms !== null ? formatRaceTime(ms) : "no llegó"}</span>
              {state.best[seat] ? (
                <span
                  className={`font-mono ${big ? "text-sm" : "text-[11px]"} ${fastest?.seat === seat ? "font-bold text-fuchsia-300" : "text-slate-500"}`}
                  title={fastest?.seat === seat ? "Vuelta más rápida" : "Mejor vuelta"}
                >
                  <Timer className="mr-0.5 inline h-3 w-3" />
                  {formatRaceTime(state.best[seat]!)}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      {fastest && (
        <p className={`${big ? "text-base" : "text-xs"} text-slate-400`}>
          Vuelta más rápida: <span className="font-semibold text-fuchsia-300">{driverName(state, fastest.seat, myId)}</span>{" "}
          <span className="font-mono">{formatRaceTime(fastest.ms)}</span>
        </p>
      )}
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
