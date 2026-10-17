"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  discardCard,
  drawCard,
  getChinchonMeta,
  inPlay,
  joinChinchon,
  nextHand,
  playAgain,
  skipTurn,
  startChinchon,
  subscribeChinchon,
  topDiscard,
  type ChinchonState,
} from "@/lib/chinchon";
import { bestArrangement, canCut, CUT_MAX } from "@/lib/chinchonRules";
import { cardName, splitCards } from "@/lib/baraja";
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

export default function ChinchonClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [config, setConfig] = useState<{ hostId: string; limit: number } | null>(null);
  const [state, setState] = useState<ChinchonState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  // Presence starts empty: only trust "X isn't here" once I see myself in it.
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    getChinchonMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "chinchon") return router.replace(`/sala/${roomId}`);
        setConfig({ hostId: meta.hostId ?? "", limit: meta.limit ?? 100 });
        unsub = subscribeChinchon(roomId, setState);
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
    joinChinchon(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;

  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="chinchon"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="chinchon" />
        )}

        {status === "loading" && <RoomLoading text="Mezclando las cartas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="chinchon"
              roomId={roomId}
              hostId={config.hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`A ${config.limit} puntos · de ${MIN_PLAYERS} a ${MAX_PLAYERS} jugadores`}
              onStart={() => startChinchon(roomId, connected)}
            >
              {connected.length < MIN_PLAYERS && (
                <p className="text-center text-sm text-amber-300/90">Hacen falta al menos {MIN_PLAYERS} jugadores.</p>
              )}
              {connected.length > MAX_PLAYERS && (
                <p className="text-center text-sm text-slate-400">Juegan los primeros {MAX_PLAYERS}; el resto mira.</p>
              )}
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && config && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-3 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-col gap-4 lg:flex-1">
              {state.status === "playing" && (
                <Table key={state.moveNo} roomId={roomId} state={state} myId={myId} limit={config.limit} isAway={isAway} />
              )}
              {(state.status === "handEnd" || state.status === "finished") && (
                <HandEnd roomId={roomId} state={state} myId={myId} />
              )}
            </div>
            <Scoreboard state={state} presence={presence} myId={myId} limit={config.limit} />
          </div>
        )}
      </main>
    </div>
  );
}

function nameOf(state: ChinchonState, id: string, myId: string): string {
  return id === myId ? "Vos" : (state.players[id]?.name ?? "?");
}

