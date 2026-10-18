"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  RULES_LABEL,
  SEATS,
  SEAT_INFO,
  activeSeats,
  currentMoves,
  getLudoMeta,
  isBonus,
  joinLudo,
  leaveSeat,
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
import { GEOMETRY, RULES, tokenCenter, type LudoMove } from "@/lib/ludoRules";
import type { PresenceMap } from "@/lib/presence";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import DieFace from "@/components/DieFace";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { BackToRoomButton, RoomSettingsEditor, type RawMeta } from "@/components/RoomSettings";
import { watchRoomMeta } from "@/lib/roomSettings";
import { SETTINGS } from "../settings";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";

type Status = "loading" | "not-found" | "ready" | "error";

export default function LudoClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
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

    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getLudoMeta>>>>(
      roomId,
      (meta) => {
        if (cancelled) return;
        setRoomMeta(meta);
        if (!meta) return setStatus("not-found");
        if (meta.game !== "ludo") return router.replace(`/sala/${roomId}`);
        setHostId(meta.hostId ?? "");
        unsub ??= subscribeLudo(roomId, setState);
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
              summary={`${RULES_LABEL[state.rules]} · de 2 a 4 · los demás miran`}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              onStart={() => startLudo(roomId)}
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
            <BackToRoomButton roomId={roomId} stateKey="ludo/state" hostId={hostId} presence={presence} myId={myId} />
          </div>
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

/** What the player in turn has to do, in a line. */
function moveHint(state: LudoState, moves: LudoMove[]): string {
  if (isBonus(state)) {
    return state.last.captured
      ? `¡Comiste! Contá ${state.steps} con la ficha que quieras.`
      : `¡Llegaste! Contá ${state.steps} con otra ficha.`;
  }
  if (state.rules === "parchis") {
    if (state.steps === RULES.parchis.exitRoll && moves.every((m) => m.from < 0)) return "Con un 5 sacás una ficha: es obligatorio.";
    const mine = parseTokens(state.tokens[state.turn]);
    const opening = moves.every((m) => mine.some((p, j) => j !== m.token && p === m.from && p >= 0));
    if ((state.steps === 6 || state.steps === 7) && opening) return "Con un 6 tenés que abrir tu barrera.";
  }
  return "Tocá una ficha que titila.";
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
  const moves = myTurn ? currentMoves(state) : [];
  const active = activeSeats(state);
  const turnPlayer = state.seats[state.turn];
  const goal = RULES[state.rules].goal;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-3 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-col items-center gap-3 lg:flex-1">
        <Board state={state} moves={moves} onMove={(t) => moveToken(roomId, myId, t, state.moveNo)} />
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
            <div className="flex items-center gap-3">
              <DieFace value={state.die} glow={SEAT_INFO[state.turn].color} rollKey={state.moveNo} />
              {state.phase === "move" && state.steps !== state.die && (
                <span className="rounded-lg bg-amber-400/15 px-2.5 py-1 text-sm font-semibold text-amber-200">
                  Cuenta {state.steps}
                </span>
              )}
            </div>
            {myTurn && state.phase === "roll" && (
              <>
                {state.sixes > 0 && <p className="text-sm text-amber-200">Sacaste 6: ¡tirá de nuevo!</p>}
                <button onClick={() => rollDie(roomId, myId, state.moveNo)} className={`w-full ${PRIMARY_BUTTON}`}>
                  Tirar el dado
                </button>
              </>
            )}
            {myTurn && state.phase === "move" && <p className="text-sm text-slate-300">{moveHint(state, moves)}</p>}
            {!myTurn && isAway(turnPlayer) && (
              <button onClick={() => skipTurn(roomId, state.moveNo)} className={`w-full text-sm ${SECONDARY_BUTTON}`}>
                Se fue: pasar el turno
              </button>
            )}
            <LastMoveLine state={state} myId={myId} />
          </div>
        )}

        <div className="flex flex-col gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
          {active.map((seat) => {
            const id = state.seats[seat];
            const home = parseTokens(state.tokens[seat]).filter((p) => p === goal).length;
            return (
              <div key={seat} className="flex items-center gap-2 text-sm">
                <span className="h-4 w-4 rounded-full" style={{ backgroundColor: SEAT_INFO[seat].color }} />
                <span className={`flex-1 truncate ${isAway(id) ? "text-slate-500" : "text-slate-200"}`}>
                  {playerName(state, id, myId)}
                  {isAway(id) && " (se fue)"}
                </span>
                {(state.wins[id] ?? 0) > 0 && <span className="text-xs text-slate-500">🏆 {state.wins[id]}</span>}
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

        {state.rules === "parchis" && (
          <details className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
            <summary className="cursor-pointer text-sm font-medium text-slate-300">Reglas del parchís</summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>Con un 5 sacás una ficha (si podés, es obligatorio).</li>
              <li>Con un 6 volvés a tirar; si no te quedan fichas en casa, cuenta 7. Tres 6 seguidos: la última ficha que moviste vuelve a casa.</li>
              <li>Dos fichas del mismo color forman una barrera: nadie puede pasar. Con un 6 tenés que abrirla.</li>
              <li>En las casillas con círculo (seguros y salidas) no se come. Si comés, contás 20; si llegás a la meta, contás 10.</li>
              <li>Para entrar a la meta hace falta el número justo.</li>
            </ul>
          </details>
        )}
      </aside>
    </div>
  );
}

function LastMoveLine({ state, myId }: { state: LudoState; myId: string }) {
  const l = state.last;
  if (!l.seat) return null;
  const who = playerName(state, state.seats[l.seat], myId);
  const goal = RULES[state.rules].goal;
  let what: string;
  if (l.punished) what = l.token >= 0 ? "sacó tres 6: su ficha vuelve a casa 😱" : "sacó tres 6 y pierde el turno";
  else if (l.token < 0) what = `sacó ${state.die} y no pudo mover`;
  else if (l.bonus) what = `contó ${l.bonus}`;
  else if (l.from < 0) what = "sacó una ficha";
  else if (l.to === goal) what = "¡metió una ficha!";
  else what = `avanzó ${l.to - l.from}`;
  return (
    <p className="text-xs text-slate-400">
      {who} {what}
      {l.captured && " y se comió una 😈"}
    </p>
  );
}

function Board({ state, moves, onMove }: { state: LudoState; moves: LudoMove[]; onMove: (token: number) => void }) {
  const g = GEOMETRY[state.rules];
  const r = RULES[state.rules];
  const cell = 100 / g.size;
  const box = (row: number, col: number, w = 1, h = w) => ({
    top: `${row * cell}%`,
    left: `${col * cell}%`,
    width: `${w * cell}%`,
    height: `${h * cell}%`,
  });
  const active = activeSeats(state);
  const movable = new Set(moves.map((m) => m.token));
  // Hovering a movable token (with a mouse) marks where it would land.
  const [hover, setHover] = useState<number | null>(null);
  const hovered = moves.find((m) => m.token === hover);
  const tokens = active.flatMap((seat) =>
    parseTokens(state.tokens[seat]).map((p, i) => ({ seat, p, i, at: tokenCenter(state.rules, seat, p, i) }))
  );
  // Tokens sharing a square are drawn side by side.
  const counts = new Map<string, number>();
  for (const t of tokens) {
    if (t.p < 0 || t.p >= r.goal) continue;
    const k = `${t.at[0]},${t.at[1]}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const placed = new Map<string, number>();
  const exitOf = new Map(SEATS.map((s) => [r.starts[s], s]));
  const lastSquare =
    state.last.seat && state.last.token >= 0 && state.last.to >= 0
      ? tokenCenter(state.rules, state.last.seat, state.last.to, state.last.token)
      : null;

  return (
    <div className="relative aspect-square w-full max-w-[min(94vw,640px)] overflow-hidden rounded-2xl bg-slate-100 shadow-[0_0_35px_rgba(139,92,246,0.25)] ring-2 ring-slate-700">
      {SEATS.map((seat) => {
        const [r0, c0] = g.bases[seat];
        const spots = [0, 1, 2, 3].map((t) => tokenCenter(state.rules, seat, -1, t));
        return (
          <div key={seat} className="absolute p-[1.2%]" style={{ ...box(r0, c0, g.baseSize), backgroundColor: SEAT_INFO[seat].color }}>
            <div className="h-full w-full rounded-xl bg-white/85" />
            {spots.map(([y, x], i) => (
              <span
                key={i}
                className="absolute rounded-full border-2"
                style={{
                  borderColor: `${SEAT_INFO[seat].color}88`,
                  top: `${((y - r0 - 0.42) / g.baseSize) * 100}%`,
                  left: `${((x - c0 - 0.42) / g.baseSize) * 100}%`,
                  width: `${(0.84 / g.baseSize) * 100}%`,
                  height: `${(0.84 / g.baseSize) * 100}%`,
                }}
              />
            ))}
          </div>
        );
      })}

      {g.track.map(([row, col], i) => {
        const exit = exitOf.get(i);
        const safe = r.safe.has(i);
        return (
          <div
            key={i}
            className="absolute flex items-center justify-center border border-slate-300 text-[9px] text-slate-400 sm:text-xs"
            style={{ ...box(row, col), backgroundColor: exit ? SEAT_INFO[exit].color : safe && state.rules === "parchis" ? "#e2e8f0" : "#fff" }}
          >
            {safe && !exit && (state.rules === "ludo" ? "★" : <span className="h-[45%] w-[45%] rounded-full border-2 border-slate-400" />)}
          </div>
        );
      })}

      {SEATS.map((seat) =>
        g.lanes[seat].map(([row, col], i) => (
          <div key={`${seat}${i}`} className="absolute border border-slate-300" style={{ ...box(row, col), backgroundColor: SEAT_INFO[seat].light }} />
        ))
      )}

      <div
        className="absolute"
        style={{
          ...box(g.center[0], g.center[1], g.centerSize),
          background: `conic-gradient(from -45deg, ${SEAT_INFO.b.color} 0 25%, ${SEAT_INFO.c.color} 0 50%, ${SEAT_INFO.d.color} 0 75%, ${SEAT_INFO.a.color} 0)`,
        }}
      />

      {lastSquare && (
        <span
          className="pointer-events-none absolute rounded-md ring-2 ring-amber-400/80"
          style={box(lastSquare[0] - 0.5, lastSquare[1] - 0.5)}
        />
      )}
      {hovered && hovered.to < r.goal && (
        <DestinationMark at={tokenCenter(state.rules, state.turn, hovered.to, hovered.token)} box={box} color={SEAT_INFO[state.turn].color} />
      )}

      {tokens.map(({ seat, p, i, at }) => {
        const k = `${at[0]},${at[1]}`;
        const n = placed.get(k) ?? 0;
        placed.set(k, n + 1);
        const count = counts.get(k) ?? 1;
        const canMove = seat === state.turn && movable.has(i);
        const inGoal = p >= r.goal;
        const size = inGoal && state.rules === "parchis" ? 0.6 : count > 1 ? Math.max(0.45, 0.9 / count) : 0.8;
        const dx = count > 1 ? (n - (count - 1) / 2) * size * 0.85 : inGoal && state.rules === "ludo" ? (i - 1.5) * 0.12 : 0;
        const dy = 0;
        return (
          <button
            key={`${seat}${i}`}
            onClick={() => canMove && onMove(i)}
            onMouseEnter={() => canMove && setHover(i)}
            onMouseLeave={() => setHover(null)}
            disabled={!canMove}
            aria-label={`Ficha ${SEAT_INFO[seat].label} ${i + 1}`}
            className="absolute flex items-center justify-center transition-[top,left,width,height] duration-300 ease-out"
            style={{ ...box(at[0] + dy - size / 2, at[1] + dx - size / 2, size), zIndex: canMove ? 20 : 10 + n }}
          >
            <span
              className={`block h-full w-full rounded-full border-2 border-white ${canMove ? "scale-110 ring-[3px] ring-slate-950 outline-2 outline-white animate-bounce" : ""}`}
              style={{ backgroundColor: SEAT_INFO[seat].color, boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.4)" }}
            />
          </button>
        );
      })}
    </div>
  );
}

function DestinationMark({
  at,
  box,
  color,
}: {
  at: [number, number];
  box: (row: number, col: number, w?: number) => Record<string, string>;
  color: string;
}) {
  return (
    <span
      className="pointer-events-none absolute z-30 animate-pulse rounded-full border-[3px] border-dashed"
      style={{ ...box(at[0] - 0.4, at[1] - 0.4, 0.8), borderColor: color }}
    />
  );
}
