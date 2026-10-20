"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronRight, Eye, EyeOff, RotateCcw } from "lucide-react";
import {
  DECORATIONS,
  FIELD_LABEL,
  FILLINGS,
  FROSTINGS,
  SHAPES,
  SPONGES,
  levelOptions,
  missingStep,
  type BuildAction,
  type Cake,
  type Decoration,
  type Field,
  type Flavor,
  type Frosting,
  type Level,
  type Order,
  type OrderTicket,
  type Shape,
} from "@/lib/bakery";
import type { BakeryAudio } from "@/lib/bakeryAudio";
import CakeArt, { DecorationIcon } from "./CakeArt";
import CustomerFace from "./CustomerFace";

/**
 * Building a cake, shared by the solo game and the duel: the order card,
 * the step tabs with their options, "Empezar de nuevo" and "Entregar".
 */

const STEPS: Field[] = ["shape", "sponge", "layers", "filling", "frosting", "decorations"];

/** The value of a field in a cake or order, in words. */
export function valueText(field: Field, c: Cake | Order): string {
  switch (field) {
    case "shape":
      return c.shape ? SHAPES[c.shape].label : "sin elegir";
    case "sponge":
      return c.sponge ? SPONGES[c.sponge].label : "sin elegir";
    case "layers":
      return `${c.layers} ${c.layers === 1 ? "piso" : "pisos"}`;
    case "filling":
      return c.filling ? FILLINGS[c.filling].label : "sin relleno";
    case "frosting":
      return c.frosting ? FROSTINGS[c.frosting].label : "sin cobertura";
    case "decorations":
      return c.decorations.length ? c.decorations.map((d) => DECORATIONS[d].label).join(" y ") : "sin decoración";
  }
}

function isDone(f: Field, c: Cake): boolean {
  switch (f) {
    case "shape":
      return !!c.shape;
    case "sponge":
      return !!c.sponge;
    case "layers":
      return true;
    case "filling":
      return c.layers < 2 || !!c.filling;
    case "frosting":
      return !!c.frosting;
    case "decorations":
      return c.decorations.length > 0;
  }
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return reduced;
}

const firstStep = (level: Level): Field => (level.shapes.length === 1 ? "sponge" : "shape");

/** The step tab being edited; each new order (`orderKey`) starts at the first one still to choose. */
export function useBuilderStep(level: Level, orderKey: string): [Field, (f: Field) => void] {
  const [step, setStep] = useState<Field>(firstStep(level));
  const [stepFor, setStepFor] = useState(orderKey);
  if (stepFor !== orderKey) {
    setStepFor(orderKey);
    setStep(firstStep(level));
  }
  return [step, setStep];
}

