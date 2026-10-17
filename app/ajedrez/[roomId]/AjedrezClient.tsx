"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  SEAT_LABEL,
  colorOfSeat,
  getAjedrezMeta,
  joinAjedrez,
  leaveSeat,
  makeMove,
  offerDraw,
  positionOf,
  rematch,
  resign,
  seatOf,
  seatOfColor,
  startAjedrez,
  subscribeAjedrez,
  swapSeats,
  takeSeat,
  type AjedrezState,
  type EndReason,
  type Seat,
} from "@/lib/ajedrez";
import { INITIAL, colorOf, inCheck, kingSquare, legalMoves, type ChessMove, type PromoPiece } from "@/lib/ajedrezRules";
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

type Status = "loading" | "not-found" | "ready" | "error";

const SEATS: Seat[] = ["a", "b"];
// Solid glyphs for both sides (colored by CSS); U+FE0E keeps them from turning into emoji.
const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const END_TEXT: Record<Exclude<EndReason, "">, string> = {
  mate: "por jaque mate",
  ahogado: "Tablas por rey ahogado",
  material: "Tablas: no alcanza el material para dar mate",
  cincuenta: "Tablas por la regla de los 50 movimientos",
  abandono: "por abandono",
  tablas: "Tablas de común acuerdo",
};

