"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  CATEGORIES,
  DICE,
  MAX_ROLLS,
  currentPlayer,
  diceValues,
  getGeneralaMeta,
  joinGenerala,
  playAgain,
  rollDice,
  scoreCategory,
  scoreFor,
  sheetTotal,
  skipTurn,
  startGenerala,
  subscribeGenerala,
  toggleHold,
  type Category,
  type GeneralaState,
} from "@/lib/generala";
import type { PresenceMap } from "@/lib/presence";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";

type Status = "loading" | "not-found" | "ready" | "error";

export default function GeneralaClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [state, setState] = useState<GeneralaState | null>(null);
  const [hostId, setHostId] = useState("");

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  // Presence starts empty: only trust "X isn't here" once I see myself in it.
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    getGeneralaMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "generala") return router.replace(`/sala/${roomId}`);
        setHostId(meta.hostId ?? "");
        unsub = subscribeGenerala(roomId, setState);
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
    joinGenerala(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;

  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="generala"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="generala" />
        )}

        {status === "loading" && <RoomLoading text="Agitando el cubilete…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="generala"
              roomId={roomId}
              hostId={hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary="Cinco dados · tres tiros por turno · 11 casilleros"
              onStart={() => startGenerala(roomId, connected)}
            />
          </div>
        )}

        {status === "ready" && state && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-col gap-4 lg:w-[22rem]">
              {state.status === "finished" ? (
                <ResultBanner
                  state={state}
                  myId={myId}
                  onAgain={() => playAgain(roomId, state.gameNo, connected)}
                />
              ) : (
                <DiceTray roomId={roomId} state={state} myId={myId} isAway={isAway} />
              )}
              <Watching state={state} presence={presence} myId={myId} />
            </div>
            <ScoreSheet roomId={roomId} state={state} myId={myId} presence={presence} />
          </div>
        )}
      </main>
    </div>
  );
}

function nameOf(state: GeneralaState, id: string, myId: string): string {
  return id === myId ? "Vos" : (state.players[id]?.name ?? "?");
}

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ value, held, rolling }: { value: number; held: boolean; rolling: boolean }) {
  return (
    <span
      className={`grid aspect-square w-full grid-cols-3 grid-rows-3 gap-[6%] rounded-[22%] p-[16%] shadow-[inset_0_-4px_0_rgba(0,0,0,0.15)] transition ${
        held
          ? "-translate-y-1.5 bg-amber-100 ring-4 ring-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.5)]"
          : "bg-slate-100"
      } ${rolling ? "animate-dice-roll" : ""}`}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={`rounded-full ${value && PIPS[value]?.includes(i) ? "bg-slate-900" : ""}`}
        />
      ))}
    </span>
  );
}

