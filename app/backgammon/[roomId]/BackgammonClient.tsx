"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  SEAT_STYLE,
  answerDouble,
  canDouble,
  currentSteps,
  endTurn,
  getBackgammonMeta,
  joinBackgammon,
  leaveSeat,
  moveChecker,
  nextGame,
  offerDouble,
  otherSeat,
  parseDice,
  positionOf,
  rematch,
  resignGame,
  rollDice,
  seatOf,
  skipAbsent,
  startBackgammon,
  subscribeBackgammon,
  swapSeats,
  takeSeat,
  undoTurn,
  type BgState,
  type Seat,
} from "@/lib/backgammon";
import { BAR, OFF, pipCount, pointOf, type Position, type Step } from "@/lib/backgammonRules";
import { SEATS2 } from "@/lib/twoSeats";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import DieFace from "@/components/DieFace";
import TwoSeatPicker, { Spectators, seatName } from "@/components/TwoSeatPicker";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { BackToRoomButton, RoomSettingsEditor, type RawMeta } from "@/components/RoomSettings";
import { watchRoomMeta } from "@/lib/roomSettings";
import { SETTINGS } from "../settings";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import { Flag, Undo2 } from "lucide-react";

type Status = "loading" | "not-found" | "ready" | "error";

export default function BackgammonClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
  const [state, setState] = useState<BgState | null>(null);
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

    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getBackgammonMeta>>>>(
      roomId,
      (meta) => {
        if (cancelled) return;
        setRoomMeta(meta);
        if (!meta) return setStatus("not-found");
        if (meta.game !== "backgammon") return router.replace(`/sala/${roomId}`);
        setHostId(meta.hostId ?? "");
        unsub ??= subscribeBackgammon(roomId, setState);
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
    joinBackgammon(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;

  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="backgammon"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="backgammon" />
        )}

        {status === "loading" && <RoomLoading text="Acomodando las fichas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="backgammon"
              roomId={roomId}
              hostId={hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`Uno contra uno · partido a ${state.matchTo} ${state.matchTo === 1 ? "punto" : "puntos"} · con cubo`}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              onStart={() => startBackgammon(roomId)}
            >
              <TwoSeatPicker
                state={state}
                myId={myId}
                isAway={isAway}
                labels={{
                  a: { label: SEAT_STYLE.a.label, piece: <Checker seat="a" className="h-8 w-8" /> },
                  b: { label: SEAT_STYLE.b.label, piece: <Checker seat="b" className="h-8 w-8" /> },
                }}
                onTake={(seat, occupant) => takeSeat(roomId, myId, seat, occupant)}
                onLeave={() => leaveSeat(roomId, myId)}
                onSwap={() => swapSeats(roomId)}
                note="Cada partida empieza con un dado cada uno: el más alto arranca."
              />
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && state.status !== "waiting" && (
          <Game roomId={roomId} state={state} myId={myId} isAway={isAway} presence={presence} />
        )}

        {status === "ready" && state?.status === "finished" && (
          <div className="flex justify-center px-4 pb-6">
            <BackToRoomButton roomId={roomId} stateKey="backgammon/state" hostId={hostId} presence={presence} myId={myId} />
          </div>
        )}
      </main>
    </div>
  );
}

