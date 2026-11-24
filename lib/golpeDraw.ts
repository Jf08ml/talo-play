import { mulberry32 } from "./random";
import {
  BIG_GEM,
  CAM_HALF,
  CAM_RANGE,
  GUARD_HALF,
  GUARD_RANGE,
  ROOM,
  camAngle,
  guardAt,
  laserOn,
  laserSoon,
  rayLength,
  type GolpeMap,
} from "./golpeMap";

/**
 * El gran golpe on a flat canvas, in cell units (the caller scales the
 * context). The building is drawn once into an offscreen canvas; security,
 * diamonds and thieves every frame.
 */

const PX = 48;
const FLOOR = { sala: "#2a2f3d", boveda: "#3a2d50", entrada: "#22332c" } as const;
const GRID = { sala: "#313748", boveda: "#45375e", entrada: "#2a3e35" } as const;
const WALL_TOP = "#4b5269";
const WALL_FACE = "#232737";
const INK = "#111111";
const TEAM_COLOR = { red: "#fb3a5d", blue: "#22d3ee" } as const;

export interface ThiefView {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  a: number;
  bag: number;
  /** Handcuffed. */
  cuffed: boolean;
  /** Just back at the exit: nobody sees them yet. */
  safe: boolean;
  /** 0–1: the lunge of a robbery. */
  lunge: number;
  team: "red" | "blue" | null;
  me: boolean;
  /** 0–1: someone is about to catch them (only drawn for me). */
  alert: number;
}

export class Painter {
  private ctx: CanvasRenderingContext2D;
  private map: GolpeMap;
  private floor: HTMLCanvasElement;
  private mini: HTMLCanvasElement;

  constructor(ctx: CanvasRenderingContext2D, map: GolpeMap, teams: boolean) {
    this.ctx = ctx;
    this.map = map;
    this.floor = this.buildFloor(teams);
    this.mini = this.buildMini(teams);
  }

