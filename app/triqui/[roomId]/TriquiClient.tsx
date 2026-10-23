"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  SEAT_STYLE,
  SIZE,
  cellsOf,
  joinTriqui,
  leaveSeat,
  nextToVanish,
  otherSeat,
  playSquare,
  rematch,
  resign,
  seatOf,
  startTriqui,
  subscribeTriqui,
  swapSeats,
  takeSeat,
  turnOf,
  winLine,
  type Seat,
  type TriquiMeta,
  type TriquiState,
} from "@/lib/triqui";
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
import { BackToRoomButton, RoomSettingsEditor, type RawMeta } from "@/components/RoomSettings";
import { watchRoomMeta } from "@/lib/roomSettings";
import { SETTINGS, VARIANT_LABEL } from "../settings";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import { Flag } from "lucide-react";
import { useTurnAlert } from "@/hooks/useTurnAlert";
import { Confetti } from "@/components/Results";
import { useSoundOn } from "@/hooks/useSound";

type Status = "loading" | "not-found" | "ready" | "error";

export default function TriquiClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
  const [state, setState] = useState<TriquiState | null>(null);
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

    const unsubMeta = watchRoomMeta<TriquiMeta>(
      roomId,
      (meta) => {
        if (cancelled) return;
        setRoomMeta(meta);
        if (!meta) return setStatus("not-found");
        if (meta.game !== "triqui") return router.replace(`/sala/${roomId}`);
        setHostId(meta.hostId ?? "");
        unsub ??= subscribeTriqui(roomId, setState);
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
    joinTriqui(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;

  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="triqui"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="triqui" />
        )}

        {status === "loading" && <RoomLoading text="Dibujando el tablero…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="triqui"
              roomId={roomId}
              hostId={hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`Uno contra uno · modo ${VARIANT_LABEL[state.variant].label.toLowerCase()} · empieza la X`}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              onStart={() => startTriqui(roomId)}
            >
              <TwoSeatPicker
                state={state}
                myId={myId}
                isAway={isAway}
                labels={{
                  a: { label: SEAT_STYLE.a.label, piece: <Mark seat="a" className="h-8 w-8" /> },
                  b: { label: SEAT_STYLE.b.label, piece: <Mark seat="b" className="h-8 w-8" /> },
                }}
                onTake={(seat, occupant) => takeSeat(roomId, myId, seat, occupant)}
                onLeave={() => leaveSeat(roomId, myId)}
                onSwap={() => swapSeats(roomId)}
                note="Empieza la X. En la revancha se cambian las marcas."
              />
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
            <PlayersBar roomId={roomId} state={state} myId={myId} isAway={isAway} />
            {state.status === "finished" && <ResultBanner roomId={roomId} state={state} myId={myId} />}
            <BoardView roomId={roomId} state={state} myId={myId} />
            {state.status === "playing" && seatOf(state, myId) && <ResignButton roomId={roomId} myId={myId} />}
            <Spectators state={state} presence={presence} myId={myId} />
          </div>
        )}

        {status === "ready" && state?.status === "finished" && (
          <div className="flex justify-center px-4 pb-6">
            <BackToRoomButton roomId={roomId} stateKey="triqui/state" hostId={hostId} presence={presence} myId={myId} />
          </div>
        )}
      </main>
    </div>
  );
}

/** An X or an O drawn as pen strokes; `animate` draws it stroke by stroke. */
function Mark({ seat, className = "h-6 w-6", animate = false }: { seat: Seat; className?: string; animate?: boolean }) {
  const stroke = {
    stroke: SEAT_STYLE[seat].color,
    strokeWidth: 13,
    strokeLinecap: "round" as const,
    fill: "none",
    pathLength: 1,
    strokeDasharray: 1,
  };
  const anim = animate ? "animate-mark-draw" : "";
  return (
    <svg viewBox="0 0 100 100" className={`shrink-0 ${className}`} aria-label={SEAT_STYLE[seat].mark}>
      {seat === "a" ? (
        <>
          <path d="M22 22 L78 78" {...stroke} className={anim} />
          <path d="M78 22 L22 78" {...stroke} className={anim} style={animate ? { animationDelay: "0.15s" } : undefined} />
        </>
      ) : (
        <path d="M50 20 A30 30 0 1 1 49.9 20" {...stroke} className={anim} />
      )}
    </svg>
  );
}

