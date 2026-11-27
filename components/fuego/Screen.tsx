"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, Smartphone } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase";
import { SCREEN_MAX_PEOPLE, normalizeMeta, startMatch, subscribeFuego, type FuegoMeta, type FuegoState } from "@/lib/fuego";
import { subscribePresence, type PresenceMap } from "@/lib/presence";
import { roomPath } from "@/lib/games";
import RoomQR from "@/components/RoomQR";
import { watchRoomMeta } from "@/lib/roomSettings";
import { TEAMS, type TeamId } from "@/lib/teams";
import FullscreenButton from "@/components/FullscreenButton";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { TaloMark } from "@/components/TaloLogo";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { PRIMARY_BUTTON } from "@/components/ui";
import { useWakeLock } from "@/components/carreras/Controller";
import Battle from "./Battle";
import { settingsSummary } from "./RoomClient";
import { MODE_INFO, isTeamMode } from "@/lib/fuegoModes";

type Status = "loading" | "not-found" | "ready" | "error";

const noSubscribe = () => () => {};

/**
 * Fuego cruzado on a big screen (`/fuego-cruzado/{id}/pantalla`): it never
 * joins presence. While waiting it shows how to join and who's in; during the
 * match it runs every soldier (`Battle screen`) — people from their phones'
 * pads, bots with their brain — and draws a first-person view per person.
 */
export default function FuegoScreen({ roomId }: { roomId: string }) {
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<FuegoMeta | null>(null);
  const [state, setState] = useState<FuegoState | null>(null);
  const [presence, setPresence] = useState<PresenceMap>({});
  useWakeLock();

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    const unsubs: (() => void)[] = [];
    const unsubMeta = watchRoomMeta<Partial<FuegoMeta>>(
      roomId,
      (raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== "fuego") return router.replace(`/sala/${roomId}`);
        const m = normalizeMeta(raw);
        if (m.view !== "pantalla") return router.replace(roomPath("fuego", roomId));
        setMeta(m);
        if (!unsubs.length) unsubs.push(subscribeFuego(roomId, setState), subscribePresence(roomId, setPresence));
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
      for (const u of unsubs) u();
    };
  }, [configured, roomId, router]);

  if (!configured) return <FirebaseSetupNotice />;
  if (status === "not-found") return <RoomNotFound />;
  if (status === "error") return <RoomError message="No se pudo cargar la sala." />;
  if (status === "loading" || !meta || !state) return <RoomLoading text="Cargando armas…" />;

  if (state.status !== "waiting") {
    return <Battle roomId={roomId} meta={meta} state={state} myId="" presence={presence} presenceLoaded screen />;
  }
  return <Waiting roomId={roomId} meta={meta} state={state} presence={presence} />;
}