export function CakeBuilder({
  level,
  cake,
  enabled,
  step,
  onStep,
  audio,
  reducedMotion,
  newSince,
  onBuild,
  onReset,
  onDeliver,
}: {
  level: Level;
  cake: Cake;
  /** Picking and delivering are allowed (not paused, not showing a result). */
  enabled: boolean;
  step: Field;
  onStep: (f: Field) => void;
  audio: { readonly current: BakeryAudio | null };
  reducedMotion: boolean;
  /** The previous level's options, to tag the new ones. */
  newSince: ReturnType<typeof levelOptions> | null;
  onBuild: (a: BuildAction) => void;
  onReset: () => void;
  onDeliver: () => void;
}) {
  const opts = levelOptions(level);
  const stepAvailable = (f: Field) => {
    if (f === "layers") return opts.layers.length > 1;
    if (f === "filling") return opts.fillings.length > 0;
    return true;
  };
  const steps = STEPS.filter(stepAvailable);
  const stepEnabled = (f: Field) => f !== "filling" || cake.layers > 1;
  const missing = missingStep(cake);

  function optionValues(field: Field): (string | number)[] {
    switch (field) {
      case "shape":
        return opts.shapes;
      case "sponge":
        return opts.sponges;
      case "layers":
        return opts.layers;
      case "filling":
        return opts.fillings;
      case "frosting":
        return opts.frostings;
      case "decorations":
        return opts.decorations;
    }
  }

  /** After choosing, move on to the next step that still needs something. */
  const advance = (from: Field, next: Cake) => {
    const i = steps.indexOf(from);
    const to = steps.slice(i + 1).find((f) => f !== "filling" || next.layers > 1);
    if (to) onStep(to);
  };

  const choose = (field: Field, value: string | number) => {
    if (!enabled) return;
    audio.current?.pick(steps.indexOf(field));
    if (field === "decorations") {
      onBuild({ type: "decoration", value: value as Decoration });
      return;
    }
    let next: Cake;
    if (field === "layers") {
      onBuild({ type: "layers", value: value as number });
      next = { ...cake, layers: value as number, filling: (value as number) > 1 ? cake.filling : null };
    } else {
      onBuild({ type: "set", field, value: value as string });
      next = { ...cake, [field]: value };
    }
    if (!reducedMotion) advance(field, next);
  };

  const deliver = () => {
    if (enabled && !missing) onDeliver();
  };

  // Keep the chosen step's tab in view (it scrolls sideways on phones).
  useEffect(() => {
    document.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [step]);

  // Keyboard: 1–6 picks in the current step, ←/→ change step, Enter delivers.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const i = steps.indexOf(step);
        const j = (i + (e.key === "ArrowRight" ? 1 : -1) + steps.length) % steps.length;
        onStep(steps[j]);
        e.preventDefault();
      } else if (e.key === "Enter") {
        // Without this, the same Enter would also press the result card's focused button.
        e.preventDefault();
        deliver();
      } else if (/^[1-6]$/.test(e.key)) {
        const v = optionValues(step)[Number(e.key) - 1];
        if (v !== undefined && stepEnabled(step)) choose(step, v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      <div className="rounded-3xl bg-white/85 p-2.5 shadow-sm ring-1 ring-pink-100 short:p-2">
        <div role="tablist" aria-label="Pasos de la torta" className="flex gap-1 overflow-x-auto pb-1 short:pb-0.5">
          {steps.map((f, i) => {
            const done = isDone(f, cake);
            return (
              <button
                key={f}
                role="tab"
                aria-selected={step === f}
                disabled={!enabled}
                onClick={() => {
                  audio.current?.click();
                  onStep(f);
                }}
                className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition short:px-2.5 short:py-1 ${
                  step === f ? "bg-pink-500 text-white shadow" : stepEnabled(f) ? "bg-pink-50 text-pink-700 hover:bg-pink-100" : "bg-slate-100 text-slate-400"
                }`}
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${step === f ? "bg-white/30" : "bg-white"}`}>
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {FIELD_LABEL[f]}
              </button>
            );
          })}
        </div>
        <StepOptions
          field={step}
          values={optionValues(step)}
          cake={cake}
          enabled={enabled && stepEnabled(step)}
          decorationCount={level.decorationCount}
          newSince={newSince}
          onPick={(v) => choose(step, v)}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            audio.current?.click();
            onReset();
            onStep(firstStep(level));
          }}
          disabled={!enabled}
          className="flex items-center justify-center gap-1.5 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-violet-700 shadow-sm ring-1 ring-violet-200 transition hover:bg-violet-50 disabled:opacity-40 short:px-3 short:py-2"
          aria-label="Empezar de nuevo"
        >
          <RotateCcw className="h-4 w-4" />
          {/* Just the icon on a phone on its side, where the column is narrow. */}
          <span className="landscape:hidden">Empezar de nuevo</span>
        </button>
        <button
          onClick={deliver}
          disabled={!enabled || !!missing}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-violet-500 py-3 text-base font-bold text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none short:py-2"
        >
          Entregar la torta <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </>
  );
}

