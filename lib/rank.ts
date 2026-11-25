import { get, limitToLast, orderByChild, query, ref, runTransaction } from "firebase/database";
import { getAuthInstance, getDb, isFirebaseConfigured } from "./firebase";
import { colorForClient } from "./ids";
import { serverNow } from "./serverTime";
import { statsDay, weekOf } from "./dailyStats";
import { readClientId, readName } from "@/hooks/useClientIdentity";
import type { GameId } from "./games";

/**
 * «Ranking de Talo». Everyone earns points for the matches they play in rooms
 * (`awardMatch`, called once per match by each game when it ends): `PLAY` for
 * finishing it, plus a bonus by place (`PLACE_BONUS`). Matches where every
 * rival was a visible bot are worth half; the hidden bots of «Jugar en línea»
 * count like people on purpose (nothing may give them away). At most
 * `DAILY_CAP` a day per browser.
 *
 * Points live at `rank/all/{clientId}` and `rank/weeks/w{monday}/{clientId}`
 * (`{p, name, color, at, uid?}`). Only entries with an account (`uid`,
 * checked by the rules against the profile's client id) show in the public
 * ranking; the rest still add up, and appear once the person signs in and
 * plays again. There is no backend, so the rules only bound each write
 * (`MAX_WRITE`) and space them (`GAP_MS`); points pending meanwhile wait in
 * this browser and go in the next write.
 */

export const PLAY = 10;
export const PLACE_BONUS = [20, 10, 5];
export const DAILY_CAP = 300;
/** The rules' bounds: points per write and time between writes of one player. */
export const MAX_WRITE = 120;
export const GAP_MS = 15_000;

const PENDING_KEY = "talo.rank.pendiente";
const DAY_KEY = "talo.rank.dia";
const LAST_KEY = "talo.rank.ultimo";

export interface RankRow {
  id: string;
  p: number;
  name: string;
  color: string;
  uid?: string;
}

export interface MatchOutcome {
  /** My place (1 = won), or null when nobody wins (co-op, or a draw). */
  place: number | null;
  /** How many took part (people and bots). */
  players: number;
  /** Every rival was a bot shown as one (not «Jugar en línea»'s hidden ones). */
  vsBotsOnly?: boolean;
}

export const weekKey = (now = serverNow()) => `w${weekOf(statsDay(now))}`;

/** Points for a match. */
export function pointsFor(o: MatchOutcome): number {
  let p = PLAY;
  if (o.place !== null && o.place >= 1 && o.players >= 2) {
    // Second and third only score with enough players to make them a podium.
    const bonus = PLACE_BONUS[o.place - 1] ?? 0;
    if (o.place === 1 || o.players > o.place) p += bonus;
  }
  return o.vsBotsOnly ? Math.round(p / 2) : p;
}

function readNum(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Adds my points for a finished match, once per `matchKey` (e.g. the room and
 * its game number). Safe to call from a render effect every time the end
 * screen shows.
 */
export function awardMatch(_game: GameId, roomId: string, matchKey: string | number, outcome: MatchOutcome): number {
  if (typeof window === "undefined" || !isFirebaseConfigured()) return 0;
  try {
    const once = `talo.rank.${roomId}.${matchKey}`;
    if (localStorage.getItem(once)) return 0;
    localStorage.setItem(once, "1");
    const today = statsDay();
    const [day, used] = (localStorage.getItem(DAY_KEY) ?? "").split(":");
    const spent = day === today ? Number(used) || 0 : 0;
    const pts = Math.max(0, Math.min(pointsFor(outcome), DAILY_CAP - spent));
    if (!pts) return 0;
    localStorage.setItem(DAY_KEY, `${today}:${spent + pts}`);
    localStorage.setItem(PENDING_KEY, String(readNum(PENDING_KEY) + pts));
    flushPoints();
    return pts;
  } catch {
    return 0;
  }
}

let flushing = false;

/** Writes the points waiting in this browser, when the rules allow another write. */
export async function flushPoints(): Promise<void> {
  if (flushing || typeof window === "undefined" || !isFirebaseConfigured()) return;
  const pending = readNum(PENDING_KEY);
  if (pending <= 0) return;
  const wait = readNum(LAST_KEY) + GAP_MS + 500 - Date.now();
  if (wait > 0) {
    setTimeout(() => void flushPoints(), wait);
    return;
  }
  flushing = true;
  const id = readClientId();
  const name = (readName() ?? "").slice(0, 24) || "Jugador";
  const color = colorForClient(id);
  const delta = Math.min(pending, MAX_WRITE);
  const uid = getAuthInstance().currentUser?.uid;
  const write = async (withUid: boolean) => {
    const at = Math.round(serverNow());
    const bump = (cur: Partial<RankRow> & { at?: number } | null) => {
      const next: Record<string, unknown> = { p: (cur?.p ?? 0) + delta, name, color, at };
      if (withUid && uid) next.uid = uid;
      else if (cur?.uid) next.uid = cur.uid;
      return next;
    };
    await runTransaction(ref(getDb(), `rank/all/${id}`), bump);
    await runTransaction(ref(getDb(), `rank/weeks/${weekKey()}/${id}`), bump);
  };
  try {
    try {
      await write(true);
    } catch {
      // Signed in on a device whose player isn't the account's: count without the account.
      await write(false);
    }
    localStorage.setItem(PENDING_KEY, String(Math.max(0, readNum(PENDING_KEY) - delta)));
    localStorage.setItem(LAST_KEY, String(Date.now()));
  } catch (err) {
    console.error(err);
  } finally {
    flushing = false;
  }
  if (readNum(PENDING_KEY) > 0) setTimeout(() => void flushPoints(), GAP_MS + 500);
}

/** The public ranking (accounts only), best first; `scope` "all" or a week key. */
export async function getRanking(scope: "all" | string, limit = 50): Promise<RankRow[]> {
  const path = scope === "all" ? "rank/all" : `rank/weeks/${scope}`;
  const snap = await get(query(ref(getDb(), path), orderByChild("p"), limitToLast(300)));
  const rows: RankRow[] = [];
  snap.forEach((c) => {
    const v = c.val() as Partial<RankRow>;
    if (v?.uid && typeof v.p === "number") rows.push({ id: c.key!, p: v.p, name: v.name ?? "?", color: v.color ?? "#999", uid: v.uid });
  });
  return rows.sort((a, b) => b.p - a.p).slice(0, limit);
}

/** My own entry (public or not). */
export async function getMyPoints(scope: "all" | string): Promise<RankRow | null> {
  const id = readClientId();
  const path = scope === "all" ? `rank/all/${id}` : `rank/weeks/${scope}/${id}`;
  const v = (await get(ref(getDb(), path))).val() as Partial<RankRow> | null;
  return v && typeof v.p === "number" ? { id, p: v.p, name: v.name ?? "", color: v.color ?? "#999", uid: v.uid } : null;
}
