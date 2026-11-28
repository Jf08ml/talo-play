import { tvDpr, tvModeOn } from "@/lib/tvMode";
import { BODY_R, FALL_TIME, ISLAND_R } from "./empujones";

/**
 * Empujones' big-screen drawing: the island seen from above on flat water,
 * the talos (flat bodies with eyes, like the brand's), splashes and bumps.
 * Plain 2D canvas, flat colors (no gradients or glows).
 */

const WATER = "#2D5BFF";
const WATER_LINE = "rgba(255,255,255,0.22)";
const CLIFF = "#C9A25B";
const SAND = "#F4D58D";
const GRASS = "#3DBE6E";
const GRASS_LINE = "rgba(17,17,17,0.08)";
const INK = "#111111";
const WARN = "#FF5FA2";

export interface DrawBody {
  id: string;
  x: number;
  y: number;
  face: number;
  color: string;
  name: string;
  bracing: boolean;
  dashing: boolean;
  stunned: boolean;
  /** Seconds since it went over the edge (0 = on the island). */
  falling: number;
  out: boolean;
  /** Not connected: drawn faded. */
  away?: boolean;
}

interface Particle {
  kind: "splash" | "drop" | "crumb" | "star";
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
}

export class IslandPainter {
  private ctx: CanvasRenderingContext2D;
  private parts: Particle[] = [];
  private time = 0;
  private lastRadius = ISLAND_R;
  private crumbAcc = 0;
  private font = "system-ui, sans-serif";
  /** Where the talos were last frame (eased "trail" behind a dash). */
  private trails = new Map<string, { x: number; y: number }[]>();

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    try {
      this.font = getComputedStyle(document.body).fontFamily || this.font;
    } catch {
      // Keep the fallback.
    }
  }

  splash(x: number, y: number, color: string) {
    this.parts.push({ kind: "splash", x, y, vx: 0, vy: 0, age: 0, life: 1, size: 1, color });
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 3;
      this.parts.push({ kind: "drop", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, age: 0, life: 0.6 + Math.random() * 0.3, size: 0.12 + Math.random() * 0.1, color: "#FFFFFF" });
    }
  }

  bump(x: number, y: number, strong: boolean) {
    const n = strong ? 8 : 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (strong ? 4 : 2) + Math.random() * 2;
      this.parts.push({ kind: "star", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, age: 0, life: 0.35 + Math.random() * 0.2, size: strong ? 0.22 : 0.14, color: "#FFD400" });
    }
  }

  /** Back to a whole island and no particles (a new round). */
  reset() {
    this.parts = [];
    this.trails.clear();
    this.lastRadius = ISLAND_R;
  }

  draw(bodies: DrawBody[], radius: number, warn: boolean, dt: number) {
    const { canvas, ctx } = this;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const base = Math.min(2, window.devicePixelRatio || 1);
    // Modo TV: within the TV's pixel budget, scaled up by the browser.
    const dpr = tvModeOn() ? tvDpr(base, w, h) : base;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    this.time += dt;
    const t = this.time;
    // The whole island fits, with room for the names and splashes around it.
    const k = Math.min(w, h * 0.94) / (2 * (ISLAND_R + 2.2));
    const cx = w / 2;
    const cy = h * 0.54;
    const sx = (x: number) => cx + x * k;
    const sy = (y: number) => cy + y * k;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Water, with ripples moving out from the island.
    ctx.fillStyle = WATER;
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = Math.max(1.5, k * 0.06);
    for (let i = 0; i < 4; i++) {
      const p = (t * 0.25 + i / 4) % 1;
      ctx.strokeStyle = `rgba(255,255,255,${0.28 * (1 - p)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, (Math.max(radius, 0.5) + 0.4 + p * 4.5) * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = WATER_LINE;
    ctx.lineWidth = Math.max(1.5, k * 0.05);
    for (let i = 0; i < 26; i++) {
      // Little wave marks spread over the water, drifting.
      const a = i * 2.39996;
      const r = ISLAND_R + 1 + ((i * 37) % 11) * 0.9;
      const x = sx(Math.cos(a) * r + Math.sin(t * 0.5 + i) * 0.3);
      const y = sy(Math.sin(a) * r);
      ctx.beginPath();
      ctx.moveTo(x - k * 0.35, y);
      ctx.quadraticCurveTo(x, y - k * 0.22, x + k * 0.35, y);
      ctx.stroke();
    }

    // Bits of the edge crumble into the water while it shrinks.
    if (radius < this.lastRadius - 1e-4 && radius > 0) {
      this.crumbAcc += dt;
      while (this.crumbAcc > 0.035) {
        this.crumbAcc -= 0.035;
        const a = Math.random() * Math.PI * 2;
        const r = radius + 0.1;
        this.parts.push({ kind: "crumb", x: Math.cos(a) * r, y: Math.sin(a) * r, vx: Math.cos(a) * 0.8, vy: Math.sin(a) * 0.8, age: 0, life: 0.7, size: 0.18 + Math.random() * 0.2, color: Math.random() < 0.5 ? SAND : CLIFF });
      }
    }
    this.lastRadius = radius;

    // The island: a cliff below, sand rim, grass on top.
    if (radius > 0.05) {
      const R = radius * k;
      ctx.fillStyle = CLIFF;
      ctx.beginPath();
      ctx.ellipse(cx, cy + k * 0.35, R, R, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = warn && Math.floor(t * 4) % 2 === 0 ? WARN : SAND;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      const grassR = Math.max(0, R - k * 0.45);
      ctx.fillStyle = GRASS;
      ctx.beginPath();
      ctx.arc(cx, cy, grassR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = GRASS_LINE;
      ctx.lineWidth = Math.max(1, k * 0.05);
      for (let r = 2.2; r * k < grassR; r += 2.2) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(17,17,17,0.12)";
      ctx.beginPath();
      ctx.arc(cx, cy, k * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }

    // Particles under the talos (splashes, crumbs), stars over them.
    this.parts = this.parts.filter((p) => (p.age += dt) < p.life);
    for (const p of this.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
    const fade = (p: Particle) => 1 - p.age / p.life;
    for (const p of this.parts) {
      if (p.kind === "splash") {
        const q = p.age / p.life;
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - q)})`;
        ctx.lineWidth = Math.max(2, k * 0.12 * (1 - q));
        for (const m of [1, 0.55]) {
          ctx.beginPath();
          ctx.ellipse(sx(p.x), sy(p.y), (0.3 + q * 1.8 * m) * k, (0.3 + q * 1.8 * m) * k * 0.8, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (p.kind === "drop" || p.kind === "crumb") {
        ctx.globalAlpha = fade(p);
        ctx.fillStyle = p.color;
        const s = p.size * k * (p.kind === "crumb" ? fade(p) : 1);
        ctx.fillRect(sx(p.x) - s / 2, sy(p.y) - s / 2, s, s);
        ctx.globalAlpha = 1;
      }
    }

    // Talos: the fallen sink under the rest, so draw them first; higher on screen first.
    const order = [...bodies].filter((b) => !b.out).sort((a, b) => (b.falling > 0 ? 1 : 0) - (a.falling > 0 ? 1 : 0) || a.y - b.y);
    for (const b of order) this.drawTalo(b, sx(b.x), sy(b.y), k, t);

    for (const p of this.parts) {
      if (p.kind !== "star") continue;
      ctx.globalAlpha = fade(p);
      ctx.fillStyle = p.color;
      star(ctx, sx(p.x), sy(p.y), p.size * k);
      ctx.globalAlpha = 1;
    }

    // Names over everyone still in.
    const fontPx = Math.max(13, Math.min(26, k * 0.42));
    ctx.font = `700 ${fontPx}px ${this.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const b of order) {
      if (b.falling > 0) continue;
      const x = sx(b.x);
      const y = sy(b.y) - BODY_R * k - fontPx * 0.95;
      const tw = ctx.measureText(b.name).width + fontPx * 0.9;
      ctx.globalAlpha = b.away ? 0.55 : 1;
      ctx.fillStyle = "rgba(17,17,17,0.78)";
      roundRect(ctx, x - tw / 2, y - fontPx * 0.72, tw, fontPx * 1.44, fontPx * 0.72);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(b.name, x, y + 1);
      ctx.globalAlpha = 1;
    }
  }

  private drawTalo(b: DrawBody, x: number, y: number, k: number, t: number) {
    const { ctx } = this;
    const fall = b.falling > 0 ? Math.min(1, b.falling / FALL_TIME) : 0;
    const scale = 1 - fall * 0.75;
    let r = BODY_R * k * scale;
    if (b.bracing) r *= 1.08;

    // Dash trail: a few faded copies behind.
    const trail = this.trails.get(b.id) ?? [];
    if (b.dashing) trail.unshift({ x, y });
    else trail.length = Math.max(0, trail.length - 1);
    trail.length = Math.min(trail.length, 5);
    this.trails.set(b.id, trail);
    trail.forEach((p, i) => {
      if (i === 0) return;
      ctx.globalAlpha = 0.25 * (1 - i / trail.length);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * (1 - i * 0.08), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = b.away ? 0.6 : 1 - fall * 0.5;

    // Shadow on the ground (not while falling).
    if (!fall) {
      ctx.fillStyle = "rgba(17,17,17,0.22)";
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.55, r * 0.95, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Body, a bit squashed when bracing, wobbling when stunned.
    const wob = b.stunned ? Math.sin(t * 40) * 0.08 : 0;
    const rx = r * (b.bracing ? 1.12 : 1 + wob);
    const ry = r * (b.bracing ? 0.9 : 1 - wob);
    ctx.fillStyle = b.color;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, r * (b.bracing ? 0.2 : 0.11));
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eyes looking where it's going (scared while falling, dizzy when stunned).
    const fx = Math.cos(b.face);
    const fy = Math.sin(b.face);
    const er = r * 0.27;
    // Side by side like the brand's talos, nudged toward where it's going.
    const ex = x + fx * r * 0.22;
    const ey = y - r * 0.16 + fy * r * 0.16;
    for (const side of [-1, 1]) {
      const cxE = ex + side * er * 1.15;
      const cyE = ey;
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(cxE, cyE, er, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      if (b.stunned) {
        const a = t * 14 * side;
        ctx.beginPath();
        ctx.arc(cxE + Math.cos(a) * er * 0.4, cyE + Math.sin(a) * er * 0.4, er * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const look = fall ? 0 : 0.42;
        ctx.beginPath();
        ctx.arc(cxE + fx * er * look, cyE + fy * er * look, er * (fall ? 0.3 : 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Bracing: a frown of effort; falling: an "O".
    if (b.bracing || fall) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.5, r * 0.1);
      const mx = x + fx * r * 0.22;
      const my = y + r * 0.32 + fy * r * 0.12;
      ctx.beginPath();
      if (fall) ctx.arc(mx, my, r * 0.14, 0, Math.PI * 2);
      else {
        ctx.moveTo(mx - r * 0.2, my);
        ctx.lineTo(mx + r * 0.2, my);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const r = i % 2 ? s * 0.4 : s;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
