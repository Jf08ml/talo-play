"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Lock } from "lucide-react";
import { CARD } from "@/components/ui";
import { useAccount } from "@/components/AccountProvider";
import KnightPreview3D from "./KnightPreview3D";
import type { TeamId } from "@/lib/teams";
import {
  ARMORS,
  CAPES,
  EMBLEMS,
  HELMS,
  PLUMES,
  PROGRESS_EVENT,
  TITLES,
  TRAILS,
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
  const [previewTeam, setPreviewTeam] = useState<TeamId>("red");
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
  const previewLook = {
    plume: PLUMES.find((item) => item.id === look.plume)?.color ?? "",
    emblem: look.emblem,
    helm: look.helm,
    armor: ARMORS.find((item) => item.id === look.armor)?.color ?? ARMORS[0].color ?? "#b8c2cc",
    cape: look.cape === "equipo" ? "equipo" : CAPES.find((item) => item.id === look.cape)?.color ?? "",
    trail: TRAILS.find((item) => item.id === look.trail)?.color ?? "",
  };
  const challenges = dailyChallenges(today());
  const pick = (part: keyof ArenaLook, id: string) => {
    const next = { ...p, look: { ...look, [part]: id } };
    storeProgress(next);
    setP(next);
    if (uid) pushProgress(uid, next);
  };

  return (
    <div className={`${CARD} flex flex-col gap-3`}>
      <div className="grid grid-cols-[minmax(96px,0.72fr)_minmax(0,1.28fr)] gap-2 sm:grid-cols-[minmax(164px,0.8fr)_minmax(0,1.2fr)] sm:gap-4">
        <div className="flex flex-col gap-1.5">
          <KnightPreview3D look={previewLook} team={previewTeam} className="h-44 w-full sm:h-56" />
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-900 p-1" aria-label="Color del equipo en la vista previa">
            {(["red", "blue"] as TeamId[]).map((team) => (
              <button key={team} type="button" aria-pressed={previewTeam === team} onClick={() => setPreviewTeam(team)} className={`rounded-md py-1 text-[11px] font-bold ${previewTeam === team ? "bg-white text-talo-ink" : "text-slate-400 hover:text-white"}`}>
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: team === "red" ? "#dc2646" : "#1d9bd1" }} />
                {team === "red" ? "Rojo" : "Azul"}
              </button>
            ))}
          </div>
        </div>
        <div className="min-w-0 self-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tu caballero</p>
          <p className="font-display text-lg text-slate-100 sm:text-xl">
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
            <div key={c.id} className="flex items-center gap-1.5 rounded-lg bg-slate-900/70 px-2 py-1.5 text-xs sm:gap-2 sm:px-2.5 sm:text-sm">
              {done ? <Check className="h-4 w-4 shrink-0 text-lime-300" /> : <span className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-600" />}
              <span className={`min-w-0 flex-1 truncate ${done ? "text-slate-400 line-through" : "text-slate-100"}`}>{c.text}</span>
              <span className="w-11 shrink-0 sm:w-14">
                <span className="block h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <span className={`block h-full rounded-full ${done ? "bg-lime-400" : "bg-talo-hero"}`} style={{ width: `${(have / c.goal) * 100}%` }} />
                </span>
              </span>
              <span className="w-[4.25rem] shrink-0 whitespace-nowrap text-right font-mono text-[10px] text-slate-400 sm:w-20 sm:text-[11px]">
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
          <Choices label="Armadura" items={ARMORS} value={look.armor} level={level} onPick={(id) => pick("armor", id)} swatch />
          <Choices label="Capa" items={CAPES} value={look.cape} level={level} onPick={(id) => pick("cape", id)} swatch />
          <Choices label="Estela al correr" items={TRAILS} value={look.trail} level={level} onPick={(id) => pick("trail", id)} swatch />
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
