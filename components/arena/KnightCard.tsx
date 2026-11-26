"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Lock } from "lucide-react";
import { CARD } from "@/components/ui";
import { useAccount } from "@/components/AccountProvider";
import {
  EMBLEMS,
  HELMS,
  PLUMES,
  PROGRESS_EVENT,
  TITLES,
  dailyChallenges,
  levelOf,
  loadProgress,
  storeProgress,
  today,
  validLook,
  type ArenaLook,
  type ArenaProgress,
  type LookItem,
} from "@/lib/arenaProgress";
import { pushProgress, syncProgress } from "@/lib/arenaProgressSync";
import { EMBLEM_PATHS } from "@/lib/arenaLooks";

const TEAM_RED = "#dc2646";

/**
 * Arena medieval's «Tu caballero» card (lobby): level, experience and title,
 * the day's three challenges, and «Personalizar» to dress the knight with
 * what the level unlocks (locked items show the level they need). Progress
 * lives in this browser and, signed in, on the account too.
 */
export default function KnightCard() {
  const [p, setP] = useState<ArenaProgress | null>(null);
  const [open, setOpen] = useState(false);
  const { user } = useAccount();
  const uid = user?.uid;
  useEffect(() => {
    const read = () => setP(loadProgress());
    read();
    window.addEventListener(PROGRESS_EVENT, read);
    return () => window.removeEventListener(PROGRESS_EVENT, read);
  }, []);
  useEffect(() => {
    if (uid) syncProgress(uid).then(setP).catch(console.error);
  }, [uid]);

  if (!p) return <div className={`${CARD} h-40 animate-pulse`} aria-hidden />;
  const { level, into, need } = levelOf(p.xp);
  const look = validLook(p.look, level);
  const title = TITLES.find((t) => t.id === look.title)?.label ?? "";
  const challenges = dailyChallenges(today());
  const pick = (part: keyof ArenaLook, id: string) => {
    const next = { ...p, look: { ...look, [part]: id } };
    storeProgress(next);
    setP(next);
    if (uid) pushProgress(uid, next);
  };

  return (
    <div className={`${CARD} flex flex-col gap-3`}>
      <div className="flex items-center gap-3">
        <KnightPreview look={look} className="h-24 w-20 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tu caballero</p>
          <p className="font-display text-xl text-slate-100">
            Nivel {level} <span className="text-base text-talo-hero">· {title}</span>
          </p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-talo-hero" style={{ width: `${(into / need) * 100}%` }} />
          </div>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            {into}/{need} XP para el nivel {level + 1}
            {p.matches > 0 && ` · ${p.matches} batallas · ${p.wins} ganadas`}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold text-slate-300">Desafíos de hoy</p>
        {challenges.map((c) => {
          const have = Math.min(c.goal, p.challenges[c.id] ?? 0);
          const done = p.done.includes(c.id);
          return (
            <div key={c.id} className="flex items-center gap-2 rounded-lg bg-slate-900/70 px-2.5 py-1.5 text-sm">
              {done ? <Check className="h-4 w-4 shrink-0 text-lime-300" /> : <span className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-600" />}
              <span className={`min-w-0 flex-1 truncate ${done ? "text-slate-400 line-through" : "text-slate-100"}`}>{c.text}</span>
              <span className="w-14 shrink-0">
                <span className="block h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <span className={`block h-full rounded-full ${done ? "bg-lime-400" : "bg-talo-hero"}`} style={{ width: `${(have / c.goal) * 100}%` }} />
                </span>
              </span>
              <span className="w-20 shrink-0 whitespace-nowrap text-right font-mono text-[11px] text-slate-400">
                {have}/{c.goal} · +{c.xp}
              </span>
            </div>
          );
        })}
        <p className="text-[11px] text-slate-500">Cambian cada día. Ganas experiencia en cada batalla: más si ganas, derribas, paras y bloqueas.</p>
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
      >
        Personalizar <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-3">
          <Choices label="Penacho" items={PLUMES} value={look.plume} level={level} onPick={(id) => pick("plume", id)} swatch />
          <Choices label="Emblema del escudo" items={EMBLEMS} value={look.emblem} level={level} onPick={(id) => pick("emblem", id)} emblem />
          <Choices label="Casco" items={HELMS} value={look.helm} level={level} onPick={(id) => pick("helm", id)} />
          <Choices label="Título" items={TITLES} value={look.title} level={level} onPick={(id) => pick("title", id)} />
          <p className="text-[11px] text-slate-500">Solo cambia cómo te ven: nada da ventaja en la pelea.</p>
        </div>
      )}
    </div>
  );
}

