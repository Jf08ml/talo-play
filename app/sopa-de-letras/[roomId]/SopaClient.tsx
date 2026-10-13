"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  LEVELS,
  buildSoup,
  claimWord,
  foundCounts,
  getSopaMeta,
  joinSopa,
  leaders,
  lineBetween,
  normalizeMeta,
  playAgain,
  startSopa,
  subscribeSopa,
  wordAt,
  type SopaLevel,
  type SopaState,
} from "@/lib/sopa";
import { SOPA_THEME_OPTIONS, type SopaTheme } from "@/lib/sopaWords";
import type { PresenceMap } from "@/lib/presence";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useServerNow } from "@/hooks/useServerNow";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { CARD, PRIMARY_BUTTON } from "@/components/ui";

type Status = "loading" | "not-found" | "ready" | "error";
type Config = { hostId: string; theme: SopaTheme; level: SopaLevel };

export default function SopaClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [config, setConfig] = useState<Config | null>(null);
  const [state, setState] = useState<SopaState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    getSopaMeta(roomId)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) return setStatus("not-found");
        if (meta.game !== "sopa") return router.replace(`/sala/${roomId}`);
        setConfig({ ...normalizeMeta(meta), hostId: meta.hostId ?? "" });
        unsub = subscribeSopa(roomId, setState);
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
    joinSopa(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const seed = state?.seed;
  const soup = useMemo(
    () => (seed !== undefined && config ? buildSoup(seed, config.theme, config.level) : null),
    [seed, config]
  );
  const now = useServerNow(state?.status === "playing", 250);

  if (!configured) return <FirebaseSetupNotice />;

  const themeInfo = config ? SOPA_THEME_OPTIONS.find((t) => t.id === config.theme) : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="sopa"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="sopa" />
        )}

        {status === "loading" && <RoomLoading text="Revolviendo las letras…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="sopa"
              roomId={roomId}
              hostId={config.hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={`${themeInfo?.emoji} ${themeInfo?.label} · ${LEVELS[config.level].label} · ${LEVELS[config.level].words} palabras`}
              onStart={() => startSopa(roomId)}
            />
          </div>
        )}

        {status === "ready" && state && config && soup && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {state.status === "finished" && (
                <ResultBanner state={state} myId={myId} onAgain={() => playAgain(roomId, state.gameNo)} />
              )}
              <Board key={state.gameNo} roomId={roomId} state={state} myId={myId} soup={soup} now={now} />
            </div>
            <Sidebar state={state} presence={presence} myId={myId} soup={soup} />
          </div>
        )}
      </main>
    </div>
  );
}

function Board({
  roomId,
  state,
  myId,
  soup,
  now,
}: {
  roomId: string;
  state: SopaState;
  myId: string;
  soup: ReturnType<typeof buildSoup>;
  now: number;
}) {
  const [start, setStart] = useState<number | null>(null);
  const [miss, setMiss] = useState(0);
  const countdown = state.status === "playing" && (now === 0 || now < state.startedAt);
  const playing = state.status === "playing" && !countdown;

  // Every found word's cells, painted with the finder's color.
  const owner = new Map<number, string>();
  for (const w of soup.words) {
    const by = state.found[w.word];
    if (by) for (const c of w.cells) owner.set(c, state.players[by]?.color ?? "#64748b");
  }

  const tap = (cell: number) => {
    if (!playing) return;
    if (start === null) return setStart(cell);
    if (cell === start) return setStart(null);
    const line = lineBetween(soup.size, start, cell);
    const word = line ? wordAt(soup, line) : null;
    if (word && !state.found[word.word]) {
      claimWord(roomId, myId, word.word, soup.words.length).catch(console.error);
      setStart(null);
    } else {
      setMiss((m) => m + 1);
      setStart(null);
    }
  };

  if (countdown) {
    return (
      <div className={`${CARD} flex flex-col items-center gap-3 py-16 text-center`}>
        <p className="text-sm uppercase tracking-wide text-slate-500">¿Listos?</p>
        <span
          key={Math.ceil((state.startedAt - now) / 1000)}
          className="animate-celebration-in font-display text-8xl font-bold text-white drop-shadow-[0_0_25px_rgba(132,204,22,0.7)]"
        >
          {now ? Math.max(1, Math.ceil((state.startedAt - now) / 1000)) : ""}
        </span>
      </div>
    );
  }

  return (
    <div className={`${CARD} !p-2 flex flex-col items-center gap-2 sm:!p-4`}>
      <div
        key={miss}
        className={`grid w-full max-w-lg select-none gap-[2px] ${miss ? "animate-shake" : ""}`}
        style={{ gridTemplateColumns: `repeat(${soup.size}, minmax(0, 1fr))` }}
      >
        {soup.letters.map((ch, i) => {
          const color = owner.get(i);
          const isStart = i === start;
          return (
            <button
              key={i}
              onClick={() => tap(i)}
              disabled={!playing}
              className={`flex aspect-square items-center justify-center rounded-[4px] font-mono text-[11px] font-bold transition sm:text-base ${
                isStart ? "bg-lime-400 text-slate-900 ring-2 ring-white" : color ? "text-slate-950" : "bg-slate-800/70 text-slate-200 hover:bg-slate-700"
              }`}
              style={!isStart && color ? { backgroundColor: color } : undefined}
            >
              {ch}
            </button>
          );
        })}
      </div>
      {playing && (
        <p className="text-center text-xs text-slate-500">
          {start === null ? "Tocá la primera letra de una palabra…" : "…y ahora la última."}
        </p>
      )}
    </div>
  );
}

