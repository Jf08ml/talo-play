"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  botHost,
  closeRound,
  isBot,
  nextRound,
  playerInfo,
  reportFinish,
  roundKey,
  roundLevel,
  sendPose,
  subscribePoses,
  type GravedadState,
  type Pose,
} from "@/lib/gravedadRoom";
import { distanceField, newRunner, progressOf, type Runner } from "@/lib/gravedadSim";
import { BotRunner } from "@/lib/gravedadBot";
import type { Ghost } from "@/lib/gravedadDraw";
import { serverNow } from "@/lib/serverTime";
import type { PresenceMap } from "@/lib/presence";
import { useServerNow } from "@/hooks/useServerNow";
import { useCountdownTicks } from "@/hooks/useSound";
import Field from "./Field";

const POSE_MS = 100;

/** One round of the race: my level with everyone's ghosts, the standings, and between rounds the results. */
export default function RaceGame({
  roomId,
  state,
  myId,
  myColor,
  presence,
  presenceLoaded,
}: {
  roomId: string;
  state: GravedadState;
  myId: string;
  myColor: string;
  presence: PresenceMap;
  presenceLoaded: boolean;
}) {
  const g = state.gameNo;
  const round = state.round;
  const rk = roundKey(state);
  const level = useMemo(() => roundLevel(state), [state]);
  const field = useMemo(() => distanceField(level), [level]);
  const poses = useRef<Record<string, Pose>>({});
  // What the standings show: the poses, copied a couple of times a second.
  const [seen, setSeen] = useState<Record<string, Pose>>({});
  const stateRef = useRef(state);
  const presenceRef = useRef({ presence, presenceLoaded });
  const playing = state.roster.includes(myId);
  const mine = state.results[myId];
  const live = state.status === "playing" && state.phase === "playing";
  const now = useServerNow(true, 250);
  const countdown = live && now && now < state.startedAt ? Math.ceil((state.startedAt - now) / 1000) : 0;
  useCountdownTicks(countdown || null, 3);

  useEffect(() => {
    stateRef.current = state;
    presenceRef.current = { presence, presenceLoaded };
  }, [state, presence, presenceLoaded]);

  useEffect(
    () =>
      subscribePoses(roomId, rk, (p) => {
        poses.current = p;
      }),
    [roomId, rk]
  );
  useEffect(() => {
    const id = setInterval(() => setSeen(poses.current), 500);
    return () => clearInterval(id);
  }, []);

  // Close the round when it's decided; the bot host runs the bots.
  useEffect(() => {
    if (!live) return;
    const bots = new Map<string, BotRunner>();
    const reported = new Set<string>();
    let lastPose = 0;
    const id = setInterval(() => {
      const s = stateRef.current;
      const { presence: pres, presenceLoaded: loaded } = presenceRef.current;
      if (!loaded) return;
      const t = (serverNow() - s.startedAt) / 1000;
      if (t < 0) return;
      const gone = s.roster.filter((p) => !isBot(p) && !(p in pres));
      if (Math.random() < 0.1) closeRound(roomId, g, round, gone).catch(console.error);
      if (botHost(Object.keys(pres)) !== myId) {
        bots.clear();
        return;
      }
      const sendNow = performance.now() - lastPose > POSE_MS;
      if (sendNow) lastPose = performance.now();
      for (const bot of s.roster.filter(isBot)) {
        if (s.results[bot]) continue;
        let b = bots.get(bot);
        if (!b) {
          // Another host ran it before: carry on from where it was seen.
          const seen = poses.current[bot];
          let from: Runner | undefined;
          if (seen && t > 2) {
            from = newRunner(level, t);
            from.x = seen.x;
            from.y = seen.y;
            from.g = seen.g;
          }
          b = new BotRunner(level, s.botSkill[bot] ?? 0.5, s.seed + bot.charCodeAt(bot.length - 1) * 977 + round * 131, from);
          bots.set(bot, b);
        }
        b.advanceTo(t);
        if (b.r.finished) {
          if (!reported.has(bot)) reportFinish(roomId, g, round, bot, b.r.deaths).catch(console.error);
          reported.add(bot);
          continue;
        }
        if (sendNow) sendPose(roomId, rk, bot, { x: b.r.x, y: b.r.y, g: b.r.g, face: b.r.face, dead: b.r.dead > 0 });
      }
    }, 50);
    return () => clearInterval(id);
  }, [live, roomId, g, round, rk, myId, level]);

  // Between rounds: the next one starts by itself.
  const between = state.phase === "roundEnd";
  const moreRounds = between && state.status === "playing";
  const nextAt = state.nextAt;
  useEffect(() => {
    if (!moreRounds) return;
    const t = setTimeout(() => nextRound(roomId, g, round).catch(console.error), Math.max(0, nextAt - serverNow()) + Math.random() * 300);
    return () => clearTimeout(t);
  }, [moreRounds, nextAt, roomId, g, round]);

  const lastSent = useRef(0);
  const ghosts = (): Ghost[] =>
    Object.entries(poses.current)
      .filter(([id]) => id !== myId && stateRef.current.roster.includes(id) && !stateRef.current.results[id])
      .map(([id, p]) => {
        const info = playerInfo(stateRef.current, id);
        return { id, ...p, color: info.color, name: info.name };
      });

  const progress = (id: string) => {
    if (state.results[id]) return 1;
    const p = seen[id];
    return p ? progressOf(level, field, p.x, p.y) : 0;
  };
  const ranking = [...state.roster].sort((a, b) => {
    const ra = state.results[a];
    const rb = state.results[b];
    if (ra && rb) return ra.ms - rb.ms;
    if (ra) return -1;
    if (rb) return 1;
    return progress(b) - progress(a);
  });
  const place = mine ? Object.values(state.results).filter((r) => r.ms < mine.ms).length + 1 : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="relative flex min-h-[60dvh] flex-1 flex-col">
        <Field
          key={rk}
          level={level}
          color={myColor}
          clock={() => (serverNow() - stateRef.current.startedAt) / 1000}
          ghosts={ghosts}
          frozen={!playing || !!mine || !live}
          onFrame={(r) => {
            if (!playing || mine || !live) return;
            const t = performance.now();
            if (t - lastSent.current < POSE_MS) return;
            lastSent.current = t;
            sendPose(roomId, rk, myId, { x: r.x, y: r.y, g: r.g, face: r.face, dead: r.dead > 0 });
          }}
          onFinish={(_, deaths) => {
            if (playing && live) reportFinish(roomId, g, round, myId, deaths).catch(console.error);
          }}
          className="flex-1"
        />
        <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs font-bold text-white">
          {state.online ? level.name : `Ronda ${round + 1} de ${state.rounds} · ${level.name}`}
        </p>
        {countdown > 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
            <span key={countdown} className="animate-celebration-in font-display text-9xl text-white">
              {countdown}
            </span>
          </div>
        )}
        {mine && !between && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
            <span className="animate-celebration-in rounded-full bg-[#00B26B] px-5 py-2.5 font-bold text-white">
              ¡Llegaste {place}º en {(mine.ms / 1000).toFixed(1)} s!
            </span>
          </div>
        )}
        {!playing && live && (
          <p className="pointer-events-none absolute inset-x-0 bottom-24 text-center text-sm text-white/70">Estás mirando: entras en la próxima carrera.</p>
        )}
        {between && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-[24px] bg-[#1c1c1c] p-5 text-white">
              <p className="mb-3 font-display text-xl">{state.status === "finished" && !state.online ? "¡Terminó la carrera!" : "Así llegaron"}</p>
              <ol className="flex flex-col gap-2">
                {ranking.map((id, i) => {
                  const info = playerInfo(state, id);
                  const r = state.results[id];
                  return (
                    <li key={id} className="flex items-center gap-2 text-sm">
                      <span className="w-5 text-right font-mono text-white/50">{r ? i + 1 : "–"}</span>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: info.color }} />
                      <span className="flex-1 truncate font-bold">{id === myId ? "Tú" : info.name}</span>
                      <span className="font-mono text-xs text-white/70">{r ? `${(r.ms / 1000).toFixed(1)} s` : "no llegó"}</span>
                      <span className="w-8 text-right font-mono text-talo-hero">+{state.gained[id] ?? 0}</span>
                    </li>
                  );
                })}
              </ol>
              {moreRounds && <p className="mt-3 text-center text-xs text-white/60">La próxima ronda arranca en {Math.max(0, Math.ceil((nextAt - now) / 1000))} s</p>}
            </div>
          </div>
        )}
      </div>

      <aside className="flex gap-2 overflow-x-auto bg-black/40 p-2 lg:w-64 lg:flex-col lg:overflow-visible lg:p-3">
        {ranking.map((id) => {
          const info = playerInfo(state, id);
          const r = state.results[id];
          const away = !isBot(id) && presenceLoaded && !(id in presence);
          return (
            <div key={id} className={`flex min-w-[130px] flex-col gap-1 rounded-xl bg-white/[0.06] px-3 py-2 ${away ? "opacity-40" : ""}`}>
              <div className="flex items-center gap-1.5 text-sm text-white">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: info.color }} />
                <span className="min-w-0 flex-1 truncate font-bold">{id === myId ? "Tú" : info.name}</span>
                {r && <Check className="h-4 w-4 text-[#5fe0a0]" />}
                {!state.online && <span className="font-mono text-xs text-white/60">{state.scores[id] ?? 0}</span>}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-talo-hero transition-[width]" style={{ width: `${progress(id) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </aside>
    </div>
  );
}
