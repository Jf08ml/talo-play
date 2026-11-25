"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock, Radio, Shuffle, Sparkles } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  BET_SECONDS,
  MAX_CLUE_LENGTH,
  MIN_PLAYERS,
  TOP_POINTS,
  canBet,
  canSteer,
  chooseTeam,
  clueProblem,
  getOndaMeta,
  giveClue,
  harmony,
  joinOnda,
  liveKey,
  lockNeedle,
  nextTurn,
  normalizeMeta,
  placeBet,
  playAgain,
  pointsFor,
  revealNow,
  sendLive,
  shuffleTeams,
  skipSpectrum,
  skipTurn,
  spectrumFor,
  spectrumPool,
  startOnda,
  startProblem,
  submitGuess,
  subscribeLive,
  subscribeOnda,
  targetFor,
  teamsAtStart,
  turnsEstimate,
  type OndaConfig,
  type OndaState,
} from "@/lib/onda";
import { TEAMS, type TeamId } from "@/lib/teams";
import type { PresenceMap } from "@/lib/presence";
import { serverNow } from "@/lib/serverTime";
import { playSound } from "@/lib/sfx";
import { gameColors } from "@/lib/talos";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useTurnAlert } from "@/hooks/useTurnAlert";
import { useSoundOn } from "@/hooks/useSound";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import Dial, { type DialNeedle } from "@/components/onda/Dial";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { RoomSettingsEditor, type RawMeta } from "@/components/RoomSettings";
import { watchRoomMeta } from "@/lib/roomSettings";
import { SETTINGS } from "../settings";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_INPUT } from "@/components/ui";
import GameResults, { Confetti, rankFrom } from "@/components/Results";
import { placeIn, useAwardMatch } from "@/hooks/useAwardMatch";

type Status = "loading" | "not-found" | "ready" | "error";

const team = (id: TeamId) => TEAMS.find((t) => t.id === id)!;
const MODE_LABEL = { cada: "Cada uno por su cuenta", juntos: "Todos juntos", equipos: "Rojo contra azul" } as const;

