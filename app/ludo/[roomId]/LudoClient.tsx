"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  BASE_ORIGIN,
  GOAL,
  HOME,
  SAFE,
  SEATS,
  SEAT_INFO,
  TRACK,
  cellOf,
  getLudoMeta,
  joinLudo,
  leaveSeat,
  movableTokens,
  moveToken,
  parseTokens,
  rematch,
  rollDie,
  seatOf,
  skipTurn,
  startLudo,
  subscribeLudo,
  takeSeat,
  type LudoState,
  type Seat,
} from "@/lib/ludo";
import type { PresenceMap } from "@/lib/presence";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";

type Status = "loading" | "not-found" | "ready" | "error";

export default function LudoClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [state, setState] = useState<LudoState | null>(null);
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

    getLudoMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "ludo") return router.replace(`/sala/${roomId}`);
        setHostId(meta.hostId ?? "");
        unsub = subscribeLudo(roomId, setState);
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
    joinLudo(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;

  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="ludo"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="ludo" />
        )}

        {status === "loading" && <RoomLoading text="Acomodando las fichas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="ludo"
              roomId={roomId}
              hostId={hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary="De 2 a 4 · los demás miran"
              onStart={() => startLudo(roomId)}
            >
              <SeatPicker roomId={roomId} state={state} myId={myId} isAway={isAway} />
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && state.status !== "waiting" && (
          <Game roomId={roomId} state={state} myId={myId} isAway={isAway} presence={presence} />
        )}
      </main>
    </div>
  );
}

function playerName(state: LudoState, id: string, myId: string): string {
  if (id === myId) return "Vos";
  return state.players[id]?.name ?? "?";
}

