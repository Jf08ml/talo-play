"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Gem, Shuffle } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  chooseTeam,
  getGolpeMeta,
  joinGolpe,
  normalizeMeta,
  playAgain,
  shuffleTeams,
  startGolpe,
  subscribeGolpe,
  teamTotals,
  thiefInfo,
  thieves,
  type GolpeMeta,
  type GolpeState,
} from "@/lib/golpe";
import { TEAMS } from "@/lib/teams";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import NamePrompt from "@/components/NamePrompt";
import WaitingRoom from "@/components/WaitingRoom";
import PlayerBadges from "@/components/PlayerBadges";
import RoomHeader from "@/components/RoomHeader";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import GameResults from "@/components/Results";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { BackToRoomButton, RoomSettingsEditor } from "@/components/RoomSettings";
import { watchRoomMeta } from "@/lib/roomSettings";
import { PRIMARY_BUTTON } from "@/components/ui";
import { SETTINGS } from "../settings";

const GolpeGame = dynamic(() => import("@/components/golpe/Game"), { ssr: false });

type Status = "loading" | "not-found" | "ready" | "error";

const LEVEL_LABEL = { facil: "fáciles", normal: "normales", dificil: "difíciles" } as const;

function summary(meta: GolpeMeta): string {
  const mode = meta.mode === "equipos" ? "Rojo contra azul" : "Todos contra todos";
  const bots = meta.bots ? `${meta.bots} ${meta.bots === 1 ? "bot" : "bots"} ${LEVEL_LABEL[meta.botLevel]}` : "sin bots";
  return `${mode} · ${meta.minutes} min · ${bots}`;
}

