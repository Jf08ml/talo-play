"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  MIN_PLAYERS,
  getRetoMeta,
  joinReto,
  judge,
  normalizeMeta,
  pickCard,
  skipTurn,
  startReto,
  subscribeReto,
  type Kind,
  type RetoState,
} from "@/lib/reto";
import { RETO_LEVELS, retoPools, type RetoLevel } from "@/lib/retoPrompts";
import type { PresenceMap } from "@/lib/presence";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { RoomSettingsEditor, type RawMeta } from "@/components/RoomSettings";
import { watchRoomMeta } from "@/lib/roomSettings";
import { SETTINGS } from "../settings";
import { CARD, SECONDARY_BUTTON } from "@/components/ui";
import { useTurnAlert } from "@/hooks/useTurnAlert";
import { useSoundOn } from "@/hooks/useSound";

type Status = "loading" | "not-found" | "ready" | "error";

export default function RetoClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
  const [config, setConfig] = useState<{ hostId: string; levels: RetoLevel[] } | null>(null);
  const [state, setState] = useState<RetoState | null>(null);
  useSoundOn(state?.status, "flip");

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  // Presence starts empty: only trust "X isn't here" once I see myself in it.
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getRetoMeta>>>>(
      roomId,
      (meta) => {
        if (cancelled) return;
        setRoomMeta(meta);
        if (!meta) return setStatus("not-found");
        if (meta.game !== "reto") return router.replace(`/sala/${roomId}`);
        setConfig({ ...normalizeMeta(meta), hostId: meta.hostId ?? "" });
        unsub ??= subscribeReto(roomId, setState);
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
    joinReto(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const levels = config?.levels;
  const pools = useMemo(() => (levels ? retoPools(levels) : null), [levels]);

  if (!configured) return <FirebaseSetupNotice />;

  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  const isAway = (id: string) => presenceLoaded && !!id && !(id in presence);
  const levelsLabel = config
    ? RETO_LEVELS.filter((l) => config.levels.includes(l.id))
        .map((l) => `${l.emoji} ${l.label}`)
        .join(" + ")
    : "";

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="reto"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="reto" />
        )}

        {status === "loading" && <RoomLoading text="Barajando verdades y retos…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="reto"
              roomId={roomId}
              hostId={config.hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={levelsLabel}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              minToStart={MIN_PLAYERS}
              onStart={() => startReto(roomId, connected)}
            />
          </div>
        )}

        {status === "ready" && state && pools && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <TurnPanel roomId={roomId} state={state} myId={myId} pools={pools} connected={connected} isAway={isAway} />
              {state.last.by && state.last.kind && (
                <p className="text-center text-sm text-slate-500">
                  Antes: {nameOf(state, state.last.by, myId)} eligió {state.last.kind} y{" "}
                  {state.last.done ? (
                    <span className="text-emerald-400">cumplió ✓</span>
                  ) : (
                    <span className="text-rose-400">se rajó 🐔</span>
                  )}
                </p>
              )}
            </div>
            <Scoreboard state={state} presence={presence} myId={myId} />
          </div>
        )}
      </main>
    </div>
  );
}

function nameOf(state: RetoState, id: string, myId: string): string {
  return id === myId ? "vos" : (state.players[id]?.name ?? "?");
}

