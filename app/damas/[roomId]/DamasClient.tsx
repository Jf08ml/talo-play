"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  SEAT_STYLE,
  SIZE,
  getDamasMeta,
  isKing,
  joinDamas,
  leaveSeat,
  legalMoves,
  makeMove,
  offerDraw,
  otherSeat,
  ownerOf,
  pieceCount,
  rematch,
  resign,
  seatOf,
  startDamas,
  subscribeDamas,
  swapSeats,
  takeSeat,
  type DamasState,
  type Seat,
} from "@/lib/damas";
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
import { ArrowLeftRight, Crown, Flag, Handshake } from "lucide-react";

type Status = "loading" | "not-found" | "ready" | "error";

const SEATS: Seat[] = ["a", "b"];

export default function DamasClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [state, setState] = useState<DamasState | null>(null);
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

    getDamasMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "damas") return router.replace(`/sala/${roomId}`);
        setHostId(meta.hostId ?? "");
        unsub = subscribeDamas(roomId, setState);
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
    joinDamas(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;

  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="damas"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="damas" />
        )}

        {status === "loading" && <RoomLoading text="Acomodando las fichas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="damas"
              roomId={roomId}
              hostId={hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary="Uno contra uno · tablero de 8 × 8 · empiezan las blancas"
              onStart={() => startDamas(roomId)}
            >
              <SeatPicker roomId={roomId} state={state} myId={myId} isAway={isAway} />
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 p-4">
            <PlayersBar roomId={roomId} state={state} myId={myId} isAway={isAway} />
            {state.status === "finished" && <ResultBanner roomId={roomId} state={state} myId={myId} />}
            <BoardView key={state.gameNo} roomId={roomId} state={state} myId={myId} />
            {state.status === "playing" && seatOf(state, myId) && <GameActions roomId={roomId} state={state} myId={myId} />}
            <Spectators state={state} presence={presence} myId={myId} />
          </div>
        )}
      </main>
    </div>
  );
}

function nameOf(state: DamasState, id: string, myId: string): string {
  if (id === myId) return "Vos";
  return state.players[id]?.name ?? "?";
}

