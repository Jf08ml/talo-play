"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  buildDeck,
  cardKey,
  flipCard,
  getMemoMeta,
  joinMemo,
  MEMO_SIZES,
  MISMATCH_REVEAL_MS,
  resolveMismatch,
  restartMemo,
  scores,
  skipTurn,
  startMemo,
  subscribeMemo,
  type MemoState,
} from "@/lib/memotest";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import NamePrompt from "@/components/NamePrompt";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";

type Status = "loading" | "not-found" | "ready" | "error";

export default function MemotestClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [pairs, setPairs] = useState(0);
  const [state, setState] = useState<MemoState | null>(null);

  const me = identity.clientId && identity.name
    ? { clientId: identity.clientId, name: identity.name, color: identity.color }
    : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);

  // Load the room's meta, then follow its game state.
  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    getMemoMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "memotest") return router.replace(`/sala/${roomId}`);
        setPairs(meta.pairs ?? MEMO_SIZES[0].pairs);
        unsub = subscribeMemo(roomId, setState);
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

  // Take a seat in the turn order (and keep my name/color up to date there).
  const hasState = state !== null;
  useEffect(() => {
    if (!hasState || !identity.clientId || !identity.name) return;
    joinMemo(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(
      console.error
    );
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const seed = state?.seed;
  const deck = useMemo(() => (seed !== undefined && pairs ? buildDeck(seed, pairs) : []), [seed, pairs]);

  // A non-matching pair: show it for a moment, then flip it back. Every client
  // schedules this; the transaction makes sure it only happens once.
  const flippedKey = state?.flipped.join(",") ?? "";
  useEffect(() => {
    const pair = flippedKey.split(",").filter(Boolean).map(Number);
    if (pair.length !== 2 || deck[pair[0]] === deck[pair[1]]) return;
    const t = setTimeout(() => resolveMismatch(roomId, pair).catch(console.error), MISMATCH_REVEAL_MS);
    return () => clearTimeout(t);
  }, [flippedKey, deck, roomId]);

  if (!configured) return <FirebaseSetupNotice />;

  const cols = MEMO_SIZES.find((s) => s.pairs === pairs)?.cols ?? Math.ceil(Math.sqrt(pairs * 2));
  const currentId = state && state.status === "playing" ? state.order[state.turn] : undefined;
  const myTurn = currentId === identity.clientId;
  const canFlip = myTurn && state !== null && state.flipped.length < 2;

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="memotest"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={identity.clientId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" />
        )}

        {status === "loading" && <RoomLoading text="Mezclando las cartas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 lg:flex-row lg:items-start">
            <div className="flex-1">
              <TurnBanner state={state} myClientId={identity.clientId} presence={presence} roomId={roomId} />

              <div
                className="mx-auto mt-4 grid gap-2 sm:gap-3"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  maxWidth: `${cols * 96}px`,
                }}
              >
                {deck.map((face, i) => {
                  const owner = state.matched[cardKey(i)];
                  const faceUp = owner !== undefined || state.flipped.includes(i);
                  const ownerColor = owner ? state.players[owner]?.color : undefined;
                  return (
                    <MemoCard
                      key={`${state.seed}-${i}`}
                      face={face}
                      faceUp={faceUp}
                      ownerColor={ownerColor}
                      disabled={!canFlip || faceUp}
                      onFlip={() => flipCard(roomId, identity.clientId, i, deck).catch(console.error)}
                    />
                  );
                })}
              </div>
            </div>

            <Scoreboard state={state} myClientId={identity.clientId} presence={presence} />
          </div>
        )}
      </main>
    </div>
  );
}

