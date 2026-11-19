"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import SiteHeader, { SiteFooter } from "@/components/SiteHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { isFirebaseConfigured } from "@/lib/firebase";
import { GAMES, type GameId } from "@/lib/games";
import { getPlayStats, type PlayStats } from "@/lib/playStats";
import { getDailyStats, isOwnBrowser, OWN_BROWSER_KEY, statsDay, type DayStats } from "@/lib/dailyStats";
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
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    Promise.all([getDailyStats(90), getPlayStats()])
      .then(([d, p]) => {
        setDays(d);
        setAllTime(p);
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
            Lo que cuenta Talo por su cuenta, día por día (hora de Argentina). Para fuentes, países y páginas, mirá Google
            Analytics.
          </p>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col gap-4 px-4 py-8 sm:gap-6 sm:px-10 sm:py-14">
        {error ? (
          <p className={CARD}>No se pudieron leer las estadísticas.</p>
        ) : !days ? (
          <p className="text-talo-text-2">Cargando…</p>
        ) : (
          <Dashboard days={days} allTime={allTime} />
        )}
        <Community />
        <OwnBrowser />
      </div>
      <SiteFooter />
    </div>
  );
}

function Dashboard({ days, allTime }: { days: DayStats[]; allTime: PlayStats }) {
  const today = statsDay();
  const byDay = useMemo(() => new Map(days.map((d) => [d.day, d])), [days]);
  const empty = (day: string): DayStats => ({ day, visits: 0, new: 0, plays: {}, rooms: {} });
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
        <Tile title="Visitas" hint="navegadores por día" now={week.visits} before={prevWeek.visits} />
        <Tile title="Nuevos" hint="primera vez en Talo" now={week.new} before={prevWeek.new} />
        <Tile title="Entradas a salas" hint="personas jugando" now={week.plays} before={prevWeek.plays} />
        <Tile title="Salas creadas" hint="desde un lobby" now={week.rooms} before={prevWeek.rooms} />
      </div>

      <DailyChart days={lastDays(30)} />

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
