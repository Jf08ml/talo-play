"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import { formatClock } from "@/lib/format";
import {
  arrowTarget,
  correctCount,
  gameKey,
  getDeslizMeta,
  isSolved,
  joinDesliz,
  newRace,
  reportFinish,
  saveBoard,
  scramble,
  slide,
  startRace,
  subscribeDesliz,
  type DeslizState,
  type PlayerBoard,
} from "@/lib/deslizante";
import type { PresenceMap } from "@/lib/presence";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useServerNow } from "@/hooks/useServerNow";
import SlidingBoard from "@/components/deslizante/SlidingBoard";
import NamePrompt from "@/components/NamePrompt";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { CARD, PRIMARY_BUTTON } from "@/components/ui";

type Status = "loading" | "not-found" | "ready" | "error";
type Config = { size: number; imageUrl: string; showNumbers: boolean };

export default function DeslizanteClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [config, setConfig] = useState<Config | null>(null);
  const [state, setState] = useState<DeslizState | null>(null);
  const [boards, setBoards] = useState<Record<string, Record<string, PlayerBoard>>>({});
  // My board as I play it; newer than the copy in the database.
  const [local, setLocal] = useState<{ gk: string; board: PlayerBoard } | null>(null);
  const [showImage, setShowImage] = useState(false);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    getDeslizMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "deslizante") return router.replace(`/sala/${roomId}`);
        setConfig({ size: meta.size ?? 4, imageUrl: meta.imageUrl ?? "", showNumbers: meta.showNumbers ?? true });
        unsub = subscribeDesliz(roomId, (data) => {
          setState(data.state);
          setBoards(data.boards);
        });
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
    joinDesliz(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const gk = state ? gameKey(state) : "";
  const seed = state?.seed;
  const size = config?.size ?? 0;
  const start = useMemo(
    () => (seed !== undefined && size ? scramble(size, seed) : []),
    [seed, size]
  );
  const savedMine = boards[gk]?.[myId];
  const myBoard: PlayerBoard =
    local?.gk === gk ? local.board : savedMine?.tiles.length ? savedMine : { tiles: start, moves: 0 };

  const racing = state?.status === "racing";
  const iFinished = !!state?.results[myId];
  // Keeps ticking after someone wins, so the rest can still finish their boards.
  const now = useServerNow(racing && !iFinished);
  const countingDown = racing && (now === 0 || now < (state?.startedAt ?? 0));
  const canMove = racing && !countingDown && !iFinished;

  const move = (pos: number) => {
    if (!canMove) return;
    const { tiles, moved } = slide(myBoard.tiles, size, pos);
    if (!moved) return;
    const board = { tiles, moves: myBoard.moves + moved };
    setLocal({ gk, board });
    saveBoard(roomId, gk, myId, board).catch(console.error);
  };

  // Arrow keys slide the tile next to the gap.
  useEffect(() => {
    if (!canMove) return;
    const onKey = (e: KeyboardEvent) => {
      const target = arrowTarget(myBoard.tiles, size, e.key);
      if (target < 0) return;
      e.preventDefault();
      move(target);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Solved: report my time (once per race).
  const solved = isSolved(myBoard.tiles) && myBoard.moves > 0;
  const gameNo = state?.gameNo ?? 0;
  const moves = myBoard.moves;
  useEffect(() => {
    if (racing && solved && !iFinished) reportFinish(roomId, gameNo, myId, moves).catch(console.error);
  }, [racing, solved, iFinished, roomId, gameNo, myId, moves]);

  if (!configured) return <FirebaseSetupNotice />;

  const total = size * size - 1;
  const others = state ? Object.keys(state.players).filter((id) => id !== myId && (id in presence || state.results[id])) : [];

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="deslizante"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" />
        )}

        {status === "loading" && <RoomLoading text="Mezclando las fichas…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
            <div className="flex w-full flex-col gap-3 lg:max-w-[560px]">
              <TopBar
                state={state}
                myId={myId}
                now={now}
                correct={correctCount(myBoard.tiles)}
                total={total}
                moves={myBoard.moves}
                onStart={() => startRace(roomId)}
                onNewRace={() => newRace(roomId, state.gameNo)}
              />

              <div className="relative">
                <SlidingBoard
                  tiles={myBoard.tiles}
                  size={config.size}
                  imageUrl={config.imageUrl}
                  showNumbers={config.showNumbers}
                  onTileClick={canMove ? move : undefined}
                />
                {state.status === "waiting" && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-950/70 p-6 text-center">
                    <p className="font-display text-lg text-slate-200">
                      Esta es la mezcla. Cuando estén todos, arranquen la carrera.
                    </p>
                  </div>
                )}
                {countingDown && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-950/60">
                    <span key={Math.ceil((state.startedAt - now) / 1000)} className="animate-celebration-in font-display text-8xl font-bold text-white drop-shadow-[0_0_25px_rgba(168,85,247,0.8)]">
                      {now ? Math.max(1, Math.ceil((state.startedAt - now) / 1000)) : ""}
                    </span>
                  </div>
                )}
                {iFinished && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                    <span className="animate-celebration-in rounded-full bg-emerald-500/90 px-4 py-1.5 text-sm font-semibold text-white shadow-lg">
                      ✓ ¡Armado en {formatClock(state.results[myId].ms)}!
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowImage((v) => !v)}
                className="self-start text-sm text-violet-400 hover:text-violet-300"
              >
                {showImage ? "Ocultar imagen" : "👁 Ver la imagen armada"}
              </button>
              {showImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={config.imageUrl} alt="Imagen armada" className="w-40 rounded-lg ring-1 ring-violet-500/30" />
              )}
            </div>

            <aside className="flex w-full flex-1 flex-col gap-4">
              {Object.keys(state.results).length > 0 && <Ranking state={state} myId={myId} />}
              <div className={`${CARD} !p-4`}>
                <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Rivales</h2>
                {others.length === 0 ? (
                  <p className="text-sm text-slate-500">Compartí el enlace para que se sumen otros.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {others.map((id) => (
                      <Opponent
                        key={id}
                        state={state}
                        id={id}
                        board={boards[gk]?.[id]}
                        start={start}
                        config={config}
                        presence={presence}
                        total={total}
                      />
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function TopBar({
  state,
  myId,
  now,
  correct,
  total,
  moves,
  onStart,
  onNewRace,
}: {
  state: DeslizState;
  myId: string;
  now: number;
  correct: number;
  total: number;
  moves: number;
  onStart: () => void;
  onNewRace: () => void;
}) {
  if (state.status === "waiting") {
    return (
      <div className={`${CARD} flex flex-col items-center gap-3 text-center`}>
        <p className="text-sm text-slate-400">
          Todos reciben la misma mezcla. Tocá una ficha en la fila o columna del hueco para deslizarla (o usá las flechas).
        </p>
        <button onClick={onStart} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
          Empezar carrera
        </button>
      </div>
    );
  }

  if (state.winner) {
    const w = state.results[state.winner];
    const name = state.winner === myId ? "Vos" : state.players[state.winner]?.name ?? "?";
    return (
      <div
        className={`animate-celebration-in flex flex-col items-center gap-2 rounded-2xl border bg-slate-900 p-4 text-center ${
          state.winner === myId ? "border-emerald-500/25 shadow-[0_0_40px_rgba(52,211,153,0.2)]" : "border-violet-500/20"
        }`}
      >
        <p className="font-display text-xl font-semibold text-slate-100">
          {state.winner === myId ? "🎉 ¡Ganaste!" : `🏁 ¡${name} lo armó primero!`}
        </p>
        <p className="text-sm text-slate-400">
          {formatClock(w.ms)} · {w.moves} movimientos
          {!state.results[myId] && " · Podés terminar el tuyo igual."}
        </p>
        <button onClick={onNewRace} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
          Nueva carrera
        </button>
      </div>
    );
  }

  const elapsed = now && now > state.startedAt ? now - state.startedAt : 0;
  return (
    <div className={`${CARD} !py-3 flex items-center justify-between gap-3`}>
      <span className="font-mono text-2xl text-slate-100">⏱ {formatClock(elapsed)}</span>
      <span className="text-sm text-slate-400">
        <span className="font-semibold text-emerald-300">{correct}</span>/{total} en su lugar
      </span>
      <span className="text-sm text-slate-400">{moves} mov.</span>
    </div>
  );
}

function Ranking({ state, myId }: { state: DeslizState; myId: string }) {
  const rows = Object.entries(state.results).sort((a, b) => a[1].ms - b[1].ms);
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className={`${CARD} !p-4`}>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Llegadas</h2>
      <ol className="flex flex-col gap-1 text-sm">
        {rows.map(([id, r], i) => (
          <li key={id} className="flex items-center gap-2">
            <span className="w-6">{medals[i] ?? `${i + 1}.`}</span>
            <span className="flex-1 truncate" style={{ color: state.players[id]?.color }}>
              {id === myId ? "Vos" : state.players[id]?.name ?? "?"}
            </span>
            <span className="font-mono text-slate-200">{formatClock(r.ms)}</span>
            <span className="w-16 text-right text-xs text-slate-500">{r.moves} mov.</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Opponent({
  state,
  id,
  board,
  start,
  config,
  presence,
  total,
}: {
  state: DeslizState;
  id: string;
  board: PlayerBoard | undefined;
  start: number[];
  config: Config;
  presence: PresenceMap;
  total: number;
}) {
  const tiles = board?.tiles.length ? board.tiles : start;
  const done = state.results[id];
  return (
    <div className={`flex flex-col gap-1 ${id in presence ? "" : "opacity-50"}`}>
      <SlidingBoard tiles={tiles} size={config.size} imageUrl={config.imageUrl} showNumbers={false} compact />
      <p className="truncate text-xs" style={{ color: state.players[id]?.color }}>
        {state.players[id]?.name ?? "?"}
      </p>
      <p className="text-[11px] text-slate-500">
        {done ? `✓ ${formatClock(done.ms)}` : `${correctCount(tiles)}/${total} · ${board?.moves ?? 0} mov.`}
      </p>
    </div>
  );
}