export default function OndaClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
  const [config, setConfig] = useState<OndaConfig | null>(null);
  const [state, setState] = useState<OndaState | null>(null);
  useSoundOn(state?.status, "flip", state?.status !== "finished");

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  // Presence starts empty: only trust "X isn't here" once I see myself in it.
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getOndaMeta>>>>(
      roomId,
      (meta) => {
        if (cancelled) return;
        setRoomMeta(meta);
        if (!meta) return setStatus("not-found");
        if (meta.game !== "onda") return router.replace(`/sala/${roomId}`);
        setConfig(normalizeMeta(meta));
        unsub ??= subscribeOnda(roomId, setState);
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
  const stateStatus = state?.status;
  useEffect(() => {
    if (!hasState || !identity.clientId || !identity.name) return;
    joinOnda(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, stateStatus, roomId, identity.clientId, identity.name, identity.color]);

  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  const psychic = state?.psychic ?? "";
  const guessers = connected.filter((id) => id !== psychic);
  // Cada: a guesser may leave without guessing: reveal once everyone still here did.
  const allGuessed =
    state?.mode === "cada" && state.status === "guessing" && presenceLoaded && guessers.length > 0 && guessers.every((id) => id in state.guesses);
  const turnNo = state?.turnNo ?? 0;
  useEffect(() => {
    if (allGuessed) revealNow(roomId, turnNo).catch(console.error);
  }, [allGuessed, roomId, turnNo]);

  // "¡Te toca!": giving the clue, guessing, steering or betting.
  const myMove =
    !!state &&
    !!myId &&
    ((state.status === "clue" && psychic === myId) ||
      (state.status === "guessing" && state.mode === "cada" && psychic !== myId && !(myId in state.guesses)) ||
      canSteer(state, myId) ||
      canBet(state, myId));
  useTurnAlert(myMove);

  // Ranking once the game is over: «juntos» is co-op (no winner), «equipos» goes by team
  // (a tie is a draw), «cada» by my points.
  const awardTeam = state?.teams[myId];
  const awardOutcome = (() => {
    if (state?.status !== "finished" || !state.order.includes(myId)) return null;
    if (state.mode === "juntos") return { place: null, players: state.order.length };
    if (state.mode === "equipos") {
      if (!awardTeam) return null;
      const mine = state.teamScores[awardTeam] ?? 0;
      const theirs = state.teamScores[awardTeam === "red" ? "blue" : "red"] ?? 0;
      return { place: mine === theirs ? null : mine > theirs ? 1 : 2, players: 2 };
    }
    return { place: placeIn(state.order.map((id) => ({ id, score: state.scores[id] ?? 0 })), myId), players: state.order.length };
  })();
  useAwardMatch("onda", roomId, state?.gameNo ?? 0, awardOutcome);

  if (!configured) return <FirebaseSetupNotice />;

  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);
  const pool = config ? spectrumPool(config) : [];

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader game="onda" roomId={roomId} right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />} />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="onda" />}

        {status === "loading" && <RoomLoading text="Sintonizando la onda…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="onda"
              roomId={roomId}
              hostId={config.hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`${MODE_LABEL[config.mode]} · ${config.rounds} ${config.rounds === 1 ? "vuelta" : "vueltas"}${config.seconds ? ` · ${config.seconds} s para adivinar` : ""}`}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              minToStart={config.mode === "equipos" ? 4 : MIN_PLAYERS}
              blocked={presenceLoaded ? (startProblem(state, config.mode, connected) ?? undefined) : undefined}
              onStart={() => startOnda(roomId, connected, config)}
            >
              {config.mode === "equipos" && <TeamPicker roomId={roomId} state={state} myId={myId} connected={connected} />}
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && config && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-col gap-4 lg:flex-1">
              {state.status === "finished" ? (
                <FinalPanel state={state} myId={myId} pool={pool} onAgain={() => playAgain(roomId, state.gameNo)} />
              ) : (
                <TurnPanel
                  key={`${state.gameNo}-${state.turnNo}`}
                  roomId={roomId}
                  state={state}
                  myId={myId}
                  pool={pool}
                  connected={connected}
                  guessers={guessers}
                  psychicAway={isAway(psychic)}
                />
              )}
            </div>
            {state.status !== "finished" && <Scoreboard state={state} presence={presence} myId={myId} />}
          </div>
        )}
      </main>
    </div>
  );
}

function nameOf(state: OndaState, id: string, myId: string): string {
  return id === myId ? "Tú" : (state.players[id]?.name ?? "?");
}

/** Ticks while a phase has a clock; null when it doesn't. */
function useSecondsLeft(deadline: number | null): number | null {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (deadline === null) return;
    const t = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}

const HEADLINE: Record<number, string> = { 4: "¡Justo en el centro!", 3: "¡Muy cerca!", 2: "Cerca", 0: "Lejos…" };

