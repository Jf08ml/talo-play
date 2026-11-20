"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, Gamepad2, Gauge } from "lucide-react";
import { Talo } from "@/components/Talo";
import { playerTalo } from "@/lib/talos";
import { ActionButtons, TimingMeter, paintButtons, paintMeter } from "./Hud";
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
  BASE_SPEED,
  FALL_TEXT,
  JUMP_LEN,
  NO_CUE,
  KICK_MISS_RECOVER,
  KICK_RECOVER,
  airborne,
  botAct,
  crossings,
  cueAt,
  fallReason,
  kickWorks,
  logAt,
  newMind,
  speedAt,
  neighbor,
  DrawnLog,
  type FallReason,
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
  control = false,
  onToggleView,
}: {
  roomId: string;
  state: TroncoState;
  myId: string;
  presence: PresenceMap;
  presenceLoaded: boolean;
  /** The game is on a big screen: this phone is only the controller. */
  control?: boolean;
  /** Switch between controller and the 3D view (rooms with a big screen). */
  onToggleView?: () => void;
}) {
  const g = state.gameNo;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const jumpBtn = useRef<HTMLButtonElement>(null);
  const kickBtn = useRef<HTMLButtonElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
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
  const drawn = useRef(new DrawnLog());
  /** Last time this phone tried to kick it off for someone else (a bot, or a timeout). */
  const opening = useRef(0);
  /** The jump window was open last frame (to buzz once when it opens). */
  const buzzed = useRef(false);
  const [flash, setFlash] = useState<{ text: string; key: number } | null>(null);
  const [hint, setHint] = useState(true);
  /** Why I fell (shown under "¡Te tumbó!"). */
  const [reason, setReason] = useState<FallReason | null>(null);
  /** Passes I survived this match (jumped or kicked back). */
  const [saved, setSaved] = useState(0);
  /** "X quedó afuera" notes. */
  const [feed, setFeed] = useState<{ id: string; text: string }[]>([]);
  const seenOut = useRef<Set<string> | null>(null);
  const playing = state.roster.includes(myId);
  useWakeLock();

  // Announce each one who falls (not the ones already out when I arrived).
  useEffect(() => {
    const ids = Object.keys(state.out);
    if (!seenOut.current) {
      seenOut.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !seenOut.current!.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => seenOut.current!.add(id));
    const notes = fresh.filter((id) => id !== myId).map((id) => ({ id: `${id}${Date.now()}`, text: `${playerInfo(state, id).name} quedó afuera` }));
    if (!notes.length) return;
    setFeed((f) => [...f, ...notes].slice(-3));
    // Not cleared on re-render: the state changes on every kick and the note must still go away.
    setTimeout(() => setFeed((f) => f.filter((n) => !notes.includes(n))), 2600);
  }, [state, myId]);

  useEffect(() => {
    stateRef.current = state;
    presenceRef.current = { presence, presenceLoaded };
  }, [state, presence, presenceLoaded]);
  useEffect(() => {
    runners.current = new Map();
    pending.current = [];
    fell.current = {};
    drawn.current = new DrawnLog();
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
      setSaved((n) => n + 1);
      setHint(false);
    } else if (res === "miss") {
      playSound("tick");
      setFlash({ text: "¡Al aire!", key: Date.now() });
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
    // As a controller (the game is on a TV) there's nothing to draw, but the
    // loop still runs: opening, bots, judging, the bar and the buttons.
    let scene: TroncoScene | null = null;
    if (!control && canvas && wrap) {
      try {
        scene = new TroncoScene(canvas);
      } catch (err) {
        console.error(err);
      }
    }
    const ro = new ResizeObserver(() => {
      const r = wrap!.getBoundingClientRect();
      scene?.resize(r.width, r.height);
    });
    if (scene && wrap) ro.observe(wrap);
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
              if (airborne(r.jump, c)) {
                // Cleared it.
                if (id === myId) {
                  playSound("whoosh");
                  setSaved((n) => n + 1);
                  setFlash({ text: "¡Bien!", key: Date.now() });
                }
                continue;
              }
              fell.current[id] = c;
              reportOut(roomId, g, id, c).catch(console.error);
              playSound(id === myId ? "bad" : "place");
              if (id === myId) {
                setReason(fallReason(r.jump, r.kick, c));
                navigator.vibrate?.([120, 60, 220]);
              }
              break;
            }
            r.judged = upto;
          }
        }
      }

      const log = logAt(tl, now);
      const meIn = s.roster.includes(myId);
      const meUp = meIn && !isDown(myId);
      const cue = meUp && live ? cueAt(tl, now, seatOf(s, myId)) : NO_CUE;
      const busy = now < (runners.current.get(myId)?.busy ?? 0);
      // A buzz when the jump window opens (players may be looking at a TV).
      const open = cue.jump && !busy;
      if (open && !buzzed.current) navigator.vibrate?.(30);
      buzzed.current = open;
      let from = "";
      if (control && meIn && Number.isFinite(cue.ttc)) {
        const i = s.roster.indexOf(myId);
        from = playerInfo(s, s.roster[neighbor(i, s.roster.length, log.dir === 1 ? -1 : 1)]).name;
      }
      paintButtons(jumpBtn.current, kickBtn.current, cue, busy);
      paintMeter(meterRef.current, cue, log.dir, meUp && rolling(s, now), busy, undefined, from);
      if (!scene) {
        raf = requestAnimationFrame(loop);
        return;
      }

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
      scene.frame({
        logAngle: drawn.current.angle(tl, now, OPEN_LEAD_MS, performance.now()),
        logDir: log.dir,
        speed: rolling(s, now) ? speedAt(tl, now) : 0,
        // It trembles at the opener's feet while waiting for the kick.
        shake: live && !s.startedAt && now >= s.openAt,
        rolling: rolling(s, now),
        players: players.map((p) => (p.me ? { ...p, cue } : p)),
        myAngle: meIn ? seatOf(s, myId) : null,
        time: performance.now() / 1000,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one scene per game; everything else is read from refs.
  }, [g, roomId, myId, control]);

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
  const rollingNow = live && !!now && rolling(state, now);
  const pace = rollingNow ? speedAt(timelineOf(state), now) / BASE_SPEED : 1;

  const myIdx = state.roster.indexOf(myId);
  const sideName = (dir: 1 | -1) => (myIdx >= 0 ? playerInfo(state, state.roster[neighbor(myIdx, state.roster.length, dir)]).name : "");
  const me = playerInfo(state, myId);

  const chips = (
    <div className="pointer-events-none flex flex-wrap justify-center gap-1.5 px-2">
      <span className="rounded-full bg-black/55 px-3 py-1 text-sm font-bold text-white">
        Quedan {standing} de {state.roster.length}
      </span>
      {rollingNow && (
        <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${pace >= 2 ? "bg-red-500/80 text-white" : pace >= 1.5 ? "bg-talo-hero text-talo-ink" : "bg-black/55 text-white"}`}>
          <Gauge className="h-4 w-4" /> ×{pace.toFixed(1)}
        </span>
      )}
      {playing && saved > 0 && !meOut && (
        <span key={saved} className="animate-celebration-in rounded-full bg-black/55 px-3 py-1 text-sm font-bold text-white">
          Esquivadas: {saved}
        </span>
      )}
    </div>
  );

  const viewToggle = onToggleView && (
    <button
      onClick={onToggleView}
      className="pointer-events-auto absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs font-bold text-white hover:bg-black/70"
    >
      {control ? <Eye className="h-4 w-4" /> : <Gamepad2 className="h-4 w-4" />}
      {control ? "Ver la ronda acá" : "Usar de control"}
    </button>
  );

  // The opening kick: to my left/right as I see it, or (as a controller, with
  // the ring on a TV) toward a neighbor by name.
  const openButtons = (
    <div className={`grid grid-cols-2 gap-3 bg-talo-ink p-3 pb-[max(12px,env(safe-area-inset-bottom))] ${control ? "min-h-0 flex-1" : ""}`}>
      {(["left", "right"] as const).map((side) => (
        <button
          key={side}
          onPointerDown={(e) => {
            e.preventDefault();
            openMe(side);
          }}
          className={`flex select-none items-center justify-center gap-2 rounded-2xl bg-talo-hero font-bold text-talo-ink active:scale-95 ${control ? "h-full flex-col text-2xl" : "py-5 text-lg"}`}
        >
          {side === "left" && <ArrowLeft className={control ? "h-10 w-10" : "h-6 w-6"} strokeWidth={3} />}
          {control ? `Hacia ${sideName(side === "right" ? 1 : -1)}` : "Para allá"}
          {side === "right" && <ArrowRight className={control ? "h-10 w-10" : "h-6 w-6"} strokeWidth={3} />}
        </button>
      ))}
    </div>
  );

  const buttons =
    playing &&
    (iOpen ? openButtons : <ActionButtons jumpRef={jumpBtn} kickRef={kickBtn} onJump={jumpMe} onKick={kickMe} disabled={!!meOut} big={control} />);

  if (control) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        {viewToggle}
        <div className="flex shrink-0 flex-col items-center gap-3 px-4 pb-3 pt-12 text-center">
          {chips}
          {playing ? (
            <div className="flex items-center gap-3">
              <Talo {...playerTalo(myId, me.color, 44)} expr={meOut ? "triste" : flash && !flash.text.includes("aire") ? "contento" : "normal"} />
              <div className="text-left">
                <p className="text-xs font-bold uppercase tracking-wide text-white/50">Sos</p>
                <p className="font-display text-2xl leading-tight text-white">{me.name}</p>
              </div>
            </div>
          ) : (
            <p className="text-base font-bold text-white/80">Estás mirando: en la próxima entrás vos también.</p>
          )}
          <div className="flex min-h-[88px] flex-col items-center justify-center gap-1.5">
            {countdown > 0 ? (
              <>
                <span key={countdown} className="animate-celebration-in font-display text-6xl text-white">
                  {countdown}
                </span>
                <span className="text-sm font-bold text-white/70">
                  {state.opener === myId ? "Arrancás vos: vas a patear el tronco" : `Mirá la pantalla · arranca ${openerName}`}
                </span>
              </>
            ) : waitingOpen ? (
              <span className="rounded-2xl bg-white/[0.08] px-4 py-2 text-base font-bold text-white">
                {iOpen ? "¡Arrancás vos! ¿Para quién lo pateás?" : `${openerName} va a patear el tronco…`}
                {iOpen && openLeft <= 4 && <span className="block text-sm text-white/60">Si no elegís, sale solo en {openLeft}</span>}
              </span>
            ) : meOut ? (
              <>
                <span className="font-display text-3xl text-white">¡Te tumbó!</span>
                {reason && <span className="max-w-xs text-sm font-bold text-talo-hero">{FALL_TEXT[reason]}</span>}
                <span className="text-sm font-bold text-white/70">
                  Quedaste {place}º{saved > 0 ? ` · esquivaste ${saved}` : ""}
                </span>
              </>
            ) : flash ? (
              <span key={flash.key} className="animate-celebration-in font-display text-4xl text-talo-hero">
                {flash.text}
              </span>
            ) : playing ? (
              <span className="max-w-xs text-sm font-bold text-white/60">
                Mirá la pantalla: el anillo bajo tu talo se pone amarillo para saltar y verde para patear. El celular vibra cuando llega.
              </span>
            ) : null}
          </div>
          {feed.length > 0 && <p className="text-xs font-bold text-white/50">{feed[feed.length - 1].text}</p>}
          {playing && !meOut && <TimingMeter meterRef={meterRef} />}
        </div>
        {buttons}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none select-none" />
        {viewToggle}
        <div className="absolute inset-x-0 top-2">{chips}</div>
        {feed.length > 0 && (
          <div className="pointer-events-none absolute left-2 top-12 flex flex-col gap-1">
            {feed.map((n) => (
              <span key={n.id} className="animate-celebration-in rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white">
                {n.text}
              </span>
            ))}
          </div>
        )}
        {countdown > 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30">
            <span key={countdown} className="animate-celebration-in font-display text-8xl text-white drop-shadow">
              {countdown}
            </span>
            {playing && <span className="rounded-full bg-black/60 px-3 py-1 text-sm font-bold text-white">Sos el de la etiqueta amarilla</span>}
            {playing && (
              <span className="max-w-xs rounded-2xl bg-black/60 px-3 py-1.5 text-center text-sm font-bold text-white">
                Apretá el botón que se ilumina: <span className="text-talo-hero">amarillo, saltá</span> ·{" "}
                <span className="text-emerald-300">verde, pateá</span>
              </span>
            )}
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
          <p className="pointer-events-none absolute inset-x-4 bottom-[92px] mx-auto max-w-sm rounded-xl bg-black/60 px-3 py-2 text-center text-xs font-bold text-white">
            La barra de abajo te muestra el tronco viniendo. Saltá cuando entre en lo amarillo, o pateálo en lo verde para que vuelva para el otro lado.
          </p>
        )}
        {playing && !meOut && (
          <div className="absolute inset-x-4 bottom-3">
            <TimingMeter meterRef={meterRef} />
          </div>
        )}
        {meOut && (
          <div className="pointer-events-none absolute inset-x-0 top-1/4 flex flex-col items-center gap-2 px-4">
            <span className="animate-celebration-in font-display text-4xl text-white drop-shadow">¡Te tumbó!</span>
            {reason && <span className="max-w-xs rounded-2xl bg-black/65 px-3 py-1.5 text-center text-sm font-bold text-talo-hero">{FALL_TEXT[reason]}</span>}
            <span className="rounded-full bg-black/60 px-3 py-1 text-sm font-bold text-white">
              Quedaste {place}º{saved > 0 ? ` · esquivaste ${saved}` : ""} · mirá cómo sigue
            </span>
          </div>
        )}
        {!playing && (
          <p className="pointer-events-none absolute inset-x-4 bottom-3 rounded-xl bg-black/60 px-3 py-2 text-center text-xs font-bold text-white">
            Estás mirando: en la próxima entrás vos también.
          </p>
        )}
      </div>
      {buttons}
    </div>
  );
}
