"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  FLEET,
  SEAT_COLORS,
  SIZE,
  allSunk,
  fire,
  getNavalMeta,
  isHorizontal,
  isShot,
  isSunk,
  joinNaval,
  leaveSeat,
  otherSeat,
  placeShip,
  randomFleet,
  rematch,
  seatOf,
  shipAt,
  shipCells,
  shotCount,
  startNaval,
  submitFleet,
  subscribeNaval,
  takeSeat,
  unready,
  validFleet,
  type NavalState,
  type Seat,
} from "@/lib/naval";
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
import { RotateCw, Shuffle } from "lucide-react";
import { useTurnAlert } from "@/hooks/useTurnAlert";
import { useSoundOn } from "@/hooks/useSound";

type Status = "loading" | "not-found" | "ready" | "error";

const SEATS: Seat[] = ["a", "b"];

export default function NavalClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [state, setState] = useState<NavalState | null>(null);
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

    getNavalMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "naval") return router.replace(`/sala/${roomId}`);
        setHostId(meta.hostId ?? "");
        unsub = subscribeNaval(roomId, setState);
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
    joinNaval(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;

  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);
  const mySeat = state ? seatOf(state, myId) : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="naval"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="naval" />
        )}

        {status === "loading" && <RoomLoading text="Preparando la flota…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="naval"
              roomId={roomId}
              hostId={hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary="Uno contra uno · mapa de 10 × 10 · cinco barcos"
              onStart={() => startNaval(roomId)}
            >
              <SeatPicker roomId={roomId} state={state} myId={myId} isAway={isAway} />
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && state.status === "placing" && (
          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 p-4">
            <PlayersBar roomId={roomId} state={state} myId={myId} isAway={isAway} />
            {mySeat && !state.ready[mySeat] ? (
              <Placement
                key={state.gameNo}
                initial={validFleet(state.fleets[mySeat]) ? state.fleets[mySeat] : null}
                onReady={(fleet) => submitFleet(roomId, myId, fleet).catch(console.error)}
              />
            ) : (
              <div className={`${CARD} flex flex-col items-center gap-3 text-center`}>
                <p className="font-display text-lg font-semibold text-slate-100">
                  {mySeat ? "¡Flota lista!" : "Los capitanes están ubicando sus barcos…"}
                </p>
                <p className="text-sm text-slate-400">
                  {mySeat
                    ? `Esperando a que ${nameOf(state, state.seats[otherSeat(mySeat)], myId)} ubique la suya.`
                    : "En cuanto los dos estén listos, empieza la batalla."}
                </p>
                {mySeat && (
                  <button onClick={() => unready(roomId, myId)} className={`w-full max-w-xs text-sm ${SECONDARY_BUTTON}`}>
                    Cambiar mi flota
                  </button>
                )}
              </div>
            )}
            <Spectators state={state} presence={presence} myId={myId} />
          </div>
        )}

        {status === "ready" && state && (state.status === "playing" || state.status === "finished") && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
            <PlayersBar roomId={roomId} state={state} myId={myId} isAway={isAway} />
            {state.status === "finished" && <ResultBanner roomId={roomId} state={state} myId={myId} />}
            <Battle roomId={roomId} state={state} myId={myId} />
            <Spectators state={state} presence={presence} myId={myId} />
          </div>
        )}
      </main>
    </div>
  );
}

function nameOf(state: NavalState, id: string, myId: string): string {
  if (id === myId) return "vos";
  return state.players[id]?.name ?? "?";
}

