"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Gauge, Smartphone, Volume2, VolumeX } from "lucide-react";
import FullscreenButton from "@/components/FullscreenButton";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  OPEN_LEAD_MS,
  getTroncoMeta,
  normalizeMeta,
  playAgain,
  playerInfo,
  seatOf,
  startTronco,
  subscribeActs,
  subscribeTronco,
  timelineOf,
  type Act,
  type TroncoMeta,
  type TroncoState,
} from "@/lib/troncoRoom";
import { BASE_SPEED, DrawnLog, cueAt, logAt, seatAngle, speedAt } from "@/lib/tronco";
import { TroncoScene, type PlayerView } from "@/lib/tronco3d";
import { subscribePresence, type PresenceMap } from "@/lib/presence";
import { serverNow } from "@/lib/serverTime";
import { roomPath } from "@/lib/games";
import { backToWaiting, watchRoomMeta } from "@/lib/roomSettings";
import { installUnlock, isMuted, playSound, setMuted, subscribeMuted } from "@/lib/sfx";
import { useServerNow } from "@/hooks/useServerNow";
import { useCountdownTicks } from "@/hooks/useSound";
import { useWakeLock } from "@/components/carreras/Controller";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import TroncoResults from "@/components/tronco/Results";
import { TaloMark } from "@/components/TaloLogo";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { PRIMARY_BUTTON } from "@/components/ui";

/**
 * El tronco on a big screen (a computer on a TV or projector). It never
 * joins the room as a player and decides nothing: the phones are the
 * controllers and still judge their own players (and the bot host its bots),
 * as in a normal room. The screen draws the ring from the same timeline,
 * from above, with everyone's warning ring, and big type for the couch.
 */

type Status = "loading" | "not-found" | "ready" | "error";
const noSubscribe = () => () => {};

/** Connected people who said their name, in a stable order: the ring before the match. */
function waitingRing(state: TroncoState, presence: PresenceMap): string[] {
  return Object.keys(presence)
    .filter((id) => state.players[id])
    .sort();
}

