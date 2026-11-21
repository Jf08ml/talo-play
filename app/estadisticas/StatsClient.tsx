"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import SiteHeader, { SiteFooter } from "@/components/SiteHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { isFirebaseConfigured } from "@/lib/firebase";
import { GAMES, type GameId } from "@/lib/games";
import { getPlayStats, type PlayStats } from "@/lib/playStats";
import {
  getDailyStats,
  getPeriodStats,
  isOwnBrowser,
  monthOf,
  OWN_BROWSER_KEY,
  statsDay,
  weekOf,
  type DayStats,
  type PeriodStats,
} from "@/lib/dailyStats";
import { countryOfTimeZone } from "@/lib/timezones";
import { useAccount } from "@/components/AccountProvider";
import { signInWithGoogle } from "@/lib/account";
import {
  CANDIDATES,
  FEEDBACK_KINDS,
  getFeedback,
  isAdmin,
  subscribeVotes,
  type FeedbackEntry,
  type Votes,
} from "@/lib/community";

// Two series in the daily chart, validated as a pair (CVD ΔE 35, normal 45);
// the orange is under 3:1 on white, so every value is also in the table below.
const NEW_COLOR = "#FF7A1A";
const BACK_COLOR = "#2D5BFF";
const CARD = "rounded-[24px] border-2 border-talo-ink bg-white p-4 sm:p-6";
const H2 = "font-display text-[24px] leading-[1.05] sm:text-[28px]";

const DAY_MS = 24 * 3600_000;

/** yyyymmdd of `n` days before `day`. */
function shiftDay(day: string, n: number): string {
  const t = Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8)) - n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10).replace(/-/g, "");
}

function label(day: string, long = false) {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8)));
  return d.toLocaleDateString("es-AR", {
    timeZone: "UTC",
    day: "numeric",
    month: "numeric",
    ...(long ? { weekday: "short" } : {}),
  });
}

const sum = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((a, b) => a + (b ?? 0), 0);

type Totals = { visits: number; new: number; plays: number; rooms: number };

function totals(days: DayStats[]): Totals {
  return days.reduce(
    (t, d) => ({ visits: t.visits + d.visits, new: t.new + d.new, plays: t.plays + sum(d.plays), rooms: t.rooms + sum(d.rooms) }),
    { visits: 0, new: 0, plays: 0, rooms: 0 },
  );
}

/** The internal page: our own per-day counts (lib/dailyStats.ts), next to what GA shows. */
export default function StatsClient() {
  const [days, setDays] = useState<DayStats[] | null>(null);
  const [allTime, setAllTime] = useState<PlayStats>({});
  const [weeks, setWeeks] = useState<PeriodStats[]>([]);
  const [months, setMonths] = useState<PeriodStats[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    Promise.all([getDailyStats(90), getPlayStats(), getPeriodStats("weeks", 12), getPeriodStats("months", 12)])
      .then(([d, p, w, m]) => {
        setDays(d);
        setAllTime(p);
        setWeeks(w);
        setMonths(m);
      })
      .catch(() => setError(true));
  }, []);

  if (!isFirebaseConfigured()) return <FirebaseSetupNotice />;

  return (
    <div className="talo-light flex flex-1 flex-col">
      <section className="overflow-hidden bg-talo-hero">
        <SiteHeader />
        <div className="mx-auto flex max-w-[1360px] flex-col gap-3 px-5 pb-10 pt-2 sm:px-10 sm:pb-14 sm:pt-6">
          <h1 className="font-display text-[44px] leading-none tracking-[-0.02em] sm:text-[72px]">Estadísticas</h1>
          <p className="max-w-2xl text-[17px] font-medium leading-[1.4] sm:text-[20px]">
            Lo que cuenta Talo por su cuenta, día por día (hora de Argentina). Para fuentes y páginas, mirá Google Analytics.
          </p>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col gap-4 px-4 py-8 sm:gap-6 sm:px-10 sm:py-14">
        {error ? (
          <p className={CARD}>No se pudieron leer las estadísticas.</p>
        ) : !days ? (
          <p className="text-talo-text-2">Cargando…</p>
        ) : (
          <Dashboard days={days} allTime={allTime} weeks={weeks} months={months} />
        )}
        <Community />
        <OwnBrowser />
      </div>
      <SiteFooter />
    </div>
  );
}