function Checker({ seat, className = "h-6 w-6" }: { seat: Seat; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full border-2 shadow-[inset_0_-2px_0_rgba(0,0,0,0.25)] ${className}`}
      style={{ backgroundColor: SEAT_STYLE[seat].fill, borderColor: SEAT_STYLE[seat].ring }}
    />
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
  state: BgState;
  myId: string;
  isAway: (id: string) => boolean;
  presence: Parameters<typeof Spectators>[0]["presence"];
}) {
  const mySeat = seatOf(state, myId);
  const pos = positionOf(state);
  // The board is drawn from my side (spectators see it from white's).
  const viewer: Seat = mySeat ?? "a";
  const awaited = state.phase === "double" ? otherSeat(state.turn) : state.turn;
  const awaitedId = state.seats[awaited];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 p-3 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-1">
        <ScoreBar roomId={roomId} state={state} pos={pos} myId={myId} isAway={isAway} />
        <BoardView key={`${state.gameNo}-${state.gameInMatch}`} roomId={roomId} state={state} pos={pos} myId={myId} viewer={viewer} />
        <Spectators state={state} presence={presence} myId={myId} />
      </div>

      <aside className="flex w-full flex-col gap-3 lg:w-72">
        {state.status === "finished" ? (
          <MatchOver roomId={roomId} state={state} myId={myId} />
        ) : state.phase === "gameover" ? (
          <GameOver roomId={roomId} state={state} myId={myId} />
        ) : (
          <TurnPanel roomId={roomId} state={state} myId={myId} />
        )}
        {state.status === "playing" && state.phase !== "gameover" && awaited !== mySeat && isAway(awaitedId) && (
          <button onClick={() => skipAbsent(roomId, state.moveNo)} className={`w-full text-sm ${SECONDARY_BUTTON}`}>
            {seatName(state, awaitedId, myId)} se fue: {state.phase === "double" ? "dar el doble por rechazado" : "pasar su turno"}
          </button>
        )}
        {state.status === "playing" && state.phase !== "gameover" && mySeat && <ResignButton roomId={roomId} myId={myId} cube={state.cube} />}
      </aside>
    </div>
  );
}

function ScoreBar({
  roomId,
  state,
  pos,
  myId,
  isAway,
}: {
  roomId: string;
  state: BgState;
  pos: Position;
  myId: string;
  isAway: (id: string) => boolean;
}) {
  const mySeat = seatOf(state, myId);
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      {SEATS2.map((seat, i) => {
        const id = state.seats[seat];
        const active = state.status === "playing" && state.phase !== "gameover" && state.turn === seat;
        const away = isAway(id);
        return [
          i === 1 && (
            <div key="cube" className="flex flex-col items-center">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-amber-300/70 bg-amber-100 font-display text-lg font-bold text-amber-900 shadow"
                title="Cubo de doblaje"
              >
                {state.cube === 1 ? 64 : state.cube}
              </span>
              <span className="mt-0.5 text-[10px] text-slate-500">
                {state.cubeOwner ? `de ${seatName(state, state.seats[state.cubeOwner], myId)}` : "al centro"}
              </span>
            </div>
          ),
          <div
            key={seat}
            className={`flex items-center gap-2 rounded-xl border bg-slate-900/70 p-2.5 transition ${
              active ? "border-amber-300/70 shadow-[0_0_20px_rgba(252,211,77,0.25)]" : "border-slate-700/50"
            } ${i === 1 ? "flex-row-reverse text-right" : ""}`}
          >
            <Checker seat={seat} className="h-7 w-7" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-100">
                {id ? seatName(state, id, myId) : "—"}
                {away && <span className="font-normal text-slate-500"> (se fue)</span>}
              </p>
              <p className="text-xs text-slate-400">
                {pipCount(pos, seat)} pips · {pos.off[seat]}/15 afuera
              </p>
            </div>
            <span className="font-display text-xl font-bold tabular-nums text-slate-100">
              {state.score[seat]}
              <span className="text-xs font-normal text-slate-500">/{state.matchTo}</span>
            </span>
            {away && !mySeat && (
              <button
                onClick={() => takeSeat(roomId, myId, seat, id)}
                className="rounded-md border border-cyan-400/60 px-2 py-1 text-xs text-cyan-300"
              >
                Tomar
              </button>
            )}
          </div>,
        ];
      })}
    </div>
  );
}

/** Columns of the board from the viewer's side: own coordinates, left to right. */
const TOP = [13, 14, 15, 16, 17, 18, 0, 19, 20, 21, 22, 23, 24];
const BOTTOM = [12, 11, 10, 9, 8, 7, 0, 6, 5, 4, 3, 2, 1];

function BoardView({
  roomId,
  state,
  pos,
  myId,
  viewer,
}: {
  roomId: string;
  state: BgState;
  pos: Position;
  myId: string;
  viewer: Seat;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const mySeat = seatOf(state, myId);
  const myTurn = state.status === "playing" && state.phase === "move" && mySeat === state.turn;
  const steps = myTurn ? currentSteps(state) : [];
  const sources = new Set(steps.map((s) => s.from));
  // With checkers on the bar, the bar is the only source.
  const source = sources.size === 1 && sources.has(BAR) ? BAR : selected !== null && sources.has(selected) ? selected : null;
  // One step per destination: the smallest die that gets there.
  const targets = new Map<number, Step>();
  for (const s of steps) {
    if (s.from !== source) continue;
    const prev = targets.get(s.to);
    if (!prev || s.die < prev.die) targets.set(s.to, s);
  }

  const play = (step: Step) => {
    moveChecker(roomId, myId, step.from, step.die, state.moveNo).catch(console.error);
    setSelected(null);
  };
  const tapPoint = (q: number) => {
    if (!myTurn || !mySeat) return;
    const target = targets.get(q);
    if (target) return play(target);
    if (sources.has(q)) setSelected(q === selected ? null : q);
    else setSelected(null);
  };

  const lastTo = new Set(
    state.moves
      .split(" ")
      .filter(Boolean)
      .map((m) => m.split("/")[1]?.replace("*", ""))
      .filter((t) => t && t !== "afuera")
      .map((t) => pointOf(state.turn, Number(t)))
  );

  const column = (viewerQ: number, top: boolean) => {
    const point = pointOf(viewer, viewerQ);
    const v = pos.points[point - 1];
    const owner: Seat | null = v > 0 ? "a" : v < 0 ? "b" : null;
    const n = Math.abs(v);
    // When I play, the viewer is me: viewer coordinates are mine.
    const q = viewerQ;
    const isSource = myTurn && sources.has(q);
    const isTarget = myTurn && targets.has(q);
    const dark = (viewerQ % 2 === 0) !== top;
    return (
      <button
        key={viewerQ}
        onClick={() => tapPoint(q)}
        disabled={!isSource && !isTarget}
        aria-label={`Punto ${viewerQ}`}
        className={`relative flex h-full min-w-0 flex-col items-center ${top ? "" : "flex-col-reverse"} ${isSource || isTarget ? "cursor-pointer" : "cursor-default"}`}
      >
        <span
          className="absolute inset-x-[6%] h-[88%]"
          style={{
            [top ? "top" : "bottom"]: 0,
            clipPath: top ? "polygon(0 0, 100% 0, 50% 100%)" : "polygon(0 100%, 100% 100%, 50% 0)",
            backgroundColor: isTarget ? "#34d399" : dark ? "#9a3412" : "#e7d3a7",
            opacity: isTarget ? 0.85 : 1,
          }}
        />
        {owner &&
          Array.from({ length: Math.min(n, 5) }, (_, i) => {
            const isTop = i === Math.min(n, 5) - 1;
            const picked = q === source && isTop;
            return (
              <span
                key={i}
                className={`relative z-10 flex aspect-square w-[88%] shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-[inset_0_-2px_0_rgba(0,0,0,0.25),0_1px_2px_rgba(0,0,0,0.5)] transition ${
                  picked ? "ring-[3px] ring-emerald-400" : isTop && isSource ? "ring-2 ring-cyan-300" : ""
                } ${isTop && lastTo.has(point) ? "animate-pop-in" : ""}`}
                style={{ backgroundColor: SEAT_STYLE[owner].fill, borderColor: SEAT_STYLE[owner].ring, color: SEAT_STYLE[owner].text }}
              >
                {isTop && n > 5 ? n : ""}
              </span>
            );
          })}
        <span className={`absolute ${top ? "-top-4" : "-bottom-4"} text-[9px] text-amber-200/50`}>{viewerQ}</span>
      </button>
    );
  };

  const barChecker = (seat: Seat) => {
    const n = pos.bar[seat];
    if (!n) return null;
    const mine = seat === mySeat;
    const isSource = myTurn && mine && sources.has(BAR);
    return (
      <button
        onClick={() => isSource && setSelected(BAR)}
        disabled={!isSource}
        className="flex w-full flex-col items-center gap-0.5"
        aria-label="Barra"
      >
        <span
          className={`flex aspect-square w-[85%] items-center justify-center rounded-full border-2 text-[10px] font-bold ${isSource ? "ring-[3px] ring-emerald-400" : ""}`}
          style={{ backgroundColor: SEAT_STYLE[seat].fill, borderColor: SEAT_STYLE[seat].ring, color: SEAT_STYLE[seat].text }}
        >
          {n > 1 ? n : ""}
        </span>
      </button>
    );
  };

  const rival = otherSeat(viewer);
  const offTarget = myTurn && targets.has(OFF);
  const tray = (seat: Seat, isMine: boolean) => (
    <button
      onClick={() => isMine && offTarget && play(targets.get(OFF)!)}
      disabled={!(isMine && offTarget)}
      className={`flex h-full w-full flex-col items-center gap-[2px] rounded-md p-[2px] ${isMine ? "justify-end" : ""} ${
        isMine && offTarget ? "bg-emerald-400/60 ring-2 ring-emerald-300" : "bg-amber-950/60"
      }`}
      aria-label={isMine ? "Sacar ficha" : "Fichas afuera del rival"}
    >
      {Array.from({ length: pos.off[seat] }, (_, i) => (
        <span key={i} className="h-[4.5%] w-full rounded-sm border" style={{ backgroundColor: SEAT_STYLE[seat].fill, borderColor: SEAT_STYLE[seat].ring }} />
      ))}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="grid aspect-[15/12] grid-cols-[repeat(6,1fr)_0.9fr_repeat(6,1fr)_0.9fr] grid-rows-[1fr_0.35fr_1fr] gap-x-[1px] rounded-xl border-[6px] border-amber-950 bg-[#5b3a1e] px-[1%] py-[3%] shadow-[0_0_35px_rgba(180,83,9,0.25)]">
        {TOP.map((q, i) =>
          q === 0 ? (
            <div key={`bar-top${i}`} className="flex flex-col items-center justify-start bg-amber-950/70 pt-1">
              {barChecker(rival)}
            </div>
          ) : (
            column(q, true)
          )
        )}
        <div className="row-span-1">{tray(rival, false)}</div>

        <div className="col-span-13 flex items-center justify-center gap-2">
          <DiceRow state={state} />
        </div>
        <div />

        {BOTTOM.map((q, i) =>
          q === 0 ? (
            <div key={`bar-bottom${i}`} className="flex flex-col items-center justify-end bg-amber-950/70 pb-1">
              {barChecker(viewer)}
            </div>
          ) : (
            column(q, false)
          )
        )}
        <div>{tray(viewer, !!mySeat)}</div>
      </div>
      {myTurn && (
        <p className="mt-2 text-center text-xs text-slate-500">
          {steps.length === 0
            ? "No te quedan movimientos: tocá «Listo»."
            : source === null
              ? "Tocá una ficha marcada y después a dónde moverla."
              : targets.has(OFF)
                ? "Tocá el verde para moverla (o la bandeja de la derecha para sacarla)."
                : "Tocá un punto verde para moverla."}
        </p>
      )}
    </div>
  );
}

function DiceRow({ state }: { state: BgState }) {
  if (!state.rolled || state.phase === "gameover") return null;
  const rolled = parseDice(state.rolled);
  const remaining = parseDice(state.dice);
  const shown = rolled[0] === rolled[1] && !state.opening ? [rolled[0], rolled[0], rolled[0], rolled[0]] : rolled;
  // Mark as used the dice no longer remaining.
  const left = [...remaining];
  const faces = shown.map((d) => {
    const i = left.indexOf(d);
    if (i >= 0) left.splice(i, 1);
    return { d, used: state.phase === "move" && i < 0 };
  });
  return (
    <>
      {faces.map((f, i) => (
        <DieFace
          key={i}
          value={f.d}
          dim={f.used || state.blocked}
          rollKey={`${state.turn}-${state.rolled}`}
          className="h-7 w-7 rounded-md sm:h-9 sm:w-9"
        />
      ))}
    </>
  );
}

function TurnPanel({ roomId, state, myId }: { roomId: string; state: BgState; myId: string }) {
  const mySeat = seatOf(state, myId);
  const myTurn = mySeat === state.turn;
  const turnName = seatName(state, state.seats[state.turn], myId);
  const rolled = parseDice(state.rolled);
  const steps = currentSteps(state);
  const prev = otherSeat(state.turn);

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-300/30 bg-slate-900/70 p-4 text-center">
      <p className="font-display text-lg font-semibold text-slate-100">
        {state.phase === "double"
          ? mySeat === otherSeat(state.turn)
            ? `¡${turnName} te dobla!`
            : `${turnName} dobló`
          : myTurn
            ? "¡Te toca!"
            : `Juega ${turnName}`}
      </p>

      {state.opening && state.phase === "move" && (
        <p className="text-xs text-slate-400">
          Primera tirada: blancas {rolled[0]}, negras {rolled[1]}. Arranca {turnName} con {rolled[0]}-{rolled[1]}.
        </p>
      )}
      {state.blocked && state.phase === "roll" && (
        <p className="text-xs text-slate-400">
          {seatName(state, state.seats[prev], myId)} sacó {rolled[0]}-{rolled[1]} y no pudo mover.
        </p>
      )}
      {state.moves && state.phase === "move" && <p className="font-mono text-xs text-slate-400">{state.moves}</p>}

      {state.phase === "roll" && myTurn && (
        <div className="flex w-full flex-col gap-2">
          <button onClick={() => rollDice(roomId, myId, state.moveNo)} className={`w-full ${PRIMARY_BUTTON}`}>
            Tirar los dados
          </button>
          {canDouble(state) && (
            <button onClick={() => offerDouble(roomId, myId, state.moveNo)} className={`w-full text-sm ${SECONDARY_BUTTON}`}>
              Doblar la apuesta a {state.cube * 2}
            </button>
          )}
        </div>
      )}

      {state.phase === "double" &&
        (mySeat === otherSeat(state.turn) ? (
          <div className="flex w-full flex-col gap-2">
            <p className="text-sm text-slate-300">Si aceptás, la partida pasa a valer {state.cube * 2} y el cubo queda de tu lado.</p>
            <button onClick={() => answerDouble(roomId, myId, true, state.moveNo)} className={`w-full ${PRIMARY_BUTTON}`}>
              Acepto
            </button>
            <button onClick={() => answerDouble(roomId, myId, false, state.moveNo)} className={`w-full text-sm ${SECONDARY_BUTTON}`}>
              No acepto (pierdo {state.cube})
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Esperando la respuesta…</p>
        ))}

      {state.phase === "move" && myTurn && (
        <div className="flex w-full gap-2">
          <button
            onClick={() => undoTurn(roomId, myId, state.moveNo)}
            disabled={!state.moves}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-700 py-2.5 text-sm text-slate-300 transition hover:text-slate-100 disabled:opacity-40"
          >
            <Undo2 className="h-4 w-4" />
            Deshacer
          </button>
          <button
            onClick={() => endTurn(roomId, myId, state.moveNo)}
            disabled={steps.length > 0}
            className={`flex-1 ${PRIMARY_BUTTON}`}
          >
            Listo
          </button>
        </div>
      )}
    </div>
  );
}

const KIND_TEXT: Record<string, string> = {
  simple: "",
  gammon: "¡Gammon! (el rival no sacó ninguna ficha)",
  backgammon: "¡Backgammon! (el rival quedó en la barra o en su casa)",
  drop: "No aceptó el doble.",
  resign: "Abandonó la partida.",
};

function GameOver({ roomId, state, myId }: { roomId: string; state: BgState; myId: string }) {
  const winner = state.result.winner as Seat;
  const mySeat = seatOf(state, myId);
  const name = seatName(state, state.seats[winner], myId);
  return (
    <div className="animate-celebration-in flex flex-col items-center gap-2 rounded-2xl border border-emerald-500/25 bg-slate-900 p-4 text-center">
      <p className="font-display text-lg font-semibold text-slate-100">
        {winner === mySeat ? "🎉 Ganaste la partida" : `${name} ganó la partida`}: +{state.result.points}
      </p>
      {KIND_TEXT[state.result.kind] && <p className="text-xs text-slate-400">{KIND_TEXT[state.result.kind]}</p>}
      <p className="text-sm text-slate-300">
        {seatName(state, state.seats.a, myId)} {state.score.a} · {seatName(state, state.seats.b, myId)} {state.score.b} (a {state.matchTo})
      </p>
      <button onClick={() => nextGame(roomId, state.gameInMatch)} className={`mt-1 w-full ${PRIMARY_BUTTON}`}>
        Siguiente partida
      </button>
    </div>
  );
}

function MatchOver({ roomId, state, myId }: { roomId: string; state: BgState; myId: string }) {
  const winner = state.result.winner as Seat;
  const mySeat = seatOf(state, myId);
  const name = seatName(state, state.seats[winner], myId);
  return (
    <div className="animate-celebration-in flex flex-col items-center gap-2 rounded-2xl border border-emerald-500/25 bg-slate-900 p-4 text-center shadow-[0_0_40px_rgba(52,211,153,0.2)]">
      <p className="font-display text-xl font-semibold text-slate-100">
        {winner === mySeat ? "🎉 ¡Ganaste el partido!" : `🏆 ¡${name} ganó el partido!`}
      </p>
      {KIND_TEXT[state.result.kind] && <p className="text-xs text-slate-400">{KIND_TEXT[state.result.kind]}</p>}
      <p className="text-sm text-slate-300">
        {state.score.a} a {state.score.b}
      </p>
      <button onClick={() => rematch(roomId, state.gameNo)} className={`mt-1 w-full ${mySeat ? PRIMARY_BUTTON : SECONDARY_BUTTON}`}>
        Revancha (cambian colores)
      </button>
    </div>
  );
}

function ResignButton({ roomId, myId, cube }: { roomId: string; myId: string; cube: number }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <button
      onClick={() => (confirm ? resignGame(roomId, myId) : setConfirm(true))}
      onBlur={() => setConfirm(false)}
      className="mx-auto flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 transition hover:text-slate-200"
    >
      <Flag className="h-4 w-4" />
      {confirm ? `¿Seguro? Perdés ${cube}. Tocá de nuevo` : "Abandonar esta partida"}
    </button>
  );
}