function Table({
  roomId,
  state,
  myId,
  limit,
  isAway,
}: {
  roomId: string;
  state: ChinchonState;
  myId: string;
  limit: number;
  isAway: (id: string) => boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const playing = inPlay(state).includes(myId);
  const myTurn = state.turn === myId;
  const hand = splitCards(state.hands[myId] ?? "");
  const top = topDiscard(state);
  const canDraw = myTurn && state.phase === "draw";
  const canThrow = myTurn && state.phase === "discard";
  const rest = selected ? hand.filter((c) => c !== selected) : [];
  const cutOk = canThrow && !!selected && selected !== state.tookDiscard && canCut(rest);
  const arrangement = bestArrangement(hand);
  const meldOf = new Map<string, number>();
  arrangement.melds.forEach((m, i) => m.forEach((c) => meldOf.set(c, i)));
  const ordered = [...arrangement.melds.flat(), ...arrangement.loose];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-center gap-2">
        {inPlay(state)
          .filter((id) => id !== myId)
          .map((id) => (
            <div
              key={id}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                state.turn === id ? "border-violet-400/70 bg-violet-500/10" : "border-slate-800 bg-slate-900/60"
              }`}
            >
              <span className="text-sm font-medium" style={{ color: state.players[id]?.color }}>
                {nameOf(state, id, myId)}
              </span>
              <span className="text-xs text-slate-400">🂠 {splitCards(state.hands[id] ?? "").length}</span>
              {state.turn === id && isAway(id) && (
                <button onClick={() => skipTurn(roomId, state.moveNo)} className="text-xs text-cyan-300 underline">
                  Se fue: pasar
                </button>
              )}
            </div>
          ))}
      </div>

      <div className={`${CARD} flex items-center justify-center gap-8 bg-gradient-to-br from-emerald-950/60 to-slate-900/60 py-6`}>
        <div className="flex flex-col items-center gap-1">
          <Naipe faceDown size="lg" onClick={canDraw ? () => drawCard(roomId, myId, false, state.moveNo) : undefined} />
          <span className="text-xs text-slate-400">Mazo ({state.deck.length / 2})</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          {top ? (
            <Naipe code={top} size="lg" onClick={canDraw ? () => drawCard(roomId, myId, true, state.moveNo) : undefined} />
          ) : (
            <div className="h-32 w-[5.5rem] rounded-xl border-2 border-dashed border-slate-600" />
          )}
          <span className="text-xs text-slate-400">Pozo</span>
        </div>
      </div>

      <p className="text-center font-display text-lg font-semibold text-slate-100">
        {!playing
          ? `Juega ${nameOf(state, state.turn, myId)}`
          : canDraw
            ? "¡Te toca! Agarrá del mazo o del pozo."
            : canThrow
              ? selected
                ? `Vas a tirar el ${cardName(selected)}`
                : "Elegí qué carta tirar."
              : `Juega ${nameOf(state, state.turn, myId)}…`}
      </p>

      {playing && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap justify-center gap-1.5 pt-3">
            {ordered.map((c) => {
              const group = meldOf.get(c);
              return (
                <div key={c} className="flex flex-col items-center gap-1">
                  <Naipe
                    code={c}
                    selected={selected === c}
                    dim={canThrow && c === state.tookDiscard}
                    onClick={canThrow ? () => setSelected(selected === c ? null : c) : undefined}
                  />
                  <span
                    className="h-1 w-12 rounded-full"
                    style={{ backgroundColor: group === undefined ? "transparent" : ["#22d3ee", "#a78bfa", "#f472b6"][group % 3] }}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">
            Las rayitas de color marcan tus combinaciones. Sueltas: {arrangement.points} puntos.
          </p>
          {canThrow && (
            <div className="grid w-full max-w-sm grid-cols-2 gap-2">
              <button
                disabled={!selected || selected === state.tookDiscard}
                onClick={() => selected && discardCard(roomId, myId, selected, false, limit, state.moveNo)}
                className={PRIMARY_BUTTON}
              >
                Tirar
              </button>
              <button
                disabled={!cutOk}
                onClick={() => selected && discardCard(roomId, myId, selected, true, limit, state.moveNo)}
                className={`${SECONDARY_BUTTON} disabled:opacity-40`}
                title={`Para cortar, las otras siete tienen que estar ligadas salvo una carta de ${CUT_MAX} o menos`}
              >
                ✂️ Cortar
              </button>
            </div>
          )}
          {canThrow && selected === state.tookDiscard && (
            <p className="text-xs text-amber-300">No podés tirar la carta que acabás de levantar del pozo.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ArrangedHand({ cards }: { cards: string[] }) {
  const a = bestArrangement(cards);
  return (
    <div className="flex flex-wrap items-end gap-2">
      {a.melds.map((m, i) => (
        <div key={i} className="flex gap-0.5 rounded-lg bg-emerald-500/10 p-1 ring-1 ring-emerald-400/30">
          {m.map((c) => (
            <Naipe key={c} code={c} size="sm" />
          ))}
        </div>
      ))}
      {a.loose.length > 0 && (
        <div className="flex gap-0.5 rounded-lg bg-rose-500/10 p-1 ring-1 ring-rose-400/30">
          {a.loose.map((c) => (
            <Naipe key={c} code={c} size="sm" />
          ))}
        </div>
      )}
    </div>
  );
}

function HandEnd({ roomId, state, myId }: { roomId: string; state: ChinchonState; myId: string }) {
  const { cutter, chinchon, points } = state.lastHand;
  const finished = state.status === "finished";
  return (
    <div className={`${CARD} animate-celebration-in flex flex-col gap-4`}>
      <div className="text-center">
        {chinchon ? (
          <p className="font-display text-2xl font-bold text-amber-300">🎉 ¡CHINCHÓN de {nameOf(state, cutter, myId)}!</p>
        ) : (
          <p className="font-display text-xl font-semibold text-slate-100">✂️ Cortó {nameOf(state, cutter, myId)}</p>
        )}
        {finished && (
          <p className="mt-1 text-lg text-emerald-300">
            🏆 {state.winner === myId ? "¡Ganaste la partida!" : `Ganó ${nameOf(state, state.winner, myId)}`}
          </p>
        )}
      </div>
      <ul className="flex flex-col gap-3">
        {state.order
          .filter((id) => id in points || id === cutter)
          .map((id) => (
            <li key={id} className="flex flex-col gap-1.5 rounded-xl bg-slate-950/40 p-3">
              <div className="flex items-baseline justify-between">
                <span className="font-medium" style={{ color: state.players[id]?.color }}>
                  {nameOf(state, id, myId)}
                </span>
                {id in points && (
                  <span className={`font-mono ${points[id] < 0 ? "text-emerald-300" : "text-slate-200"}`}>
                    {points[id] > 0 ? `+${points[id]}` : points[id]}
                  </span>
                )}
              </div>
              <ArrangedHand cards={splitCards(state.hands[id] ?? "")} />
            </li>
          ))}
      </ul>
      {finished ? (
        <button onClick={() => playAgain(roomId, state.gameNo)} className={`w-full max-w-xs self-center ${SECONDARY_BUTTON}`}>
          Jugar de nuevo
        </button>
      ) : (
        <button onClick={() => nextHand(roomId, state.moveNo)} className={`w-full max-w-xs self-center ${PRIMARY_BUTTON}`}>
          Repartir la siguiente mano
        </button>
      )}
    </div>
  );
}

function Scoreboard({ state, presence, myId, limit }: { state: ChinchonState; presence: PresenceMap; myId: string; limit: number }) {
  const rows = [...state.order].sort((a, b) => (state.scores[a] ?? 0) - (state.scores[b] ?? 0));
  return (
    <aside className={`${CARD} !p-4 w-full lg:w-72`}>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Puntos (se queda afuera quien pasa {limit})
      </h2>
      <ol className="flex flex-col gap-2 text-sm">
        {rows.map((id) => (
          <li key={id} className={state.out[id] ? "opacity-40" : id in presence ? "" : "opacity-60"}>
            <div className="flex items-center gap-2">
              <span className={`flex-1 truncate ${state.out[id] ? "line-through" : ""}`} style={{ color: state.players[id]?.color }}>
                {nameOf(state, id, myId)}
                {state.turn === id && state.status === "playing" && " 👈"}
              </span>
              <span className="w-10 text-right font-mono text-slate-200">{state.scores[id] ?? 0}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-red-500"
                style={{ width: `${Math.min(100, Math.max(0, ((state.scores[id] ?? 0) / limit) * 100))}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
