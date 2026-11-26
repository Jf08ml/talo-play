"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Flag, HelpCircle, Mic, SkipForward, Sparkles, X } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  ANSWERS,
  ANSWER_SECONDS,
  GUESS_BASE,
  MAX_CHARACTER,
  MAX_PER_TURN,
  MAX_QUESTION,
  MIN_PLAYERS,
  WRITE_GRACE_MS,
  answer,
  ask,
  closeQuestion,
  fillPostits,
  getQuienMeta,
  giveUp,
  guess,
  guessMatches,
  joinQuien,
  nextRound,
  normalizeMeta,
  passTurn,
  roundPoints,
  skipAbsent,
  startQuien,
  submitPostit,
  subscribeQuien,
  targetOf,
  writerOf,
  type Answer,
  type QuienSettings,
  type QuienState,
} from "@/lib/quiensoy";
import { QUIEN_DECKS } from "@/lib/quiensoyCards";
import type { PresenceMap } from "@/lib/presence";
import { playerTalo } from "@/lib/talos";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useServerNow } from "@/hooks/useServerNow";
import { useTurnAlert } from "@/hooks/useTurnAlert";
import { useSoundOn } from "@/hooks/useSound";
import { placeIn, useAwardMatch } from "@/hooks/useAwardMatch";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { BackToRoomButton, RoomSettingsEditor, type RawMeta } from "@/components/RoomSettings";
import GameResults, { rankFrom } from "@/components/Results";
import { Talo } from "@/components/Talo";
import { watchRoomMeta } from "@/lib/roomSettings";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_INPUT } from "@/components/ui";
import { SETTINGS } from "../settings";

type Status = "loading" | "not-found" | "ready" | "error";
type Config = QuienSettings & { hostId: string };

const ANSWER_STYLE: Record<Answer, string> = {
  si: "bg-emerald-500 text-slate-950",
  no: "bg-rose-500 text-white",
  aveces: "bg-amber-400 text-slate-950",
  nose: "bg-slate-500 text-white",
};