function Dashboard({
  days,
  allTime,
  weeks,
  months,
}: {
  days: DayStats[];
  allTime: PlayStats;
  weeks: PeriodStats[];
  months: PeriodStats[];
}) {
  const today = statsDay();
  const byDay = useMemo(() => new Map(days.map((d) => [d.day, d])), [days]);
  const empty = (day: string): DayStats => ({ day, visits: 0, new: 0, plays: {}, rooms: {}, tz: {} });
  /** The last `n` days up to today, gaps filled with zeros, oldest first. */
  const lastDays = (n: number, offset = 0) =>
    Array.from({ length: n }, (_, i) => {
      const day = shiftDay(today, n - 1 - i + offset);
      return byDay.get(day) ?? empty(day);
    });

  const [range, setRange] = useState<7 | 30>(7);
  const week = totals(lastDays(7));
  const prevWeek = totals(lastDays(7, 7));
  const since = days[0]?.day;

  if (!since) {
    return (
      <p className={CARD}>
        Todavía no hay datos: se empieza a contar desde que esta versión está publicada. Volvé mañana.
      </p>
    );
  }

  return (
    <>
      <p className="text-[15px] font-semibold text-talo-text-2">Contando desde el {label(since)}.</p>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Tile title="Visitas" hint="suma de cada día, no únicos" now={week.visits} before={prevWeek.visits} />
        <Tile title="Nuevos" hint="primera vez en Talo" now={week.new} before={prevWeek.new} />
        <Tile title="Entradas a salas" hint="personas jugando" now={week.plays} before={prevWeek.plays} />
        <Tile title="Salas creadas" hint="desde un lobby" now={week.rooms} before={prevWeek.rooms} />
      </div>

      <Uniques today={today} weeks={weeks} months={months} />

      <DailyChart days={lastDays(30)} />

      <Countries today={today} weeks={weeks} months={months} />

      <section className={CARD}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className={H2}>Por juego</h2>
          <div role="group" aria-label="Período" className="flex gap-1 rounded-full border-2 border-talo-ink p-1">
            {([7, 30] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => setRange(r)}
                className={`rounded-full px-4 py-1.5 text-[15px] font-bold ${range === r ? "bg-talo-ink text-white" : "text-talo-ink"}`}
              >
                {r} días
              </button>
            ))}
          </div>
        </div>
        <GameTable days={lastDays(range)} allTime={allTime} />
      </section>

      <DayTable days={lastDays(30).reverse()} />
    </>
  );
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function periodLabel(kind: "weeks" | "months", key: string) {
  if (kind === "months") return `${MONTHS[+key.slice(4, 6) - 1]} ${key.slice(0, 4)}`;
  return `Semana del ${label(key)}`;
}

/** The previous month's yyyymm. */
function prevMonth(m: string) {
  const y = +m.slice(0, 4);
  const mo = +m.slice(4, 6);
  return mo === 1 ? `${y - 1}12` : `${y}${String(mo - 1).padStart(2, "0")}`;
}

type Period = "weeks" | "months";

function PeriodSwitch({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
  return (
    <div role="group" aria-label="Período" className="flex gap-1 rounded-full border-2 border-talo-ink p-1">
      {(["weeks", "months"] as const).map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={`rounded-full px-4 py-1.5 text-[15px] font-bold ${value === k ? "bg-talo-ink text-white" : "text-talo-ink"}`}
        >
          {k === "weeks" ? "Semanas" : "Meses"}
        </button>
      ))}
    </div>
  );
}

