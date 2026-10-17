import { BRIDGE_CLEARANCE, CAR_LENGTH, CAR_WIDTH, frameAt, type Track, type TrackTheme, type Zone } from "./carrerasTrack";

/** Plain-canvas drawings of the race: the top view and the minimap. */

export interface DrawCar {
  x: number;
  y: number;
  /** Height of the car and of the road under it. */
  z?: number;
  ground?: number;
  heading: number;
  color: string;
  label?: string;
  bump?: number;
}

/** Top view colors per theme: outside the world, ground stripes, curbs. */
const TOP_COLORS: Record<TrackTheme, { bg: string; ground: [string, string]; curb: string; road: string }> = {
  campo: { bg: "#0b2a18", ground: ["#14532d", "#166534"], curb: "#dc2626", road: "#3f3f46" },
  atardecer: { bg: "#1f1a12", ground: ["#3f5f2a", "#466a2e"], curb: "#e11d48", road: "#3f3b46" },
  desierto: { bg: "#3b2a14", ground: ["#c9a46a", "#c29c62"], curb: "#ea580c", road: "#45434a" },
  nieve: { bg: "#1e293b", ground: ["#e2e8f0", "#d5dde8"], curb: "#2563eb", road: "#40424c" },
  noche: { bg: "#020617", ground: ["#0f2a1a", "#11301d"], curb: "#b91c1c", road: "#2c2c35" },
};

/** Seen from above, height pushes shadows this way (per unit of height). */
const SHADOW_X = 0.35;
const SHADOW_Y = 0.5;

/** Stretches of the track (sample ranges, inclusive) where it runs over a lower part: drawn again on top. */
interface Layers {
  bridges: [number, number][];
  /** Stretches up on a hill, for their shadow and a lighter road. */
  raised: [number, number][];
}

const layersCache = new WeakMap<Track, Layers>();

function runs(n: number, test: (i: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const on = i < n && test(i);
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      out.push([Math.max(0, start - 1), Math.min(n - 1, i)]);
      start = -1;
    }
  }
  return out;
}

function layers(track: Track): Layers {
  const cached = layersCache.get(track);
  if (cached) return cached;
  const { xs, ys, hs, cum, length } = track;
  const n = xs.length;
  const reach = track.def.width + 40;
  const over = (i: number) => {
    if (hs[i] < BRIDGE_CLEARANCE / 2) return false;
    for (let j = 0; j < n; j += 2) {
      if (hs[j] > hs[i] - BRIDGE_CLEARANCE / 2) continue;
      let along = Math.abs(cum[j] - cum[i]);
      along = Math.min(along, length - along);
      if (along > reach * 2 && Math.hypot(xs[j] - xs[i], ys[j] - ys[i]) < reach) return true;
    }
    return false;
  };
  const result = { bridges: runs(n, over), raised: runs(n, (i) => hs[i] > 3) };
  layersCache.set(track, result);
  return result;
}

function tracePath(ctx: CanvasRenderingContext2D, track: Track, from = 0, to = -1, dx = 0, dy = 0) {
  const closed = to < 0;
  const last = closed ? track.xs.length - 1 : to;
  ctx.beginPath();
  for (let i = from; i <= last; i++) {
    const ox = dx * track.hs[i];
    const oy = dy * track.hs[i];
    if (i === from) ctx.moveTo(track.xs[i] + ox, track.ys[i] + oy);
    else ctx.lineTo(track.xs[i] + ox, track.ys[i] + oy);
  }
  if (closed) ctx.closePath();
}

/** Sizes the canvas to its box and fits the track's world in it; returns the context, or null. */
function fit(canvas: HTMLCanvasElement | null, track: Track, padding = 0): CanvasRenderingContext2D | null {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const cw = Math.round(canvas.clientWidth * dpr);
  const ch = Math.round(canvas.clientHeight * dpr);
  if (!cw || !ch) return null;
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const pw = track.worldW + padding * 2;
  const ph = track.worldH + padding * 2;
  const scale = Math.min(cw / pw, ch / ph);
  ctx.setTransform(scale, 0, 0, scale, (cw - pw * scale) / 2 + padding * scale, (ch - ph * scale) / 2 + padding * scale);
  return ctx;
}

