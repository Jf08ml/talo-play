import {
  limitToLast,
  onDisconnect,
  onValue,
  query,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
  push,
  type Unsubscribe,
} from "firebase/database";
import { getDb } from "./firebase";
import { GAMES, type GameId } from "./games";
import { serverNow } from "./serverTime";

/**
 * La Plaza (`/plaza`): Talo's global chat, to find people to play with.
 * Everything lives under `plaza/` and is guarded by `database.rules.json`
 * (there's no backend), so the rules are the real safety:
 *
 * - `msgs/{pushId}` — a chat message: a quick phrase (`kind` "quick", `q` an
 *   index into `PLAZA_PHRASES`, anyone) or free text (`kind` "text": only a
 *   signed-in, not banned account; no links, mails, @ or long numbers).
 *   `admin` = true is only accepted from an account in `admins/`, so the
 *   "Admin · Talo" badge can't be faked. Readers keep the last `KEEP`;
 *   messages over a day old may be deleted by anyone (`cleanupPlaza`).
 * - `calls/{roomId}` — "buscan gente": a waiting room asking for players,
 *   with its game and how many are in. Stale after `CALL_TTL_MS`.
 * - `online/{clientId}` — who's in the Plaza right now (removed on disconnect).
 * - `reports/{msgId}/{clientId}` — reports; `HIDE_AT` of them hide a message
 *   until an admin looks at it. `bans/{uid}` — accounts that can't write text.
 * - `last/{clientId}` — server time of each one's last post: the rules want
 *   it written with every post and at least `GAP_MS` after the previous one.
 * - `pinned` — a notice an admin fixes on top.
 */

export const PLAZA_MAX_CHARS = 200;
const KEEP = 80;
export const HIDE_AT = 3;
export const CALL_TTL_MS = 15 * 60 * 1000;
const MSG_TTL_MS = 24 * 60 * 60 * 1000;
/** The rules ask for 2.5 s between posts; the app waits a bit more. */
export const GAP_MS = 3000;

/** Quick phrases (stored by index: append only). */
export const PLAZA_PHRASES = [
  "¡Hola!",
  "¿Alguien para jugar?",
  "¿Quién se suma?",
  "Busco 1 más",
  "Busco 2 más",
  "¡Ya voy!",
  "¡Gracias por jugar!",
  "¡Buena partida!",
  "👋",
  "🎮",
  "🔥",
  "😂",
];

export interface PlazaMessage {
  id: string;
  kind: "text" | "quick";
  by: string;
  name: string;
  color: string;
  uid?: string;
  text: string;
  admin: boolean;
  at: number;
}

export interface PlazaCall {
  room: string;
  game: GameId;
  by: string;
  name: string;
  color: string;
  count: number;
  at: number;
}

export interface PlazaPerson {
  id: string;
  name: string;
  color: string;
  admin: boolean;
}

export interface Pinned {
  text: string;
  name: string;
  at: number;
}

export interface Me {
  clientId: string;
  name: string;
  color: string;
}

const db = () => getDb();
const str = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.slice(0, max) : fallback);

// ---- What can be written -------------------------------------------------------

/** Same tests as the rules: links, mails, @ and phone-like numbers (7+ digits, spaces and dots between them) aren't allowed. */
const LINK = /(https?:|www[.]|@|[a-z0-9-][.](com|net|org|ar|io|me|ly|gg|xyz|tv|co))/i;

export function hasContact(text: string): boolean {
  return LINK.test(text) || /\d{7}/.test(text.replace(/[ .()-]/g, ""));
}

/** Common insults, covered with dots (the rules can't judge words; this keeps the chat friendly). */
const BAD = [
  "boludo", "boluda", "pelotudo", "pelotuda", "puto", "puta", "putos", "putas", "forro", "forra", "mierda",
  "concha", "pija", "verga", "culiado", "culiao", "hdp", "hijo de puta", "imbecil", "imbécil", "idiota",
  "estupido", "estúpido", "tarado", "mogolico", "mogólico", "trolo", "marica", "maricon", "maricón",
  "cogete", "chupala", "gil", "gila", "pendejo", "cabron", "cabrón", "joder", "coño", "zorra", "perra",
];
const BAD_RE = new RegExp(`(^|[^\\p{L}])(${BAD.map((w) => w.replace(/ /g, "\\s+")).join("|")})(?=$|[^\\p{L}])`, "giu");

