"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, Footprints } from "lucide-react";
import {
  botHost,
  isBot,
  kick,
  openKick,
  OPEN_LEAD_MS,
  OPEN_WAIT_MS,
  playerInfo,
  randomDir,
  reportOut,
  seatOf,
  sendAct,
  subscribeActs,
  timelineOf,
  type Act,
  type TroncoState,
} from "@/lib/troncoRoom";
import {
  JUMP_LEN,
  KICK_MISS_RECOVER,
  KICK_RECOVER,
  airborne,
  botAct,
  crossings,
  kickWorks,
  logAt,
  newMind,
  speedAt,
  timeToReach,
  wrapPi,
  type BotMind,
} from "@/lib/tronco";
import { TroncoScene, type PlayerView } from "@/lib/tronco3d";
import { serverNow } from "@/lib/serverTime";
import { playSound } from "@/lib/sfx";
import type { PresenceMap } from "@/lib/presence";
import { useServerNow } from "@/hooks/useServerNow";
import { useCountdownTicks } from "@/hooks/useSound";
import { useWakeLock } from "@/components/carreras/Controller";

/** How late a pass over a player is judged, so a kick that happened just before has time to arrive. */
const JUDGE_DELAY_MS = 160;
/** A person missing this long falls (so a ring never waits on someone who left). */
const GONE_MS = 4000;
/** How fast a jump in the drawn log (a kick that arrived late) fades away, per second. */
const SMOOTH_RATE = 10;
/** A bot opener thinks this long before kicking it off. */
const BOT_OPEN_MS = 1600;

interface Runner {
  jump: number;
  kick: number;
  busy: number;
  judged: number;
  mind: BotMind;
}

/** The log is turning (the opening kick happened and its lead went by). */
const rolling = (s: TroncoState, now: number) => s.startedAt > 0 && now >= s.startedAt;