/** The road (curbs, asphalt, lighter where it's higher, center dashes) over one stretch, or all of it. */
function drawRoad(ctx: CanvasRenderingContext2D, track: Track, colors: (typeof TOP_COLORS)[TrackTheme], from = 0, to = -1) {
  const w = track.def.width;
  ctx.lineJoin = "round";
  ctx.lineCap = to < 0 ? "round" : "butt";
  tracePath(ctx, track, from, to);
  ctx.lineWidth = w + 18;
  ctx.strokeStyle = "#f8fafc";
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.strokeStyle = colors.curb;
  ctx.setLineDash([22, 22]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = w;
  ctx.strokeStyle = colors.road;
  ctx.stroke();
  // Higher stretches catch more light.
  ctx.lineCap = "butt";
  const n = track.xs.length;
  const last = to < 0 ? n : to;
  for (let i = from; i < last; i += 4) {
    const h = track.hs[i];
    if (h < 3) continue;
    ctx.beginPath();
    ctx.moveTo(track.xs[i], track.ys[i]);
    for (let k = 1; k <= 4 && i + k <= last; k++) {
      const j = (i + k) % n;
      ctx.lineTo(track.xs[j], track.ys[j]);
    }
    ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.22, h / 500)})`;
    ctx.stroke();
  }
  ctx.lineCap = "round";
  tracePath(ctx, track, from, to);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(248,250,252,0.35)";
  ctx.setLineDash([26, 26]);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** The four corners of a zone on the road, plus where its lip (end) is. */
function zoneCorners(track: Track, zone: Zone): [number, number][] {
  const a = frameAt(track, zone.s0);
  const b = frameAt(track, zone.s0 + zone.len);
  const at = (f: ReturnType<typeof frameAt>, lat: number): [number, number] => [f.x - f.dy * lat, f.y + f.dx * lat];
  return [at(a, zone.lo), at(a, zone.hi), at(b, zone.hi), at(b, zone.lo)];
}

function polygon(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** Ramps (yellow and black, the drop marked dark) and boost pads (chevrons that pulse forward). */
function drawFeatures(ctx: CanvasRenderingContext2D, track: Track, time: number) {
  for (const r of track.ramps) {
    const c = zoneCorners(track, r);
    // Its shadow past the lip.
    const f = frameAt(track, r.s0 + r.len);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    polygon(ctx, [c[3], c[2], [c[2][0] + f.dx * 16, c[2][1] + f.dy * 16], [c[3][0] + f.dx * 16, c[3][1] + f.dy * 16]]);
    ctx.fill();
    const steps = 6;
    for (let k = 0; k < steps; k++) {
      const z: Zone = { ...r, s0: r.s0 + (r.len * k) / steps, len: r.len / steps };
      ctx.fillStyle = k % 2 ? "#1f2937" : "#facc15";
      polygon(ctx, zoneCorners(track, z));
      ctx.fill();
    }
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 3;
    polygon(ctx, c);
    ctx.stroke();
  }
  for (const b of track.boosts) {
    ctx.fillStyle = "rgba(249,115,22,0.45)";
    polygon(ctx, zoneCorners(track, b));
    ctx.fill();
    const arrows = 3;
    for (let k = 0; k < arrows; k++) {
      const t = (k + ((time * 2.2) % 1)) / arrows;
      const f = frameAt(track, b.s0 + b.len * (0.15 + t * 0.7));
      const mid = (b.lo + b.hi) / 2;
      const half = (b.hi - b.lo) * 0.38;
      const at = (along: number, lat: number): [number, number] => [f.x + f.dx * along - f.dy * lat, f.y + f.dy * along + f.dx * lat];
      ctx.beginPath();
      ctx.moveTo(...at(-8, mid - half));
      ctx.lineTo(...at(8, mid));
      ctx.lineTo(...at(-8, mid + half));
      ctx.strokeStyle = `rgba(253,224,71,${0.55 + 0.45 * Math.sin(t * Math.PI)})`;
      ctx.lineWidth = 6;
      ctx.lineJoin = "miter";
      ctx.stroke();
    }
  }
}

function drawCar(ctx: CanvasRenderingContext2D, car: DrawCar) {
  const lift = Math.max(0, (car.z ?? 0) - (car.ground ?? car.z ?? 0));
  // In the air: its shadow falls away from it and the car looks closer (bigger).
  if (lift > 1) {
    ctx.save();
    ctx.translate(car.x + lift * SHADOW_X, car.y + lift * SHADOW_Y);
    ctx.rotate(car.heading);
    ctx.fillStyle = `rgba(0,0,0,${0.4 / (1 + lift / 40)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, CAR_LENGTH / 2 + 2, CAR_WIDTH / 2 + 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const grow = 1 + Math.min(0.6, lift / 70);
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.heading);
  ctx.scale(grow, grow);
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.roundRect(-CAR_LENGTH / 2, -CAR_WIDTH / 2, CAR_LENGTH, CAR_WIDTH, 6);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "rgba(15,23,42,0.75)";
  ctx.fillRect(2, -CAR_WIDTH / 2 + 3, 8, CAR_WIDTH - 6);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(CAR_LENGTH / 2 - 3, -CAR_WIDTH / 2 + 2, 3, 4);
  ctx.fillRect(CAR_LENGTH / 2 - 3, CAR_WIDTH / 2 - 6, 3, 4);
  ctx.restore();

  if (car.bump && car.bump > 0) {
    ctx.fillStyle = "#fde047";
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 14 + Math.random() * 10;
      ctx.fillRect(car.x + Math.cos(a) * r, car.y + Math.sin(a) * r, 3, 3);
    }
  }

  if (car.label) {
    ctx.font = "600 16px system-ui, sans-serif";
    const tw = ctx.measureText(car.label).width;
    const top = car.y - 44 - (grow - 1) * 20;
    ctx.fillStyle = "rgba(2,6,23,0.7)";
    ctx.beginPath();
    ctx.roundRect(car.x - tw / 2 - 6, top, tw + 12, 22, 6);
    ctx.fill();
    ctx.fillStyle = car.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(car.label, car.x, top + 11);
  }
}