export default function GolpeClient({ roomId }: { roomId: string }) {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<GolpeMeta | null>(null);
  const [state, setState] = useState<GolpeState | null>(null);

  const myId = identity.clientId;
  const me = myId && identity.name ? { clientId: myId, name: identity.name, color: identity.color } : null;
  const presence = useRoomPresence(roomId, status === "ready" ? me : null);
  const presenceLoaded = !!myId && myId in presence;

  useEffect(() => {
    if (!configured || !identity.clientId || !identity.name) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getGolpeMeta>>>>(
      roomId,
      (raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== "golpe") return router.replace(`/sala/${roomId}`);
        setMeta(normalizeMeta(raw));
        unsub ??= subscribeGolpe(roomId, setState);
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
  const stateStatus = state?.status;
  useEffect(() => {
    if (!hasState || !identity.clientId || !identity.name) return;
    joinGolpe(roomId, identity.clientId, { name: identity.name, color: identity.color }).catch(console.error);
  }, [hasState, stateStatus, roomId, identity.clientId, identity.name, identity.color]);

  if (!configured) return <FirebaseSetupNotice />;

  const connected = Object.keys(presence);
  const playing = status === "ready" && state && meta && state.status === "playing";

  return (
    <div className={`flex flex-col ${playing ? "h-dvh overflow-hidden" : "min-h-dvh"}`}>
      <RoomHeader game="golpe" roomId={roomId} right={status === "ready" && !playing && <PlayerBadges presence={presence} myClientId={myId} />} />

      {identity.clientId && !identity.name && <NamePrompt onSubmit={identity.setName} submitLabel="Entrar a la sala" invitedTo="golpe" />}

      {status === "loading" && <RoomLoading text="Apagando las cámaras…" />}
      {status === "not-found" && <RoomNotFound />}
      {status === "error" && <RoomError message="No se pudo cargar la sala." />}

      {status === "ready" && state && meta && state.status === "waiting" && (
        <main className="mx-auto w-full max-w-2xl p-4">
          <WaitingRoom
            game="golpe"
            roomId={roomId}
            hostId={meta.hostId ?? ""}
            players={Object.entries(state.players).map(([id, p]) => ({ id, ...p }))}
            presence={presence}
            myId={myId}
            summary={summary(meta)}
            settings={<RoomSettingsEditor settings={SETTINGS} roomId={roomId} meta={meta} />}
            onStart={() => startGolpe(roomId, meta, connected)}
          >
            {meta.mode === "equipos" && <TeamPicker roomId={roomId} state={state} myId={myId} connected={connected} presenceLoaded={presenceLoaded} />}
            <div className="flex gap-2.5 rounded-xl bg-cyan-500/10 p-3 text-sm text-cyan-50 ring-1 ring-cyan-400/20">
              <Gem className="mt-0.5 h-5 w-5 shrink-0" />
              <p>Cada uno juega desde su teléfono o su compu. Esquivá las luces de los guardias y las cámaras, no toques los láseres y llevá los diamantes a la salida.</p>
            </div>
          </WaitingRoom>
        </main>
      )}

      {playing && <GolpeGame roomId={roomId} state={state} myId={myId} presence={presence} presenceLoaded={presenceLoaded} />}

      {status === "ready" && state && meta && state.status === "finished" && (
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4">
          <Results roomId={roomId} meta={meta} state={state} myId={myId} connected={connected} />
          <BackToRoomButton roomId={roomId} stateKey="golpe/state" gameNo={state.gameNo} hostId={meta.hostId ?? ""} presence={presence} myId={myId} />
        </main>
      )}
    </div>
  );
}

/** Teams while waiting: pick one, or let the start even them out. */
function TeamPicker({
  roomId,
  state,
  myId,
  connected,
  presenceLoaded,
}: {
  roomId: string;
  state: GolpeState;
  myId: string;
  connected: string[];
  presenceLoaded: boolean;
}) {
  const here = (id: string) => !presenceLoaded || connected.includes(id);
  const people = Object.keys(state.players).filter(here);
  const mine = state.teams[myId] ?? null;
  const loose = people.filter((id) => !state.teams[id]);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {TEAMS.map((t) => {
          const list = people.filter((id) => state.teams[id] === t.id);
          return (
            <div key={t.id} className="flex flex-col gap-1.5 rounded-xl border bg-black/30 p-3" style={{ borderColor: `${t.color}66` }}>
              <p className="text-center text-sm font-semibold" style={{ color: t.color }}>
                {t.label}
              </p>
              {list.map((id) => (
                <p key={id} className="truncate rounded-lg bg-white/5 px-2 py-1.5 text-center text-sm text-white">
                  {id === myId ? "Vos" : state.players[id]?.name}
                </p>
              ))}
              {mine !== t.id && (
                <button
                  onClick={() => chooseTeam(roomId, myId, t.id).catch(console.error)}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium"
                  style={{ borderColor: t.color, color: t.color }}
                >
                  Unirme
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
        {people.length > 1 && (
          <button
            onClick={() => shuffleTeams(roomId, connected).catch(console.error)}
            className="flex items-center gap-1 rounded-md border border-white/20 px-2 py-1 text-white/80 hover:border-white/40"
          >
            <Shuffle className="h-3.5 w-3.5" /> Mezclar equipos
          </button>
        )}
      </div>
      <p className="text-center text-xs text-white/50">
        {loose.length
          ? `Sin equipo: ${loose.map((id) => (id === myId ? "vos" : state.players[id]?.name)).join(", ")}. Al empezar van al equipo más chico, y los bots emparejan.`
          : "Al empezar, los bots completan el equipo más chico."}
      </p>
    </div>
  );
}

function Results({
  roomId,
  meta,
  state,
  myId,
  connected,
}: {
  roomId: string;
  meta: GolpeMeta;
  state: GolpeState;
  myId: string;
  connected: string[];
}) {
  const [busy, setBusy] = useState(false);
  const ids = thieves(state);
  const ranking = ids.map((id) => ({ id, ...thiefInfo(state, id), score: state.final[id] ?? 0 })).sort((a, b) => b.score - a.score);
  const wins = state.wins[myId] ?? 0;
  const teams = state.mode === "equipos";
  const totals = teamTotals(state, state.final);
  const win = TEAMS.find((t) => t.id === state.winTeam);
  const myTeam = state.teams[myId];
  return (
    <GameResults
      ranking={ranking}
      myId={myId}
      unit="diamantes"
      title={teams ? (win ? `¡Ganó el ${win.label}!` : "¡Empate!") : undefined}
      subtitle={
        teams
          ? `Rojo ${totals.red} · Azul ${totals.blue} diamantes a salvo`
          : wins > 1
            ? `Llevás ${wins} golpes ganados`
            : undefined
      }
      celebrate={teams ? !!win && myTeam === win.id : undefined}
      actions={
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
          Otro golpe
        </button>
      }
    >
      {teams && (
        <div className="grid grid-cols-2 gap-2">
          {TEAMS.map((t) => (
            <div key={t.id} className="flex flex-col items-center rounded-xl bg-black/30 p-3 ring-1" style={{ ["--tw-ring-color" as string]: `${t.color}66` }}>
              <span className="text-sm font-semibold" style={{ color: t.color }}>
                {t.label}
              </span>
              <span className="font-display text-3xl text-white">{totals[t.id]}</span>
            </div>
          ))}
        </div>
      )}
    </GameResults>
  );
}
