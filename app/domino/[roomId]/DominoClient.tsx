"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  SEATS,
  SEAT_COLOR,
  activeSeats,
  drawTile,
  ends,
  fits,
  getDominoMeta,
  isDouble,
  joinDomino,
  leaveSeat,
  nextHand,
  partnerOf,
  passTurn,
  pips,
  playForAbsent,
  playTile,
  playable,
  rematch,
  sameSide,
  seatOf,
  splitTiles,
  startDomino,
  subscribeDomino,
  takeSeat,
  type DominoState,
  type Seat,
  type Side,
} from "@/lib/domino";
import type { PresenceMap } from "@/lib/presence";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { BackToRoomButton, RoomSettingsEditor, type RawMeta } from "@/components/RoomSettings";
import { watchRoomMeta } from "@/lib/roomSettings";
import { SETTINGS } from "../settings";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import { useTurnAlert } from "@/hooks/useTurnAlert";
import { Confetti } from "@/components/Results";

type Status = "loading" | "not-found" | "ready" | "error";

export default function DominoClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
  const [state, setState] = useState<DominoState | null>(null);
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

    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getDominoMeta>>>>(
      roomId,
      (meta) => {
        if (cancelled) return;
        setRoomMeta(meta);
        if (!meta) return setStatus("not-found");
        if (meta.game !== "domino") return router.replace(`/sala/${roomId}`);
        setHostId(meta.hostId ?? "");
        unsub ??= subscribeDomino(roomId, setState);
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
    joinDomino(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;

  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="domino"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="domino" />
        )}

        {status === "loading" && <RoomLoading text="Mezclando las fichas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="domino"
              roomId={roomId}
              hostId={hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`Doble seis · a ${state.target} puntos · de 4, en parejas`}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              onStart={() => startDomino(roomId)}
            >
              <SeatPicker roomId={roomId} state={state} myId={myId} isAway={isAway} />
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && state.status !== "waiting" && (
          <Game roomId={roomId} state={state} myId={myId} isAway={isAway} presence={presence} />
        )}

        {status === "ready" && state?.status === "finished" && (
          <div className="flex justify-center px-4 pb-6">
            <BackToRoomButton roomId={roomId} stateKey="domino/state" hostId={hostId} presence={presence} myId={myId} />
          </div>
        )}
      </main>
    </div>
  );
}

function nameOf(state: DominoState, seat: Seat, myId: string): string {
  const id = state.seats[seat];
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
  state: DominoState;
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
              style={{ borderColor: `${SEAT_COLOR[seat]}66` }}
            >
              <span className="h-7 w-7 shrink-0 rounded-lg" style={{ backgroundColor: SEAT_COLOR[seat] }} />
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-slate-500">Pareja {seat === "a" || seat === "c" ? "1" : "2"}</p>
                <p className={`truncate text-sm font-medium ${occupant && !isAway(occupant) ? "text-slate-100" : "text-slate-500"}`}>
                  {occupant ? nameOf(state, seat, myId) : "Libre"}
                  {occupant && isAway(occupant) && " (se fue)"}
                </p>
              </div>
              {occupant !== myId && free && (
                <button
                  onClick={() => takeSeat(roomId, myId, seat, occupant)}
                  className="rounded-md border px-2 py-1 text-xs font-medium"
                  style={{ borderColor: SEAT_COLOR[seat], color: SEAT_COLOR[seat] }}
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
        {seated < 2
          ? "Hacen falta al menos 2 jugadores: mandá el link."
          : seated === 4
            ? "Cuatro jugadores: juegan en parejas (pareja 1 contra pareja 2), sin pozo."
            : `${seated} jugadores, cada uno por su cuenta y con pozo para robar.`}
      </p>
    </div>
  );
}

/** Pip positions (3×3 grid cells) for 0–6. */
const PIP_CELLS: Record<number, number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Half({ n }: { n: number }) {
  return (
    <span className="grid h-full w-full grid-cols-3 grid-rows-3 p-[12%]">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="flex items-center justify-center">
          {PIP_CELLS[n].includes(i) && <span className="block h-[70%] w-[70%] rounded-full bg-slate-900" />}
        </span>
      ))}
    </span>
  );
}

