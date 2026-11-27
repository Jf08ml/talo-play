"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Lock } from "lucide-react";
import { CARD } from "@/components/ui";
import { useAccount } from "@/components/AccountProvider";
import { CARS } from "@/lib/carreras";
import {
  BODIES,
  BOOSTS,
  CAR_PROGRESS_EVENT,
  MAX_NUMBER,
  NEONS,
  PAINTS,
  RIMS,
  STRIPES,
  TITLES,
  carPaint,
  dailyMissions,
  levelOf,
  loadCarProgress,
  storeCarProgress,
  today,
  validCarLook,
  type CarLookIds,
  type CarrerasProgress,
  type LookItem,
} from "@/lib/carrerasProgress";
import { pushCarProgress, syncCarProgress } from "@/lib/carrerasProgressSync";
import CarPreview3D from "./CarPreview3D";

/**
 * Carreras' «Tu auto» card (lobby): level, experience and title, the day's
 * three missions, and «Personalizar» with what the level unlocks (locked
 * items show the level they need). Only looks: every car drives the same.
 */
export default function CarCard() {
  const [p, setP] = useState<CarrerasProgress | null>(null);
  const [open, setOpen] = useState(false);
  const { user } = useAccount();
  const uid = user?.uid;
  useEffect(() => {
    const read = () => setP(loadCarProgress());
    read();
    window.addEventListener(CAR_PROGRESS_EVENT, read);
    return () => window.removeEventListener(CAR_PROGRESS_EVENT, read);
  }, []);
  useEffect(() => {
    if (uid) syncCarProgress(uid).then(setP).catch(console.error);
  }, [uid]);

  if (!p) return <div className={`${CARD} h-40 animate-pulse`} aria-hidden />;
  const { level, into, need } = levelOf(p.xp);
  const look = validCarLook(p.look, level);
  const title = TITLES.find((t) => t.id === look.title)?.label ?? "";
  // Shown as the red car (the first seat); in a race "Color del auto" takes your seat's.
  const paint = carPaint(look, CARS.a.color, CARS.a.accent, 1);
  const missions = dailyMissions(today());
  const pick = (part: keyof CarLookIds, value: string | number) => {
    const next = { ...p, look: { ...look, [part]: value } };
    storeCarProgress(next);
    setP(next);
    if (uid) pushCarProgress(uid, next);
  };

  return (
    <div className={`${CARD} flex flex-col gap-3`}>
      <div className="grid grid-cols-[minmax(110px,0.85fr)_minmax(0,1.15fr)] gap-3 sm:gap-4">
        <CarPreview3D
          look={{ body: paint.body, color: paint.color, accent: paint.accent, number: paint.number, metal: paint.metal || undefined, rims: paint.rims, rimGlow: paint.rimGlow || undefined, neon: paint.neon || undefined }}
          className="h-36 w-full sm:h-44"
        />
        <div className="min-w-0 self-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tu auto</p>
          <p className="font-display text-lg text-slate-100 sm:text-xl">
            Nivel {level} <span className="text-base text-talo-hero">· {title}</span>
          </p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-talo-hero" style={{ width: `${(into / need) * 100}%` }} />
          </div>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            {into}/{need} XP para el nivel {level + 1}
            {p.races > 0 && ` · ${p.races} carreras · ${p.wins} ganadas`}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold text-slate-300">Misiones de hoy</p>
        {missions.map((m) => {
          const have = Math.min(m.goal, Math.floor(p.missions[m.id] ?? 0));
          const done = p.done.includes(m.id);
          return (
            <div key={m.id} className="flex items-center gap-1.5 rounded-lg bg-slate-900/70 px-2 py-1.5 text-xs sm:gap-2 sm:px-2.5 sm:text-sm">
              {done ? <Check className="h-4 w-4 shrink-0 text-lime-300" /> : <span className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-600" />}
              <span className={`min-w-0 flex-1 truncate ${done ? "text-slate-400 line-through" : "text-slate-100"}`}>{m.text}</span>
              <span className="w-11 shrink-0 sm:w-14">
                <span className="block h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <span className={`block h-full rounded-full ${done ? "bg-lime-400" : "bg-talo-hero"}`} style={{ width: `${(have / m.goal) * 100}%` }} />
                </span>
              </span>
              <span className="w-[4.25rem] shrink-0 whitespace-nowrap text-right font-mono text-[10px] text-slate-400 sm:w-20 sm:text-[11px]">
                {have}/{m.goal} · +{m.xp}
              </span>
            </div>
          );
        })}
        <p className="text-[11px] text-slate-500">Cambian cada día. Ganas experiencia en cada carrera: más si subes al podio, adelantas, saltas y no chocas.</p>
      </div>

      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
      >
        Personalizar <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-3">
          <Choices label="Carrocería" items={BODIES} value={look.body} level={level} onPick={(id) => pick("body", id)} plain />
          <Choices label="Pintura" items={PAINTS} value={look.paint} level={level} onPick={(id) => pick("paint", id)} fallback={CARS.a.color} />
          <Choices label="Franjas" items={STRIPES} value={look.stripes} level={level} onPick={(id) => pick("stripes", id)} fallback="#f8fafc" />
          <Choices label="Llantas" items={RIMS} value={look.rims} level={level} onPick={(id) => pick("rims", id)} />
          <Choices label="Llama del turbo" items={BOOSTS} value={look.boost} level={level} onPick={(id) => pick("boost", id)} />
          <Choices label="Neón" items={NEONS} value={look.neon} level={level} onPick={(id) => pick("neon", id)} />
          <Choices label="Título" items={TITLES} value={look.title} level={level} onPick={(id) => pick("title", id)} plain />
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-300">Número</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_NUMBER}
                value={look.number || ""}
                placeholder="El del auto"
                onChange={(e) => pick("number", Math.max(0, Math.min(MAX_NUMBER, Math.floor(Number(e.target.value) || 0))))}
                className="w-32 rounded-lg bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 ring-1 ring-slate-700 placeholder:text-slate-500"
              />
              <span className="text-[11px] text-slate-500">De 1 a {MAX_NUMBER}; vacío usa el número de tu auto.</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">Solo cambia cómo te ven: todos los autos manejan igual. Tu nombre y el minimapa siguen con el color de tu auto.</p>
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
  fallback,
  plain,
}: {
  label: string;
  items: LookItem[];
  value: string;
  level: number;
  onPick: (id: string) => void;
  /** The swatch for an item without its own color (the seat's). */
  fallback?: string;
  plain?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-slate-300">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => {
          const locked = level < it.level;
          const on = it.id === value;
          const swatch = it.color || fallback;
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
              {!plain && swatch && <span className="h-3 w-3 rounded-full ring-1 ring-black/40" style={{ background: swatch }} />}
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
