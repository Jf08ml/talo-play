"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import { CANVAS_H, CANVAS_W, type Stroke } from "@/lib/dibujo";

export const BACKGROUND = "#ffffff";
/** How often a stroke in progress is sent to the others while drawing. */
const LIVE_SEND_MS = 80;

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const p = stroke.points;
  if (p.length < 2) return;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  if (p.length === 2) {
    // A single tap: a dot.
    ctx.beginPath();
    ctx.arc(p[0], p[1], stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.stroke();
}

/**
 * Shared drawing board. Renders every stroke in logical CANVAS_W × CANVAS_H
 * coordinates scaled to the element's width; when `canDraw`, pointer input
 * becomes a new stroke, reported live (throttled) and on release.
 */
export default function DrawingCanvas({
  strokes,
  canDraw,
  color,
  width,
  onStrokeStart,
  onStrokeChange,
}: {
  strokes: Map<string, Stroke>;
  canDraw: boolean;
  color: string;
  width: number;
  /** Returns the id for the new stroke. */
  onStrokeStart: () => string;
  /** Called while drawing (throttled) and once more with the final points. */
  onStrokeChange: (id: string, stroke: Stroke) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const current = useRef<{ id: string; stroke: Stroke; lastSent: number } | null>(null);

  const redraw = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [id, stroke] of strokes) {
      // My stroke in progress is drawn from local points (fresher than the echo).
      if (current.current?.id !== id) drawStroke(ctx, stroke);
    }
    if (current.current) drawStroke(ctx, current.current.stroke);
  };

  useEffect(redraw);

  const toLogical = (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_H;
    return [Math.round(Math.max(0, Math.min(CANVAS_W, x))), Math.round(Math.max(0, Math.min(CANVAS_H, y)))];
  };

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || current.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const id = onStrokeStart();
    current.current = { id, stroke: { color, width, points: toLogical(e) }, lastSent: Date.now() };
    onStrokeChange(id, current.current.stroke);
    redraw();
  };

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const c = current.current;
    if (!c) return;
    const [x, y] = toLogical(e);
    const p = c.stroke.points;
    // Skip points that barely moved: keeps strokes small on the wire.
    if (Math.abs(p[p.length - 2] - x) + Math.abs(p[p.length - 1] - y) < 3) return;
    c.stroke = { ...c.stroke, points: [...p, x, y] };
    if (Date.now() - c.lastSent >= LIVE_SEND_MS) {
      c.lastSent = Date.now();
      onStrokeChange(c.id, c.stroke);
    }
    redraw();
  };

  const onUp = () => {
    const c = current.current;
    if (!c) return;
    current.current = null;
    onStrokeChange(c.id, c.stroke);
  };

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className={`block aspect-[4/3] w-full touch-none rounded-xl bg-white shadow-[0_0_30px_rgba(139,92,246,0.15)] ${
        canDraw ? "cursor-crosshair" : "cursor-default"
      }`}
    />
  );
}
