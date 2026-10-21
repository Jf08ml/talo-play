"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  COLS,
  DISCS,
  ROWS,
  dropDisc,
  findWin,
  getCuatroMeta,
  joinCuatro,
  landingRow,
  leaveSeat,
  movesMade,
  rematch,
  seatOf,
  startCuatro,
  subscribeCuatro,
  swapSeats,
  takeSeat,
  type CuatroState,
  type Disc,
} from "@/lib/cuatro";
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
import { ArrowLeftRight } from "lucide-react";
import { useTurnAlert } from "@/hooks/useTurnAlert";
import { Confetti } from "@/components/Results";
import { useSoundOn } from "@/hooks/useSound";

type Status = "loading" | "not-found" | "ready" | "error";

const SEATS: Disc[] = ["a", "b"];

export default function CuatroClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [state, setState] = useState<CuatroState | null>(null);
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

    getCuatroMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "cuatro") return router.replace(`/sala/${roomId}`);
        setHostId(meta.hostId ?? "");
        unsub = subscribeCuatro(roomId, setState);
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
    joinCuatro(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const mySeat = state ? seatOf(state, myId) : null;
  const myTurn = state?.status === "playing" && mySeat === state.turn;
  useTurnAlert(myTurn);
  useSoundOn(state?.lastMove, "place");
  const moves = state ? movesMade(state.cells) : 0;

  const drop = (col: number) => {
    if (!myTurn || !state || landingRow(state.cells, col) < 0) return;
    dropDisc(roomId, myId, col, moves).catch(console.error);
  };

  // Keys 1–7 drop in that column.
  useEffect(() => {
    if (!myTurn) return;
    const onKey = (e: KeyboardEvent) => {
      const col = Number(e.key) - 1;
      if (Number.isInteger(col) && col >= 0 && col < COLS) drop(col);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!configured) return <FirebaseSetupNotice />;

  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="cuatro"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="cuatro" />
        )}

        {status === "loading" && <RoomLoading text="Acomodando las fichas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="cuatro"
              roomId={roomId}
              hostId={hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary="Uno contra uno · los demás miran"
              onStart={() => startCuatro(roomId)}
            >
              <SeatPicker roomId={roomId} state={state} myId={myId} isAway={isAway} />
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 p-4">
            <PlayersBar roomId={roomId} state={state} myId={myId} isAway={isAway} />
            {state.status === "finished" && <ResultBanner roomId={roomId} state={state} myId={myId} />}
            <BoardView state={state} canPlay={myTurn} onDrop={drop} />
            <Spectators state={state} presence={presence} myId={myId} />
          </div>
        )}
      </main>
    </div>
  );
}

function playerName(state: CuatroState, id: string, myId: string): string {
  if (id === myId) return "Vos";
  return state.players[id]?.name ?? "?";
}

function DiscDot({ disc, className = "h-5 w-5" }: { disc: Disc; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: DISCS[disc].color, boxShadow: `0 0 10px ${DISCS[disc].glow}` }}
    />
  );
}

function SeatPicker({
  roomId,
  state,
  myId,
  isAway,
}: {
  roomId: string;
  state: CuatroState;
  myId: string;
  isAway: (id: string) => boolean;
}) {
  const mySeat = seatOf(state, myId);
  const ready = state.seats.a && state.seats.b;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        {SEATS.map((seat, i) => {
          const occupant = state.seats[seat];
          const free = !occupant || isAway(occupant);
          return [
            i === 1 && (
              <button
                key="swap"
                onClick={() => swapSeats(roomId)}
                disabled={!ready}
                title="Cambiar colores"
                aria-label="Cambiar colores"
                className="self-center rounded-full border border-slate-700 p-2 text-slate-400 transition hover:text-slate-100 disabled:opacity-30"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>
            ),
            <div
              key={seat}
              className="flex flex-col items-center gap-2 rounded-xl border bg-slate-950/40 p-3 text-center"
              style={{ borderColor: `${DISCS[seat].color}55` }}
            >
              <DiscDot disc={seat} className="h-8 w-8" />
              <p className="text-xs uppercase tracking-wide text-slate-500">{DISCS[seat].label}</p>
              <p className={`text-sm font-medium ${occupant && !isAway(occupant) ? "text-slate-100" : "text-slate-500"}`}>
                {occupant ? playerName(state, occupant, myId) : "Libre"}
                {occupant && isAway(occupant) && " (se fue)"}
              </p>
              {occupant !== myId && free && (
                <button
                  onClick={() => takeSeat(roomId, myId, seat, occupant)}
                  className="rounded-md border px-3 py-1 text-xs font-medium"
                  style={{ borderColor: DISCS[seat].color, color: DISCS[seat].color }}
                >
                  Jugar con estas
                </button>
              )}
              {occupant === myId && (
                <button onClick={() => leaveSeat(roomId, myId)} className="text-xs text-slate-500 hover:text-slate-300">
                  Prefiero mirar
                </button>
              )}
            </div>,
          ];
        })}
      </div>
      <p className="text-center text-xs text-slate-500">
        {!ready
          ? "Falta un jugador: mandale el link a tu rival."
          : mySeat
            ? `Empiezan las ${DISCS[state.starter].label.toLowerCase()}.`
            : "Las dos sillas están ocupadas: vas a mirar la partida."}
      </p>
    </div>
  );
}

