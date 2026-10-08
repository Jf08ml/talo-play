"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import { formatClock } from "@/lib/format";
import {
  buildDeck,
  cardKey,
  flipCard,
  getMemoMeta,
  joinMemo,
  MISMATCH_REVEAL_MS,
  normalizeMeta,
  passTurn,
  resolveMismatch,
  restartMemo,
  scores,
  startMemo,
  subscribeMemo,
  type CardFace,
  type MemoConfig,
  type MemoState,
} from "@/lib/memotest";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useServerNow } from "@/hooks/useServerNow";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
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
  const [config, setConfig] = useState<MemoConfig | null>(null);
  const [hostId, setHostId] = useState("");
  const [state, setState] = useState<MemoState | null>(null);

  const me = identity.clientId && identity.name
    ? { clientId: identity.clientId, name: identity.name, color: identity.color }
    : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);

  // Load the room's setup, then follow its game state.
  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    getMemoMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "memotest") return router.replace(`/sala/${roomId}`);
        setConfig(normalizeMeta(meta));
        setHostId(meta.hostId ?? "");
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
  const deck = useMemo(
    () => (seed !== undefined && config ? buildDeck(seed, config) : []),
    [seed, config]
  );
  const rules = config?.rules;

  // A non-matching pair: show it for a moment, then flip it back. Every client
  // schedules this; the transaction makes sure it only happens once.
  const flippedKey = state?.flipped.join(",") ?? "";
  useEffect(() => {
    const pair = flippedKey.split(",").filter(Boolean).map(Number);
    if (!rules || pair.length !== 2 || deck[pair[0]]?.pair === deck[pair[1]]?.pair) return;
    const t = setTimeout(
      () => resolveMismatch(roomId, pair, rules).catch(console.error),
      MISMATCH_REVEAL_MS
    );
    return () => clearTimeout(t);
  }, [flippedKey, deck, roomId, rules]);

  // Clocks: per-turn countdown (turnos with a limit) or elapsed time (colab).
  const playing = state?.status === "playing";
  const timed = !!rules && (rules.mode === "colab" || rules.turnSeconds > 0);
  const now = useServerNow(playing && timed);
  const turnDeadline =
    rules && rules.mode === "turnos" && rules.turnSeconds > 0 && state
      ? state.turnStartedAt + rules.turnSeconds * 1000
      : 0;
  const turnExpired = playing && turnDeadline > 0 && now > 0 && now >= turnDeadline;

  // Time's up: any client passes the turn; the guard in passTurn applies it once.
  const turn = state?.turn ?? 0;
  const turnStartedAt = state?.turnStartedAt ?? 0;
  useEffect(() => {
    if (turnExpired) passTurn(roomId, turn, turnStartedAt).catch(console.error);
  }, [turnExpired, roomId, turn, turnStartedAt]);

  if (!configured) return <FirebaseSetupNotice />;

  const isColab = rules?.mode === "colab";
  const currentId = state && playing && !isColab ? state.order[state.turn] : undefined;
  const canFlip = !!state && playing && state.flipped.length < 2 && (isColab || currentId === identity.clientId);

  const total = deck.length;
  const isText = config?.kind === "texto";
  const cols = total <= 16 ? 4 : isText && total <= 24 ? 4 : 6;
  const cardMax = isText ? 120 : 96;

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="memotest"
        roomId={roomId}
        badges={
          isColab && (
            <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
              🤝 Cooperativo
            </span>
          )
        }
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={identity.clientId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="memotest" />
        )}

        {status === "loading" && <RoomLoading text="Mezclando las cartas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="memotest"
              roomId={roomId}
              hostId={hostId}
              players={state.order.map((id) => ({ id, ...state.players[id] }))}
              presence={presence}
              myId={identity.clientId}
              summary={memoSummary(config)}
              onStart={() => startMemo(roomId)}
            />
          </div>
        )}

        {status === "ready" && state && config && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 lg:flex-row lg:items-start">
            <div className="flex-1">
              <TurnBanner
                state={state}
                config={config}
                myClientId={identity.clientId}
                presence={presence}
                roomId={roomId}
                now={now}
                turnDeadline={turnDeadline}
              />

              <div
                className="mx-auto mt-4 grid gap-2 sm:gap-3"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  maxWidth: `${cols * cardMax}px`,
                }}
              >
                {deck.map((card, i) => {
                  const owner = state.matched[cardKey(i)];
                  const faceUp = owner !== undefined || state.flipped.includes(i);
                  return (
                    <MemoCard
                      key={`${state.seed}-${i}`}
                      face={card.face}
                      faceUp={faceUp}
                      ownerColor={owner ? state.players[owner]?.color : undefined}
                      disabled={!canFlip || faceUp}
                      onFlip={() =>
                        flipCard(roomId, identity.clientId, i, deck, config.rules).catch(console.error)
                      }
                    />
                  );
                })}
              </div>
            </div>

            <Scoreboard state={state} isColab={isColab} myClientId={identity.clientId} presence={presence} />
          </div>
        )}
      </main>
    </div>
  );
}

function CardFaceContent({ face }: { face: CardFace }) {
  if (face.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={face.url} alt="" draggable={false} className="h-full w-full rounded-[10px] object-cover" />;
  }
  if (face.kind === "text") {
    return (
      <span
        className={`break-words px-1 text-center text-[11px] font-semibold leading-tight sm:text-sm ${
          face.side === 0 ? "text-violet-200" : "text-cyan-200"
        }`}
      >
        {face.value}
      </span>
    );
  }
  return <span className="text-3xl sm:text-4xl">{face.value}</span>;
}

