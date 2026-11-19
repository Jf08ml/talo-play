import { BALL_R, CUP_R, MILL_T, millAngle, type Hole } from "./minigolfSim";

/**
 * Minigolf seen from above, flat (Talo's look: no gradients or glows). The
 * still parts (green, stripes, sand, water, walls, banks) are drawn once per
 * hole and size into an offscreen canvas; every frame adds the moving ones
 * (slope arrows, mills, bumpers, flag, balls, the aim).
 */

const OUT = "#0E4429";
const GREEN = "#00B26B";
const STRIPE = "#00A562";
const SLOPE = "#00BD74";
const WALL = "#FFFFFF";
const SHADE = "rgba(0,0,0,0.22)";
const SAND = "#F3D38B";
const SAND_DOT = "#DDB560";
const WATER = "#2D5BFF";
const PINK = "#FF5FA2";
const ORANGE = "#FF7A1A";
const INK = "#111111";
const YELLOW = "#FFD400";

/** Margin around the hole, in units. */
const PAD = 0.6;

export interface DrawBall {
  id: string;
  x: number;
  y: number;
  color: string;
  /** Mine: drawn on top, full strength. */
  me?: boolean;
  /** In the cup: not drawn. */
  sunk?: boolean;
}

export interface DrawAim {
  x: number;
  y: number;
  angle: number;
  power: number;
}

export interface DrawView {
  hole: Hole;
  /** The hole's clock (s): turns the mills. */
  t: number;
  balls: DrawBall[];
  aim: DrawAim | null;
  /** Bumpers recently hit (index → time hit), they wobble. */
  bumped?: Map<number, number>;
}

export interface Fit {
  scale: number;
  w: number;
  h: number;
  /** Turned a quarter clockwise (a wide hole on a tall screen, or the other way). */
  rot: boolean;
  /** The hole's height in units (for the turned transform). */
  holeH: number;
}

/** The biggest size that fits (w, h) keeping the hole's shape, turned if that's bigger. */
export function fitHole(hole: Hole, w: number, h: number): Fit {
  const hw = hole.w + PAD * 2;
  const hh = hole.h + PAD * 2;
  const straight = Math.min(w / hw, h / hh);
  const turned = Math.min(w / hh, h / hw);
  const rot = turned > straight * 1.15;
  const scale = Math.max(1, rot ? turned : straight);
  return { scale, w: Math.floor(scale * (rot ? hh : hw)), h: Math.floor(scale * (rot ? hw : hh)), rot, holeH: hole.h };
}

/** The canvas transform from hole units to device pixels. */
function place(ctx: CanvasRenderingContext2D, fit: Fit, dpr: number) {
  const s = fit.scale * dpr;
  if (fit.rot) ctx.setTransform(0, s, -s, 0, (fit.holeH + PAD) * s, PAD * s);
  else ctx.setTransform(s, 0, 0, s, PAD * s, PAD * s);
}

/** A drag on screen (dx, dy) as a direction on the hole. */
export function screenToHoleVec(fit: Fit, dx: number, dy: number): { x: number; y: number } {
  return fit.rot ? { x: dy, y: -dx } : { x: dx, y: dy };
}

function path(ctx: CanvasRenderingContext2D, poly: number[]) {
  ctx.beginPath();
  ctx.moveTo(poly[0], poly[1]);
  for (let i = 2; i < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1]);
  ctx.closePath();
}

let cache: { key: string; canvas: HTMLCanvasElement } | null = null;

