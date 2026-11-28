import { CAR_WIDTH, MAX_SPEED, frameAt, groundAt, intoZone, spinOutCar, type Car, type Track } from "./carrerasTrack";

/**
 * Carreras' power-ups (pure: the race runners and the scene use it). Boxes
 * across the road give a power after a short roulette; who's behind gets
 * better ones (keeps races close). Turbo (one or three), a shield, an oil
 * slick dropped behind and a rocket that chases the car ahead. Oil and
 * rockets are shared (lib/carreras.ts in «cada uno en su teléfono»; the big
 * screen keeps its own); whoever runs a car checks if they hit it.
 */

export type ItemId = "turbo" | "turbo3" | "escudo" | "aceite" | "cohete";

export const ITEMS: Record<ItemId, { label: string; color: string; uses: number }> = {
  turbo: { label: "Turbo", color: "#fb923c", uses: 1 },
  turbo3: { label: "Triple turbo", color: "#f97316", uses: 3 },
  escudo: { label: "Escudo", color: "#38bdf8", uses: 1 },
  aceite: { label: "Mancha de aceite", color: "#a855f7", uses: 1 },
  cohete: { label: "Cohete", color: "#ef4444", uses: 1 },
};

export const isItem = (id: string): id is ItemId => id in ITEMS;

/** The roulette's spin before a power can be used. */
export const ROLL_SECONDS = 1.1;
/** A box comes back this long after being driven through. */
export const BOX_RESPAWN = 2.5;
const BOX_REACH = 20;
/** The turbo's push and length. */
const TURBO_SECONDS = 1.1;
const TURBO_TOP = 1.16;
/** A shield's seconds. */
const SHIELD_SECONDS = 7;
/** Oil: how long it lies there and how close counts. */
export const SLICK_SECONDS = 25;
const SLICK_REACH = 20;
/** A rocket's speed along the track (a bit over a boosted car) and its longest flight. */
const ROCKET_SPEED = MAX_SPEED * 1.75;
export const ROCKET_SECONDS = 9;
/** Too close in height (a bridge over it) and nothing touches. */
const SAME_LEVEL = 16;

// ---- Boxes -----------------------------------------------------------------

export interface ItemBox {
  x: number;
  y: number;
  /** Height of the road there. */
  z: number;
}

const boxCache = new WeakMap<Track, ItemBox[]>();

/**
 * The track's boxes: rows of four across the road at three spots per lap
 * (moved forward off ramps and boost pads). Same on every screen.
 */
export function itemBoxes(track: Track): ItemBox[] {
  const known = boxCache.get(track);
  if (known) return known;
  const out: ItemBox[] = [];
  const width = track.def.width;
  for (const frac of [0.16, 0.48, 0.79]) {
    let s = track.length * frac;
    // Not on a ramp or a boost pad (nor right before a ramp's lip).
    for (let tries = 0; tries < 40; tries++) {
      const busy = [...track.ramps, ...track.boosts].some((z) => intoZone(track, z, s) < z.len + 60 || intoZone(track, z, s + 80) < z.len);
      if (!busy) break;
      s += 60;
    }
    const f = frameAt(track, s);
    for (let k = 0; k < 4; k++) {
      const lat = (k - 1.5) * Math.min(CAR_WIDTH * 2.2, width * 0.18);
      const x = f.x - f.dy * lat;
      const y = f.y + f.dx * lat;
      out.push({ x, y, z: groundAt(track, s, lat) });
    }
  }
  boxCache.set(track, out);
  return out;
}

/**
 * A power for a car in `place` of `racers`: the leader mostly gets defense,
 * the back of the pack turbos and rockets. Alone, anything but a rocket.
 */
export function rollItem(place: number, racers: number, rand = Math.random): ItemId {
  const table: [ItemId, number][] =
    racers <= 1
      ? [["turbo", 4], ["turbo3", 2], ["escudo", 2], ["aceite", 2]]
      : place <= 1
        ? [["aceite", 45], ["escudo", 35], ["turbo", 20]]
        : place >= racers
          ? [["turbo3", 40], ["cohete", 35], ["turbo", 20], ["escudo", 5]]
          : [["turbo", 30], ["cohete", 25], ["aceite", 20], ["escudo", 15], ["turbo3", 10]];
  const total = table.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total;
  for (const [id, w] of table) {
    r -= w;
    if (r < 0) return id;
  }
  return table[0][0];
}

/**
 * Boxes a car drives through: they pop (for `BOX_RESPAWN` on this screen,
 * `hidden` holds when each comes back) and, with its hands free, the car
 * gets a power behind the roulette. Returns whether it took one.
 */
export function takeBoxes(car: Car, boxes: ItemBox[], hidden: number[], now: number, place: number, racers: number): boolean {
  if (car.air > 0) return false;
  let took = false;
  for (let i = 0; i < boxes.length; i++) {
    if ((hidden[i] ?? 0) > now) continue;
    const b = boxes[i];
    if (Math.abs(b.z - car.z) > SAME_LEVEL || Math.hypot(b.x - car.x, b.y - car.y) > BOX_REACH) continue;
    hidden[i] = now + BOX_RESPAWN * 1000;
    if (!car.item && !took) {
      const id = rollItem(place, racers);
      car.item = id;
      car.itemN = ITEMS[id].uses;
      car.roll = ROLL_SECONDS;
      took = true;
    }
  }
  return took;
}