function MemoCard({
  face,
  faceUp,
  ownerColor,
  disabled,
  onFlip,
}: {
  face: string;
  faceUp: boolean;
  ownerColor?: string;
  disabled: boolean;
  onFlip: () => void;
}) {
  return (
    <button
      onClick={onFlip}
      disabled={disabled}
      aria-label={faceUp ? face : "Carta boca abajo"}
      className={`group relative aspect-square [perspective:600px] ${disabled ? "cursor-default" : "cursor-pointer"}`}
    >
      <div
        className={`absolute inset-0 transition-transform duration-300 [transform-style:preserve-3d] ${
          faceUp ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        <div
          className={`absolute inset-0 flex items-center justify-center rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-700/70 to-fuchsia-800/60 text-xl text-violet-200/60 shadow-[0_0_15px_rgba(139,92,246,0.15)] [backface-visibility:hidden] ${
            disabled ? "" : "group-hover:border-cyan-400/60 group-hover:shadow-[0_0_18px_rgba(34,211,238,0.35)]"
          }`}
        >
          ✦
        </div>
        <div
          className="absolute inset-0 flex items-center justify-center rounded-xl border-2 bg-slate-800 text-3xl [backface-visibility:hidden] [transform:rotateY(180deg)] sm:text-4xl"
          style={{
            borderColor: ownerColor ?? "rgba(148,163,184,0.4)",
            boxShadow: ownerColor ? `0 0 14px ${ownerColor}88` : undefined,
            opacity: ownerColor ? 0.85 : 1,
          }}
        >
          {face}
        </div>
      </div>
    </button>
  );
}

function TurnBanner({
  state,
  myClientId,
  presence,
  roomId,
}: {
  state: MemoState;
  myClientId: string;
  presence: Record<string, unknown>;
  roomId: string;
}) {
  if (state.status === "waiting") {
    return (
      <div className={`${CARD} flex flex-col items-center gap-3 text-center`}>
        <p className="font-display text-lg font-semibold text-slate-100">Esperando jugadores…</p>
        <p className="text-sm text-slate-400">
          Compartí el enlace de la sala. Cuando estén todos, cualquiera puede arrancar.
        </p>
        <button onClick={() => startMemo(roomId)} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
          Empezar partida
        </button>
      </div>
    );
  }

  if (state.status === "finished") {
    const s = scores(state);
    const best = Math.max(...Object.values(s));
    const winners = state.order.filter((id) => s[id] === best);
    const names = winners.map((id) => (id === myClientId ? "vos" : state.players[id]?.name ?? "?"));
    const iWon = winners.includes(myClientId);
    return (
      <div className="animate-celebration-in flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/25 bg-slate-900 p-5 text-center shadow-[0_0_40px_rgba(52,211,153,0.2)]">
        <p className="font-display text-xl font-semibold text-slate-100">
          {iWon ? "🎉 ¡Ganaste!" : "🏁 ¡Terminó la partida!"}
        </p>
        <p className="text-sm text-slate-400">
          {winners.length > 1 ? `Empate entre ${names.join(" y ")}` : `Ganó ${names[0]}`} con {best}{" "}
          {best === 1 ? "par" : "pares"}.
        </p>
        <button onClick={() => restartMemo(roomId)} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
          Jugar de nuevo
        </button>
      </div>
    );
  }

  const currentId = state.order[state.turn];
  const current = state.players[currentId];
  const isMe = currentId === myClientId;
  const away = !isMe && !(currentId in presence);

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 text-center">
      <p className="font-display text-lg font-semibold" style={{ color: current?.color }}>
        {isMe ? "¡Te toca! Dá vuelta dos cartas." : `Le toca a ${current?.name ?? "?"}`}
      </p>
      {away && (
        <button
          onClick={() => skipTurn(roomId, state.turn)}
          className={`px-3 py-1 text-sm ${SECONDARY_BUTTON}`}
        >
          Se fue · saltar turno
        </button>
      )}
    </div>
  );
}

function Scoreboard({
  state,
  myClientId,
  presence,
}: {
  state: MemoState;
  myClientId: string;
  presence: Record<string, unknown>;
}) {
  const s = scores(state);
  const currentId = state.status === "playing" ? state.order[state.turn] : undefined;

  return (
    <aside className={`${CARD} w-full lg:w-64`}>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Pares</h2>
      <ul className="flex flex-col gap-1.5">
        {state.order.map((id) => {
          const p = state.players[id];
          const online = id in presence;
          return (
            <li
              key={id}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                id === currentId ? "bg-violet-500/15 ring-1 ring-violet-400/40" : ""
              } ${online ? "" : "opacity-40"}`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p?.color }} />
              <span className="flex-1 truncate text-sm text-slate-200">
                {p?.name ?? "?"}
                {id === myClientId && <span className="text-slate-500"> (vos)</span>}
              </span>
              <span className="font-mono text-sm font-semibold text-slate-100">{s[id] ?? 0}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
