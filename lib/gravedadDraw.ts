import { DIR_ANGLE, DIR_VEC, HALF, TILE, moverAt, tileAt, type Dir, type Level, type Runner } from "./gravedadSim";

/**
 * Gravedad Loca's drawing, flat on a 2D canvas. The level's still parts are
 * painted once into an offscreen canvas; each frame turns the camera so the
 * followed runner's gravity points down, then draws platforms, crumbling
 * blocks, the ghosts and the runner (talos: a rounded square with eyes, feet
 * toward their own gravity).
 */

const PX = 48;
const C = {
  bg: "#111111",
  void: "#0a0a0a",
  dot: "rgba(255,255,255,0.06)",
  wall: "#2b2d33",
  wallEdge: "#3d4049",
  spike: "#FF3B30",
  goal: "#FFD400",
  grav: "#2E6BFF",
  crumble: "#9a6b43",
  crumbleLine: "#5d3f25",
  mover: "#00B26B",
  moverDark: "#00824e",
  cp: "#9aa0aa",
  cpOn: "#00B26B",
};

export interface Ghost {
  id: string;
  x: number;
  y: number;
  g: Dir;
  face: -1 | 1;
  dead: boolean;
  color: string;
  name: string;
}

export interface Camera {
  x: number;
  y: number;
  angle: number;
  /** Pixels per tile. */
  scale: number;
}

function arrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, d: Dir, size: number) {
  const [dx, dy] = DIR_VEC[d];
  const px = -dy;
  const py = dx;
  ctx.beginPath();
  ctx.moveTo(cx + dx * size, cy + dy * size);
  ctx.lineTo(cx - dx * size * 0.2 + px * size * 0.75, cy - dy * size * 0.2 + py * size * 0.75);
  ctx.lineTo(cx - dx * size * 0.2 - px * size * 0.75, cy - dy * size * 0.2 - py * size * 0.75);
  ctx.closePath();
  ctx.fill();
}

/** Which side a spike tile hangs from: the first wall around it. */
function spikeBase(lv: Level, x: number, y: number): Dir | -1 {
  for (const d of [0, 2, 1, 3] as Dir[]) {
    const [dx, dy] = DIR_VEC[d];
    if (tileAt(lv, x + dx, y + dy) === TILE.wall) return d;
  }
  return -1;
}

function paintStatic(lv: Level): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = lv.w * PX;
  cv.height = lv.h * PX;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = C.dot;
  for (let y = 0; y <= lv.h; y++) for (let x = 0; x <= lv.w; x++) ctx.fillRect(x * PX - 1.5, y * PX - 1.5, 3, 3);
  for (let y = 0; y < lv.h; y++) {
    for (let x = 0; x < lv.w; x++) {
      const ch = lv.rows[y][x];
      const X = x * PX;
      const Y = y * PX;
      if (ch === TILE.wall) {
        ctx.fillStyle = C.wall;
        ctx.fillRect(X, Y, PX, PX);
        // A lighter edge where the wall meets the air: easier to read the shapes.
        ctx.fillStyle = C.wallEdge;
        const air = (dx: number, dy: number) => tileAt(lv, x + dx, y + dy) !== TILE.wall;
        if (air(0, -1)) ctx.fillRect(X, Y, PX, 5);
        if (air(0, 1)) ctx.fillRect(X, Y + PX - 5, PX, 5);
        if (air(-1, 0)) ctx.fillRect(X, Y, 5, PX);
        if (air(1, 0)) ctx.fillRect(X + PX - 5, Y, 5, PX);
      } else if (ch === TILE.spike) {
        ctx.fillStyle = C.spike;
        const base = spikeBase(lv, x, y);
        const d: Dir = base === -1 ? 0 : base;
        const [bx, by] = DIR_VEC[d];
        // Three teeth along the base side, pointing away from it.
        for (let k = 0; k < 3; k++) {
          const along = (k + 0.5) / 3;
          const sx = bx !== 0 ? X + (bx > 0 ? PX : 0) : X + along * PX;
          const sy = by !== 0 ? Y + (by > 0 ? PX : 0) : Y + along * PX;
          const w = PX / 6;
          ctx.beginPath();
          if (by !== 0) {
            ctx.moveTo(sx - w, sy);
            ctx.lineTo(sx + w, sy);
            ctx.lineTo(sx, sy - by * PX * 0.7);
          } else {
            ctx.moveTo(sx, sy - w);
            ctx.lineTo(sx, sy + w);
            ctx.lineTo(sx - bx * PX * 0.7, sy);
          }
          ctx.closePath();
          ctx.fill();
        }
      } else if (ch === TILE.goal) {
        // A checkered flag.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(X + PX * 0.2, Y + PX * 0.1, 4, PX * 0.85);
        const s = PX * 0.14;
        for (let r = 0; r < 3; r++)
          for (let c = 0; c < 4; c++) {
            ctx.fillStyle = (r + c) % 2 ? C.goal : C.bg;
            ctx.fillRect(X + PX * 0.2 + 4 + c * s, Y + PX * 0.12 + r * s, s, s);
          }
      } else if ("dlur".includes(ch) && ch !== ".") {
        const d = ({ d: 0, l: 1, u: 2, r: 3 } as Record<string, Dir>)[ch];
        ctx.fillStyle = "rgba(46,107,255,0.22)";
        ctx.fillRect(X + 2, Y + 2, PX - 4, PX - 4);
        ctx.fillStyle = C.grav;
        arrow(ctx, X + PX / 2, Y + PX / 2, d, PX * 0.3);
      }
    }
  }
  return cv;
}

