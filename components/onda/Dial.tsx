"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { BANDS } from "@/lib/onda";

const W = 320;
const H = 182;
const CX = W / 2;
const CY = 165;
const R = 145;

/** Point on the dial for a value 0–100 (0 = left end, 100 = right end). */
function at(value: number, radius = R): [number, number] {
  const a = Math.PI * (1 - value / 100);
  return [CX + radius * Math.cos(a), CY - radius * Math.sin(a)];
}

function wedge(from: number, to: number, radius = R): string {
  const a = Math.max(0, from);
  const b = Math.min(100, to);
  const [x1, y1] = at(a, radius);
  const [x2, y2] = at(b, radius);
  return `M${CX},${CY} L${x1},${y1} A${radius},${radius} 0 0 1 ${x2},${y2} Z`;
}

/** Center (4) yellow, then orange (3) and pink (2). */
const BAND_COLORS = ["#FFD400", "#FF7A1A", "#FF5FA2"];
const FACE = "#2a2a2a";
const INK = "#111111";

export interface DialNeedle {
  id: string;
  value: number;
  color: string;
  label: string;
}

/**
 * Half-circle dial. `target` shows the scoring bands; with `reveal` they start
 * under a cover that swings open (and the needles drop in after it). `value`
 * is the white needle (draggable with `onChange`, also with the arrow keys and
 * the −/+ buttons); `needles` are the players', drawn as little talos; `bet`
 * shades the side the rival team bet on.
 */