function Choices({
  label,
  items,
  value,
  level,
  onPick,
  swatch,
  emblem,
}: {
  label: string;
  items: LookItem[];
  value: string;
  level: number;
  onPick: (id: string) => void;
  swatch?: boolean;
  emblem?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-slate-300">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => {
          const locked = level < it.level;
          const on = it.id === value;
          return (
            <button
              key={it.id}
              disabled={locked}
              onClick={() => onPick(it.id)}
              title={locked ? `Se desbloquea en el nivel ${it.level}` : it.label}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ${
                on ? "bg-talo-hero text-talo-ink ring-talo-hero" : locked ? "bg-slate-900/60 text-slate-500 ring-slate-800" : "bg-slate-900 text-slate-100 ring-slate-700 hover:ring-slate-500"
              }`}
            >
              {swatch && <span className="h-3 w-3 rounded-full ring-1 ring-black/40" style={{ background: it.color || TEAM_RED }} />}
              {emblem && EMBLEM_PATHS[it.id] && (
                <svg viewBox="0 0 100 100" className="h-3.5 w-3.5" aria-hidden>
                  <path d={EMBLEM_PATHS[it.id]} fill="currentColor" fillRule="evenodd" />
                </svg>
              )}
              {it.label}
              {locked && (
                <span className="flex items-center gap-0.5 text-[10px]">
                  <Lock className="h-3 w-3" /> Nv {it.level}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A flat drawing of the knight with its look (the team's color is red here). */
export function KnightPreview({ look, className }: { look: ArenaLook; className?: string }) {
  const plume = PLUMES.find((p) => p.id === look.plume)?.color || TEAM_RED;
  const steel = "#b8c2cc";
  const dark = "#5b6470";
  const gold = "#d4a72c";
  const emblem = EMBLEM_PATHS[look.emblem];
  return (
    <svg viewBox="0 0 120 140" className={className} aria-hidden>
      {/* Legs and body. */}
      <rect x="46" y="104" width="11" height="28" rx="4" fill={dark} />
      <rect x="63" y="104" width="11" height="28" rx="4" fill={dark} />
      <rect x="38" y="62" width="44" height="48" rx="9" fill={TEAM_RED} />
      <rect x="40" y="58" width="40" height="14" rx="6" fill={steel} />
      {emblem && (
        <g transform="translate(51 76) scale(0.18)">
          <path d={emblem} fill="#fde68a" stroke="#1f1408" strokeWidth="8" fillRule="evenodd" />
        </g>
      )}
      <rect x="84" y="64" width="10" height="34" rx="5" fill={steel} />
      {/* Sword. */}
      <rect x="87" y="44" width="4" height="50" rx="1" fill="#e5e7eb" />
      <rect x="81" y="90" width="16" height="4" rx="2" fill={gold} />
      {/* Shield with the emblem. */}
      <rect x="26" y="64" width="10" height="30" rx="5" fill={steel} />
      <circle cx="30" cy="92" r="19" fill={TEAM_RED} stroke={dark} strokeWidth="4" />
      {emblem ? (
        <g transform="translate(18 80) scale(0.24)">
          <path d={emblem} fill="#fde68a" stroke="#1f1408" strokeWidth="7" fillRule="evenodd" />
        </g>
      ) : (
        <>
          <rect x="28" y="75" width="4" height="34" fill={gold} />
          <rect x="13" y="90" width="34" height="4" fill={gold} />
        </>
      )}
      {/* Helmet extras behind it. */}
      {look.helm === "alado" && (
        <>
          <path d="M45 40 Q26 31 21 12 Q30 22 36 21 Q32 28 45 32Z" fill="#e5e7eb" stroke={dark} strokeWidth="1.5" />
          <path d="M75 40 Q94 31 99 12 Q90 22 84 21 Q88 28 75 32Z" fill="#e5e7eb" stroke={dark} strokeWidth="1.5" />
        </>
      )}
      {look.helm === "cuernos" && (
        <>
          <path d="M47 34 Q30 31 27 12 Q36 26 48 27Z" fill="#e9dfc6" stroke={dark} strokeWidth="1.5" />
          <path d="M73 34 Q90 31 93 12 Q84 26 72 27Z" fill="#e9dfc6" stroke={dark} strokeWidth="1.5" />
        </>
      )}
      {look.helm === "cresta" ? (
        <path d="M44 28 Q45 4 62 3 Q82 5 84 32 L75 23 L50 25Z" fill={plume} stroke="#111" strokeWidth="1.5" />
      ) : (
        <path d="M60 24 Q62 5 79 7 Q94 10 95 30 Q87 18 77 20 Q68 22 64 27Z" fill={plume} stroke="#111" strokeWidth="1.5" />
      )}
      {/* The helm. */}
      <rect x="44" y="20" width="32" height="40" rx="14" fill={steel} />
      <rect x="44" y="45" width="32" height="3" fill={gold} />
      <rect x="48" y="37" width="24" height="4" rx="2" fill="#0b0b0f" />
      <rect x="58.5" y="41" width="3" height="16" fill={gold} />
      {look.helm === "corona" && <path d="M44 28 L46 14 L53 22 L60 9 L67 22 L74 14 L76 28Z" fill={gold} stroke="#7a5a10" strokeWidth="1.5" />}
    </svg>
  );
}
