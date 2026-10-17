"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  ENVIDO_LABEL,
  SEATS,
  TRUCO_LABEL,
  activeSeats,
  answer,
  answeringTeam,
  canRaiseEnvido,
  canSingEnvido,
  canSingTruco,
  envidoOf,
  getTrucoMeta,
  goToDeck,
  inHand,
  joinTruco,
  leaveSeat,
  nextHand,
  pendingSong,
  playCard,
  playForAbsent,
  playedIn,
  rematch,
  scoreOf,
  seatOf,
  singEnvido,
  singTruco,
  startTruco,
  subscribeTruco,
  takeSeat,
  teamOf,
  type EnvidoCall,
  type Seat,
  type Team,
  type TrucoState,
} from "@/lib/truco";
import { splitCards } from "@/lib/baraja";
import type { PresenceMap } from "@/lib/presence";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import Naipe from "@/components/Naipe";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";

type Status = "loading" | "not-found" | "ready" | "error";

const TEAM_COLOR: Record<Team, string> = { 0: "#22d3ee", 1: "#f472b6" };
const ENVIDO_CALLS: EnvidoCall[] = ["E", "R", "F"];

export default function TrucoClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [state, setState] = useState<TrucoState | null>(null);
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

    getTrucoMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "truco") return router.replace(`/sala/${roomId}`);
        setHostId(meta.hostId ?? "");
        unsub = subscribeTruco(roomId, setState);
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
    joinTruco(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;

  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="truco"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="truco" />
        )}

        {status === "loading" && <RoomLoading text="Mezclando el mazo…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="truco"
              roomId={roomId}
              hostId={hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`A ${state.target} puntos · sin flor`}
              onStart={() => startTruco(roomId)}
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

function playerName(state: TrucoState, seat: Seat, myId: string): string {
  const id = state.seats[seat];
  if (id === myId) return "Vos";
  return state.players[id]?.name ?? "?";
}

/** "Nosotros"/"Ellos" from my point of view; team names for spectators. */
function teamName(team: Team, mine: Team | null): string {
  if (mine === null) return team === 0 ? "Equipo celeste" : "Equipo rosa";
  return team === mine ? "Nosotros" : "Ellos";
}

function SeatPicker({
  roomId,
  state,
  myId,
  isAway,
}: {
  roomId: string;
  state: TrucoState;
  myId: string;
  isAway: (id: string) => boolean;
}) {
  const filled = SEATS.filter((s) => state.seats[s]).length;
  const ok = filled === 4 || (filled === 2 && state.seats.a && state.seats.b);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-center text-xs text-slate-500">
        Uno contra uno: asientos 1 y 2. Dos contra dos: los cuatro (1 y 3 son compañeros, 2 y 4 también).
      </p>
      <div className="grid grid-cols-2 gap-2">
        {SEATS.map((seat, i) => {
          const occupant = state.seats[seat];
          const free = !occupant || isAway(occupant);
          const team = teamOf(seat);
          return (
            <div
              key={seat}
              className="flex items-center gap-2 rounded-xl border bg-slate-950/40 p-3"
              style={{ borderColor: `${TEAM_COLOR[team]}66` }}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-slate-900" style={{ backgroundColor: TEAM_COLOR[team] }}>
                {i + 1}
              </span>
              <p className={`min-w-0 flex-1 truncate text-sm ${occupant && !isAway(occupant) ? "text-slate-100" : "text-slate-500"}`}>
                {occupant ? playerName(state, seat, myId) : "Libre"}
                {occupant && isAway(occupant) && " (se fue)"}
              </p>
              {occupant !== myId && free && (
                <button
                  onClick={() => takeSeat(roomId, myId, seat, occupant)}
                  className="rounded-md border border-cyan-400/60 px-2 py-1 text-xs text-cyan-300"
                >
                  Sentarme
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
      <p className={`text-center text-xs ${ok ? "text-emerald-300" : "text-amber-300/90"}`}>
        {ok ? (filled === 4 ? "Listos para un dos contra dos." : "Listos para un mano a mano.") : "Hacen falta 2 jugadores (asientos 1 y 2) o 4."}
      </p>
    </div>
  );
}

/** Seats around the table from my point of view: me at the bottom. */
function tableLayout(state: TrucoState, mySeat: Seat | null): { bottom: Seat; top: Seat; left?: Seat; right?: Seat } {
  const seats = activeSeats(state);
  const base = mySeat && seats.includes(mySeat) ? mySeat : seats[0];
  const at = (k: number) => seats[(seats.indexOf(base) + k) % seats.length];
  if (seats.length === 2) return { bottom: base, top: at(1) };
  return { bottom: base, right: at(1), top: at(2), left: at(3) };
}

function Game({
  roomId,
  state,
  myId,
  isAway,
  presence,
}: {
  roomId: string;
  state: TrucoState;
  myId: string;
  isAway: (id: string) => boolean;
  presence: PresenceMap;
}) {
  const mySeat = seatOf(state, myId);
  const playing = !!mySeat && state.active.includes(mySeat);
  const myTeam = playing ? teamOf(mySeat!) : null;
  const layout = tableLayout(state, mySeat);
  const pending = pendingSong(state);
  const answering = answeringTeam(state);
  const iAnswer = playing && pending && answering === myTeam;
  const myTurn = playing && state.status === "playing" && state.turn === mySeat && !pending;
  const hand = playing ? inHand(state, mySeat!) : [];
  const myEnvido = playing ? envidoOf(splitCards(state.hands[mySeat!])) : 0;
  const mv = state.moveNo;

  // Someone needed isn't here: the turn's player, or the whole answering team.
  const waitingOnAbsent =
    state.status === "playing" &&
    (pending
      ? activeSeats(state).filter((x) => teamOf(x) === answering).every((x) => isAway(state.seats[x]))
      : isAway(state.seats[state.turn]));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 p-3 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-1">
        <div className="relative rounded-3xl border-4 border-amber-900/60 bg-gradient-to-br from-emerald-800 to-emerald-950 p-3 shadow-[inset_0_0_40px_rgba(0,0,0,0.5)]">
          <div className="grid grid-cols-[1fr_auto_1fr] grid-rows-[auto_auto_auto] items-center gap-2">
            <div className="col-start-2 row-start-1">
              <SeatSpot state={state} seat={layout.top} myId={myId} isAway={isAway} />
            </div>
            {layout.left && (
              <div className="col-start-1 row-start-2 justify-self-start">
                <SeatSpot state={state} seat={layout.left} myId={myId} isAway={isAway} side />
              </div>
            )}
            <div className="col-start-2 row-start-2 flex min-h-24 flex-col items-center justify-center gap-1">
              {pending && <SongBanner state={state} myId={myId} />}
              {!pending && state.status === "playing" && (
                <p className="text-center text-sm text-emerald-100/80">
                  {myTurn ? "¡Te toca!" : `Juega ${playerName(state, state.turn, myId)}`}
                </p>
              )}
            </div>
            {layout.right && (
              <div className="col-start-3 row-start-2 justify-self-end">
                <SeatSpot state={state} seat={layout.right} myId={myId} isAway={isAway} side />
              </div>
            )}
            <div className="col-start-2 row-start-3">
              <SeatSpot state={state} seat={layout.bottom} myId={myId} isAway={isAway} />
            </div>
          </div>
        </div>

        {state.status === "playing" && playing && (
          <div className="flex flex-col items-center gap-3">
            <div className="flex gap-2">
              {hand.map((c) => (
                <Naipe key={c} code={c} size="lg" onClick={myTurn ? () => playCard(roomId, myId, c, mv) : undefined} />
              ))}
            </div>
            <p className="text-xs text-slate-400">Tenés {myEnvido} de envido.</p>

            {iAnswer && <AnswerBar roomId={roomId} state={state} myId={myId} mySeat={mySeat!} />}

            {!pending && (
              <div className="flex flex-wrap justify-center gap-2">
                {canSingEnvido(state, mySeat!) &&
                  ENVIDO_CALLS.map((c) => (
                    <button key={c} onClick={() => singEnvido(roomId, myId, c, mv)} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500">
                      {ENVIDO_LABEL[c]}
                    </button>
                  ))}
                {canSingTruco(state, mySeat!) && (
                  <button onClick={() => singTruco(roomId, myId, mv)} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-500">
                    {TRUCO_LABEL[state.trucoLevel + 1]}
                  </button>
                )}
                <button
                  onClick={() => goToDeck(roomId, myId, mv)}
                  className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
                >
                  Irme al mazo
                </button>
              </div>
            )}
          </div>
        )}

        {waitingOnAbsent && (
          <button onClick={() => playForAbsent(roomId, mv)} className={`mx-auto w-full max-w-xs text-sm ${SECONDARY_BUTTON}`}>
            {pending ? "No hay quién conteste: “no quiero”" : `${playerName(state, state.turn, myId)} se fue: jugar por él/ella`}
          </button>
        )}

        {(state.status === "handEnd" || state.status === "finished") && (
          <HandSummary roomId={roomId} state={state} myId={myId} myTeam={myTeam} />
        )}
      </div>

      <aside className="flex w-full flex-col gap-3 lg:w-72">
        <Score state={state} myTeam={myTeam} myId={myId} />
        {state.envidoResult.winner && (
          <p className="rounded-xl bg-slate-900/60 p-3 text-center text-sm text-slate-300">
            Envido:{" "}
            {state.envidoResult.accepted
              ? `${teamName(0, myTeam)} ${state.envidoResult.v0} – ${teamName(1, myTeam)} ${state.envidoResult.v1}. `
              : "no quisieron. "}
            +{state.envidoResult.points} para {teamName(Number(state.envidoResult.winner) as Team, myTeam).toLowerCase()}.
          </p>
        )}
        {state.log && (
          <ul className="flex flex-col gap-0.5 rounded-xl bg-slate-900/60 p-3 text-xs text-slate-400">
            {state.log.split("\n").map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
        {Object.keys(presence).some((id) => !seatOf(state, id) || !state.active.includes(seatOf(state, id)!)) && (
          <p className="text-center text-xs text-slate-500">
            Mirando:{" "}
            {Object.keys(presence)
              .filter((id) => !seatOf(state, id) || !state.active.includes(seatOf(state, id)!))
              .map((id) => (id === myId ? "vos" : presence[id]?.name))
              .join(", ")}
          </p>
        )}
      </aside>
    </div>
  );
}

function SeatSpot({
  state,
  seat,
  myId,
  isAway,
  side = false,
}: {
  state: TrucoState;
  seat: Seat;
  myId: string;
  isAway: (id: string) => boolean;
  /** Left/right seats of a 2 vs 2: played cards overlap so the table fits a phone. */
  side?: boolean;
}) {
  const team = teamOf(seat);
  const active = state.status === "playing" && state.turn === seat && !pendingSong(state);
  const cardsLeft = inHand(state, seat).length;
  const mine = state.seats[seat] === myId;
  const played = [0, 1, 2].map((i) => playedIn(state, seat, i)).filter(Boolean);
  return (
    <div className="flex flex-col items-center gap-1">
      {side ? (
        <div className="flex h-16 -space-x-7">
          {played.length ? (
            played.map((c) => <Naipe key={c} code={c} size="sm" />)
          ) : (
            <span className="h-16 w-11 rounded-md border border-dashed border-emerald-200/15" />
          )}
        </div>
      ) : (
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => {
            const c = playedIn(state, seat, i);
            return c ? (
              <Naipe key={i} code={c} size="sm" />
            ) : (
              <span key={i} className="h-16 w-11 rounded-md border border-dashed border-emerald-200/15" />
            );
          })}
        </div>
      )}
      <div
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${active ? "ring-2 ring-amber-300" : ""}`}
        style={{ backgroundColor: `${TEAM_COLOR[team]}33`, color: TEAM_COLOR[team] }}
      >
        {state.mano === seat && <span title="Mano">✋</span>}
        {playerName(state, seat, myId)}
        {isAway(state.seats[seat]) && <span className="text-slate-400">(se fue)</span>}
        {!mine && state.status === "playing" && <span className="text-emerald-100/70">🂠{cardsLeft}</span>}
      </div>
    </div>
  );
}

function SongBanner({ state, myId }: { state: TrucoState; myId: string }) {
  const envido = state.envidoAsk.chain;
  const by = (envido ? state.envidoAsk.by : state.trucoAsk.by) as Seat;
  const text = envido
    ? envido
        .split("")
        .map((c) => ENVIDO_LABEL[c as EnvidoCall])
        .join(" + ")
    : TRUCO_LABEL[state.trucoAsk.level];
  return (
    <div className="animate-celebration-in flex flex-col items-center rounded-2xl bg-slate-950/70 px-4 py-2 text-center">
      <span className="text-xs text-slate-400">{playerName(state, by, myId)} cantó</span>
      <span className="font-display text-2xl font-bold text-amber-300">¡{text}!</span>
      {envido && state.trucoAsk.level > 0 && <span className="text-xs text-slate-400">(el {TRUCO_LABEL[state.trucoAsk.level].toLowerCase()} espera)</span>}
    </div>
  );
}

function AnswerBar({ roomId, state, myId, mySeat }: { roomId: string; state: TrucoState; myId: string; mySeat: Seat }) {
  const mv = state.moveNo;
  const envido = state.envidoAsk.chain;
  const raises: EnvidoCall[] = envido
    ? ENVIDO_CALLS.filter((c) => canRaiseEnvido(envido, c))
    : canSingEnvido(state, mySeat)
      ? ENVIDO_CALLS
      : [];
  return (
    <div className={`${CARD} !p-3 flex w-full max-w-md flex-col items-center gap-2`}>
      <p className="text-sm text-slate-300">Te toca contestar:</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button onClick={() => answer(roomId, myId, "quiero", mv)} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500">
          ¡Quiero!
        </button>
        <button onClick={() => answer(roomId, myId, "noquiero", mv)} className="rounded-lg border border-red-400/60 px-4 py-2 font-semibold text-red-300 hover:bg-red-500/10">
          No quiero
        </button>
        {!envido && state.trucoAsk.level < 4 && (
          <button onClick={() => answer(roomId, myId, "raise", mv)} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-500">
            {TRUCO_LABEL[state.trucoAsk.level + 1]}
          </button>
        )}
        {raises.map((c) => (
          <button key={c} onClick={() => answer(roomId, myId, c, mv)} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500">
            {!envido ? "El envido está primero: " : ""}
            {ENVIDO_LABEL[c]}
          </button>
        ))}
      </div>
    </div>
  );
}

const REASON: Record<string, string> = {
  bazas: "ganó las bazas",
  noquiero: "no le quisieron el truco",
  mazo: "el rival se fue al mazo",
};

function HandSummary({ roomId, state, myId, myTeam }: { roomId: string; state: TrucoState; myId: string; myTeam: Team | null }) {
  const finished = state.status === "finished";
  const r = state.handResult;
  return (
    <div className={`${CARD} animate-celebration-in flex flex-col items-center gap-3 text-center`}>
      {r.winner && (
        <p className="text-slate-200">
          {teamName(Number(r.winner) as Team, myTeam)} {myTeam !== null && Number(r.winner) === myTeam ? "ganamos" : "ganó"} la mano (+{r.points}
          {r.reason ? `, ${REASON[r.reason] ?? r.reason}` : ""}).
        </p>
      )}
      {finished ? (
        <>
          <p className="font-display text-2xl font-bold text-slate-100">
            {myTeam !== null && Number(state.winner) === myTeam ? "🎉 ¡Ganaron!" : `🏆 Ganó ${teamName(Number(state.winner) as Team, myTeam).toLowerCase()}`}
          </p>
          <button onClick={() => rematch(roomId, state.gameNo)} className={`w-full max-w-xs ${myTeam !== null ? PRIMARY_BUTTON : SECONDARY_BUTTON}`}>
            Revancha
          </button>
        </>
      ) : (
        <button onClick={() => nextHand(roomId, state.moveNo)} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
          Repartir la siguiente mano
        </button>
      )}
      <p className="text-xs text-slate-500">
        Así quedaron las cartas:{" "}
        {activeSeats(state)
          .map((x) => `${playerName(state, x, myId)} ${splitCards(state.hands[x]).length ? `(${envidoOf(splitCards(state.hands[x]))} de envido)` : ""}`)
          .join(" · ")}
      </p>
    </div>
  );
}

/** Points drawn as matchsticks, in squares of five like on paper. */
function Porotos({ n }: { n: number }) {
  const groups = Math.ceil(n / 5);
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: groups }, (_, g) => {
        const k = Math.min(5, n - g * 5);
        return (
          <svg key={g} viewBox="0 0 24 24" className="h-5 w-5">
            <g stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round">
              {k >= 1 && <line x1="3" y1="3" x2="3" y2="21" />}
              {k >= 2 && <line x1="3" y1="3" x2="21" y2="3" />}
              {k >= 3 && <line x1="21" y1="3" x2="21" y2="21" />}
              {k >= 4 && <line x1="3" y1="21" x2="21" y2="21" />}
              {k >= 5 && <line x1="3" y1="21" x2="21" y2="3" />}
            </g>
          </svg>
        );
      })}
    </div>
  );
}

function Score({ state, myTeam, myId }: { state: TrucoState; myTeam: Team | null; myId: string }) {
  const half = state.target / 2;
  return (
    <div className={`${CARD} !p-4 flex flex-col gap-3`}>
      <p className="text-xs uppercase tracking-wide text-slate-500">A {state.target} puntos</p>
      {((myTeam === 1 ? [1, 0] : [0, 1]) as Team[]).map((t) => {
        const pts = scoreOf(state, t);
        const players = activeSeats(state)
          .filter((x) => teamOf(x) === t)
          .map((x) => playerName(state, x, myId))
          .join(" y ");
        return (
          <div key={t} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold" style={{ color: TEAM_COLOR[t] }}>
                {teamName(t, myTeam)} <span className="text-xs font-normal text-slate-500">({players})</span>
              </span>
              <span className="font-mono text-lg text-slate-100">{pts}</span>
            </div>
            <Porotos n={pts} />
            {state.target === 30 && <span className="text-[10px] text-slate-500">{pts < half ? "en las malas" : "en las buenas"}</span>}
          </div>
        );
      })}
    </div>
  );
}