function PlayersBar({
  roomId,
  state,
  myId,
  isAway,
}: {
  roomId: string;
  state: TriquiState;
  myId: string;
  isAway: (id: string) => boolean;
}) {
  const mySeat = seatOf(state, myId);
  const turn = turnOf(state.moves);
  return (
    <div className="grid grid-cols-2 gap-2">
      {SEATS2.map((seat) => {
        const id = state.seats[seat];
        const active = state.status === "playing" && turn === seat;
        const away = isAway(id);
        return (
          <div
            key={seat}
            className={`flex items-center gap-2.5 rounded-xl border bg-slate-900/70 p-3 transition ${
              active ? "border-amber-300/70 shadow-[0_0_20px_rgba(252,211,77,0.25)]" : "border-slate-700/50 opacity-80"
            }`}
          >
            <Mark seat={seat} className="h-7 w-7" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-100">
                {id ? seatName(state, id, myId) : "—"}
                {away && <span className="font-normal text-slate-500"> (se fue)</span>}
              </p>
              <p className="text-xs text-slate-400">{active ? (seat === mySeat ? "¡Te toca!" : "Pensando…") : " "}</p>
            </div>
            <span className="font-display text-2xl font-bold tabular-nums text-slate-100">{state.wins[id] ?? 0}</span>
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

/** Center of square `i` in the board's 0–300 coordinates. */
const center = (i: number) => ({ x: (i % SIZE) * 100 + 50, y: Math.floor(i / SIZE) * 100 + 50 });

function BoardView({ roomId, state, myId }: { roomId: string; state: TriquiState; myId: string }) {
  const mySeat = seatOf(state, myId);
  const turn = turnOf(state.moves);
  const playing = state.status === "playing";
  const myTurn = playing && mySeat === turn;
  useTurnAlert(myTurn);
  useSoundOn(state.moves.length, "place");
  const cells = cellsOf(state.moves, state.variant);
  const last = state.moves ? Number(state.moves[state.moves.length - 1]) : -1;
  const line = winLine(cells);
  // The mark the player in turn loses with their next move (infinito).
  const vanish = playing ? nextToVanish(state.moves, state.variant, turn) : -1;

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="relative">
        <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-slate-600/70 p-0 shadow-[0_0_35px_rgba(34,211,238,0.12)]">
          {Array.from({ length: SIZE * SIZE }, (_, idx) => {
            const ch = cells[idx];
            const owner = ch === "a" || ch === "b" ? ch : null;
            const canPlay = myTurn && !owner;
            return (
              <button
                key={idx}
                onClick={() => canPlay && playSquare(roomId, myId, idx, state.moves.length).catch(console.error)}
                disabled={!canPlay}
                aria-label={`Casilla ${idx + 1}${owner ? `: ${SEAT_STYLE[owner].mark}` : ""}`}
                className={`group flex aspect-square items-center justify-center bg-slate-950 first:rounded-tl-2xl [&:nth-child(3)]:rounded-tr-2xl [&:nth-child(7)]:rounded-bl-2xl last:rounded-br-2xl ${
                  canPlay ? "cursor-pointer hover:bg-slate-900" : "cursor-default"
                }`}
              >
                {owner && (
                  <span className={`transition-opacity ${idx === vanish ? "animate-pulse opacity-35" : ""}`}>
                    <Mark key={`${owner}${idx === last ? state.moves.length : ""}`} seat={owner} className="h-20 w-20 sm:h-24 sm:w-24" animate={idx === last} />
                  </span>
                )}
                {canPlay && (
                  <span className="opacity-0 transition-opacity group-hover:opacity-25">
                    <Mark seat={turn} className="h-20 w-20 sm:h-24 sm:w-24" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {line && (
          <svg viewBox="0 0 300 300" className="pointer-events-none absolute inset-0 h-full w-full">
            <line
              x1={center(line[0]).x}
              y1={center(line[0]).y}
              x2={center(line[2]).x}
              y2={center(line[2]).y}
              stroke="#fcd34d"
              strokeWidth="8"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              className="animate-mark-draw drop-shadow-[0_0_8px_rgba(252,211,77,0.8)]"
              style={{ animationDelay: "0.3s" }}
            />
          </svg>
        )}
      </div>
      <p className="mt-2 min-h-4 text-center text-xs text-slate-500">
        {!playing
          ? ""
          : vanish >= 0
            ? `La ${SEAT_STYLE[turn].mark} que titila se borra con la próxima jugada de ${SEAT_STYLE[turn].label.toLowerCase()}.`
            : myTurn
              ? "Tocá una casilla libre."
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

function ResultBanner({ roomId, state, myId }: { roomId: string; state: TriquiState; myId: string }) {
  const mySeat = seatOf(state, myId);
  const winner = state.winner === "draw" ? null : state.winner || null;
  const iWon = !!winner && winner === mySeat;
  const winnerName = winner ? seatName(state, state.seats[winner], myId) : "";
  const title =
    state.winner === "draw" ? "🤝 ¡Empate!" : iWon ? "🎉 ¡Ganaste!" : mySeat ? `😬 Ganó ${winnerName}` : `🏆 ¡Ganó ${winnerName}!`;
  const reason =
    state.endReason === "resign" && winner
      ? `${seatName(state, state.seats[otherSeat(winner)], myId)} se rindió.`
      : state.winner === "draw"
        ? "Tablero lleno y nadie hizo tres en línea."
        : `Tres ${SEAT_STYLE[winner ?? "a"].mark} en línea.`;
  return (
    <div
      className={`animate-celebration-in flex flex-col items-center gap-2 rounded-2xl border bg-slate-900 p-4 text-center ${
        iWon ? "border-emerald-500/25 shadow-[0_0_40px_rgba(52,211,153,0.2)]" : "border-violet-500/20"
      }`}
    >
      {iWon && <Confetti />}
      <p className="font-display text-xl font-semibold text-slate-100">{title}</p>
      <p className="text-xs text-slate-500">{reason}</p>
      <button
        onClick={() => rematch(roomId, state.gameNo)}
        className={`mt-1 w-full max-w-xs ${mySeat ? PRIMARY_BUTTON : SECONDARY_BUTTON}`}
      >
        Revancha (cambian X y O)
      </button>
    </div>
  );
}