/** A tile: `tile` "36" draws 3 then 6 (left→right or top→bottom). */
function Tile({
  tile,
  vertical = false,
  size = 28,
  className = "",
}: {
  tile: string;
  vertical?: boolean;
  /** Side of one half, in px. */
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 overflow-hidden rounded-[18%] border border-slate-400 bg-[#fdfaf2] shadow-[inset_0_-2px_0_rgba(0,0,0,0.15),0_2px_3px_rgba(0,0,0,0.4)] ${vertical ? "flex-col" : ""} ${className}`}
    >
      <span style={{ width: size, height: size }}>
        <Half n={Number(tile[0])} />
      </span>
      <span className={vertical ? "h-px w-full bg-slate-400" : "h-auto w-px bg-slate-400"} />
      <span style={{ width: size, height: size }}>
        <Half n={Number(tile[1])} />
      </span>
    </span>
  );
}

function TileBack({ size = 14 }: { size?: number }) {
  return <span className="inline-block rounded-sm border border-emerald-950 bg-emerald-800" style={{ width: size, height: size * 2 }} />;
}

function Game({
  roomId,
  state,
  myId,
  isAway,
  presence,
}: {
  roomId: string;
  state: DominoState;
  myId: string;
  isAway: (id: string) => boolean;
  presence: PresenceMap;
}) {
  const mySeat = seatOf(state, myId);
  const myTurn = state.status === "playing" && state.phase === "play" && mySeat === state.turn;
  useTurnAlert(myTurn);
  const canPlay = myTurn ? playable(state, state.turn) : [];
  const [selected, setSelected] = useState<string | null>(null);
  const seats = activeSeats(state);
  const pairs = seats.length === 4;
  const turnId = state.seats[state.turn];

  // Without a tile and with the boneyard empty, the pass is automatic.
  const mustPass = myTurn && canPlay.length === 0 && !state.stock;
  useEffect(() => {
    if (!mustPass) return;
    const t = setTimeout(() => passTurn(roomId, myId, state.moveNo).catch(console.error), 1400);
    return () => clearTimeout(t);
  }, [mustPass, roomId, myId, state.moveNo]);

  const choose = (tile: string) => {
    if (!myTurn || !canPlay.includes(tile)) return;
    const sides = fits(state.line, tile);
    const e = ends(state.line);
    // One way to play it: no need to ask.
    if (sides.length === 1 || !e || e[0] === e[1]) {
      playTile(roomId, myId, tile, sides[0], state.moveNo).catch(console.error);
      setSelected(null);
      return;
    }
    setSelected(tile === selected ? null : tile);
  };
  const playOn = (side: Side) => {
    if (!selected) return;
    playTile(roomId, myId, selected, side, state.moveNo).catch(console.error);
    setSelected(null);
  };
  const chosen = selected && canPlay.includes(selected) ? selected : null;

  // Rivals go around the table starting after me.
  const others = mySeat ? [...seats.slice(seats.indexOf(mySeat) + 1), ...seats.slice(0, seats.indexOf(mySeat))] : seats;
  const sides = pairs ? [["a", "c"], ["b", "d"]] : seats.map((s) => [s]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        {sides.map((side) => {
          const [first] = side as Seat[];
          return (
            <div key={side.join("")} className="flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 py-1.5">
              {side.map((s) => (
                <span key={s} className="h-3 w-3 rounded-sm" style={{ backgroundColor: SEAT_COLOR[s as Seat] }} />
              ))}
              <span className="text-slate-300">{side.map((s) => nameOf(state, s as Seat, myId)).join(" y ")}</span>
              <span className="font-display text-lg font-bold tabular-nums text-slate-100">{state.score[first]}</span>
            </div>
          );
        })}
        <span className="text-xs text-slate-500">a {state.target}</span>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {others.map((seat) => {
          const id = state.seats[seat];
          const n = splitTiles(state.hands[seat]).length;
          const active = state.phase === "play" && state.status === "playing" && state.turn === seat;
          return (
            <div
              key={seat}
              className={`flex min-w-32 flex-col items-center gap-1 rounded-xl border bg-slate-900/70 px-3 py-2 ${active ? "border-amber-300/70 shadow-[0_0_18px_rgba(252,211,77,0.25)]" : "border-slate-700/50"}`}
            >
              <p className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: SEAT_COLOR[seat] }} />
                {nameOf(state, seat, myId)}
                {mySeat && pairs && partnerOf(state, mySeat) === seat && <span className="text-xs text-emerald-300">(compañero)</span>}
                {isAway(id) && <span className="text-xs text-slate-500">(se fue)</span>}
              </p>
              <div className="flex gap-0.5">
                {Array.from({ length: n }, (_, i) => (
                  <TileBack key={i} size={10} />
                ))}
              </div>
              {isAway(id) && !mySeat && (
                <button onClick={() => takeSeat(roomId, myId, seat, id)} className="text-xs text-cyan-300 underline">
                  Tomar su lugar
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="relative flex min-h-48 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border-4 border-emerald-950 bg-[radial-gradient(circle_at_50%_40%,#166534,#052e16)] p-3 shadow-[inset_0_0_40px_rgba(0,0,0,0.5)]">
        {state.line ? (
          <div className="flex flex-wrap items-center justify-center gap-1">
            {chosen && fits(state.line, chosen).includes("l") && <EndButton onClick={() => playOn("l")} label="Acá" />}
            {splitTiles(state.line).map((t, i, all) => {
              const isNew =
                state.last.action === "play" && ((state.last.side === "l" && i === 0) || (state.last.side === "r" && i === all.length - 1) || all.length === 1);
              return <Tile key={`${i}-${t}`} tile={t} vertical={isDouble(t)} size={20} className={isNew ? "animate-pop-in ring-2 ring-amber-300" : ""} />;
            })}
            {chosen && fits(state.line, chosen).includes("r") && <EndButton onClick={() => playOn("r")} label="Acá" />}
          </div>
        ) : (
          <p className="text-sm text-emerald-100/70">
            {state.phase === "play" &&
              (state.mustOpen
                ? `Sale ${nameOf(state, state.opener, myId)} con el ${state.mustOpen[0]}-${state.mustOpen[1]}.`
                : `Sale ${nameOf(state, state.opener, myId)}.`)}
          </p>
        )}
        {state.phase === "play" && state.status === "playing" && (
          <p className="text-xs text-emerald-100/70">
            {lastText(state, myId)}
            {seats.length < 4 && ` · Pozo: ${splitTiles(state.stock).length}`}
          </p>
        )}
        {state.phase === "handover" && <HandOver roomId={roomId} state={state} myId={myId} />}
      </div>

      {mySeat && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/70 p-3">
          <p className="text-sm text-slate-300">
            {state.phase !== "play" || state.status !== "playing"
              ? "Tus fichas"
              : myTurn
                ? mustPass
                  ? "No tenés ficha para jugar: pasás."
                  : canPlay.length === 0
                    ? "No tenés ficha que entre: robá del pozo."
                    : chosen
                      ? "¿De qué lado? Tocá «Acá» en una punta."
                      : "¡Te toca! Tocá una ficha que entre."
                : `Juega ${nameOf(state, state.turn, myId)}…`}
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {splitTiles(state.hands[mySeat]).map((t) => {
              const ok = canPlay.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => choose(t)}
                  disabled={!ok}
                  className={`rounded-md transition ${ok ? "-translate-y-1 cursor-pointer" : myTurn ? "opacity-40" : ""} ${t === chosen ? "-translate-y-2 ring-[3px] ring-emerald-400" : ""}`}
                  aria-label={`Ficha ${t[0]}-${t[1]}`}
                >
                  <Tile tile={t} vertical size={26} />
                </button>
              );
            })}
          </div>
          {myTurn && canPlay.length === 0 && state.stock && (
            <button onClick={() => drawTile(roomId, myId, state.moveNo)} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
              Robar del pozo
            </button>
          )}
        </div>
      )}

      {state.status === "playing" && state.phase === "play" && !myTurn && isAway(turnId) && (
        <button onClick={() => playForAbsent(roomId, state.moveNo)} className={`mx-auto w-full max-w-xs text-sm ${SECONDARY_BUTTON}`}>
          {nameOf(state, state.turn, myId)} se fue: jugar por él
        </button>
      )}

      {Object.keys(presence).some((id) => !seatOf(state, id)) && (
        <p className="text-center text-xs text-slate-500">
          Mirando:{" "}
          {Object.keys(presence)
            .filter((id) => !seatOf(state, id))
            .map((id) => (id === myId ? "vos" : presence[id]?.name))
            .join(", ")}
        </p>
      )}
    </div>
  );
}

function EndButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="animate-pulse rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-400/20 px-2 py-3 text-xs font-semibold text-emerald-100"
    >
      {label}
    </button>
  );
}

