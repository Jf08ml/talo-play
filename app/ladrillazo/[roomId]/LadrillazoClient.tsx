"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flag, Skull, Smartphone } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  MODES,
  getLadriMeta,
  joinLadri,
  nextOnlineRound,
  normalizeMeta,
  playAgain,
  playerInfo,
  startLadri,
  subscribeLadri,
  type LadriMeta,
  type LadriState,
} from "@/lib/ladrillazo";
import { CAMPAIGN } from "@/lib/ladrillazoLevels";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useServerNow } from "@/hooks/useServerNow";
import { serverNow } from "@/lib/serverTime";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { Confetti } from "@/components/Results";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { BackToRoomButton, RoomSettingsEditor } from "@/components/RoomSettings";
import { watchRoomMeta } from "@/lib/roomSettings";
import { CARD, PRIMARY_BUTTON } from "@/components/ui";
import { formatTime } from "@/components/ladrillazo/Hud";
import { SETTINGS } from "../settings";

const RaceGame = dynamic(() => import("@/components/ladrillazo/RaceGame"), { ssr: false });
const SharedGame = dynamic(() => import("@/components/ladrillazo/SharedGame"), { ssr: false });

type Status = "loading" | "not-found" | "ready" | "error";

function summary(meta: LadriMeta): string {
  const mode = MODES.find((m) => m.id === meta.mode)?.label ?? "";
  const level = meta.level >= 0 ? `nivel ${meta.level + 1}: ${CAMPAIGN[meta.level]?.name}` : "nivel al azar";
  if (meta.mode === "duelo") return `${mode} · a ${meta.goals} goles`;
  if (meta.mode === "coop") return `${mode} · ${level}`;
  const bots = meta.bots ? ` · ${meta.bots} ${meta.bots === 1 ? "bot" : "bots"}` : "";
  return meta.mode === "carrera" ? `${mode} · ${level}${bots}` : `${mode}${bots}`;
}

export default function LadrillazoClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<LadriMeta | null>(null);
  const [state, setState] = useState<LadriState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getLadriMeta>>>>(
      roomId,
      (raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== "ladrillazo") return router.replace(`/sala/${roomId}`);
        setMeta(normalizeMeta(raw));
        unsub ??= subscribeLadri(roomId, setState);
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
    joinLadri(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, roomId, identity.clientId, identity.name, identity.color]);

  // Online: the next round starts by itself once the results were shown.
  const online = !!state?.online;
  const waitingNext = online && !!state && state.status !== "playing" && presenceLoaded && !!state.players[myId];
  const nextAt = state?.nextAt ?? 0;
  const connectedKey = Object.keys(presence).sort().join(",");
  useEffect(() => {
    if (!waitingNext) return;
    const wait = Math.max(0, nextAt - serverNow()) + Math.random() * 400;
    const t = setTimeout(() => nextOnlineRound(roomId, connectedKey.split(",")).catch(console.error), wait);
    return () => clearTimeout(t);
  }, [waitingNext, nextAt, roomId, connectedKey]);

  if (!configured) return <FirebaseSetupNotice />;

  const connected = Object.keys(presence);
  const playing = status === "ready" && state && meta && state.status === "playing";

  return (
    <div className={`flex flex-col bg-talo-ink ${playing ? "h-dvh overflow-hidden" : "min-h-dvh"}`}>
      <RoomHeader
        game="ladrillazo"
        roomId={roomId}
        social={!online}
        right={status === "ready" && !playing && <PlayerBadges presence={presence} myClientId={myId} />}
      />

      {identity.clientId && !identity.name && <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="ladrillazo" />}

      {status === "loading" && <RoomLoading text="Apilando ladrillos…" />}
      {status === "not-found" && <RoomNotFound />}
      {status === "error" && <RoomError message="No se pudo cargar la sala." />}

      {status === "ready" && state && meta && state.status === "waiting" && !online && (
        <main className="mx-auto w-full max-w-2xl p-4">
          <WaitingRoom
            game="ladrillazo"
            roomId={roomId}
            hostId={meta.hostId ?? ""}
            players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
            presence={presence}
            myId={myId}
            summary={summary(meta)}
            settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={meta} />}
            onStart={() => startLadri(roomId, meta, connected)}
          >
            <div className="flex gap-2.5 rounded-xl bg-white/[0.06] p-3 text-sm text-white/80 ring-1 ring-white/10">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0" />
              <p>Cada uno juega desde su teléfono o su compu: mové la paleta con el dedo o el mouse y rompé ladrillos.</p>
            </div>
          </WaitingRoom>
        </main>
      )}

      {playing &&
        (state.mode === "duelo" || state.mode === "coop" ? (
          <SharedGame key={state.gameNo} roomId={roomId} state={state} myId={myId} presence={presence} presenceLoaded={presenceLoaded} />
        ) : (
          <RaceGame key={state.gameNo} roomId={roomId} state={state} myId={myId} presence={presence} presenceLoaded={presenceLoaded} />
        ))}

      {status === "ready" && state && meta && state.status === "finished" && (
        <main className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
          {state.gameNo > 0 || !online ? <Results state={state} myId={myId} /> : <RoomLoading text="Armando la primera ronda…" />}
          {online ? (
            <NextRound nextAt={state.nextAt} />
          ) : (
            <>
              <AgainButton roomId={roomId} meta={meta} state={state} connected={connected} />
              <BackToRoomButton roomId={roomId} stateKey="ladri/state" gameNo={state.gameNo} hostId={meta.hostId ?? ""} presence={presence} myId={myId} />
            </>
          )}
        </main>
      )}
    </div>
  );
}