function TurnPanel({
  roomId,
  state,
  myId,
  pool,
  connected,
  guessers,
  psychicAway,
}: {
  roomId: string;
  state: OndaState;
  myId: string;
  pool: [string, string][];
  connected: string[];
  guessers: string[];
  psychicAway: boolean;
}) {
  const psychic = state.psychic;
  const iAmPsychic = psychic === myId;
  const [left, right] = spectrumFor(state, pool);
  const target = targetFor(state);
  const [needle, setNeedle] = useState(50);
  const [clue, setClue] = useState("");
  const [clueError, setClueError] = useState<string | null>(null);
  const total = turnsEstimate(state, connected);
  const myGuess = state.guesses[myId];
  const reveal = state.status === "reveal";
  const shared = state.mode !== "cada";
  const steer = canSteer(state, myId);
  const bet = canBet(state, myId);
  const myTeam = state.teams[myId];
  const cover = gameColors("onda").color;

  // ---- The shared needle: everyone sees it move; those who may steer move it.
  const key = liveKey(state);
  const lastSent = useRef(0);
  const pending = useRef<number | null>(null);
  /** Once I moved it this turn, my own echoes are old news. */
  const moved = useRef(false);
  useEffect(() => {
    if (!shared) return;
    return subscribeLive(roomId, (n) => {
      if (n && n.k === key && (n.by !== myId || !moved.current)) setNeedle(n.v);
    });
  }, [shared, roomId, key, myId]);
  const move = (v: number) => {
    setNeedle(v);
    if (!steer) return;
    moved.current = true;
    pending.current = v;
    const now = performance.now();
    const send = () => {
      if (pending.current === null) return;
      sendLive(roomId, { v: pending.current, k: key, by: myId });
      lastSent.current = performance.now();
      pending.current = null;
    };
    if (now - lastSent.current > 90) send();
    else setTimeout(send, 90);
  };

  // ---- Clock (optional): guessing gets `seconds`, the bet BET_SECONDS.
  const deadline =
    state.seconds > 0 && state.status === "guessing"
      ? state.phaseAt + state.seconds * 1000
      : state.seconds > 0 && state.status === "betting"
        ? state.phaseAt + BET_SECONDS * 1000
        : null;
  const secondsLeft = useSecondsLeft(deadline);
  const needleRef = useRef(needle);
  useEffect(() => {
    needleRef.current = needle;
  }, [needle]);
  const expired = secondsLeft === 0;
  useEffect(() => {
    if (!expired) return;
    // Every client tries; the transactions make it happen once.
    const t = setTimeout(() => {
      if (state.status === "guessing" && state.mode === "cada") {
        if (myGuess === undefined && !iAmPsychic) submitGuess(roomId, myId, state.turnNo, needleRef.current, Infinity).catch(console.error);
        setTimeout(() => revealNow(roomId, state.turnNo, true).catch(console.error), 600);
      } else if (state.status === "guessing") lockNeedle(roomId, null, state.turnNo, needleRef.current).catch(console.error);
      else if (state.status === "betting") placeBet(roomId, null, state.turnNo, null).catch(console.error);
    }, 300);
    return () => clearTimeout(t);
  }, [expired, state.status, state.mode, state.turnNo, roomId, myId, myGuess, iAmPsychic]);

  // ---- Reveal: sound once the cover is open, confetti on a bullseye that's mine (or my team's).
  const myPoints = !reveal
    ? null
    : state.mode === "cada"
      ? iAmPsychic
        ? (state.log[state.log.length - 1]?.pts ?? 0)
        : myGuess !== undefined
          ? pointsFor(myGuess, target)
          : null
      : state.mode === "juntos"
        ? pointsFor(state.shared, target)
        : myTeam === state.turnTeam
          ? pointsFor(state.shared, target)
          : null;
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => {
      if (myPoints === TOP_POINTS) setCelebrate(true);
      else if (myPoints !== null) playSound(myPoints > 0 ? "good" : "bad");
    }, 1300);
    return () => clearTimeout(t);
  }, [reveal, myPoints]);

  const sendClue = (e: FormEvent) => {
    e.preventDefault();
    const problem = clueProblem(clue);
    setClueError(problem);
    if (problem || !clue.trim()) return;
    giveClue(roomId, myId, state.turnNo, clue)
      .then(() => setClue(""))
      .catch(console.error);
  };

  const needles: DialNeedle[] =
    state.mode === "cada"
      ? Object.entries(state.guesses).map(([id, v]) => ({
          id,
          value: v,
          color: state.players[id]?.color ?? "#94a3b8",
          label: state.players[id]?.name ?? "?",
        }))
      : [];

  const turnTeam = state.turnTeam ? team(state.turnTeam) : null;
  const rivalTeam = state.turnTeam ? team(state.turnTeam === "red" ? "blue" : "red") : null;
  const sharedValue = state.shared >= 0 ? state.shared : needle;

  // What the dial shows.
  let dial;
  if (state.status === "clue") {
    dial = <Dial left={left} right={right} target={iAmPsychic ? target : undefined} />;
  } else if (reveal) {
    dial = (
      <Dial
        left={left}
        right={right}
        target={target}
        reveal
        coverColor={cover}
        needles={needles}
        value={shared ? state.shared : undefined}
        bet={state.bet && rivalTeam ? { side: state.bet, color: rivalTeam.color } : null}
      />
    );
  } else if (state.mode === "cada") {
    dial = iAmPsychic ? (
      <Dial left={left} right={right} target={target} needles={needles} />
    ) : myGuess !== undefined ? (
      <Dial left={left} right={right} value={myGuess} />
    ) : (
      <Dial
        left={left}
        right={right}
        value={needle}
        onChange={setNeedle}
        onConfirm={() => submitGuess(roomId, myId, state.turnNo, needle, Math.max(1, guessers.length))}
      />
    );
  } else if (state.status === "guessing") {
    dial = (
      <Dial
        left={left}
        right={right}
        target={iAmPsychic ? target : undefined}
        value={needle}
        onChange={steer ? move : undefined}
        onConfirm={steer ? () => lockNeedle(roomId, myId, state.turnNo, needle) : undefined}
      />
    );
  } else {
    // Betting: the locked needle, and the psychic still sees the target.
    dial = <Dial left={left} right={right} target={iAmPsychic ? target : undefined} value={sharedValue} />;
  }

  const lastLog = state.log[state.log.length - 1];

  return (
    <div className={`${CARD} flex flex-col items-center gap-4 text-center`}>
      {celebrate && <Confetti />}
      <div className="flex w-full items-start justify-between gap-3">
        <p className="text-[13px] font-bold text-white/55">
          Turno {state.turnNo + 1} de {total}
        </p>
        {secondsLeft !== null && (
          <p className={`flex items-center gap-1 font-mono text-sm font-bold ${secondsLeft <= 10 ? "text-red-300" : "text-white/80"}`}>
            <Clock className="h-4 w-4" /> {secondsLeft}
          </p>
        )}
      </div>
      <div className="-mt-3 flex flex-col items-center gap-1">
        {turnTeam && (
          <span className="rounded-full px-3 py-0.5 text-[13px] font-extrabold text-talo-ink" style={{ background: turnTeam.color }}>
            Juega el {turnTeam.label}
          </span>
        )}
        <p className="font-display text-xl text-white sm:text-2xl">
          {iAmPsychic ? "Tú das la pista" : `Da la pista: ${nameOf(state, psychic, myId)}`}
        </p>
      </div>

      {state.clue && (
        <p className="animate-celebration-in rounded-2xl bg-talo-hero px-5 py-3 font-display text-2xl text-talo-ink">“{state.clue}”</p>
      )}

      <div className="w-full max-w-md">{dial}</div>

      {/* ---- Clue ---- */}
      {state.status === "clue" &&
        (iAmPsychic ? (
          <form onSubmit={sendClue} className="flex w-full max-w-md flex-col gap-2">
            <p className="text-sm text-white/65">
              La zona amarilla es el objetivo. Escribe una pista que lleve {state.mode === "equipos" ? "a tu equipo" : "a los demás"} justo ahí: una
              palabra, una cosa, un personaje…
            </p>
            <div className="flex gap-2">
              <input
                value={clue}
                onChange={(e) => {
                  setClue(e.target.value);
                  setClueError(null);
                }}
                maxLength={MAX_CLUE_LENGTH}
                placeholder="Tu pista"
                className={`min-w-0 flex-1 ${TEXT_INPUT}`}
                autoFocus
              />
              <button type="submit" disabled={!clue.trim()} className={`px-4 ${PRIMARY_BUTTON}`}>
                Dar pista
              </button>
            </div>
            {clueError && <p className="text-sm font-bold text-red-300">{clueError}</p>}
            <button
              type="button"
              onClick={() => skipSpectrum(roomId, myId, state.turnNo)}
              className="flex items-center justify-center gap-1 text-xs text-white/50 underline hover:text-white/80"
            >
              <Shuffle className="h-3.5 w-3.5" /> Esta escala no me sirve: otra
            </button>
          </form>
        ) : (
          <p className="text-white/65">Está pensando la pista…</p>
        ))}

      {/* ---- Guessing, each on their own ---- */}
      {state.status === "guessing" && state.mode === "cada" && !iAmPsychic && myGuess === undefined && (
        <div className="flex w-full max-w-md flex-col gap-2">
          <p className="text-sm text-white/65">Mueve la aguja hasta donde crees que apunta la pista.</p>
          <button onClick={() => submitGuess(roomId, myId, state.turnNo, needle, Math.max(1, guessers.length))} className={PRIMARY_BUTTON}>
            Confirmar
          </button>
        </div>
      )}
      {state.status === "guessing" && state.mode === "cada" && (iAmPsychic || myGuess !== undefined) && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-white/65">
            Ya {Object.keys(state.guesses).length === 1 ? "eligió" : "eligieron"} {Object.keys(state.guesses).length} de {guessers.length}…
          </p>
          {Object.keys(state.guesses).length > 0 && Object.keys(state.guesses).length < guessers.length && (
            <button onClick={() => revealNow(roomId, state.turnNo)} className="text-xs text-white/50 underline hover:text-white/80">
              Revelar sin esperar
            </button>
          )}
        </div>
      )}

      {/* ---- Guessing with the shared needle ---- */}
      {state.status === "guessing" && shared && (
        <div className="flex w-full max-w-md flex-col gap-2">
          {steer ? (
            <>
              <p className="text-sm text-white/65">
                {state.mode === "juntos"
                  ? "La aguja es de todos: discútanla, muévanla y cualquiera confirma."
                  : "La aguja es de tu equipo: discútanla y cualquiera confirma."}
              </p>
              <button onClick={() => lockNeedle(roomId, myId, state.turnNo, needle)} className={PRIMARY_BUTTON}>
                Confirmar aquí
              </button>
            </>
          ) : iAmPsychic ? (
            <p className="text-sm text-white/65">Mira cómo la mueven… ¡sin ayudar!</p>
          ) : (
            <p className="text-sm text-white/65">El {turnTeam?.label} está ubicando la aguja. Después les toca apostar a ustedes.</p>
          )}
        </div>
      )}

      {/* ---- The rival team's bet ---- */}
      {state.status === "betting" && (
        <div className="flex w-full max-w-md flex-col gap-2">
          {bet ? (
            <>
              <p className="text-sm text-white/65">¿El objetivo está más a la izquierda o más a la derecha de la aguja? Si aciertan, +1.</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => placeBet(roomId, myId, state.turnNo, "izq")} className={`flex items-center justify-center gap-2 ${SECONDARY_BUTTON}`}>
                  <ArrowLeft className="h-4 w-4" /> Más a la izquierda
                </button>
                <button onClick={() => placeBet(roomId, myId, state.turnNo, "der")} className={`flex items-center justify-center gap-2 ${SECONDARY_BUTTON}`}>
                  Más a la derecha <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-white/65">El {rivalTeam?.label} está apostando para qué lado está el objetivo…</p>
          )}
        </div>
      )}

      {/* ---- Reveal ---- */}
      {reveal && lastLog && (
        <div className="flex w-full max-w-md animate-celebration-in flex-col gap-3 [animation-delay:1.1s] [animation-fill-mode:both]">
          {state.mode === "cada" ? (
            <ul className="flex flex-col gap-1 text-sm">
              {Object.entries(state.guesses)
                .sort((a, b) => Math.abs(a[1] - target) - Math.abs(b[1] - target))
                .map(([id, v]) => {
                  const p = pointsFor(v, target);
                  return (
                    <li key={id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-1.5">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: state.players[id]?.color }} />
                        {nameOf(state, id, myId)}
                      </span>
                      <span className={p > 0 ? "font-bold text-talo-hero" : "text-white/45"}>{p > 0 ? `+${p}` : "0"}</span>
                    </li>
                  );
                })}
              <li className="flex items-center justify-between gap-2 px-3 py-1 text-white/60">
                <span>{nameOf(state, psychic, myId)} (dio la pista)</span>
                <span>+{lastLog.pts}</span>
              </li>
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <p className="font-display text-2xl text-white">{HEADLINE[lastLog.pts] ?? HEADLINE[0]}</p>
              <p className="text-sm text-white/70">
                {state.mode === "juntos" ? `+${lastLog.pts} para el grupo` : `+${lastLog.pts} para el ${turnTeam?.label}`}
                {state.mode === "equipos" &&
                  rivalTeam &&
                  (state.bet
                    ? state.betWon
                      ? ` · el ${rivalTeam.label} acertó la apuesta: +1`
                      : ` · el ${rivalTeam.label} no acertó la apuesta`
                    : ` · el ${rivalTeam.label} no apostó`)}
              </p>
            </div>
          )}
          <button onClick={() => nextTurn(roomId, state.turnNo, connected)} className={PRIMARY_BUTTON}>
            Siguiente turno
          </button>
        </div>
      )}

      {!iAmPsychic && psychicAway && !reveal && (
        <button onClick={() => skipTurn(roomId, state.turnNo, connected)} className={`px-4 text-sm ${SECONDARY_BUTTON}`}>
          {nameOf(state, psychic, myId)} se fue: pasar al siguiente
        </button>
      )}
    </div>
  );
}