function Swatch({ color }: { color: string }) {
  return <span className="h-7 w-7 shrink-0 rounded-full shadow-inner ring-2 ring-white short:h-5 short:w-5" style={{ background: color }} aria-hidden="true" />;
}

function StepOptions({
  field,
  values,
  cake,
  enabled,
  decorationCount,
  newSince,
  onPick,
}: {
  field: Field;
  values: (string | number)[];
  cake: Cake;
  enabled: boolean;
  decorationCount: number;
  newSince: ReturnType<typeof levelOptions> | null;
  onPick: (v: string | number) => void;
}) {
  const isNew = (v: string | number) => {
    if (!newSince) return false;
    const before: Record<Field, (string | number)[]> = {
      shape: newSince.shapes,
      sponge: newSince.sponges,
      layers: newSince.layers,
      filling: newSince.fillings,
      frosting: newSince.frostings,
      decorations: newSince.decorations,
    };
    return !before[field].includes(v);
  };
  const selected = (v: string | number) =>
    field === "decorations" ? cake.decorations.includes(v as Decoration) : (cake as unknown as Record<string, unknown>)[field] === v;

  const hint: ReactNode =
    field === "filling" && cake.layers < 2
      ? "El relleno va entre los pisos: elegí 2 pisos o más."
      : field === "decorations"
        ? decorationCount > 1
          ? `Elegí ${decorationCount} decoraciones (tocá de nuevo para sacar una).`
          : "Elegí una decoración (tocá otra para cambiarla)."
        : null;

  const content = (v: string | number): { label: string; visual: ReactNode } => {
    switch (field) {
      case "shape":
        return {
          label: SHAPES[v as Shape].label,
          visual: <span className={`h-7 w-9 bg-pink-300 ring-2 ring-white short:h-5 short:w-7 ${v === "redonda" ? "rounded-full" : "rounded-md"}`} aria-hidden="true" />,
        };
      case "sponge":
        return { label: SPONGES[v as Flavor].label, visual: <Swatch color={SPONGES[v as Flavor].color} /> };
      case "layers":
        return {
          label: `${v} ${v === 1 ? "piso" : "pisos"}`,
          visual: (
            <span className="flex flex-col-reverse gap-0.5" aria-hidden="true">
              {Array.from({ length: v as number }, (_, i) => (
                <span key={i} className="h-2 w-8 rounded-sm bg-amber-300" />
              ))}
            </span>
          ),
        };
      case "filling":
        return { label: FILLINGS[v as Flavor].label, visual: <Swatch color={FILLINGS[v as Flavor].color} /> };
      case "frosting":
        return { label: FROSTINGS[v as Frosting].label, visual: <Swatch color={FROSTINGS[v as Frosting].color} /> };
      case "decorations":
        return { label: DECORATIONS[v as Decoration].label, visual: <DecorationIcon d={v as Decoration} className="h-8 w-8 short:h-6 short:w-6" /> };
    }
  };

  return (
    <div role="tabpanel" aria-label={FIELD_LABEL[field]}>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-3">
        {values.map((v, i) => {
          const { label, visual } = content(v);
          const on = selected(v);
          return (
            <button
              key={String(v)}
              onClick={() => onPick(v)}
              disabled={!enabled}
              aria-pressed={on}
              className={`relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-center text-xs font-semibold transition short:min-h-[3.25rem] short:gap-0.5 short:py-1 motion-safe:active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
                on ? "bg-pink-100 text-pink-700 ring-[3px] ring-pink-400" : "bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-pink-50"
              }`}
            >
              {visual}
              <span className="leading-tight">{label}</span>
              {on && (
                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-pink-500 text-white" aria-hidden="true">
                  <Check className="h-3 w-3" />
                </span>
              )}
              {isNew(v) && !on && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-amber-300 px-1.5 text-[9px] font-bold text-amber-900">¡Nuevo!</span>
              )}
              <span className="sr-only">Tecla {i + 1}</span>
            </button>
          );
        })}
      </div>
      {hint && <p className="mt-1.5 text-center text-xs text-slate-500 short:mt-1 short:text-[11px] short:leading-tight">{hint}</p>}
    </div>
  );
}

