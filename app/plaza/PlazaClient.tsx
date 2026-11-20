"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { BadgeCheck, Ban, Flag, Megaphone, Pin, Send, ShieldCheck, Trash2, Undo2, Users, VolumeX } from "lucide-react";
import SiteHeader, { SiteFooter } from "@/components/SiteHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import NamePrompt from "@/components/NamePrompt";
import GameIcon from "@/components/GameIcon";
import { Talo } from "@/components/Talo";
import { useAccount } from "@/components/AccountProvider";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useServerNow } from "@/hooks/useServerNow";
import { isFirebaseConfigured, getDb } from "@/lib/firebase";
import { inAppBrowser, signInWithGoogle } from "@/lib/account";
import { isAdmin } from "@/lib/community";
import { GAMES, roomPath } from "@/lib/games";
import { playerTalo } from "@/lib/talos";
import { trackEvent } from "@/lib/analytics";
import { ref, get } from "firebase/database";
import {
  HIDE_AT,
  PLAZA_MAX_CHARS,
  PLAZA_PHRASES,
  cleanupPlaza,
  deleteMessage,
  hasContact,
  joinPlaza,
  readMuted,
  reportMessage,
  restoreMessage,
  saveMuted,
  sendQuick,
  sendText,
  setBan,
  setPinned,
  softenText,
  subscribeBans,
  subscribeCalls,
  subscribeMessages,
  subscribeOnline,
  subscribePinned,
  subscribeReports,
  waitToPost,
  type Pinned,
  type PlazaCall,
  type PlazaMessage,
  type PlazaPerson,
} from "@/lib/plaza";

const CARD = "rounded-[24px] border-2 border-talo-ink bg-white";
const H2 = "font-display text-[22px] leading-[1.05] sm:text-[26px]";

function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function ago(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  return min < 1 ? "recién" : `hace ${min} min`;
}

/** La Plaza: Talo's global chat, who's around, and rooms looking for players. */
export default function PlazaClient() {
  if (!isFirebaseConfigured()) return <FirebaseSetupNotice />;
  return <Plaza />;
}

function Plaza() {
  const identity = useClientIdentity();
  const { user, profile } = useAccount();
  const [messages, setMessages] = useState<PlazaMessage[]>([]);
  const [calls, setCalls] = useState<PlazaCall[]>([]);
  const [people, setPeople] = useState<PlazaPerson[]>([]);
  const [reports, setReports] = useState<Record<string, number>>({});
  const [bans, setBans] = useState<Set<string>>(new Set());
  const [pinned, setPinnedState] = useState<Pinned | null>(null);
  const [muted, setMuted] = useState<string[]>([]);
  const [admin, setAdmin] = useState(false);
  const cleaned = useRef(false);

  const me = identity.clientId && identity.name ? { clientId: identity.clientId, name: identity.name, color: identity.color } : null;
  const uid = user?.uid;

  useEffect(() => {
    const unsubs = [
      subscribeMessages(setMessages),
      subscribeCalls(setCalls),
      subscribeOnline(setPeople),
      subscribeReports(setReports),
      subscribeBans(setBans),
      subscribePinned(setPinnedState),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // Muted people live in this browser only.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setMuted(readMuted());
  }, []);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    isAdmin(uid).then((v) => alive && setAdmin(v));
    return () => {
      alive = false;
      setAdmin(false);
    };
  }, [uid]);

  // I'm in the Plaza while the page is open.
  const meKey = me ? `${me.clientId}|${me.name}|${me.color}|${admin}` : "";
  useEffect(() => {
    if (!meKey) return;
    const [clientId, name, color, isAdminStr] = meKey.split("|");
    return joinPlaza({ clientId, name, color }, isAdminStr === "true");
  }, [meKey]);

  // Old messages and stale calls go away with whoever opens the Plaza (no backend).
  useEffect(() => {
    if (cleaned.current || !messages.length) return;
    cleaned.current = true;
    get(ref(getDb(), "plaza/calls"))
      .then((snap) => cleanupPlaza(messages, snap.val()))
      .catch(() => {});
  }, [messages]);

  const toggleMute = (by: string) => {
    const next = muted.includes(by) ? muted.filter((x) => x !== by) : [...muted, by];
    setMuted(next);
    saveMuted(next);
  };

  return (
    <div className="talo-light flex flex-1 flex-col">
      <section className="overflow-hidden bg-talo-hero">
        <SiteHeader />
        <div className="mx-auto flex max-w-[1360px] flex-col gap-3 px-5 pb-8 pt-2 sm:px-10 sm:pb-12 sm:pt-6">
          <h1 className="font-display text-[44px] leading-none tracking-[-0.02em] sm:text-[clamp(56px,6vw,88px)]">La Plaza</h1>
          <p className="max-w-2xl text-[17px] font-medium leading-[1.4] sm:text-[22px]">
            Encontrá gente para jugar: saludá, mirá quién está y sumate a las salas que buscan jugadores.
          </p>
          <p className="flex items-center gap-2 text-[15px] font-bold">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
            {people.length === 1 ? "1 persona en la Plaza" : `${people.length} personas en la Plaza`}
            {calls.length > 0 && ` · ${calls.length === 1 ? "1 sala busca gente" : `${calls.length} salas buscan gente`}`}
          </p>
        </div>
      </section>

      {identity.clientId && !identity.name && <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la Plaza" />}

      {/* Phones: the rooms that want players first, then the chat. Wide screens: chat on the left. */}
      <div className="mx-auto grid w-full max-w-[1360px] flex-1 grid-cols-[minmax(0,1fr)] items-start gap-4 px-4 py-6 sm:gap-6 sm:px-10 sm:py-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-8">
        <Chat
          messages={messages}
          reports={reports}
          bans={bans}
          pinned={pinned}
          muted={muted}
          admin={admin}
          me={me}
          uid={uid}
          signedIn={!!user && !!profile}
          myClientId={identity.clientId}
          onToggleMute={toggleMute}
          onUnmuteAll={() => {
            setMuted([]);
            saveMuted([]);
          }}
        />
        <div className="order-first lg:order-none lg:col-start-2 lg:row-start-1">
          <Calls calls={calls} myClientId={identity.clientId} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 sm:gap-6 lg:col-start-2">
          <People people={people} />
          <Rules />
          {admin && <AdminPanel pinned={pinned} bans={bans} messages={messages} name={profile?.name ?? identity.name ?? "Talo"} />}
        </div>
      </div>
      <SiteFooter ideas={false} />
    </div>
  );
}