function DiceTray({
  roomId,
  state,
  myId,
  isAway,
}: {
  roomId: string;
  state: GeneralaState;
  myId: string;
  isAway: (id: string) => boolean;
}) {
  const player = currentPlayer(state);
  const myTurn = player === myId;
  const values = state.dice ? diceValues(state.dice) : Array<number>(DICE).fill(0);
  const canHold = myTurn && state.rolls > 0 && state.rolls < MAX_ROLLS;
  const canRoll = myTurn && state.rolls < MAX_ROLLS;
  const round = Math.floor(state.turnNo / Math.max(1, state.order.length)) + 1;

  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-lg font-semibold text-slate-100">
          {myTurn ? (
            "¡Te toca!"
          ) : (
            <>
              Turno de <span style={{ color: state.players[player]?.color }}>{nameOf(state, player, myId)}</span>
            </>
          )}
        </p>
        <span className="text-xs text-slate-500">
          Vuelta {Math.min(round, CATEGORIES.length)} de {CATEGORIES.length}
        </span>
      </div>

      <div className="grid grid-cols-5 gap-2.5">
        {values.map((v, i) => {
          const held = state.rolls > 0 && state.held[i] === "1";
          return (
            <button
              key={`${state.turnNo}-${state.rolls}-${i}`}
              onClick={() => toggleHold(roomId, myId, state.turnNo, i)}
              disabled={!canHold}
              aria-label={v ? `Dado ${i + 1}: ${v}${held ? " (guardado)" : ""}` : `Dado ${i + 1}`}
              className={canHold ? "cursor-pointer" : "cursor-default"}
            >
              <Die value={v} held={held} rolling={state.rolls > 0 && !held} />
            </button>
          );
        })}
      </div>

      {myTurn ? (
        <>
          <button
            onClick={() => rollDice(roomId, myId, state.turnNo, state.rolls).catch(console.error)}
            disabled={!canRoll}
            className={PRIMARY_BUTTON}
          >
            {state.rolls === 0
              ? "Tirar los dados"
              : state.rolls < MAX_ROLLS
                ? `Tirar de nuevo (${state.rolls} de ${MAX_ROLLS})`
                : "No quedan tiros"}
          </button>
          <p className="text-center text-xs text-slate-500">
            {state.rolls === 0
              ? "Tirá para empezar tu turno."
              : canHold
                ? "Tocá los dados que quieras guardar. Cuando quieras, anotá en tu planilla."
                : "Elegí un casillero de tu planilla para anotar."}
          </p>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 text-center text-sm text-slate-400">
          <p>
            {state.rolls === 0 ? "Por tirar…" : `Tiro ${state.rolls} de ${MAX_ROLLS}`}
            {isAway(player) && " · se desconectó"}
          </p>
          {isAway(player) && state.order.includes(myId) && (
            <button
              onClick={() => skipTurn(roomId, state.turnNo).catch(console.error)}
              className={`w-full max-w-xs text-sm ${SECONDARY_BUTTON}`}
            >
              Saltar su turno (tacha un casillero)
            </button>
          )}
        </div>
      )}

      {state.lastScore.by && state.lastScore.cat && (
        <p className="border-t border-slate-800 pt-3 text-center text-xs text-slate-500">
          Último: {nameOf(state, state.lastScore.by, myId)} anotó{" "}
          {state.lastScore.points > 0 ? (
            <span className="text-slate-300">
              {state.lastScore.points} en {CATEGORIES.find((c) => c.id === state.lastScore.cat)?.label}
            </span>
          ) : (
            <span className="text-slate-300">
              tachó {CATEGORIES.find((c) => c.id === state.lastScore.cat)?.label}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function ScoreSheet({
  roomId,
  state,
  myId,
  presence,
}: {
  roomId: string;
  state: GeneralaState;
  myId: string;
  presence: PresenceMap;
}) {
  const [picked, setPicked] = useState<{ turn: number; cat: Category } | null>(null);
  const player = currentPlayer(state);
  const canScore = state.status === "playing" && player === myId && state.rolls > 0;
  const servida = state.rolls === 1;
  const mySheet = state.sheets[myId] ?? {};
  const selected = canScore && picked?.turn === state.turnNo ? picked.cat : null;
  const selectedPoints = selected ? scoreFor(selected, state.dice, servida, mySheet) : 0;
  const totals = state.order.map((id) => sheetTotal(state.sheets[id]));
  const best = Math.max(...totals);

  return (
    <div className={`${CARD} !p-3 flex min-w-0 flex-1 flex-col gap-3 sm:!p-4`}>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-slate-900 p-1.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                Planilla
              </th>
              {state.order.map((id) => (
                <th
                  key={id}
                  className={`max-w-[5.5rem] truncate rounded-t-lg p-1.5 text-center text-xs font-semibold ${
                    id === player && state.status === "playing" ? "bg-violet-500/15" : ""
                  } ${id in presence ? "" : "opacity-50"}`}
                  style={{ color: state.players[id]?.color }}
                  title={state.players[id]?.name}
                >
                  {nameOf(state, id, myId)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => (
              <tr key={cat.id} className="border-t border-slate-800">
                <th
                  scope="row"
                  title={cat.hint}
                  className="sticky left-0 whitespace-nowrap border-t border-slate-800 bg-slate-900 p-1.5 text-left font-medium text-slate-300"
                >
                  {cat.label}
                </th>
                {state.order.map((id) => {
                  const value = state.sheets[id]?.[cat.id];
                  const active = id === player && state.status === "playing";
                  const mine = id === myId && canScore && value === undefined;
                  const preview = mine ? scoreFor(cat.id, state.dice, servida, mySheet) : 0;
                  return (
                    <td
                      key={id}
                      className={`border-t border-slate-800 p-0.5 text-center font-mono ${active ? "bg-violet-500/10" : ""}`}
                    >
                      {mine ? (
                        <button
                          onClick={() => setPicked({ turn: state.turnNo, cat: cat.id })}
                          className={`w-full rounded-md px-1 py-1 text-xs transition ${
                            selected === cat.id
                              ? "bg-fuchsia-500/25 text-fuchsia-100 ring-1 ring-fuchsia-400"
                              : preview > 0
                                ? "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                                : "text-slate-600 hover:bg-slate-800"
                          }`}
                        >
                          {preview > 0 ? `+${preview}` : "—"}
                        </button>
                      ) : value === undefined ? (
                        <span className="text-slate-700">·</span>
                      ) : value === 0 ? (
                        <span className="text-slate-500 line-through">✕</span>
                      ) : (
                        <span className="text-slate-100">{value}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th className="sticky left-0 border-t-2 border-slate-700 bg-slate-900 p-1.5 text-left font-display font-semibold text-slate-100">
                Total
              </th>
              {state.order.map((id, i) => (
                <td
                  key={id}
                  className={`border-t-2 border-slate-700 p-1.5 text-center font-mono font-bold ${
                    totals[i] === best && best > 0 ? "text-amber-300" : "text-slate-200"
                  }`}
                >
                  {totals[i]}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {selected && (
        <button
          onClick={() => {
            scoreCategory(roomId, myId, state.turnNo, selected).catch(console.error);
            setPicked(null);
          }}
          className={PRIMARY_BUTTON}
        >
          {selectedPoints > 0
            ? `Anotar ${selectedPoints} en ${CATEGORIES.find((c) => c.id === selected)?.label}`
            : `Tachar ${CATEGORIES.find((c) => c.id === selected)?.label} (0 puntos)`}
        </button>
      )}
      {canScore && !selected && (
        <p className="text-center text-xs text-slate-500">
          Tocá un casillero libre de tu columna: en verde lo que sumarías, «—» lo tacha.
        </p>
      )}
    </div>
  );
}

function ResultBanner({ state, myId, onAgain }: { state: GeneralaState; myId: string; onAgain: () => void }) {
  const iWon = state.winner === myId;
  const title =
    state.endReason === "servida"
      ? iWon
        ? "🎲 ¡Generala servida! Ganaste."
        : `🎲 ¡Generala servida de ${nameOf(state, state.winner, myId)}!`
      : !state.winner
        ? "🤝 ¡Empate en la punta!"
        : iWon
          ? "🎉 ¡Ganaste!"
          : `🏆 ¡Ganó ${nameOf(state, state.winner, myId)}!`;
  const ranking = [...state.order].sort((a, b) => sheetTotal(state.sheets[b]) - sheetTotal(state.sheets[a]));
  return (
    <div
      className={`animate-celebration-in flex flex-col items-center gap-3 rounded-2xl border bg-slate-900 p-5 text-center ${
        iWon ? "border-emerald-500/25 shadow-[0_0_40px_rgba(52,211,153,0.2)]" : "border-violet-500/20"
      }`}
    >
      <p className="font-display text-xl font-semibold text-slate-100">{title}</p>
      <ol className="w-full max-w-xs text-sm">
        {ranking.map((id, i) => (
          <li key={id} className="flex justify-between py-0.5">
            <span style={{ color: state.players[id]?.color }}>
              {i + 1}. {nameOf(state, id, myId)}
            </span>
            <span className="font-mono text-slate-300">
              {sheetTotal(state.sheets[id])}
              {(state.wins[id] ?? 0) > 0 && (
                <span className="ml-2 text-xs text-slate-500">
                  ({state.wins[id]} {state.wins[id] === 1 ? "ganada" : "ganadas"})
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      <button onClick={onAgain} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
        Jugar de nuevo
      </button>
    </div>
  );
}

function Watching({ state, presence, myId }: { state: GeneralaState; presence: PresenceMap; myId: string }) {
  const watching = Object.keys(presence).filter((id) => !state.order.includes(id));
  if (watching.length === 0) return null;
  return (
    <p className="text-center text-xs text-slate-500">
      Mirando: {watching.map((id) => (id === myId ? "vos" : (presence[id]?.name ?? "?"))).join(", ")}
      {watching.includes(myId) && " · entrás en la próxima partida"}
    </p>
  );
}
