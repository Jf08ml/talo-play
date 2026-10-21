import { NECK, pelletRadius } from "./viboraSim";

/**
 * Viborita's drawing (browser only): the arena, pellets, remains and the
 * snakes on a 2D canvas, from sprites made once per color. A snake is a row
 * of shaded scales from the tail to the head; its head and neck (the hard
 * part: it can't be cut and, online, it's what you crash into) are armored
 * plates, with a red halo when it's dangerous to you.
 */

export interface SnakeLook {
  id: string;
  name: string;
  color: string;
  /** Head first, flat. */
  body: number[];
  a: number;
  mass: number;
  r: number;
  shielded: boolean;
  boosting: boolean;
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Mixes towards white (k > 0) or black (k < 0). */
export function shade(hex: string, k: number, alpha = 1): string {
  const [r, g, b] = channels(hex);
  const mix = (c: number) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k));
  return `rgba(${mix(r)},${mix(g)},${mix(b)},${alpha})`;
}

const SPRITE = 64;

function canvas(size = SPRITE): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")!];
}

type Kind = "scale" | "stripe" | "armor" | "glow" | "halo" | "drop";

function makeSprite(color: string, kind: Kind): HTMLCanvasElement {
  const [c, g] = canvas();
  const m = SPRITE / 2;
  if (kind === "glow" || kind === "halo" || kind === "drop") {
    const base = kind === "halo" ? "#f43f5e" : color;
    const grad = g.createRadialGradient(m, m, 0, m, m, m);
    if (kind === "drop") {
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.18, rgba(base, 1));
      grad.addColorStop(0.36, rgba(base, 0.45));
    } else {
      grad.addColorStop(0, rgba(base, 0.9));
      grad.addColorStop(0.45, rgba(base, 0.35));
    }
    grad.addColorStop(1, rgba(base, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE, SPRITE);
    return c;
  }
  const R = m - 3;
  // A sphere lit from the top left.
  const lit = g.createRadialGradient(m - 9, m - 10, 1, m, m, R);
  if (kind === "armor") {
    lit.addColorStop(0, "rgba(255,255,255,0.95)");
    lit.addColorStop(0.22, shade(color, 0.35));
    lit.addColorStop(0.62, shade(color, -0.35));
    lit.addColorStop(1, shade(color, -0.75));
  } else {
    const base = kind === "stripe" ? shade(color, 0.3) : color;
    const hex = kind === "stripe" ? base : color;
    lit.addColorStop(0, kind === "stripe" ? "rgba(255,255,255,0.95)" : shade(color, 0.6));
    lit.addColorStop(0.38, hex);
    lit.addColorStop(0.85, shade(color, -0.35));
    lit.addColorStop(1, shade(color, -0.6));
  }
  g.beginPath();
  g.arc(m, m, R, 0, Math.PI * 2);
  g.fillStyle = lit;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.stroke();
  if (kind === "armor") {
    // A metal rim and a hexagonal plate: "this part is hard".
    g.lineWidth = 3;
    g.strokeStyle = "rgba(255,255,255,0.7)";
    g.beginPath();
    g.arc(m, m, R - 2.5, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 2;
    g.strokeStyle = "rgba(15,23,42,0.55)";
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      const x = m + Math.cos(a) * R * 0.55;
      const y = m + Math.sin(a) * R * 0.55;
      if (k) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.closePath();
    g.stroke();
  }
  return c;
}

function pelletSprite(hue: number): HTMLCanvasElement {
  const [c, g] = canvas();
  const m = SPRITE / 2;
  const grad = g.createRadialGradient(m, m, 0, m, m, m);
  grad.addColorStop(0, `hsla(${hue}, 100%, 92%, 1)`);
  grad.addColorStop(0.2, `hsla(${hue}, 100%, 68%, 1)`);
  grad.addColorStop(0.32, `hsla(${hue}, 100%, 60%, 0.45)`);
  grad.addColorStop(1, `hsla(${hue}, 100%, 55%, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, SPRITE, SPRITE);
  return c;
}

function floorPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const s = 40;
  const w = s * Math.sqrt(3);
  const [c, g] = canvas();
  c.width = Math.round(w);
  c.height = s * 3;
  g.fillStyle = "#0f0e1a";
  g.fillRect(0, 0, c.width, c.height);
  const hex = (cx: number, cy: number) => {
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      const x = cx + Math.cos(a) * (s - 2);
      const y = cy + Math.sin(a) * (s - 2);
      if (k) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.closePath();
    const fill = g.createLinearGradient(cx, cy - s, cx, cy + s);
    fill.addColorStop(0, "#16142a");
    fill.addColorStop(1, "#100f1d");
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = "rgba(139,92,246,0.16)";
    g.lineWidth = 1.5;
    g.stroke();
  };
  hex(w / 2, 0);
  hex(0, s * 1.5);
  hex(w, s * 1.5);
  hex(w / 2, s * 3);
  return ctx.createPattern(c, "repeat");
}

/** Evenly spaced points along a polyline (head first): [x, y, distance from the head]. */
function sampleAlong(body: number[], step: number): number[] {
  const out = [body[0], body[1], 0];
  let need = step;
  let acc = 0;
  for (let i = 2; i + 1 < body.length; i += 2) {
    let ax = body[i - 2];
    let ay = body[i - 1];
    const bx = body[i];
    const by = body[i + 1];
    let len = Math.hypot(bx - ax, by - ay);
    while (len >= need) {
      ax += ((bx - ax) * need) / len;
      ay += ((by - ay) * need) / len;
      acc += need;
      out.push(ax, ay, acc);
      len -= need;
      need = step;
    }
    acc += len;
    need -= len;
  }
  return out;
}

export class Painter {
  private sprites = new Map<string, HTMLCanvasElement>();
  private pellets: HTMLCanvasElement[];
  private floor: CanvasPattern | null;

  constructor(private ctx: CanvasRenderingContext2D) {
    this.pellets = Array.from({ length: 12 }, (_, k) => pelletSprite(k * 30));
    this.floor = floorPattern(ctx);
  }

  private sprite(color: string, kind: Kind): HTMLCanvasElement {
    const key = `${color}|${kind}`;
    let s = this.sprites.get(key);
    if (!s) {
      s = makeSprite(color, kind);
      this.sprites.set(key, s);
    }
    return s;
  }

  /** The floor, the outside and the energy wall at the edge. */
  arena(radius: number, t: number, deadly: boolean) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = this.floor ?? "#0f0e1a";
    ctx.fill();
    const glow = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
    glow.addColorStop(0, "rgba(139,92,246,0.10)");
    glow.addColorStop(0.75, "rgba(0,0,0,0)");
    glow.addColorStop(1, "rgba(244,63,94,0.22)");
    ctx.fillStyle = glow;
    ctx.fill();
    const pulse = 0.5 + 0.5 * Math.sin(t / 280);
    ctx.lineWidth = 60;
    ctx.strokeStyle = `rgba(244,63,94,${0.08 + 0.06 * pulse})`;
    ctx.stroke();
    ctx.lineWidth = 16;
    ctx.strokeStyle = `rgba(244,63,94,${0.35 + 0.2 * pulse})`;
    ctx.stroke();
    ctx.setLineDash([46, 30]);
    ctx.lineDashOffset = -t / 25;
    ctx.lineWidth = 5;
    ctx.strokeStyle = deadly ? "rgba(255,241,242,0.95)" : "rgba(254,205,211,0.75)";
    ctx.stroke();
    ctx.setLineDash([]);
  }

  pellet(x: number, y: number, v: number, hue: number, grow: number, t: number, i: number) {
    const size = pelletRadius(v) * 5 * grow * (1 + 0.12 * Math.sin(t / 260 + i));
    this.ctx.drawImage(this.pellets[Math.floor(hue / 30) % 12], x - size / 2, y - size / 2, size, size);
  }

  drop(x: number, y: number, v: number, color: string, alpha: number, t: number) {
    const size = pelletRadius(Math.min(v, 6)) * 5.5 * (1 + 0.15 * Math.sin(t / 200 + x));
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(this.sprite(color, "drop"), x - size / 2, y - size / 2, size, size);
    this.ctx.globalAlpha = 1;
  }

  /**
   * A snake. `odo` is how far its head has travelled (keeps the stripes on
   * the body); `danger` 0–1 lights its hard part up in red.
   */
  snake(v: SnakeLook, t: number, odo: number, danger: number, look: number) {
    const ctx = this.ctx;
    const r = v.r;
    if (v.body.length < 4) return;
    const pts = sampleAlong(v.body, Math.max(3, r * 0.55));
    const n = pts.length / 3;
    const total = pts[pts.length - 1];
    const alpha = v.shielded ? 0.5 + 0.2 * Math.sin(t / 90) : 1;

    // Shadow on the floor.
    ctx.globalAlpha = 0.32 * alpha;
    ctx.beginPath();
    ctx.moveTo(pts[0] + r * 0.35, pts[1] + r * 0.55);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i * 3] + r * 0.35, pts[i * 3 + 1] + r * 0.55);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = r * 2;
    ctx.strokeStyle = "#000";
    ctx.stroke();

    // Boost trail glow.
    if (v.boosting) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.55 * alpha;
      const glow = this.sprite(v.color, "glow");
      for (let i = 0; i < n; i += 2) {
        const s = r * 4.2;
        ctx.drawImage(glow, pts[i * 3] - s / 2, pts[i * 3 + 1] - s / 2, s, s);
      }
      ctx.globalCompositeOperation = "source-over";
    }

    // Red halo under a dangerous head and neck.
    if (danger > 0) {
      const halo = this.sprite(v.color, "halo");
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = danger * (0.55 + 0.35 * Math.sin(t / 110));
      for (let i = 0; i < n && pts[i * 3 + 2] <= NECK; i++) {
        const s = r * (i === 0 ? 5.2 : 4);
        ctx.drawImage(halo, pts[i * 3] - s / 2, pts[i * 3 + 1] - s / 2, s, s);
      }
      ctx.globalCompositeOperation = "source-over";
    }

    // Scales, tail first so the head ends on top. The tail tapers.
    ctx.globalAlpha = alpha;
    const scale = this.sprite(v.color, "scale");
    const stripe = this.sprite(v.color, "stripe");
    const armor = this.sprite(v.color, "armor");
    const band = r * 1.7;
    for (let i = n - 1; i >= 1; i--) {
      const d = pts[i * 3 + 2];
      const taper = total > 0 && d > total * 0.65 ? 1 - 0.45 * ((d - total * 0.65) / (total * 0.35)) : 1;
      const s = r * 2.25 * taper;
      const kind = d <= NECK ? armor : Math.floor((odo - d) / band) % 3 === 0 ? stripe : scale;
      ctx.drawImage(kind, pts[i * 3] - s / 2, pts[i * 3 + 1] - s / 2, s, s);
    }

    // The head: an armored plate, a bit bigger, with eyes.
    const hx = pts[0];
    const hy = pts[1];
    const hs = r * 2.7;
    ctx.drawImage(armor, hx - hs / 2, hy - hs / 2, hs, hs);
    const ca = Math.cos(v.a);
    const sa = Math.sin(v.a);
    const lx = Math.cos(look);
    const ly = Math.sin(look);
    for (const side of [-1, 1]) {
      const ex = hx + ca * r * 0.45 - sa * side * r * 0.58;
      const ey = hy + sa * r * 0.45 + ca * side * r * 0.58;
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.46, 0, Math.PI * 2);
      ctx.fillStyle = "#f8fafc";
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.strokeStyle = "rgba(15,23,42,0.6)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex + lx * r * 0.18, ey + ly * r * 0.18, r * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = "#0b0a14";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + lx * r * 0.18 - r * 0.08, ey + ly * r * 0.18 - r * 0.09, r * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }

    // Just spawned or just cut: a bubble nobody can hurt.
    if (v.shielded) {
      ctx.globalAlpha = 0.7;
      ctx.setLineDash([r * 0.8, r * 0.6]);
      ctx.lineDashOffset = -t / 30;
      ctx.lineWidth = Math.max(1.5, r * 0.18);
      ctx.strokeStyle = "rgba(186,230,253,0.9)";
      ctx.beginPath();
      ctx.arc(hx, hy, r * 2.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }

  /** A name tag over a head, at a fixed screen size (`z` = zoom). */
  nameTag(v: SnakeLook, z: number, leader: boolean) {
    const ctx = this.ctx;
    const fs = 12 / z;
    ctx.font = `600 ${fs}px ui-sans-serif, system-ui, sans-serif`;
    const label = leader ? `♛ ${v.name}` : v.name;
    const w = ctx.measureText(label).width + 12 / z;
    const h = fs + 7 / z;
    const x = v.body[0] - w / 2;
    const y = v.body[1] - v.r * 1.6 - h - 6 / z;
    ctx.fillStyle = "rgba(2,6,23,0.62)";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    ctx.lineWidth = 1 / z;
    ctx.strokeStyle = leader ? "rgba(252,211,77,0.7)" : rgba(v.color, 0.55);
    ctx.stroke();
    ctx.fillStyle = leader ? "#fde68a" : "#f1f5f9";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, v.body[0], y + h / 2 + 0.5 / z);
    ctx.textBaseline = "alphabetic";
  }

  /** A floating "+12" in the world. */
  popup(x: number, y: number, text: string, color: string, life: number, z: number) {
    const ctx = this.ctx;
    const rise = (1 - life) * 40;
    ctx.globalAlpha = Math.min(1, life * 2);
    ctx.font = `800 ${18 / z}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 4 / z;
    ctx.strokeStyle = "rgba(2,6,23,0.85)";
    ctx.strokeText(text, x, y - rise / z - 20 / z);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y - rise / z - 20 / z);
    ctx.globalAlpha = 1;
  }

  /** Darker corners; red ones when you're close to a deadly edge. */
  vignette(w: number, h: number, edge: number) {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, edge > 0 ? `rgba(190,18,60,${0.25 + 0.4 * edge})` : "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /** The round minimap: everyone, the leader, me as an arrow and what the camera sees. */
  minimap(
    snakes: SnakeLook[],
    radius: number,
    myId: string,
    leaderId: string | null,
    at: { x: number; y: number; size: number },
    view: { x: number; y: number; w: number; h: number }
  ) {
    const ctx = this.ctx;
    const { x: mx, y: my, size: mm } = at;
    const k = mm / radius;
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, mm + 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(2,6,23,0.72)";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mx, my, mm, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(244,63,94,0.75)";
    ctx.stroke();
    ctx.clip();
    ctx.strokeStyle = "rgba(139,92,246,0.18)";
    ctx.lineWidth = 1;
    for (const f of [0.33, 0.66]) {
      ctx.beginPath();
      ctx.arc(mx, my, mm * f, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.strokeRect(mx + (view.x - view.w / 2) * k, my + (view.y - view.h / 2) * k, view.w * k, view.h * k);
    for (const s of snakes) {
      if (s.id === myId) continue;
      const sx = mx + s.body[0] * k;
      const sy = my + s.body[1] * k;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.8 + Math.min(2.2, s.mass / 140), 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      if (s.id === leaderId) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#fcd34d";
        ctx.stroke();
      }
    }
    const me = snakes.find((s) => s.id === myId);
    if (me) {
      const sx = mx + me.body[0] * k;
      const sy = my + me.body[1] * k;
      ctx.translate(sx, sy);
      ctx.rotate(me.a);
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, 4);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-4, -4);
      ctx.closePath();
      ctx.fillStyle = "#fff";
      ctx.fill();
    }
    ctx.restore();
  }
}