  private buildFloor(teams: boolean): HTMLCanvasElement {
    const m = this.map;
    const c = document.createElement("canvas");
    c.width = m.w * PX;
    c.height = m.h * PX;
    const g = c.getContext("2d")!;
    g.scale(PX, PX);
    g.fillStyle = "#0b0c10";
    g.fillRect(0, 0, m.w, m.h);
    const kindAt = (x: number, y: number) => {
      const r = m.room[y * m.w + x];
      if (r >= 0) return m.rooms[r].kind;
      // Doors take the floor of a neighbor room.
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const n = m.room[(y + dy) * m.w + x + dx];
        if (n >= 0) return m.rooms[n].kind;
      }
      return "sala" as const;
    };
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (m.wall[y * m.w + x]) continue;
        const k = kindAt(x, y);
        g.fillStyle = FLOOR[k];
        g.fillRect(x, y, 1, 1);
        g.fillStyle = GRID[k];
        g.fillRect(x, y, 1, 0.04);
        g.fillRect(x, y, 0.04, 1);
      }
    }
    // Rugs: the vaults get a carpet with a border.
    for (const r of m.rooms) {
      if (r.kind !== "boveda") continue;
      g.fillStyle = "#5b2a4a";
      g.fillRect(r.x0 + 1, r.y0 + 1, ROOM - 2, ROOM - 2);
      g.strokeStyle = "#d4a017";
      g.lineWidth = 0.08;
      g.strokeRect(r.x0 + 1.25, r.y0 + 1.25, ROOM - 2.5, ROOM - 2.5);
    }
    // Exits: striped hatches, in the team's color when there are teams.
    m.exits.forEach((e, i) => {
      const color = teams ? (i < 2 ? TEAM_COLOR.red : TEAM_COLOR.blue) : "#FFD400";
      g.fillStyle = color;
      g.fillRect(e.x + 0.1, e.y + 0.1, 1.8, 1.8);
      g.save();
      g.beginPath();
      g.rect(e.x + 0.25, e.y + 0.25, 1.5, 1.5);
      g.clip();
      g.fillStyle = INK;
      for (let s = -2; s < 4; s += 0.5) {
        g.beginPath();
        g.moveTo(e.x + s, e.y + 2);
        g.lineTo(e.x + s + 0.22, e.y + 2);
        g.lineTo(e.x + s + 2.22, e.y);
        g.lineTo(e.x + s + 2, e.y);
        g.fill();
      }
      g.restore();
      g.fillStyle = INK;
      g.fillRect(e.x + 0.35, e.y + 0.78, 1.3, 0.44);
      g.fillStyle = color;
      g.font = "bold 0.3px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("SALIDA", e.x + 1, e.y + 1.01);
    });
    // Walls with a face toward the floor below, so the building has some depth.
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (!m.wall[y * m.w + x]) continue;
        g.fillStyle = WALL_TOP;
        g.fillRect(x, y, 1, 1);
        if (y + 1 < m.h && !m.wall[(y + 1) * m.w + x]) {
          g.fillStyle = WALL_FACE;
          g.fillRect(x, y + 0.62, 1, 0.38);
        }
      }
    }
    // Paintings on the walls of the halls.
    const rnd = mulberry32(m.seed ^ 0x51ed);
    const frames = ["#FFD400", "#FF5FA2", "#2D5BFF", "#00B26B", "#FF7A1A"];
    for (let y = 1; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (!m.wall[y * m.w + x] || m.wall[(y + 1) * m.w + x] !== 0 || rnd() > 0.22) continue;
        const r = m.room[(y + 1) * m.w + x];
        if (r < 0 || m.rooms[r].kind === "entrada") continue;
        g.fillStyle = "#c9a227";
        g.fillRect(x + 0.18, y + 0.64, 0.64, 0.32);
        g.fillStyle = frames[Math.floor(rnd() * frames.length)];
        g.fillRect(x + 0.24, y + 0.69, 0.52, 0.22);
      }
    }
    return c;
  }

  private buildMini(teams: boolean): HTMLCanvasElement {
    const m = this.map;
    const c = document.createElement("canvas");
    const s = 4;
    c.width = m.w * s;
    c.height = m.h * s;
    const g = c.getContext("2d")!;
    g.scale(s, s);
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const r = m.room[y * m.w + x];
        if (m.wall[y * m.w + x]) g.fillStyle = "rgba(10,11,16,0.85)";
        else g.fillStyle = r >= 0 && m.rooms[r].kind === "boveda" ? "rgba(120,80,170,0.9)" : "rgba(60,66,86,0.9)";
        g.fillRect(x, y, 1, 1);
      }
    }
    m.exits.forEach((e, i) => {
      g.fillStyle = teams ? (i < 2 ? TEAM_COLOR.red : TEAM_COLOR.blue) : "#FFD400";
      g.fillRect(e.x, e.y, 2, 2);
    });
    return c;
  }

  /** The building (call with the context in cell units). */
  base() {
    this.ctx.drawImage(this.floor, 0, 0, this.map.w, this.map.h);
  }

  /** Lasers: on = a red beam; about to turn on = it flickers. */
  lasers(t: number) {
    const g = this.ctx;
    for (const l of this.map.lasers) {
      const on = laserOn(l, t);
      const soon = !on && laserSoon(l, t) < 0.5;
      g.lineCap = "round";
      if (on || (soon && Math.floor(t * 16) % 2 === 0)) {
        g.strokeStyle = on ? "rgba(255,60,80,0.35)" : "rgba(255,60,80,0.25)";
        g.lineWidth = on ? 0.26 : 0.1;
        g.beginPath();
        g.moveTo(l.x1, l.y1);
        g.lineTo(l.x2, l.y2);
        g.stroke();
        if (on) {
          g.strokeStyle = "#ff3d5a";
          g.lineWidth = 0.07;
          g.beginPath();
          g.moveTo(l.x1, l.y1);
          g.lineTo(l.x2, l.y2);
          g.stroke();
        }
      }
      for (const [x, y] of [
        [l.x1, l.y1],
        [l.x2, l.y2],
      ]) {
        g.fillStyle = "#1b1d26";
        g.beginPath();
        g.arc(x, y, 0.16, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = on ? "#ff3d5a" : "#5b2530";
        g.beginPath();
        g.arc(x, y, 0.08, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  private cone(x: number, y: number, a: number, range: number, half: number, fill: string) {
    const g = this.ctx;
    const n = 20;
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i <= n; i++) {
      const aa = a - half + (2 * half * i) / n;
      const d = rayLength(this.map, x, y, aa, range);
      g.lineTo(x + Math.cos(aa) * d, y + Math.sin(aa) * d);
    }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  }

  /** The light of every guard and camera (under everything that moves). */
  sight(t: number, alarm: boolean) {
    for (const c of this.map.cams) {
      this.cone(c.x, c.y, camAngle(c, t), CAM_RANGE, CAM_HALF, alarm ? "rgba(255,70,90,0.2)" : "rgba(255,90,110,0.13)");
    }
    for (const gd of this.map.guards) {
      const p = guardAt(gd, t);
      this.cone(p.x, p.y, p.a, GUARD_RANGE, GUARD_HALF, alarm ? "rgba(255,120,60,0.22)" : "rgba(255,220,90,0.16)");
    }
  }

  cams(t: number) {
    const g = this.ctx;
    for (const c of this.map.cams) {
      const a = camAngle(c, t);
      g.save();
      g.translate(c.x, c.y);
      g.rotate(a);
      g.fillStyle = "#cbd5e1";
      g.fillRect(-0.2, -0.13, 0.36, 0.26);
      g.fillStyle = INK;
      g.fillRect(0.14, -0.08, 0.12, 0.16);
      g.restore();
      g.fillStyle = Math.floor(t * 2) % 2 ? "#ff3d5a" : "#7f1d2d";
      g.beginPath();
      g.arc(c.x, c.y, 0.06, 0, Math.PI * 2);
      g.fill();
    }
  }

  guards(t: number) {
    for (const gd of this.map.guards) {
      const p = guardAt(gd, t);
      this.body(p.x, p.y, p.a, "#d7dce6", 0.74, t, "guard");
    }
  }

  /** A diamond; `fade` 0–1 while it appears. */
  gem(x: number, y: number, value: number, t: number, fade = 1, seed = 0) {
    const g = this.ctx;
    const big = value >= BIG_GEM;
    const s = (big ? 0.36 : 0.24) * (0.6 + 0.4 * fade);
    const bob = Math.sin(t * 2.4 + seed) * 0.04;
    g.globalAlpha = fade;
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath();
    g.ellipse(x, y + s * 0.95, s * 0.8, s * 0.25, 0, 0, Math.PI * 2);
    g.fill();
    const cy = y + bob;
    const main = big ? "#FF5FA2" : "#5ee7f7";
    const light = big ? "#ffc2dc" : "#d4fbff";
    const dark = big ? "#c2306f" : "#1aa7c0";
    g.fillStyle = main;
    g.beginPath();
    g.moveTo(x - s, cy - s * 0.25);
    g.lineTo(x - s * 0.5, cy - s * 0.75);
    g.lineTo(x + s * 0.5, cy - s * 0.75);
    g.lineTo(x + s, cy - s * 0.25);
    g.lineTo(x, cy + s);
    g.closePath();
    g.fill();
    g.fillStyle = light;
    g.beginPath();
    g.moveTo(x - s, cy - s * 0.25);
    g.lineTo(x - s * 0.5, cy - s * 0.75);
    g.lineTo(x, cy - s * 0.75);
    g.lineTo(x - s * 0.2, cy - s * 0.25);
    g.closePath();
    g.fill();
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(x + s * 0.2, cy - s * 0.25);
    g.lineTo(x + s, cy - s * 0.25);
    g.lineTo(x, cy + s);
    g.closePath();
    g.fill();
    // A twinkle now and then.
    const tw = Math.max(0, Math.sin(t * 1.7 + seed * 3.1) - 0.85) / 0.15;
    if (tw > 0) {
      g.strokeStyle = `rgba(255,255,255,${tw})`;
      g.lineWidth = 0.04;
      const sx = x + s * 0.4;
      const sy = cy - s * 0.6;
      const r = 0.16 * tw;
      g.beginPath();
      g.moveTo(sx - r, sy);
      g.lineTo(sx + r, sy);
      g.moveTo(sx, sy - r);
      g.lineTo(sx, sy + r);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  /** A talo seen from above: body, eyes toward `a`; guards wear a cap, thieves a mask. */
  private body(x: number, y: number, a: number, color: string, size: number, t: number, kind: "guard" | "thief", wobble = 0) {
    const g = this.ctx;
    const s = size;
    const lx = Math.cos(a);
    const ly = Math.sin(a);
    g.fillStyle = "rgba(0,0,0,0.32)";
    g.beginPath();
    g.ellipse(x, y + s * 0.42, s * 0.48, s * 0.18, 0, 0, Math.PI * 2);
    g.fill();
    const by = y - s * 0.08 + Math.sin(t * 9 + x) * wobble;
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(x - s / 2, by - s / 2, s, s, s * 0.32);
    g.fill();
    if (kind === "guard") {
      g.fillStyle = "#1e3a8a";
      g.beginPath();
      g.roundRect(x - s / 2, by - s / 2, s, s * 0.28, [s * 0.32, s * 0.32, 0, 0]);
      g.fill();
      g.fillStyle = "#FFD400";
      g.fillRect(x - s * 0.08, by - s * 0.45, s * 0.16, s * 0.12);
    }
    const ey = by - s * 0.02 + ly * s * 0.06;
    const ex = x + lx * s * 0.1;
    if (kind === "thief") {
      g.fillStyle = INK;
      g.beginPath();
      g.roundRect(x - s * 0.47, ey - s * 0.13, s * 0.94, s * 0.26, s * 0.12);
      g.fill();
    }
    const er = s * 0.12;
    for (const dx of [-1, 1]) {
      const cx = ex + dx * s * 0.17;
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(cx, ey, er, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = INK;
      g.beginPath();
      g.arc(cx + lx * er * 0.45, ey + ly * er * 0.45, er * 0.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  thief(v: ThiefView, t: number, z: number) {
    const g = this.ctx;
    const size = 0.66;
    const lx = v.x + Math.cos(v.a) * v.lunge * 0.35;
    const ly = v.y + Math.sin(v.a) * v.lunge * 0.35;
    g.globalAlpha = v.safe ? (Math.floor(t * 6) % 2 ? 0.45 : 0.8) : 1;
    if (v.team) {
      g.strokeStyle = TEAM_COLOR[v.team];
      g.lineWidth = 0.08;
      g.beginPath();
      g.ellipse(lx, ly + size * 0.36, size * 0.56, size * 0.22, 0, 0, Math.PI * 2);
      g.stroke();
    }
    if (v.me) {
      g.strokeStyle = "rgba(255,255,255,0.85)";
      g.lineWidth = 0.05;
      g.beginPath();
      g.arc(lx, ly, size * 0.82, 0, Math.PI * 2);
      g.stroke();
    }
    // The sack, behind: bigger with more inside.
    if (v.bag > 0) {
      const r = 0.15 + Math.min(0.14, v.bag * 0.014);
      const bx = lx - Math.cos(v.a) * size * 0.5;
      const by = ly - Math.sin(v.a) * size * 0.5;
      g.fillStyle = "#b07a3c";
      g.beginPath();
      g.arc(bx, by, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#7a5124";
      g.fillRect(bx - r * 0.35, by - r - 0.04, r * 0.7, 0.08);
    }
    this.body(lx, ly, v.a, v.color, size, t, "thief", v.cuffed ? 0 : 0.015);
    g.globalAlpha = 1;
    if (v.cuffed) {
      // Handcuffed: stars around the head.
      for (let i = 0; i < 3; i++) {
        const aa = t * 3 + (i * Math.PI * 2) / 3;
        star(g, lx + Math.cos(aa) * 0.45, ly - 0.5 + Math.sin(aa) * 0.12, 0.09, "#FFD400");
      }
    }
    // Name and bag over the head.
    const fs = Math.max(0.26, 11 / z);
    g.font = `bold ${fs}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "bottom";
    const label = v.me ? "" : v.name;
    const bagText = v.bag > 0 ? ` ◆${v.bag}` : "";
    const text = `${label}${bagText}`.trim();
    if (text) {
      const tw = g.measureText(text).width;
      g.fillStyle = "rgba(10,10,14,0.65)";
      g.beginPath();
      g.roundRect(lx - tw / 2 - fs * 0.35, ly - size * 0.62 - fs * 1.15, tw + fs * 0.7, fs * 1.2, fs * 0.3);
      g.fill();
      g.fillStyle = v.team ? TEAM_COLOR[v.team] : "#fff";
      g.fillText(text, lx, ly - size * 0.62 - fs * 0.05);
    }
    if (v.me && v.alert > 0.02) {
      // The alert over my head: a "!" that fills up.
      const w = 0.9;
      g.fillStyle = "rgba(10,10,14,0.7)";
      g.fillRect(lx - w / 2, ly - size - 0.32, w, 0.14);
      g.fillStyle = v.alert > 0.66 ? "#ff3d5a" : "#FFD400";
      g.fillRect(lx - w / 2, ly - size - 0.32, w * v.alert, 0.14);
    }
  }

  /** "+3", "-2"… floating up. */
  popup(x: number, y: number, text: string, color: string, life: number, z: number) {
    const g = this.ctx;
    const fs = Math.max(0.4, 16 / z);
    g.globalAlpha = Math.min(1, life * 1.5);
    g.font = `bold ${fs}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = fs * 0.18;
    g.strokeStyle = "rgba(0,0,0,0.7)";
    const yy = y - 0.8 - (1 - life) * 0.9;
    g.strokeText(text, x, yy);
    g.fillStyle = color;
    g.fillText(text, x, yy);
    g.globalAlpha = 1;
  }

  /** The minimap, in screen pixels. */
  minimap(x: number, y: number, size: number, dots: { x: number; y: number; color: string; me: boolean }[], view: { x: number; y: number; w: number; h: number }, alpha = 1) {
    const g = this.ctx;
    const m = this.map;
    const k = size / Math.max(m.w, m.h);
    g.globalAlpha = 0.92 * alpha;
    g.drawImage(this.mini, x, y, m.w * k, m.h * k);
    g.globalAlpha = alpha;
    g.strokeStyle = "rgba(255,255,255,0.5)";
    g.lineWidth = 1;
    g.strokeRect(x + (view.x - view.w / 2) * k, y + (view.y - view.h / 2) * k, view.w * k, view.h * k);
    for (const d of dots) {
      g.fillStyle = d.color;
      g.beginPath();
      g.arc(x + d.x * k, y + d.y * k, d.me ? 3.2 : 2.4, 0, Math.PI * 2);
      g.fill();
      if (d.me) {
        g.strokeStyle = "#fff";
        g.lineWidth = 1.2;
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}