/** Unique browsers per week (Monday to Sunday) and per month: each counted once per period. */
function Uniques({ today, weeks, months }: { today: string; weeks: PeriodStats[]; months: PeriodStats[] }) {
  const [kind, setKind] = useState<Period>("weeks");
  const thisWeek = weekOf(today);
  const thisMonth = monthOf(today);
  const find = (list: PeriodStats[], key: string) => list.find((p) => p.key === key);
  const rows = (kind === "weeks" ? weeks : months).slice().reverse();
  return (
    <section className={CARD}>
      <h2 className={H2}>Usuarios únicos</h2>
      <p className="mt-2 max-w-2xl text-[15px] text-talo-text-2">
        Cada navegador cuenta una sola vez por semana (de lunes a domingo) y por mes, aunque entre todos los días.
        «Vuelven» son los que ya conocían Talo de antes.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        <UniqueTile
          title="Esta semana"
          now={find(weeks, thisWeek)}
          before={find(weeks, shiftDay(thisWeek, 7))}
          beforeText="la semana pasada"
        />
        <UniqueTile
          title="Este mes"
          now={find(months, thisMonth)}
          before={find(months, prevMonth(thisMonth))}
          beforeText="el mes pasado"
        />
      </div>
      {rows.length > 0 && (
        <>
          <div className="mb-2 mt-6 flex justify-end">
            <PeriodSwitch value={kind} onChange={setKind} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[15px]">
              <thead className="text-[13px] text-talo-text-2">
                <tr>
                  <th className="py-2 pr-3 text-left font-semibold">{kind === "weeks" ? "Semana" : "Mes"}</th>
                  <th className="py-2 pr-3 font-semibold">Únicos</th>
                  <th className="py-2 pr-3 font-semibold">Nuevos</th>
                  <th className="py-2 font-semibold">Vuelven</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {rows.map((p) => (
                  <tr key={p.key} className="border-t border-talo-line">
                    <td className="py-1.5 pr-3 text-left font-sans font-semibold">{periodLabel(kind, p.key)}</td>
                    <td className="py-1.5 pr-3">{p.visits}</td>
                    <td className="py-1.5 pr-3">{p.new}</td>
                    <td className="py-1.5">{Math.max(0, p.visits - p.new)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function UniqueTile({
  title,
  now,
  before,
  beforeText,
}: {
  title: string;
  now?: PeriodStats;
  before?: PeriodStats;
  beforeText: string;
}) {
  const visits = now?.visits ?? 0;
  const fresh = now?.new ?? 0;
  return (
    <div className="rounded-[20px] bg-talo-surface p-4">
      <div className="text-[15px] font-bold">{title}</div>
      <div className="font-display text-[40px] leading-none sm:text-[52px]">{visits}</div>
      <div className="mt-2 text-[14px]">
        <b>{fresh}</b> nuevos · <b>{Math.max(0, visits - fresh)}</b> vuelven
      </div>
      <div className="mt-1 text-[13px] text-talo-text-2">
        {before ? `${before.visits} ${beforeText}` : `Sin datos de ${beforeText}`}
      </div>
    </div>
  );
}

/** Where visitors are, from their browser's time zone: unique per week or month. */
function Countries({ today, weeks, months }: { today: string; weeks: PeriodStats[]; months: PeriodStats[] }) {
  const [kind, setKind] = useState<Period>("weeks");
  const key = kind === "weeks" ? weekOf(today) : monthOf(today);
  const period = (kind === "weeks" ? weeks : months).find((p) => p.key === key);
  const rows = useMemo(() => {
    const by = new Map<string, number>();
    for (const [tz, n] of Object.entries(period?.tz ?? {})) {
      const c = countryOfTimeZone(tz);
      by.set(c, (by.get(c) ?? 0) + n);
    }
    return [...by.entries()].sort((a, b) => b[1] - a[1]);
  }, [period]);
  const total = rows.reduce((t, [, n]) => t + n, 0);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <section className={CARD}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className={H2}>Países</h2>
        <PeriodSwitch value={kind} onChange={setKind} />
      </div>
      <p className="mb-4 max-w-2xl text-[15px] text-talo-text-2">
        {kind === "weeks" ? "Esta semana" : "Este mes"}: usuarios únicos según la zona horaria de su navegador. Es una
        aproximación (alguien de viaje cuenta donde está).
      </p>
      {total === 0 ? (
        <p className="text-[15px]">Todavía no hay datos: se empieza a contar desde que esta versión está publicada.</p>
      ) : (
        <table className="w-full text-left text-[15px]">
          <tbody>
            {rows.map(([c, n]) => (
              <tr key={c} className="border-t border-talo-line">
                <td className="py-2 pr-3 font-semibold">{c}</td>
                <td className="w-[50%] py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="block h-3 rounded-r-[4px] bg-talo-ink"
                      style={{ width: `${(n / max) * 100}%`, minWidth: 3 }}
                      aria-hidden="true"
                    />
                    <span className="font-mono tabular-nums">{n}</span>
                  </div>
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-talo-text-2">
                  {Math.round((n / total) * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Tile({ title, hint, now, before }: { title: string; hint: string; now: number; before: number }) {
  const delta = before > 0 ? Math.round(((now - before) / before) * 100) : null;
  return (
    <div className={CARD}>
      <div className="text-[15px] font-bold">{title}</div>
      <div className="font-display text-[40px] leading-none sm:text-[52px]">{now}</div>
      <div className="mt-2 text-[13px] text-talo-text-2">
        Últimos 7 días · {hint}
        <br />
        {delta === null ? "Sin semana anterior" : `${delta >= 0 ? "+" : ""}${delta}% vs. los 7 anteriores (${before})`}
      </div>
    </div>
  );
}

/** Visits per day, stacked: new browsers at the bottom, returning ones on top. */
function DailyChart({ days }: { days: DayStats[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.visits));
  const shown = active === null ? days.length - 1 : active;
  const d = days[shown];
  return (
    <section className={CARD}>
      <h2 className={H2}>Visitas por día</h2>
      <div className="mt-2 flex flex-wrap gap-4 text-[14px] font-semibold">
        <Legend color={NEW_COLOR} text="Nuevos" />
        <Legend color={BACK_COLOR} text="Vuelven" />
      </div>
      <p className="mt-3 min-h-[24px] text-[15px]" aria-live="polite">
        <b>{label(d.day, true)}</b>: {d.visits} visitas · {d.new} nuevos · {d.visits - d.new} vuelven · {sum(d.plays)}{" "}
        entradas a salas
      </p>
      <div
        className="mt-3 flex h-[180px] items-end gap-[2px] border-b border-talo-line"
        onMouseLeave={() => setActive(null)}
      >
        {days.map((day, i) => {
          const back = Math.max(0, day.visits - day.new);
          return (
            <button
              key={day.day}
              type="button"
              aria-label={`${label(day.day)}: ${day.visits} visitas, ${day.new} nuevos`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className={`flex h-full min-w-0 flex-1 flex-col justify-end ${i === shown ? "bg-talo-surface" : ""}`}
            >
              {back > 0 && (
                <span
                  className="block w-full rounded-t-[4px] border-b-2 border-white"
                  style={{ height: `${(back / max) * 100}%`, background: BACK_COLOR }}
                />
              )}
              {day.new > 0 && (
                <span
                  className={`block w-full ${back > 0 ? "" : "rounded-t-[4px]"}`}
                  style={{ height: `${(day.new / max) * 100}%`, background: NEW_COLOR }}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[12px] text-talo-text-3">
        <span>{label(days[0].day)}</span>
        <span>Hoy</span>
      </div>
    </section>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-[3px]" style={{ background: color }} aria-hidden="true" />
      {text}
    </span>
  );
}

function GameTable({ days, allTime }: { days: DayStats[]; allTime: PlayStats }) {
  const rows = useMemo(() => {
    const plays: Partial<Record<GameId, number>> = {};
    const rooms: Partial<Record<GameId, number>> = {};
    for (const d of days) {
      for (const [g, n] of Object.entries(d.plays)) plays[g as GameId] = (plays[g as GameId] ?? 0) + (n ?? 0);
      for (const [g, n] of Object.entries(d.rooms)) rooms[g as GameId] = (rooms[g as GameId] ?? 0) + (n ?? 0);
    }
    return (Object.keys(GAMES) as GameId[])
      .map((g) => ({ g, plays: plays[g] ?? 0, rooms: rooms[g] ?? 0, all: allTime[g] ?? 0 }))
      .sort((a, b) => b.plays - a.plays || b.rooms - a.rooms || b.all - a.all);
  }, [days, allTime]);
  const max = Math.max(1, ...rows.map((r) => r.plays));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[15px]">
        <thead className="text-[13px] text-talo-text-2">
          <tr>
            <th className="py-2 pr-3 font-semibold">Juego</th>
            <th className="w-[40%] py-2 pr-3 font-semibold">Entradas a salas</th>
            <th className="py-2 pr-3 text-right font-semibold">Salas</th>
            <th className="py-2 text-right font-semibold">Histórico</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.g} className="border-t border-talo-line">
              <td className="py-2 pr-3 font-semibold">{GAMES[r.g].title}</td>
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2">
                  <span
                    className="block h-3 rounded-r-[4px] bg-talo-ink"
                    style={{ width: `${(r.plays / max) * 100}%`, minWidth: r.plays ? 3 : 0 }}
                    aria-hidden="true"
                  />
                  <span className="font-mono tabular-nums">{r.plays}</span>
                </div>
              </td>
              <td className="py-2 pr-3 text-right font-mono tabular-nums">{r.rooms}</td>
              <td className="py-2 text-right font-mono tabular-nums text-talo-text-2">{r.all}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DayTable({ days }: { days: DayStats[] }) {
  return (
    <section className={CARD}>
      <h2 className={`${H2} mb-4`}>Día por día</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-right text-[15px]">
          <thead className="text-[13px] text-talo-text-2">
            <tr>
              <th className="py-2 pr-3 text-left font-semibold">Día</th>
              <th className="py-2 pr-3 font-semibold">Visitas</th>
              <th className="py-2 pr-3 font-semibold">Nuevos</th>
              <th className="py-2 pr-3 font-semibold">Entradas</th>
              <th className="py-2 font-semibold">Salas</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {days.map((d) => (
              <tr key={d.day} className="border-t border-talo-line">
                <td className="py-1.5 pr-3 text-left font-sans font-semibold">{label(d.day, true)}</td>
                <td className="py-1.5 pr-3">{d.visits}</td>
                <td className="py-1.5 pr-3">{d.new}</td>
                <td className="py-1.5 pr-3">{sum(d.plays)}</td>
                <td className="py-1.5">{sum(d.rooms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const ownListeners = new Set<() => void>();
function subscribeOwn(l: () => void) {
  ownListeners.add(l);
  return () => ownListeners.delete(l);
}

/** Marks this browser as the team's: not counted here, and sent to GA as internal traffic. */
function OwnBrowser() {
  const own = useSyncExternalStore(subscribeOwn, isOwnBrowser, () => false);
  const toggle = () => {
    try {
      if (own) localStorage.removeItem(OWN_BROWSER_KEY);
      else localStorage.setItem(OWN_BROWSER_KEY, "1");
    } catch {}
    ownListeners.forEach((l) => l());
  };
  return (
    <section className={CARD}>
      <h2 className={H2}>Este navegador</h2>
      <p className="mt-2 max-w-2xl text-[15px] text-talo-text-2">
        Marcalo en los navegadores de quienes hacemos Talo para no inflar los números: deja de sumar acá y Google
        Analytics lo marca como tráfico interno.
      </p>
      <label className="mt-4 flex w-fit cursor-pointer items-center gap-3 text-[16px] font-bold">
        <input type="checkbox" checked={own} onChange={toggle} className="h-5 w-5 accent-talo-ink" />
        No contar este navegador
      </label>
    </section>
  );
}

/** Votes for the next game (public) and the messages sent from /ideas (admins only). */
function Community() {
  const { user } = useAccount();
  const [votes, setVotes] = useState<Votes>({});
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState<FeedbackEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => subscribeVotes(setVotes), []);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    isAdmin(user.uid).then(async (ok) => {
      if (!alive) return;
      setAdmin(ok);
      if (!ok) return;
      try {
        const f = await getFeedback();
        if (alive) setFeedback(f);
      } catch {
        if (alive) setError(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [user]);

  const ranking = CANDIDATES.map((c) => ({ ...c, n: Object.keys(votes[c.id] ?? {}).length })).sort((a, b) => b.n - a.n);
  const maxVotes = Math.max(1, ...ranking.map((r) => r.n));
  const kindLabel = (k: string) => FEEDBACK_KINDS.find((f) => f.id === k)?.label ?? k;

  return (
    <section className={CARD}>
      <h2 className={H2}>Ideas</h2>

      <h3 className="mt-4 text-[15px] font-bold">Votos para el próximo juego</h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {ranking.map((r) => (
          <li key={r.id} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 text-[15px]">
            <span className="truncate font-semibold">{r.title}</span>
            <span className="flex items-center gap-2">
              <span
                className="block h-3 rounded-r-[4px] bg-talo-ink"
                style={{ width: `${(r.n / maxVotes) * 100}%`, minWidth: r.n ? 3 : 0 }}
                aria-hidden="true"
              />
              <span className="font-mono tabular-nums">{r.n}</span>
            </span>
          </li>
        ))}
      </ul>

      <h3 className="mt-6 text-[15px] font-bold">Mensajes</h3>
      {user === undefined ? (
        <p className="mt-2 text-talo-text-2">Cargando…</p>
      ) : !user ? (
        <div className="mt-2 flex flex-col items-start gap-3">
          <p className="text-[15px] text-talo-text-2">Los mensajes son privados: entrá con la cuenta de Google de Talo.</p>
          <button
            type="button"
            onClick={() => signInWithGoogle().catch(() => {})}
            className="rounded-full bg-talo-ink px-5 py-2.5 text-[15px] font-bold text-white hover:bg-black"
          >
            Entrar con Google
          </button>
        </div>
      ) : admin === null ? (
        <p className="mt-2 text-talo-text-2">Revisando tu cuenta…</p>
      ) : !admin ? (
        <div className="mt-2 text-[15px] text-talo-text-2">
          <p>Esta cuenta no puede leer los mensajes. Para habilitarla, el id de la cuenta va en la base:</p>
          <code className="mt-2 block w-fit select-all rounded-lg bg-talo-surface px-3 py-2 font-code text-[14px] text-talo-ink">
            firebase database:set /admins/{user.uid} true
          </code>
        </div>
      ) : error ? (
        <p className="mt-2">No se pudieron leer los mensajes.</p>
      ) : !feedback ? (
        <p className="mt-2 text-talo-text-2">Cargando…</p>
      ) : feedback.length === 0 ? (
        <p className="mt-2 text-talo-text-2">Todavía no llegó ninguno.</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {feedback.map((f) => (
            <li key={f.id} className="border-t border-talo-line py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-talo-text-2">
                <span className="rounded-full bg-talo-surface px-2.5 py-0.5 font-bold text-talo-ink">{kindLabel(f.kind)}</span>
                <span>{f.name || "Sin nombre"}</span>
                <span>
                  {new Date(f.at).toLocaleString("es-AR", {
                    timeZone: "America/Argentina/Buenos_Aires",
                    day: "numeric",
                    month: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {f.contact && <span className="select-all">Contacto: {f.contact}</span>}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[16px]">{f.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