export default function Dial({
  left,
  right,
  target,
  reveal = false,
  value,
  onChange,
  onConfirm,
  needles = [],
  bet,
  coverColor = "#FF5FA2",
}: {
  left: string;
  right: string;
  target?: number;
  reveal?: boolean;
  value?: number;
  onChange?: (v: number) => void;
  /** Enter key. */
  onConfirm?: () => void;
  needles?: DialNeedle[];
  bet?: { side: "izq" | "der"; color: string } | null;
  coverColor?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const valueRef = useRef(value ?? 50);
  const [open, setOpen] = useState(!reveal);

  useEffect(() => {
    valueRef.current = value ?? 50;
  }, [value]);

  // The cover swings open a moment after the reveal shows up.
  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => setOpen(true), 350);
    return () => clearTimeout(t);
  }, [reveal]);

  // Arrow keys move the needle (Shift: 5 at a time), Enter confirms.
  useEffect(() => {
    if (!onChange) return;
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, [contenteditable]")) return;
      const step = e.shiftKey ? 5 : 1;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.max(0, valueRef.current - step));
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.min(100, valueRef.current + step));
      else if (e.key === "Enter" && onConfirm && !el.closest("button")) onConfirm();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onChange, onConfirm]);

  const valueFrom = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W - CX;
    const y = CY - ((e.clientY - rect.top) / rect.height) * H;
    const a = Math.atan2(Math.max(0, y), x);
    return Math.round(Math.max(0, Math.min(100, (1 - a / Math.PI) * 100)));
  };

  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!onChange) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(valueFrom(e));
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (dragging.current && onChange) onChange(valueFrom(e));
  };
  const onUp = () => {
    dragging.current = false;
  };

  const showBands = target !== undefined;
  const needlesIn = !reveal || open;

  return (
    <div className="w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full touch-none select-none overflow-visible ${onChange ? "cursor-pointer" : ""}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role={onChange ? "slider" : "img"}
        aria-label={`${left} a ${right}`}
        aria-valuemin={onChange ? 0 : undefined}
        aria-valuemax={onChange ? 100 : undefined}
        aria-valuenow={onChange ? value : undefined}
      >
        <defs>
          <clipPath id="onda-half">
            <path d={wedge(0, 100, R + 1)} />
          </clipPath>
        </defs>
        <path d={wedge(0, 100, R + 8)} fill={INK} />
        <path d={wedge(0, 100)} fill={FACE} />
        {/* Ticks every 10. */}
        {Array.from({ length: 11 }, (_, i) => {
          const [x1, y1] = at(i * 10, R - 2);
          const [x2, y2] = at(i * 10, R - (i % 5 === 0 ? 14 : 8));
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffffff" strokeOpacity={0.25} strokeWidth={2} />;
        })}
        {bet && value !== undefined && (
          <path d={bet.side === "izq" ? wedge(0, value) : wedge(value, 100)} fill={bet.color} opacity={0.22} />
        )}
        {showBands && (
          <g>
            {[...BANDS].reverse().map((b, i) => (
              <path key={b.points} d={wedge(target - b.within, target + b.within)} fill={BAND_COLORS[BANDS.length - 1 - i]} />
            ))}
            {BANDS.map((b, i) => {
              const off = i === 0 ? 0 : (BANDS[i - 1].within + b.within) / 2;
              return [-1, 1].map((sgn) => {
                if (i === 0 && sgn === 1) return null;
                const v = target + sgn * off;
                if (v < 1 || v > 99) return null;
                const [x, y] = at(v, R - 18);
                return (
                  <text key={`${i}${sgn}`} x={x} y={y + 4} textAnchor="middle" fontSize="12" fontWeight="800" fill={INK}>
                    {b.points}
                  </text>
                );
              });
            })}
          </g>
        )}
        {/* The cover: swings away clockwise on a reveal. */}
        {reveal && (
          <g clipPath="url(#onda-half)">
            <path
              d={wedge(0, 100)}
              fill={coverColor}
              style={{
                transformBox: "view-box",
                transformOrigin: `${CX}px ${CY}px`,
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 1s cubic-bezier(.6,.05,.3,1)",
              }}
            />
          </g>
        )}
        {needles.map((n, i) => {
          const [x, y] = at(n.value, R - 8);
          return (
            <g
              key={n.id}
              style={{
                opacity: needlesIn ? 1 : 0,
                transition: `opacity .3s ease ${reveal ? 0.9 + i * 0.18 : 0}s`,
              }}
            >
              <line x1={CX} y1={CY} x2={x} y2={y} stroke={n.color} strokeWidth="3" strokeLinecap="round" />
              <rect x={x - 9} y={y - 9} width={18} height={18} rx={6} fill={n.color} stroke={INK} strokeWidth={2} />
              <circle cx={x - 3.2} cy={y - 1.5} r={2.6} fill="#fff" />
              <circle cx={x + 3.2} cy={y - 1.5} r={2.6} fill="#fff" />
              <circle cx={x - 3.2} cy={y - 1.5} r={1.2} fill={INK} />
              <circle cx={x + 3.2} cy={y - 1.5} r={1.2} fill={INK} />
              <title>{n.label}</title>
            </g>
          );
        })}
        {value !== undefined &&
          (() => {
            const [x, y] = at(value, R + 4);
            return (
              <g>
                <line x1={CX} y1={CY} x2={x} y2={y} stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
                <circle cx={x} cy={y} r="10" fill="#ffffff" stroke={INK} strokeWidth={2} />
              </g>
            );
          })()}
        <circle cx={CX} cy={CY} r="13" fill={INK} stroke="#ffffff" strokeOpacity={0.6} strokeWidth="2" />
      </svg>
      <div className="mt-2 flex items-start justify-between gap-4 text-[15px] font-bold leading-tight text-white">
        <span className="max-w-[45%] text-left">← {left}</span>
        <span className="max-w-[45%] text-right">{right} →</span>
      </div>
      {onChange && value !== undefined && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onChange(Math.max(0, value - 1))}
            aria-label="Un poco a la izquierda"
            className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15"
          >
            <Minus className="h-5 w-5" />
          </button>
          <span className="hidden text-xs text-white/50 sm:inline">o las flechas del teclado</span>
          <button
            type="button"
            onClick={() => onChange(Math.min(100, value + 1))}
            aria-label="Un poco a la derecha"
            className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
