import { mulberry32 } from "./random";

/**
 * Pastelería: a solo cake-making game. Customers order a cake (shape, sponge,
 * layers, filling, frosting, decorations); the player builds it and delivers
 * it. Everything here is pure (no DOM, no Firebase): the options, the levels,
 * the order generator, the validation and the scoring, plus `reduce`, the
 * whole game as a state machine the page drives (and tests can run).
 *
 * Levels unlock options gradually (`LEVELS`); adding one is adding an entry.
 */

// ---- Options ---------------------------------------------------------------

export type Shape = "redonda" | "cuadrada";
export type Flavor = "vainilla" | "chocolate" | "fresa";
export type Frosting = "rosa" | "celeste" | "lavanda" | "chocolate" | "crema";
export type Decoration = "chispas" | "cerezas" | "estrellas" | "flores" | "velas";

export interface OptionInfo {
  label: string;
  /** Main color (for the 3D model, the swatches and the 2D cake). */
  color: string;
}

export const SHAPES: Record<Shape, OptionInfo> = {
  redonda: { label: "Redonda", color: "#f9a8d4" },
  cuadrada: { label: "Cuadrada", color: "#93c5fd" },
};

export const SPONGES: Record<Flavor, OptionInfo> = {
  vainilla: { label: "Vainilla", color: "#f6d79a" },
  chocolate: { label: "Chocolate", color: "#8a5a3c" },
  fresa: { label: "Fresa", color: "#f4a6b8" },
};

export const FILLINGS: Record<Flavor, OptionInfo> = {
  vainilla: { label: "Crema de vainilla", color: "#fff4d6" },
  chocolate: { label: "Chocolate", color: "#5b3420" },
  fresa: { label: "Fresa", color: "#e8436b" },
};

export const FROSTINGS: Record<Frosting, OptionInfo> = {
  rosa: { label: "Rosa", color: "#f9a8d4" },
  celeste: { label: "Celeste", color: "#9fd8f5" },
  lavanda: { label: "Lavanda", color: "#c4b5fd" },
  chocolate: { label: "Chocolate", color: "#6b3f26" },
  crema: { label: "Blanco crema", color: "#fff8e7" },
};

export const DECORATIONS: Record<Decoration, OptionInfo & { emoji: string }> = {
  chispas: { label: "Chispas de colores", color: "#f472b6", emoji: "🌈" },
  cerezas: { label: "Cerezas", color: "#dc2626", emoji: "🍒" },
  estrellas: { label: "Estrellas", color: "#facc15", emoji: "⭐" },
  flores: { label: "Flores de azúcar", color: "#a78bfa", emoji: "🌸" },
  velas: { label: "Velas", color: "#38bdf8", emoji: "🕯️" },
};

export const MAX_LAYERS = 3;

/** A cake: what the player is building or what a customer ordered. */
export interface Cake {
  shape: Shape | null;
  sponge: Flavor | null;
  layers: number;
  /** Only with 2+ layers (it goes between them). */
  filling: Flavor | null;
  frosting: Frosting | null;
  decorations: Decoration[];
}

export const EMPTY_CAKE: Cake = { shape: null, sponge: null, layers: 1, filling: null, frosting: null, decorations: [] };

/** What a customer wants: every step chosen (the filling only with 2+ layers). */
export interface Order {
  shape: Shape;
  sponge: Flavor;
  layers: number;
  filling: Flavor | null;
  frosting: Frosting;
  decorations: Decoration[];
}

// ---- Levels ----------------------------------------------------------------

export interface Level {
  name: string;
  /** Short line under the level name. */
  hint: string;
  orders: number;
  shapes: Shape[];
  sponges: Flavor[];
  layers: number[];
  fillings: Flavor[];
  frostings: Frosting[];
  decorations: Decoration[];
  /** Decorations per order. */
  decorationCount: number;
  /** Seconds per order; 0 = no clock. */
  seconds: number;
}

const ALL_FLAVORS: Flavor[] = ["vainilla", "chocolate", "fresa"];