export class Painter {
  private still: HTMLCanvasElement;
  constructor(private lv: Level) {
    this.still = paintStatic(lv);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    dpr: number,
    cam: Camera,
    t: number,
    me: { r: Runner; color: string } | null,
    ghosts: Ghost[]
  ) {
    const lv = this.lv;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.void;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(cam.angle);
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(-cam.x, -cam.y);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.still, 0, 0, lv.w, lv.h);

    // Checkpoints (lit when it's mine).
    for (let y = 0; y < lv.h; y++)
      for (let x = 0; x < lv.w; x++) {
        if (lv.rows[y][x] !== TILE.checkpoint) continue;
        const on = !!me && me.r.cp.x === x + 0.5 && me.r.cp.y === y + 0.5;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x + 0.45, y + 0.12, 0.07, 0.8);
        ctx.fillStyle = on ? C.cpOn : C.cp;
        ctx.beginPath();
        ctx.moveTo(x + 0.52, y + 0.12);
        ctx.lineTo(x + 0.9, y + 0.27);
        ctx.lineTo(x + 0.52, y + 0.42);
        ctx.fill();
      }

    // Crumbling blocks, as I see them.
    for (const idx of lv.crumbles) {
      const x = idx % lv.w;
      const y = (idx - x) / lv.w;
      const at = me?.r.crumble[idx];
      const since = at === undefined || at < 0 ? -1 : t - at;
      const gone = since >= 0.45 && since < 0.45 + 3;
      if (gone) {
        ctx.strokeStyle = "rgba(154,107,67,0.35)";
        ctx.lineWidth = 0.04;
        ctx.strokeRect(x + 0.08, y + 0.08, 0.84, 0.84);
        continue;
      }
      const shake = since >= 0 && since < 0.45 ? Math.sin(t * 90) * 0.04 : 0;
      ctx.fillStyle = C.crumble;
      ctx.fillRect(x + 0.03 + shake, y + 0.03, 0.94, 0.94);
      ctx.strokeStyle = C.crumbleLine;
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(x + 0.2 + shake, y + 0.3);
      ctx.lineTo(x + 0.45 + shake, y + 0.55);
      ctx.lineTo(x + 0.4 + shake, y + 0.85);
      ctx.moveTo(x + 0.45 + shake, y + 0.55);
      ctx.lineTo(x + 0.8 + shake, y + 0.45);
      ctx.stroke();
    }

    // Moving platforms.
    for (const m of lv.movers ?? []) {
      const p = moverAt(m, t);
      ctx.fillStyle = C.mover;
      ctx.fillRect(p.x, p.y, m.w, m.h);
      ctx.fillStyle = C.moverDark;
      for (let k = 0.25; k < m.w; k += 0.5) ctx.fillRect(p.x + k, p.y + m.h * 0.35, 0.18, m.h * 0.3);
    }

    for (const gh of ghosts) drawTalo(ctx, gh.x, gh.y, gh.g, gh.face, gh.color, gh.dead ? 0.15 : 0.5, t);
    if (me) drawTalo(ctx, me.r.x, me.r.y, me.r.g, me.r.face, me.color, me.r.dead > 0 ? 0.25 : 1, t, me.r.charge);
    ctx.restore();

    // Ghosts' names, upright on screen.
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    const cos = Math.cos(cam.angle);
    const sin = Math.sin(cam.angle);
    for (const gh of ghosts) {
      const dx = gh.x - cam.x;
      const dy = gh.y - cam.y;
      const sx = w / 2 + (dx * cos - dy * sin) * cam.scale;
      const sy = h / 2 + (dx * sin + dy * cos) * cam.scale - cam.scale * 0.7;
      if (sx < -40 || sy < -20 || sx > w + 40 || sy > h + 20) continue;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      const tw = ctx.measureText(gh.name).width + 10;
      ctx.fillRect(sx - tw / 2, sy - 13, tw, 17);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(gh.name, sx, sy);
    }
  }
}

/** A talo: rounded square in the player's color, eyes looking where it walks, feet toward its gravity. */
function drawTalo(ctx: CanvasRenderingContext2D, x: number, y: number, g: Dir, face: -1 | 1, color: string, alpha: number, t: number, charged?: boolean) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(-DIR_ANGLE[g]);
  const s = HALF;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-s, -s, s * 2, s * 2, s * 0.55);
  ctx.fill();
  // The gravity charge: a small yellow dot on top while it's available.
  if (charged) {
    ctx.fillStyle = "#FFD400";
    ctx.beginPath();
    ctx.arc(0, -s - 0.12, 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  const blink = Math.floor(t * 10) % 37 === 0;
  for (const ex of [-0.13, 0.13]) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(ex + face * 0.06, -0.06, 0.1, blink ? 0.02 : 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!blink) {
      ctx.fillStyle = "#111111";
      ctx.beginPath();
      ctx.arc(ex + face * 0.1, -0.05, 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
