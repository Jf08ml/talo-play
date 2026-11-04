/**
 * Ladrillazo's engine, pure (no Firebase, no DOM): a grid of cells, paddles,
 * balls and falling power-ups. Coordinates are in cells: x ∈ [0, COLS],
 * y ∈ [0, ROWS] growing downward; cell (c, r) covers [c, c+1] × [r, r+1].
 *
 * The same `Board` runs every mode: a solo level, each racer's own copy in
 * the race and the attack, and the shared field of the duel and the co-op
 * (where only the ball's current owner steps it, see `lib/ladrillazo.ts`).
 */

export const COLS = 21;
export const ROWS = 33;
/** Top face of a bottom paddle. */
export const BOTTOM_Y = ROWS - 2;
/** Bottom face of a top paddle (the duel's second player). */
export const TOP_Y = 2;
export const PADDLE_T = 0.6;
export const BALL_R = 0.32;
export const START_SPEED = 15;
export const MAX_SPEED = 24;
const SPEED_STEP = 0.25;
export const HW = 2.1;
export const LONG_HW = 3.3;
const LONG_SECONDS = 14;
const MAX_ANGLE = 1.1;
/** The ball never goes flatter than this share of its speed, vertically. */
const MIN_VY = 0.3;
/** Bricks reaching this row in the attack knock you out. */
export const DANGER_ROW = ROWS - 7;
const DROP_SPEED = 7;
export const AUTO_SERVE = 2.5;
const MAX_BALLS = 6;
const MAX_LIVES = 6;
const POINTER_SPEED = 90;
const KEY_SPEED = 26;

/**
 * Cells: `.` empty, `#` wall (unbreakable), `b` brick, `B` hard brick (two
 * hits), `o` target, `x` bomb (breaks the 3×3 around it), and bricks that
 * drop a power-up: `m` multiball, `l` long paddle, `v` extra life.
 */
export type Goal = "objetivos" | "limpiar" | "ninguno";

export const POINTS: Record<string, number> = { b: 10, B: 15, o: 50, x: 20, m: 10, l: 10, v: 10 };
const POWERS = "mlv";

export interface Paddle {
  id: string;
  x: number;
  hw: number;
  baseHw: number;
  /** 1 = at the bottom, −1 = at the top (duel). */
  side: 1 | -1;
  /** Lane the paddle moves in (co-op splits the width). */
  min: number;
  max: number;
  longUntil: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  /** Paddle it's resting on before the serve, or "". */
  stuck: string;
  stuckOff: number;
  serveAt: number;
  lastHit: string;
}

export interface Drop {
  x: number;
  y: number;
  kind: string;
  side: 1 | -1;
}

export interface PaddleInput {
  /** Where the pointer wants the paddle's center (null = no pointer). */
  targetX: number | null;
  /** Keys: −1 left, 1 right. */
  dir: number;
  launch: boolean;
  /** Top speed toward `targetX` (bots are slower than a finger). */
  maxSpeed?: number;
}

export interface Events {
  broke: { i: number; ch: string }[];
  paddle: number;
  wall: number;
  lost: { side: 1 | -1; owner: string }[];
  power: string[];
  booms: number[];
  /** Bricks broken between two paddle hits, at each paddle hit (the attack's combos). */
  combos: number[];
  served: number;
}

const noEvents = (): Events => ({ broke: [], paddle: 0, wall: 0, lost: [], power: [], booms: [], combos: [], served: 0 });

export interface BoardOptions {
  goal: Goal;
  lives: number;
  /** The top is open: a ball leaving it is lost (duel). */
  openTop?: boolean;
  powerups?: boolean;
  /** Lose a life and serve again when the last ball is lost (single-player boards). */
  selfServe?: boolean;
}

export const isSolid = (ch: string) => ch !== ".";
export const isBreakable = (ch: string) => ch !== "." && ch !== "#";