function Sidebar({
  state,
  presence,
  myId,
  soup,
}: {
  state: SopaState;
  presence: PresenceMap;
  myId: string;
  soup: ReturnType<typeof buildSoup>;
}) {
  const counts = foundCounts(state.found);
  const rows = Object.keys(state.players)
    .filter((id) => id in presence || (counts[id] ?? 0) > 0)
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  const words = [...soup.words].sort((a, b) => a.word.localeCompare(b.word, "es"));
  return (
    <aside className="flex w-full flex-col gap-4 lg:w-72">
      <div className={`${CARD} !p-4`}>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Palabras ({Object.keys(state.found).length}/{soup.words.length})
        </h2>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          {words.map((w) => {
            const by = state.found[w.word];
            return (
              <li
                key={w.word}
                className={`truncate font-mono ${by ? "line-through opacity-80" : "text-slate-200"}`}
                style={by ? { color: state.players[by]?.color } : undefined}
              >
                {w.word}
              </li>
            );
          })}
        </ul>
      </div>
      <div className={`${CARD} !p-4`}>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Encontradas</h2>
        <ol className="flex flex-col gap-1.5 text-sm">
          {rows.map((id) => (
            <li key={id} className={`flex items-center gap-2 ${id in presence ? "" : "opacity-40"}`}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: state.players[id]?.color }} />
              <span className="flex-1 truncate text-slate-200">{id === myId ? "Vos" : (state.players[id]?.name ?? "?")}</span>
              {(state.wins[id] ?? 0) > 0 && <span className="text-xs text-slate-500">{state.wins[id]} 🏆</span>}
              <span className="w-6 text-right font-mono text-slate-200">{counts[id] ?? 0}</span>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

function ResultBanner({ state, myId, onAgain }: { state: SopaState; myId: string; onAgain: () => void }) {
  const top = leaders(state.found);
  const iWon = top.length === 1 && top[0] === myId;
  const name = (id: string) => (id === myId ? "vos" : (state.players[id]?.name ?? "?"));
  const title =
    top.length > 1 ? `🤝 ¡Empate entre ${top.map(name).join(" y ")}!` : iWon ? "🎉 ¡Encontraste más que nadie!" : `🏆 ¡Ganó ${name(top[0] ?? "")}!`;
  return (
    <div
      className={`animate-celebration-in flex flex-col items-center gap-3 rounded-2xl border bg-slate-900 p-4 text-center ${
        iWon ? "border-emerald-500/25 shadow-[0_0_40px_rgba(52,211,153,0.2)]" : "border-violet-500/20"
      }`}
    >
      <p className="font-display text-xl font-semibold text-slate-100">{title}</p>
      <button onClick={onAgain} className={`w-full max-w-xs ${PRIMARY_BUTTON}`}>
        Otra sopa
      </button>
    </div>
  );
}