function SeatPicker({
  roomId,
  state,
  myId,
  isAway,
}: {
  roomId: string;
  state: LudoState;
  myId: string;
  isAway: (id: string) => boolean;
}) {
  const seated = SEATS.filter((s) => state.seats[s]).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {SEATS.map((seat) => {
          const occupant = state.seats[seat];
          const free = !occupant || isAway(occupant);
          return (
            <div
              key={seat}
              className="flex items-center gap-2 rounded-xl border bg-slate-950/40 p-3"
              style={{ borderColor: `${SEAT_INFO[seat].color}66` }}
            >
              <span className="h-7 w-7 shrink-0 rounded-full" style={{ backgroundColor: SEAT_INFO[seat].color }} />
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-slate-500">{SEAT_INFO[seat].label}</p>
                <p className={`truncate text-sm font-medium ${occupant && !isAway(occupant) ? "text-slate-100" : "text-slate-500"}`}>
                  {occupant ? playerName(state, occupant, myId) : "Libre"}
                  {occupant && isAway(occupant) && " (se fue)"}
                </p>
              </div>
              {occupant !== myId && free && (
                <button
                  onClick={() => takeSeat(roomId, myId, seat, occupant)}
                  className="rounded-md border px-2 py-1 text-xs font-medium"
                  style={{ borderColor: SEAT_INFO[seat].color, color: SEAT_INFO[seat].color }}
                >
                  Elegir
                </button>
              )}
              {occupant === myId && (
                <button onClick={() => leaveSeat(roomId, myId)} className="text-xs text-slate-500 hover:text-slate-300">
                  Mirar
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-center text-xs text-slate-500">
        {seated < 2 ? "Hacen falta al menos 2 jugadores: mandá el link." : `${seated} jugadores listos.`}
      </p>
    </div>
  );
}

function Game({
  roomId,
  state,
  myId,
  isAway,
  presence,
}: {
  roomId: string;
  state: LudoState;
  myId: string;
  isAway: (id: string) => boolean;
  presence: PresenceMap;
}) {
  const mySeat = seatOf(state, myId);
  const myTurn = state.status === "playing" && mySeat === state.turn;
  const movable = myTurn && state.phase === "move" ? movableTokens(parseTokens(state.tokens[state.turn]), state.die) : [];
  const active = state.active.split("") as Seat[];
  const turnPlayer = state.seats[state.turn];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-3 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
        <Board state={state} movable={movable} onMove={(t) => moveToken(roomId, myId, t, state.moveNo)} />
      </div>

      <aside className="flex w-full flex-col gap-3 lg:w-72">
        {state.status === "finished" ? (
          <div className="animate-celebration-in flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/25 bg-slate-900 p-4 text-center">
            <p className="font-display text-xl font-semibold text-slate-100">
              {state.winner === mySeat ? "🎉 ¡Ganaste!" : `🏆 Ganó ${playerName(state, state.seats[state.winner as Seat], myId)}`}
            </p>
            <button onClick={() => rematch(roomId, state.gameNo)} className={`w-full ${mySeat ? PRIMARY_BUTTON : SECONDARY_BUTTON}`}>
              Revancha
            </button>
          </div>
        ) : (
          <div
            className="flex flex-col items-center gap-3 rounded-2xl border bg-slate-900/70 p-4 text-center"
            style={{ borderColor: SEAT_INFO[state.turn].color }}
          >
            <p className="font-display text-lg font-semibold text-slate-100">
              {myTurn ? "¡Te toca!" : `Juega ${playerName(state, turnPlayer, myId)}`}
            </p>
            <Die value={state.die} color={SEAT_INFO[state.turn].color} rollKey={state.moveNo} />
            {myTurn && state.phase === "roll" && (
              <button onClick={() => rollDie(roomId, myId, state.moveNo)} className={`w-full ${PRIMARY_BUTTON}`}>
                Tirar el dado
              </button>
            )}
            {myTurn && state.phase === "move" && <p className="text-sm text-slate-300">Tocá una ficha que titila.</p>}
            {!myTurn && isAway(turnPlayer) && (
              <button onClick={() => skipTurn(roomId, state.moveNo)} className={`w-full text-sm ${SECONDARY_BUTTON}`}>
                Se fue: pasar el turno
              </button>
            )}
            <LastMove state={state} myId={myId} />
          </div>
        )}

        <div className="flex flex-col gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
          {active.map((seat) => {
            const id = state.seats[seat];
            const home = parseTokens(state.tokens[seat]).filter((p) => p === GOAL).length;
            return (
              <div key={seat} className="flex items-center gap-2 text-sm">
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: SEAT_INFO[seat].color }} />
                <span className={`flex-1 truncate ${isAway(id) ? "text-slate-500" : "text-slate-200"}`}>
                  {playerName(state, id, myId)}
                  {isAway(id) && " (se fue)"}
                </span>
                <span className="text-xs text-slate-400">{home}/4 🏠</span>
                {isAway(id) && !mySeat && (
                  <button onClick={() => takeSeat(roomId, myId, seat, id)} className="text-xs text-cyan-300 underline">
                    Tomar
                  </button>
                )}
              </div>
            );
          })}
          {Object.keys(presence).some((id) => !seatOf(state, id)) && (
            <p className="mt-1 text-xs text-slate-500">
              Mirando:{" "}
              {Object.keys(presence)
                .filter((id) => !seatOf(state, id))
                .map((id) => (id === myId ? "vos" : presence[id]?.name))
                .join(", ")}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function LastMove({ state, myId }: { state: LudoState; myId: string }) {
  const l = state.last;
  if (!l.seat) return null;
  const who = playerName(state, state.seats[l.seat], myId);
  const what = l.from < 0 ? "sacó una ficha" : l.to === GOAL ? "¡metió una ficha!" : `avanzó ${l.to - l.from}`;
  return (
    <p className="text-xs text-slate-400">
      {who} {what}
      {l.captured && " y se comió una 😈"}
    </p>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[28, 22], [72, 22], [28, 50], [72, 50], [28, 78], [72, 78]],
};

function Die({ value, color, rollKey }: { value: number; color: string; rollKey: number }) {
  return (
    <div
      key={rollKey}
      className="animate-dice-roll relative h-16 w-16 rounded-2xl bg-white shadow-lg"
      style={{ boxShadow: `0 0 20px ${color}88` }}
    >
      {value === 0 ? (
        <span className="absolute inset-0 flex items-center justify-center text-2xl text-slate-400">?</span>
      ) : (
        PIPS[value].map(([x, y], i) => (
          <span
            key={i}
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-900"
            style={{ left: `${x}%`, top: `${y}%` }}
          />
        ))
      )}
    </div>
  );
}

const CELL = 100 / 15;
const pos = (r: number, c: number) => ({ top: `${r * CELL}%`, left: `${c * CELL}%`, width: `${CELL}%`, height: `${CELL}%` });

function Board({ state, movable, onMove }: { state: LudoState; movable: number[]; onMove: (token: number) => void }) {
  const active = state.active.split("") as Seat[];
  // Tokens sharing a square are nudged so all of them show.
  const tokens = active.flatMap((seat) =>
    parseTokens(state.tokens[seat]).map((p, i) => ({ seat, p, i, cell: cellOf(seat, p, i) }))
  );
  const stack = new Map<string, number>();

  return (
    <div className="relative aspect-square w-full max-w-[min(94vw,600px)] overflow-hidden rounded-2xl bg-slate-100 shadow-[0_0_35px_rgba(139,92,246,0.25)] ring-2 ring-slate-700">
      {SEATS.map((seat) => {
        const [r0, c0] = BASE_ORIGIN[seat];
        return (
          <div key={seat} className="absolute p-[2.5%]" style={{ ...pos(r0, c0), width: `${CELL * 6}%`, height: `${CELL * 6}%`, backgroundColor: SEAT_INFO[seat].color }}>
            <div className="h-full w-full rounded-xl bg-white/90" />
          </div>
        );
      })}

      {TRACK.map(([r, c], i) => {
        const startOf = SEATS.find((s) => SEAT_INFO[s].start === i);
        return (
          <div
            key={i}
            className="absolute flex items-center justify-center border border-slate-300 text-[10px] text-slate-400 sm:text-xs"
            style={{ ...pos(r, c), backgroundColor: startOf ? SEAT_INFO[startOf].color : "#fff" }}
          >
            {SAFE.has(i) && !startOf && "★"}
          </div>
        );
      })}

      {SEATS.map((seat) =>
        HOME[seat].slice(0, 5).map(([r, c], i) => (
          <div key={`${seat}${i}`} className="absolute border border-slate-300" style={{ ...pos(r, c), backgroundColor: SEAT_INFO[seat].light }} />
        ))
      )}

      <div
        className="absolute"
        style={{
          ...pos(6, 6),
          width: `${CELL * 3}%`,
          height: `${CELL * 3}%`,
          background: `conic-gradient(from 45deg, ${SEAT_INFO.b.color} 0 25%, ${SEAT_INFO.c.color} 0 50%, ${SEAT_INFO.d.color} 0 75%, ${SEAT_INFO.a.color} 0)`,
        }}
      />

      {tokens.map(({ seat, p, i, cell }) => {
        const k = `${cell[0]},${cell[1]}`;
        const n = stack.get(k) ?? 0;
        stack.set(k, n + 1);
        const canMove = seat === state.turn && movable.includes(i);
        const nudge = n * 14;
        return (
          <button
            key={`${seat}${i}`}
            onClick={() => canMove && onMove(i)}
            disabled={!canMove}
            aria-label={`Ficha ${SEAT_INFO[seat].label} ${i + 1}`}
            className="absolute flex items-center justify-center transition-[top,left] duration-300 ease-out"
            style={{ ...pos(cell[0], cell[1]), transform: `translate(${nudge}%, ${-nudge}%)`, zIndex: canMove ? 20 : 10 + n }}
          >
            <span
              className={`block h-[78%] w-[78%] rounded-full border-2 border-white shadow-md ${canMove ? "animate-pulse ring-4 ring-slate-900" : ""} ${p === GOAL ? "opacity-80" : ""}`}
              style={{ backgroundColor: SEAT_INFO[seat].color, boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.4)" }}
            />
          </button>
        );
      })}
    </div>
  );
}