export function makePaddle(id: string, side: 1 | -1 = 1, lane: [number, number] = [0, COLS], hw = HW): Paddle {
  return { id, x: (lane[0] + lane[1]) / 2, hw, baseHw: hw, side, min: lane[0], max: lane[1], longUntil: 0 };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class Board {
  cells: string[];
  goal: Goal;
  lives: number;
  balls: Ball[] = [];
  drops: Drop[] = [];
  paddles: Paddle[];
  time = 0;
  score = 0;
  combo = 0;
  bestCombo = 0;
  paddleHits = 0;
  serves = 0;
  openTop: boolean;
  powerups: boolean;
  selfServe: boolean;
  ev: Events = noEvents();
  done = false;
  over = false;
  /** Breakable cells (or targets) at the start, for the progress bar. */
  total: number;
  left: number;

  constructor(cells: string, paddles: Paddle[], opts: BoardOptions) {
    this.cells = cells.padEnd(COLS * ROWS, ".").slice(0, COLS * ROWS).split("");
    this.paddles = paddles;
    this.goal = opts.goal;
    this.lives = opts.lives;
    this.openTop = !!opts.openTop;
    this.powerups = opts.powerups ?? true;
    this.selfServe = opts.selfServe ?? true;
    this.left = this.count();
    this.total = Math.max(1, this.left);
  }

  /** What still has to break: targets, or every breakable cell. */
  count(): number {
    let n = 0;
    for (const ch of this.cells) {
      if (this.goal === "objetivos" ? ch === "o" : isBreakable(ch)) n++;
    }
    return n;
  }

  progress(): number {
    return clamp(1 - this.left / this.total, 0, 1);
  }

  takeEvents(): Events {
    const ev = this.ev;
    this.ev = noEvents();
    return ev;
  }

  paddle(id: string): Paddle | undefined {
    return this.paddles.find((p) => p.id === id);
  }

  /** A ball resting on a paddle, launched on a tap or after `delay` seconds. */
  serve(paddleId: string, delay = AUTO_SERVE) {
    const p = this.paddle(paddleId) ?? this.paddles[0];
    if (!p) return;
    this.balls.push({
      x: p.x,
      y: p.side === 1 ? BOTTOM_Y - BALL_R : TOP_Y + BALL_R,
      vx: 0,
      vy: 0,
      speed: START_SPEED,
      stuck: p.id,
      stuckOff: (Math.random() - 0.5) * p.hw * 0.8,
      serveAt: this.time + delay,
      lastHit: p.id,
    });
    this.ev.served++;
    this.serves++;
  }

  step(dt: number, inputs: Record<string, PaddleInput | undefined>) {
    if (this.over) return;
    this.time += dt;

    for (const p of this.paddles) {
      if (p.longUntil && this.time > p.longUntil) {
        p.hw = p.baseHw;
        p.longUntil = 0;
      }
      const inp = inputs[p.id];
      if (!inp) continue;
      if (inp.targetX !== null) {
        const max = (inp.maxSpeed ?? POINTER_SPEED) * dt;
        p.x += clamp(inp.targetX - p.x, -max, max);
      } else if (inp.dir) {
        p.x += inp.dir * KEY_SPEED * dt;
      }
      p.x = clamp(p.x, p.min + p.hw, p.max - p.hw);
    }

    for (const b of this.balls) {
      if (!b.stuck) continue;
      const p = this.paddle(b.stuck);
      if (!p) {
        b.stuck = "";
        continue;
      }
      b.x = clamp(p.x + b.stuckOff, BALL_R, COLS - BALL_R);
      b.y = p.side === 1 ? BOTTOM_Y - BALL_R : TOP_Y + BALL_R;
      if (inputs[p.id]?.launch || this.time >= b.serveAt) this.launch(b, p);
    }

    const fastest = Math.max(1, ...this.balls.map((b) => (b.stuck ? 0 : b.speed)));
    const n = Math.max(1, Math.ceil((fastest * dt) / 0.2));
    const h = dt / n;
    for (let k = 0; k < n; k++) {
      for (const b of this.balls) if (!b.stuck) this.moveBall(b, h);
    }

    const lost = this.balls.filter((b) => b.y > ROWS + 1 || (this.openTop && b.y < -1));
    if (lost.length) {
      for (const b of lost) this.ev.lost.push({ side: b.y > ROWS / 2 ? 1 : -1, owner: b.lastHit });
      this.balls = this.balls.filter((b) => !lost.includes(b));
      if (this.selfServe && !this.balls.length && !this.done) {
        this.lives--;
        this.drops = [];
        if (this.lives > 0) this.serve(this.paddles[0].id);
        else this.over = true;
      }
    }

    for (const d of this.drops) d.y += d.side * DROP_SPEED * dt;
    this.drops = this.drops.filter((d) => {
      for (const p of this.paddles) {
        if (p.side !== d.side) continue;
        const y = p.side === 1 ? BOTTOM_Y : TOP_Y;
        if (Math.abs(d.y - y) < 0.6 && Math.abs(d.x - p.x) < p.hw + 0.5) {
          this.applyPower(d.kind, p);
          return false;
        }
      }
      return d.y > -1 && d.y < ROWS + 1;
    });
  }

  private launch(b: Ball, p: Paddle) {
    const off = clamp(b.stuckOff / p.hw, -1, 1) * 0.5 + (Math.random() - 0.5) * 0.2;
    b.stuck = "";
    b.vx = b.speed * Math.sin(off);
    b.vy = -p.side * b.speed * Math.cos(off);
  }

  private moveBall(b: Ball, h: number) {
    const R = BALL_R;
    b.x += b.vx * h;
    if (b.x < R) {
      b.x = R;
      b.vx = Math.abs(b.vx);
      this.ev.wall++;
    } else if (b.x > COLS - R) {
      b.x = COLS - R;
      b.vx = -Math.abs(b.vx);
      this.ev.wall++;
    }
    let hits = this.overlap(b);
    if (hits.length) {
      b.x -= b.vx * h;
      b.vx = -b.vx;
      this.hit(hits, b);
    }

    const prevY = b.y;
    b.y += b.vy * h;
    if (!this.openTop && b.y < R) {
      b.y = R;
      b.vy = Math.abs(b.vy);
      this.ev.wall++;
    }
    hits = this.overlap(b);
    if (hits.length) {
      b.y -= b.vy * h;
      b.vy = -b.vy;
      this.hit(hits, b);
    }

    for (const p of this.paddles) {
      if (Math.abs(b.x - p.x) > p.hw + R) continue;
      if (p.side === 1 && b.vy > 0 && prevY + R <= BOTTOM_Y + 0.05 && b.y + R >= BOTTOM_Y) {
        b.y = BOTTOM_Y - R;
        this.bounce(b, p);
      } else if (p.side === -1 && b.vy < 0 && prevY - R >= TOP_Y - 0.05 && b.y - R <= TOP_Y) {
        b.y = TOP_Y + R;
        this.bounce(b, p);
      }
    }
    this.keepAngle(b);
  }

  private bounce(b: Ball, p: Paddle) {
    const off = clamp((b.x - p.x) / (p.hw + BALL_R), -1, 1);
    const ang = off * MAX_ANGLE;
    b.speed = Math.min(MAX_SPEED, b.speed + SPEED_STEP);
    b.vx = b.speed * Math.sin(ang);
    b.vy = -p.side * b.speed * Math.cos(ang);
    b.lastHit = p.id;
    this.paddleHits++;
    this.ev.paddle++;
    this.ev.combos.push(this.combo);
    this.combo = 0;
  }

  private keepAngle(b: Ball) {
    const s = b.speed;
    if (Math.abs(b.vy) < MIN_VY * s) {
      b.vy = (b.vy < 0 ? -1 : 1) * MIN_VY * s;
      b.vx = (b.vx < 0 ? -1 : 1) * Math.sqrt(s * s - b.vy * b.vy);
    }
  }

  private overlap(b: Ball): number[] {
    const R = BALL_R;
    const out: number[] = [];
    const c0 = Math.max(0, Math.floor(b.x - R));
    const c1 = Math.min(COLS - 1, Math.floor(b.x + R));
    const r0 = Math.max(0, Math.floor(b.y - R));
    const r1 = Math.min(ROWS - 1, Math.floor(b.y + R));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * COLS + c;
        if (isSolid(this.cells[i])) out.push(i);
      }
    }
    return out;
  }

  private hit(indices: number[], b: Ball) {
    let broke = false;
    for (const i of indices) {
      const ch = this.cells[i];
      if (ch === "#") {
        this.ev.wall++;
        continue;
      }
      broke = true;
      if (ch === "B") {
        this.cells[i] = "b";
        this.score += 5;
        this.ev.broke.push({ i, ch: "B" });
        continue;
      }
      if (ch === "x") {
        this.explode(i, b);
        continue;
      }
      this.breakCell(i, b);
    }
    if (broke) this.left = this.count();
    if (!this.done && this.goal !== "ninguno" && this.left === 0) this.done = true;
  }

  private breakCell(i: number, b: Ball | null) {
    const ch = this.cells[i];
    this.cells[i] = ".";
    this.score += POINTS[ch] ?? 10;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.ev.broke.push({ i, ch });
    if (this.powerups && POWERS.includes(ch)) {
      const p = b ? this.paddle(b.lastHit) : undefined;
      this.drops.push({ x: (i % COLS) + 0.5, y: Math.floor(i / COLS) + 0.5, kind: ch, side: p?.side ?? 1 });
    }
  }

  private explode(i: number, b: Ball | null) {
    this.breakCell(i, b);
    this.ev.booms.push(i);
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const cc = c + dc;
        const rr = r + dr;
        if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) continue;
        const j = rr * COLS + cc;
        const ch = this.cells[j];
        if (!isBreakable(ch)) continue;
        if (ch === "x") this.explode(j, b);
        else this.breakCell(j, b);
      }
    }
  }

  private applyPower(kind: string, p: Paddle) {
    this.ev.power.push(kind);
    if (kind === "l") {
      p.hw = Math.max(p.baseHw, LONG_HW * (p.baseHw / HW));
      p.longUntil = this.time + LONG_SECONDS;
    } else if (kind === "v") {
      this.lives = Math.min(MAX_LIVES, this.lives + 1);
    } else if (kind === "m") {
      const flying = this.balls.filter((b) => !b.stuck);
      const extra: Ball[] = [];
      for (const b of flying) {
        for (const turn of [-0.4, 0.4]) {
          if (flying.length + extra.length >= MAX_BALLS) break;
          const cos = Math.cos(turn);
          const sin = Math.sin(turn);
          extra.push({ ...b, vx: b.vx * cos - b.vy * sin, vy: b.vx * sin + b.vy * cos });
        }
      }
      this.balls.push(...extra);
    }
  }

  // ---- The attack ----------------------------------------------------------

  /** Pushes rows in at the top; bricks reaching `DANGER_ROW` knock you out. */
  pushRows(rows: string[]) {
    const k = rows.length;
    if (!k) return;
    const next = rows.join("").padEnd(k * COLS, ".").split("");
    this.cells = [...next, ...this.cells.slice(0, (ROWS - k) * COLS)];
    for (let r = DANGER_ROW; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (isSolid(this.cells[r * COLS + c])) this.over = true;
      }
    }
    // A ball caught inside a brick that just came down breaks it free.
    for (const b of this.balls) {
      for (const i of this.overlap(b)) if (isBreakable(this.cells[i])) this.cells[i] = ".";
    }
    this.left = this.count();
  }

  /** The lowest row with a brick (−1 = empty), for the danger meter. */
  lowestRow(): number {
    for (let r = ROWS - 1; r >= 0; r--) {
      for (let c = 0; c < COLS; c++) if (isSolid(this.cells[r * COLS + c])) return r;
    }
    return -1;
  }

  // ---- Network -----------------------------------------------------------

  cellString(): string {
    return this.cells.join("");
  }
}

