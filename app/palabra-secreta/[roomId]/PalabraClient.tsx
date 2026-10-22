"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import { formatClock } from "@/lib/format";
import {
  MAX_TRIES,
  WORD_LENGTH,
  displayWord,
  gameKey,
  getPalabraMeta,
  joinPalabra,
  keyboardScores,
  newWord,
  normalizeWord,
  reportFinish,
  saveGuesses,
  scoreGuess,
  secretWord,
  startPalabra,
  subscribePalabra,
  type GuessBoards,
  type LetterScore,
  type PalabraState,
} from "@/lib/palabra";
import type { PresenceMap } from "@/lib/presence";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useServerNow } from "@/hooks/useServerNow";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { CARD, PRIMARY_BUTTON } from "@/components/ui";
import { Delete } from "lucide-react";
import { Confetti } from "@/components/Results";
import { useSoundOn } from "@/hooks/useSound";

type Status = "loading" | "not-found" | "ready" | "error";

const SCORE_STYLE: Record<LetterScore, string> = {
  hit: "border-emerald-500 bg-emerald-500 text-white",
  near: "border-amber-400 bg-amber-400 text-slate-950",
  miss: "border-slate-700 bg-slate-700 text-slate-300",
};

const SCORE_COLOR: Record<LetterScore, string> = { hit: "#10b981", near: "#fbbf24", miss: "#334155" };

const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKLÑ", "ZXCVBNM"];