function MemoCard({
  face,
  faceUp,
  ownerColor,
  disabled,
  onFlip,
}: {
  face: CardFace;
  faceUp: boolean;
  ownerColor?: string;
  disabled: boolean;
  onFlip: () => void;
}) {
  return (
    <button
      onClick={onFlip}
      disabled={disabled}
      aria-label={faceUp ? (face.kind === "image" ? "Foto" : face.value) : "Carta boca abajo"}
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
          className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-xl border-2 bg-slate-800 [backface-visibility:hidden] [transform:rotateY(180deg)]"
          style={{
            borderColor: ownerColor ?? "rgba(148,163,184,0.4)",
            boxShadow: ownerColor ? `0 0 14px ${ownerColor}88` : undefined,
            opacity: ownerColor ? 0.85 : 1,
          }}
        >
          <CardFaceContent face={face} />
        </div>
      </div>
    </button>
  );
}

const KIND_LABEL: Record<MemoConfig["kind"], string> = { emoji: "emojis", fotos: "fotos", texto: "pares de texto" };

function memoSummary(config: MemoConfig): string {
  const { rules } = config;
  const mode =
    rules.mode === "colab"
      ? "Cooperativo contra reloj"
      : `Por turnos${rules.turnSeconds ? `, ${rules.turnSeconds} s cada uno` : ""}`;
  return `${config.pairs} pares de ${KIND_LABEL[config.kind]} · ${mode}`;
}

function TurnBanner({
  state,
  config,
  myClientId,
  presence,
  roomId,
  now,
  turnDeadline,
}: {
  state: MemoState;
  config: MemoConfig;
  myClientId: string;
  presence: Record<string, unknown>;
  roomId: string;
  now: number;
  turnDeadline: number;
}) {
  const isColab = config.rules.mode === "colab";

  if (state.status === "finished") {
    let title: string;
    let detail: string;
    let celebrate = true;
    if (isColab) {
      title = "🎉 ¡Lo resolvieron!";
      detail = `En ${formatClock(state.finishedAt - state.startedAt)} y ${state.moves} intentos.`;
    } else {
      const s = scores(state);
      const best = Math.max(...Object.values(s));
      const winners = state.order.filter((id) => s[id] === best);
      const names = winners.map((id) => (id === myClientId ? "vos" : state.players[id]?.name ?? "?"));
      celebrate = winners.includes(myClientId);
      title = celebrate ? "🎉 ¡Ganaste!" : "🏁 ¡Terminó la partida!";
      detail = `${winners.length > 1 ? `Empate entre ${names.join(" y ")}` : `Ganó ${names[0]}`} con ${best} ${
        best === 1 ? "par" : "pares"
      }.`;
    }
    return (
      <div
        className={`animate-celebration-in flex flex-col items-center gap-3 rounded-2xl border bg-slate-900 p-5 text-center ${
          celebrate
            ? "border-emerald-500/25 shadow-[0_0_40px_rgba(52,211,153,0.2)]"
            : "border-violet-500/20"
        }`}
      >
        <p className="font-display text-xl font-semibold text-slate-100">{title}</p>
        <p className="text-sm text-slate-400">{detail}</p>
        <button onClick={() => restartMemo(roomId)} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
          Jugar de nuevo
        </button>
      </div>
    );
  }

  if (isColab) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-4 text-center">
        <p className="font-display text-lg font-semibold text-emerald-300">
          ¡Todos a la vez! Encuentren los pares.
        </p>
        <span className="font-mono text-lg text-slate-200">⏱ {formatClock(now - state.startedAt)}</span>
        <span className="text-sm text-slate-400">{state.moves} intentos</span>
      </div>
    );
  }

  const currentId = state.order[state.turn];
  const current = state.players[currentId];
  const isMe = currentId === myClientId;
  const away = !isMe && !(currentId in presence);
  const secondsLeft = turnDeadline && now ? Math.max(0, Math.ceil((turnDeadline - now) / 1000)) : null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 text-center">
      <p className="font-display text-lg font-semibold" style={{ color: current?.color }}>
        {isMe ? "¡Te toca! Dá vuelta dos cartas." : `Le toca a ${current?.name ?? "?"}`}
      </p>
      {secondsLeft !== null && (
        <span
          className={`rounded-md px-2 py-0.5 font-mono text-sm ${
            secondsLeft <= 5 ? "bg-red-500/15 text-red-300" : "bg-slate-800 text-slate-300"
          }`}
        >
          ⏱ {secondsLeft}s
        </span>
      )}
      {away && (
        <button
          onClick={() => passTurn(roomId, state.turn, state.turnStartedAt)}
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
  isColab,
  myClientId,
  presence,
}: {
  state: MemoState;
  isColab: boolean;
  myClientId: string;
  presence: Record<string, unknown>;
}) {
  const s = scores(state);
  const currentId = state.status === "playing" && !isColab ? state.order[state.turn] : undefined;

  return (
    <aside className={`${CARD} w-full lg:w-64`}>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
        {isColab ? "Pares encontrados" : "Pares"}
      </h2>
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
