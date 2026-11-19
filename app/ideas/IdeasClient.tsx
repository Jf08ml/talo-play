"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Heart, Send } from "lucide-react";
import SiteHeader, { SiteFooter } from "@/components/SiteHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { Talo } from "@/components/Talo";
import NamePrompt from "@/components/NamePrompt";
import { useAccount } from "@/components/AccountProvider";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { isFirebaseConfigured } from "@/lib/firebase";
import { trackEvent } from "@/lib/analytics";
import {
  CANDIDATES,
  CONTACT_MAX,
  FEEDBACK_KINDS,
  FEEDBACK_MAX,
  sendFeedback,
  setVote,
  subscribeVotes,
  type FeedbackKind,
  type Votes,
} from "@/lib/community";

const CARD = "rounded-[24px] border-2 border-talo-ink bg-white p-4 sm:p-6";
const H2 = "font-display text-[24px] leading-[1.05] sm:text-[28px]";

/** The community page: vote for the next game and send ideas, improvements or bugs. */
export default function IdeasClient() {
  if (!isFirebaseConfigured()) return <FirebaseSetupNotice />;
  return (
    <div className="talo-light flex flex-1 flex-col">
      <section className="overflow-hidden bg-talo-hero">
        <SiteHeader />
        <div className="mx-auto flex max-w-[1360px] flex-col gap-3 px-5 pb-10 pt-2 sm:px-10 sm:pb-14 sm:pt-6">
          <h1 className="font-display text-[44px] leading-none tracking-[-0.02em] sm:text-[clamp(56px,6vw,88px)]">
            Talo lo armamos entre todos
          </h1>
          <p className="max-w-2xl text-[17px] font-medium leading-[1.4] sm:text-[22px]">
            Votá qué juego querés que sumemos y contanos qué mejorarías. Leemos todo.
          </p>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-[1360px] flex-1 items-start gap-4 px-4 py-8 sm:gap-6 sm:px-10 sm:py-14 md:grid-cols-[1.2fr_1fr] lg:gap-10">
        <VoteNextGame />
        <FeedbackForm />
      </div>
      <SiteFooter />
    </div>
  );
}

