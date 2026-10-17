"use client";

import { useRef, type PointerEvent } from "react";
import { BANDS } from "@/lib/onda";

const W = 320;
const H = 180;
const CX = W / 2;
const CY = 165;
const R = 145;

/** Point on the dial for a value 0–100 (0 = left end, 100 = right end). */
function at(value: number, radius = R): [number, number] {
  const a = Math.PI * (1 - value / 100);
  return [CX + radius * Math.cos(a), CY - radius * Math.sin(a)];
}

function wedge(from: number, to: number): string {
  const a = Math.max(0, from);
  const b = Math.min(100, to);
  const [x1, y1] = at(a);
  const [x2, y2] = at(b);
  return `M${CX},${CY} L${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2} Z`;
}

const BAND_COLORS = ["#f97316", "#facc15", "#22d3ee"];

/**
 * Half-circle dial. Shows the target's scoring bands when `target` is set,
 * the needles in `needles` and, when `onChange` is given, a draggable needle
 * at `value`.
 */
export default function Dial({
  left,
  right,
  target,
  value,
  onChange,
  needles = [],
}: {
  left: string;
  right: string;
  target?: number;
  value?: number;
  onChange?: (v: number) => void;
  needles?: { value: number; color: string; label: string }[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

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

  return (
    <div className="w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full touch-none select-none ${onChange ? "cursor-pointer" : ""}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <defs>
          <linearGradient id="onda-face" x1="0" x2="1">
            <stop offset="0%" stopColor="#1e3a8a" />
            <stop offset="100%" stopColor="#7c2d12" />
          </linearGradient>
        </defs>
        <path d={wedge(0, 100)} fill="url(#onda-face)" stroke="#334155" strokeWidth="2" />
        {target !== undefined &&
          [...BANDS].reverse().map((b, i) => (
            <path
              key={b.points}
              d={wedge(target - b.within, target + b.within)}
              fill={BAND_COLORS[BANDS.length - 1 - i]}
              opacity={0.85}
            />
          ))}
        {target !== undefined &&
          (() => {
            const [x, y] = at(target, R - 14);
            return (
              <text x={x} y={y + 4} textAnchor="middle" fontSize="12" fontWeight="800" fill="#0f172a">
                {BANDS[0].points}
              </text>
            );
          })()}
        {needles.map((n) => {
          const [x, y] = at(n.value, R - 6);
          return (
            <g key={n.label}>
              <line x1={CX} y1={CY} x2={x} y2={y} stroke={n.color} strokeWidth="3" strokeLinecap="round" opacity="0.9" />
              <circle cx={x} cy={y} r="7" fill={n.color} stroke="#0f172a" strokeWidth="2" />
              <text x={x} y={y + 3.5} textAnchor="middle" fontSize="8" fontWeight="800" fill="#fff">
                {n.label.slice(0, 1).toUpperCase()}
              </text>
            </g>
          );
        })}
        {value !== undefined &&
          (() => {
            const [x, y] = at(value, R + 2);
            return (
              <g>
                <line x1={CX} y1={CY} x2={x} y2={y} stroke="#f8fafc" strokeWidth="5" strokeLinecap="round" />
                <circle cx={x} cy={y} r="9" fill="#f8fafc" />
              </g>
            );
          })()}
        <circle cx={CX} cy={CY} r="12" fill="#0f172a" stroke="#94a3b8" strokeWidth="2" />
      </svg>
      <div className="mt-1 flex justify-between gap-4 text-sm font-semibold">
        <span className="text-sky-300">← {left}</span>
        <span className="text-right text-orange-300">{right} →</span>
      </div>
    </div>
  );
}