/** Balls as "x,y,x,y…" with one decimal, for the rivals' previews. */
export function encodeBalls(balls: Ball[]): string {
  return balls
    .slice(0, MAX_BALLS)
    .map((b) => `${b.x.toFixed(1)},${b.y.toFixed(1)}`)
    .join(",");
}

export function decodeBalls(s: string | undefined): { x: number; y: number }[] {
  if (!s) return [];
  const n = s.split(",").map(Number);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i], y: n[i + 1] });
  return out;
}

/** Where a ball crosses height `y`, bouncing off the side walls (bricks ignored). */
export function landingX(b: { x: number; y: number; vx: number; vy: number }, y: number): number {
  if (!b.vy) return b.x;
  const t = (y - b.y) / b.vy;
  if (t < 0) return b.x;
  const span = COLS - 2 * BALL_R;
  const period = 2 * span;
  const raw = b.x + b.vx * t - BALL_R;
  const u = ((raw % period) + period) % period;
  return BALL_R + (u <= span ? u : period - u);
}

// ---- Bots ----------------------------------------------------------------

export interface BotBrain {
  /** How far off-center it aims at the ball (re-rolled after each hit). */
  aim: number;
  hits: number;
  /** 0 easy … 1 hard. */
  skill: number;
  wait: number;
}