function Waiting({ roomId, meta, state, presence }: { roomId: string; meta: FuegoMeta; state: FuegoState; presence: PresenceMap }) {
  const host = useSyncExternalStore(noSubscribe, () => window.location.host, () => "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const connected = Object.keys(presence);
  const people = connected.filter((id) => state.players[id]);
  const inTeam = (team: TeamId) => people.filter((id) => (state.teams[id] ?? "red") === team);
  const extra = Math.max(0, people.length - SCREEN_MAX_PEOPLE);
  const start = () => {
    setBusy(true);
    setError("");
    startMatch(roomId, meta, connected)
      .then((r) => {
        if (r && !r.committed)
          setError(
            meta.bots
              ? "Hace falta al menos una persona con el celular conectado."
              : isTeamMode(meta.mode)
                ? "Cada equipo necesita al menos una persona (o activa los bots)."
                : "Hacen falta al menos dos personas (o activa los bots)."
          );
      })
      .catch(console.error)
      .finally(() => setBusy(false));
  };

  return (
    <div className="flex min-h-dvh flex-col bg-talo-ink text-white">
      <div className="flex items-center justify-between p-4">
        <Link href="/fuego-cruzado" className="flex items-center gap-2 rounded-xl px-3 py-2 text-white/70 hover:bg-white/10" aria-label="Volver">
          <ArrowLeft className="h-5 w-5" /> <TaloMark className="h-6 w-6" />
        </Link>
        <FullscreenButton className="rounded-xl p-2 text-white/80 hover:bg-white/10" />
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-10 p-6 lg:flex-row lg:items-start">
        <div className="flex w-full max-w-xl flex-col gap-5 rounded-3xl bg-white/[0.05] p-8">
          <div className="flex items-center gap-3 text-white/80">
            <Smartphone className="h-8 w-8 text-talo-hero" />
            <p className="text-2xl font-bold">Entra desde tu celular</p>
          </div>
          <div className="flex items-center gap-5">
            <RoomQR game="fuego" roomId={roomId} className="h-48 w-48 shrink-0 sm:h-56 sm:w-56" />
            <p className="text-xl text-white/80">Escanéalo con la cámara del celular y entras directo a la sala.</p>
          </div>
          <p className="text-base text-white/50">O escribe esta dirección:</p>
          <p className="break-all font-code text-xl text-white/60">
            {host}
            {roomPath("fuego", "")}
            <span className="text-talo-hero">{roomId}</span>
          </p>
          <p className="font-code text-7xl font-bold tracking-[0.15em] text-talo-hero">{roomId}</p>
          <p className="text-base text-white/50">
            o en la página de Talo: «¿Te invitaron?» y este código. Cada celular se vuelve el control de su soldado; la pantalla se
            divide para hasta {SCREEN_MAX_PEOPLE} personas.
          </p>
          <p className="text-sm text-white/40">{settingsSummary(meta)}</p>
        </div>
        <div className="flex w-full max-w-xl flex-col gap-4">
          {!isTeamMode(meta.mode) ? (
            <div className="flex min-h-48 flex-col gap-2 rounded-3xl bg-white/[0.05] p-5 ring-2 ring-talo-hero/60">
              <p className="font-display text-2xl text-talo-hero">{MODE_INFO[meta.mode].label}</p>
              <p className="text-sm text-white/60">{MODE_INFO[meta.mode].hint}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {people.map((id) => (
                  <span key={id} className="flex items-center gap-2 truncate text-xl font-bold">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: state.players[id]?.color }} />
                    {state.players[id]?.name ?? "?"}
                  </span>
                ))}
              </div>
              {meta.bots && meta.size > Math.min(people.length, SCREEN_MAX_PEOPLE) && (
                <span className="flex items-center gap-1.5 text-base text-white/50">
                  <Bot className="h-4 w-4" /> + {meta.size - Math.min(people.length, SCREEN_MAX_PEOPLE)} bots
                </span>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 content-start gap-4">
              {TEAMS.map((t) => {
                const list = inTeam(t.id);
                const missing = meta.bots ? Math.max(0, meta.size / 2 - list.length) : 0;
                return (
                  <div key={t.id} className="flex min-h-48 flex-col gap-2 rounded-3xl p-5" style={{ background: `${t.color}22`, boxShadow: `inset 0 0 0 2px ${t.color}` }}>
                    <p className="font-display text-2xl" style={{ color: t.color }}>
                      {t.label}
                    </p>
                    {list.map((id) => (
                      <span key={id} className="truncate text-xl font-bold">
                        {state.players[id]?.name ?? "?"}
                      </span>
                    ))}
                    {missing > 0 && (
                      <span className="flex items-center gap-1.5 text-base text-white/50">
                        <Bot className="h-4 w-4" /> + {missing} {missing === 1 ? "bot" : "bots"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {extra > 0 && <p className="text-center text-base text-amber-300">Juegan los primeros {SCREEN_MAX_PEOPLE}; los demás miran y entran en la próxima.</p>}
          {error && <p className="text-center text-base text-red-300">{error}</p>}
          <button disabled={!people.length || busy} onClick={start} className={`w-full text-xl ${PRIMARY_BUTTON}`}>
            {people.length ? "¡A combatir!" : "Esperando jugadores…"}
          </button>
          <p className="text-center text-sm text-white/50">
            En el celular (mejor horizontal): los mismos controles que jugando en el celular, al estilo de los shooters móviles, y cada uno puede moverlos y ajustarlos con el ícono de arriba a la izquierda. Cada uno ve en la tele su parte de la pantalla, en primera persona.
          </p>
        </div>
      </div>
    </div>
  );
}