export default function QuienClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [state, setState] = useState<QuienState | null>(null);
  useSoundOn(state?.log.length, "place");
  useSoundOn(Object.keys(state?.done ?? {}).length || undefined, "good");

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getQuienMeta>>>>(
      roomId,
      (meta) => {
        if (cancelled) return;
        setRoomMeta(meta);
        if (!meta) return setStatus("not-found");
        if (meta.game !== "quiensoy") return router.replace(`/sala/${roomId}`);
        setConfig({ ...normalizeMeta(meta), hostId: meta.hostId ?? "" });
        unsub ??= subscribeQuien(roomId, setState);
        setStatus("ready");
      },
      (err) => {
        console.error(err);
        if (!cancelled) setStatus("error");
      }
    );
    return () => {
      cancelled = true;
      unsubMeta();
      unsub?.();
    };
  }, [configured, roomId, identity.clientId, identity.name, router]);

  const hasState = state !== null;
  useEffect(() => {
    if (!hasState || !identity.clientId || !identity.name) return;
    joinQuien(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const phase = state?.status;
  const question = state?.question ?? null;
  const now = useServerNow(phase === "playing" || phase === "writing");
  const turnNo = state?.turnNo ?? 0;
  const turn = state?.turn ?? "";
  const myTurn = phase === "playing" && turn === myId && !question;
  useTurnAlert(myTurn);

  // Timeouts and absent players: every client runs these, the transactions are guarded so they apply once.
  const answerExpired = !!question && now > 0 && now >= question.at + ANSWER_SECONDS * 1000;
  const turnGone = phase === "playing" && presenceLoaded && !!turn && !(turn in presence);
  const absentKey = state ? state.order.filter((id) => !(id in presence)).join(",") : "";
  useEffect(() => {
    if (phase !== "playing") return;
    if (question && answerExpired) closeQuestion(roomId, turnNo, question.at).catch(console.error);
    else if (turnGone) skipAbsent(roomId, turnNo, absentKey.split(",").filter(Boolean)).catch(console.error);
  }, [phase, question, answerExpired, turnGone, roomId, turnNo, absentKey]);

  // Ranking: each round is a match, by the points of that round.
  const awardOutcome =
    state?.status === "finished" && state.order.includes(myId)
      ? {
          place: placeIn(
            Object.entries(roundPoints(state)).map(([id, score]) => ({ id, score })),
            myId
          ),
          players: state.order.length,
        }
      : null;
  useAwardMatch("quiensoy", roomId, `${state?.roundNo ?? 0}:${state?.seed ?? 0}`, awardOutcome);

  if (!configured) return <FirebaseSetupNotice />;

  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  const inRound = !!state?.order.includes(myId);
  const decksLabel =
    config && config.decks.length < QUIEN_DECKS.length ? config.decks.map((d) => QUIEN_DECKS.find((x) => x.id === d)?.label).join(", ") : "todos los mazos";
  const summary = config
    ? `${config.askMode === "voz" ? "Preguntas en voz alta" : "Preguntas escritas"} · ${config.source === "postit" ? "personajes escritos por ustedes" : decksLabel}`
    : "";

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="quiensoy"
        roomId={roomId}
        chatLocked={(phase === "writing" || phase === "playing") && "El chat vuelve al terminar la ronda, así nadie le dice a otro quién es."}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="quiensoy" />}

        {status === "loading" && <RoomLoading text="Repartiendo personajes…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="quiensoy"
              roomId={roomId}
              hostId={config.hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={summary}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              minToStart={MIN_PLAYERS}
              onStart={() => startQuien(roomId, connected, config)}
            />
          </div>
        )}

        {status === "ready" && state && config && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
            {!inRound && state.status !== "finished" && (
              <p className={`${CARD} !p-3 text-center text-sm text-white/70`}>Llegaste con la ronda empezada: mira cómo juegan y entras en la próxima.</p>
            )}

            {state.status === "writing" && <WritingPanel roomId={roomId} state={state} myId={myId} decks={config.decks} presence={presence} now={now} />}

            {state.status !== "writing" && <Table state={state} myId={myId} presence={presence} />}

            {state.status === "playing" && (
              <>
                <LastGuess state={state} myId={myId} now={now} />
                <TurnPanel roomId={roomId} state={state} myId={myId} askMode={config.askMode} presence={presence} now={now} />
                {inRound && <MyNotes state={state} myId={myId} roomId={roomId} />}
              </>
            )}

            {state.status === "finished" && (
              <>
                <GameResults
                  ranking={rankFrom(state.players, roundPoints(state), state.order)}
                  myId={myId}
                  title="¡Todos saben quiénes son!"
                  subtitle={`Ronda ${state.roundNo + 1}: menos preguntas, más puntos.`}
                  actions={
                    <button
                      onClick={() => nextRound(roomId, state.roundNo, connected, config)}
                      disabled={connected.length < MIN_PLAYERS}
                      className={PRIMARY_BUTTON}
                    >
                      Otra ronda (los puntos se suman)
                    </button>
                  }
                >
                  <Reveal state={state} myId={myId} />
                </GameResults>
                <TotalScores state={state} myId={myId} />
                <BackToRoomButton roomId={roomId} stateKey="quiensoy/state" hostId={config.hostId} presence={presence} myId={myId} />
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const nameOf = (s: QuienState, id: string, myId: string) => (id === myId ? "Tú" : (s.players[id]?.name ?? "?"));

/** Everyone around the table with the character "on their forehead": yours is a "?". */
function Table({ state, myId, presence }: { state: QuienState; myId: string; presence: PresenceMap }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {state.order.map((id) => {
        const card = state.cards[id];
        const done = state.done[id];
        const mine = id === myId;
        const show = !mine || !!done || state.status === "finished";
        const turn = state.status === "playing" && state.turn === id;
        const away = !(id in presence);
        const color = state.players[id]?.color ?? "#94a3b8";
        return (
          <div
            key={id}
            className={`flex flex-col items-center gap-2 rounded-2xl p-3 text-center transition ${turn ? "bg-talo-hero/15 ring-2 ring-talo-hero" : "bg-white/[0.04] ring-1 ring-white/[0.08]"} ${away ? "opacity-50" : ""}`}
          >
            {/* The post-it on the forehead. */}
            <div
              className={`relative flex min-h-14 w-full items-center justify-center rounded-lg px-2 py-2 font-display text-base leading-tight shadow-[0_3px_0_rgba(0,0,0,0.25)] ${mine && !show ? "bg-white/10 text-white/70" : "bg-talo-hero text-talo-ink"}`}
            >
              {show ? card?.name ?? "…" : <HelpCircle className="h-7 w-7" />}
              {done && (
                <span className={`absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full ${done.how === "guessed" ? "bg-emerald-500" : "bg-slate-500"}`}>
                  {done.how === "guessed" ? <Check className="h-4 w-4 text-white" /> : <Flag className="h-3.5 w-3.5 text-white" />}
                </span>
              )}
            </div>
            <Talo {...playerTalo(id, color, 52)} expr={done?.how === "guessed" ? "contento" : turn ? "pensando" : mine ? "sospechoso" : "normal"} />
            <div className="text-sm font-bold text-white">{nameOf(state, id, myId)}</div>
            <div className="text-[11px] text-white/50">
              {done ? (done.how === "guessed" ? `Adivinó · ${done.q} preguntas · +${done.pts}` : "Se rindió") : `${state.asked[id] ?? 0} preguntas`}
              {card?.by && state.status === "finished" ? ` · lo escribió ${nameOf(state, card.by, myId)}` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Whose turn it is and what's happening: ask or guess (you), answer (the rest), or wait. */
function TurnPanel({
  roomId,
  state,
  myId,
  askMode,
  presence,
  now,
}: {
  roomId: string;
  state: QuienState;
  myId: string;
  askMode: "app" | "voz";
  presence: PresenceMap;
  now: number;
}) {
  const q = state.question;
  const asker = state.turn;
  const mine = asker === myId;
  const others = state.order.filter((id) => id !== (q?.by ?? asker) && id in presence);
  const answered = Object.keys(state.answers).length;

  if (q) {
    const left = Math.max(0, q.at + ANSWER_SECONDS * 1000 - now);
    const myAnswer = state.answers[myId];
    const canAnswer = !mine && state.order.includes(myId);
    return (
      <div className={`${CARD} flex flex-col gap-3`}>
        <p className="text-xs font-bold uppercase tracking-wide text-white/50">{mine ? "Tu pregunta" : `Pregunta de ${nameOf(state, q.by, myId)}`}</p>
        <p className="font-display text-2xl text-white">{q.text ? `«${q.text}»` : mine ? "Hazla en voz alta" : "Pregunta en voz alta…"}</p>
        {!mine && (
          <p className="text-sm text-white/60">
            {nameOf(state, q.by, myId)} es <b className="text-talo-hero">{state.cards[q.by]?.name}</b>. ¿Qué le respondes?
          </p>
        )}
        {canAnswer && (
          <div className="grid grid-cols-4 gap-2">
            {ANSWERS.map((a) => (
              <button
                key={a.id}
                onClick={() => answer(roomId, state.turnNo, myId, a.id, others.length).catch(console.error)}
                className={`rounded-xl py-3 text-base font-bold transition ${myAnswer === a.id ? ANSWER_STYLE[a.id] : "bg-white/10 text-white hover:bg-white/20"}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 text-sm text-white/60">
          <span>
            {answered} de {others.length} respondieron
          </span>
          {mine && answered > 0 && (
            <button onClick={() => closeQuestion(roomId, state.turnNo, q.at).catch(console.error)} className="rounded-lg px-2 py-1 text-xs font-bold text-white/80 hover:bg-white/10">
              Cerrar con estas respuestas
            </button>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-talo-hero transition-[width] duration-200 ease-linear" style={{ width: `${(left / (ANSWER_SECONDS * 1000)) * 100}%` }} />
        </div>
      </div>
    );
  }

  if (!mine) {
    return (
      <div className={`${CARD} flex items-center gap-3`}>
        <Talo {...playerTalo(asker, state.players[asker]?.color ?? "#94a3b8", 40)} expr="pensando" />
        <p className="text-white/80">
          Turno de <b className="text-white">{nameOf(state, asker, myId)}</b>: está pensando qué preguntar o si arriesga.
        </p>
      </div>
    );
  }
  return <MyTurn roomId={roomId} state={state} myId={myId} askMode={askMode} />;
}

function MyTurn({ roomId, state, myId, askMode }: { roomId: string; state: QuienState; myId: string; askMode: "app" | "voz" }) {
  const [text, setText] = useState("");
  const [guessing, setGuessing] = useState(false);
  const [name, setName] = useState("");
  const card = state.cards[myId];
  const asked = state.asked[myId] ?? 0;
  const misses = state.misses[myId] ?? 0;
  const worth = Math.max(2, GUESS_BASE - asked - 2 * misses);
  const leftThisTurn = MAX_PER_TURN - state.turnAsked;

  const submitAsk = (e: FormEvent) => {
    e.preventDefault();
    if (askMode === "app" && !text.trim()) return;
    ask(roomId, state.turnNo, myId, askMode === "app" ? text : "").catch(console.error);
    setText("");
  };
  const submitGuess = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !card) return;
    guess(roomId, state.turnNo, myId, name, guessMatches(name, card)).catch(console.error);
    setName("");
    setGuessing(false);
  };

  return (
    <div className={`${CARD} flex flex-col gap-3 ring-2 ring-talo-hero`}>
      <p className="font-display text-2xl text-talo-hero">¡Te toca!</p>
      <p className="text-sm text-white/70">
        Pregunta por sí o por no sobre ti. Mientras no te digan que no, sigues ({leftThisTurn} {leftThisTurn === 1 ? "pregunta más" : "preguntas más"} en este turno). Si
        adivinas ahora, ganas <b className="text-white">{worth} puntos</b>.
      </p>
      {!guessing ? (
        <>
          {askMode === "app" ? (
            <form onSubmit={submitAsk} className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={MAX_QUESTION}
                placeholder="¿Soy una persona real?"
                className={`${TEXT_INPUT} flex-1`}
                autoFocus
              />
              <button type="submit" disabled={!text.trim()} className={PRIMARY_BUTTON}>
                Preguntar
              </button>
            </form>
          ) : (
            <button onClick={submitAsk} className={`${PRIMARY_BUTTON} flex items-center justify-center gap-2`}>
              <Mic className="h-5 w-5" /> Ya pregunté en voz alta
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setGuessing(true)} className={`${SECONDARY_BUTTON} flex items-center justify-center gap-1.5`}>
              <Sparkles className="h-4 w-4" /> Adivinar
            </button>
            <button onClick={() => passTurn(roomId, state.turnNo, myId).catch(console.error)} className={`${SECONDARY_BUTTON} flex items-center justify-center gap-1.5`}>
              <SkipForward className="h-4 w-4" /> Pasar el turno
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submitGuess} className="flex flex-col gap-2">
          <p className="text-sm text-white/70">¿Quién eres? Si fallas, pierdes el turno y vale 2 puntos menos.</p>
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_CHARACTER} placeholder="Soy…" className={`${TEXT_INPUT} flex-1`} autoFocus />
            <button type="submit" disabled={!name.trim()} className={PRIMARY_BUTTON}>
              ¡Soy yo!
            </button>
          </div>
          <button type="button" onClick={() => setGuessing(false)} className="text-sm text-white/60 underline">
            Mejor sigo preguntando
          </button>
        </form>
      )}
    </div>
  );
}

/** The last guess, for a few seconds: who said what and how it went. */
function LastGuess({ state, myId, now }: { state: QuienState; myId: string; now: number }) {
  const g = state.lastGuess;
  if (!g || now - g.at > 6000) return null;
  const card = state.cards[g.by];
  return (
    <div className={`animate-celebration-in flex items-center gap-3 rounded-2xl px-4 py-3 ${g.ok ? "bg-emerald-500/20 ring-1 ring-emerald-400/50" : "bg-rose-500/15 ring-1 ring-rose-400/40"}`}>
      {g.ok ? <Check className="h-6 w-6 shrink-0 text-emerald-300" /> : <X className="h-6 w-6 shrink-0 text-rose-300" />}
      <p className="text-white">
        {g.ok ? (
          <>
            ¡<b>{nameOf(state, g.by, myId)}</b> adivinó! Era <b>{card?.name}</b>.
          </>
        ) : (
          <>
            <b>{nameOf(state, g.by, myId)}</b> dijo «{g.text}»… no era.
          </>
        )}
      </p>
    </div>
  );
}

/** What you know about yourself: your questions and how they were answered. And the way out. */
function MyNotes({ state, myId, roomId }: { state: QuienState; myId: string; roomId: string }) {
  const [confirm, setConfirm] = useState(false);
  const mine = state.log.filter((e) => e.by === myId);
  const done = state.done[myId];
  const verdict = (e: (typeof mine)[number]) => {
    const top = (["si", "no", "aveces", "nose"] as const).reduce((a, b) => (e[b] > e[a] ? b : a), "si");
    return e[top] === 0 ? "nose" : top;
  };
  return (
    <div className={`${CARD} flex flex-col gap-2`}>
      <p className="text-sm font-bold text-white/70">Lo que sabes de ti</p>
      {mine.length === 0 && <p className="text-sm text-white/50">Todavía no preguntaste nada.</p>}
      <ul className="flex flex-col gap-1.5">
        {mine.map((e, i) => {
          const v = verdict(e);
          return (
            <li key={i} className="flex items-center gap-2 text-sm text-white">
              <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${ANSWER_STYLE[v]}`}>{ANSWERS.find((a) => a.id === v)?.label}</span>
              <span className="min-w-0 flex-1 truncate">{e.text || `Pregunta ${i + 1} (en voz alta)`}</span>
              <span className="shrink-0 text-[11px] text-white/40">
                {e.si} sí · {e.no} no
              </span>
            </li>
          );
        })}
      </ul>
      {!done &&
        (confirm ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-white/70">¿Seguro? Ves tu personaje y no sumas puntos.</span>
            <button onClick={() => giveUp(roomId, state.roundNo, myId).catch(console.error)} className="rounded-lg bg-rose-500 px-3 py-1 font-bold text-white">
              Me rindo
            </button>
            <button onClick={() => setConfirm(false)} className="rounded-lg px-2 py-1 text-white/70 hover:bg-white/10">
              No
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)} className="mt-1 w-fit text-xs text-white/50 underline">
            Me rindo
          </button>
        ))}
    </div>
  );
}

/** Post-it: write the character of the one after you, without them seeing it. */
function WritingPanel({ roomId, state, myId, decks, presence, now }: { roomId: string; state: QuienState; myId: string; decks: QuienSettings["decks"]; presence: PresenceMap; now: number }) {
  const [text, setText] = useState("");
  const target = targetOf(state.order, myId);
  const written = state.postits[myId];
  const missing = state.order.filter((id) => !state.postits[id]);
  const stuck = missing.some((id) => !(id in presence)) || now - state.phaseStartedAt > WRITE_GRACE_MS;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    submitPostit(roomId, state.roundNo, myId, text, decks).catch(console.error);
  };
  return (
    <div className="flex flex-col gap-4">
      {target && state.order.includes(myId) && (
        <div className={`${CARD} flex flex-col gap-3`}>
          <div className="flex items-center gap-3">
            <Talo {...playerTalo(target, state.players[target]?.color ?? "#94a3b8", 48)} expr="sospechoso" />
            <p className="text-white">
              Escribe quién va a ser <b className="text-talo-hero">{nameOf(state, target, myId)}</b>: una persona famosa, un personaje, un animal… algo que todos conozcan.
            </p>
          </div>
          {written ? (
            <p className="rounded-lg bg-talo-hero px-3 py-2 text-center font-display text-lg text-talo-ink">{written}</p>
          ) : (
            <form onSubmit={submit} className="flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_CHARACTER} placeholder="Ej.: Shakira" className={`${TEXT_INPUT} flex-1`} autoFocus />
              <button type="submit" disabled={!text.trim()} className={PRIMARY_BUTTON}>
                Listo
              </button>
            </form>
          )}
          <p className="text-xs text-white/50">Que {nameOf(state, target, myId)} no mire tu pantalla.</p>
        </div>
      )}
      <div className={`${CARD} flex flex-col gap-2`}>
        <p className="text-sm text-white/70">
          Ya escribieron {state.order.length - missing.length} de {state.order.length}.
          {missing.length > 0 && ` Falta: ${missing.map((id) => nameOf(state, id, myId)).join(", ")}.`}
        </p>
        {stuck && missing.length > 0 && (
          <button onClick={() => fillPostits(roomId, state.roundNo, decks).catch(console.error)} className={SECONDARY_BUTTON}>
            Empezar ya (la app elige los que faltan)
          </button>
        )}
      </div>
      <p className="text-center text-xs text-white/40">
        Cada uno escribe el de {writerOf(state.order, myId) ? "la persona que le sigue" : "otro"}; nadie ve el suyo.
      </p>
    </div>
  );
}

/** At the end: everyone's character, how many questions they needed. */
function Reveal({ state, myId }: { state: QuienState; myId: string }) {
  return (
    <ul className="grid w-full grid-cols-1 gap-1.5 sm:grid-cols-2">
      {state.order.map((id) => {
        const d = state.done[id];
        return (
          <li key={id} className="flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2 text-left text-sm text-white">
            <Talo {...playerTalo(id, state.players[id]?.color ?? "#94a3b8", 24)} expr={d?.how === "guessed" ? "contento" : "triste"} />
            <span className="min-w-0 flex-1 truncate">
              <b>{nameOf(state, id, myId)}</b> era <b className="text-talo-hero">{state.cards[id]?.name}</b>
            </span>
            <span className="shrink-0 text-xs text-white/50">{d?.how === "guessed" ? `${d.q} preg.` : "se rindió"}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Points added up over the rounds played in this room. */
function TotalScores({ state, myId }: { state: QuienState; myId: string }) {
  if (state.roundNo === 0) return null;
  const ids = Object.keys(state.scores).filter((id) => state.players[id]).sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0));
  return (
    <div className={`${CARD} flex flex-col gap-1.5`}>
      <p className="text-sm font-bold text-white/70">Puntos de todas las rondas</p>
      {ids.map((id) => (
        <div key={id} className="flex items-center justify-between text-sm text-white">
          <span>{nameOf(state, id, myId)}</span>
          <span className="font-mono">{state.scores[id] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

