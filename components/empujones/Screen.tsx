"use client";

import TvModeButton from "@/components/TvModeButton";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, Smartphone, Volume2, VolumeX, X } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  COUNTDOWN_MS,
  getEmpujonesMeta,
  isBot,
  normalizeMeta,
  playAgain,
  playerInfo,
  playersIn,
  reportRound,
  startMatch,
  subscribeEmpujones,
  subscribePads,
  writeLive,
  type EmpujonesMeta,
  type EmpujonesState,
  type PadWire,
} from "@/lib/empujonesRoom";
import {
  ISLAND_R,
  SHRINK_FROM,
  SINK_FROM,
  botInput,
  islandRadius,
  newBody,
  newBrain,
  onIsland,
  pusherOf,
  spawnBodies,
  stepWorld,
  type Body,
  type BotBrain,
  type PadInput,
} from "@/lib/empujones";
import { IslandPainter, type DrawBody } from "@/lib/empujonesDraw";
import { mulberry32 } from "@/lib/random";
import { subscribePresence, type PresenceMap } from "@/lib/presence";
import { serverNow } from "@/lib/serverTime";
import { roomPath } from "@/lib/games";
import RoomQR from "@/components/RoomQR";
import { backToWaiting, watchRoomMeta } from "@/lib/roomSettings";
import { installUnlock, isMuted, playSound, setMuted, subscribeMuted } from "@/lib/sfx";
import { useServerNow } from "@/hooks/useServerNow";
import { useCountdownTicks } from "@/hooks/useSound";
import { useWakeLock } from "@/components/carreras/Controller";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import FullscreenButton from "@/components/FullscreenButton";
import GameResults, { rankFrom } from "@/components/Results";
import { TaloMark } from "@/components/TaloLogo";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";
import { PRIMARY_BUTTON } from "@/components/ui";

/**
 * Empujones' big screen (a computer on a TV or projector). It never joins
 * the room as a player: it runs the island for everyone from the phones'
 * inputs (and the bots), draws it, decides who fell and reports each
 * round's winner. While waiting, whoever is in can already move their talo
 * around to try the controls (falling just puts you back).
 */

type Status = "loading" | "not-found" | "ready" | "error";
const STEP = 1 / 120;
/** After the last fall, how long until the round's result is reported. */
const END_DELAY_MS = 1100;
const noSubscribe = () => () => {};