/**
 * Who orders and what. Levels without `picture` show only the list; with
 * `memorize` the order hides after a while (`hidden`), and `onPeek` shows it
 * again for a moment at a cost.
 */
export function OrderCard({
  ticket,
  mood,
  compact = false,
  picture = true,
  hidden = false,
  hideIn = null,
  peekCost = 0,
  onPeek,
}: {
  ticket: OrderTicket;
  mood: "normal" | "happy" | "sad";
  compact?: boolean;
  picture?: boolean;
  hidden?: boolean;
  /** Seconds until it hides (shown as a warning), or null. */
  hideIn?: number | null;
  peekCost?: number;
  onPeek?: () => void;
}) {
  const { order, customer, occasion } = ticket;
  const rows: Field[] = ["shape", "sponge", "layers", ...(order.filling ? (["filling"] as Field[]) : []), "frosting", "decorations"];
  const swatch = (f: Field): string | null =>
    f === "sponge" ? SPONGES[order.sponge].color : f === "filling" && order.filling ? FILLINGS[order.filling].color : f === "frosting" ? FROSTINGS[order.frosting].color : null;

  return (
    <section
      className={`flex gap-2 rounded-3xl bg-white/90 p-2.5 shadow-sm ring-1 ring-pink-100 ${compact ? "lg:hidden landscape:rounded-2xl landscape:p-1.5" : ""}`}
      aria-label={`Pedido de ${customer.name}`}
    >
      <div className="flex shrink-0 flex-col items-center">
        <CustomerFace customer={customer} mood={mood} className={compact ? "h-12 w-12 landscape:h-8 landscape:w-8" : "h-16 w-16"} />
        <span className="text-[11px] font-bold text-slate-600">{customer.name}</span>
      </div>
      {hidden ? (
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1.5 text-center">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
            <EyeOff className="h-4 w-4" /> ¿Te acordás de lo que pidió?
          </p>
          {onPeek && (
            <button
              onClick={onPeek}
              className="flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700 ring-1 ring-violet-200 transition hover:bg-violet-200"
            >
              <Eye className="h-3.5 w-3.5" /> Volver a mirar{peekCost > 0 && ` (−${peekCost} pts)`}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            {!compact && <p className="mb-1 text-xs italic text-slate-500">«Quiero una torta {occasion}».</p>}
            {hideIn !== null && (
              <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-amber-700">
                <Eye className="h-3.5 w-3.5" /> ¡Memorizalo! Se esconde en {Math.max(1, Math.ceil(hideIn))} s
              </p>
            )}
            {/* On a phone on its side the chips wrap at their own width, so the card stays short and the cake big. */}
            <ul className={compact ? "grid grid-cols-2 gap-1 landscape:flex landscape:flex-wrap landscape:gap-0.5" : "flex flex-wrap gap-1"}>
              {rows.map((f) => (
                <li
                  key={f}
                  className={`flex min-w-0 items-center gap-1 bg-pink-50 px-2 py-0.5 text-slate-700 ${compact ? "rounded-lg text-[10px] landscape:px-1.5 landscape:py-0" : "rounded-full text-[11px]"}`}
                >
                  {swatch(f) && <span className="h-3 w-3 rounded-full ring-1 ring-white" style={{ background: swatch(f)! }} aria-hidden="true" />}
                  <span className="leading-tight">
                    <span className="font-semibold text-pink-700">{FIELD_LABEL[f]}:</span> {valueText(f, order)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {picture && <CakeArt cake={order} className={`shrink-0 ${compact ? "h-14 w-16 self-center landscape:h-10 landscape:w-12" : "h-24 w-28"}`} label="Así tiene que quedar la torta" />}
        </>
      )}
    </section>
  );
}
