"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check, Sparkles } from "lucide-react";
import { useAccount } from "@/components/AccountProvider";
import { seatOf, subscribeRaceStats, type CarrerasState } from "@/lib/carreras";
import {
  CAR_PROGRESS_EVENT,
  EMPTY_RACE,
  applyRace,
  levelOf,
  loadCarProgress,
  storeCarProgress,
  validCarLook,
  type CarLookIds,
  type RaceStats,
} from "@/lib/carrerasProgress";
import { pushCarProgress } from "@/lib/carrerasProgressSync";

/** My look and level, kept current (they go with me into the room). */
export function useMyCarLook(): { look: CarLookIds; lv: number } | null {
  const [mine, setMine] = useState<{ look: CarLookIds; lv: number } | null>(null);
  useEffect(() => {
    const read = () => {
      const p = loadCarProgress();
      const lv = levelOf(p.xp).level;
      setMine({ look: validCarLook(p.look, lv), lv });
    };
    read();
    window.addEventListener(CAR_PROGRESS_EVENT, read);
    return () => window.removeEventListener(CAR_PROGRESS_EVENT, read);
  }, []);
  return mine;
}

/** What a race gave me, for the results. */
export interface RaceReward {
  gained: number;
  missions: string[];
  levelsUp: number;
  level: number;
  into: number;
  need: number;
  stats: RaceStats;
}

const LAST_KEY = "carreras.ultimaCarrera";
/** Fired on `window` when a race's reward is saved. */
const REWARD_EVENT = "carreras-reward";

function readLast(): string {
  try {
    return localStorage.getItem(LAST_KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribeLast(cb: () => void) {
  window.addEventListener(REWARD_EVENT, cb);
  return () => window.removeEventListener(REWARD_EVENT, cb);
}
/** How long to wait for my car's counts (written by the big screen or my phone) before counting without them. */
const STATS_WAIT_MS = 4000;

/**
 * When a race I drove closes: experience and the day's missions, once per
 * race (`carreras.ultimaCarrera` remembers it, so a reload shows the same
 * summary and never counts twice). My car's counts come from whoever ran it.
 */
export function useRaceReward(roomId: string, state: CarrerasState | null, myId: string, enabled: boolean): RaceReward | null {
  const { user } = useAccount();
  const uid = user?.uid;
  const seat = state ? seatOf(state, myId) : null;
  const drove = !!state && !!seat && state.racers.includes(seat);
  const finished = state?.status === "finished";
  const gameNo = state?.gameNo ?? 0;
  const key = `${roomId}:${gameNo}`;
  // The last race's reward, as saved (a reload shows it again; it's never counted twice).
  const lastRaw = useSyncExternalStore(subscribeLast, readLast, () => "");
  const reward = useMemo(() => {
    try {
      return lastRaw ? (JSON.parse(lastRaw) as { key: string; r: RaceReward }) : null;
    } catch {
      return null;
    }
  }, [lastRaw]);
  const [stats, setStats] = useState<(RaceStats & { g: number }) | null>(null);
  const [waited, setWaited] = useState("");

  useEffect(() => {
    if (!enabled || !seat) return;
    return subscribeRaceStats(roomId, seat, setStats);
  }, [enabled, roomId, seat]);

  useEffect(() => {
    if (!enabled || !finished || !drove) return;
    const t = setTimeout(() => setWaited(key), STATS_WAIT_MS);
    return () => clearTimeout(t);
  }, [enabled, finished, drove, key]);

  useEffect(() => {
    if (!enabled || !finished || !drove || !state || !seat || reward?.key === key) return;
    const mine = stats && stats.g === gameNo ? stats : null;
    if (!mine && waited !== key) return;
    // My place: finishers by time, then those who didn't finish.
    const times = Object.values(state.results).filter((ms): ms is number => typeof ms === "number");
    const myTime = state.results[seat];
    const place = 1 + (myTime === undefined ? times.length : times.filter((ms) => ms < myTime).length);
    const raceStats: RaceStats = mine
      ? { b: mine.b ?? 0, j: mine.j ?? 0, air: mine.air ?? 0, w: mine.w ?? 0, p: mine.p ?? 0, l: mine.l ?? 0, m: mine.m ?? 0, mp: mine.mp ?? 0, t: mine.t ?? 0, r: mine.r ?? 0 }
      : EMPTY_RACE;
    const { next, gained, completed, levelsUp } = applyRace(loadCarProgress(), {
      played: true,
      place,
      players: state.racers.length,
      finished: myTime !== undefined,
      stats: raceStats,
    });
    storeCarProgress(next);
    if (uid) pushCarProgress(uid, next);
    const { level, into, need } = levelOf(next.xp);
    const r: RaceReward = { gained, missions: completed.map((m) => m.text), levelsUp, level, into, need, stats: raceStats };
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ key, r }));
      window.dispatchEvent(new Event(REWARD_EVENT));
    } catch {}
  }, [enabled, finished, drove, state, seat, stats, waited, key, gameNo, uid, reward?.key]);

  return enabled && finished && reward?.key === key ? reward.r : null;
}

/** Under the standings: the experience earned, the level bar, the missions completed and the race's numbers. */
export function RaceRewardCard({ reward }: { reward: RaceReward }) {
  const s = reward.stats;
  return (
    <div className="w-full max-w-md rounded-2xl bg-slate-950/85 p-4 text-slate-100 ring-1 ring-white/10 backdrop-blur">
      {reward.levelsUp > 0 && (
        <p className="mb-2 flex items-center justify-center gap-1.5 rounded-xl bg-talo-hero px-3 py-1.5 font-display text-lg text-talo-ink">
          <Sparkles className="h-5 w-5" /> ¡Subiste al nivel {reward.level}!
        </p>
      )}
      <div className="flex items-baseline justify-between">
        <p className="font-display text-lg">+{reward.gained} XP</p>
        <p className="text-sm text-slate-400">Nivel {reward.level}</p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-talo-hero" style={{ width: `${(reward.into / reward.need) * 100}%` }} />
      </div>
      {reward.missions.map((m) => (
        <p key={m} className="mt-2 flex items-center gap-1.5 text-sm text-lime-200">
          <Check className="h-4 w-4 shrink-0" /> Misión cumplida: {m}
        </p>
      ))}
      <p className="mt-2 text-xs text-slate-400">
        {s.p} {s.p === 1 ? "adelantamiento" : "adelantamientos"} · {s.j} {s.j === 1 ? "salto" : "saltos"} · {s.b} {s.b === 1 ? "turbo" : "turbos"} ·{" "}
        {s.m ?? 0} {(s.m ?? 0) === 1 ? "mini-turbo" : "mini-turbos"} · {s.t ?? 0} {(s.t ?? 0) === 1 ? "truco" : "trucos"} ·{" "}
        {s.w === 0 ? "sin choques" : `${s.w} ${s.w === 1 ? "choque" : "choques"}`}
      </p>
    </div>
  );
}
