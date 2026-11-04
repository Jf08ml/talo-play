"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Check, X } from "lucide-react";
import {
  botHost,
  botPlan,
  closeRound,
  isBot,
  nextRound,
  playerInfo,
  roundKey,
  roundPuzzle,
  sendProgress,
  submitResult,
  subscribeProgress,
  type PuentesState,
} from "@/lib/puentesRoom";
import { canBeImpossible, totalCrossings } from "@/lib/puentes";
import { serverNow } from "@/lib/serverTime";
import { playSound } from "@/lib/sfx";
import type { PresenceMap } from "@/lib/presence";
import { useServerNow } from "@/hooks/useServerNow";
import { useCountdownTicks } from "@/hooks/useSound";
import { formatTime } from "@/components/ladrillazo/Hud";
import { CARD } from "@/components/ui";
import PlayArea from "./PlayArea";
import Reveal from "./Reveal";

/** One round of the race: my map, the others' progress, and between rounds the solution. */
export default function RaceGame({
  roomId,
  state,
  myId,
  presence,
  presenceLoaded,
}: {
  roomId: string;
  state: PuentesState;
  myId: string;
  presence: PresenceMap;
  presenceLoaded: boolean;
}) {
  const g = state.gameNo;
  const round = state.round;
  const rk = roundKey(state);
  const pz = useMemo(() => roundPuzzle(state), [state]);
  const total = totalCrossings(pz);
  const [prog, setProg] = useState<Record<string, number>>({});
  const stateRef = useRef(state);
  const presenceRef = useRef({ presence, presenceLoaded });
  const playing = state.roster.includes(myId);
  const mine = state.results[myId];
  const now = useServerNow(true, 250);
  const countdown = now && now < state.startedAt ? Math.ceil((state.startedAt - now) / 1000) : 0;
  useCountdownTicks(state.phase === "playing" ? countdown || null : null, 3);

  useEffect(() => {
    stateRef.current = state;
    presenceRef.current = { presence, presenceLoaded };
  }, [state, presence, presenceLoaded]);
  useEffect(() => subscribeProgress(roomId, rk, setProg), [roomId, rk]);

  // Close the round when it's decided; bots answer on their schedule (bot host).
  const live = state.status === "playing" && state.phase === "playing";
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      const s = stateRef.current;
      const { presence: pres, presenceLoaded: loaded } = presenceRef.current;
      if (!loaded) return;
      const t = serverNow();
      if (t < s.startedAt) return;
      const gone = s.roster.filter((p) => !isBot(p) && !(p in pres));
      closeRound(roomId, g, round, gone).catch(console.error);
      if (botHost(Object.keys(pres)) !== myId) return;
      const p = roundPuzzle(s);
      const tot = totalCrossings(p);
      for (const bot of s.roster.filter(isBot)) {
        if (s.results[bot]) continue;
        const plan = botPlan(s, bot, p);
        const elapsed = t - s.startedAt;
        if (elapsed >= plan.ms && plan.answers) submitResult(roomId, g, round, bot, { ok: plan.ok, claim: plan.claim }).catch(console.error);
        else if (!p.impossible) {
          // Its bar fills up as it "plays"; one that won't make it stalls a bit short.
          const share = plan.answers ? 0.95 : 0.75;
          sendProgress(roomId, roundKey(s), bot, Math.floor(tot * Math.min(share, (elapsed * 0.95) / plan.ms)));
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [live, roomId, g, round, myId]);

  // Between rounds: the next one starts by itself.
  const between = state.phase === "roundEnd";
  const moreRounds = between && state.status === "playing";
  const nextAt = state.nextAt;
  useEffect(() => {
    if (!moreRounds) return;
    const t = setTimeout(() => nextRound(roomId, g, round).catch(console.error), Math.max(0, nextAt - serverNow()) + Math.random() * 300);
    return () => clearTimeout(t);
  }, [moreRounds, nextAt, roomId, g, round]);

  // My result's sound, once.
  const myOk = mine?.ok;
  useEffect(() => {
    if (myOk === undefined) return;
    playSound(myOk ? "good" : "bad");
  }, [myOk]);

  const ranking = [...state.roster].sort((a, b) => {
    const ra = state.results[a];
    const rb = state.results[b];
    if (ra?.ok && rb?.ok) return ra.ms - rb.ms;
    if (ra?.ok) return -1;
    if (rb?.ok) return 1;
    return (prog[b] ?? 0) - (prog[a] ?? 0);
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 p-3 lg:max-w-4xl lg:flex-row lg:items-start">
      <div className="flex w-full flex-col gap-3 lg:max-w-md">
        <div className="flex items-center justify-between text-white">
          <p className="text-sm font-bold">
            {state.online ? "Ronda en línea" : `Ronda ${round + 1} de ${state.rounds}`}
            <span className="ml-2 text-white/60">nivel {state.levels[round]}</span>
          </p>
          {live && now > state.startedAt && <span className="font-mono">{formatTime((now - state.startedAt) / 1000)}</span>}
        </div>

        {between ? (
          <>
            <Reveal pz={pz} />
            {moreRounds && (
              <p className="text-center text-xs text-white/60">La próxima ronda arranca en {Math.max(0, Math.ceil((nextAt - now) / 1000))} s</p>
            )}
          </>
        ) : playing ? (
          <div className="relative">
            <PlayArea
              key={rk}
              pz={pz}
              disabled={!!mine || countdown > 0}
              canClaim={state.tricks && canBeImpossible(state.levels[round] ?? 0)}
              onSolved={() => submitResult(roomId, g, round, myId, { ok: true, claim: false }).catch(console.error)}
              onClaim={() => submitResult(roomId, g, round, myId, { ok: pz.impossible, claim: true }).catch(console.error)}
              onProgress={(n) => sendProgress(roomId, rk, myId, n)}
            />
            {countdown > 0 && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/70">
                <span key={countdown} className="animate-celebration-in font-display text-8xl text-white">
                  {countdown}
                </span>
              </div>
            )}
            {mine && (
              <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
                <span className={`animate-celebration-in rounded-full px-4 py-2 text-sm font-bold text-white ${mine.ok ? "bg-[#00B26B]" : "bg-[#FF3B30]"}`}>
                  {mine.ok ? (mine.claim ? "¡Bien! No se podía" : `¡Listo en ${formatTime(mine.ms / 1000)}!`) : "Era posible: esta ronda no sumás"}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-xl bg-white/[0.05] p-4 text-center text-sm text-white/60">Estás mirando: entrás en la próxima partida.</p>
        )}
      </div>

      <aside className={`${CARD} !p-4 flex w-full flex-col gap-2`}>
        <h2 className="text-xs font-bold uppercase tracking-wide text-white/50">{between ? "Esta ronda" : "Cómo van"}</h2>
        <ol className="flex flex-col gap-2">
          {ranking.map((id) => {
            const info = playerInfo(state, id);
            const r = state.results[id];
            const away = !isBot(id) && presenceLoaded && !(id in presence);
            const crossed = r?.ok && !r.claim ? total : Math.min(total, prog[id] ?? 0);
            return (
              <li key={id} className={`flex flex-col gap-1 ${away ? "opacity-40" : ""}`}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: info.color }} />
                  <span className="min-w-0 flex-1 truncate font-bold text-white">{id === myId ? "Vos" : info.name}</span>
                  {r ? (
                    r.ok ? (
                      <span className="inline-flex items-center gap-1 text-xs text-[#5fe0a0]">
                        {r.claim ? <Ban className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />} {formatTime(r.ms / 1000)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-[#ff8a80]">
                        <X className="h-3.5 w-3.5" /> {r.claim ? "dijo que no se podía" : "no llegó"}
                      </span>
                    )
                  ) : null}
                  {between && <span className="w-10 text-right font-mono text-sm text-talo-hero">+{state.gained[id] ?? 0}</span>}
                  {!state.online && <span className="w-8 text-right font-mono text-sm text-white/70">{state.scores[id] ?? 0}</span>}
                </div>
                {!between && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-talo-hero transition-[width]" style={{ width: `${(crossed / total) * 100}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {!state.online && <p className="text-[11px] text-white/40">Primero 3 puntos, segundo 2, el resto que lo logra 1.</p>}
      </aside>
    </div>
  );
}