/** Keyboard on the screen itself, to try it without phones: the first two people in. */
const KEYS = [
  { up: ["w", "W"], down: ["s", "S"], left: ["a", "A"], right: ["d", "D"], dash: [" "], brace: ["Shift"] },
  { up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"], dash: ["l", "L", "Enter"], brace: ["k", "K"] },
];

interface Engine {
  key: string;
  bodies: Body[];
  brains: Record<string, BotBrain>;
  /** Dash presses already used, per player. */
  dashSeen: Record<string, number>;
  /** Round time (s) the island has run. */
  t: number;
  /** Server time the island got down to one (or none), 0 before. */
  endAt: number;
  reported: boolean;
  /** Waiting: when each fallen talo comes back. */
  respawn: Record<string, number>;
}

interface Note {
  id: number;
  text: string;
  color: string;
  at: number;
}

/** Islands are rebuilt when this changes: a new round (from its countdown on), or a new waiting room. */
function engineKey(s: EmpujonesState, now: number, current: string | null): string {
  if (s.status === "waiting") return `w${s.gameNo}`;
  const key = `p${s.gameNo}r${s.round}`;
  // During the last round's result it stays on screen.
  if (current && current.startsWith(`p${s.gameNo}r`) && now < s.startedAt - COUNTDOWN_MS) return current;
  return key;
}

export default function EmpujonesScreen({ roomId }: { roomId: string }) {
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<Status>("loading");
  const [meta, setMeta] = useState<EmpujonesMeta | null>(null);
  const [state, setState] = useState<EmpujonesState | null>(null);
  const [presence, setPresence] = useState<PresenceMap>({});
  const [alive, setAlive] = useState(0);
  const [feed, setFeed] = useState<Note[]>([]);
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  useWakeLock();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<EmpujonesState | null>(null);
  const presenceRef = useRef<PresenceMap>({});
  const padsRef = useRef<Record<string, PadWire>>({});
  const keysRef = useRef(new Set<string>());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    presenceRef.current = presence;
  }, [presence]);
  useEffect(() => installUnlock(), []);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    const unsubs: (() => void)[] = [];
    const unsubMeta = watchRoomMeta<NonNullable<Awaited<ReturnType<typeof getEmpujonesMeta>>>>(
      roomId,
      (raw) => {
        if (cancelled) return;
        if (!raw) return setStatus("not-found");
        if (raw.game !== "empujones") return router.replace(`/sala/${roomId}`);
        setMeta(normalizeMeta(raw));
        if (unsubs.length) return;
        unsubs.push(
          subscribeEmpujones(roomId, setState),
          subscribePresence(roomId, setPresence),
          subscribePads(roomId, (p) => {
            padsRef.current = p;
          })
        );
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

  useEffect(() => {
    const keys = keysRef.current;
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      keys.add(e.key);
      if (e.key.startsWith("Arrow") || e.key === " ") e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key);
    const clear = () => keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  // The island loop: fixed-step physics, then a draw, every frame.
  const ready = status === "ready" && !!state;
  useEffect(() => {
    if (!ready || !canvasRef.current) return;
    const painter = new IslandPainter(canvasRef.current);
    let engine: Engine | null = null;
    let frame = 0;
    let last = performance.now();
    let acc = 0;
    let liveKey = "";
    let liveAt = 0;
    let aliveShown = -1;
    let lastWhoosh = 0;
    let noteId = 0;
    const keyDash: Record<number, boolean> = {};

    const note = (text: string, color: string) => {
      const n = { id: ++noteId, text, color, at: Date.now() };
      setFeed((f) => [...f.slice(-3), n]);
      setTimeout(() => setFeed((f) => f.filter((x) => x.id !== n.id)), 3500);
    };

    const build = (s: EmpujonesState, key: string): Engine => {
      const ids = s.status === "waiting" ? playersIn(s, Object.keys(presenceRef.current)) : s.roster;
      const bodies = spawnBodies(ids);
      const rand = mulberry32(s.seed + s.round * 101);
      const brains: Record<string, BotBrain> = {};
      for (const id of ids) if (isBot(id)) brains[id] = newBrain(s.botLevel, mulberry32(Math.floor(rand() * 1e9)));
      const dashSeen: Record<string, number> = {};
      for (const id of ids) dashSeen[id] = padsRef.current[id]?.d ?? 0;
      painter.reset();
      return { key, bodies, brains, dashSeen, t: 0, endAt: 0, reported: false, respawn: {} };
    };

    /** Keyboard pads for the first two people, if they're pressing something. */
    const keyInput = (s: EmpujonesState, id: string): PadInput | null => {
      const people = (s.status === "waiting" ? playersIn(s, Object.keys(presenceRef.current)) : s.roster).filter((p) => !isBot(p));
      const slot = people.indexOf(id);
      const k = KEYS[slot];
      if (!k) return null;
      const keys = keysRef.current;
      const has = (l: string[]) => l.some((key) => keys.has(key));
      const x = (has(k.right) ? 1 : 0) - (has(k.left) ? 1 : 0);
      const y = (has(k.down) ? 1 : 0) - (has(k.up) ? 1 : 0);
      const dashNow = has(k.dash);
      const dash = dashNow && !keyDash[slot];
      keyDash[slot] = dashNow;
      if (!x && !y && !dashNow && !has(k.brace)) return null;
      const n = Math.hypot(x, y) || 1;
      return { x: x / n, y: y / n, dash, brace: has(k.brace) };
    };

    const tick = (ts: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (ts - last) / 1000);
      last = ts;
      const s = stateRef.current;
      if (!s) return;
      const now = serverNow();
      const key = engineKey(s, now, engine?.key ?? null);
      if (!engine || engine.key !== key) engine = build(s, key);
      const e = engine;
      const waiting = s.status === "waiting";

      // Waiting: talos come and go with the people in the room; the fallen come back.
      if (waiting) {
        const ids = playersIn(s, Object.keys(presenceRef.current));
        e.bodies = e.bodies.filter((b) => ids.includes(b.id));
        for (const id of ids) {
          if (e.bodies.some((b) => b.id === id)) continue;
          const a = Math.random() * Math.PI * 2;
          e.bodies.push(newBody(id, Math.cos(a) * 3, Math.sin(a) * 3));
          e.dashSeen[id] = padsRef.current[id]?.d ?? 0;
        }
        for (const b of e.bodies) {
          if (b.out && !e.respawn[b.id]) e.respawn[b.id] = now + 1500;
          if (b.out && e.respawn[b.id] && now >= e.respawn[b.id]) {
            const a = Math.random() * Math.PI * 2;
            Object.assign(b, newBody(b.id, Math.cos(a) * 2, Math.sin(a) * 2));
            delete e.respawn[b.id];
          }
        }
      }

      const live = s.status === "playing" && e.key === `p${s.gameNo}r${s.round}` && now >= s.startedAt;
      const moving = waiting || live || (s.status !== "waiting" && e.endAt > 0);
      const radius = waiting ? ISLAND_R : islandRadius(e.t);

      if (moving) {
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          const inputs: Record<string, PadInput> = {};
          for (const b of e.bodies) {
            if (!onIsland(b)) continue;
            if (isBot(b.id)) {
              inputs[b.id] = botInput(b, e.bodies, e.brains[b.id], radius, STEP);
              continue;
            }
            const kb = keyInput(s, b.id);
            if (kb) {
              inputs[b.id] = kb;
              continue;
            }
            const w = padsRef.current[b.id];
            if (!w) continue;
            // A count that went down is a reloaded phone: catch up without dashing.
            const d = w.d ?? 0;
            const dash = d > (e.dashSeen[b.id] ?? 0);
            if (d !== e.dashSeen[b.id]) e.dashSeen[b.id] = d;
            inputs[b.id] = { x: w.x ?? 0, y: w.y ?? 0, dash, brace: !!w.b };
          }
          const ev = stepWorld(e.bodies, inputs, e.t, STEP, radius);
          if (live && !e.endAt) e.t += STEP;
          for (const bump of ev.bumps) {
            if (bump.dash || bump.power > 4) painter.bump(bump.x, bump.y, bump.dash);
            if (bump.dash) playSound("capture");
          }
          if (ev.dashes.length && performance.now() - lastWhoosh > 150) {
            lastWhoosh = performance.now();
            playSound("whoosh");
          }
          for (const sp of ev.splashes) {
            painter.splash(sp.x, sp.y, playerInfo(s, sp.id).color);
            playSound("bad");
          }
          if (!waiting) {
            for (const id of ev.falls) {
              const b = e.bodies.find((x) => x.id === id)!;
              const by = pusherOf(b, e.t);
              const victim = playerInfo(s, id);
              note(by ? `${playerInfo(s, by).name} tiró a ${victim.name}` : `${victim.name} se cayó solo`, by ? playerInfo(s, by).color : victim.color);
            }
          }
        }
      } else {
        acc = 0;
      }

      // Down to one (or none) on the island: report it a moment later, once.
      if (live && !e.reported) {
        const standing = e.bodies.filter(onIsland);
        const sinking = e.bodies.some((b) => b.falling > 0 && !b.out);
        if (standing.length <= 1 && !sinking && !e.endAt) e.endAt = now;
        if (e.endAt && now - e.endAt >= END_DELAY_MS) {
          e.reported = true;
          const winner = e.bodies.filter(onIsland)[0]?.id ?? "";
          playSound(winner ? "good" : "end");
          reportRound(roomId, s.gameNo, s.round, winner).catch(console.error);
        }
      }

      // What the phones need: who fell, and dash hits (they buzz).
      if (!waiting) {
        const out = e.bodies.filter((b) => b.out || b.falling > 0).map((b) => b.id).join(",");
        const hits: Record<string, number> = {};
        for (const b of e.bodies) if (b.hits && !isBot(b.id)) hits[b.id] = b.hits;
        const lk = `${s.gameNo}:${s.round}:${out}:${JSON.stringify(hits)}`;
        if (lk !== liveKey && performance.now() - liveAt > 120) {
          liveKey = lk;
          liveAt = performance.now();
          writeLive(roomId, { g: s.gameNo, r: s.round, out, hits });
        }
        const n = e.bodies.filter(onIsland).length;
        if (n !== aliveShown) {
          aliveShown = n;
          setAlive(n);
        }
      }

      const here = presenceRef.current;
      const drawn: DrawBody[] = e.bodies.map((b) => {
        const info = playerInfo(s, b.id);
        return {
          id: b.id,
          x: b.x,
          y: b.y,
          face: b.face,
          color: info.color,
          name: info.name,
          bracing: b.bracing,
          dashing: b.dashT > 0,
          stunned: b.stunT > 0,
          falling: b.falling,
          out: b.out,
          away: !isBot(b.id) && !(b.id in here),
        };
      });
      const warn = live && ((e.t > SHRINK_FROM - 2 && e.t < SHRINK_FROM) || (e.t > SINK_FROM - 2 && e.t < SINK_FROM));
      painter.draw(drawn, radius, warn, dt);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready, roomId]);

  const now = useServerNow(state?.status === "playing", 100);
  const playing = state?.status === "playing";
  const left = playing && now ? Math.ceil((state.startedAt - now) / 1000) : 0;
  const counting = playing && left > 0 && left <= COUNTDOWN_MS / 1000;
  const between = playing && !!now && now < state.startedAt - COUNTDOWN_MS && state.lastRound === state.round - 1;
  const roundT = playing && now ? (now - state.startedAt) / 1000 : 0;
  useCountdownTicks(counting ? left : null, 3);

  if (!configured) return <FirebaseSetupNotice />;
  const chip = "pointer-events-auto flex items-center gap-1.5 rounded-xl bg-black/60 px-3 py-2 text-sm font-bold text-white hover:bg-black/75";

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#2D5BFF] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {status === "loading" && <RoomLoading text="Inflando la isla…" />}
      {status === "not-found" && <RoomNotFound />}
      {status === "error" && <RoomError message="No se pudo cargar la sala." />}

      {status === "ready" && state && meta && (
        <>
          {/* Over everything else (the join card and the results take the whole height). */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4">
            <div className="flex flex-col items-start gap-2">
              <div className="pointer-events-auto flex items-center gap-1 rounded-xl bg-black/60 p-1">
                <Link href="/" className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold text-white hover:bg-white/10">
                  <ArrowLeft className="h-4 w-4" />
                  <TaloMark className="h-6 w-6" />
                  Inicio
                </Link>
                <span className="px-2 font-code text-lg font-bold tracking-widest text-talo-hero">{roomId}</span>
              </div>
              {/* For whoever arrives mid-match. */}
              {state.status !== "waiting" && <RoomQR game="empujones" roomId={roomId} className="h-24 w-24" />}
            </div>
            {state.status !== "waiting" && <Scoreboard state={state} presence={presence} alive={playing ? alive : null} />}
            <div className="flex gap-2">
              <button onClick={() => setMuted(!muted)} className={chip} aria-label={muted ? "Activar sonido" : "Silenciar"}>
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              {playing && (
                <button onClick={() => backToWaiting(roomId, "empujones/state", state.gameNo).catch(console.error)} className={chip} aria-label="Terminar la partida" title="Terminar la partida">
                  <X className="h-5 w-5" />
                </button>
              )}
              <TvModeButton className={chip} />
              <FullscreenButton className={chip} iconClassName="h-5 w-5" />
            </div>
          </div>

          {state.status === "waiting" && <JoinCard roomId={roomId} meta={meta} state={state} presence={presence} />}

          {counting && (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
              <span className="rounded-2xl bg-black/60 px-6 py-2 font-display text-3xl">Ronda {state.round + 1}</span>
              <span key={left} className="animate-celebration-in font-display text-[24vmin] leading-none drop-shadow-[0_6px_0_rgba(0,0,0,0.35)]">
                {left}
              </span>
            </div>
          )}

          {between && <RoundBanner state={state} />}

          {playing && !counting && !between && roundT > SHRINK_FROM && roundT < SHRINK_FROM + 2.5 && <Callout text="¡La isla se achica!" />}
          {playing && !counting && !between && roundT > SINK_FROM && roundT < SINK_FROM + 2.5 && <Callout text="¡Se hunde!" />}

          {feed.length > 0 && (
            <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
              {feed.map((n) => (
                <span key={n.id} className="animate-celebration-in flex items-center gap-2 rounded-2xl bg-black/65 px-4 py-2 text-xl font-bold">
                  <span className="h-4 w-4 rounded-full" style={{ background: n.color }} />
                  {n.text}
                </span>
              ))}
            </div>
          )}

          {state.status === "finished" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-black/30 p-6">
              <div className="w-full max-w-lg">
                <GameResults
                  ranking={rankFrom(Object.fromEntries(state.roster.map((id) => [id, playerInfo(state, id)])), state.score, state.roster)}
                  myId=""
                  unit="rondas"
                  celebrate
                  actions={
                    <>
                      <button onClick={() => playAgain(roomId, state.gameNo, Object.keys(presence)).catch(console.error)} className={`w-full text-lg ${PRIMARY_BUTTON}`}>
                        Otra partida
                      </button>
                      <button
                        onClick={() => backToWaiting(roomId, "empujones/state", state.gameNo).catch(console.error)}
                        className="w-full rounded-xl bg-white/10 py-3 text-base font-bold text-white hover:bg-white/15"
                      >
                        Volver a la sala (cambiar bots o rondas)
                      </button>
                    </>
                  }
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Callout({ text }: { text: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 z-10 flex justify-center">
      <span className="animate-celebration-in rounded-2xl bg-[#FF5FA2] px-6 py-3 font-display text-4xl text-talo-ink">{text}</span>
    </div>
  );
}

function RoundBanner({ state }: { state: EmpujonesState }) {
  const w = state.lastWinner;
  const info = w ? playerInfo(state, w) : null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/25">
      <div className="animate-celebration-in flex flex-col items-center gap-2 rounded-3xl bg-talo-ink/90 px-10 py-7 text-center">
        <p className="text-xl font-bold text-white/60">Ronda {state.lastRound + 1}</p>
        {info ? (
          <p className="flex items-center gap-3 font-display text-6xl">
            <span className="h-10 w-10 rounded-full" style={{ background: info.color }} />
            ¡Para {info.name}!
          </p>
        ) : (
          <p className="font-display text-5xl">¡Se cayeron todos!</p>
        )}
        <p className="text-lg text-white/60">
          {info ? `Lleva ${state.score[w] ?? 0} de ${state.target}` : "Nadie suma"} · ahora la ronda {state.round + 1}
        </p>
      </div>
    </div>
  );
}

/** Everyone in the match with the rounds they won (pips toward the target). */
function Scoreboard({ state, presence, alive }: { state: EmpujonesState; presence: PresenceMap; alive: number | null }) {
  return (
    <div className="flex max-w-[60vw] flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-1.5">
        {state.roster.map((id) => {
          const info = playerInfo(state, id);
          const won = state.score[id] ?? 0;
          const gone = !isBot(id) && !(id in presence);
          return (
            <span key={id} className={`flex items-center gap-2 rounded-xl bg-black/60 px-3 py-1.5 text-base font-bold ${gone ? "opacity-50" : ""}`}>
              <span className="h-3.5 w-3.5 rounded-full" style={{ background: info.color }} />
              <span className="max-w-32 truncate">{info.name}</span>
              <span className="flex gap-0.5">
                {Array.from({ length: state.target }, (_, i) => (
                  <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < won ? "bg-talo-hero" : "bg-white/20"}`} />
                ))}
              </span>
            </span>
          );
        })}
      </div>
      {alive !== null && (
        <span className="rounded-xl bg-black/60 px-4 py-1 font-display text-xl">
          Ronda {state.round + 1} · quedan {alive}
        </span>
      )}
    </div>
  );
}

function JoinCard({ roomId, meta, state, presence }: { roomId: string; meta: EmpujonesMeta; state: EmpujonesState; presence: PresenceMap }) {
  const host = useSyncExternalStore(noSubscribe, () => window.location.host, () => "");
  const ring = playersIn(state, Object.keys(presence));
  const [busy, setBusy] = useState(false);
  return (
    <div className="absolute inset-y-0 left-0 z-10 flex w-full items-center overflow-y-auto p-4 pt-20 sm:p-8 sm:pt-20 lg:w-[42%]">
      <div className="flex w-full flex-col gap-5 rounded-3xl bg-talo-ink/90 p-6 sm:p-8">
        <div className="flex items-center gap-3 text-white/80">
          <Smartphone className="h-7 w-7 text-talo-hero" />
          <p className="text-xl font-bold">Entra desde tu celular</p>
        </div>
        <div className="flex items-center gap-5">
          <RoomQR game="empujones" roomId={roomId} className="h-40 w-40 shrink-0 sm:h-48 sm:w-48" />
          <p className="text-lg text-white/80">Escanéalo con la cámara del celular y entras directo a la sala.</p>
        </div>
        <div>
          <p className="mb-1 text-sm text-white/50">O escribe esta dirección:</p>
          <p className="break-all font-code text-base text-white/60 sm:text-xl">
            {host}
            {roomPath("empujones", "")}
            <span className="text-talo-hero">{roomId}</span>
          </p>
          <p className="mt-2 font-code text-6xl font-bold tracking-[0.15em] text-talo-hero sm:text-7xl">{roomId}</p>
          <p className="mt-1 text-sm text-white/50">o en la página de Talo: «¿Te invitaron?» y este código</p>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold text-white/50">
            {ring.length ? `En la isla (${ring.length})` : "Todavía no entró nadie"}
            {meta.bots > 0 && ` · más ${meta.bots} ${meta.bots === 1 ? "bot" : "bots"}`}
          </p>
          <div className="flex flex-wrap gap-2">
            {ring.map((id) => (
              <span key={id} className="flex items-center gap-2 rounded-full bg-white/[0.08] px-3 py-1.5 text-lg font-bold">
                <span className="h-4 w-4 rounded-full" style={{ background: playerInfo(state, id).color }} />
                {playerInfo(state, id).name}
              </span>
            ))}
            {meta.bots > 0 && (
              <span className="flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1.5 text-lg text-white/50">
                <Bot className="h-4 w-4" /> ×{meta.bots}
              </span>
            )}
          </div>
        </div>
        <button
          disabled={!ring.length || busy}
          onClick={() => {
            setBusy(true);
            startMatch(roomId, Object.keys(presence))
              .catch(console.error)
              .finally(() => setBusy(false));
          }}
          className={`w-full text-lg ${PRIMARY_BUTTON}`}
        >
          {ring.length ? "¡Empezar!" : "Esperando jugadores…"}
        </button>
        <p className="text-sm text-white/50">
          Mientras esperan, cada uno ya puede mover su talo desde el celular. Gana el primero en ganar {meta.target} rondas. Para probar sin
          celulares: WASD + espacio, o flechas + L.
        </p>
      </div>
    </div>
  );
}