/** The whole race seen from above. */
export function drawTopView(canvas: HTMLCanvasElement | null, track: Track, cars: DrawCar[]) {
  const ctx = fit(canvas, track);
  if (!ctx || !canvas) return;
  const colors = TOP_COLORS[track.def.theme] ?? TOP_COLORS.campo;
  const { worldW, worldH } = track;
  const time = performance.now() / 1000;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  ctx.fillStyle = colors.ground[0];
  ctx.fillRect(0, 0, worldW, worldH);
  ctx.fillStyle = colors.ground[1];
  for (let x = 0; x < worldW; x += 120) ctx.fillRect(x, 0, 60, worldH);

  const w = track.def.width;
  const { bridges, raised } = layers(track);
  // Raised stretches cast a shadow on the ground.
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = w + 18;
  for (const [a, b] of raised) {
    tracePath(ctx, track, a, b, SHADOW_X, SHADOW_Y);
    ctx.stroke();
  }

  drawRoad(ctx, track, colors);
  drawFeatures(ctx, track, time);

  // Checkered start/finish line at the first sample.
  ctx.save();
  ctx.translate(track.xs[0], track.ys[0]);
  ctx.rotate(Math.atan2(track.ys[1] - track.ys[0], track.xs[1] - track.xs[0]));
  const sq = 9;
  for (let r = 0; r < Math.ceil(w / sq); r++) {
    for (let c = 0; c < 2; c++) {
      ctx.fillStyle = (r + c) % 2 ? "#0f172a" : "#f8fafc";
      ctx.fillRect(c * sq - sq, r * sq - w / 2, sq, sq);
    }
  }
  ctx.restore();

  // Cars down below go under the bridges; the ones up on them (or flying) over.
  const high = (c: DrawCar) => (c.z ?? 0) > BRIDGE_CLEARANCE / 2;
  for (const car of cars) if (!high(car)) drawCar(ctx, car);
  for (const [a, b] of bridges) {
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = w + 18;
    ctx.lineCap = "butt";
    tracePath(ctx, track, a, b, SHADOW_X * 0.4, SHADOW_Y * 0.4);
    ctx.stroke();
    drawRoad(ctx, track, colors, a, b);
  }
  for (const car of cars) if (high(car)) drawCar(ctx, car);
}

/** A small map of the track with a dot per car (on top of the 3D view). */
export function drawMinimap(canvas: HTMLCanvasElement | null, track: Track, cars: DrawCar[]) {
  const ctx = fit(canvas, track, 60);
  if (!ctx) return;
  ctx.lineJoin = "round";
  tracePath(ctx, track);
  ctx.lineWidth = track.def.width * 0.8;
  ctx.strokeStyle = "rgba(15,23,42,0.75)";
  ctx.stroke();
  ctx.lineWidth = 14;
  ctx.strokeStyle = "rgba(248,250,252,0.85)";
  ctx.stroke();
  const scale = track.worldW / 1600;
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.arc(track.xs[0], track.ys[0], 22 * scale, 0, Math.PI * 2);
  ctx.fill();
  for (const car of cars) {
    ctx.fillStyle = car.color;
    ctx.strokeStyle = "#020617";
    ctx.lineWidth = 10 * scale;
    ctx.beginPath();
    ctx.arc(car.x, car.y, 40 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
  }
}
