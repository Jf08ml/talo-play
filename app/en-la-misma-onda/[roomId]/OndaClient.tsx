"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  MAX_CLUE_LENGTH,
  MIN_PLAYERS,
  getOndaMeta,
  giveClue,
  joinOnda,
  nextTurn,
  playAgain,
  pointsFor,
  psychicOf,
  revealNow,
  skipSpectrum,
  skipTurn,
  spectrumFor,
  startOnda,
  submitGuess,
  subscribeOnda,
  targetFor,
  totalTurns,
  type OndaState,
} from "@/lib/onda";
import type { PresenceMap } from "@/lib/presence";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import Dial from "@/components/onda/Dial";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { RoomSettingsEditor, type RawMeta } from "@/components/RoomSettings";
import { watchRoomMeta } from "@/lib/roomSettings";
import { SETTINGS } from "../settings";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_INPUT } from "@/components/ui";
import GameResults, { rankFrom } from "@/components/Results";

type Status = "loading" | "not-found" | "ready" | "error";

export default function OndaClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
  const [config, setConfig] = useState<{ hostId: string; rounds: number } | null>(null);
  const [state, setState] = useState<OndaState | null>(null);

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
        setConfig({ hostId: meta.hostId ?? "", rounds: meta.rounds ?? 2 });
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
  useEffect(() => {
    if (!hasState || !identity.clientId || !identity.name) return;
    joinOnda(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  const psychic = state ? psychicOf(state) : "";
  const guessers = connected.filter((id) => id !== psychic);
  // A guesser may leave without guessing: reveal once everyone still here did.
  const allGuessed =
    state?.status === "guessing" && presenceLoaded && guessers.length > 0 && guessers.every((id) => id in state.guesses);
  const turnNo = state?.turnNo ?? 0;
  useEffect(() => {
    if (allGuessed) revealNow(roomId, turnNo).catch(console.error);
  }, [allGuessed, roomId, turnNo]);

  if (!configured) return <FirebaseSetupNotice />;

  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="onda"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="onda" />
        )}

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
              summary={`${config.rounds} ${config.rounds === 1 ? "vuelta" : "vueltas"}: cada uno da la pista ${config.rounds === 1 ? "una vez" : `${config.rounds} veces`}`}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              minToStart={MIN_PLAYERS}
              onStart={() => startOnda(roomId, connected)}
            />
          </div>
        )}

        {status === "ready" && state && config && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-col gap-4 lg:flex-1">
              {state.status === "finished" ? (
                <FinalPanel state={state} myId={myId} onAgain={() => playAgain(roomId, state.gameNo)} />
              ) : (
                <TurnPanel
                  key={`${state.gameNo}-${state.turnNo}`}
                  roomId={roomId}
                  state={state}
                  myId={myId}
                  rounds={config.rounds}
                  guessers={guessers}
                  psychicAway={isAway(psychic)}
                />
              )}
            </div>
            <Scoreboard state={state} presence={presence} myId={myId} />
          </div>
        )}
      </main>
    </div>
  );
}

function nameOf(state: OndaState, id: string, myId: string): string {
  return id === myId ? "Vos" : (state.players[id]?.name ?? "?");
}