/** The match: the 3D ring full screen, and "Saltar" / "Patear" (or the opening kick's sides). */
export default function TroncoGame({
  roomId,
  state,
  myId,
  presence,
  presenceLoaded,
}: {
  roomId: string;
  state: TroncoState;
  myId: string;
  presence: PresenceMap;
  presenceLoaded: boolean;
}) {
  const g = state.gameNo;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const kickBtn = useRef<HTMLButtonElement>(null);
  const stateRef = useRef(state);
  const presenceRef = useRef({ presence, presenceLoaded });
  const acts = useRef<Record<string, Act>>({});
  const runners = useRef(new Map<string, Runner>());
  /** Kicks sent but not in the state yet (they move the log right away). */
  const pending = useRef<{ t: number; sentAt: number }[]>([]);
  /** Falls seen here before the state has them. */
  const fell = useRef<Record<string, number>>({});
  const absent = useRef<Record<string, number>>({});
  /** The drawn log: an offset absorbs jumps (late kicks) and fades away. */
  const shown = useRef({ prev: NaN, dir: 1, speed: 0, offset: 0, at: 0 });
  /** Last time this phone tried to kick it off for someone else (a bot, or a timeout). */
  const opening = useRef(0);
  const [flash, setFlash] = useState<{ text: string; key: number } | null>(null);
  const [hint, setHint] = useState(true);
  const playing = state.roster.includes(myId);
  useWakeLock();

  useEffect(() => {
    stateRef.current = state;
    presenceRef.current = { presence, presenceLoaded };
  }, [state, presence, presenceLoaded]);
  useEffect(() => {
    runners.current = new Map();
    pending.current = [];
    fell.current = {};
    shown.current = { prev: NaN, dir: 1, speed: 0, offset: 0, at: 0 };
    opening.current = 0;
    return subscribeActs(roomId, g, (a) => (acts.current = a));
  }, [roomId, g]);
  useEffect(() => {
    const t = setTimeout(() => setHint(false), 15000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [flash]);

  const runnerOf = (id: string): Runner => {
    let r = runners.current.get(id);
    if (!r) {
      const a = acts.current[id];
      r = { jump: a?.j ?? -1e12, kick: a?.k ?? -1e12, busy: 0, judged: 0, mind: newMind() };
      runners.current.set(id, r);
    }
    return r;
  };

  const timeline = () => {
    const s = stateRef.current;
    const now = Date.now();
    pending.current = pending.current.filter((p) => !s.kicks.includes(p.t) && now - p.sentAt < 2500);
    return timelineOf(s, pending.current.map((p) => p.t));
  };

  const isDown = (id: string) => !!stateRef.current.out[id] || fell.current[id] !== undefined;

  const doJump = (id: string) => {
    const now = serverNow();
    const r = runnerOf(id);
    if (now < r.busy || isDown(id) || !rolling(stateRef.current, now)) return false;
    r.jump = now;
    r.busy = now + JUMP_LEN * 1000;
    sendAct(roomId, g, id, { j: r.jump, k: r.kick });
    return true;
  };

  const doKick = (id: string): "ok" | "miss" | null => {
    const s = stateRef.current;
    const now = serverNow();
    const r = runnerOf(id);
    if (now < r.busy || isDown(id) || !rolling(s, now)) return null;
    const tl = timeline();
    const last = tl.kicks[tl.kicks.length - 1] ?? 0;
    const works = kickWorks(tl, now, seatOf(s, id)) && now > last;
    r.kick = now;
    r.busy = now + (works ? KICK_RECOVER : KICK_MISS_RECOVER) * 1000;
    sendAct(roomId, g, id, { j: r.jump, k: r.kick });
    if (!works) return "miss";
    pending.current.push({ t: now, sentAt: Date.now() });
    kick(roomId, g, id, now)
      .then((res) => {
        if (!res.committed) pending.current = pending.current.filter((p) => p.t !== now);
      })
      .catch(console.error);
    return "ok";
  };

  /** The opening kick (opener = `id`), sending the log to `dir`. */
  const doOpen = (id: string, dir: 1 | -1) => {
    const now = serverNow();
    const r = runnerOf(id);
    r.kick = now;
    sendAct(roomId, g, id, { j: r.jump, k: now });
    openKick(roomId, g, id, dir).catch(console.error);
  };

  /** My opening kick, to my left or right as I see it. */
  const openMe = (side: "left" | "right") => {
    const s = stateRef.current;
    if (s.opener !== myId || s.startedAt || serverNow() < s.openAt || isDown(myId)) return;
    // From behind my seat, looking at the middle, a growing angle goes to the right.
    doOpen(myId, side === "right" ? 1 : -1);
    playSound("capture");
    setFlash({ text: "¡PUM!", key: Date.now() });
  };

  const jumpMe = () => {
    if (!playing) return;
    if (doJump(myId)) {
      playSound("flip");
      setHint(false);
    }
  };
  const kickMe = () => {
    if (!playing) return;
    const res = doKick(myId);
    if (res === "ok") {
      playSound("capture");
      setFlash({ text: "¡PUM!", key: Date.now() });
      setHint(false);
    } else if (res === "miss") {
      playSound("tick");
    }
  };

  // Keys: space / ↑ / W jump, K / ↓ / S kick; ← / A and → / D kick it off.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (["ArrowLeft", "a", "A"].includes(e.key)) {
        e.preventDefault();
        openMe("left");
      } else if (["ArrowRight", "d", "D"].includes(e.key)) {
        e.preventDefault();
        openMe("right");
      } else if ([" ", "ArrowUp", "w", "W"].includes(e.key)) {
        e.preventDefault();
        jumpMe();
      } else if (["k", "K", "ArrowDown", "s", "S", "Enter"].includes(e.key)) {
        e.preventDefault();
        kickMe();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The loop: the opening, bots, judging, and drawing.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let scene: TroncoScene;
    try {
      scene = new TroncoScene(canvas);
    } catch (err) {
      console.error(err);
      return;
    }
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      scene.resize(r.width, r.height);
    });
    ro.observe(wrap);
    let raf = 0;
    const loop = () => {
      const s = stateRef.current;
      const { presence: pres, presenceLoaded: loaded } = presenceRef.current;
      const now = serverNow();
      const live = s.status === "playing" && s.gameNo === g;
      const tl = timeline();
      const host = loaded && botHost(Object.keys(pres)) === myId;

      // The opening: a bot opener is kicked off by its host; one who takes too long, by anyone.
      if (live && !s.startedAt && s.opener && now >= s.openAt && Date.now() - opening.current > 1000) {
        if (host && isBot(s.opener) && now >= s.openAt + BOT_OPEN_MS) {
          opening.current = Date.now();
          doOpen(s.opener, randomDir(s.seed));
        } else if (now >= s.openAt + OPEN_WAIT_MS) {
          opening.current = Date.now();
          openKick(roomId, g, myId, randomDir(s.seed), true).catch(console.error);
        }
      }

      if (live && rolling(s, now)) {
        const mine = [...(s.roster.includes(myId) ? [myId] : []), ...(host ? s.roster.filter(isBot) : [])];
        for (const id of mine) {
          if (isDown(id)) continue;
          const theta = seatOf(s, id);
          const r = runnerOf(id);
          if (isBot(id) && now >= r.busy) {
            const a = botAct(r.mind, tl, now, theta, 0.5);
            if (a === "jump") doJump(id);
            else if (a === "kick") doKick(id);
          }
          // Judge passes that are old enough.
          const upto = now - JUDGE_DELAY_MS;
          const from = Math.max(r.judged, s.startedAt);
          if (upto > from) {
            for (const c of crossings(tl, theta, from, upto)) {
              if (airborne(r.jump, c)) continue;
              fell.current[id] = c;
              reportOut(roomId, g, id, c).catch(console.error);
              playSound(id === myId ? "bad" : "place");
              break;
            }
            r.judged = upto;
          }
        }
      }

      // The drawn log. Before it rolls it nudges toward the side it was kicked;
      // any jump (another's kick arriving late, the nudge ending) goes into an
      // offset that fades, so it never snaps. Judging uses the real one.
      const log = logAt(tl, now);
      let target = log.angle;
      if (s.startedAt > 0 && now < s.startedAt) {
        const p = Math.max(0, Math.min(1, 1 - (s.startedAt - now) / OPEN_LEAD_MS));
        target += log.dir * 0.14 * Math.sin(p * (Math.PI / 2));
      }
      const v = shown.current;
      const clock = performance.now();
      const dt = Math.min(0.1, (clock - v.at) / 1000);
      if (Number.isFinite(v.prev)) {
        const jump = wrapPi(target - v.prev - v.dir * v.speed * dt);
        if (Math.abs(jump) > 0.03) v.offset -= jump;
        v.offset = wrapPi(v.offset) * Math.exp(-dt * SMOOTH_RATE);
      }
      v.prev = target;
      v.dir = log.dir;
      v.speed = rolling(s, now) ? speedAt(tl, now) : 0;
      v.at = clock;

      const players: PlayerView[] = s.roster.map((id) => {
        const local = runners.current.get(id);
        const a = acts.current[id];
        const jump = local && (id === myId || isBot(id)) ? local.jump : a?.j ?? -1e12;
        const kk = local && (id === myId || isBot(id)) ? local.kick : a?.k ?? -1e12;
        const down = s.out[id] ?? fell.current[id];
        const info = playerInfo(s, id);
        return {
          id,
          name: info.name,
          color: info.color,
          angle: seatOf(s, id),
          me: id === myId,
          jumpS: (now - jump) / 1000,
          kickS: (now - kk) / 1000,
          fallS: down !== undefined ? Math.max(0, (now - down) / 1000) : -1,
        };
      });
      const meIn = s.roster.includes(myId);
      const meUp = meIn && !isDown(myId);
      const ttc = meUp && s.startedAt > 0 ? timeToReach(tl, now, seatOf(s, myId)) : 9;
      const kickable = meUp && rolling(s, now) && kickWorks(tl, now, seatOf(s, myId));
      const btn = kickBtn.current;
      if (btn && (btn.dataset.ready === "1") !== kickable) btn.dataset.ready = kickable ? "1" : "";
      scene.frame({
        logAngle: target + v.offset,
        logDir: log.dir,
        // It trembles at the opener's feet while waiting for the kick.
        shake: live && !s.startedAt && now >= s.openAt,
        rolling: rolling(s, now),
        kickable,
        players,
        myAngle: meIn ? seatOf(s, myId) : null,
        danger: Math.max(0, Math.min(1, 1 - ttc / 1.1)),
        time: performance.now() / 1000,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one scene per game; everything else is read from refs.
  }, [g, roomId, myId]);

  // People who left fall (any phone does it), so the ring doesn't wait for them.
  useEffect(() => {
    if (state.status !== "playing") return;
    const id = setInterval(() => {
      const s = stateRef.current;
      const { presence: pres, presenceLoaded: loaded } = presenceRef.current;
      if (!loaded || serverNow() < s.openAt) return;
      for (const p of s.roster) {
        if (isBot(p) || s.out[p]) continue;
        if (p in pres) {
          delete absent.current[p];
          continue;
        }
        absent.current[p] ??= Date.now();
        if (Date.now() - absent.current[p] > GONE_MS) reportOut(roomId, g, p, serverNow()).catch(console.error);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [state.status, roomId, g]);

  const now = useServerNow(true, 250);
  const countdown = now && now < state.openAt ? Math.ceil((state.openAt - now) / 1000) : 0;
  useCountdownTicks(countdown || null, 3);
  const live = state.status === "playing";
  const waitingOpen = live && !countdown && !state.startedAt && !!state.opener;
  const iOpen = waitingOpen && state.opener === myId && !state.out[myId];
  const openLeft = waitingOpen && now ? Math.max(0, Math.ceil((state.openAt + OPEN_WAIT_MS - now) / 1000)) : 0;
  const openerName = state.opener ? playerInfo(state, state.opener).name : "";
  const standing = state.roster.filter((p) => !state.out[p]).length;
  const meOut = state.out[myId];
  const place = meOut ? state.roster.length - Object.values(state.out).filter((t) => t < meOut).length : 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none select-none" />
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
          <span className="rounded-full bg-black/55 px-3 py-1 text-sm font-bold text-white">
            Quedan {standing} de {state.roster.length}
          </span>
        </div>
        {countdown > 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30">
            <span key={countdown} className="animate-celebration-in font-display text-8xl text-white drop-shadow">
              {countdown}
            </span>
            {playing && <span className="rounded-full bg-black/60 px-3 py-1 text-sm font-bold text-white">Sos el de la etiqueta amarilla</span>}
            {openerName && (
              <span className="rounded-full bg-black/60 px-3 py-1 text-sm font-bold text-white">
                {state.opener === myId ? "Arrancás vos: vas a patear el tronco" : `Arranca ${openerName}`}
              </span>
            )}
          </div>
        )}
        {waitingOpen && (
          <div className="pointer-events-none absolute inset-x-0 top-12 flex flex-col items-center gap-1 px-4 text-center">
            <span className="rounded-2xl bg-black/65 px-4 py-2 text-base font-bold text-white">
              {iOpen ? "¡Arrancás vos! Pateá el tronco para un lado" : `${openerName} va a patear el tronco… ¿para qué lado?`}
            </span>
            {iOpen && openLeft <= 4 && (
              <span className="rounded-full bg-black/50 px-3 py-0.5 text-sm font-bold text-white">Si no elegís, sale solo en {openLeft}</span>
            )}
          </div>
        )}
        {flash && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
            <span key={flash.key} className="animate-celebration-in font-display text-5xl text-talo-hero drop-shadow">
              {flash.text}
            </span>
          </div>
        )}
        {hint && playing && !countdown && !waitingOpen && !meOut && (
          <p className="pointer-events-none absolute inset-x-4 bottom-3 rounded-xl bg-black/60 px-3 py-2 text-center text-xs font-bold text-white">
            Cuando el tronco llegue a vos: saltalo, o pateálo cuando el círculo (y el botón) se ponen verdes para que vuelva para el otro lado.
          </p>
        )}
        {meOut && (
          <div className="pointer-events-none absolute inset-x-0 top-1/4 flex flex-col items-center gap-1">
            <span className="font-display text-4xl text-white drop-shadow">¡Te tumbó!</span>
            <span className="rounded-full bg-black/60 px-3 py-1 text-sm font-bold text-white">Quedaste {place}º · mirá cómo sigue</span>
          </div>
        )}
        {!playing && (
          <p className="pointer-events-none absolute inset-x-4 bottom-3 rounded-xl bg-black/60 px-3 py-2 text-center text-xs font-bold text-white">
            Estás mirando: en la próxima entrás vos también.
          </p>
        )}
      </div>
      {playing && iOpen && (
        <div className="grid grid-cols-2 gap-3 bg-talo-ink p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              openMe("left");
            }}
            className="flex select-none items-center justify-center gap-2 rounded-2xl bg-talo-hero py-5 text-lg font-bold text-talo-ink active:scale-95"
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={3} /> Para allá
          </button>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              openMe("right");
            }}
            className="flex select-none items-center justify-center gap-2 rounded-2xl bg-talo-hero py-5 text-lg font-bold text-talo-ink active:scale-95"
          >
            Para allá <ArrowRight className="h-6 w-6" strokeWidth={3} />
          </button>
        </div>
      )}
      {playing && !iOpen && (
        <div className="grid grid-cols-2 gap-3 bg-talo-ink p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              jumpMe();
            }}
            disabled={!!meOut}
            className="flex select-none items-center justify-center gap-2 rounded-2xl bg-talo-hero py-5 text-lg font-bold text-talo-ink active:scale-95 disabled:opacity-30"
          >
            <ArrowUp className="h-6 w-6" strokeWidth={3} /> Saltar
          </button>
          <button
            ref={kickBtn}
            onPointerDown={(e) => {
              e.preventDefault();
              kickMe();
            }}
            disabled={!!meOut}
            className="flex select-none items-center justify-center gap-2 rounded-2xl bg-white py-5 text-lg font-bold text-talo-ink transition-colors duration-75 active:scale-95 disabled:opacity-30 data-[ready=1]:bg-emerald-400"
          >
            <Footprints className="h-6 w-6" strokeWidth={2.5} /> Patear
          </button>
        </div>
      )}
    </div>
  );
}