function VoteNextGame() {
  const { clientId } = useClientIdentity();
  const [votes, setVotes] = useState<Votes | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => subscribeVotes(setVotes), []);

  const rows = useMemo(() => {
    const list = CANDIDATES.map((c, i) => {
      const voters = votes?.[c.id] ?? {};
      return { ...c, i, count: Object.keys(voters).length, mine: !!clientId && !!voters[clientId] };
    });
    // Most voted first; ties keep the catalog order so the list doesn't jump around.
    return list.sort((a, b) => b.count - a.count || a.i - b.i);
  }, [votes, clientId]);
  const top = Math.max(1, ...rows.map((r) => r.count));

  const toggle = (id: string, on: boolean) => {
    if (!clientId) return;
    setError(false);
    setVote(id, clientId, on).catch((err) => {
      console.error(err);
      setError(true);
    });
  };

  return (
    <section className={CARD}>
      <h2 className={H2}>¿Qué juego sumamos?</h2>
      <p className="mt-2 text-[17px] text-talo-text-2">Votá todos los que quieras. El más pedido va primero en la fila.</p>
      {error && <p className="mt-2 text-[15px] font-semibold text-red-700">No se pudo guardar el voto. Probá de nuevo.</p>}
      <ul className="mt-4 flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => toggle(r.id, !r.mine)}
              aria-pressed={r.mine}
              disabled={votes === null}
              className={`relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border-2 px-3 py-3 text-left transition active:scale-[0.99] sm:px-4 ${
                r.mine ? "border-talo-ink" : "border-talo-line hover:border-talo-ink"
              }`}
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-talo-hero/60 transition-[width] duration-500"
                style={{ width: `${(r.count / top) * 100}%` }}
              />
              <span className="relative min-w-0 flex-1">
                <span className="block text-[17px] font-bold">{r.title}</span>
                <span className="block text-[14px] text-talo-text-3">{r.text}</span>
              </span>
              <span className="relative font-mono text-[17px] font-bold tabular-nums">{r.count}</span>
              <span
                className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                  r.mine ? "bg-talo-ink text-white" : "bg-talo-surface text-talo-ink"
                }`}
              >
                <Heart className="h-5 w-5" strokeWidth={2.4} fill={r.mine ? "currentColor" : "none"} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[15px] text-talo-text-3">¿No está el que querés? Pedilo en el formulario.</p>
    </section>
  );
}

function FeedbackForm() {
  const { clientId, name, setName } = useClientIdentity();
  const { user } = useAccount();
  // Ideas carry the same nick used to play: without one, it's asked on "Mandar".
  const [askName, setAskName] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("juego");
  const [text, setText] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "wait" | "error">("idle");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !clientId) return;
    if (!name) setAskName(true);
    else send(name);
  };

  const send = async (nick: string) => {
    setState("busy");
    try {
      const res = await sendFeedback({ kind, text, contact, name: nick, clientId, uid: user?.uid });
      setState(res);
      if (res === "sent") {
        setText("");
        trackEvent("feedback", { kind });
      }
    } catch (err) {
      console.error(err);
      setState("error");
    }
  };

  if (state === "sent") {
    return (
      <section className={`${CARD} flex flex-col items-center gap-4 text-center`}>
        <span className="flex h-24 items-end">
          <Talo w={84} h={84} radius="28px" color="#00B26B" expr="contento" />
        </span>
        <h2 className={H2}>¡Gracias!</h2>
        <p className="text-[17px] text-talo-text-2">Nos llegó. Si dejaste un contacto, puede que te escribamos.</p>
        <button
          onClick={() => setState("idle")}
          className="min-h-11 rounded-xl border-2 border-talo-ink px-4 font-bold hover:bg-talo-surface"
        >
          Mandar otra
        </button>
      </section>
    );
  }

  return (
    <section className={CARD}>
      {askName &&
        createPortal(
          <NamePrompt
            submitLabel="Mandar"
            onCancel={() => setAskName(false)}
            onSubmit={(nick) => {
              setName(nick);
              setAskName(false);
              send(nick);
            }}
          />,
          document.body,
        )}
      <h2 className={H2}>Contanos</h2>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 text-[15px] font-bold text-talo-text-3">¿Qué nos querés contar?</legend>
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                aria-pressed={kind === k.id}
                onClick={() => setKind(k.id)}
                className={`min-h-10 rounded-xl border-2 px-3 text-[15px] font-bold transition ${
                  kind === k.id ? "border-talo-ink bg-talo-ink text-white" : "border-talo-line hover:border-talo-ink"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-2">
          <span className="text-[15px] font-bold text-talo-text-3">
            {kind === "juego"
              ? "¿Qué juego te gustaría? ¿Cómo se juega?"
              : kind === "error"
                ? "¿Qué pasó y en qué juego? (y desde qué celu o compu)"
                : "Tu idea"}
          </span>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value.slice(0, FEEDBACK_MAX));
              if (state !== "busy") setState("idle");
            }}
            rows={6}
            required
            className="resize-y rounded-xl border-2 border-talo-ink bg-white p-3 text-[17px] outline-none focus:bg-talo-surface"
          />
          <span className="self-end text-[13px] text-talo-text-3">
            {text.length}/{FEEDBACK_MAX}
          </span>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[15px] font-bold text-talo-text-3">Para responderte (opcional)</span>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value.slice(0, CONTACT_MAX))}
            placeholder="Mail o Instagram"
            autoComplete="email"
            className="min-h-12 rounded-xl border-2 border-talo-ink bg-white px-3 text-[17px] outline-none placeholder:text-talo-text-3 focus:bg-talo-surface"
          />
        </label>
        <button
          disabled={state === "busy" || !text.trim() || !clientId}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-talo-ink px-4 text-[17px] font-bold text-white transition hover:bg-black active:scale-[0.98] disabled:opacity-50"
        >
          {state === "busy" ? "Mandando…" : (
            <>
              <Send className="h-4 w-4" /> Mandar
            </>
          )}
        </button>
        {state === "wait" && <p className="text-[15px] font-semibold text-talo-text-2">Esperá unos segundos antes de mandar otra.</p>}
        {state === "error" && <p className="text-[15px] font-semibold text-red-700">No se pudo mandar. Probá de nuevo en un rato.</p>}
        <p className="flex items-center gap-1.5 text-[14px] text-talo-text-3">
          <Check className="h-4 w-4" /> Solo lo leemos nosotros; no se publica.{name && ` Lo mandás como ${name}.`}
        </p>
      </form>
    </section>
  );
}
