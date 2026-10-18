"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  GOAL,
  MAX_PLAYERS,
  RULE_TEXT,
  SPIRAL,
  SQUARES,
  backToLobby,
  colorOf,
  getOcaMeta,
  joinOca,
  rematch,
  rollOca,
  skipTurn,
  startOca,
  subscribeOca,
  type OcaState,
} from "@/lib/oca";
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
import { RoomSettingsEditor, type RawMeta } from "@/components/RoomSettings";
import { watchRoomMeta } from "@/lib/roomSettings";
import { SETTINGS } from "../settings";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";

type Status = "loading" | "not-found" | "ready" | "error";

export default function OcaClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
  const [state, setState] = useState<OcaState | null>(null);
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

    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getOcaMeta>>>>(
      roomId,
      (meta) => {
        if (cancelled) return;
        setRoomMeta(meta);
        if (!meta) return setStatus("not-found");
        if (meta.game !== "oca") return router.replace(`/sala/${roomId}`);
        setHostId(meta.hostId ?? "");
        unsub ??= subscribeOca(roomId, setState);
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
    joinOca(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;

  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="oca"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="oca" />
        )}

        {status === "loading" && <RoomLoading text="Preparando el tablero…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="oca"
              roomId={roomId}
              hostId={hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`${state.dice === 2 ? "Dos dados" : "Un dado"} · de 2 a ${MAX_PLAYERS} · el orden se sortea`}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              onStart={() => startOca(roomId, connected)}
            />
          </div>
        )}

        {status === "ready" && state && state.status !== "waiting" && (
          <Game roomId={roomId} state={state} myId={myId} isAway={isAway} presence={presence} />
        )}
      </main>
    </div>
  );
}

function nameOf(state: OcaState, id: string, myId: string): string {
  if (id === myId) return "Vos";
  return state.players[id]?.name ?? "?";
}

/**
 * Where each token is drawn: the last mover walks square by square to where
 * the dice took it, then jumps to where the square sent it.
 */
function useWalk(state: OcaState): Record<string, number> {
  const [shown, setShown] = useState<{ who: string; at: number } | null>(null);
  // Keyed by the move itself: a skipped turn or a new snapshot doesn't replay it.
  const lastKey = JSON.stringify(state.last);
  const seen = useRef(lastKey);

  useEffect(() => {
    if (lastKey === seen.current) return;
    seen.current = lastKey;
    const l = JSON.parse(lastKey) as OcaState["last"];
    if (!l.who || !l.dice) return;
    const path: number[] = [];
    if (l.from === 0 && l.landed > l.from + 12) path.push(l.landed); // the opening jump
    else {
      let p = l.from;
      let dir = 1;
      const total = l.dice.split(",").reduce((a, b) => a + Number(b), 0);
      for (let i = 0; i < total; i++) {
        if (p === GOAL) dir = -1;
        p += dir;
        path.push(p);
      }
    }
    if (l.to !== l.landed) path.push(l.to);
    let timer: ReturnType<typeof setTimeout>;
    const step = (i: number) => {
      if (i >= path.length) return setShown(null);
      setShown({ who: l.who, at: path[i] });
      // Pause on the landing square before the rule's jump.
      timer = setTimeout(() => step(i + 1), l.to !== l.landed && i === path.length - 2 ? 650 : 170);
    };
    timer = setTimeout(() => step(0), 0);
    return () => clearTimeout(timer);
  }, [lastKey]);

  return shown ? { ...state.pos, [shown.who]: shown.at } : state.pos;
}

