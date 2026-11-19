"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  ballAt,
  botHost,
  cardOf,
  closeHole,
  finishHole,
  holeKey,
  isBot,
  nextHole,
  playerInfo,
  roomHole,
  sendBall,
  shotPose,
  subscribeBalls,
  teePose,
  totalOf,
  type BallPose,
  type GolfState,
} from "@/lib/minigolf";
import { botShot, scoreName, toPar } from "@/lib/minigolfSim";
import { generateHole } from "@/lib/minigolfHoles";
import { golfAudio } from "@/lib/minigolfAudio";
import { mulberry32 } from "@/lib/random";
import { serverNow } from "@/lib/serverTime";
import type { PresenceMap } from "@/lib/presence";
import { useServerNow } from "@/hooks/useServerNow";
import { formatTime } from "@/components/ladrillazo/Hud";
import GolfField, { type OtherBall } from "./GolfField";
import Scorecard from "./Scorecard";
import ViewButtons, { useGolfView } from "./ViewButtons";

/** A bot waits this long (s) after its ball stops before the next shot, plus a bit. */
const BOT_THINK = [1.4, 2.6];

/** One hole of a room: everyone at once, the others as ghost balls, and between holes the scorecard. */
export default function RoomGame({
  roomId,
  state,
  myId,
  presence,
  presenceLoaded,
}: {
  roomId: string;
  state: GolfState;
  myId: string;
  presence: PresenceMap;
  presenceLoaded: boolean;
}) {
  const look = useGolfView();
  const g = state.gameNo;
  const holeNo = state.hole;
  const hk = holeKey(state);
  const hole = useMemo(() => roomHole(state), [state]);
  const pars = useMemo(
    () => Array.from({ length: state.holes }, (_, i) => generateHole((state.seed + i * 7919) >>> 0, state.difficulty).par),
    [state.seed, state.holes, state.difficulty]
  );
  // Balls of the hole they were read for (another hole's are no use).
  const [read, setRead] = useState<{ hk: string; balls: Record<string, BallPose> } | null>(null);
  const balls = read?.hk === hk ? read.balls : null;
  const stateRef = useRef(state);
  const ballsRef = useRef(balls);
  const presenceRef = useRef({ presence, presenceLoaded });
  const playing = state.roster.includes(myId);
  const now = useServerNow(true, 250);
  const startedAt = state.startedAt;
  const countdown = now && now < startedAt ? Math.ceil((startedAt - now) / 1000) : 0;
  const live = state.status === "playing" && state.phase === "playing";

  useEffect(() => {
    stateRef.current = state;
    ballsRef.current = balls;
    presenceRef.current = { presence, presenceLoaded };
  }, [state, balls, presence, presenceLoaded]);

  useEffect(() => subscribeBalls(roomId, hk, (b) => setRead({ hk, balls: b })), [roomId, hk]);

  const clock = useCallback(() => (serverNow() - startedAt) / 1000, [startedAt]);

  // Countdown beeps.
  const prevCount = useRef(countdown);
  useEffect(() => {
    if (prevCount.current === countdown) return;
    const was = prevCount.current;
    prevCount.current = countdown;
    if (countdown > 0 && countdown <= 3) golfAudio.countdown(countdown);
    else if (countdown === 0 && was > 0) golfAudio.countdown(0);
  }, [countdown]);

  // My ball at the tee, so the others see it there; and my result if I came back after finishing.
  const mine = balls?.[myId];
  const loaded = balls !== null;
  useEffect(() => {
    if (!loaded || !playing || !live) return;
    if (!mine) sendBall(roomId, hk, myId, teePose(hole));
    else if (mine.fin && stateRef.current.done[myId] === undefined) finishHole(roomId, g, holeNo, myId, mine.s).catch(console.error);
  }, [loaded, playing, live, mine, roomId, hk, myId, hole, g, holeNo]);

  // Closing the hole, and the bots (bot host).
  const botNext = useRef(new Map<string, number>());
  useEffect(() => {
    botNext.current = new Map();
  }, [hk]);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      const s = stateRef.current;
      const b = ballsRef.current;
      const { presence: pres, presenceLoaded: ok } = presenceRef.current;
      if (!ok || b === null) return;
      const t = (serverNow() - s.startedAt) / 1000;
      if (t < 0) return;
      const gone = s.roster.filter((p) => !isBot(p) && !(p in pres));
      const strokes = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.s]));
      closeHole(roomId, g, holeNo, gone, strokes).catch(console.error);
      if (botHost(Object.keys(pres)) !== myId) return;
      for (const bot of s.roster.filter(isBot)) {
        if (s.done[bot] !== undefined) continue;
        const pose = b[bot];
        const at = ballAt(hole, pose);
        const rand = mulberry32((s.seed ^ (holeNo * 7349) ^ (at.n * 911) ^ bot.charCodeAt(3)) >>> 0);
        let next = botNext.current.get(bot);
        if (next === undefined) {
          // First look at this bot: let it think from its last shot (or the start).
          next = (pose && pose.end !== "tee" ? pose.t + 4 : 0.8) + BOT_THINK[0] + rand() * (BOT_THINK[1] - BOT_THINK[0]);
          botNext.current.set(bot, next);
        }
        if (t < next) continue;
        // Holed out (or out of strokes): it counts once its ball has stopped.
        if (at.fin) {
          finishHole(roomId, g, holeNo, bot, at.s).catch(console.error);
          continue;
        }
        const shot = botShot(hole, at.x, at.y, t, s.skill[bot] ?? 0.4, rand);
        const { pose: out, elapsed } = shotPose(hole, at, t, shot.angle, shot.power);
        botNext.current.set(bot, t + elapsed + (out.end === "water" ? 0.7 : 0) + BOT_THINK[0] + rand() * (BOT_THINK[1] - BOT_THINK[0]));
        sendBall(roomId, hk, bot, out);
      }
    }, 500);
    return () => clearInterval(id);
  }, [live, roomId, g, holeNo, hk, hole, myId]);

  // Between holes: the next one starts by itself.
  const between = state.phase === "holeEnd";
  const moreHoles = between && state.status === "playing";
  const nextAt = state.nextAt;
  useEffect(() => {
    if (!moreHoles) return;
    const t = setTimeout(() => nextHole(roomId, g, holeNo).catch(console.error), Math.max(0, nextAt - serverNow()) + Math.random() * 300);
    return () => clearTimeout(t);
  }, [moreHoles, nextAt, roomId, g, holeNo]);

  const others = useMemo(() => {
    const out: Record<string, OtherBall> = {};
    for (const [id, pose] of Object.entries(balls ?? {})) if (id !== myId) out[id] = { pose, color: playerInfo(state, id).color };
    return out;
  }, [balls, myId, state]);

  const myDone = state.done[myId];
  const rows = state.roster
    .map((id) => ({ id, ...playerInfo(state, id), card: cardOf(state, id) }))
    .sort((a, b) => totalOf(state, a.id) - totalOf(state, b.id));
  const left = live && now > startedAt ? Math.max(0, (state.endsAt - now) / 1000) : 0;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-2 p-2 sm:p-3 lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between px-1 text-white">
          <p className="text-sm font-bold">
            Hoyo {holeNo + 1} de {state.holes} <span className="ml-1 text-white/60">· par {hole.par}</span>
          </p>
          <div className="flex items-center gap-3 text-sm">
            {playing && !between && (
              <span>
                <span className="font-display text-lg">{mine?.s ?? 0}</span> <span className="text-white/60">{mine?.s === 1 ? "golpe" : "golpes"}</span>
              </span>
            )}
            {left > 0 && left < 60 && <span className="font-mono text-[#ff8a80]">{formatTime(left)}</span>}
            {!between && <ViewButtons g={look} />}
          </div>
        </div>

        {between ? (
          <div className="flex flex-1 flex-col justify-center gap-3 overflow-y-auto">
            <Scorecard pars={pars} rows={rows} myId={myId} current={holeNo} />
            {moreHoles && (
              <p className="text-center text-xs text-white/60">El hoyo {holeNo + 2} arranca en {Math.max(0, Math.ceil((nextAt - now) / 1000))} s</p>
            )}
          </div>
        ) : !loaded ? (
          <div className="flex flex-1 items-center justify-center text-sm text-white/60">Preparando el hoyo…</div>
        ) : (
          <GolfField
            key={hk}
            hole={hole}
            clock={clock}
            color={playerInfo(state, myId).color}
            view={look.view}
            shadows={look.shadows}
            enabled={playing && countdown === 0 && myDone === undefined}
            watching={!playing}
            initial={mine ?? null}
            others={others}
            onShot={(pose) => sendBall(roomId, hk, myId, pose)}
            onDone={(n) => finishHole(roomId, g, holeNo, myId, n).catch(console.error)}
          >
            {countdown > 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
                <span key={countdown} className="animate-celebration-in font-display text-8xl text-white">
                  {countdown}
                </span>
              </div>
            )}
            {myDone !== undefined && (
              <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
                <span className={`animate-celebration-in rounded-full px-4 py-2 text-sm font-bold text-white ${myDone <= hole.par ? "bg-[#00B26B]" : "bg-[#FF7A1A]"}`}>
                  {scoreName(myDone, hole.par)} · esperando al resto
                </span>
              </div>
            )}
            {!playing && (
              <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-white/80">Estás mirando: entrás en la próxima partida.</p>
            )}
          </GolfField>
        )}
        {playing && !between && (mine?.n ?? 0) === 0 && holeNo === 0 && (
          <p className="text-center text-xs text-white/60">Arrastrá hacia atrás para apuntar (como una gomera) y soltá para tirar.</p>
        )}
      </div>

      {!between && (
        <aside className="flex shrink-0 gap-1.5 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-visible">
          {state.roster.map((id) => {
            const info = playerInfo(state, id);
            const away = !isBot(id) && presenceLoaded && !(id in presence);
            const done = state.done[id];
            const s = balls?.[id]?.s ?? 0;
            const total = totalOf(state, id);
            const parSoFar = pars.slice(0, cardOf(state, id).length).reduce((a, b) => a + b, 0);
            return (
              <div
                key={id}
                className={`flex shrink-0 items-center gap-2 rounded-xl bg-white/[0.05] px-2.5 py-1.5 text-sm text-white ring-1 ring-white/10 ${away ? "opacity-40" : ""}`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: info.color }} />
                <span className="max-w-[6rem] truncate font-bold lg:flex-1">{id === myId ? "Vos" : info.name}</span>
                {done !== undefined ? (
                  <span className="inline-flex items-center gap-0.5 text-xs text-[#5fe0a0]">
                    <Check className="h-3.5 w-3.5" /> {done}
                  </span>
                ) : (
                  <span className="font-mono text-xs text-white/70">{s}</span>
                )}
                {holeNo > 0 && <span className="font-mono text-[11px] text-white/45">{toPar(total, parSoFar)}</span>}
              </div>
            );
          })}
        </aside>
      )}
    </div>
  );
}
