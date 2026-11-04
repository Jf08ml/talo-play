"use client";

import { useEffect, useRef } from "react";
import { COLS, ROWS, decodeBalls, HW } from "@/lib/ladrillazoSim";
import { drawField } from "@/lib/ladrillazoDraw";
import type { RemoteBoard } from "@/lib/ladrillazo";

/** A rival's board, small, redrawn when its data changes. */
export default function MiniBoard({
  board,
  fallbackCells,
  color,
  width = 64,
  danger = false,
}: {
  board: RemoteBoard | undefined;
  fallbackCells: string;
  color: string;
  width?: number;
  danger?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = Math.round((width * ROWS) / COLS);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawField(
      ctx,
      {
        cells: board?.c ?? fallbackCells,
        paddles: [{ x: board?.p ?? COLS / 2, hw: board?.w ?? HW, side: 1, color }],
        balls: decodeBalls(board?.b),
        danger,
      },
      width,
      height,
      0,
      [],
      false
    );
  }, [board, fallbackCells, color, width, height, danger]);
  return <canvas ref={ref} style={{ width, height }} className="block rounded-md ring-1 ring-white/10" />;
}