// ---- Using one -----------------------------------------------------------------

/** What using a power leaves in the world for the runner to share: oil behind, or a rocket. */
export type ItemAction = { kind: "aceite"; x: number; y: number; z: number } | { kind: "cohete" } | null;

/** Uses the held power (if the roulette is done): turbos and shields at once; oil and rockets come back to place. */
export function spendItem(car: Car): ItemAction {
  if (!isItem(car.item) || car.roll > 0 || car.spinOut > 0) return null;
  const id = car.item;
  car.itemN--;
  if (car.itemN <= 0) car.item = "";
  car.used++;
  if (id === "turbo" || id === "turbo3") {
    car.boost = Math.max(car.boost, TURBO_SECONDS);
    const fx = Math.cos(car.heading);
    const fy = Math.sin(car.heading);
    const kick = Math.max(0, MAX_SPEED * TURBO_TOP - (car.vx * fx + car.vy * fy));
    car.vx += fx * kick;
    car.vy += fy * kick;
    return null;
  }
  if (id === "escudo") {
    car.shield = SHIELD_SECONDS;
    return null;
  }
  if (id === "aceite") {
    const back = 28;
    return { kind: "aceite", x: car.x - Math.cos(car.heading) * back, y: car.y - Math.sin(car.heading) * back, z: car.ground };
  }
  return { kind: "cohete" };
}

// ---- Oil -----------------------------------------------------------------------

export interface Slick {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Server time it was dropped. */
  t: number;
}

/** Checks a car against the oil on the road; spins it on a fresh one (each slick gets each car once). */
export function hitSlicks(car: Car, slicks: Slick[], now: number, seen: Set<string>): boolean {
  if (car.air > 0) return false;
  for (const s of slicks) {
    if (seen.has(s.id) || now - s.t > SLICK_SECONDS * 1000) continue;
    if (Math.abs(s.z - car.z) > SAME_LEVEL || Math.hypot(s.x - car.x, s.y - car.y) > SLICK_REACH) continue;
    seen.add(s.id);
    spinOutCar(car);
    return true;
  }
  return false;
}

// ---- Rockets ----------------------------------------------------------------------

export interface Rocket {
  id: string;
  /** Who fired it and who it chases (seats). */
  by: string;
  target: string;
  /** Where it started (progress along the race) and when (server time). */
  p0: number;
  t0: number;
}

/** How far along the race a rocket is now. */
export const rocketProgress = (r: Rocket, now: number) => r.p0 + (ROCKET_SPEED * Math.max(0, now - r.t0)) / 1000;

/** Where to draw it: over the road, at its progress. */
export function rocketPose(track: Track, r: Rocket, now: number): { x: number; y: number; z: number; heading: number } {
  const f = frameAt(track, rocketProgress(r, now));
  return { x: f.x, y: f.y, z: f.h + 6, heading: Math.atan2(f.dy, f.dx) };
}

/** Still flying: not past its target nor too old. */
export function rocketAlive(r: Rocket, now: number, targetProgress: number | undefined): boolean {
  if (now - r.t0 > ROCKET_SECONDS * 1000) return false;
  return targetProgress === undefined || rocketProgress(r, now) < targetProgress;
}

/**
 * The car a rocket goes for: the one right ahead in the race (by progress),
 * or none for the leader.
 */
export function rocketTarget(me: string, progress: Record<string, number>): string | null {
  const mine = progress[me];
  let best: string | null = null;
  let gap = Infinity;
  for (const [k, p] of Object.entries(progress)) {
    if (k === me || p <= mine) continue;
    if (p - mine < gap) {
      gap = p - mine;
      best = k;
    }
  }
  return best;
}

/** Checks the rockets chasing `key`'s car: caught (its progress reached), it spins (or the shield takes it). Returns the ones that hit. */
export function hitRockets(key: string, car: Car, rockets: Rocket[], now: number, seen: Set<string>): Rocket[] {
  const hits: Rocket[] = [];
  for (const r of rockets) {
    if (r.target !== key || seen.has(r.id) || now - r.t0 > ROCKET_SECONDS * 1000) continue;
    if (rocketProgress(r, now) < car.progress) continue;
    seen.add(r.id);
    spinOutCar(car);
    hits.push(r);
  }
  return hits;
}

// ---- Bots ----------------------------------------------------------------------

/**
 * When a bot uses what it holds: turbos on a fairly straight bit, the shield
 * at once, oil with someone close behind, a rocket with a car ahead. A
 * little randomness so they don't all fire at the same instant.
 */
export function botUsesItem(car: Car, ctx: { behind: number; ahead: boolean; straight: boolean }, rand = Math.random): boolean {
  if (!isItem(car.item) || car.roll > 0 || car.spinOut > 0 || car.air > 0) return false;
  if (rand() > 0.08) return false;
  switch (car.item) {
    case "turbo":
    case "turbo3":
      return ctx.straight;
    case "escudo":
      return true;
    case "aceite":
      return ctx.behind < 160;
    case "cohete":
      return ctx.ahead;
  }
}