function Chat({
  messages,
  reports,
  bans,
  pinned,
  muted,
  admin,
  me,
  uid,
  signedIn,
  myClientId,
  onToggleMute,
  onUnmuteAll,
}: {
  messages: PlazaMessage[];
  reports: Record<string, number>;
  bans: Set<string>;
  pinned: Pinned | null;
  muted: string[];
  admin: boolean;
  me: { clientId: string; name: string; color: string } | null;
  uid: string | undefined;
  signedIn: boolean;
  myClientId: string;
  onToggleMute: (by: string) => void;
  onUnmuteAll: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [reported, setReported] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () => messages.filter((m) => admin || (!muted.includes(m.by) && !(m.uid && bans.has(m.uid)))),
    [messages, admin, muted, bans]
  );

  // Follow new messages while reading the bottom of the list.
  useEffect(() => {
    const el = listRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  const report = (m: PlazaMessage) => {
    if (!myClientId || reported.has(m.id)) return;
    setReported(new Set(reported).add(m.id));
    reportMessage(m.id, myClientId).catch(() => {});
  };

  return (
    <section className={`${CARD} flex h-[70dvh] min-h-[440px] min-w-0 flex-col overflow-hidden lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:h-[calc(100dvh-140px)] lg:max-h-[760px]`}>
      <div className="flex items-center justify-between gap-3 border-b-2 border-talo-ink px-4 py-3 sm:px-5">
        <h2 className={H2}>Chat</h2>
        {muted.length > 0 && (
          <button onClick={onUnmuteAll} className="text-sm font-semibold underline underline-offset-4">
            Mostrar a {muted.length === 1 ? "1 silenciado" : `${muted.length} silenciados`}
          </button>
        )}
      </div>

      {pinned && (
        <div className="flex gap-2.5 border-b-2 border-talo-ink bg-talo-hero px-4 py-3 sm:px-5">
          <Megaphone className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-[15px] font-semibold leading-snug">
            {pinned.text}
            <span className="ml-1.5 text-xs font-bold opacity-70">— {pinned.name}, Admin</span>
          </p>
        </div>
      )}

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-3 sm:px-3"
        aria-live="polite"
      >
        {visible.length === 0 && (
          <p className="m-auto max-w-xs text-center text-[15px] text-black/55">Todavía no hay mensajes. ¡Saludá y arrancá la ronda!</p>
        )}
        {visible.map((m) => (
          <MessageRow
            key={m.id}
            m={m}
            mine={m.by === myClientId}
            hidden={(reports[m.id] ?? 0) >= HIDE_AT}
            reportCount={reports[m.id] ?? 0}
            banned={!!m.uid && bans.has(m.uid)}
            muted={muted.includes(m.by)}
            admin={admin}
            reported={reported.has(m.id)}
            onReport={() => report(m)}
            onMute={() => onToggleMute(m.by)}
          />
        ))}
      </div>

      <Composer me={me} uid={uid} signedIn={signedIn} admin={admin} banned={!!uid && bans.has(uid)} />
    </section>
  );
}

function MessageRow({
  m,
  mine,
  hidden,
  reportCount,
  banned,
  muted,
  admin,
  reported,
  onReport,
  onMute,
}: {
  m: PlazaMessage;
  mine: boolean;
  hidden: boolean;
  reportCount: number;
  banned: boolean;
  muted: boolean;
  admin: boolean;
  reported: boolean;
  onReport: () => void;
  onMute: () => void;
}) {
  const talo = playerTalo(m.by, m.color, 30);
  if (hidden && !admin) {
    return <p className="px-2 py-1 text-sm italic text-black/45">Mensaje oculto por reportes.</p>;
  }
  const text = m.kind === "text" ? softenText(m.text) : m.text;
  const bigEmoji = m.kind === "quick" && !/\p{L}/u.test(m.text);
  return (
    <div className={`group flex gap-2.5 rounded-2xl px-2 py-1.5 ${m.admin ? "bg-talo-hero/35" : "hover:bg-black/[0.03]"} ${hidden || banned ? "opacity-60" : ""}`}>
      <span className="flex h-9 w-9 shrink-0 items-end justify-center pt-1">
        <Talo w={talo.w} h={talo.h} radius={talo.radius} color={talo.color} label={m.name} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 text-[13px]">
          <span className="font-bold">{m.name}</span>
          {m.admin && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-talo-ink px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-talo-hero">
              <BadgeCheck className="h-3 w-3" /> Admin · Talo
            </span>
          )}
          {mine && <span className="text-black/45">(vos)</span>}
          <span className="text-black/40">{clock(m.at)}</span>
          {admin && reportCount > 0 && <span className="font-bold text-red-600">{reportCount} reportes</span>}
          {admin && banned && <span className="font-bold text-red-600">baneado</span>}
        </p>
        <p className={`break-words leading-snug ${bigEmoji ? "text-2xl" : m.kind === "quick" ? "text-[15px] font-semibold" : "text-[15px]"}`}>{text}</p>
      </div>
      <div className="flex shrink-0 items-start gap-0.5 opacity-60 transition group-hover:opacity-100 sm:opacity-0 sm:focus-within:opacity-100">
        {!mine && !m.admin && (
          <>
            <button onClick={onReport} disabled={reported} title={reported ? "Reportado" : "Reportar"} aria-label="Reportar mensaje" className="rounded-lg p-1.5 hover:bg-black/5 disabled:text-red-600">
              <Flag className="h-4 w-4" />
            </button>
            <button onClick={onMute} title={muted ? "Dejar de silenciar" : "Silenciar a esta persona"} aria-label="Silenciar" className="rounded-lg p-1.5 hover:bg-black/5">
              <VolumeX className="h-4 w-4" />
            </button>
          </>
        )}
        {admin && <AdminMessageTools m={m} hidden={hidden} banned={banned} />}
      </div>
    </div>
  );
}

function AdminMessageTools({ m, hidden, banned }: { m: PlazaMessage; hidden: boolean; banned: boolean }) {
  return (
    <>
      {hidden && (
        <button onClick={() => restoreMessage(m.id).catch(console.error)} title="Restaurar (quitar reportes)" aria-label="Restaurar" className="rounded-lg p-1.5 text-emerald-700 hover:bg-black/5">
          <Undo2 className="h-4 w-4" />
        </button>
      )}
      <button
        onClick={() => confirm("¿Borrar este mensaje?") && deleteMessage(m.id).catch(console.error)}
        title="Borrar"
        aria-label="Borrar mensaje"
        className="rounded-lg p-1.5 text-red-600 hover:bg-black/5"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {m.uid && !m.admin && (
        <button
          onClick={() => confirm(banned ? `¿Desbanear a ${m.name}?` : `¿Banear a ${m.name}? No va a poder escribir en la Plaza.`) && setBan(m.uid!, !banned).catch(console.error)}
          title={banned ? "Desbanear" : "Banear"}
          aria-label={banned ? "Desbanear" : "Banear"}
          className="rounded-lg p-1.5 text-red-600 hover:bg-black/5"
        >
          <Ban className="h-4 w-4" />
        </button>
      )}
    </>
  );
}

function Composer({
  me,
  uid,
  signedIn,
  admin,
  banned,
}: {
  me: { clientId: string; name: string; color: string } | null;
  uid: string | undefined;
  signedIn: boolean;
  admin: boolean;
  banned: boolean;
}) {
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inApp = typeof navigator !== "undefined" && inAppBrowser();

  const tooSoon = () => {
    const wait = waitToPost();
    if (wait > 0) setNote(`Esperá ${Math.ceil(wait / 1000)} s para mandar otro.`);
    return wait > 0;
  };

  const quick = (q: number) => {
    if (!me || tooSoon()) return;
    setNote(null);
    sendQuick(me, q)
      .then(() => trackEvent("plaza_message", { kind: "frase" }))
      .catch(() => setNote("No se pudo mandar. Probá de nuevo en unos segundos."));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!me || !uid || !clean || busy) return;
    if (hasContact(clean)) {
      setNote("Por seguridad no se pueden mandar links, mails, @ ni números de teléfono.");
      return;
    }
    if (tooSoon()) return;
    setBusy(true);
    setNote(null);
    sendText(me, uid, clean, admin)
      .then(() => {
        setText("");
        trackEvent("plaza_message", { kind: "texto" });
      })
      .catch(() => setNote("No se pudo mandar. Probá de nuevo en unos segundos."))
      .finally(() => setBusy(false));
  };

  return (
    <div className="flex flex-col gap-2 border-t-2 border-talo-ink bg-[#f6f6f6] px-3 py-3 sm:px-4">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {PLAZA_PHRASES.map((p, i) => (
          <button
            key={p}
            onClick={() => quick(i)}
            disabled={!me}
            className="shrink-0 rounded-full border-2 border-talo-ink bg-white px-3 py-1.5 text-sm font-semibold hover:bg-talo-hero disabled:opacity-40"
          >
            {p}
          </button>
        ))}
      </div>
      {banned ? (
        <p className="text-sm font-semibold text-red-700">Tu cuenta no puede escribir en la Plaza. Podés seguir usando las frases rápidas.</p>
      ) : signedIn ? (
        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, PLAZA_MAX_CHARS))}
            placeholder={admin ? "Escribí como Admin · Talo…" : "Escribí un mensaje…"}
            aria-label="Mensaje"
            enterKeyHint="send"
            className="min-h-11 min-w-0 flex-1 rounded-xl border-2 border-talo-ink bg-white px-3 text-[15px] outline-none focus:ring-2 focus:ring-talo-hero"
          />
          <button type="submit" disabled={!text.trim() || busy} aria-label="Mandar" className="flex min-h-11 items-center gap-1.5 rounded-xl bg-talo-ink px-4 font-bold text-talo-hero disabled:opacity-40">
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Mandar</span>
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button onClick={() => signInWithGoogle().catch(() => setNote("No se pudo entrar. Probá de nuevo."))} className="rounded-xl bg-talo-ink px-4 py-2.5 font-bold text-talo-hero">
            Entrá con Google para escribir
          </button>
          <span className="text-black/60">Sin cuenta podés usar las frases rápidas.</span>
          {inApp && <span className="w-full text-xs text-black/60">Desde TikTok o Instagram, abrí Talo en tu navegador para entrar con Google.</span>}
        </div>
      )}
      {note && <p className="text-sm font-semibold text-red-700">{note}</p>}
    </div>
  );
}