function PieceDot({ seat, className = "h-6 w-6" }: { seat: Seat; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full border-2 ${className}`}
      style={{ backgroundColor: SEAT_STYLE[seat].fill, borderColor: SEAT_STYLE[seat].ring }}
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
  state: DamasState;
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
              className="flex flex-col items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/40 p-3 text-center"
            >
              <PieceDot seat={seat} className="h-8 w-8" />
              <p className="text-xs uppercase tracking-wide text-slate-500">{SEAT_STYLE[seat].label}</p>
              <p className={`text-sm font-medium ${occupant && !isAway(occupant) ? "text-slate-100" : "text-slate-500"}`}>
                {occupant ? nameOf(state, occupant, myId) : "Libre"}
                {occupant && isAway(occupant) && " (se fue)"}
              </p>
              {occupant !== myId && free && (
                <button
                  onClick={() => takeSeat(roomId, myId, seat, occupant)}
                  className="rounded-md border border-cyan-400/60 px-3 py-1 text-xs font-medium text-cyan-300"
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
            ? "Empiezan las blancas. En la revancha se cambian los colores."
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
  state: DamasState;
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
            className={`flex items-center gap-2.5 rounded-xl border bg-slate-900/70 p-3 transition ${
              active ? "border-amber-300/70 shadow-[0_0_20px_rgba(252,211,77,0.25)]" : "border-slate-700/50 opacity-70"
            }`}
          >
            <PieceDot seat={seat} className="h-7 w-7" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-100">
                {id ? nameOf(state, id, myId) : "—"}
                {away && <span className="font-normal text-slate-500"> (se fue)</span>}
              </p>
              <p className="text-xs text-slate-400">
                {active
                  ? seat === mySeat
                    ? state.chain >= 0
                      ? "¡Seguí comiendo!"
                      : "¡Te toca!"
                    : "Pensando…"
                  : `${pieceCount(state.cells, seat)} fichas · ${state.wins[id] ?? 0} ganadas`}
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

function BoardView({ roomId, state, myId }: { roomId: string; state: DamasState; myId: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const mySeat = seatOf(state, myId);
  const myTurn = state.status === "playing" && mySeat === state.turn;
  const moves = myTurn ? legalMoves(state.cells, state.turn, state.chain) : [];
  const movable = new Set(moves.map((m) => m.from));
  const mustCapture = moves.some((m) => m.captured >= 0);
  // In a capture chain the piece is fixed.
  const active = state.chain >= 0 && myTurn ? state.chain : selected !== null && movable.has(selected) ? selected : null;
  const targets = new Set(moves.filter((m) => m.from === active).map((m) => m.to));
  // Blacks see the board from their side.
  const flipped = mySeat === "b";

  const tap = (idx: number) => {
    if (!myTurn) return;
    if (active !== null && targets.has(idx)) {
      makeMove(roomId, myId, active, idx, state.moveNo).catch(console.error);
      setSelected(null);
      return;
    }
    if (movable.has(idx)) setSelected(idx === selected ? null : idx);
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="grid grid-cols-8 overflow-hidden rounded-xl border-4 border-amber-900/80 shadow-[0_0_35px_rgba(180,83,9,0.25)]">
        {Array.from({ length: SIZE * SIZE }, (_, k) => {
          const idx = flipped ? SIZE * SIZE - 1 - k : k;
          const r = Math.floor(idx / SIZE);
          const c = idx % SIZE;
          const dark = (r + c) % 2 === 1;
          const ch = state.cells[idx];
          const owner = ownerOf(ch);
          const isTarget = targets.has(idx);
          const isLast = idx === state.lastMove.from || idx === state.lastMove.to;
          const canPick = movable.has(idx);
          return (
            <button
              key={idx}
              onClick={() => tap(idx)}
              disabled={!dark || (!canPick && !isTarget)}
              aria-label={`${String.fromCharCode(97 + c)}${SIZE - r}`}
              className={`relative flex aspect-square items-center justify-center ${
                dark ? (isLast ? "bg-amber-800" : "bg-amber-950") : "bg-amber-200/80"
              } ${canPick || isTarget ? "cursor-pointer" : "cursor-default"}`}
            >
              {isTarget && <span className="absolute h-1/3 w-1/3 rounded-full bg-emerald-400/70 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />}
              {owner && (
                <span
                  className={`relative flex h-[78%] w-[78%] items-center justify-center rounded-full border-[3px] shadow-[inset_0_-3px_0_rgba(0,0,0,0.25),0_2px_4px_rgba(0,0,0,0.5)] transition ${
                    idx === active ? "scale-110 ring-4 ring-emerald-400" : canPick && mustCapture ? "ring-2 ring-rose-400" : ""
                  }`}
                  style={{ backgroundColor: SEAT_STYLE[owner].fill, borderColor: SEAT_STYLE[owner].ring }}
                >
                  {isKing(ch) && (
                    <Crown className={`h-1/2 w-1/2 ${owner === "a" ? "text-amber-600" : "text-amber-300"}`} strokeWidth={2.5} />
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {myTurn && (
        <p className="mt-2 text-center text-xs text-slate-500">
          {state.chain >= 0
            ? "Podés seguir comiendo con la misma ficha: ¡es obligatorio!"
            : mustCapture
              ? "Tenés que comer: las fichas marcadas en rojo pueden."
              : "Tocá una ficha y después la casilla a donde moverla."}
        </p>
      )}
    </div>
  );
}

function GameActions({ roomId, state, myId }: { roomId: string; state: DamasState; myId: string }) {
  const mySeat = seatOf(state, myId)!;
  const [confirmResign, setConfirmResign] = useState(false);
  const rivalOffered = state.drawOffer === otherSeat(mySeat);
  return (
    <div className="flex flex-col items-center gap-2">
      {rivalOffered && (
        <p className="text-sm text-amber-200">{nameOf(state, state.seats[otherSeat(mySeat)], myId)} te ofrece tablas.</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => offerDraw(roomId, myId)}
          disabled={state.drawOffer === mySeat}
          className={`flex items-center gap-1.5 px-3 text-xs ${rivalOffered ? PRIMARY_BUTTON : SECONDARY_BUTTON}`}
        >
          <Handshake className="h-4 w-4" />
          {rivalOffered ? "Aceptar tablas" : state.drawOffer === mySeat ? "Ofreciste tablas" : "Ofrecer tablas"}
        </button>
        <button
          onClick={() => (confirmResign ? resign(roomId, myId) : setConfirmResign(true))}
          onBlur={() => setConfirmResign(false)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2.5 text-xs text-slate-400 transition hover:text-slate-200"
        >
          <Flag className="h-4 w-4" />
          {confirmResign ? "¿Seguro? Tocá de nuevo" : "Rendirme"}
        </button>
      </div>
    </div>
  );
}

function ResultBanner({ roomId, state, myId }: { roomId: string; state: DamasState; myId: string }) {
  const mySeat = seatOf(state, myId);
  const winner = state.winner === "draw" ? null : state.winner || null;
  const iWon = !!winner && winner === mySeat;
  const winnerName = winner ? nameOf(state, state.seats[winner], myId) : "";
  const title =
    state.winner === "draw"
      ? "🤝 Tablas: acordaron empate."
      : iWon
        ? "🎉 ¡Ganaste!"
        : mySeat
          ? `😬 Ganó ${winnerName}`
          : `🏆 ¡Ganó ${winnerName}!`;
  const reason =
    state.endReason === "resign" && winner
      ? `Las ${SEAT_STYLE[otherSeat(winner)].label.toLowerCase()} se rindieron.`
      : state.endReason === "nomoves" && winner
        ? `Las ${SEAT_STYLE[otherSeat(winner)].label.toLowerCase()} se quedaron sin jugadas.`
        : "";
  return (
    <div
      className={`animate-celebration-in flex flex-col items-center gap-2 rounded-2xl border bg-slate-900 p-4 text-center ${
        iWon ? "border-emerald-500/25 shadow-[0_0_40px_rgba(52,211,153,0.2)]" : "border-violet-500/20"
      }`}
    >
      <p className="font-display text-xl font-semibold text-slate-100">{title}</p>
      {reason && <p className="text-xs text-slate-500">{reason}</p>}
      <button
        onClick={() => rematch(roomId, state.gameNo)}
        className={`mt-1 w-full max-w-xs ${mySeat ? PRIMARY_BUTTON : SECONDARY_BUTTON}`}
      >
        Revancha (cambian colores)
      </button>
    </div>
  );
}

function Spectators({ state, presence, myId }: { state: DamasState; presence: PresenceMap; myId: string }) {
  const watching = Object.keys(presence).filter((id) => !seatOf(state, id));
  if (watching.length === 0) return null;
  return (
    <p className="text-center text-xs text-slate-500">
      Mirando: {watching.map((id) => (id === myId ? "vos" : (presence[id]?.name ?? "?"))).join(", ")}
    </p>
  );
}
