"use client";

import { Clock, Gem, Hand, Siren, Vault } from "lucide-react";
import { TEAMS, type TeamId } from "@/lib/teams";
import { BAG_MAX } from "@/lib/golpeSim";

export interface HudData {
  secondsLeft: number;
  countdown: number | null;
  bag: number;
  bank: number;
  /** 0–1. */
  alert: number;
  /** Seconds in handcuffs (null = free). */
  cuffed: number | null;
  lost: number;
  canSteal: boolean;
  stealReady: boolean;
  ranking: { id: string; name: string; color: string; bank: number; me: boolean }[];
  teams: Record<TeamId, number> | null;
  myTeam: TeamId | null;
  /** Watching (not a thief this match). */
  watching: boolean;
}

export interface FeedItem {
  key: number;
  text: string;
  tone: "good" | "bad" | null;
}

const PANEL = "rounded-2xl bg-black/65 ring-1 ring-white/10";
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Everything over the canvas: clock, bag, score, alarms and the "Robar" button. */
export default function Hud({
  hud,
  feed,
  touch,
  onSteal,
}: {
  hud: HudData | null;
  feed: FeedItem[];
  touch: boolean;
  onSteal: () => void;
}) {
  if (!hud) return null;
  const lastSeconds = hud.secondsLeft <= 20;
  return (
    <>
      {hud.alert > 0.05 && hud.cuffed === null && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: `inset 0 0 ${40 + hud.alert * 80}px rgba(255,40,70,${0.25 + hud.alert * 0.45})` }}
        />
      )}

      {/* Top: clock in the middle, ranking on the right. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-3">
        <div className="w-[88px] sm:w-[120px]" />
        <div className={`${PANEL} flex items-center gap-1.5 px-3 py-1.5 font-mono text-lg font-bold ${lastSeconds ? "text-red-300" : "text-white"}`}>
          <Clock className="h-4 w-4" /> {clock(hud.secondsLeft)}
        </div>
        <div className={`${PANEL} min-w-[120px] px-3 py-2 text-xs sm:text-sm`}>
          {hud.teams ? (
            <div className="flex flex-col gap-1">
              {TEAMS.map((t) => (
                <p key={t.id} className="flex items-center justify-between gap-3 font-bold" style={{ color: t.color }}>
                  <span>
                    {t.label.replace("Equipo ", "")}
                    {hud.myTeam === t.id && <span className="font-normal text-white/60"> · vos</span>}
                  </span>
                  <span className="font-mono">{hud.teams![t.id]}</span>
                </p>
              ))}
            </div>
          ) : (
            <ol className="flex flex-col gap-0.5">
              {hud.ranking.slice(0, 5).map((r, i) => (
                <li key={r.id} className={`flex items-center gap-1.5 ${r.me ? "font-bold text-white" : "text-white/80"}`}>
                  <span className="w-3 text-right text-white/45">{i + 1}</span>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="max-w-[90px] flex-1 truncate">{r.me ? "Vos" : r.name}</span>
                  <span className="font-mono">{r.bank}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {hud.countdown !== null && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30 text-center">
          <span className="font-display text-7xl text-talo-hero">{hud.countdown}</span>
          <p className={`${PANEL} max-w-xs px-4 py-2 text-sm text-white/90`}>
            Agarrá diamantes sin que te vean y llevalos a {hud.myTeam ? "una salida de tu color" : "una salida"}. Solo cuenta lo que dejás ahí.
          </p>
          <p className="text-xs text-white/70">
            {touch ? "Arrastrá el dedo para moverte · «Robar» le saca diamantes al que tengas al lado" : "WASD o flechas para moverte · espacio o E para robar"}
          </p>
        </div>
      )}

      {hud.cuffed !== null && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center px-4">
          <div className="flex flex-col items-center gap-1 rounded-2xl bg-red-600/90 px-5 py-3 text-center text-white">
            <p className="flex items-center gap-2 font-display text-2xl">
              <Siren className="h-6 w-6" /> ¡Te atraparon!
            </p>
            <p className="text-sm">
              {hud.lost > 0 ? `Se te cayeron ${hud.lost} ${hud.lost === 1 ? "diamante" : "diamantes"}. ` : ""}Volvés a la salida en {hud.cuffed}…
            </p>
          </div>
        </div>
      )}

      {lastSeconds && hud.bag > 0 && hud.cuffed === null && hud.countdown === null && (
        <div className="pointer-events-none absolute inset-x-0 top-14 flex justify-center px-4 sm:top-16">
          <p className="animate-pulse rounded-full bg-talo-hero px-4 py-1.5 text-center text-sm font-bold text-talo-ink">
            ¡Volvé a la salida! Lo que quede en la mochila no cuenta
          </p>
        </div>
      )}

      {/* Feed: robberies, alarms, getaways. */}
      <div className="pointer-events-none absolute left-2 top-[132px] flex max-w-[60%] flex-col gap-1 sm:left-3 sm:top-[170px]">
        {feed.map((f) => (
          <p
            key={f.key}
            className={`w-fit rounded-lg bg-black/65 px-2 py-1 text-xs sm:text-sm ${f.tone === "good" ? "text-lime-300" : f.tone === "bad" ? "text-red-300" : "text-white/85"}`}
          >
            {f.text}
          </p>
        ))}
      </div>

      {/* Bottom: the bag and what's safe, and "Robar". */}
      {!hud.watching && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className={`${PANEL} flex flex-col gap-1 px-3 py-2 text-sm text-white`}>
            <p className="flex items-center gap-2">
              <Gem className="h-4 w-4 text-cyan-300" />
              <span className="text-white/70">Mochila</span>
              <span className={`font-mono font-bold ${hud.bag >= BAG_MAX ? "text-talo-hero" : ""}`}>
                {hud.bag}/{BAG_MAX}
              </span>
            </p>
            <p className="flex items-center gap-2">
              <Vault className="h-4 w-4 text-talo-hero" />
              <span className="text-white/70">A salvo</span>
              <span className="font-mono font-bold">{hud.bank}</span>
            </p>
          </div>
          {(touch || hud.canSteal) && (
            <button
              data-control
              onPointerDown={(e) => {
                e.preventDefault();
                onSteal();
              }}
              className={`pointer-events-auto flex h-20 w-20 flex-col items-center justify-center gap-0.5 rounded-full text-sm font-bold transition ${
                hud.canSteal && hud.stealReady
                  ? "scale-105 bg-talo-hero text-talo-ink"
                  : "bg-white/15 text-white/70 ring-1 ring-white/25"
              }`}
            >
              <Hand className="h-6 w-6" />
              Robar
              {!touch && <span className="text-[10px] font-medium opacity-70">espacio</span>}
            </button>
          )}
        </div>
      )}
    </>
  );
}
