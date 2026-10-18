"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLORS,
  countBoxes,
  drawLine,
  drawnLines,
  getCajasMeta,
  hLine,
  joinCajas,
  normalizeMeta,
  playAgain,
  skipTurn,
  startCajas,
  subscribeCajas,
  vLine,
  type CajasState,
} from "@/lib/cajas";
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
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";

type Status = "loading" | "not-found" | "ready" | "error";

export default function CajasClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
  const [config, setConfig] = useState<{ hostId: string; size: number } | null>(null);
  const [state, setState] = useState<CajasState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  // Presence starts empty: only trust "X isn't here" once I see myself in it.
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getCajasMeta>>>>(
      roomId,
      (meta) => {
        if (cancelled) return;
        setRoomMeta(meta);
        if (!meta) return setStatus("not-found");
        if (meta.game !== "cajas") return router.replace(`/sala/${roomId}`);
        setConfig({ ...normalizeMeta(meta), hostId: meta.hostId ?? "" });
        unsub ??= subscribeCajas(roomId, setState);
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
    joinCajas(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;

  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="cajas"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="cajas" />
        )}

        {status === "loading" && <RoomLoading text="Marcando los puntos…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="cajas"
              roomId={roomId}
              hostId={config.hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`Tablero de ${config.size} × ${config.size} · hasta ${MAX_PLAYERS} jugadores`}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              onStart={() => startCajas(roomId, connected, config.size)}
            >
              {connected.length > MAX_PLAYERS && (
                <p className="text-center text-sm text-amber-300/90">
                  Juegan {MAX_PLAYERS} al azar; los demás miran y entran en la próxima.
                </p>
              )}
            </WaitingRoom>
          </div>
        )}

        {status === "ready" && state && config && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 p-4">
            <PlayersBar roomId={roomId} state={state} myId={myId} isAway={isAway} />
            {state.status === "finished" && (
              <ResultBanner
                state={state}
                myId={myId}
                canAgain={connected.length >= MIN_PLAYERS}
                onAgain={() => playAgain(roomId, state.gameNo, connected, config.size)}
              />
            )}
            {state.status === "finished" && (
              <BackToRoomButton roomId={roomId} stateKey="cajas/state" hostId={config.hostId} presence={presence} myId={myId} />
            )}
            <Board roomId={roomId} state={state} myId={myId} size={config.size} />
            <Watching state={state} presence={presence} myId={myId} />
          </div>
        )}
      </main>
    </div>
  );
}

function nameOf(state: CajasState, id: string, myId: string): string {
  return id === myId ? "Vos" : (state.players[id]?.name ?? "?");
}

function PlayersBar({
  roomId,
  state,
  myId,
  isAway,
}: {
  roomId: string;
  state: CajasState;
  myId: string;
  isAway: (id: string) => boolean;
}) {
  const current = state.order[state.turn];
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {state.order.map((id, i) => {
          const active = state.status === "playing" && state.turn === i;
          const color = PLAYER_COLORS[i];
          return (
            <div
              key={id}
              className={`flex items-center gap-2.5 rounded-xl border bg-slate-900/70 p-2.5 transition ${active ? "" : "opacity-70"}`}
              style={{ borderColor: active ? color : "#33415580", boxShadow: active ? `0 0 18px ${color}66` : undefined }}
            >
              <span className="h-4 w-4 shrink-0 rounded" style={{ backgroundColor: color }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-100">
                  {nameOf(state, id, myId)}
                  {isAway(id) && <span className="font-normal text-slate-500"> (se fue)</span>}
                </p>
                <p className="text-xs text-slate-400">
                  {active ? (id === myId ? "¡Te toca!" : "Jugando…") : `${countBoxes(state.boxes, i)} cuadrados`}
                </p>
              </div>
              <span className="font-mono text-lg font-bold" style={{ color }}>
                {countBoxes(state.boxes, i)}
              </span>
            </div>
          );
        })}
      </div>
      {state.status === "playing" && isAway(current) && state.order.includes(myId) && (
        <button
          onClick={() => skipTurn(roomId, state.turn, drawnLines(state.lines)).catch(console.error)}
          className={`self-center px-4 text-sm ${SECONDARY_BUTTON}`}
        >
          {nameOf(state, current, myId)} se fue: saltar su turno
        </button>
      )}
    </div>
  );
}

const CELL = 60;
const PAD = 14;

