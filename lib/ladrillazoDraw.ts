import { BALL_R, BOTTOM_Y, COLS, DANGER_ROW, PADDLE_T, ROWS, TOP_Y } from "./ladrillazoSim";

/**
 * Drawing Ladrillazo on a 2D canvas: flat cells in the brand's colors, the
 * paddles, balls, falling power-ups and the bits that fly when a brick
 * breaks. The same function draws your field and the rivals' small previews.
 */

/** Brick colors by row, the talos' flat palette. */
const ROW_COLORS = ["#FFD400", "#FF7A1A", "#FF5FA2", "#8A4DFF", "#2D5BFF", "#00B26B"];
const BG = "#161616";
const GRID = "#1d1d1d";
const WALL = "#3a3a3a";
const WALL_TOP = "#4a4a4a";
const HARD = "#d9d9d9";
const TARGET = "#FF3B30";
const INK = "#111111";

export interface PaddleView {
  x: number;
  hw: number;
  side: 1 | -1;
  color: string;
  me?: boolean;
}

export interface FieldView {
  cells: string;
  paddles: PaddleView[];
  balls: { x: number; y: number }[];
  drops?: { x: number; y: number; kind: string }[];
  /** The attack's danger line. */
  danger?: boolean;
  /** Draw upside down (the duel's top player sees their paddle at the bottom). */
  flip?: boolean;
  /** Lane lines (co-op). */
  lanes?: number[];
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export function cellColor(ch: string, row: number): string {
  switch (ch) {
    case "#":
      return WALL;
    case "B":
      return HARD;
    case "o":
      return TARGET;
    case "x":
      return INK;
    case "m":
    case "l":
    case "v":
      return "#FFFFFF";
    default:
      return ROW_COLORS[row % ROW_COLORS.length];
  }
}

/** Bits flying out of a broken cell (cell units). */
export function burst(particles: Particle[], i: number, ch: string, many = 6) {
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  const color = ch === "B" ? HARD : cellColor(ch, r);
  for (let k = 0; k < many; k++) {
    const a = Math.random() * Math.PI * 2;
    const s = 2 + Math.random() * 6;
    particles.push({ x: c + 0.5, y: r + 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 0.5 + Math.random() * 0.4, color, size: 0.15 + Math.random() * 0.2 });
  }
  if (particles.length > 400) particles.splice(0, particles.length - 400);
}

export function stepParticles(particles: Particle[], dt: number) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 18 * dt;
    p.life -= dt;
  }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/**
 * Draws a field filling `w × h` px (cells stay square, centered). `t` is a
 * clock in seconds for the targets' pulse. Small previews pass `detail` false.
 */
export function drawField(
  ctx: CanvasRenderingContext2D,
  view: FieldView,
  w: number,
  h: number,
  t: number,
  particles: Particle[] = [],
  detail = true
) {
  const cell = Math.min(w / COLS, h / ROWS);
  const ox = (w - cell * COLS) / 2;
  const oy = (h - cell * ROWS) / 2;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.translate(ox, oy);
  if (view.flip) {
    ctx.translate(cell * COLS, cell * ROWS);
    ctx.rotate(Math.PI);
  }
  ctx.scale(cell, cell);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, COLS, ROWS);
  if (detail) {
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1 / cell;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) {
      ctx.moveTo(c, 0);
      ctx.lineTo(c, ROWS);
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.moveTo(0, r);
      ctx.lineTo(COLS, r);
    }
    ctx.stroke();
  }

  if (view.lanes) {
    ctx.fillStyle = "#ffffff10";
    for (const x of view.lanes) ctx.fillRect(x - 0.03, BOTTOM_Y - 4, 0.06, 6);
  }

  if (view.danger) {
    ctx.fillStyle = "#FF3B3022";
    ctx.fillRect(0, DANGER_ROW, COLS, 0.12);
    ctx.fillStyle = "#FF3B3010";
    ctx.fillRect(0, DANGER_ROW, COLS, ROWS - DANGER_ROW);
  }

  const gap = detail ? 0.08 : 0.04;
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  for (let i = 0; i < view.cells.length; i++) {
    const ch = view.cells[i];
    if (ch === "." || !ch) continue;
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    ctx.fillStyle = cellColor(ch, r);
    if (ch === "#") {
      ctx.fillRect(c, r, 1, 1);
      if (detail) {
        ctx.fillStyle = WALL_TOP;
        ctx.fillRect(c + 0.08, r + 0.08, 0.84, 0.18);
      }
      continue;
    }
    if (!detail) {
      ctx.fillRect(c + gap, r + gap, 1 - 2 * gap, 1 - 2 * gap);
      continue;
    }
    roundRect(ctx, c + gap, r + gap, 1 - 2 * gap, 1 - 2 * gap, 0.14);
    if (ch === "B") {
      // Hard: a darker core shows it takes two hits.
      ctx.fillStyle = "#9a9a9a";
      roundRect(ctx, c + 0.28, r + 0.28, 0.44, 0.44, 0.08);
    } else if (ch === "o") {
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 0.09;
      ctx.beginPath();
      ctx.arc(c + 0.5, r + 0.5, 0.2 + pulse * 0.08, 0, Math.PI * 2);
      ctx.stroke();
    } else if (ch === "x") {
      ctx.fillStyle = "#FFD400";
      ctx.beginPath();
      ctx.arc(c + 0.5, r + 0.55, 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(c + 0.6, r + 0.14, 0.1, 0.22);
    } else if (ch === "m" || ch === "l" || ch === "v") {
      drawPowerIcon(ctx, ch, c + 0.5, r + 0.5, 0.32);
    }
  }

  for (const d of view.drops ?? []) {
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(d.x, d.y, 0.45, 0, Math.PI * 2);
    ctx.fill();
    drawPowerIcon(ctx, d.kind, d.x, d.y, 0.3);
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  for (const p of view.paddles) {
    const y = p.side === 1 ? BOTTOM_Y : TOP_Y - PADDLE_T;
    ctx.fillStyle = p.color;
    roundRect(ctx, p.x - p.hw, y, p.hw * 2, PADDLE_T, PADDLE_T / 2);
    if (p.me && detail) {
      ctx.fillStyle = "#FFFFFF";
      roundRect(ctx, p.x - 0.5, y + PADDLE_T * 0.3, 1, PADDLE_T * 0.4, 0.1);
    }
  }

  ctx.fillStyle = "#FFFFFF";
  for (const b of view.balls) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, detail ? BALL_R : BALL_R * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawPowerIcon(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, s: number) {
  if (kind === "m") {
    ctx.fillStyle = "#2D5BFF";
    for (const [dx, dy] of [[-0.5, 0.35], [0.5, 0.35], [0, -0.45]]) {
      ctx.beginPath();
      ctx.arc(x + dx * s, y + dy * s, s * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === "l") {
    ctx.fillStyle = "#00B26B";
    ctx.fillRect(x - s, y - s * 0.25, s * 2, s * 0.5);
  } else if (kind === "v") {
    ctx.fillStyle = "#FF5FA2";
    ctx.fillRect(x - s * 0.18, y - s * 0.8, s * 0.36, s * 1.6);
    ctx.fillRect(x - s * 0.8, y - s * 0.18, s * 1.6, s * 0.36);
  }
}

/** The canvas size that fits the field in a box, keeping cells square. */
export function fitField(boxW: number, boxH: number): { w: number; h: number } {
  const cell = Math.max(4, Math.floor(Math.min(boxW / COLS, boxH / ROWS) * 4) / 4);
  return { w: Math.round(cell * COLS), h: Math.round(cell * ROWS) };
}