export function softenText(text: string): string {
  return text.replace(BAD_RE, (_, pre: string, word: string) => pre + "•".repeat(Math.min(6, word.length)));
}

// ---- Reading ----------------------------------------------------------------------

export function subscribeMessages(cb: (messages: PlazaMessage[]) => void): Unsubscribe {
  return onValue(query(ref(db(), "plaza/msgs"), limitToLast(KEEP)), (snap) => {
    const out: PlazaMessage[] = [];
    snap.forEach((child) => {
      const v = child.val() as Record<string, unknown> | null;
      if (!v || typeof v.by !== "string") return;
      const kind = v.kind === "text" ? "text" : "quick";
      const text = kind === "text" ? str(v.text, PLAZA_MAX_CHARS) : PLAZA_PHRASES[typeof v.q === "number" ? v.q : -1] ?? "";
      if (!text) return;
      out.push({
        id: child.key ?? "",
        kind,
        by: v.by,
        name: str(v.name, 24, "Alguien"),
        color: str(v.color, 16, "#999"),
        uid: typeof v.uid === "string" ? v.uid : undefined,
        text,
        admin: v.admin === true,
        at: typeof v.at === "number" ? v.at : Date.now(),
      });
    });
    cb(out);
  });
}

export function subscribeCalls(cb: (calls: PlazaCall[]) => void): Unsubscribe {
  return onValue(ref(db(), "plaza/calls"), (snap) => {
    const out: PlazaCall[] = [];
    const now = serverNow();
    snap.forEach((child) => {
      const v = child.val() as Record<string, unknown> | null;
      if (!v || typeof v.game !== "string" || !(v.game in GAMES)) return;
      const at = typeof v.at === "number" ? v.at : 0;
      if (now - at > CALL_TTL_MS) return;
      out.push({
        room: child.key ?? "",
        game: v.game as GameId,
        by: str(v.by, 32),
        name: str(v.name, 24, "Alguien"),
        color: str(v.color, 16, "#999"),
        count: typeof v.count === "number" ? v.count : 1,
        at,
      });
    });
    cb(out.sort((a, b) => b.at - a.at));
  });
}

export function subscribeOnline(cb: (people: PlazaPerson[]) => void): Unsubscribe {
  return onValue(ref(db(), "plaza/online"), (snap) => {
    const out: PlazaPerson[] = [];
    snap.forEach((child) => {
      const v = child.val() as Record<string, unknown> | null;
      if (!v) return;
      out.push({ id: child.key ?? "", name: str(v.name, 24, "Alguien"), color: str(v.color, 16, "#999"), admin: v.admin === true });
    });
    cb(out);
  });
}

/** Message id → how many reported it. */
export function subscribeReports(cb: (reports: Record<string, number>) => void): Unsubscribe {
  return onValue(ref(db(), "plaza/reports"), (snap) => {
    const out: Record<string, number> = {};
    snap.forEach((child) => {
      out[child.key ?? ""] = child.size;
    });
    cb(out);
  });
}

export function subscribeBans(cb: (bans: Set<string>) => void): Unsubscribe {
  return onValue(ref(db(), "plaza/bans"), (snap) => cb(new Set(Object.keys(snap.val() ?? {}))));
}

export function subscribePinned(cb: (pinned: Pinned | null) => void): Unsubscribe {
  return onValue(ref(db(), "plaza/pinned"), (snap) => {
    const v = snap.val() as Record<string, unknown> | null;
    cb(v && typeof v.text === "string" ? { text: v.text, name: str(v.name, 24, "Talo"), at: typeof v.at === "number" ? v.at : 0 } : null);
  });
}

// ---- Writing ----------------------------------------------------------------------

let lastPost = 0;

/** How long until another post is allowed (ms), 0 = now. */
export function waitToPost(): number {
  return Math.max(0, lastPost + GAP_MS - Date.now());
}

function post(me: Me, path: string, value: Record<string, unknown>) {
  lastPost = Date.now();
  return update(ref(db()), {
    [path]: { ...value, by: me.clientId, name: me.name.slice(0, 24), color: me.color, at: serverTimestamp() },
    [`plaza/last/${me.clientId}`]: serverTimestamp(),
  });
}