export const LEVELS: Level[] = [
  {
    name: "Aprendiz",
    hint: "Tortas de un piso, sin apuro.",
    orders: 4,
    shapes: ["redonda"],
    sponges: ["vainilla", "chocolate"],
    layers: [1],
    fillings: [],
    frostings: ["rosa", "celeste", "crema"],
    decorations: ["chispas", "cerezas", "velas"],
    decorationCount: 1,
    seconds: 0,
  },
  {
    name: "Pastelero",
    hint: "Dos pisos con relleno, más sabores y formas.",
    orders: 4,
    shapes: ["redonda", "cuadrada"],
    sponges: ALL_FLAVORS,
    layers: [1, 2],
    fillings: ALL_FLAVORS,
    frostings: ["rosa", "celeste", "lavanda", "chocolate", "crema"],
    decorations: ["chispas", "cerezas", "estrellas", "flores", "velas"],
    decorationCount: 1,
    seconds: 0,
  },
  {
    name: "Maestro",
    hint: "Hasta tres pisos, dos decoraciones y reloj.",
    orders: 4,
    shapes: ["redonda", "cuadrada"],
    sponges: ALL_FLAVORS,
    layers: [2, 3],
    fillings: ALL_FLAVORS,
    frostings: ["rosa", "celeste", "lavanda", "chocolate", "crema"],
    decorations: ["chispas", "cerezas", "estrellas", "flores", "velas"],
    decorationCount: 2,
    seconds: 75,
  },
];

/** Options shown for a level: the ones its orders can use. */
export function levelOptions(level: Level) {
  return {
    shapes: level.shapes,
    sponges: level.sponges,
    layers: Array.from({ length: Math.max(...level.layers) }, (_, i) => i + 1),
    fillings: level.fillings,
    frostings: level.frostings,
    decorations: level.decorations,
  };
}

// ---- Customers -------------------------------------------------------------

export interface Customer {
  name: string;
  body: string;
  accent: string;
  accessory: "moño" | "anteojos" | "gorro" | "corona" | "antenas" | "flor";
}

export const CUSTOMERS: Customer[] = [
  { name: "Pipa", body: "#fda4af", accent: "#be185d", accessory: "moño" },
  { name: "Bruno", body: "#93c5fd", accent: "#1d4ed8", accessory: "anteojos" },
  { name: "Lula", body: "#c4b5fd", accent: "#6d28d9", accessory: "flor" },
  { name: "Tito", body: "#fde68a", accent: "#b45309", accessory: "gorro" },
  { name: "Mora", body: "#86efac", accent: "#15803d", accessory: "antenas" },
  { name: "Nube", body: "#e0f2fe", accent: "#0369a1", accessory: "corona" },
  { name: "Coco", body: "#fdba74", accent: "#c2410c", accessory: "anteojos" },
  { name: "Miel", body: "#fef08a", accent: "#a16207", accessory: "moño" },
];

const OCCASIONS = [
  "para el cumple de mi abuela",
  "para festejar con amigos",
  "para una merienda especial",
  "para sorprender a mi hermana",
  "porque hoy es un gran día",
  "para la fiesta del barrio",
  "para mi mascota (es su cumple)",
  "para compartir en la oficina",
];

export interface OrderTicket {
  order: Order;
  customer: Customer;
  occasion: string;
}

// ---- Orders ----------------------------------------------------------------

const pick = <T>(rand: () => number, items: readonly T[]): T => items[Math.floor(rand() * items.length)];

