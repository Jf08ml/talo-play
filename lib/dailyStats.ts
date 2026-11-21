// Activity per day, kept in our own database so it outlives the room cleanup
// (lib/roomCleanup.ts deletes idle rooms, and with them any trace of the day
// they were played). Read by the internal page `/estadisticas`.
//
// `rooms/_stats/days/d{yyyymmdd}` (Argentina's day, like Viborita's and
// Puentes' daily tops):
//   visits       browsers that opened Talo that day (once per browser and day)
//   new          of those, browsers never seen before
//   plays/{game} people entering a room (once per browser and room, like
//                `rooms/_stats/plays`)
//   rooms/{game} rooms created from a lobby
//   tz/{zone}    visits by the browser's time zone (lib/timezones.ts: the country)
//
// `rooms/_stats/weeks/w{yyyymmdd}` (that week's Monday) and
// `rooms/_stats/months/m{yyyymm}` hold `visits` (unique browsers in the period:
// once per browser and period), `new` and `tz/{zone}` the same way — summing
// the days would count someone who came on three days as three.
//
// Under `rooms/` because that's what the database rules open; "_" keeps it
// apart from room codes and out of the cleanup. Every count is a transaction.
// Only production builds count (like Google Analytics), and obvious bots don't.

import { get, limitToLast, orderByKey, query, ref, runTransaction } from "firebase/database";
import { getDb, isFirebaseConfigured } from "./firebase";
import type { GameId } from "./games";
import { timeZoneKey } from "./timezones";

const STATS = "rooms/_stats";
const DAYS = `${STATS}/days`;
const VISIT_KEY = "talo.visita";
const WEEK_KEY = "talo.visita.semana";
const MONTH_KEY = "talo.visita.mes";
const CLIENT_ID_KEY = "salon.clientId";

/** Today in Argentina (UTC−3), as yyyymmdd. */
export function statsDay(now = Date.now()): string {
  return new Date(now - 3 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
}

/** The Monday of `day`'s week (yyyymmdd): the key of its week. */
export function weekOf(day: string): string {
  const t = Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8));
  const back = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - back * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
}

/** yyyymm of `day`. */
export function monthOf(day: string): string {
  return day.slice(0, 6);
}

/** localStorage flag: this browser is the team's own (set from `/estadisticas`), not counted. */
export const OWN_BROWSER_KEY = "talo.noContar";

export function isOwnBrowser(): boolean {
  try {
    return localStorage.getItem(OWN_BROWSER_KEY) === "1";
  } catch {
    return false;
  }
}

function counting(): boolean {
  if (process.env.NODE_ENV !== "production" || typeof window === "undefined") return false;
  if (!isFirebaseConfigured() || isOwnBrowser()) return false;
  if (navigator.webdriver) return false;
  return !/bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp/i.test(navigator.userAgent);
}

function bumpAt(path: string) {
  runTransaction(ref(getDb(), path), (n: number | null) => (n ?? 0) + 1).catch(() => {});
}

function bump(path: string) {
  bumpAt(`${DAYS}/d${statsDay()}/${path}`);
}

/** Counts this browser's visit today (a no-op after the first one of the day). */
export function countVisit() {
  if (!counting()) return;
  try {
    const last = localStorage.getItem(VISIT_KEY);
    const today = statsDay();
    if (last === today) return;
    // Never counted and no player id yet: a browser we haven't seen before.
    const isNew = !last && !localStorage.getItem(CLIENT_ID_KEY);
    const zone = timeZoneKey() || "desconocida";
    localStorage.setItem(VISIT_KEY, today);
    bump("visits");
    if (isNew) bump("new");
    bump(`tz/${zone}`);
    // Once per week and per month too: unique browsers in each period.
    const periods: [string, string][] = [
      [WEEK_KEY, `${STATS}/weeks/w${weekOf(today)}`],
      [MONTH_KEY, `${STATS}/months/m${monthOf(today)}`],
    ];
    for (const [key, path] of periods) {
      if (localStorage.getItem(key) === path) continue;
      localStorage.setItem(key, path);
      bumpAt(`${path}/visits`);
      if (isNew) bumpAt(`${path}/new`);
      bumpAt(`${path}/tz/${zone}`);
    }
  } catch {
    // No storage: don't count, rather than count every page.
  }
}

/** Someone entered a room of `game` (called once per browser and room). */
export function countDailyPlay(game: GameId) {
  if (counting()) bump(`plays/${game}`);
}

/** Someone created a room of `game`. */
export function countDailyRoom(game: GameId) {
  if (counting()) bump(`rooms/${game}`);
}

export type DayStats = {
  /** yyyymmdd */
  day: string;
  visits: number;
  new: number;
  plays: Partial<Record<GameId, number>>;
  rooms: Partial<Record<GameId, number>>;
  /** Visits by time zone key (lib/timezones.ts). */
  tz: Record<string, number>;
};

export type PeriodStats = {
  /** yyyymmdd of the Monday for weeks, yyyymm for months. */
  key: string;
  /** Unique browsers in the period. */
  visits: number;
  new: number;
  tz: Record<string, number>;
};

/** The last `n` weeks or months that have data, oldest first. */
export async function getPeriodStats(kind: "weeks" | "months", n: number): Promise<PeriodStats[]> {
  const snap = await get(query(ref(getDb(), `${STATS}/${kind}`), orderByKey(), limitToLast(n)));
  const raw = (snap.val() ?? {}) as Record<string, Partial<PeriodStats> | null>;
  return Object.entries(raw)
    .filter(([k]) => /^[wm]\d{6,8}$/.test(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({ key: k.slice(1), visits: v?.visits ?? 0, new: v?.new ?? 0, tz: v?.tz ?? {} }));
}

/** The last `n` days that have any data, oldest first. */
export async function getDailyStats(n = 60): Promise<DayStats[]> {
  const snap = await get(query(ref(getDb(), DAYS), orderByKey(), limitToLast(n)));
  const raw = (snap.val() ?? {}) as Record<string, Partial<DayStats> | null>;
  return Object.entries(raw)
    .filter(([k]) => /^d\d{8}$/.test(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({
      day: k.slice(1),
      visits: v?.visits ?? 0,
      new: v?.new ?? 0,
      plays: v?.plays ?? {},
      rooms: v?.rooms ?? {},
      tz: v?.tz ?? {},
    }));
}