function Game({
  roomId,
  state,
  myId,
  isAway,
  presence,
}: {
  roomId: string;
  state: OcaState;
  myId: string;
  isAway: (id: string) => boolean;
  presence: PresenceMap;
}) {
  const shown = useWalk(state);
  const turnId = state.order[state.turn];
  const myTurn = state.status === "playing" && turnId === myId;
  const playing = state.order.includes(myId);
  const last = state.last;
  const dice = last.dice ? last.dice.split(",").map(Number) : Array<number>(state.dice).fill(0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-3 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-col items-center gap-3 lg:flex-1">
        <Board state={state} shown={shown} />
      </div>

      <aside className="flex w-full flex-col gap-3 lg:w-72">
        {state.status === "finished" ? (
          <div className="animate-celebration-in flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/25 bg-slate-900 p-4 text-center">
            <p className="font-display text-xl font-semibold text-slate-100">
              {state.winner === myId ? "🎉 ¡Ganaste!" : `🏆 Ganó ${nameOf(state, state.winner, myId)}`}
            </p>
            <p className="text-xs text-slate-400">Llegó primero al jardín de la Oca 🌷</p>
            <button onClick={() => rematch(roomId, state.gameNo)} className={`w-full ${playing ? PRIMARY_BUTTON : SECONDARY_BUTTON}`}>
              Revancha
            </button>
            <button onClick={() => backToLobby(roomId, state.gameNo)} className="text-xs text-slate-500 underline hover:text-slate-300">
              Volver a la sala (para sumar gente)
            </button>
          </div>
        ) : (
          <div
            className="flex flex-col items-center gap-3 rounded-2xl border bg-slate-900/70 p-4 text-center"
            style={{ borderColor: colorOf(state, turnId) }}
          >
            <p className="font-display text-lg font-semibold text-slate-100">
              {myTurn ? (last.again && last.who === myId ? "¡Tirá de nuevo!" : "¡Te toca!") : `Juega ${nameOf(state, turnId, myId)}`}
            </p>
            <div className="flex gap-2">
              {dice.map((d, i) => (
                <DieFace key={i} value={d} rollKey={state.moveNo} glow={last.who ? colorOf(state, last.who) : undefined} className="h-14 w-14 rounded-xl" />
              ))}
            </div>
            {myTurn && (
              <button onClick={() => rollOca(roomId, myId, state.moveNo)} className={`w-full ${PRIMARY_BUTTON}`}>
                Tirar {state.dice === 2 ? "los dados" : "el dado"}
              </button>
            )}
            {!myTurn && isAway(turnId) && (
              <button onClick={() => skipTurn(roomId, state.moveNo)} className={`w-full text-sm ${SECONDARY_BUTTON}`}>
                Se fue: pasar el turno
              </button>
            )}
            {last.who && (
              <div className="text-xs text-slate-400">
                <p>
                  {nameOf(state, last.who, myId)} sacó {last.dice.split(",").join(" + ")}
                  {last.dice.includes(",") && ` = ${last.dice.split(",").reduce((a, b) => a + Number(b), 0)}`}
                  {last.rule && last.rule !== "rebote" ? ` y cayó en la ${last.landed}.` : ` y fue a la ${last.to}.`}
                </p>
                {last.bounced && last.rule !== "rebote" && <p>Se pasó de la 63 y rebotó.</p>}
                {last.rule && <p className="mt-1 font-medium text-amber-200">{RULE_TEXT[last.rule]}</p>}
                {last.freed && <p className="mt-1 text-emerald-300">¡{nameOf(state, last.freed, myId)} salió del pozo!</p>}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
          {state.order.map((id, i) => (
            <div key={id} className={`flex items-center gap-2 text-sm ${i === state.turn && state.status === "playing" ? "font-semibold" : ""}`}>
              <span className="h-4 w-4 rounded-full border-2 border-white/80" style={{ backgroundColor: colorOf(state, id) }} />
              <span className={`flex-1 truncate ${isAway(id) ? "text-slate-500" : "text-slate-200"}`}>
                {nameOf(state, id, myId)}
                {isAway(id) && " (se fue)"}
              </span>
              {state.well === id && <span title="En el pozo">🕳️</span>}
              {(state.wait[id] ?? 0) > 0 && <span className="text-xs text-slate-400">⏸ {state.wait[id]}</span>}
              {(state.wins[id] ?? 0) > 0 && <span className="text-xs text-slate-500">🏆 {state.wins[id]}</span>}
              <span className="w-8 text-right font-mono text-xs text-slate-300">{state.pos[id] ?? 0}</span>
            </div>
          ))}
          {Object.keys(presence).some((id) => !state.order.includes(id)) && (
            <p className="mt-1 text-xs text-slate-500">
              Mirando:{" "}
              {Object.keys(presence)
                .filter((id) => !state.order.includes(id))
                .map((id) => (id === myId ? "vos" : presence[id]?.name))
                .join(", ")}
            </p>
          )}
        </div>

        <details className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
          <summary className="cursor-pointer text-sm font-medium text-slate-300">Las casillas</summary>
          <ul className="mt-2 space-y-1">
            <li>🪿 Oca: saltás a la siguiente oca y volvés a tirar.</li>
            <li>🌉 Puentes (6 y 12) y 🎲 dados (26 y 53): vas al otro y volvés a tirar.</li>
            <li>🏨 Posada (19): perdés un turno. ⛓️ Cárcel (52): perdés dos.</li>
            <li>🕳️ Pozo (31): te quedás hasta que caiga otro y te rescate.</li>
            <li>🌀 Laberinto (42): volvés a la 30. 💀 Calavera (58): volvés a empezar.</li>
            <li>🌷 Para entrar al jardín (63) hace falta el número justo: lo que sobra, rebota.</li>
          </ul>
        </details>
      </aside>
    </div>
  );
}

const CELL = 100 / 8;

function Board({ state, shown }: { state: OcaState; shown: Record<string, number> }) {
  // Tokens on the same square sit side by side.
  const bySquare = new Map<number, string[]>();
  for (const id of state.order) {
    const sq = shown[id] ?? 0;
    bySquare.set(sq, [...(bySquare.get(sq) ?? []), id]);
  }
  const turnId = state.order[state.turn];

  return (
    <div className="relative aspect-square w-full max-w-[min(94vw,620px)] overflow-hidden rounded-2xl bg-emerald-950 p-1 shadow-[0_0_35px_rgba(52,211,153,0.2)] ring-2 ring-emerald-800">
      <div className="relative h-full w-full">
        {SPIRAL.map(([r, c], n) => {
          const special = SQUARES[n];
          const goal = n === GOAL;
          return (
            <div
              key={n}
              className={`absolute flex flex-col items-center justify-center border border-emerald-950/60 ${
                goal
                  ? "bg-gradient-to-br from-pink-300 to-amber-200"
                  : n === 0
                    ? "bg-sky-200"
                    : special?.rule === "oca"
                      ? "bg-amber-200"
                      : special
                        ? "bg-rose-200"
                        : n % 2
                          ? "bg-lime-100"
                          : "bg-emerald-100"
              }`}
              style={{ top: `${r * CELL}%`, left: `${c * CELL}%`, width: `${CELL}%`, height: `${CELL}%` }}
              title={special?.name}
            >
              <span className="absolute left-0.5 top-0 text-[8px] font-bold text-emerald-900/70 sm:text-[10px]">{n === 0 ? "" : n}</span>
              <span className="text-base leading-none sm:text-2xl">{n === 0 ? "🏁" : special?.emoji ?? ""}</span>
            </div>
          );
        })}

        {state.order.map((id) => {
          const sq = shown[id] ?? 0;
          const [r, c] = SPIRAL[sq];
          const here = bySquare.get(sq) ?? [id];
          const k = here.indexOf(id);
          const cols = here.length > 1 ? Math.min(3, here.length) : 1;
          const size = here.length > 1 ? 0.36 : 0.5;
          const dx = here.length > 1 ? ((k % cols) - (cols - 1) / 2) * 0.3 : 0;
          const dy = here.length > 1 ? (Math.floor(k / cols) - (Math.ceil(here.length / cols) - 1) / 2) * 0.3 + 0.12 : 0.12;
          return (
            <span
              key={id}
              className={`absolute z-10 rounded-full border-2 border-white shadow-[0_2px_4px_rgba(0,0,0,0.5)] transition-[top,left] duration-150 ease-out ${
                id === turnId && state.status === "playing" ? "ring-2 ring-slate-900" : ""
              }`}
              style={{
                width: `${CELL * size}%`,
                height: `${CELL * size}%`,
                top: `${(r + 0.5 + dy - size / 2) * CELL}%`,
                left: `${(c + 0.5 + dx - size / 2) * CELL}%`,
                backgroundColor: colorOf(state, id),
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