function SeatPicker({
  roomId,
  state,
  myId,
  isAway,
}: {
  roomId: string;
  state: NavalState;
  myId: string;
  isAway: (id: string) => boolean;
}) {
  const mySeat = seatOf(state, myId);
  const ready = state.seats.a && state.seats.b;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {SEATS.map((seat) => {
          const occupant = state.seats[seat];
          const free = !occupant || isAway(occupant);
          const { label, color } = SEAT_COLORS[seat];
          return (
            <div
              key={seat}
              className="flex flex-col items-center gap-2 rounded-xl border bg-slate-950/40 p-3 text-center"
              style={{ borderColor: `${color}55` }}
            >
              <p className="text-xs uppercase tracking-wide" style={{ color }}>
                {label}
              </p>
              <p className={`text-sm font-medium ${occupant && !isAway(occupant) ? "text-slate-100" : "text-slate-500"}`}>
                {occupant ? (occupant === myId ? "Vos" : nameOf(state, occupant, myId)) : "Libre"}
                {occupant && isAway(occupant) && " (se fue)"}
              </p>
              {occupant !== myId && free && (
                <button
                  onClick={() => takeSeat(roomId, myId, seat, occupant)}
                  className="rounded-md border px-3 py-1 text-xs font-medium"
                  style={{ borderColor: color, color }}
                >
                  Capitanear esta
                </button>
              )}
              {occupant === myId && (
                <button onClick={() => leaveSeat(roomId, myId)} className="text-xs text-slate-500 hover:text-slate-300">
                  Prefiero mirar
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-center text-xs text-slate-500">
        {!ready
          ? "Falta un capitán: mandale el link a tu rival."
          : mySeat
            ? "Al empezar, cada uno ubica sus barcos."
            : "Los dos lugares están ocupados: vas a mirar la batalla."}
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
  state: NavalState;
  myId: string;
  isAway: (id: string) => boolean;
}) {
  const mySeat = seatOf(state, myId);
  return (
    <div className="grid grid-cols-2 gap-2">
      {SEATS.map((seat) => {
        const id = state.seats[seat];
        const { color } = SEAT_COLORS[seat];
        const active = state.status === "playing" && state.turn === seat;
        const away = isAway(id);
        const sunk = FLEET.filter((_, i) => isSunk(state.fleets[seat], state.shots[otherSeat(seat)], i)).length;
        const line =
          state.status === "placing"
            ? state.ready[seat]
              ? "Flota lista ✓"
              : "Ubicando barcos…"
            : active
              ? seat === mySeat
                ? "¡Te toca disparar!"
                : "Apuntando…"
              : `${FLEET.length - sunk} de ${FLEET.length} barcos a flote`;
        return (
          <div
            key={seat}
            className={`flex items-center gap-2.5 rounded-xl border bg-slate-900/70 p-3 transition ${
              active || state.status !== "playing" ? "" : "opacity-70"
            }`}
            style={{
              borderColor: active ? color : "#33415580",
              boxShadow: active ? `0 0 20px ${color}66` : undefined,
            }}
          >
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-100">
                {id ? (id === myId ? "Vos" : nameOf(state, id, myId)) : "—"}
                {away && <span className="font-normal text-slate-500"> (se fue)</span>}
              </p>
              <p className="text-xs text-slate-400">
                {line}
                {(state.wins[id] ?? 0) > 0 && ` · ${state.wins[id]} ganadas`}
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

/** A 10×10 map; `cell` draws each square's content and classes. */
function MapGrid({
  cell,
  onCell,
  label,
  small = false,
}: {
  cell: (idx: number) => { className: string; content?: ReactNode; clickable?: boolean };
  onCell?: (idx: number) => void;
  label: ReactNode;
  small?: boolean;
}) {
  return (
    <div className={`flex w-full flex-col gap-1.5 ${small ? "max-w-[17rem]" : "max-w-md"}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div
        className="grid gap-[2px] rounded-xl bg-sky-950 p-1.5 ring-1 ring-sky-500/30 shadow-[0_0_25px_rgba(14,165,233,0.15)]"
        style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: SIZE * SIZE }, (_, idx) => {
          const c = cell(idx);
          return (
            <button
              key={idx}
              onClick={() => onCell?.(idx)}
              disabled={!c.clickable}
              aria-label={`${String.fromCharCode(65 + Math.floor(idx / SIZE))}${(idx % SIZE) + 1}`}
              className={`relative flex aspect-square items-center justify-center rounded-[3px] text-[10px] ${c.className} ${
                c.clickable ? "cursor-pointer" : "cursor-default"
              }`}
            >
              {c.content}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const MISS_DOT = <span className="h-1.5 w-1.5 rounded-full bg-sky-200/70" />;
const HIT_MARK = <span className="font-bold leading-none text-white">✕</span>;

function Placement({ initial, onReady }: { initial: string | null; onReady: (fleet: string) => void }) {
  const [fleet, setFleet] = useState<string>(() => initial ?? randomFleet());
  const [selected, setSelected] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  /** Moves the selected ship so it starts at `idx`, nudged back inside the map if it sticks out. */
  const moveTo = (idx: number, horizontal: boolean) => {
    if (selected === null) return false;
    const len = FLEET[selected].len;
    let r = Math.floor(idx / SIZE);
    let c = idx % SIZE;
    if (horizontal) c = Math.min(c, SIZE - len);
    else r = Math.min(r, SIZE - len);
    const next = placeShip(fleet, selected, r * SIZE + c, horizontal);
    if (!next) return false;
    setFleet(next);
    return true;
  };

  const tap = (idx: number) => {
    setProblem(null);
    const ship = shipAt(fleet, idx);
    if (ship >= 0) return setSelected(ship === selected ? null : ship);
    if (selected === null) return;
    if (!moveTo(idx, isHorizontal(fleet, selected))) setProblem("Ahí no entra: choca con otro barco.");
  };

  const rotate = () => {
    if (selected === null) return;
    setProblem(null);
    if (!moveTo(shipCells(fleet, selected)[0], !isHorizontal(fleet, selected))) {
      setProblem("No hay lugar para girarlo ahí. Movelo primero.");
    }
  };

  return (
    <div className={`${CARD} flex flex-col items-center gap-3`}>
      <div className="text-center">
        <p className="font-display text-lg font-semibold text-slate-100">Ubicá tu flota</p>
        <p className="text-sm text-slate-400">
          {selected === null
            ? "Tocá un barco para elegirlo, o mezclalos al azar."
            : `${FLEET[selected].name}: tocá el agua para moverlo o giralo.`}
        </p>
      </div>
      <MapGrid
        label="Tu mapa"
        onCell={tap}
        cell={(idx) => {
          const ship = shipAt(fleet, idx);
          return {
            clickable: true,
            className:
              ship < 0
                ? "bg-sky-900/60 hover:bg-sky-800/70"
                : ship === selected
                  ? "bg-fuchsia-400 shadow-[0_0_10px_rgba(232,121,249,0.6)]"
                  : "bg-slate-300 hover:bg-white",
          };
        }}
      />
      {problem && <p className="text-xs text-amber-300">{problem}</p>}
      <div className="flex w-full max-w-md flex-wrap justify-center gap-1.5 text-xs">
        {FLEET.map((s, i) => (
          <button
            key={s.name}
            onClick={() => setSelected(i === selected ? null : i)}
            className={`rounded-full px-2.5 py-1 ring-1 transition ${
              i === selected ? "bg-fuchsia-500/20 text-fuchsia-200 ring-fuchsia-400" : "text-slate-400 ring-slate-700"
            }`}
          >
            {s.name} ({s.len})
          </button>
        ))}
      </div>
      <div className="grid w-full max-w-md grid-cols-2 gap-2">
        <button
          onClick={rotate}
          disabled={selected === null}
          className={`flex items-center justify-center gap-1.5 text-sm ${SECONDARY_BUTTON}`}
        >
          <RotateCw className="h-4 w-4" /> Girar
        </button>
        <button
          onClick={() => {
            setFleet(randomFleet());
            setSelected(null);
            setProblem(null);
          }}
          className={`flex items-center justify-center gap-1.5 text-sm ${SECONDARY_BUTTON}`}
        >
          <Shuffle className="h-4 w-4" /> Mezclar
        </button>
      </div>
      <button onClick={() => onReady(fleet)} className={`w-full max-w-md ${PRIMARY_BUTTON}`}>
        ¡Listo!
      </button>
    </div>
  );
}

/**
 * One seat's map as seen by the viewer: their own ships if `showShips`,
 * otherwise only sunk ones; plus every shot the rival fired on it.
 */
function seatMapCell(state: NavalState, seat: Seat, idx: number, showShips: boolean) {
  const fleet = state.fleets[seat];
  const shots = state.shots[otherSeat(seat)];
  const ship = shipAt(fleet, idx);
  const shot = isShot(shots, idx);
  const sunk = ship >= 0 && isSunk(fleet, shots, ship);
  const last = state.lastShot.by === otherSeat(seat) && state.lastShot.idx === idx;
  const ring = last ? " ring-2 ring-amber-300 z-10" : "";
  const anim = last ? "animate-splash" : "";
  if (shot && ship >= 0) {
    return {
      className: (sunk ? "bg-rose-900" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]") + ring,
      content: <span className={anim}>{HIT_MARK}</span>,
    };
  }
  if (shot) return { className: "bg-sky-900/40" + ring, content: <span className={anim}>{MISS_DOT}</span> };
  if (ship >= 0 && showShips) return { className: "bg-slate-400/80" };
  return { className: "bg-sky-900/60" };
}

function Battle({ roomId, state, myId }: { roomId: string; state: NavalState; myId: string }) {
  const mySeat = seatOf(state, myId);
  const over = state.status === "finished";
  useTurnAlert(state.status === "playing" && !!mySeat && state.turn === mySeat);
  const shot = state.lastShot;
  const hit = !!shot.by && state.fleets[otherSeat(shot.by)][shot.idx] !== ".";
  useSoundOn(shot.by ? `${shot.by}${shot.idx}` : null, hit ? "capture" : "place");

  if (!mySeat) {
    return (
      <div className="flex flex-col items-center gap-4 md:flex-row md:items-start md:justify-center">
        {SEATS.map((seat) => (
          <MapGrid
            key={seat}
            label={
              <span style={{ color: SEAT_COLORS[seat].color }}>
                Mapa de {nameOf(state, state.seats[seat], myId)}
              </span>
            }
            cell={(idx) => seatMapCell(state, seat, idx, over)}
          />
        ))}
      </div>
    );
  }

  const rival = otherSeat(mySeat);
  const myTurn = state.status === "playing" && state.turn === mySeat;
  const myShots = state.shots[mySeat];
  const enemyFleet = state.fleets[rival];

  return (
    <div className="flex flex-col items-center gap-5 md:flex-row md:items-start md:justify-center">
      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <MapGrid
          label={
            <span className={myTurn ? "text-fuchsia-300" : ""}>
              {myTurn ? "¡Disparale! Mapa de " : "Mapa de "}
              {nameOf(state, state.seats[rival], myId)}
            </span>
          }
          onCell={(idx) => fire(roomId, myId, idx, shotCount(myShots)).catch(console.error)}
          cell={(idx) => {
            const base = seatMapCell(state, rival, idx, over);
            const open = myTurn && !isShot(myShots, idx);
            return {
              ...base,
              clickable: open,
              className: base.className + (open ? " hover:bg-fuchsia-500/40" : ""),
            };
          }}
        />
        <SunkList fleet={enemyFleet} shots={myShots} />
      </div>
      <div className="flex w-full flex-col items-center gap-2 md:w-auto">
        <MapGrid small label="Tu flota" cell={(idx) => seatMapCell(state, mySeat, idx, true)} />
        {allSunk(state.fleets[mySeat], state.shots[rival]) && <p className="text-xs text-rose-300">Hundieron toda tu flota.</p>}
      </div>
    </div>
  );
}

function SunkList({ fleet, shots }: { fleet: string; shots: string }) {
  return (
    <ul className="flex flex-wrap justify-center gap-1.5 text-xs">
      {FLEET.map((s, i) => {
        const sunk = isSunk(fleet, shots, i);
        return (
          <li
            key={s.name}
            className={`rounded-full px-2 py-0.5 ring-1 ${sunk ? "text-rose-300 line-through ring-rose-500/40" : "text-slate-400 ring-slate-700"}`}
          >
            {s.name} ({s.len})
          </li>
        );
      })}
    </ul>
  );
}

function ResultBanner({ roomId, state, myId }: { roomId: string; state: NavalState; myId: string }) {
  const mySeat = seatOf(state, myId);
  const winner = state.winner || null;
  const iWon = !!winner && winner === mySeat;
  const winnerName = winner ? nameOf(state, state.seats[winner], myId) : "";
  const title = iWon ? "🎉 ¡Hundiste toda su flota!" : mySeat ? `🌊 Ganó ${winnerName}` : `🏆 ¡Ganó ${winnerName}!`;
  return (
    <div
      className={`animate-celebration-in flex flex-col items-center gap-3 rounded-2xl border bg-slate-900 p-4 text-center ${
        iWon ? "border-emerald-500/25 shadow-[0_0_40px_rgba(52,211,153,0.2)]" : "border-violet-500/20"
      }`}
    >
      <p className="font-display text-xl font-semibold text-slate-100">{title}</p>
      <p className="text-xs text-slate-500">Ahora se ven los barcos de los dos.</p>
      <button
        onClick={() => rematch(roomId, state.gameNo)}
        className={`w-full max-w-xs ${mySeat ? PRIMARY_BUTTON : SECONDARY_BUTTON}`}
      >
        Revancha
      </button>
    </div>
  );
}

function Spectators({ state, presence, myId }: { state: NavalState; presence: PresenceMap; myId: string }) {
  const watching = Object.keys(presence).filter((id) => !seatOf(state, id));
  if (watching.length === 0) return null;
  return (
    <p className="text-center text-xs text-slate-500">
      Mirando: {watching.map((id) => (id === myId ? "vos" : (presence[id]?.name ?? "?"))).join(", ")}
    </p>
  );
}
