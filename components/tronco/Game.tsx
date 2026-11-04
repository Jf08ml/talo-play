"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Footprints } from "lucide-react";
import {
  botHost,
  isBot,
  kick,
  playerInfo,
  reportOut,
  seatOf,
  sendAct,
  subscribeActs,
  timelineOf,
  type Act,
  type TroncoState,
} from "@/lib/troncoRoom";
import { JUMP_LEN, KICK_RECOVER, airborne, botAct, crossings, kickWorks, logAt, newMind, shaking, timeToReach, type BotMind } from "@/lib/tronco";
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

interface Runner {
  jump: number;
  kick: number;
  busy: number;
  judged: number;
  mind: BotMind;
}

/** The match: the 3D ring full screen, and "Saltar" / "Patear". */
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
  const stateRef = useRef(state);
  const presenceRef = useRef({ presence, presenceLoaded });
  const acts = useRef<Record<string, Act>>({});
  const runners = useRef(new Map<string, Runner>());
  /** Kicks sent but not in the state yet (they move the log right away). */
  const pending = useRef<{ t: number; sentAt: number }[]>([]);
  /** Falls seen here before the state has them. */
  const fell = useRef<Record<string, number>>({});
  const absent = useRef<Record<string, number>>({});
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
    return subscribeActs(roomId, g, (a) => (acts.current = a));
  }, [roomId, g]);
  useEffect(() => {
    const t = setTimeout(() => setHint(false), 12000);
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
      r = { jump: a?.j ?? -1e12, kick: a?.k ?? -1e12, busy: 0, judged: stateRef.current.startedAt, mind: newMind() };
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
    if (now < r.busy || isDown(id) || now < stateRef.current.startedAt) return false;
    r.jump = now;
    r.busy = now + JUMP_LEN * 1000;
    sendAct(roomId, g, id, { j: r.jump, k: r.kick });
    return true;
  };

  const doKick = (id: string): "ok" | "miss" | null => {
    const s = stateRef.current;
    const now = serverNow();
    const r = runnerOf(id);
    if (now < r.busy || isDown(id) || now < s.startedAt) return null;
    r.kick = now;
    r.busy = now + KICK_RECOVER * 1000;
    sendAct(roomId, g, id, { j: r.jump, k: r.kick });
    const tl = timeline();
    const last = tl.kicks[tl.kicks.length - 1] ?? 0;
    if (!kickWorks(tl, now, seatOf(s, id)) || now <= last) return "miss";
    pending.current.push({ t: now, sentAt: Date.now() });
    kick(roomId, g, id, now)
      .then((res) => {
        if (!res.committed) pending.current = pending.current.filter((p) => p.t !== now);
      })
      .catch(console.error);
    return "ok";
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

  // Keys: space / ↑ / W jump, K / ↓ / S kick.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if ([" ", "ArrowUp", "w", "W"].includes(e.key)) {
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

  // The loop: bots, judging, and drawing.
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

      if (live && now > s.startedAt) {
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
          if (upto > r.judged) {
            for (const c of crossings(tl, theta, Math.max(r.judged, s.startedAt), upto)) {
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

      const log = logAt(tl, now);
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
      const ttc = meIn && now > s.startedAt ? timeToReach(tl, now, seatOf(s, myId)) : 9;
      scene.frame({
        logAngle: log.angle,
        logDir: log.dir,
        shake: live && now > s.startedAt && shaking(tl, now),
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
      if (!loaded || serverNow() < s.startedAt) return;
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
  const countdown = now && now < state.startedAt ? Math.ceil((state.startedAt - now) / 1000) : 0;
  useCountdownTicks(countdown || null, 3);
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
          </div>
        )}
        {flash && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
            <span key={flash.key} className="animate-celebration-in font-display text-5xl text-talo-hero drop-shadow">
              {flash.text}
            </span>
          </div>
        )}
        {hint && playing && !countdown && !meOut && (
          <p className="pointer-events-none absolute inset-x-4 bottom-3 rounded-xl bg-black/60 px-3 py-2 text-center text-xs font-bold text-white">
            Cuando el tronco llegue a vos: saltalo, o pateálo para que vuelva para el otro lado. Si te toca, te tumba.
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
      {playing && (
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
            onPointerDown={(e) => {
              e.preventDefault();
              kickMe();
            }}
            disabled={!!meOut}
            className="flex select-none items-center justify-center gap-2 rounded-2xl bg-white py-5 text-lg font-bold text-talo-ink active:scale-95 disabled:opacity-30"
          >
            <Footprints className="h-6 w-6" strokeWidth={2.5} /> Patear
          </button>
        </div>
      )}
    </div>
  );
}