export default function TroncoScreen({ roomId }: { roomId: string }) {
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<TroncoMeta | null>(null);
  const [state, setState] = useState<TroncoState | null>(null);
  const [presence, setPresence] = useState<PresenceMap>({});
  const [feed, setFeed] = useState<{ id: string; text: string; color: string }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<TroncoState | null>(null);
  const presenceRef = useRef<PresenceMap>({});
  const acts = useRef<Record<string, Act>>({});
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  useWakeLock();
  useEffect(installUnlock, []);

  useEffect(() => {
    stateRef.current = state;
    presenceRef.current = presence;
  }, [state, presence]);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    const unsubs: (() => void)[] = [];
    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getTroncoMeta>>>>(
      roomId,
      (raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== "tronco") return router.replace(`/sala/${roomId}`);
        const m = normalizeMeta(raw);
        // Switched to "each on their phone" (or an online/solo room): the screen has nothing to do.
        if (m.view !== "pantalla" || m.online || m.solo) return router.replace(roomPath("tronco", roomId));
        setMeta(m);
        if (!unsubs.length) unsubs.push(subscribeTronco(roomId, setState), subscribePresence(roomId, setPresence));
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
      unsubs.forEach((u) => u());
    };
  }, [configured, roomId, router]);

  const gameNo = state?.gameNo ?? -1;
  useEffect(() => {
    if (gameNo < 0) return;
    acts.current = {};
    return subscribeActs(roomId, gameNo, (a) => (acts.current = a));
  }, [roomId, gameNo]);

  // Sounds and the "quedó afuera" notes, from what changes in the state.
  const heard = useRef({ g: -1, kicks: 0, out: new Set<string>(), status: "" });
  useEffect(() => {
    if (!state) return;
    const h = heard.current;
    if (h.g !== state.gameNo) {
      heard.current = { g: state.gameNo, kicks: state.kicks.length, out: new Set(Object.keys(state.out)), status: state.status };
      return;
    }
    if (state.kicks.length > h.kicks) playSound("capture");
    h.kicks = state.kicks.length;
    const fresh = Object.keys(state.out).filter((id) => !h.out.has(id));
    if (fresh.length) {
      fresh.forEach((id) => h.out.add(id));
      if (state.status === "playing") playSound("place");
      const notes = fresh.map((id) => ({ id: `${id}${Date.now()}`, text: `${playerInfo(state, id).name} quedó afuera`, color: playerInfo(state, id).color }));
      setFeed((f) => [...f, ...notes].slice(-4));
      setTimeout(() => setFeed((f) => f.filter((n) => !notes.includes(n))), 3500);
    }
    if (state.status === "finished" && h.status === "playing") playSound("win");
    h.status = state.status;
  }, [state]);

  // The ring, drawn every frame from the state, the timeline and the acts.
  const hasState = !!state;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasState) return;
    let scene: TroncoScene;
    try {
      scene = new TroncoScene(canvas, { tv: true });
    } catch (err) {
      console.error(err);
      return;
    }
    const resize = () => scene.resize(canvas.clientWidth, canvas.clientHeight);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    let drawn = new DrawnLog();
    let drawnFor = -1;
    let raf = 0;
    const loop = () => {
      const s = stateRef.current;
      if (!s) {
        raf = requestAnimationFrame(loop);
        return;
      }
      if (drawnFor !== s.gameNo) {
        drawn = new DrawnLog();
        drawnFor = s.gameNo;
      }
      const now = serverNow();
      const time = performance.now() / 1000;
      let players: PlayerView[];
      let logAngle = Math.PI / 2;
      let logDir: 1 | -1 = 1;
      let speed = 0;
      let rolling = false;
      let shake = false;
      if (s.status === "waiting") {
        const ring = waitingRing(s, presenceRef.current);
        players = ring.map((id, i) => ({
          id,
          name: playerInfo(s, id).name,
          color: playerInfo(s, id).color,
          angle: seatAngle(i, ring.length),
          me: false,
          jumpS: 99,
          kickS: 99,
          fallS: -1,
        }));
        // Resting, slowly turning so the TV looks alive while people join.
        logAngle = time * 0.25;
      } else {
        const tl = timelineOf(s);
        const live = s.status === "playing";
        // After the end the log stops where it knocked down the last one.
        const t = live ? now : Math.max(s.startedAt, ...Object.values(s.out));
        const log = logAt(tl, t);
        logAngle = drawn.angle(tl, t, OPEN_LEAD_MS, performance.now());
        logDir = log.dir;
        rolling = live && s.startedAt > 0 && now >= s.startedAt;
        speed = rolling ? speedAt(tl, now) : 0;
        shake = live && !s.startedAt && now >= s.openAt;
        players = s.roster.map((id) => {
          const a = acts.current[id];
          const down = s.out[id];
          const info = playerInfo(s, id);
          const theta = seatOf(s, id);
          // The winner hops on the spot when it's over.
          const winHop = !live && id === s.winner ? time % 0.8 : null;
          return {
            id,
            name: info.name,
            color: info.color,
            angle: theta,
            me: false,
            jumpS: winHop ?? (now - (a?.j ?? -1e12)) / 1000,
            kickS: (now - (a?.k ?? -1e12)) / 1000,
            fallS: down !== undefined ? Math.max(0, (now - down) / 1000) : -1,
            cue: rolling && down === undefined ? cueAt(tl, now, theta) : undefined,
          };
        });
      }
      scene.frame({ logAngle, logDir, speed, shake, rolling, players, myAngle: null, time });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.dispose();
    };
  }, [hasState]);


  const now = useServerNow(state?.status === "playing", 250);
  const countdown = state?.status === "playing" && now && now < state.openAt ? Math.ceil((state.openAt - now) / 1000) : 0;
  useCountdownTicks(countdown || null, 3);

  if (!configured) return <FirebaseSetupNotice />;

  const live = state?.status === "playing";
  const waitingOpen = !!state && live && !countdown && !state.startedAt && !!state.opener;
  const openerName = state?.opener ? playerInfo(state, state.opener).name : "";
  const standing = state ? state.roster.filter((p) => !state.out[p]).length : 0;
  const rollingNow = !!state && live && !!now && state.startedAt > 0 && now >= state.startedAt;
  const pace = rollingNow && state ? speedAt(timelineOf(state), now) / BASE_SPEED : 1;
  const chip = "pointer-events-auto flex items-center gap-1.5 rounded-xl bg-black/60 px-3 py-2 text-sm font-bold text-white hover:bg-black/75";

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#A9DCFA] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {status === "loading" && <RoomLoading text="Rodando el tronco…" />}
      {status === "not-found" && <RoomNotFound />}
      {status === "error" && <RoomError message="No se pudo cargar la sala." />}

      {status === "ready" && state && meta && (
        <>
          {/* Over everything else (the join card and the results take the whole height). */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4">
            <div className="pointer-events-auto flex items-center gap-1 rounded-xl bg-black/60 p-1">
              <Link href="/" className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold text-white hover:bg-white/10">
                <ArrowLeft className="h-4 w-4" />
                <TaloMark className="h-6 w-6" />
                Inicio
              </Link>
              <span className="px-2 font-code text-lg font-bold tracking-widest text-talo-hero">{roomId}</span>
            </div>
            {state.status !== "waiting" && (
              <div className="flex gap-2">
                <span className="rounded-xl bg-black/60 px-4 py-2 font-display text-2xl">
                  Quedan {standing} de {state.roster.length}
                </span>
                {rollingNow && (
                  <span
                    className={`flex items-center gap-2 rounded-xl px-4 py-2 font-display text-2xl ${pace >= 2 ? "bg-red-500/85" : pace >= 1.5 ? "bg-talo-hero text-talo-ink" : "bg-black/60"}`}
                  >
                    <Gauge className="h-6 w-6" /> ×{pace.toFixed(1)}
                  </span>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setMuted(!muted)} className={chip} aria-label={muted ? "Activar sonido" : "Silenciar"}>
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              <FullscreenButton className={chip} iconClassName="h-5 w-5" />
            </div>
          </div>

          {state.status === "waiting" && <JoinCard roomId={roomId} meta={meta} state={state} presence={presence} />}

          {countdown > 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/25">
              <span key={countdown} className="animate-celebration-in font-display text-[24vmin] leading-none drop-shadow-[0_6px_0_rgba(0,0,0,0.35)]">
                {countdown}
              </span>
              {openerName && <span className="rounded-2xl bg-black/60 px-6 py-3 font-display text-3xl">Arranca {openerName}</span>}
            </div>
          )}

          {waitingOpen && (
            <div className="pointer-events-none absolute inset-x-0 top-24 z-10 flex justify-center px-6">
              <span className="rounded-2xl bg-black/65 px-6 py-3 text-center font-display text-3xl">
                {openerName} va a patear el tronco… ¿para qué lado?
              </span>
            </div>
          )}

          {feed.length > 0 && (
            <div className="pointer-events-none absolute right-4 top-24 z-10 flex flex-col items-end gap-2">
              {feed.map((n) => (
                <span key={n.id} className="animate-celebration-in flex items-center gap-2 rounded-2xl bg-black/65 px-4 py-2 text-xl font-bold">
                  <span className="h-4 w-4 rounded-full" style={{ background: n.color }} />
                  {n.text}
                </span>
              ))}
            </div>
          )}

          {live && !countdown && (
            <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-col gap-1.5 rounded-2xl bg-black/55 px-4 py-3 text-base font-bold">
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-[3px] border-talo-hero" /> Anillo amarillo: ¡salta!
              </span>
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-[3px] border-emerald-400" /> Anillo verde: ¡patea (o salta)!
              </span>
            </div>
          )}

          {state.status === "finished" && (
            <div className="absolute inset-0 z-10 flex items-center justify-end overflow-y-auto p-6">
              <div className="flex w-full max-w-xl flex-col gap-3">
                <TroncoResults state={state} myId="" big />
                <button
                  onClick={() => playAgain(roomId, state.gameNo, meta, Object.keys(presence)).catch(console.error)}
                  className={`w-full text-lg ${PRIMARY_BUTTON}`}
                >
                  Otra ronda
                </button>
                <button
                  onClick={() => backToWaiting(roomId, "tronco/state", state.gameNo).catch(console.error)}
                  className="rounded-xl bg-black/50 py-3 text-base font-bold text-white hover:bg-black/65"
                >
                  Volver a la sala (cambiar bots o velocidad)
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function JoinCard({ roomId, meta, state, presence }: { roomId: string; meta: TroncoMeta; state: TroncoState; presence: PresenceMap }) {
  const host = useSyncExternalStore(noSubscribe, () => window.location.host, () => "");
  const ring = waitingRing(state, presence);
  const [busy, setBusy] = useState(false);
  return (
    <div className="absolute inset-y-0 left-0 z-10 flex w-full items-center overflow-y-auto p-4 pt-20 sm:p-8 sm:pt-20 lg:w-[46%]">
      <div className="flex w-full flex-col gap-5 rounded-3xl bg-talo-ink/90 p-6 sm:p-8">
        <div className="flex items-center gap-3 text-white/80">
          <Smartphone className="h-7 w-7 text-talo-hero" />
          <p className="text-xl font-bold">Entra desde tu celular</p>
        </div>
        <div>
          <p className="break-all font-code text-base text-white/60 sm:text-xl">
            {host}
            {roomPath("tronco", "")}
            <span className="text-talo-hero">{roomId}</span>
          </p>
          <p className="mt-2 font-code text-6xl font-bold tracking-[0.15em] text-talo-hero sm:text-7xl">{roomId}</p>
          <p className="mt-1 text-sm text-white/50">o en la página de Talo: «¿Te invitaron?» y este código</p>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold text-white/50">
            {ring.length ? `En la ronda (${ring.length})` : "Todavía no entró nadie"}
            {meta.bots > 0 && ` · más ${meta.bots} ${meta.bots === 1 ? "bot" : "bots"}`}
          </p>
          <div className="flex flex-wrap gap-2">
            {ring.map((id) => (
              <span key={id} className="flex items-center gap-2 rounded-full bg-white/[0.08] px-3 py-1.5 text-lg font-bold">
                <span className="h-4 w-4 rounded-full" style={{ background: playerInfo(state, id).color }} />
                {playerInfo(state, id).name}
              </span>
            ))}
          </div>
        </div>
        <button
          disabled={!ring.length || busy}
          onClick={() => {
            setBusy(true);
            startTronco(roomId, meta, Object.keys(presence))
              .catch(console.error)
              .finally(() => setBusy(false));
          }}
          className={`w-full text-lg ${PRIMARY_BUTTON}`}
        >
          {ring.length ? "¡Empezar!" : "Esperando jugadores…"}
        </button>
        <p className="text-sm text-white/50">
          Los celulares son el control: «Saltar» y «Patear». También se puede empezar desde un celular. Velocidad{" "}
          {meta.pace === "rapido" ? "rápida" : "normal"}.
        </p>
      </div>
    </div>
  );
}