function Calls({ calls, myClientId }: { calls: PlazaCall[]; myClientId: string }) {
  const now = useServerNow(true, 30000);
  return (
    <section className={`${CARD} flex flex-col gap-3 p-4 sm:p-5`}>
      <h2 className={H2}>Buscan gente</h2>
      {calls.length === 0 ? (
        <p className="text-[15px] leading-snug text-black/65">
          Ahora no hay salas buscando jugadores. Para pedir gente, creá una sala en cualquier juego y tocá{" "}
          <b>«Buscar gente en la Plaza»</b> en la sala de espera.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {calls.map((c) => (
            <li key={c.room} className="flex items-center gap-3 rounded-2xl border-2 border-talo-ink p-2.5">
              <GameIcon game={c.game} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{GAMES[c.game].title}</p>
                <p className="truncate text-[13px] text-black/60">
                  {c.by === myClientId ? "Tu sala" : c.name} · {c.count === 1 ? "1 en la sala" : `${c.count} en la sala`} · {ago(now - c.at)}
                </p>
              </div>
              {c.by !== myClientId && (
                <Link
                  href={roomPath(c.game, c.room)}
                  onClick={() => trackEvent("plaza_join", { game: c.game })}
                  className="shrink-0 rounded-xl bg-talo-ink px-3.5 py-2 text-sm font-bold text-talo-hero"
                >
                  Unirme
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function People({ people }: { people: PlazaPerson[] }) {
  const shown = people.slice(0, 30);
  return (
    <section className={`${CARD} flex flex-col gap-3 p-4 sm:p-5`}>
      <h2 className={`${H2} flex items-center gap-2`}>
        <Users className="h-6 w-6" /> Ahora en la Plaza
      </h2>
      {people.length === 0 ? (
        <p className="text-[15px] text-black/60">Nadie por ahora.</p>
      ) : (
        <ul className="flex flex-wrap gap-x-3 gap-y-2">
          {shown.map((p) => {
            const t = playerTalo(p.id, p.color, 26);
            return (
              <li key={p.id} className="flex items-center gap-1.5">
                <span className="flex h-7 w-7 items-end justify-center">
                  <Talo w={t.w} h={t.h} radius={t.radius} color={t.color} expr="contento" label={p.name} />
                </span>
                <span className="max-w-28 truncate text-sm font-semibold">{p.name}</span>
                {p.admin && <ShieldCheck className="h-4 w-4 text-talo-ink" aria-label="Admin" />}
              </li>
            );
          })}
          {people.length > shown.length && <li className="text-sm font-semibold text-black/60">y {people.length - shown.length} más</li>}
        </ul>
      )}
    </section>
  );
}

function Rules() {
  return (
    <section className={`${CARD} flex flex-col gap-2 p-4 sm:p-5`}>
      <h2 className={H2}>Para que la Plaza esté buena</h2>
      <ul className="list-disc space-y-1 pl-5 text-[15px] leading-snug">
        <li>Sé amable: es un lugar para encontrar con quién jugar.</li>
        <li>No compartas datos personales: teléfono, dirección, redes ni dónde estudiás o trabajás.</li>
        <li>No se pueden mandar links ni números de contacto.</li>
        <li>Si algo está mal, reportalo con la banderita: con {HIDE_AT} reportes se oculta. También podés silenciar a alguien.</li>
      </ul>
    </section>
  );
}

function AdminPanel({ pinned, bans, messages, name }: { pinned: Pinned | null; bans: Set<string>; messages: PlazaMessage[]; name: string }) {
  const [text, setText] = useState(pinned?.text ?? "");
  const names = new Map(messages.filter((m) => m.uid).map((m) => [m.uid!, m.name]));
  return (
    <section className={`${CARD} flex flex-col gap-3 border-dashed p-4 sm:p-5`}>
      <h2 className={`${H2} flex items-center gap-2`}>
        <ShieldCheck className="h-6 w-6" /> Administración
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPinned(text.trim() || null, name).catch(console.error);
        }}
        className="flex flex-col gap-2"
      >
        <label className="text-sm font-bold" htmlFor="pin">
          Aviso fijado arriba del chat
        </label>
        <textarea
          id="pin"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, PLAZA_MAX_CHARS))}
          rows={2}
          placeholder="Ej.: ¡Nuevo juego! Probá Minigolf con amigos."
          className="rounded-xl border-2 border-talo-ink px-3 py-2 text-[15px]"
        />
        <div className="flex gap-2">
          <button type="submit" className="flex items-center gap-1.5 rounded-xl bg-talo-ink px-3.5 py-2 text-sm font-bold text-talo-hero">
            <Pin className="h-4 w-4" /> {text.trim() ? "Fijar" : "Quitar aviso"}
          </button>
          {pinned && (
            <button type="button" onClick={() => setPinned(null, name).then(() => setText(""))} className="rounded-xl border-2 border-talo-ink px-3.5 py-2 text-sm font-bold">
              Quitar
            </button>
          )}
        </div>
      </form>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-bold">Cuentas baneadas ({bans.size})</p>
        {bans.size === 0 ? (
          <p className="text-sm text-black/60">Ninguna.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {[...bans].map((b) => (
              <li key={b} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{names.get(b) ?? b}</span>
                <button onClick={() => setBan(b, false).catch(console.error)} className="shrink-0 font-semibold underline underline-offset-4">
                  Desbanear
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-black/55">Pasá el mouse (o tocá) un mensaje para borrarlo, banear a su cuenta o restaurarlo si fue reportado.</p>
    </section>
  );
}