export default function AjedrezClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [state, setState] = useState<AjedrezState | null>(null);
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

    getAjedrezMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "ajedrez") return router.replace(`/sala/${roomId}`);
        setHostId(meta.hostId ?? "");
        unsub = subscribeAjedrez(roomId, setState);
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
    joinAjedrez(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;

  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="ajedrez"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="ajedrez" />
        )}

        {status === "loading" && <RoomLoading text="Acomodando las piezas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="ajedrez"
              roomId={roomId}
              hostId={hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary="Uno contra uno · los demás miran"
              onStart={() => startAjedrez(roomId)}
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

function playerName(state: AjedrezState, id: string, myId: string): string {
  if (id === myId) return "Vos";
  return state.players[id]?.name ?? "?";
}

function Piece({ p, className = "" }: { p: string; className?: string }) {
  const white = colorOf(p) === "w";
  return (
    <span
      className={`select-none leading-none ${className}`}
      style={{
        color: white ? "#fafaf9" : "#1c1917",
        textShadow: white
          ? "0 0 1px #000, 0 0 1px #000, 0 1px 2px rgba(0,0,0,0.6)"
          : "0 0 1px #e7e5e4, 0 1px 2px rgba(0,0,0,0.4)",
        fontFamily: '"Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", serif',
      }}
    >
      {GLYPH[p.toLowerCase()]}
      {"︎"}
    </span>
  );
}

function SeatPicker({
  roomId,
  state,
  myId,
  isAway,
}: {
  roomId: string;
  state: AjedrezState;
  myId: string;
  isAway: (id: string) => boolean;
}) {
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
            <div key={seat} className="flex flex-col items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/40 p-3 text-center">
              <Piece p={seat === "a" ? "K" : "k"} className="text-4xl" />
              <p className="text-xs uppercase tracking-wide text-slate-500">{SEAT_LABEL[seat]}</p>
              <p className={`text-sm font-medium ${occupant && !isAway(occupant) ? "text-slate-100" : "text-slate-500"}`}>
                {occupant ? playerName(state, occupant, myId) : "Libre"}
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
        {!ready ? "Falta un jugador: mandale el link a tu rival." : "Empiezan las blancas."}
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
  state: AjedrezState;
  myId: string;
  isAway: (id: string) => boolean;
  presence: PresenceMap;
}) {
  const mySeat = seatOf(state, myId);
  const flipped = mySeat === "b";
  const playing = state.status === "playing";
  const myTurn = playing && !!mySeat && colorOfSeat(mySeat) === state.turn;
  const [selected, setSelected] = useState<number | null>(null);
  const [promoAsk, setPromoAsk] = useState<{ from: number; to: number } | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);

  const pos = positionOf(state);
  const legal = myTurn ? legalMoves(pos) : [];
  const targets = selected !== null ? legal.filter((m) => m.from === selected) : [];
  const checkSq = playing && inCheck(pos, state.turn) ? kingSquare(state.cells, state.turn) : -1;

  const send = (m: ChessMove) => {
    setSelected(null);
    setPromoAsk(null);
    makeMove(roomId, myId, m.from, m.to, m.promo, state.moveNo).catch(console.error);
  };

  const tap = (sq: number) => {
    if (!myTurn) return;
    if (selected !== null) {
      const options = targets.filter((m) => m.to === sq);
      if (options.length > 1) return setPromoAsk({ from: selected, to: sq });
      if (options.length === 1) return send(options[0]);
    }
    setSelected(colorOf(state.cells[sq]) === state.turn && legal.some((m) => m.from === sq) ? sq : null);
  };

  const topSeat: Seat = flipped ? "a" : "b";
  const bottomSeat: Seat = flipped ? "b" : "a";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 p-3 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
        <PlayerRow state={state} seat={topSeat} myId={myId} isAway={isAway} roomId={roomId} mySeat={mySeat} />
        <div className="relative aspect-square w-full max-w-[min(94vw,560px)] overflow-hidden rounded-xl shadow-[0_0_35px_rgba(139,92,246,0.25)] ring-2 ring-slate-700">
          <div className="grid h-full w-full grid-cols-8 grid-rows-8">
            {Array.from({ length: 64 }, (_, k) => {
              const sq = flipped ? 63 - k : k;
              const r = sq >> 3;
              const c = sq & 7;
              const dark = (r + c) % 2 === 1;
              const p = state.cells[sq];
              const isTarget = targets.some((m) => m.to === sq);
              const isLast = sq === state.lastMove.from || sq === state.lastMove.to;
              return (
                <button
                  key={sq}
                  onClick={() => tap(sq)}
                  className="relative flex items-center justify-center"
                  style={{
                    backgroundColor: selected === sq ? "#f6e05e" : isLast ? (dark ? "#b9a44a" : "#e8de84") : dark ? "#b58863" : "#f0d9b5",
                    boxShadow: sq === checkSq ? "inset 0 0 18px 6px rgba(239,68,68,0.9)" : undefined,
                  }}
                  aria-label={`Casilla ${"abcdefgh"[c]}${8 - r}`}
                >
                  {p !== "." && <Piece p={p} className="text-[min(9vw,52px)]" />}
                  {isTarget && (
                    <span
                      className={`absolute rounded-full ${p !== "." ? "inset-[6%] border-4 border-slate-900/40" : "h-[28%] w-[28%] bg-slate-900/35"}`}
                    />
                  )}
                  {(flipped ? r === 0 : r === 7) && (
                    <span className="absolute bottom-0.5 right-1 text-[10px] font-semibold" style={{ color: dark ? "#f0d9b5" : "#b58863" }}>
                      {"abcdefgh"[c]}
                    </span>
                  )}
                  {(flipped ? c === 7 : c === 0) && (
                    <span className="absolute left-1 top-0.5 text-[10px] font-semibold" style={{ color: dark ? "#f0d9b5" : "#b58863" }}>
                      {8 - r}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {promoAsk && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70">
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-slate-900 p-4">
                <p className="text-sm text-slate-300">Coronar como…</p>
                <div className="flex gap-2">
                  {(["q", "r", "b", "n"] as PromoPiece[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => send({ ...promoAsk, promo: k })}
                      className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-100 hover:bg-amber-200"
                    >
                      <Piece p={state.turn === "w" ? k.toUpperCase() : k} className="text-4xl" />
                    </button>
                  ))}
                </div>
                <button onClick={() => setPromoAsk(null)} className="text-xs text-slate-500">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
        <PlayerRow state={state} seat={bottomSeat} myId={myId} isAway={isAway} roomId={roomId} mySeat={mySeat} />
      </div>

      <aside className="flex w-full flex-col gap-3 lg:w-72">
        {state.status === "finished" ? (
          <ResultBox roomId={roomId} state={state} myId={myId} />
        ) : (
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-center">
            <p className="font-display text-lg font-semibold text-slate-100">
              {myTurn ? (checkSq >= 0 ? "¡Estás en jaque! Te toca" : "¡Te toca!") : `Juegan las ${SEAT_LABEL[seatOfColor(state.turn)].toLowerCase()}`}
            </p>
            {state.drawOffer && (
              <p className="text-sm text-amber-300">
                {state.drawOffer === mySeat ? "Ofreciste tablas." : `${playerName(state, state.seats[state.drawOffer], myId)} ofrece tablas.`}
              </p>
            )}
            {mySeat && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => offerDraw(roomId, myId)}
                  disabled={state.drawOffer === mySeat}
                  className={`text-sm ${SECONDARY_BUTTON}`}
                >
                  {state.drawOffer && state.drawOffer !== mySeat ? "Aceptar tablas" : "Ofrecer tablas"}
                </button>
                {confirmResign ? (
                  <button onClick={() => resign(roomId, myId)} className="rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white">
                    ¿Seguro? Abandonar
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmResign(true)}
                    className="rounded-lg border border-red-400/50 py-2.5 text-sm font-medium text-red-300 hover:bg-red-500/10"
                  >
                    Abandonar
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <History history={state.history} />
        {Object.keys(presence).some((id) => !seatOf(state, id)) && (
          <p className="text-center text-xs text-slate-500">
            Mirando:{" "}
            {Object.keys(presence)
              .filter((id) => !seatOf(state, id))
              .map((id) => (id === myId ? "vos" : presence[id]?.name))
              .join(", ")}
          </p>
        )}
      </aside>
    </div>
  );
}

/** Pieces a side has lost, from what's missing compared with the start. */
function captured(cells: string, color: "w" | "b"): string[] {
  const count = (s: string, p: string) => s.split("").filter((x) => x === p).length;
  const out: string[] = [];
  for (const k of ["q", "r", "b", "n", "p"]) {
    const p = color === "w" ? k.toUpperCase() : k;
    for (let i = count(cells, p); i < count(INITIAL.cells, p); i++) out.push(p);
  }
  return out;
}

function PlayerRow({
  state,
  seat,
  myId,
  isAway,
  roomId,
  mySeat,
}: {
  state: AjedrezState;
  seat: Seat;
  myId: string;
  isAway: (id: string) => boolean;
  roomId: string;
  mySeat: Seat | null;
}) {
  const id = state.seats[seat];
  const active = state.status === "playing" && seatOfColor(state.turn) === seat;
  // Pieces this side took = the rival's losses.
  const took = captured(state.cells, seat === "a" ? "b" : "w");
  const material = (cs: string[]) => cs.reduce((a, p) => a + VALUE[p.toLowerCase()], 0);
  const lead = material(took) - material(captured(state.cells, colorOfSeat(seat)));
  return (
    <div
      className={`flex w-full max-w-[min(94vw,560px)] items-center gap-2 rounded-xl border px-3 py-2 ${
        active ? "border-violet-400/70 bg-violet-500/10" : "border-slate-800 bg-slate-900/60"
      }`}
    >
      <Piece p={seat === "a" ? "K" : "k"} className="text-2xl" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">
        {id ? playerName(state, id, myId) : "—"}
        {isAway(id) && <span className="font-normal text-slate-500"> (se fue)</span>}
        <span className="ml-2 font-normal text-slate-500">{state.wins[id] ? `${state.wins[id]} ganadas` : ""}</span>
      </span>
      <span className="flex items-center text-lg">
        {took.map((p, i) => (
          <Piece key={i} p={p} className="-ml-1 text-base" />
        ))}
        {lead > 0 && <span className="ml-1 text-xs text-slate-400">+{lead}</span>}
      </span>
      {isAway(id) && !mySeat && (
        <button onClick={() => takeSeat(roomId, myId, seat, id)} className="text-xs text-cyan-300 underline">
          Tomar su lugar
        </button>
      )}
    </div>
  );
}

function ResultBox({ roomId, state, myId }: { roomId: string; state: AjedrezState; myId: string }) {
  const mySeat = seatOf(state, myId);
  const reason = state.endReason ? END_TEXT[state.endReason] : "";
  const winner = state.winner === "draw" ? null : (state.winner || null);
  const title = !winner
    ? "🤝 ¡Tablas!"
    : winner === mySeat
      ? "🎉 ¡Ganaste!"
      : `🏆 Ganaron las ${SEAT_LABEL[winner].toLowerCase()} (${playerName(state, state.seats[winner], myId)})`;
  return (
    <div className="animate-celebration-in flex flex-col items-center gap-2 rounded-2xl border border-emerald-500/25 bg-slate-900 p-4 text-center">
      <p className="font-display text-xl font-semibold text-slate-100">{title}</p>
      {reason && <p className="text-sm text-slate-400">{winner ? reason[0].toUpperCase() + reason.slice(1) : reason}</p>}
      <button onClick={() => rematch(roomId, state.gameNo)} className={`w-full ${mySeat ? PRIMARY_BUTTON : SECONDARY_BUTTON}`}>
        Revancha (cambian los colores)
      </button>
    </div>
  );
}

function History({ history }: { history: string }) {
  const moves = history ? history.split(" ") : [];
  if (!moves.length) return null;
  const rows: [string, string][] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1] ?? ""]);
  return (
    <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
      <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Jugadas</p>
      <ol className="grid grid-cols-[auto_1fr_1fr] gap-x-3 font-mono text-sm text-slate-300">
        {rows.map(([w, b], i) => [
          <span key={`n${i}`} className="text-slate-600">
            {i + 1}.
          </span>,
          <span key={`w${i}`}>{w}</span>,
          <span key={`b${i}`}>{b}</span>,
        ])}
      </ol>
    </div>
  );
}