function NextRound({ nextAt }: { nextAt: number }) {
  const now = useServerNow(true, 500);
  const left = now ? Math.max(0, Math.ceil((nextAt - now) / 1000)) : 0;
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <p className="text-sm text-white/70">{left > 0 ? `La próxima ronda arranca en ${left} s` : "Arrancando la próxima ronda…"}</p>
      <Link href="/ladrillazo" className="text-xs text-white/50 underline-offset-2 hover:text-white hover:underline">
        Salir
      </Link>
    </div>
  );
}

function AgainButton({ roomId, meta, state, connected }: { roomId: string; meta: LadriMeta; state: LadriState; connected: string[] }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={() => {
        setBusy(true);
        playAgain(roomId, state.gameNo, meta, connected)
          .catch(console.error)
          .finally(() => setBusy(false));
      }}
      className={`w-full ${PRIMARY_BUTTON}`}
    >
      Otra partida
    </button>
  );
}

/** The order of a finished game, best first, with a line about each. */
function ranking(state: LadriState): { id: string; detail: string }[] {
  const ids = [...state.roster];
  if (state.mode === "carrera") {
    ids.sort((a, b) => {
      const ra = state.results[a];
      const rb = state.results[b];
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1;
      if (rb !== undefined) return 1;
      return (state.prog[b] ?? 0) - (state.prog[a] ?? 0);
    });
    return ids.map((id) => ({ id, detail: state.results[id] !== undefined ? formatTime(state.results[id] / 1000) : `${state.prog[id] ?? 0}%` }));
  }
  if (state.mode === "ataque") {
    ids.sort((a, b) => {
      if (a === state.winner) return -1;
      if (b === state.winner) return 1;
      const oa = state.out[a] ?? Infinity;
      const ob = state.out[b] ?? Infinity;
      if (oa !== ob) return ob - oa;
      return (state.prog[b] ?? 0) - (state.prog[a] ?? 0);
    });
    return ids.map((id) => ({ id, detail: `${state.prog[id] ?? 0} pts` }));
  }
  ids.sort((a, b) => (state.goals[b] ?? 0) - (state.goals[a] ?? 0));
  return ids.map((id) => ({ id, detail: state.mode === "duelo" ? `${state.goals[id] ?? 0} goles` : "" }));
}

function Results({ state, myId }: { state: LadriState; myId: string }) {
  const coop = state.mode === "coop";
  const iWon = coop ? state.winner === "won" && state.roster.includes(myId) : state.winner === myId;
  const winner = playerInfo(state, state.winner);
  const title = coop
    ? state.winner === "won"
      ? "¡Lo lograron!"
      : "Se quedaron sin vidas"
    : iWon
      ? "¡Ganaste!"
      : state.winner
        ? `¡Ganó ${winner.name}!`
        : "¡Terminó!";
  const rows = coop ? [] : ranking(state);
  const wins = state.wins[myId] ?? 0;
  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      {iWon && <Confetti />}
      <div className="text-center">
        <p className="font-display text-3xl text-white">{title}</p>
        {state.mode === "duelo" && (
          <p className="mt-1 text-sm text-white/60">
            {state.roster.map((id) => `${id === myId ? "Vos" : playerInfo(state, id).name} ${state.goals[id] ?? 0}`).join(" · ")}
          </p>
        )}
        {wins > 1 && <p className="mt-1 text-xs text-white/50">Llevás {wins} ganadas</p>}
      </div>
      {coop ? (
        <ul className="flex flex-wrap justify-center gap-2">
          {state.roster.map((id) => (
            <li key={id} className="rounded-full bg-white/[0.06] px-3 py-1 text-sm font-bold" style={{ color: playerInfo(state, id).color }}>
              {id === myId ? "Vos" : playerInfo(state, id).name}
            </li>
          ))}
        </ul>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.map(({ id, detail }, i) => {
            const info = playerInfo(state, id);
            return (
              <li key={id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${id === myId ? "bg-white/[0.08]" : ""}`}>
                <span className="w-6 font-display text-lg text-white/70">{i + 1}</span>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: info.color }} />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">
                  {id === myId ? "Vos" : info.name}
                </span>
                {state.mode === "carrera" && state.results[id] !== undefined && <Flag className="h-3.5 w-3.5 text-talo-hero" />}
                {state.mode === "ataque" && state.out[id] && <Skull className="h-3.5 w-3.5 text-white/40" />}
                <span className="font-mono text-sm text-white/70">{detail}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