export function sendQuick(me: Me, q: number) {
  return post(me, `plaza/msgs/${push(ref(db(), "plaza/msgs")).key}`, { kind: "quick", q });
}

/** Free text: needs a signed-in account (`uid`); `admin` adds the badge (the rules check it). */
export function sendText(me: Me, uid: string, text: string, admin: boolean) {
  const clean = text.trim().replace(/\s+/g, " ").slice(0, PLAZA_MAX_CHARS);
  return post(me, `plaza/msgs/${push(ref(db(), "plaza/msgs")).key}`, {
    kind: "text",
    text: clean,
    uid,
    ...(admin ? { admin: true } : {}),
  });
}

/** "Buscan gente": a waiting room asks the Plaza for players (again = refreshed). */
export function sendCall(me: Me, game: GameId, room: string, count: number) {
  return post(me, `plaza/calls/${room}`, { game, count: Math.max(0, Math.min(99, count)) });
}

/** Keeps an open call's head count current (no new timestamp). */
export function updateCallCount(room: string, count: number) {
  return set(ref(db(), `plaza/calls/${room}/count`), Math.max(0, Math.min(99, count))).catch(() => {});
}

export function removeCall(room: string) {
  return remove(ref(db(), `plaza/calls/${room}`)).catch(() => {});
}

export function reportMessage(id: string, clientId: string) {
  return set(ref(db(), `plaza/reports/${id}/${clientId}`), true);
}

/** I'm in the Plaza while this runs (with my name and talo color). */
export function joinPlaza(me: Me, admin: boolean): () => void {
  const r = ref(db(), `plaza/online/${me.clientId}`);
  onDisconnect(r).remove().catch(() => {});
  set(r, { name: me.name.slice(0, 24), color: me.color, at: serverTimestamp(), ...(admin ? { admin: true } : {}) }).catch(() => {});
  return () => {
    onDisconnect(r).cancel().catch(() => {});
    remove(r).catch(() => {});
  };
}

/**
 * No backend cleans the Plaza: whoever opens it deletes a few messages over
 * a day old, and calls past their time (the rules allow both).
 */
export function cleanupPlaza(messages: PlazaMessage[], calls: Record<string, { at?: number }> | null) {
  const now = serverNow();
  const updates: Record<string, null> = {};
  for (const m of messages) if (now - m.at > MSG_TTL_MS) updates[`plaza/msgs/${m.id}`] = null;
  for (const [room, c] of Object.entries(calls ?? {})) if (now - (c.at ?? 0) > CALL_TTL_MS) updates[`plaza/calls/${room}`] = null;
  if (Object.keys(updates).length) update(ref(db()), updates).catch(() => {});
}

// ---- Admins ----------------------------------------------------------------------

export function deleteMessage(id: string) {
  return update(ref(db()), { [`plaza/msgs/${id}`]: null, [`plaza/reports/${id}`]: null });
}

/** Clears its reports: an admin saw it and it's fine. */
export function restoreMessage(id: string) {
  return remove(ref(db(), `plaza/reports/${id}`));
}

export function setBan(uid: string, banned: boolean) {
  return banned ? set(ref(db(), `plaza/bans/${uid}`), true) : remove(ref(db(), `plaza/bans/${uid}`));
}

export function setPinned(text: string | null, name: string) {
  const r = ref(db(), "plaza/pinned");
  return text ? set(r, { text: text.slice(0, PLAZA_MAX_CHARS), name: name.slice(0, 24), at: serverTimestamp() }) : remove(r);
}

// ---- Local: people I silenced ----------------------------------------------------

const MUTED_KEY = "talo.plaza.silenciados";

export function readMuted(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(MUTED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveMuted(list: string[]) {
  try {
    localStorage.setItem(MUTED_KEY, JSON.stringify(list.slice(-200)));
  } catch {
    // Not remembered on this device, that's all.
  }
}

/** One room's call, if it has an open one. */
export function subscribeCall(room: string, cb: (call: { by: string; at: number } | null) => void): Unsubscribe {
  return onValue(ref(db(), `plaza/calls/${room}`), (snap) => {
    const v = snap.val() as Record<string, unknown> | null;
    const at = typeof v?.at === "number" ? v.at : 0;
    cb(v && serverNow() - at < CALL_TTL_MS ? { by: str(v.by, 32), at } : null);
  });
}