/** Each turn's scale, clue and how it went. */
function Recap({ state, pool, myId }: { state: OndaState; pool: [string, string][]; myId: string }) {
  if (!state.log.length) return null;
  return (
    <div className="flex flex-col gap-2 text-left">
      <h3 className="flex items-center gap-2 text-sm font-bold text-white/70">
        <Sparkles className="h-4 w-4" /> Turno por turno
      </h3>
      <ol className="flex flex-col gap-1.5">
        {state.log.map((l) => {
          const [a, b] = spectrumFor({ seed: state.seed, turnNo: l.k, skips: l.sk }, pool);
          return (
            <li key={l.k} className="flex items-center gap-3 rounded-xl border-l-4 bg-white/5 px-3 py-2" style={{ borderLeftColor: l.team ? team(l.team).color : "transparent" }}>
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg font-display text-lg ${l.pts === TOP_POINTS ? "bg-talo-hero text-talo-ink" : l.pts > 0 ? "bg-white/15 text-white" : "bg-white/5 text-white/40"}`}
              >
                {l.pts}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-bold text-white">“{l.c || "—"}”</span>
                <span className="truncate text-xs text-white/55">
                  {a} ↔ {b} · {nameOf(state, l.p, myId)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const harmonyText = (h: number) =>
  h >= 80 ? "¡Telepatía total!" : h >= 60 ? "Muy en la misma onda" : h >= 40 ? "Casi casi" : h >= 20 ? "Frecuencias parecidas" : "Cada uno en su onda";

function FinalPanel({ state, myId, pool, onAgain }: { state: OndaState; myId: string; pool: [string, string][]; onAgain: () => void }) {
  const again = (
    <button onClick={onAgain} className={`w-full ${PRIMARY_BUTTON}`}>
      Jugar de nuevo
    </button>
  );
  if (state.mode === "juntos") {
    const h = harmony(state);
    return (
      <div className={`${CARD} flex flex-col gap-5 text-center`}>
        {h >= 60 && <Confetti />}
        <div className="flex flex-col items-center gap-1">
          <p className="text-[13px] font-bold text-white/55">Sintonía del grupo</p>
          <p className="font-display text-7xl text-talo-hero">{h}%</p>
          <p className="font-display text-2xl text-white">{harmonyText(h)}</p>
          <p className="text-sm text-white/60">
            {state.teamScores.grupo ?? 0} de {state.log.length * TOP_POINTS} puntos posibles
          </p>
        </div>
        <Recap state={state} pool={pool} myId={myId} />
        {again}
      </div>
    );
  }
  if (state.mode === "equipos") {
    const red = state.teamScores.red ?? 0;
    const blue = state.teamScores.blue ?? 0;
    const win = red > blue ? team("red") : blue > red ? team("blue") : null;
    return (
      <GameResults
        ranking={TEAMS.map((t) => ({ id: t.id, name: t.label, color: t.color, score: state.teamScores[t.id] ?? 0 }))}
        myId=""
        title={win ? `¡Ganó el ${win.label}!` : "¡Empate!"}
        subtitle={`Rojo ${red} · Azul ${blue}`}
        celebrate={!!win && state.teams[myId] === win.id}
        actions={again}
      >
        <Recap state={state} pool={pool} myId={myId} />
      </GameResults>
    );
  }
  return (
    <GameResults ranking={rankFrom(state.players, state.scores)} myId={myId} actions={again}>
      <Recap state={state} pool={pool} myId={myId} />
    </GameResults>
  );
}

function Scoreboard({ state, presence, myId }: { state: OndaState; presence: PresenceMap; myId: string }) {
  if (state.mode === "juntos") {
    return (
      <aside className={`${CARD} !p-4 w-full lg:w-72`}>
        <h2 className="mb-1 text-[13px] font-bold text-white/55">Sintonía</h2>
        <p className="font-display text-4xl text-talo-hero">{state.log.length ? `${harmony(state)}%` : "—"}</p>
        <p className="text-sm text-white/60">
          {state.log.length ? `${state.teamScores.grupo ?? 0} puntos en ${state.log.length} ${state.log.length === 1 ? "turno" : "turnos"}` : "Se ve después del primer turno"}
        </p>
      </aside>
    );
  }
  if (state.mode === "equipos") {
    return (
      <aside className={`${CARD} !p-4 flex w-full flex-col gap-3 lg:w-72`}>
        {TEAMS.map((t) => (
          <div key={t.id} className="flex flex-col gap-1">
            <p className="flex items-center justify-between font-bold" style={{ color: t.color }}>
              {t.label} <span className="font-display text-2xl">{state.teamScores[t.id] ?? 0}</span>
            </p>
            <p className="text-xs text-white/60">
              {state.order
                .filter((id) => state.teams[id] === t.id)
                .map((id) => `${nameOf(state, id, myId)}${id === state.psychic ? " (pista)" : ""}`)
                .join(" · ")}
            </p>
          </div>
        ))}
      </aside>
    );
  }
  const rows = Object.keys(state.players)
    .filter((id) => id in presence || (state.scores[id] ?? 0) > 0)
    .sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0));
  return (
    <aside className={`${CARD} !p-4 w-full lg:w-72`}>
      <h2 className="mb-2 text-[13px] font-bold text-white/55">Puntos</h2>
      <ol className="flex flex-col gap-1.5 text-sm">
        {rows.map((id) => (
          <li key={id} className={`flex items-center gap-2 ${id in presence ? "" : "opacity-40"}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: state.players[id]?.color }} />
            <span className="flex flex-1 items-center gap-1.5 truncate text-white">
              {nameOf(state, id, myId)}
              {id === state.psychic && <Radio className="h-3.5 w-3.5 text-talo-hero" aria-label="da la pista" />}
            </span>
            <span className="w-8 text-right font-mono text-white">{state.scores[id] ?? 0}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** Teams while waiting: pick one, or let the start even them out. */
function TeamPicker({ roomId, state, myId, connected }: { roomId: string; state: OndaState; myId: string; connected: string[] }) {
  const people = connected.filter((id) => state.players[id]);
  const preview = teamsAtStart(state, connected);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {TEAMS.map((t) => {
          const list = people.filter((id) => preview[id] === t.id);
          return (
            <div key={t.id} className="flex flex-col gap-1.5 rounded-xl border bg-black/30 p-3" style={{ borderColor: `${t.color}66` }}>
              <p className="text-center text-sm font-bold" style={{ color: t.color }}>
                {t.label}
              </p>
              {list.map((id) => (
                <p key={id} className={`truncate rounded-lg bg-white/5 px-2 py-1.5 text-center text-sm ${state.teams[id] ? "text-white" : "text-white/50"}`}>
                  {id === myId ? "Tú" : state.players[id]?.name}
                </p>
              ))}
              {state.teams[myId] !== t.id && (
                <button
                  onClick={() => chooseTeam(roomId, myId, t.id).catch(console.error)}
                  className="rounded-md border px-3 py-1.5 text-xs font-bold"
                  style={{ borderColor: t.color, color: t.color }}
                >
                  Unirme
                </button>
              )}
            </div>
          );
        })}
      </div>
      {people.length > 1 && (
        <button
          onClick={() => shuffleTeams(roomId, connected).catch(console.error)}
          className="mx-auto flex items-center gap-1 rounded-md border border-white/20 px-2 py-1 text-xs text-white/80 hover:border-white/40"
        >
          <Shuffle className="h-3.5 w-3.5" /> Mezclar equipos
        </button>
      )}
      <p className="text-center text-xs text-white/50">Los que no eligieron (en gris) van al equipo más chico.</p>
    </div>
  );
}