function Board({ roomId, state, myId, size }: { roomId: string; state: CajasState; myId: string; size: number }) {
  const myTurn = state.status === "playing" && state.order[state.turn] === myId;
  const drawn = drawnLines(state.lines);
  const span = size * CELL + PAD * 2;
  const myColor = PLAYER_COLORS[state.turn];

  const draw = (line: number) => {
    if (!myTurn || state.lines[line] !== ".") return;
    drawLine(roomId, myId, line, drawn, size).catch(console.error);
  };

  const lineEl = (line: number, x1: number, y1: number, x2: number, y2: number) => {
    const owner = state.lines[line];
    const isDrawn = owner !== ".";
    const horizontal = y1 === y2;
    const last = line === state.lastLine;
    return (
      <g key={line}>
        {isDrawn ? (
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={PLAYER_COLORS[Number(owner)]}
            strokeWidth={last ? 8 : 6}
            strokeLinecap="round"
            opacity={last ? 1 : 0.9}
          />
        ) : (
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#334155"
            strokeWidth={2}
            strokeDasharray="3 6"
            strokeLinecap="round"
          />
        )}
        {!isDrawn && myTurn && (
          <rect
            x={horizontal ? x1 + 8 : x1 - 12}
            y={horizontal ? y1 - 12 : y1 + 8}
            width={horizontal ? CELL - 16 : 24}
            height={horizontal ? 24 : CELL - 16}
            rx={6}
            className="cursor-pointer fill-transparent hover:fill-white/10"
            onClick={() => draw(line)}
          >
            <title>Trazar línea</title>
          </rect>
        )}
      </g>
    );
  };

  const lines = [];
  for (let r = 0; r <= size; r++)
    for (let c = 0; c < size; c++)
      lines.push(lineEl(hLine(size, r, c), PAD + c * CELL, PAD + r * CELL, PAD + (c + 1) * CELL, PAD + r * CELL));
  for (let r = 0; r < size; r++)
    for (let c = 0; c <= size; c++)
      lines.push(lineEl(vLine(size, r, c), PAD + c * CELL, PAD + r * CELL, PAD + c * CELL, PAD + (r + 1) * CELL));

  return (
    <div className={`${CARD} !p-3 flex flex-col items-center gap-2`}>
      <svg viewBox={`0 0 ${span} ${span}`} className="w-full max-w-md touch-manipulation select-none">
        {Array.from({ length: size * size }, (_, b) => {
          const owner = state.boxes[b];
          if (owner === ".") return null;
          const r = Math.floor(b / size);
          const c = b % size;
          const color = PLAYER_COLORS[Number(owner)];
          const name = state.players[state.order[Number(owner)]]?.name ?? "?";
          return (
            <g key={`b${b}`} className="animate-celebration-in">
              <rect x={PAD + c * CELL + 4} y={PAD + r * CELL + 4} width={CELL - 8} height={CELL - 8} rx={6} fill={color} opacity={0.3} />
              <text
                x={PAD + c * CELL + CELL / 2}
                y={PAD + r * CELL + CELL / 2 + 8}
                textAnchor="middle"
                fontSize="22"
                fontWeight="700"
                fill={color}
              >
                {name.slice(0, 1).toUpperCase()}
              </text>
            </g>
          );
        })}
        {lines}
        {Array.from({ length: (size + 1) * (size + 1) }, (_, d) => (
          <circle
            key={`d${d}`}
            cx={PAD + (d % (size + 1)) * CELL}
            cy={PAD + Math.floor(d / (size + 1)) * CELL}
            r={5}
            fill="#e2e8f0"
          />
        ))}
      </svg>
      {state.status === "playing" && (
        <p className="text-center text-xs text-slate-500">
          {myTurn ? (
            <>
              Tocá entre dos puntos para trazar tu línea{" "}
              <span className="inline-block h-2 w-4 rounded-full align-middle" style={{ backgroundColor: myColor }} />.
              Si cerrás un cuadrado, jugás de nuevo.
            </>
          ) : (
            "Esperá tu turno…"
          )}
        </p>
      )}
    </div>
  );
}

function ResultBanner({
  state,
  myId,
  canAgain,
  onAgain,
}: {
  state: CajasState;
  myId: string;
  canAgain: boolean;
  onAgain: () => void;
}) {
  const winners = state.winners.split(",").filter(Boolean).map(Number);
  const winnerIds = winners.map((i) => state.order[i]);
  const iWon = winnerIds.length === 1 && winnerIds[0] === myId;
  const title =
    winnerIds.length > 1
      ? `🤝 ¡Empate entre ${winnerIds.map((id) => nameOf(state, id, myId)).join(" y ")}!`
      : iWon
        ? "🎉 ¡Ganaste!"
        : `🏆 ¡Ganó ${nameOf(state, winnerIds[0] ?? "", myId)}!`;
  return (
    <div
      className={`animate-celebration-in flex flex-col items-center gap-3 rounded-2xl border bg-slate-900 p-4 text-center ${
        iWon ? "border-emerald-500/25 shadow-[0_0_40px_rgba(52,211,153,0.2)]" : "border-violet-500/20"
      }`}
    >
      <p className="font-display text-xl font-semibold text-slate-100">{title}</p>
      {canAgain ? (
        <button onClick={onAgain} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
          Jugar de nuevo
        </button>
      ) : (
        <p className="text-xs text-amber-300/90">Hace falta al menos otra persona conectada para jugar de nuevo.</p>
      )}
    </div>
  );
}

function Watching({ state, presence, myId }: { state: CajasState; presence: PresenceMap; myId: string }) {
  const watching = Object.keys(presence).filter((id) => !state.order.includes(id));
  if (watching.length === 0) return null;
  return (
    <p className="text-center text-xs text-slate-500">
      Mirando: {watching.map((id) => (id === myId ? "vos" : (presence[id]?.name ?? "?"))).join(", ")}
      {watching.includes(myId) && " · entrás en la próxima partida"}
    </p>
  );
}