function pickSome<T>(rand: () => number, items: readonly T[], n: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

export const sameOrder = (a: Order, b: Order) => mismatches(a, b).length === 0;

/** A level's orders: each one possible with the level's options, no two in a row alike. */
export function makeOrders(level: Level, seed: number): OrderTicket[] {
  const rand = mulberry32(seed);
  const out: OrderTicket[] = [];
  const customers = pickSome(rand, CUSTOMERS, CUSTOMERS.length);
  while (out.length < level.orders) {
    const layers = pick(rand, level.layers);
    const order: Order = {
      shape: pick(rand, level.shapes),
      sponge: pick(rand, level.sponges),
      layers,
      filling: layers > 1 && level.fillings.length ? pick(rand, level.fillings) : null,
      frosting: pick(rand, level.frostings),
      decorations: pickSome(rand, level.decorations, Math.min(level.decorationCount, level.decorations.length)),
    };
    const prev = out[out.length - 1];
    if (prev && sameOrder(prev.order, order)) continue;
    out.push({ order, customer: customers[out.length % customers.length], occasion: pick(rand, OCCASIONS) });
  }
  return out;
}

// ---- Validation and scoring -------------------------------------------------

export type Field = "shape" | "sponge" | "layers" | "filling" | "frosting" | "decorations";

export const FIELD_LABEL: Record<Field, string> = {
  shape: "Forma",
  sponge: "Bizcocho",
  layers: "Pisos",
  filling: "Relleno",
  frosting: "Cobertura",
  decorations: "Decoración",
};

/** The fields of `cake` that don't match `order` (empty = perfect). */
export function mismatches(cake: Cake, order: Order): Field[] {
  const out: Field[] = [];
  if (cake.shape !== order.shape) out.push("shape");
  if (cake.sponge !== order.sponge) out.push("sponge");
  if (cake.layers !== order.layers) out.push("layers");
  if (order.layers > 1 && cake.filling !== order.filling) out.push("filling");
  if (cake.frosting !== order.frosting) out.push("frosting");
  const want = [...order.decorations].sort().join();
  const got = [...cake.decorations].sort().join();
  if (want !== got) out.push("decorations");
  return out;
}

/** What's still missing before the cake can be delivered (null = ready). */
export function missingStep(cake: Cake): Field | null {
  if (!cake.shape) return "shape";
  if (!cake.sponge) return "sponge";
  if (cake.layers > 1 && !cake.filling) return "filling";
  if (!cake.frosting) return "frosting";
  if (!cake.decorations.length) return "decorations";
  return null;
}

export const POINTS = {
  perfect: 100,
  /** Per order in a row right on the first try, after the first. */
  streakBonus: 25,
  maxStreakBonus: 100,
  /** Per second left on the clock. */
  perSecond: 2,
  /** Right on the second try. */
  fixed: 40,
};

export function orderPoints(attempt: number, streak: number, secondsLeft: number): number {
  if (attempt > 1) return POINTS.fixed;
  const bonus = Math.min(POINTS.maxStreakBonus, Math.max(0, streak - 1) * POINTS.streakBonus);
  return POINTS.perfect + bonus + Math.max(0, Math.ceil(secondsLeft)) * POINTS.perSecond;
}

/** Right orders (on either try) needed to pass a level. */
export const toPass = (level: Level) => Math.ceil(level.orders / 2);

/** 1–3 stars for a finished level, 0 if it wasn't passed. */
export function levelStars(level: Level, firstTry: number, right: number): number {
  if (right < toPass(level)) return 0;
  if (firstTry === level.orders) return 3;
  return right >= Math.ceil(level.orders * 0.75) ? 2 : 1;
}

// ---- The game --------------------------------------------------------------

export type Phase = "menu" | "playing" | "result" | "levelDone" | "gameOver";

export interface OrderResult {
  right: boolean;
  /** Fields wrong in the delivered cake. */
  wrong: Field[];
  points: number;
  timeout: boolean;
  /** The player may fix it and deliver again. */
  canRetry: boolean;
}

export interface LevelStats {
  firstTry: number;
  right: number;
  failed: number;
  points: number;
}

export interface GameState {
  phase: Phase;
  seed: number;
  level: number;
  tickets: OrderTicket[];
  orderNo: number;
  cake: Cake;
  attempt: number;
  /** Seconds left on this order's clock (levels with `seconds`). */
  timeLeft: number;
  score: number;
  streak: number;
  bestStreak: number;
  stats: LevelStats;
  /** Every level played so far (the current one last when it's done). */
  history: (LevelStats & { level: number; stars: number })[];
  result: OrderResult | null;
}

const NO_STATS: LevelStats = { firstTry: 0, right: 0, failed: 0, points: 0 };

export function initialGame(seed: number): GameState {
  return {
    phase: "menu",
    seed,
    level: 0,
    tickets: [],
    orderNo: 0,
    cake: EMPTY_CAKE,
    attempt: 1,
    timeLeft: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    stats: NO_STATS,
    history: [],
    result: null,
  };
}

/** A fresh cake for a level: steps with a single choice come already made. */
export function freshCake(level: Level): Cake {
  return {
    ...EMPTY_CAKE,
    shape: level.shapes.length === 1 ? level.shapes[0] : null,
    layers: Math.min(...level.layers),
  };
}

function startLevel(s: GameState, level: number): GameState {
  const lv = LEVELS[level];
  return {
    ...s,
    phase: "playing",
    level,
    tickets: makeOrders(lv, s.seed + level * 7919 + s.history.length * 104729),
    orderNo: 0,
    cake: freshCake(lv),
    attempt: 1,
    timeLeft: lv.seconds,
    stats: NO_STATS,
    result: null,
  };
}

export type Action =
  | { type: "start"; seed: number }
  | { type: "set"; field: "shape" | "sponge" | "filling" | "frosting"; value: string }
  | { type: "layers"; value: number }
  | { type: "decoration"; value: Decoration }
  | { type: "reset" }
  | { type: "deliver" }
  | { type: "tick"; seconds: number }
  | { type: "retry" }
  | { type: "next" }
  | { type: "nextLevel" }
  | { type: "repeatLevel" }
  | { type: "menu"; seed: number };

function judge(s: GameState, timeout: boolean): GameState {
  const lv = LEVELS[s.level];
  const order = s.tickets[s.orderNo].order;
  const wrong = mismatches(s.cake, order);
  const right = !timeout && wrong.length === 0;
  const canRetry = !right && !timeout && s.attempt === 1;
  if (right) {
    const streak = s.attempt === 1 ? s.streak + 1 : 0;
    const points = orderPoints(s.attempt, streak, lv.seconds ? s.timeLeft : 0);
    return {
      ...s,
      phase: "result",
      score: s.score + points,
      streak,
      bestStreak: Math.max(s.bestStreak, streak),
      stats: {
        firstTry: s.stats.firstTry + (s.attempt === 1 ? 1 : 0),
        right: s.stats.right + 1,
        failed: s.stats.failed,
        points: s.stats.points + points,
      },
      result: { right, wrong, points, timeout, canRetry: false },
    };
  }
  return {
    ...s,
    phase: "result",
    streak: 0,
    stats: canRetry ? s.stats : { ...s.stats, failed: s.stats.failed + 1 },
    result: { right, wrong, points: 0, timeout, canRetry },
  };
}

export function reduce(s: GameState, a: Action): GameState {
  const lv = LEVELS[s.level];
  const building = s.phase === "playing";
  switch (a.type) {
    case "start":
      return s.phase === "menu" ? startLevel({ ...s, seed: a.seed, score: 0, streak: 0, bestStreak: 0, history: [] }, 0) : s;
    case "set": {
      if (!building) return s;
      const allowed: Record<string, readonly string[]> = {
        shape: lv.shapes,
        sponge: lv.sponges,
        filling: s.cake.layers > 1 ? lv.fillings : [],
        frosting: lv.frostings,
      };
      if (!allowed[a.field].includes(a.value)) return s;
      return { ...s, cake: { ...s.cake, [a.field]: a.value } };
    }
    case "layers": {
      if (!building || a.value < 1 || a.value > Math.max(...lv.layers)) return s;
      return { ...s, cake: { ...s.cake, layers: a.value, filling: a.value > 1 ? s.cake.filling : null } };
    }
    case "decoration": {
      if (!building || !lv.decorations.includes(a.value)) return s;
      const has = s.cake.decorations.includes(a.value);
      if (!has && s.cake.decorations.length >= lv.decorationCount) {
        // Full: the new one replaces the oldest.
        return { ...s, cake: { ...s.cake, decorations: [...s.cake.decorations.slice(1), a.value] } };
      }
      return {
        ...s,
        cake: { ...s.cake, decorations: has ? s.cake.decorations.filter((d) => d !== a.value) : [...s.cake.decorations, a.value] },
      };
    }
    case "reset":
      return building ? { ...s, cake: freshCake(lv) } : s;
    case "deliver":
      return building && missingStep(s.cake) === null ? judge(s, false) : s;
    case "tick": {
      if (!building || !lv.seconds) return s;
      const timeLeft = Math.max(0, s.timeLeft - a.seconds);
      return timeLeft > 0 ? { ...s, timeLeft } : judge({ ...s, timeLeft: 0 }, true);
    }
    case "retry":
      // Fix the same cake (it stays as delivered).
      return s.phase === "result" && s.result?.canRetry ? { ...s, phase: "playing", attempt: 2, result: null } : s;
    case "next": {
      if (s.phase !== "result" || s.result?.canRetry === undefined) return s;
      // Skipping the retry counts the order as failed.
      const stats = s.result.canRetry ? { ...s.stats, failed: s.stats.failed + 1 } : s.stats;
      if (s.orderNo + 1 < s.tickets.length) {
        return { ...s, stats, phase: "playing", orderNo: s.orderNo + 1, cake: freshCake(lv), attempt: 1, timeLeft: lv.seconds, result: null };
      }
      const stars = levelStars(lv, stats.firstTry, stats.right);
      return { ...s, stats, phase: "levelDone", result: null, history: [...s.history, { ...stats, level: s.level, stars }] };
    }
    case "nextLevel": {
      if (s.phase !== "levelDone") return s;
      const passed = (s.history[s.history.length - 1]?.stars ?? 0) > 0;
      if (!passed) return s;
      return s.level + 1 < LEVELS.length ? startLevel(s, s.level + 1) : { ...s, phase: "gameOver" };
    }
    case "repeatLevel":
      return s.phase === "levelDone" || s.phase === "gameOver" ? startLevel(s, s.level) : s;
    case "menu":
      return initialGame(a.seed);
  }
}