function TurnPanel({
  roomId,
  state,
  myId,
  rounds,
  guessers,
  psychicAway,
}: {
  roomId: string;
  state: OndaState;
  myId: string;
  rounds: number;
  guessers: string[];
  psychicAway: boolean;
}) {
  const psychic = psychicOf(state);
  const iAmPsychic = psychic === myId;
  const [left, right] = spectrumFor(state);
  const target = targetFor(state);
  const [needle, setNeedle] = useState(50);
  const [clue, setClue] = useState("");
  const total = totalTurns(state, rounds);
  const myGuess = state.guesses[myId];
  const reveal = state.status === "reveal";

  const sendClue = (e: FormEvent) => {
    e.preventDefault();
    if (clue.trim()) giveClue(roomId, myId, state.turnNo, clue).then(() => setClue("")).catch(console.error);
  };

  const needles = Object.entries(state.guesses).map(([id, v]) => ({
    value: v,
    color: state.players[id]?.color ?? "#94a3b8",
    label: state.players[id]?.name ?? "?",
  }));

  return (
    <div className={`${CARD} flex flex-col items-center gap-4 text-center`}>
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Turno {state.turnNo + 1} de {total}
        </p>
        <p className="mt-1 font-display text-xl font-semibold text-slate-100">
          {iAmPsychic ? "Vos das la pista" : `Da la pista: ${nameOf(state, psychic, myId)}`}
        </p>
      </div>

      {state.clue && (
        <p className="animate-celebration-in rounded-2xl border border-violet-400/40 bg-violet-500/10 px-5 py-3 font-display text-2xl font-bold text-violet-100">
          “{state.clue}”
        </p>
      )}

      <div className="w-full max-w-md">
        {state.status === "clue" && iAmPsychic && <Dial left={left} right={right} target={target} />}
        {state.status === "clue" && !iAmPsychic && <Dial left={left} right={right} />}
        {state.status === "guessing" &&
          (iAmPsychic ? (
            <Dial left={left} right={right} target={target} needles={needles} />
          ) : myGuess !== undefined ? (
            <Dial left={left} right={right} value={myGuess} />
          ) : (
            <Dial left={left} right={right} value={needle} onChange={setNeedle} />
          ))}
        {reveal && <Dial left={left} right={right} target={target} needles={needles} />}
      </div>

      {state.status === "clue" &&
        (iAmPsychic ? (
          <form onSubmit={sendClue} className="flex w-full max-w-md flex-col gap-2">
            <p className="text-sm text-slate-400">
              El punto naranja es el objetivo. Escribí una pista que lleve a los demás justo ahí (una palabra, una cosa, un
              personaje…).
            </p>
            <div className="flex gap-2">
              <input
                value={clue}
                onChange={(e) => setClue(e.target.value)}
                maxLength={MAX_CLUE_LENGTH}
                placeholder="Tu pista"
                className={`min-w-0 flex-1 ${TEXT_INPUT}`}
                autoFocus
              />
              <button type="submit" disabled={!clue.trim()} className={`px-4 ${PRIMARY_BUTTON}`}>
                Dar pista
              </button>
            </div>
            <button
              type="button"
              onClick={() => skipSpectrum(roomId, myId, state.turnNo)}
              className="text-xs text-slate-500 underline hover:text-slate-300"
            >
              Esta escala no me sirve: otra
            </button>
          </form>
        ) : (
          <p className="text-slate-400">Está pensando la pista…</p>
        ))}

      {state.status === "guessing" && !iAmPsychic && myGuess === undefined && (
        <div className="flex w-full max-w-md flex-col gap-2">
          <p className="text-sm text-slate-400">Arrastrá la aguja hasta donde creés que apunta la pista.</p>
          <button
            onClick={() => submitGuess(roomId, myId, state.turnNo, needle, Math.max(1, guessers.length))}
            className={PRIMARY_BUTTON}
          >
            Confirmar
          </button>
        </div>
      )}
      {state.status === "guessing" && (iAmPsychic || myGuess !== undefined) && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-slate-400">
            Ya {Object.keys(state.guesses).length === 1 ? "eligió" : "eligieron"} {Object.keys(state.guesses).length} de{" "}
            {guessers.length}…
          </p>
          {Object.keys(state.guesses).length > 0 && Object.keys(state.guesses).length < guessers.length && (
            <button onClick={() => revealNow(roomId, state.turnNo)} className="text-xs text-slate-500 underline hover:text-slate-300">
              Revelar sin esperar
            </button>
          )}
        </div>
      )}

      {reveal && (
        <div className="flex w-full max-w-md flex-col gap-3">
          <ul className="flex flex-col gap-1 text-sm">
            {Object.entries(state.guesses)
              .sort((a, b) => Math.abs(a[1] - target) - Math.abs(b[1] - target))
              .map(([id, v]) => {
                const p = pointsFor(v, target);
                return (
                  <li key={id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/40 px-3 py-1.5">
                    <span style={{ color: state.players[id]?.color }}>{nameOf(state, id, myId)}</span>
                    <span className={p > 0 ? "font-semibold text-emerald-300" : "text-slate-500"}>
                      {p > 0 ? `+${p}` : "0"}
                    </span>
                  </li>
                );
              })}
          </ul>
          <button onClick={() => nextTurn(roomId, state.turnNo, rounds)} className={PRIMARY_BUTTON}>
            {state.turnNo + 1 >= total ? "Ver resultados" : "Siguiente turno"}
          </button>
        </div>
      )}

      {!iAmPsychic && psychicAway && !reveal && (
        <button onClick={() => skipTurn(roomId, state.turnNo, rounds)} className={`px-4 text-sm ${SECONDARY_BUTTON}`}>
          {nameOf(state, psychic, myId)} se fue: pasar al siguiente
        </button>
      )}
    </div>
  );
}

function FinalPanel({ state, myId, onAgain }: { state: OndaState; myId: string; onAgain: () => void }) {
  return (
    <GameResults
      ranking={rankFrom(state.players, state.scores)}
      myId={myId}
      actions={
        <button onClick={onAgain} className={`w-full ${PRIMARY_BUTTON}`}>
          Jugar de nuevo
        </button>
      }
    />
  );
}

function Scoreboard({ state, presence, myId }: { state: OndaState; presence: PresenceMap; myId: string }) {
  const rows = Object.keys(state.players)
    .filter((id) => id in presence || (state.scores[id] ?? 0) > 0)
    .sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0));
  const psychic = psychicOf(state);
  return (
    <aside className={`${CARD} !p-4 w-full lg:w-72`}>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Puntos</h2>
      <ol className="flex flex-col gap-1.5 text-sm">
        {rows.map((id) => (
          <li key={id} className={`flex items-center gap-2 ${id in presence ? "" : "opacity-40"}`}>
            <span className="flex-1 truncate" style={{ color: state.players[id]?.color }}>
              {nameOf(state, id, myId)}
              {id === psychic && state.status !== "finished" && " 🔮"}
            </span>
            <span className="w-8 text-right font-mono text-slate-200">{state.scores[id] ?? 0}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
