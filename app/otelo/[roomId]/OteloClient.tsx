"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  SEAT_STYLE,
  SIZE,
  discCount,
  flipsFor,
  getOteloMeta,
  joinOtelo,
  leaveSeat,
  legalSquares,
  otherSeat,
  placeDisc,
  rematch,
  resign,
  seatOf,
  startOtelo,
  subscribeOtelo,
  swapSeats,
  takeSeat,
  type OteloState,
  type Seat,
} from "@/lib/otelo";
import { SEATS2 } from "@/lib/twoSeats";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import TwoSeatPicker, { Spectators, seatName } from "@/components/TwoSeatPicker";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import { Flag } from "lucide-react";
import { useTurnAlert } from "@/hooks/useTurnAlert";

type Status = "loading" | "not-found" | "ready" | "error";

export default function OteloClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [state, setState] = useState<OteloState | null>(null);
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

    getOteloMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "otelo") return router.replace(`/sala/${roomId}`);
        setHostId(meta.hostId ?? "");
        unsub = subscribeOtelo(roomId, setState);
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
    joinOtelo(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;

  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="otelo"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="otelo" />
        )}

        {status === "loading" && <RoomLoading text="Acomodando las fichas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="otelo"
              roomId={roomId}
              hostId={hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary="Uno contra uno · tablero de 8 × 8 · empiezan las negras"
              onStart={() => startOtelo(roomId)}
            >
              <TwoSeatPicker
                state={state}
                myId={myId}
                isAway={isAway}
                labels={{
                  a: { label: SEAT_STYLE.a.label, piece: <Disc seat="a" className="h-8 w-8" /> },
                  b: { label: SEAT_STYLE.b.label, piece: <Disc seat="b" className="h-8 w-8" /> },
                }}
                onTake={(seat, occupant) => takeSeat(roomId, myId, seat, occupant)}
                onLeave={() => leaveSeat(roomId, myId)}
                onSwap={() => swapSeats(roomId)}
                note="Empiezan las negras. En la revancha se cambian los colores."
              />
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 p-4">
            <PlayersBar roomId={roomId} state={state} myId={myId} isAway={isAway} />
            {state.status === "finished" && <ResultBanner roomId={roomId} state={state} myId={myId} />}
            <BoardView roomId={roomId} state={state} myId={myId} />
            {state.status === "playing" && seatOf(state, myId) && <ResignButton roomId={roomId} myId={myId} />}
            <Spectators state={state} presence={presence} myId={myId} />
          </div>
        )}
      </main>
    </div>
  );
}