export default function PalabraClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [hostId, setHostId] = useState("");
  const [state, setState] = useState<PalabraState | null>(null);
  const [boards, setBoards] = useState<GuessBoards>({});
  // My guesses as I play; newer than the copy in the database.
  const [local, setLocal] = useState<{ gk: string; guesses: string[] } | null>(null);
  const [typed, setTyped] = useState("");
  const [shake, setShake] = useState(0);

  const myId = identity.clientId;
  useSoundOn(state ? Object.keys(state.results).length : null, "flip");
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    getPalabraMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "palabra") return router.replace(`/sala/${roomId}`);
        setHostId(meta.hostId ?? "");
        unsub = subscribePalabra(roomId, (data) => {
          setState(data.state);
          setBoards(data.boards);
        });
        setStatus("ready");
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [configured, roomId, identity.clientId, identity.name, router]);

  const hasState = state !== null;
  useEffect(() => {
    if (!hasState || !identity.clientId || !identity.name) return;
    joinPalabra(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const gk = state ? gameKey(state) : "";
  const seed = state?.seed;
  const answer = useMemo(() => (seed !== undefined ? secretWord(seed) : ""), [seed]);
  const myGuesses = local?.gk === gk ? local.guesses : (boards[gk]?.[myId] ?? []);

  const racing = state?.status === "racing";
  const iFinished = !!state?.results[myId];
  const now = useServerNow(racing && !iFinished);
  const countingDown = racing && (now === 0 || now < (state?.startedAt ?? 0));
  const canType = racing && !countingDown && !iFinished;

  // A new race clears what I was typing.
  const [typedFor, setTypedFor] = useState(gk);
  if (typedFor !== gk) {
    setTypedFor(gk);
    setTyped("");
  }

  const press = (key: string) => {
    if (!canType) return;
    if (key === "ENTER") {
      if ([...typed].length !== WORD_LENGTH) {
        setShake((n) => n + 1);
        return;
      }
      const guesses = [...myGuesses, typed];
      setLocal({ gk, guesses });
      setTyped("");
      saveGuesses(roomId, gk, myId, guesses).catch(console.error);
      return;
    }
    if (key === "BACK") return setTyped((t) => [...t].slice(0, -1).join(""));
    const letter = normalizeWord(key);
    if (letter.length === 1) setTyped((t) => ([...t].length < WORD_LENGTH ? t + letter : t));
  };

  useEffect(() => {
    if (!canType) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") press("ENTER");
      else if (e.key === "Backspace") press("BACK");
      else if (/^[a-zñáéíóúü]$/i.test(e.key)) press(e.key);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Solved or out of tries: report it (once per race).
  const solved = myGuesses.includes(answer);
  const outOfTries = myGuesses.length >= MAX_TRIES;
  const gameNo = state?.gameNo ?? 0;
  const tries = myGuesses.length;
  useEffect(() => {
    if (racing && (solved || outOfTries) && !iFinished && answer) {
      reportFinish(roomId, gameNo, myId, tries, solved).catch(console.error);
    }
  }, [racing, solved, outOfTries, iFinished, answer, roomId, gameNo, myId, tries]);

  if (!configured) return <FirebaseSetupNotice />;

  const racers = state ? Object.keys(state.players).filter((id) => id in presence || state.results[id]) : [];
  const allDone = racers.length > 0 && racers.every((id) => state?.results[id]);
  const others = racers.filter((id) => id !== myId);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="palabra"
        roomId={roomId}
        chatLocked={racing && "El chat vuelve cuando termine la carrera, así nadie sopla la palabra."}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="palabra" />
        )}

        {status === "loading" && <RoomLoading text="Eligiendo la palabra…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="palabra"
              roomId={roomId}
              hostId={hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`${WORD_LENGTH} letras · ${MAX_TRIES} intentos · la misma palabra para todos`}
              onStart={() => startPalabra(roomId)}
            >
              <WinsTally state={state} myId={myId} />
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && state.status === "racing" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
            <div className="flex w-full flex-col items-center gap-3 lg:max-w-[460px]">
              <TopBar
                state={state}
                myId={myId}
                now={now}
                tries={myGuesses.length}
                allDone={allDone}
                onNewWord={() => newWord(roomId, state.gameNo, myId)}
              />

              <div className="relative w-full max-w-[330px]">
                <GuessGrid guesses={myGuesses} answer={answer} typed={canType ? typed : ""} shake={shake} />
                {countingDown && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-950/60">
                    <span
                      key={Math.ceil((state.startedAt - now) / 1000)}
                      className="animate-celebration-in font-display text-8xl font-bold text-white drop-shadow-[0_0_25px_rgba(168,85,247,0.8)]"
                    >
                      {now ? Math.max(1, Math.ceil((state.startedAt - now) / 1000)) : ""}
                    </span>
                  </div>
                )}
              </div>

              {iFinished ? (
                <p className="text-center text-sm text-slate-400">
                  La palabra era{" "}
                  <span className="font-display text-lg font-bold tracking-widest text-slate-100">
                    {displayWord(state.seed)}
                  </span>
                </p>
              ) : (
                <Keyboard scores={keyboardScores(myGuesses, answer)} onKey={press} disabled={!canType} />
              )}
            </div>

            <aside className="flex w-full flex-1 flex-col gap-4">
              {Object.keys(state.results).length > 0 && <Ranking state={state} myId={myId} />}
              <div className={`${CARD} !p-4`}>
                <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Rivales</h2>
                {others.length === 0 ? (
                  <p className="text-sm text-slate-500">Compartí el enlace para que se sumen otros.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {others.map((id) => (
                      <Opponent
                        key={id}
                        state={state}
                        id={id}
                        guesses={boards[gk]?.[id] ?? []}
                        answer={answer}
                        presence={presence}
                      />
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function GuessGrid({ guesses, answer, typed, shake }: { guesses: string[]; answer: string; typed: string; shake: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: MAX_TRIES }, (_, row) => {
        const guess = guesses[row];
        const isCurrent = row === guesses.length;
        const letters = guess ? [...guess] : isCurrent ? [...typed] : [];
        const scores = guess ? scoreGuess(guess, answer) : null;
        return (
          <div
            key={isCurrent ? `current-${shake}` : row}
            className={`grid grid-cols-5 gap-1.5 ${isCurrent && shake ? "animate-shake" : ""}`}
          >
            {Array.from({ length: WORD_LENGTH }, (_, i) => {
              const ch = letters[i] ?? "";
              return (
                <div
                  key={scores ? `s${i}` : `t${i}`}
                  className={`flex aspect-square items-center justify-center rounded-md border-2 font-display text-2xl font-bold uppercase sm:text-3xl ${
                    scores
                      ? `${SCORE_STYLE[scores[i]]} animate-tile-flip`
                      : ch
                        ? "border-slate-400 bg-slate-900 text-slate-100"
                        : "border-slate-800 bg-slate-950/40"
                  }`}
                  style={scores ? { animationDelay: `${i * 110}ms` } : undefined}
                >
                  {ch}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Keyboard({
  scores,
  onKey,
  disabled,
}: {
  scores: Record<string, LetterScore>;
  onKey: (key: string) => void;
  disabled: boolean;
}) {
  const keyClass = (score: LetterScore | undefined) =>
    score ? SCORE_STYLE[score] : "border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700";
  return (
    <div className={`flex w-full flex-col gap-1.5 ${disabled ? "opacity-60" : ""}`}>
      {KEY_ROWS.map((row, r) => (
        <div key={row} className="flex justify-center gap-1">
          {r === 2 && (
            <button
              onClick={() => onKey("ENTER")}
              disabled={disabled}
              className="rounded-md border border-violet-500 bg-violet-600 px-2 text-xs font-semibold text-white sm:px-3"
            >
              ENVIAR
            </button>
          )}
          {[...row].map((ch) => (
            <button
              key={ch}
              onClick={() => onKey(ch)}
              disabled={disabled}
              className={`h-12 min-w-0 flex-1 rounded-md border text-sm font-semibold transition sm:max-w-10 ${keyClass(scores[ch])}`}
            >
              {ch}
            </button>
          ))}
          {r === 2 && (
            <button
              onClick={() => onKey("BACK")}
              disabled={disabled}
              aria-label="Borrar"
              className="rounded-md border border-slate-600 bg-slate-800 px-2.5 text-slate-100 hover:bg-slate-700 sm:px-3"
            >
              <Delete className="h-5 w-5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function TopBar({
  state,
  myId,
  now,
  tries,
  allDone,
  onNewWord,
}: {
  state: PalabraState;
  myId: string;
  now: number;
  tries: number;
  allDone: boolean;
  onNewWord: () => void;
}) {
  const mine = state.results[myId];
  if (state.winner || allDone) {
    const w = state.winner ? state.results[state.winner] : null;
    const name = state.winner === myId ? "Vos" : (state.players[state.winner]?.name ?? "?");
    return (
      <div
        className={`animate-celebration-in flex w-full flex-col items-center gap-2 rounded-2xl border bg-slate-900 p-4 text-center ${
          state.winner === myId ? "border-emerald-500/25 shadow-[0_0_40px_rgba(52,211,153,0.2)]" : "border-violet-500/20"
        }`}
      >
        <p className="font-display text-xl font-semibold text-slate-100">
          {state.winner === myId && <Confetti />}
          {!state.winner
            ? "😵 ¡Nadie la adivinó!"
            : state.winner === myId
              ? "🎉 ¡Ganaste!"
              : `🏁 ¡${name} la sacó primero!`}
        </p>
        {w && (
          <p className="text-sm text-slate-400">
            {formatClock(w.ms)} · {w.tries} {w.tries === 1 ? "intento" : "intentos"}
            {!mine && " · Podés terminar la tuya igual."}
          </p>
        )}
        {mine && (
          <button onClick={onNewWord} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
            Nueva palabra
          </button>
        )}
      </div>
    );
  }

  const elapsed = now && now > state.startedAt ? now - state.startedAt : 0;
  return (
    <div className={`${CARD} !py-3 flex w-full items-center justify-between gap-3`}>
      <span className="font-mono text-2xl text-slate-100">⏱ {formatClock(mine ? mine.ms : elapsed)}</span>
      <span className="text-sm text-slate-400">
        {mine
          ? mine.solved
            ? "¡La sacaste! Esperando a los demás…"
            : "Sin intentos. Esperando a los demás…"
          : `Intento ${Math.min(tries + 1, MAX_TRIES)} de ${MAX_TRIES}`}
      </span>
    </div>
  );
}

function Ranking({ state, myId }: { state: PalabraState; myId: string }) {
  const rows = Object.entries(state.results).sort(
    (a, b) => Number(b[1].solved) - Number(a[1].solved) || a[1].ms - b[1].ms
  );
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className={`${CARD} !p-4`}>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Llegadas</h2>
      <ol className="flex flex-col gap-1 text-sm">
        {rows.map(([id, r], i) => (
          <li key={id} className={`flex items-center gap-2 ${r.solved ? "" : "opacity-60"}`}>
            <span className="w-6">{r.solved ? (medals[i] ?? `${i + 1}.`) : "✗"}</span>
            <span className="flex-1 truncate" style={{ color: state.players[id]?.color }}>
              {id === myId ? "Vos" : (state.players[id]?.name ?? "?")}
            </span>
            <span className="font-mono text-slate-200">{r.solved ? formatClock(r.ms) : "—"}</span>
            <span className="w-16 text-right text-xs text-slate-500">
              {r.solved ? `${r.tries}/${MAX_TRIES}` : "no la sacó"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Opponent({
  state,
  id,
  guesses,
  answer,
  presence,
}: {
  state: PalabraState;
  id: string;
  guesses: string[];
  answer: string;
  presence: PresenceMap;
}) {
  const done = state.results[id];
  return (
    <div className={`flex flex-col gap-1 ${id in presence ? "" : "opacity-50"}`}>
      {/* Only colors: the letters would give the word away. */}
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: MAX_TRIES }, (_, row) => {
          const scores = guesses[row] ? scoreGuess(guesses[row], answer) : null;
          return (
            <div key={row} className="grid grid-cols-5 gap-0.5">
              {Array.from({ length: WORD_LENGTH }, (_, i) => (
                <span
                  key={i}
                  className="aspect-square rounded-[3px]"
                  style={{ backgroundColor: scores ? SCORE_COLOR[scores[i]] : "#1e293b80" }}
                />
              ))}
            </div>
          );
        })}
      </div>
      <p className="truncate text-xs" style={{ color: state.players[id]?.color }}>
        {state.players[id]?.name ?? "?"}
      </p>
      <p className="text-[11px] text-slate-500">
        {done ? (done.solved ? `✓ ${formatClock(done.ms)}` : "✗ no la sacó") : `${guesses.length}/${MAX_TRIES}`}
      </p>
    </div>
  );
}

function WinsTally({ state, myId }: { state: PalabraState; myId: string }) {
  const rows = Object.entries(state.wins).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return null;
  return (
    <p className="text-center text-sm text-slate-400">
      Ganadas:{" "}
      {rows.map(([id, n]) => `${id === myId ? "vos" : (state.players[id]?.name ?? "?")} ${n}`).join(" · ")}
    </p>
  );
}
