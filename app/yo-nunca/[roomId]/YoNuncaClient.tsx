"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  MIN_PLAYERS,
  answer,
  getYoNuncaMeta,
  joinYoNunca,
  nextPhrase,
  normalizeMeta,
  playAgain,
  promptFor,
  revealNow,
  startYoNunca,
  subscribeYoNunca,
  type YoNuncaState,
} from "@/lib/yonunca";
import { YONUNCA_LEVELS, yoNuncaPool } from "@/lib/yonuncaPrompts";
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
interface Config {
  hostId: string;
  pool: string[];
  total: number;
  summary: string;
}

export default function YoNuncaClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [roomMeta, setRoomMeta] = useState<RawMeta | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [state, setState] = useState<YoNuncaState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  // Presence starts empty: only trust "X isn't here" once I see myself in it.
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getYoNuncaMeta>>>>(
      roomId,
      (meta) => {
        if (cancelled) return;
        setRoomMeta(meta);
        if (!meta) return setStatus("not-found");
        if (meta.game !== "yonunca") return router.replace(`/sala/${roomId}`);
        const m = normalizeMeta(meta);
        const pool = yoNuncaPool(m.levels);
        const total = Math.min(m.questions, pool.length);
        const levels = YONUNCA_LEVELS.filter((l) => m.levels.includes(l.id)).map((l) => `${l.emoji} ${l.label}`);
        setConfig({ hostId: meta.hostId ?? "", pool, total, summary: `${total} frases · ${levels.join(" + ")}` });
        unsub ??= subscribeYoNunca(roomId, setState);
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
    joinYoNunca(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  const connected = state ? Object.keys(state.players).filter((id) => id in presence) : [];
  // Someone may leave without answering: reveal once everyone still here did.
  const allAnswered =
    state?.status === "answering" &&
    presenceLoaded &&
    connected.length > 0 &&
    connected.every((id) => id in state.answers);
  const qNo = state?.qNo ?? 0;
  useEffect(() => {
    if (allAnswered) revealNow(roomId, qNo).catch(console.error);
  }, [allAnswered, roomId, qNo]);

  if (!configured) return <FirebaseSetupNotice />;

  const prompt = state && config ? promptFor(state.seed, config.pool, state.qNo) : "";

  return (
    <div className="flex min-h-dvh flex-col">
      <RoomHeader
        game="yonunca"
        roomId={roomId}
        right={status === "ready" && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      <main className="relative flex flex-1 flex-col">
        {identity.clientId && !identity.name && (
          <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="yonunca" />
        )}

        {status === "loading" && <RoomLoading text="Barajando las frases…" />}
        {status === "not-found" && <RoomNotFound />}
        {status === "error" && <RoomError message="No se pudo cargar la sala." />}

        {status === "ready" && state && config && state.status === "waiting" && (
          <div className="mx-auto w-full max-w-2xl p-4">
            <WaitingRoom
              game="yonunca"
              roomId={roomId}
              hostId={config.hostId}
              players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
              presence={presence}
              myId={myId}
              summary={config.summary}
              settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={roomMeta} />}
              minToStart={MIN_PLAYERS}
              onStart={() => startYoNunca(roomId, connected.length)}
            />
          </div>
        )}

        {status === "ready" && state && config && state.status !== "waiting" && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-col gap-4 lg:flex-1">
              {state.status !== "finished" && <PhraseCard prompt={prompt} qNo={state.qNo} total={config.total} />}
              {state.status === "answering" && (
                <AnswerPanel roomId={roomId} state={state} myId={myId} connected={connected} />
              )}
              {state.status === "reveal" && (
                <RevealPanel
                  state={state}
                  myId={myId}
                  last={state.qNo + 1 >= config.total}
                  onNext={() => nextPhrase(roomId, state.qNo, config.total)}
                />
              )}
              {state.status === "finished" && (
                <FinalPanel state={state} myId={myId} onAgain={() => playAgain(roomId, state.gameNo)} />
              )}
              {state.status === "finished" && (
                <BackToRoomButton roomId={roomId} stateKey="yonunca/state" hostId={config.hostId} presence={presence} myId={myId} />
              )}
            </div>
            <Scoreboard state={state} presence={presence} myId={myId} />
          </div>
        )}
      </main>
    </div>
  );
}

function nameOf(state: YoNuncaState, id: string, myId: string): string {
  return id === myId ? "Vos" : (state.players[id]?.name ?? "?");
}

function Avatar({ state, id, size = "h-8 w-8 text-sm" }: { state: YoNuncaState; id: string; size?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${size}`}
      style={{ backgroundColor: state.players[id]?.color ?? "#64748b" }}
      title={state.players[id]?.name}
    >
      {state.players[id]?.name.slice(0, 1).toUpperCase() ?? "?"}
    </span>
  );
}

function PhraseCard({ prompt, qNo, total }: { prompt: string; qNo: number; total: number }) {
  return (
    <div
      key={qNo}
      className="animate-celebration-in flex flex-col items-center gap-2 rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-950/50 to-slate-900 p-6 text-center shadow-[0_0_35px_rgba(251,191,36,0.15)]"
    >
      <span className="text-xs uppercase tracking-wide text-slate-500">
        Frase {qNo + 1} de {total}
      </span>
      <p className="font-display text-sm font-medium text-amber-200">Yo nunca nunca…</p>
      <p className="font-display text-2xl font-bold text-slate-100 sm:text-3xl">{prompt}</p>
    </div>
  );
}

function AnswerPanel({
  roomId,
  state,
  myId,
  connected,
}: {
  roomId: string;
  state: YoNuncaState;
  myId: string;
  connected: string[];
}) {
  const mine = state.answers[myId];
  const answered = connected.filter((id) => id in state.answers);
  const needed = Math.max(1, connected.length);

  return (
    <div className={`${CARD} flex flex-col items-center gap-4 text-center`}>
      <p className="text-sm text-slate-300">
        {mine === undefined ? "¿Lo hiciste alguna vez? Nadie ve tu respuesta hasta el final." : "Listo. Podés cambiarla hasta que contesten todos."}
      </p>
      <div className="grid w-full max-w-sm grid-cols-2 gap-3">
        <button
          onClick={() => answer(roomId, state.qNo, myId, true, needed)}
          className={`rounded-2xl py-5 font-display text-2xl font-bold transition ${
            mine === true
              ? "bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-[0_0_25px_rgba(251,146,60,0.5)]"
              : "border-2 border-amber-400/50 text-amber-200 hover:bg-amber-500/10"
          }`}
        >
          🙋 Yo sí
        </button>
        <button
          onClick={() => answer(roomId, state.qNo, myId, false, needed)}
          className={`rounded-2xl py-5 font-display text-2xl font-bold transition ${
            mine === false
              ? "bg-gradient-to-br from-slate-500 to-slate-700 text-white shadow-[0_0_25px_rgba(148,163,184,0.4)]"
              : "border-2 border-slate-500/60 text-slate-300 hover:bg-slate-500/10"
          }`}
        >
          🙅 Yo no
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {connected.map((id) => (
          <span
            key={id}
            className={`rounded-full px-2.5 py-1 text-xs ${
              id in state.answers ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-500"
            }`}
          >
            {id in state.answers ? "✓ " : ""}
            {nameOf(state, id, myId)}
          </span>
        ))}
      </div>
      {answered.length > 0 && answered.length < connected.length && (
        <button onClick={() => revealNow(roomId, state.qNo)} className="text-xs text-slate-500 underline hover:text-slate-300">
          Revelar sin esperar ({answered.length} de {connected.length})
        </button>
      )}
    </div>
  );
}

function RevealPanel({
  state,
  myId,
  last,
  onNext,
}: {
  state: YoNuncaState;
  myId: string;
  last: boolean;
  onNext: () => void;
}) {
  const yes = Object.keys(state.answers).filter((id) => state.answers[id]);
  const no = Object.keys(state.answers).filter((id) => !state.answers[id]);

  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      <p className="animate-celebration-in text-center font-display text-2xl font-bold text-slate-100">
        {yes.length === 0
          ? "😇 ¡Nadie! Grupo de santos."
          : yes.length === Object.keys(state.answers).length
            ? "😈 ¡Todos!"
            : `🙋 ${yes.length} ${yes.length === 1 ? "lo hizo" : "lo hicieron"}`}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Column title="Yo sí" tone="text-amber-300" ids={yes} state={state} myId={myId} />
        <Column title="Yo no" tone="text-slate-400" ids={no} state={state} myId={myId} />
      </div>
      {yes.length > 0 && (
        <p className="text-center text-sm text-slate-400">¡Que cuenten la historia! 👀</p>
      )}
      <button onClick={onNext} className={`w-full max-w-xs self-center ${PRIMARY_BUTTON}`}>
        {last ? "Ver resultados" : "Siguiente frase"}
      </button>
    </div>
  );
}

function Column({ title, tone, ids, state, myId }: { title: string; tone: string; ids: string[]; state: YoNuncaState; myId: string }) {
  return (
    <div className="rounded-xl bg-slate-950/40 p-3">
      <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${tone}`}>{title}</p>
      {ids.length === 0 ? (
        <p className="text-sm text-slate-600">Nadie</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <li key={id} className="flex items-center gap-1.5 rounded-full bg-slate-800/80 py-1 pl-1 pr-3 text-sm text-slate-200">
              <Avatar state={state} id={id} size="h-6 w-6 text-xs" />
              {nameOf(state, id, myId)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FinalPanel({ state, myId, onAgain }: { state: YoNuncaState; myId: string; onAgain: () => void }) {
  const rows = Object.keys(state.players).sort((a, b) => (state.counts[b] ?? 0) - (state.counts[a] ?? 0));
  const top = rows[0];
  const saint = rows[rows.length - 1];
  return (
    <div className="animate-celebration-in flex flex-col items-center gap-4 rounded-2xl border border-amber-400/25 bg-slate-900 p-6 text-center shadow-[0_0_40px_rgba(251,191,36,0.15)]">
      <p className="font-display text-2xl font-semibold text-slate-100">🏁 ¡Terminó!</p>
      {top && (state.counts[top] ?? 0) > 0 && (
        <p className="text-slate-300">
          😈 {top === myId ? "Vos sos" : `${nameOf(state, top, myId)} es`} quien más vivió ({state.counts[top]}).
        </p>
      )}
      {saint && saint !== top && (
        <p className="text-slate-400">
          😇 {saint === myId ? "Vos sos" : `${nameOf(state, saint, myId)} es`} el/la más santo/a ({state.counts[saint] ?? 0}).
        </p>
      )}
      <button onClick={onAgain} className={`w-full max-w-xs ${SECONDARY_BUTTON}`}>
        Jugar de nuevo con otras frases
      </button>
    </div>
  );
}

function Scoreboard({ state, presence, myId }: { state: YoNuncaState; presence: PresenceMap; myId: string }) {
  const rows = Object.keys(state.players)
    .filter((id) => id in presence || (state.counts[id] ?? 0) > 0)
    .sort((a, b) => (state.counts[b] ?? 0) - (state.counts[a] ?? 0));
  return (
    <aside className={`${CARD} !p-4 w-full lg:w-72`}>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Veces que dijo “yo sí”</h2>
      <ol className="flex flex-col gap-1.5 text-sm">
        {rows.map((id) => (
          <li key={id} className={`flex items-center gap-2 ${id in presence ? "" : "opacity-40"}`}>
            <span className="flex-1 truncate" style={{ color: state.players[id]?.color }}>
              {nameOf(state, id, myId)}
            </span>
            <span className="w-8 text-right font-mono text-slate-200">{state.counts[id] ?? 0}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