function TurnPanel({
  roomId,
  state,
  myId,
  pools,
  connected,
  isAway,
}: {
  roomId: string;
  state: RetoState;
  myId: string;
  pools: { verdades: string[]; retos: string[] };
  connected: string[];
  isAway: (id: string) => boolean;
}) {
  const current = state.current;
  const myTurn = current === myId;
  useTurnAlert(myTurn);
  const name = state.players[current]?.name ?? "?";
  const color = state.players[current]?.color;
  const card =
    state.status === "card" && state.card.kind
      ? (state.card.kind === "verdad" ? pools.verdades : pools.retos)[state.card.idx]
      : null;

  const pick = (kind: Kind) =>
    pickCard(roomId, myId, state.turnNo, kind, (kind === "verdad" ? pools.verdades : pools.retos).length).catch(
      console.error
    );

  return (
    <div className={`${CARD} flex flex-col items-center gap-5 py-8 text-center`}>
      <div className="flex flex-col items-center gap-2">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold text-white shadow-lg"
          style={{ backgroundColor: color, boxShadow: `0 0 25px ${color}88` }}
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
        <p className="font-display text-2xl font-semibold text-slate-100">{myTurn ? "¡Te toca!" : `Le toca a ${name}`}</p>
      </div>

      {state.status === "choosing" &&
        (myTurn ? (
          <div className="grid w-full max-w-sm grid-cols-2 gap-3">
            <button
              onClick={() => pick("verdad")}
              className="rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 py-6 font-display text-2xl font-bold text-white shadow-[0_0_25px_rgba(99,102,241,0.45)] transition hover:-translate-y-0.5"
            >
              Verdad
            </button>
            <button
              onClick={() => pick("reto")}
              className="rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 py-6 font-display text-2xl font-bold text-white shadow-[0_0_25px_rgba(239,68,68,0.45)] transition hover:-translate-y-0.5"
            >
              Reto
            </button>
          </div>
        ) : (
          <p className="text-slate-400">¿Verdad o reto? Está eligiendo…</p>
        ))}

      {card && (
        <div
          key={state.turnNo}
          className={`animate-celebration-in w-full max-w-lg rounded-2xl border-2 p-6 ${
            state.card.kind === "verdad"
              ? "border-indigo-400/70 bg-indigo-500/10 shadow-[0_0_30px_rgba(99,102,241,0.3)]"
              : "border-orange-400/70 bg-orange-500/10 shadow-[0_0_30px_rgba(249,115,22,0.3)]"
          }`}
        >
          <p
            className={`text-xs font-bold uppercase tracking-widest ${
              state.card.kind === "verdad" ? "text-indigo-300" : "text-orange-300"
            }`}
          >
            {state.card.kind}
          </p>
          <p className="mt-2 font-display text-xl font-semibold leading-snug text-slate-100 sm:text-2xl">{card}</p>
        </div>
      )}

      {card &&
        (myTurn ? (
          <p className="text-sm text-slate-400">Cuando termines, los demás deciden si cumpliste.</p>
        ) : (
          <div className="flex w-full max-w-sm flex-col gap-2">
            <p className="text-sm text-slate-400">¿Cumplió?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => judge(roomId, myId, state.turnNo, true, connected)}
                className="rounded-lg bg-emerald-600 py-2.5 font-medium text-white transition hover:bg-emerald-500"
              >
                ¡Cumplió! +1
              </button>
              <button
                onClick={() => judge(roomId, myId, state.turnNo, false, connected)}
                className="rounded-lg border border-rose-400/60 py-2.5 font-medium text-rose-300 transition hover:bg-rose-500/10"
              >
                Se rajó 🐔
              </button>
            </div>
          </div>
        ))}

      {!myTurn && isAway(current) && (
        <button onClick={() => skipTurn(roomId, state.turnNo, connected)} className={`px-4 text-sm ${SECONDARY_BUTTON}`}>
          {name} se fue: pasar al siguiente
        </button>
      )}
    </div>
  );
}

function Scoreboard({ state, presence, myId }: { state: RetoState; presence: PresenceMap; myId: string }) {
  const rows = Object.keys(state.players)
    .filter((id) => id in presence || (state.scores[id] ?? 0) > 0)
    .sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0));
  return (
    <aside className={`${CARD} !p-4 w-full lg:w-72`}>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Cumplidos</h2>
      <ol className="flex flex-col gap-1.5 text-sm">
        {rows.map((id) => (
          <li key={id} className={`flex items-center gap-2 ${id in presence ? "" : "opacity-40"}`}>
            <span className="flex-1 truncate" style={{ color: state.players[id]?.color }}>
              {id === myId ? "Vos" : (state.players[id]?.name ?? "?")}
              {id === state.current && " 👈"}
            </span>
            {(state.chickens[id] ?? 0) > 0 && (
              <span className="text-xs text-rose-300/80" title="Veces que se rajó">
                🐔{state.chickens[id]}
              </span>
            )}
            <span className="w-8 text-right font-mono text-slate-200">{state.scores[id] ?? 0}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