function PlayersBar({
  roomId,
  state,
  myId,
  isAway,
}: {
  roomId: string;
  state: CuatroState;
  myId: string;
  isAway: (id: string) => boolean;
}) {
  const mySeat = seatOf(state, myId);
  return (
    <div className="grid grid-cols-2 gap-2">
      {SEATS.map((seat) => {
        const id = state.seats[seat];
        const active = state.status === "playing" && state.turn === seat;
        const away = isAway(id);
        return (
          <div
            key={seat}
            className={`flex items-center gap-2.5 rounded-xl border bg-slate-900/70 p-3 transition ${active ? "" : "opacity-70"}`}
            style={{
              borderColor: active ? DISCS[seat].color : "#33415580",
              boxShadow: active ? `0 0 20px ${DISCS[seat].glow}` : undefined,
            }}
          >
            <DiscDot disc={seat} className="h-7 w-7" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-100">
                {id ? playerName(state, id, myId) : "—"}
                {away && <span className="font-normal text-slate-500"> (se fue)</span>}
              </p>
              <p className="text-xs text-slate-400">
                {active ? (seat === mySeat ? "¡Te toca!" : "Pensando…") : `${state.wins[id] ?? 0} ganadas`}
              </p>
            </div>
            {away && !mySeat && (
              <button
                onClick={() => takeSeat(roomId, myId, seat, id)}
                className="rounded-md border border-cyan-400/60 px-2 py-1 text-xs text-cyan-300"
              >
                Tomar su lugar
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ResultBanner({ roomId, state, myId }: { roomId: string; state: CuatroState; myId: string }) {
  const mySeat = seatOf(state, myId);
  const winner = state.winner === "draw" ? null : state.winner || null;
  const iWon = !!winner && winner === mySeat;
  const title =
    state.winner === "draw"
      ? "🤝 ¡Empate! Se llenó el tablero."
      : iWon
        ? "🎉 ¡Ganaste!"
        : winner
          ? mySeat
            ? `😬 Ganó ${playerName(state, state.seats[winner], myId)}`
            : `🏆 ¡Ganó ${playerName(state, state.seats[winner], myId)}!`
          : "";
  return (
    <div
      className={`animate-celebration-in flex flex-col items-center gap-3 rounded-2xl border bg-slate-900 p-4 text-center ${
        iWon ? "border-emerald-500/25 shadow-[0_0_40px_rgba(52,211,153,0.2)]" : "border-violet-500/20"
      }`}
    >
      {iWon && <Confetti />}
      <p className="font-display text-xl font-semibold text-slate-100">{title}</p>
      <button onClick={() => rematch(roomId, state.gameNo)} className={`w-full max-w-xs ${mySeat ? PRIMARY_BUTTON : SECONDARY_BUTTON}`}>
        Revancha
      </button>
    </div>
  );
}

function BoardView({ state, canPlay, onDrop }: { state: CuatroState; canPlay: boolean; onDrop: (col: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const win = state.status === "finished" ? findWin(state.cells) : null;
  const winSet = new Set(win?.line ?? []);
  const turnDisc = state.turn;

  return (
    <div className="mx-auto w-full max-w-md">
      {/* Where my disc would fall. */}
      <div className="grid grid-cols-7 gap-1.5 px-2 pb-1 sm:gap-2 sm:px-3">
        {Array.from({ length: COLS }, (_, col) => (
          <div key={col} className="flex aspect-square items-center justify-center">
            {canPlay && hover === col && landingRow(state.cells, col) >= 0 && (
              <span className="h-[80%] w-[80%] rounded-full opacity-60" style={{ backgroundColor: DISCS[turnDisc].color }} />
            )}
          </div>
        ))}
      </div>

      <div
        className="grid grid-cols-7 gap-1.5 rounded-2xl bg-gradient-to-b from-blue-600 to-blue-800 p-2 shadow-[0_0_35px_rgba(37,99,235,0.35)] ring-2 ring-blue-400/40 sm:gap-2 sm:p-3"
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: COLS }, (_, col) => {
          const full = landingRow(state.cells, col) < 0;
          return (
            <button
              key={col}
              onClick={() => onDrop(col)}
              onMouseEnter={() => setHover(col)}
              disabled={!canPlay || full}
              aria-label={`Columna ${col + 1}`}
              className={`flex flex-col gap-1.5 rounded-lg sm:gap-2 ${canPlay && !full ? "cursor-pointer hover:bg-white/10" : "cursor-default"}`}
            >
              {Array.from({ length: ROWS }, (_, row) => {
                const idx = row * COLS + col;
                const cell = state.cells[idx];
                const disc = cell === "a" || cell === "b" ? cell : null;
                const isLast = idx === state.lastMove;
                return (
                  <span
                    key={row}
                    className="relative flex aspect-square w-full items-center justify-center rounded-full bg-slate-950 shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]"
                  >
                    {disc && (
                      <span
                        key={`${state.gameNo}-${idx}`}
                        className={`absolute inset-[6%] rounded-full ${isLast ? "animate-disc-drop" : ""} ${
                          winSet.has(idx) ? "ring-4 ring-white" : ""
                        }`}
                        style={
                          {
                            backgroundColor: DISCS[disc].color,
                            boxShadow: `inset 0 -4px 0 rgba(0,0,0,0.25), 0 0 ${winSet.has(idx) ? 22 : 8}px ${DISCS[disc].glow}`,
                            "--drop-from": `${-(row + 1) * 115}%`,
                          } as CSSProperties
                        }
                      />
                    )}
                  </span>
                );
              })}
            </button>
          );
        })}
      </div>
      {canPlay && <p className="mt-2 text-center text-xs text-slate-500">Tocá una columna (o usá las teclas 1–7).</p>}
    </div>
  );
}

function Spectators({ state, presence, myId }: { state: CuatroState; presence: PresenceMap; myId: string }) {
  const watching = Object.keys(presence).filter((id) => !seatOf(state, id));
  if (watching.length === 0) return null;
  return (
    <p className="text-center text-xs text-slate-500">
      Mirando: {watching.map((id) => (id === myId ? "vos" : presence[id]?.name ?? "?")).join(", ")}
    </p>
  );
}