export function newBrain(skill: number): BotBrain {
  return { aim: 0, hits: -1, skill, wait: 0.4 + Math.random() };
}

/** The bot's hand: chases where the closest ball is going to land, a bit off. */
export function botInput(board: Board, paddleId: string, brain: BotBrain, dt: number): PaddleInput {
  const p = board.paddle(paddleId);
  if (!p) return { targetX: null, dir: 0, launch: false };
  // Re-rolled after each hit and each serve (a planned miss doesn't repeat).
  const turn = board.paddleHits + board.serves * 1000;
  if (brain.hits !== turn) {
    brain.hits = turn;
    const miss = Math.random() < 0.09 - brain.skill * 0.06;
    brain.aim = miss ? (Math.random() < 0.5 ? -1 : 1) * (p.hw + 0.8 + Math.random()) : (Math.random() - 0.5) * p.hw * 1.5;
  }
  const lineY = p.side === 1 ? BOTTOM_Y - BALL_R : TOP_Y + BALL_R;
  let best: Ball | null = null;
  let bestT = Infinity;
  for (const b of board.balls) {
    if (b.stuck) continue;
    const coming = p.side === 1 ? b.vy > 0 : b.vy < 0;
    if (!coming) continue;
    const t = (lineY - b.y) / b.vy;
    if (t >= 0 && t < bestT) {
      bestT = t;
      best = b;
    }
  }
  brain.wait -= dt;
  const launch = brain.wait <= 0 && board.balls.some((b) => b.stuck === paddleId);
  if (launch) brain.wait = 0.6 + Math.random();
  const free = board.balls.find((b) => !b.stuck);
  const goal = best ? landingX(best, lineY) + brain.aim : free ? free.x : (p.min + p.max) / 2;
  // Aims at the target only when there's a drop worth chasing and nothing coming.
  const drop = !best && board.drops.find((d) => d.side === p.side);
  return { targetX: drop ? drop.x : goal, dir: 0, launch, maxSpeed: 15 + brain.skill * 9 };
}

export const BOT_NAMES = [
  "Mati", "Sofi", "Nico", "Cami", "Juli", "Lucho", "Flor", "Tomi", "Agus", "Male", "Fede", "Rochi",
  "Santi", "Pili", "Facu", "Vicky", "Joaco", "Meli", "Gonza", "Lu", "Bauti", "Caro", "Leo", "Majo",
];