function lastText(state: DominoState, myId: string): string {
  const l = state.last;
  if (!l.seat) return "";
  const who = nameOf(state, l.seat, myId);
  if (l.action === "play") return `${who} jugó el ${l.tile[0]}-${l.tile[1]}`;
  if (l.action === "draw") return `${who} robó`;
  return `${who} pasó`;
}

function HandOver({ roomId, state, myId }: { roomId: string; state: DominoState; myId: string }) {
  const mySeat = seatOf(state, myId);
  const seats = activeSeats(state);
  const w = state.result.winner;
  const pairs = seats.length === 4;
  const iWon = !!w && !!mySeat && sameSide(state, w, mySeat);
  const who = w ? (pairs ? `${nameOf(state, w, myId)} y ${nameOf(state, partnerOf(state, w), myId)}` : nameOf(state, w, myId)) : "";
  const title = !w
    ? "Tranque empatado: nadie suma."
    : state.result.blocked
      ? `¡Tranque! ${iWon ? "Ganaron ustedes" : `Gana${pairs ? "n" : ""} ${who}`} con menos puntos`
      : `${iWon ? "🎉 " : ""}¡${who === "Vos" ? "Dominaste" : `Dominó ${who}`}!`;

  return (
    <div className="animate-celebration-in flex w-full max-w-lg flex-col items-center gap-2 rounded-2xl bg-slate-950/80 p-4 text-center">
      <p className="font-display text-lg font-semibold text-slate-100">{state.status === "finished" ? "🏆 " : ""}{title}</p>
      {w && <p className="text-sm text-amber-200">+{state.result.points} puntos</p>}
      <div className="flex w-full flex-col gap-1">
        {seats.map((seat) => {
          const hand = splitTiles(state.hands[seat]);
          return (
            <div key={seat} className="flex items-center gap-2 text-xs text-slate-300">
              <span className="w-20 truncate text-left">{nameOf(state, seat, myId)}</span>
              <div className="flex flex-1 flex-wrap gap-0.5">
                {hand.map((t) => (
                  <Tile key={t} tile={t} size={12} />
                ))}
              </div>
              <span className="font-mono">{hand.reduce((n, t) => n + pips(t), 0)}</span>
            </div>
          );
        })}
      </div>
      {state.status === "finished" ? (
        <>
          <p className="text-sm text-slate-300">
            {iWon && <Confetti />}
            {iWon ? (pairs ? "¡Ganaron el partido!" : "¡Ganaste el partido!") : `Ganó el partido: ${who}`}
          </p>
          <button onClick={() => rematch(roomId, state.gameNo)} className={`w-full ${mySeat ? PRIMARY_BUTTON : SECONDARY_BUTTON}`}>
            Revancha
          </button>
        </>
      ) : (
        <button onClick={() => nextHand(roomId, state.handNo)} className={`w-full ${PRIMARY_BUTTON}`}>
          Siguiente mano
        </button>
      )}
    </div>
  );
}
