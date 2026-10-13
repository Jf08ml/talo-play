import { CAR_LENGTH, CAR_WIDTH, WORLD_H, WORLD_W, type Track } from "./carrerasTrack";

/** Plain-canvas drawings of the race: the top view and the minimap. */

export interface DrawCar {
  x: number;
  y: number;
  heading: number;
  color: string;
  label?: string;
  bump?: number;
}

function tracePath(ctx: CanvasRenderingContext2D, track: Track) {
  ctx.beginPath();
  ctx.moveTo(track.xs[0], track.ys[0]);
  for (let i = 1; i < track.xs.length; i++) ctx.lineTo(track.xs[i], track.ys[i]);
  ctx.closePath();
}

/** Sizes the canvas to its box and fits the world in it; returns the context, or null. */
function fit(canvas: HTMLCanvasElement | null, padding = 0): CanvasRenderingContext2D | null {
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
  const pw = WORLD_W + padding * 2;
  const ph = WORLD_H + padding * 2;
  const scale = Math.min(cw / pw, ch / ph);
  ctx.setTransform(scale, 0, 0, scale, (cw - pw * scale) / 2 + padding * scale, (ch - ph * scale) / 2 + padding * scale);
  return ctx;
}

/** The whole race seen from above. */
export function drawTopView(canvas: HTMLCanvasElement | null, track: Track, cars: DrawCar[]) {
  const ctx = fit(canvas);
  if (!ctx || !canvas) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#0b2a18";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  ctx.fillStyle = "#14532d";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.fillStyle = "#166534";
  for (let x = 0; x < WORLD_W; x += 120) ctx.fillRect(x, 0, 60, WORLD_H);

  const w = track.def.width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  tracePath(ctx, track);
  ctx.lineWidth = w + 18;
  ctx.strokeStyle = "#f8fafc";
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.strokeStyle = "#dc2626";
  ctx.setLineDash([22, 22]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = w;
  ctx.strokeStyle = "#3f3f46";
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(248,250,252,0.35)";
  ctx.setLineDash([26, 26]);
  ctx.stroke();
  ctx.setLineDash([]);

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

  for (const car of cars) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.heading);
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
      ctx.fillStyle = "rgba(2,6,23,0.7)";
      ctx.beginPath();
      ctx.roundRect(car.x - tw / 2 - 6, car.y - 44, tw + 12, 22, 6);
      ctx.fill();
      ctx.fillStyle = car.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(car.label, car.x, car.y - 33);
    }
  }
}

/** A small map of the track with a dot per car (on top of the 3D view). */
export function drawMinimap(canvas: HTMLCanvasElement | null, track: Track, cars: DrawCar[]) {
  const ctx = fit(canvas, 60);
  if (!ctx) return;
  ctx.lineJoin = "round";
  tracePath(ctx, track);
  ctx.lineWidth = track.def.width * 0.8;
  ctx.strokeStyle = "rgba(15,23,42,0.75)";
  ctx.stroke();
  ctx.lineWidth = 14;
  ctx.strokeStyle = "rgba(248,250,252,0.85)";
  ctx.stroke();
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.arc(track.xs[0], track.ys[0], 22, 0, Math.PI * 2);
  ctx.fill();
  for (const car of cars) {
    ctx.fillStyle = car.color;
    ctx.strokeStyle = "#020617";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(car.x, car.y, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
  }
}