function drawStill(hole: Hole, fit: Fit, dpr: number): HTMLCanvasElement {
  const key = `${hole.seed}:${hole.cup.x}:${fit.w}x${fit.h}@${dpr}${fit.rot ? "r" : ""}`;
  if (cache?.key === key) return cache.canvas;
  const canvas = cache?.canvas ?? document.createElement("canvas");
  canvas.width = Math.round(fit.w * dpr);
  canvas.height = Math.round(fit.h * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  place(ctx, fit, dpr);

  ctx.fillStyle = OUT;
  ctx.fillRect(-PAD, -PAD, hole.w + PAD * 2, hole.h + PAD * 2);

  // The green: raster rows merged into runs, then mowing stripes clipped to it.
  ctx.save();
  ctx.beginPath();
  const { cols, rows, res, floor } = hole;
  for (let r = 0; r < rows; r++) {
    let start = -1;
    for (let c = 0; c <= cols; c++) {
      const on = c < cols && floor[r * cols + c] === 1;
      if (on && start < 0) start = c;
      if (!on && start >= 0) {
        ctx.rect(start * res, r * res, (c - start) * res + 0.01, res + 0.01);
        start = -1;
      }
    }
  }
  ctx.fillStyle = GREEN;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = STRIPE;
  for (let y = 0; y < hole.h; y += 2.5) ctx.fillRect(0, y, hole.w, 1.25);

  for (const z of hole.zones) {
    path(ctx, z.poly);
    if (z.kind === "slope") {
      ctx.fillStyle = SLOPE;
      ctx.fill();
    } else if (z.kind === "sand") {
      ctx.fillStyle = SAND;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = SAND_DOT;
      for (let y = z.box[1]; y < z.box[3]; y += 0.45)
        for (let x = z.box[0] + ((y * 7) % 0.45); x < z.box[2]; x += 0.45) {
          ctx.beginPath();
          ctx.arc(x, y, 0.05, 0, Math.PI * 2);
          ctx.fill();
        }
      ctx.restore();
    } else {
      ctx.fillStyle = WATER;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 0.08;
      ctx.lineCap = "round";
      for (let y = z.box[1] + 0.35; y < z.box[3]; y += 0.6) {
        ctx.beginPath();
        for (let x = z.box[0]; x < z.box[2]; x += 0.6) {
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 0.15, y - 0.15, x + 0.3, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  ctx.restore();

  // Tee mark: a ring where the ball starts.
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.arc(hole.tee.x, hole.tee.y, 0.5, 0, Math.PI * 2);
  ctx.stroke();

  // Walls and banks: a shadow, then white.
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass ? WALL : SHADE;
    ctx.fillStyle = pass ? WALL : SHADE;
    ctx.lineWidth = 0.24;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const o = pass ? 0 : 0.12;
    ctx.save();
    ctx.translate(o * 0.6, o);
    for (const b of hole.blocks) {
      path(ctx, b);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    for (const w of hole.walls) {
      ctx.moveTo(w.ax, w.ay);
      ctx.lineTo(w.bx, w.by);
    }
    ctx.stroke();
    ctx.restore();
  }
  // Cup.
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(hole.cup.x, hole.cup.y, CUP_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 0.06;
  ctx.stroke();

  cache = { key, canvas };
  return canvas;
}

function talo(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, squash: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 + squash, 1 - squash);
  ctx.fillStyle = SHADE;
  ctx.beginPath();
  ctx.arc(0.07, 0.1, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const e = r * 0.28;
  for (const s of [-1, 1]) {
    ctx.fillStyle = WALL;
    ctx.beginPath();
    ctx.arc(s * r * 0.33, -r * 0.1, e, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(s * r * 0.33, -r * 0.05, e * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawHole(ctx: CanvasRenderingContext2D, v: DrawView, fit: Fit, dpr: number, now: number) {
  const { hole } = v;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(drawStill(hole, fit, dpr), 0, 0);
  place(ctx, fit, dpr);

  // Slopes: chevrons drifting downhill.
  for (const z of hole.zones) {
    if (z.kind !== "slope" || !z.slope) continue;
    const a = Math.atan2(z.slope.y, z.slope.x);
    const step = 1.2;
    const drift = (now * 0.5) % step;
    ctx.save();
    path(ctx, z.poly);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    for (let y = z.box[1] - step; y < z.box[3] + step; y += step)
      for (let x = z.box[0] - step; x < z.box[2] + step; x += step) {
        const cx = x + dx * drift;
        const cy = y + dy * drift;
        ctx.beginPath();
        ctx.moveTo(cx - dx * 0.2 - dy * 0.25, cy - dy * 0.2 + dx * 0.25);
        ctx.lineTo(cx + dx * 0.1, cy + dy * 0.1);
        ctx.lineTo(cx - dx * 0.2 + dy * 0.25, cy - dy * 0.2 - dx * 0.25);
        ctx.stroke();
      }
    ctx.restore();
  }

  // Bumpers: talos that squash when hit.
  hole.bumpers.forEach((b, i) => {
    const hit = v.bumped?.get(i);
    const age = hit === undefined ? 1 : now - hit;
    const squash = age < 0.35 ? Math.sin(age * 40) * 0.18 * (1 - age / 0.35) : 0;
    talo(ctx, b.x, b.y, b.r, PINK, squash);
  });

  // Mills.
  for (const m of hole.mills) {
    const a0 = millAngle(m, v.t);
    for (const pass of [0, 1]) {
      ctx.save();
      if (!pass) ctx.translate(0.08, 0.12);
      for (let k = 0; k < m.arms; k++) {
        const a = a0 + (k * Math.PI * 2) / m.arms;
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(a);
        ctx.fillStyle = pass ? ORANGE : SHADE;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.06;
        ctx.beginPath();
        ctx.roundRect(0, -MILL_T, m.len, MILL_T * 2, MILL_T);
        ctx.fill();
        if (pass) ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = YELLOW;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  // Aim: dots out from the ball, longer and warmer with power.
  if (v.aim) {
    const { x, y, angle, power } = v.aim;
    const len = 1 + power * 6;
    const color = power < 0.45 ? WALL : power < 0.8 ? YELLOW : ORANGE;
    ctx.fillStyle = color;
    for (let d = 0.6; d < len; d += 0.38) {
      const k = 1 - d / (len + 0.5);
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * d, y + Math.sin(angle) * d, 0.07 + 0.05 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.arc(x, y, BALL_R + 0.25, angle - Math.PI * power, angle + Math.PI * power);
    ctx.stroke();
  }

  // Balls: others first (lighter), mine on top.
  const balls = [...v.balls].sort((a, b) => Number(!!a.me) - Number(!!b.me));
  for (const b of balls) {
    if (b.sunk) continue;
    ctx.globalAlpha = b.me ? 1 : 0.6;
    ctx.fillStyle = SHADE;
    ctx.beginPath();
    ctx.arc(b.x + 0.06, b.y + 0.09, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = WALL;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.me ? 0.11 : 0.08;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Flag over the cup: down while a ball is close, so the cup shows.
  const near = v.balls.some((b) => !b.sunk && Math.hypot(b.x - hole.cup.x, b.y - hole.cup.y) < 2.2);
  if (!near) {
    // Upright on screen even when the hole is drawn turned.
    const wave = Math.sin(now * 3) * 0.08;
    ctx.save();
    ctx.translate(hole.cup.x, hole.cup.y);
    if (fit.rot) ctx.rotate(-Math.PI / 2);
    ctx.strokeStyle = WALL;
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -2);
    ctx.stroke();
    ctx.fillStyle = YELLOW;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.quadraticCurveTo(0.6, -1.85 + wave, 1.1, -1.7);
    ctx.lineTo(0, -1.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