function Disc({ seat, className = "h-6 w-6" }: { seat: Seat; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full border-2 ${className}`}
      style={{ backgroundColor: SEAT_STYLE[seat].fill, borderColor: SEAT_STYLE[seat].ring }}
    />
  );
}

function PlayersBar({
  roomId,
  state,
  myId,
  isAway,
}: {
  roomId: string;
  state: OteloState;
  myId: string;
  isAway: (id: string) => boolean;
}) {
  const mySeat = seatOf(state, myId);
  return (
    <div className="grid grid-cols-2 gap-2">
      {SEATS2.map((seat) => {
        const id = state.seats[seat];
        const active = state.status === "playing" && state.turn === seat;
        const away = isAway(id);
        return (
          <div
            key={seat}
            className={`flex items-center gap-2.5 rounded-xl border bg-slate-900/70 p-3 transition ${
              active ? "border-amber-300/70 shadow-[0_0_20px_rgba(252,211,77,0.25)]" : "border-slate-700/50 opacity-80"
            }`}
          >
            <Disc seat={seat} className="h-7 w-7" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-100">
                {id ? seatName(state, id, myId) : "—"}
                {away && <span className="font-normal text-slate-500"> (se fue)</span>}
              </p>
              <p className="text-xs text-slate-400">
                {active ? (seat === mySeat ? "¡Te toca!" : "Pensando…") : `${state.wins[id] ?? 0} ganadas`}
              </p>
            </div>
            <span className="font-display text-2xl font-bold tabular-nums text-slate-100">{discCount(state.cells, seat)}</span>
            {away && !mySeat && (
              <button
                onClick={() => takeSeat(roomId, myId, seat, id)}
                className="rounded-md border border-cyan-400/60 px-2 py-1 text-xs text-cyan-300"
              >
                Tomar
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BoardView({ roomId, state, myId }: { roomId: string; state: OteloState; myId: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const mySeat = seatOf(state, myId);
  const myTurn = state.status === "playing" && mySeat === state.turn;
  useTurnAlert(myTurn);
  const legal = new Set(myTurn ? legalSquares(state.cells, state.turn) : []);
  const flipped = new Set(state.flipped ? state.flipped.split(",").map(Number) : []);
  const preview = new Set(myTurn && hover !== null && legal.has(hover) ? flipsFor(state.cells, state.turn, hover) : []);

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="grid grid-cols-8 gap-[2px] rounded-xl border-4 border-emerald-950 bg-emerald-950 p-[2px] shadow-[0_0_35px_rgba(16,185,129,0.2)]">
        {Array.from({ length: SIZE * SIZE }, (_, idx) => {
          const ch = state.cells[idx];
          const owner = ch === "a" || ch === "b" ? ch : null;
          const canPlay = legal.has(idx);
          const r = Math.floor(idx / SIZE);
          const c = idx % SIZE;
          return (
            <button
              key={idx}
              onClick={() => canPlay && placeDisc(roomId, myId, idx, state.moveNo).catch(console.error)}
              onMouseEnter={() => setHover(idx)}
              onMouseLeave={() => setHover(null)}
              disabled={!canPlay}
              aria-label={`${String.fromCharCode(97 + c)}${r + 1}`}
              className={`relative flex aspect-square items-center justify-center bg-emerald-700 ${canPlay ? "cursor-pointer hover:bg-emerald-600" : "cursor-default"}`}
            >
              {owner && (
                <span
                  key={`${owner}${flipped.has(idx) ? state.moveNo : ""}`}
                  className={`block h-[82%] w-[82%] rounded-full border-2 shadow-[inset_0_-3px_0_rgba(0,0,0,0.25),0_2px_4px_rgba(0,0,0,0.5)] ${
                    idx === state.last ? "animate-pop-in" : flipped.has(idx) ? "animate-disc-flip" : ""
                  } ${preview.has(idx) ? "opacity-60" : ""}`}
                  style={{ backgroundColor: SEAT_STYLE[owner].fill, borderColor: SEAT_STYLE[owner].ring }}
                />
              )}
              {idx === state.last && <span className="absolute h-1.5 w-1.5 rounded-full bg-rose-500" />}
              {canPlay && (
                <span
                  className={`block rounded-full ${hover === idx ? "h-[82%] w-[82%] opacity-50" : "h-1/4 w-1/4 opacity-40"}`}
                  style={{ backgroundColor: SEAT_STYLE[state.turn].fill }}
                />
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-xs text-slate-500">
        {state.passed && state.status === "playing"
          ? `${SEAT_STYLE[state.passed].label} no tenían jugada: pasan y vuelven a jugar las ${SEAT_STYLE[state.turn].label.toLowerCase()}.`
          : myTurn
            ? "Tocá una casilla marcada: las fichas que encerrás se dan vuelta."
            : ""}
      </p>
    </div>
  );
}

function ResignButton({ roomId, myId }: { roomId: string; myId: string }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <button
      onClick={() => (confirm ? resign(roomId, myId) : setConfirm(true))}
      onBlur={() => setConfirm(false)}
      className="mx-auto flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 transition hover:text-slate-200"
    >
      <Flag className="h-4 w-4" />
      {confirm ? "¿Seguro? Tocá de nuevo" : "Rendirme"}
    </button>
  );
}

function ResultBanner({ roomId, state, myId }: { roomId: string; state: OteloState; myId: string }) {
  const mySeat = seatOf(state, myId);
  const winner = state.winner === "draw" ? null : state.winner || null;
  const iWon = !!winner && winner === mySeat;
  const winnerName = winner ? seatName(state, state.seats[winner], myId) : "";
  const a = discCount(state.cells, "a");
  const b = discCount(state.cells, "b");
  const title =
    state.winner === "draw" ? "🤝 ¡Empate!" : iWon ? "🎉 ¡Ganaste!" : mySeat ? `😬 Ganó ${winnerName}` : `🏆 ¡Ganó ${winnerName}!`;
  const reason =
    state.endReason === "resign" && winner
      ? `Las ${SEAT_STYLE[otherSeat(winner)].label.toLowerCase()} se rindieron.`
      : `Negras ${a} · Blancas ${b}`;
  return (
    <div
      className={`animate-celebration-in flex flex-col items-center gap-2 rounded-2xl border bg-slate-900 p-4 text-center ${
        iWon ? "border-emerald-500/25 shadow-[0_0_40px_rgba(52,211,153,0.2)]" : "border-violet-500/20"
      }`}
    >
      <p className="font-display text-xl font-semibold text-slate-100">{title}</p>
      <p className="text-xs text-slate-500">{reason}</p>
      <button
        onClick={() => rematch(roomId, state.gameNo)}
        className={`mt-1 w-full max-w-xs ${mySeat ? PRIMARY_BUTTON : SECONDARY_BUTTON}`}
      >
        Revancha (cambian colores)
      </button>
    </div>
  );
}
