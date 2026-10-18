import { MAPS, solidBoxes, type Box, type MapDef, type MapId, type PickupKind, type Ramp, type Spawn } from "./fuegoMaps";

/**
 * Fuego cruzado, pure simulation (no Firebase, no three.js): the world's
 * geometry (floor, boxes, ramps), a soldier's movement, the weapons, hitscan
 * shots with headshots and a little aim assist, rockets and grenades, and the
 * bots (a waypoint graph built from each map, A* and a simple brain).
 *
 * Axes: x/z floor, y up. Yaw 0 looks toward -z; pitch > 0 looks up.
 */

// ---- Soldier ------------------------------------------------------------------------------

export const RADIUS = 0.4;
export const HEIGHT = 1.8;
export const EYE = 1.62;
/** Highest step walked up without jumping. */
export const STEP = 0.5;
export const GRAVITY = 18;
export const JUMP_SPEED = 6.6;
export const RUN_SPEED = 6.2;
export const MAX_HP = 100;
export const MAX_SHIELD = 100;
/** The shield starts recharging this long after the last damage, at this rate. */
export const SHIELD_DELAY_MS = 4000;
export const SHIELD_RATE = 45;
export const MEDKIT_HEAL = 100;
export const MAX_GRENADES = 4;

/** Body parts for hits, relative to the feet. */
const HEAD_Y = 1.6;
const HEAD_R = 0.24;
const BODY_TOP = 1.42;
const BODY_R = 0.42;

// ---- World ----------------------------------------------------------------------------------

export interface World {
  map: MapDef;
  boxes: Box[];
  ramps: Ramp[];
}

const worlds = new Map<MapId, World>();

export function worldOf(id: MapId): World {
  let w = worlds.get(id);
  if (!w) {
    const map = MAPS[id] ?? MAPS.bunker;
    w = { map, boxes: solidBoxes(map), ramps: map.ramps };
    worlds.set(id, w);
  }
  return w;
}

/** Height of a ramp's surface at (x, z), clamped to its footprint. */
export function rampHeight(rp: Ramp, x: number, z: number): number {
  const along =
    rp.up === "x+" ? (x - (rp.x - rp.w / 2)) / rp.w
    : rp.up === "x-" ? (rp.x + rp.w / 2 - x) / rp.w
    : rp.up === "z+" ? (z - (rp.z - rp.d / 2)) / rp.d
    : (rp.z + rp.d / 2 - z) / rp.d;
  return rp.y + rp.h * Math.max(0, Math.min(1, along));
}

const inside = (o: { x: number; z: number; w: number; d: number }, x: number, z: number, pad = 0) =>
  Math.abs(x - o.x) <= o.w / 2 + pad && Math.abs(z - o.z) <= o.d / 2 + pad;

/** The floor under (x, z) for feet at `feet`: the highest surface at most a step above them. */
export function groundAt(w: World, x: number, z: number, feet: number): number {
  let g = 0;
  for (const bx of w.boxes) {
    const top = bx.y + bx.h;
    if (top > g && top <= feet + STEP && inside(bx, x, z)) g = top;
  }
  for (const rp of w.ramps) {
    if (!inside(rp, x, z)) continue;
    const h = rampHeight(rp, x, z);
    if (h > g && h <= feet + STEP) g = h;
  }
  return g;
}

/** The highest surface under (x, z), whatever the height (for placing things). */
export function topAt(w: World, x: number, z: number): number {
  return groundAt(w, x, z, 1000);
}

/** Pushes a standing circle out of boxes and too-high ramp parts; returns the corrected position. */
function collide(w: World, x: number, z: number, feet: number): [number, number] {
  for (let pass = 0; pass < 2; pass++) {
    for (const bx of w.boxes) {
      if (bx.y + bx.h <= feet + STEP || bx.y >= feet + HEIGHT) continue;
      [x, z] = pushOut(bx, x, z);
    }
    for (const rp of w.ramps) {
      if (!inside(rp, x, z, RADIUS)) continue;
      const cx = Math.max(rp.x - rp.w / 2, Math.min(rp.x + rp.w / 2, x));
      const cz = Math.max(rp.z - rp.d / 2, Math.min(rp.z + rp.d / 2, z));
      if (rampHeight(rp, cx, cz) <= feet + STEP || rp.y >= feet + HEIGHT) continue;
      [x, z] = pushOut(rp, x, z);
    }
  }
  return [x, z];
}

function pushOut(o: { x: number; z: number; w: number; d: number }, x: number, z: number): [number, number] {
  const minX = o.x - o.w / 2;
  const maxX = o.x + o.w / 2;
  const minZ = o.z - o.d / 2;
  const maxZ = o.z + o.d / 2;
  const cx = Math.max(minX, Math.min(maxX, x));
  const cz = Math.max(minZ, Math.min(maxZ, z));
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > RADIUS * RADIUS) return [x, z];
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    return [cx + (dx / d) * RADIUS, cz + (dz / d) * RADIUS];
  }
  // Center inside: out by the nearest side.
  const outs = [x - minX, maxX - x, z - minZ, maxZ - z];
  const i = outs.indexOf(Math.min(...outs));
  if (i === 0) return [minX - RADIUS, z];
  if (i === 1) return [maxX + RADIUS, z];
  if (i === 2) return [x, minZ - RADIUS];
  return [x, maxZ + RADIUS];
}

/** A low ceiling over a jumping head (floating boxes): the head stops there. */
function ceilingAt(w: World, x: number, z: number, feet: number): number {
  let c = Infinity;
  for (const bx of w.boxes) {
    if (bx.y > feet + 0.1 && bx.y < c && inside(bx, x, z, RADIUS * 0.7)) c = bx.y;
  }
  return c;
}

export interface Ray {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
}

/** Distance along the ray to an axis-aligned box, or Infinity. */
function rayAabb(r: Ray, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, maxT: number): [number, number] {
  let t0 = 0;
  let t1 = maxT;
  const axis = (o: number, d: number, lo: number, hi: number) => {
    if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
    let a = (lo - o) / d;
    let b2 = (hi - o) / d;
    if (a > b2) [a, b2] = [b2, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b2);
    return t0 <= t1;
  };
  if (!axis(r.ox, r.dx, minX, maxX) || !axis(r.oy, r.dy, minY, maxY) || !axis(r.oz, r.dz, minZ, maxZ)) return [Infinity, Infinity];
  return [t0, t1];
}

/** Distance to the first solid thing (floor, boxes, ramps, walls) along a ray, up to maxT. */
export function rayWorld(w: World, r: Ray, maxT: number): number {
  let best = maxT;
  if (r.dy < 0) best = Math.min(best, -r.oy / r.dy);
  for (const bx of w.boxes) {
    const [t] = rayAabb(r, bx.x - bx.w / 2, bx.y, bx.z - bx.d / 2, bx.x + bx.w / 2, bx.y + bx.h, bx.z + bx.d / 2, best);
    if (t < best) best = t;
  }
  for (const rp of w.ramps) {
    const [t0, t1] = rayAabb(r, rp.x - rp.w / 2, rp.y, rp.z - rp.d / 2, rp.x + rp.w / 2, rp.y + rp.h, rp.z + rp.d / 2, best);
    if (t0 === Infinity) continue;
    // Below the slope = inside the ramp. Height minus surface is linear along the ray.
    const f = (t: number) => r.oy + r.dy * t - rampHeight(rp, r.ox + r.dx * t, r.oz + r.dz * t);
    const f0 = f(t0);
    const f1 = f(t1);
    if (f0 <= 1e-6) best = Math.min(best, t0);
    else if (f1 < 0) best = Math.min(best, t0 + (t1 - t0) * (f0 / (f0 - f1)));
  }
  return Math.max(0, best);
}

/** Nothing solid between two points. */
export function clearLine(w: World, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  return rayWorld(w, { ox: ax, oy: ay, oz: az, dx: dx / len, dy: dy / len, dz: dz / len }, len) >= len - 0.05;
}

export function lookDir(yaw: number, pitch: number): [number, number, number] {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}

// ---- Movement ---------------------------------------------------------------------------------

export interface SoldierInput {
  /** Strafe right (+) / forward (+), each −1…1. */
  mx: number;
  mz: number;
  yaw: number;
  pitch: number;
  jump: boolean;
  /** Slower while aiming down the sights. */
  aiming: boolean;
}

export class Soldier {
  x: number;
  y = 0;
  z: number;
  vx = 0;
  vy = 0;
  vz = 0;
  yaw: number;
  pitch = 0;
  onGround = true;
  /** Seconds since the last step on the floor (for walking animation). */
  walk = 0;
  /** Distance walked, for the step sounds. */
  stride = 0;
  landed = 0;

  constructor(x: number, z: number, yaw: number, w?: World) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    if (w) this.y = topAt(w, x, z);
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  step(input: SoldierInput, w: World, dt: number, others: { x: number; y: number; z: number }[] = []) {
    this.yaw = input.yaw;
    this.pitch = input.pitch;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    let mx = input.mx;
    let mz = input.mz;
    const m = Math.hypot(mx, mz);
    if (m > 1) {
      mx /= m;
      mz /= m;
    }
    const top = RUN_SPEED * (input.aiming ? 0.6 : 1);
    const wantX = (fx * mz + rx * mx) * top;
    const wantZ = (fz * mz + rz * mx) * top;
    const accel = this.onGround ? 14 : 3;
    const k = 1 - Math.exp(-accel * dt);
    this.vx += (wantX - this.vx) * k;
    this.vz += (wantZ - this.vz) * k;

    if (input.jump && this.onGround) {
      this.vy = JUMP_SPEED;
      this.onGround = false;
    }
    this.vy -= GRAVITY * dt;

    let nx = this.x + this.vx * dt;
    let nz = this.z + this.vz * dt;
    let ny = this.y + this.vy * dt;
    [nx, nz] = collide(w, nx, nz, Math.max(this.y, ny));
    // Other soldiers: soft circles.
    for (const o of others) {
      if (Math.abs(o.y - ny) > HEIGHT) continue;
      const dx = nx - o.x;
      const dz = nz - o.z;
      const d = Math.hypot(dx, dz);
      const min = RADIUS * 2;
      if (d > 1e-4 && d < min) {
        nx = o.x + (dx / d) * min;
        nz = o.z + (dz / d) * min;
      }
    }
    [nx, nz] = collide(w, nx, nz, Math.max(this.y, ny));
    const ceil = ceilingAt(w, nx, nz, this.y);
    if (ny + HEIGHT > ceil && this.vy > 0) {
      ny = ceil - HEIGHT;
      this.vy = 0;
    }
    const g = groundAt(w, nx, nz, Math.max(this.y, ny));
    const wasAir = !this.onGround;
    if (ny <= g) {
      if (wasAir && this.vy < -6) this.landed = -this.vy;
      ny = g;
      this.vy = 0;
      this.onGround = true;
    } else if (this.onGround && ny - g < STEP && this.vy <= 0) {
      // Walking down slopes and steps: stick to the floor.
      ny = g;
      this.vy = 0;
    } else {
      this.onGround = false;
    }
    this.stride += Math.hypot(nx - this.x, nz - this.z) * (this.onGround ? 1 : 0);
    this.x = nx;
    this.y = ny;
    this.z = nz;
    if (this.y < -20) this.y = 0;
  }
}

// ---- Weapons ------------------------------------------------------------------------------

export type WeaponId = "rifle" | "pistola" | "escopeta" | "francotirador" | "lanzacohetes";
/** Append-only: poses send the index. */
export const WEAPON_IDS: WeaponId[] = ["rifle", "pistola", "escopeta", "francotirador", "lanzacohetes"];

export interface WeaponDef {
  label: string;
  /** Seconds between shots. */
  every: number;
  auto: boolean;
  mag: number;
  /** Ammo carried besides the magazine, and the most you can carry. */
  reserve: number;
  reload: number;
  damage: number;
  /** Damage multiplier on the head. */
  head: number;
  /** Bullets per shot (shotgun pellets). */
  pellets: number;
  /** Spread in radians (hip and aiming). */
  spread: number;
  aimSpread: number;
  range: number;
  /** Damage starts dropping at this distance, down to `minFactor` at `range`. */
  falloff: number;
  minFactor: number;
  /** Field of view while aiming (degrees). */
  zoom: number;
  /** Rockets instead of bullets. */
  rocket?: boolean;
  /** Camera kick per shot (radians). */
  kick: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  rifle: { label: "Fusil", every: 0.085, auto: true, mag: 32, reserve: 160, reload: 2, damage: 8, head: 1.3, pellets: 1, spread: 0.035, aimSpread: 0.018, range: 60, falloff: 25, minFactor: 0.6, zoom: 55, kick: 0.006 },
  pistola: { label: "Pistola", every: 0.26, auto: false, mag: 12, reserve: 48, reload: 1.4, damage: 22, head: 2.2, pellets: 1, spread: 0.012, aimSpread: 0.003, range: 80, falloff: 40, minFactor: 0.7, zoom: 45, kick: 0.02 },
  escopeta: { label: "Escopeta", every: 0.9, auto: false, mag: 6, reserve: 24, reload: 2.6, damage: 13, head: 1.2, pellets: 9, spread: 0.11, aimSpread: 0.09, range: 22, falloff: 6, minFactor: 0.15, zoom: 62, kick: 0.06 },
  francotirador: { label: "Francotirador", every: 1.1, auto: false, mag: 4, reserve: 16, reload: 2.6, damage: 105, head: 2.5, pellets: 1, spread: 0.06, aimSpread: 0, range: 220, falloff: 220, minFactor: 1, zoom: 14, kick: 0.05 },
  lanzacohetes: { label: "Lanzacohetes", every: 1.2, auto: false, mag: 2, reserve: 4, reload: 3, damage: 0, head: 1, pellets: 1, spread: 0.01, aimSpread: 0.005, range: 120, falloff: 120, minFactor: 1, zoom: 45, rocket: true, kick: 0.06 },
};

export const PICKUP_LABEL: Record<PickupKind, string> = {
  rifle: "Fusil",
  pistola: "Pistola",
  escopeta: "Escopeta",
  francotirador: "Francotirador",
  lanzacohetes: "Lanzacohetes",
  granadas: "Granadas",
  botiquin: "Botiquín",
};

export const isWeapon = (k: PickupKind): k is WeaponId => k in WEAPONS;

export const MELEE_DAMAGE = 55;
export const MELEE_RANGE = 2.1;
export const MELEE_EVERY = 0.8;
export const ROCKET_SPEED = 34;
export const ROCKET_RADIUS = 4.2;
export const ROCKET_DAMAGE = 170;
export const GRENADE_SPEED = 15;
export const GRENADE_FUSE = 2;
export const GRENADE_RADIUS = 4.8;
export const GRENADE_DAMAGE = 130;
export const GRENADE_EVERY = 0.9;

interface Slot {
  id: WeaponId;
  mag: number;
  reserve: number;
}

export type ArsenalEvent =
  | { type: "shot"; weapon: WeaponId; dirs: [number, number, number][] }
  | { type: "rocket"; dir: [number, number, number] }
  | { type: "grenade"; dir: [number, number, number] }
  | { type: "melee" }
  | { type: "reload"; weapon: WeaponId }
  | { type: "empty" }
  | { type: "switch"; weapon: WeaponId };

export interface ArsenalInput {
  fire: boolean;
  aim: boolean;
  reload: boolean;
  swap: boolean;
  grenade: boolean;
  melee: boolean;
}

/** What a soldier carries: two weapons, ammo, grenades and the timers of each action. */
export class Arsenal {
  slots: Slot[];
  current = 0;
  grenades = 2;
  /** Seconds until the next shot / the reload ends / the switch ends / the next melee or grenade. */
  cool = 0;
  reloading = 0;
  switching = 0;
  meleeCool = 0;
  grenadeCool = 0;
  /** Accumulated recoil (spread grows with automatic fire). */
  heat = 0;
  /** Shots fired (others draw a muzzle flash when it changes). */
  shots = 0;
  private wasFire = false;
  private wasSwap = false;
  private wasGrenade = false;
  private wasMelee = false;
  private wasReload = false;

  constructor(primary: WeaponId = "rifle", secondary: WeaponId | null = "pistola") {
    this.slots = [fresh(primary)];
    if (secondary) this.slots.push(fresh(secondary));
  }

  get weapon(): WeaponId {
    return this.slots[this.current].id;
  }

  get slot(): Slot {
    return this.slots[this.current];
  }

  has(id: WeaponId): boolean {
    return this.slots.some((s) => s.id === id);
  }

  /** Picks up a weapon: ammo if you have it, else a free slot, else it replaces the one in hand. Returns false if nothing changed. */
  take(id: WeaponId): boolean {
    const mine = this.slots.find((s) => s.id === id);
    const def = WEAPONS[id];
    if (mine) {
      if (mine.reserve >= def.reserve) return false;
      mine.reserve = def.reserve;
      return true;
    }
    if (this.slots.length < 2) {
      this.slots.push(fresh(id));
      this.current = this.slots.length - 1;
    } else {
      this.slots[this.current] = fresh(id);
    }
    this.reloading = 0;
    this.switching = 0.35;
    return true;
  }

  /** Advances the timers and turns the buttons into actions. */
  step(input: ArsenalInput, dt: number, rand: () => number = Math.random): ArsenalEvent[] {
    const ev: ArsenalEvent[] = [];
    this.cool = Math.max(0, this.cool - dt);
    this.meleeCool = Math.max(0, this.meleeCool - dt);
    this.grenadeCool = Math.max(0, this.grenadeCool - dt);
    this.heat = Math.max(0, this.heat - dt * 2.5);
    const def = WEAPONS[this.weapon];

    if (this.switching > 0) this.switching = Math.max(0, this.switching - dt);
    if (this.reloading > 0) {
      this.reloading = Math.max(0, this.reloading - dt);
      if (this.reloading === 0) {
        const s = this.slot;
        const need = def.mag - s.mag;
        const got = Math.min(need, s.reserve);
        s.mag += got;
        s.reserve -= got;
      }
    }

    const pressed = (now: boolean, was: boolean) => now && !was;
    if (pressed(input.swap, this.wasSwap) && this.slots.length > 1) {
      this.current = 1 - this.current;
      this.reloading = 0;
      this.switching = 0.45;
      ev.push({ type: "switch", weapon: this.weapon });
    }
    if (pressed(input.melee, this.wasMelee) && this.meleeCool === 0) {
      this.meleeCool = MELEE_EVERY;
      this.cool = Math.max(this.cool, 0.45);
      this.reloading = 0;
      ev.push({ type: "melee" });
    }
    if (pressed(input.grenade, this.wasGrenade) && this.grenadeCool === 0 && this.grenades > 0) {
      this.grenades--;
      this.grenadeCool = GRENADE_EVERY;
      this.cool = Math.max(this.cool, 0.5);
      ev.push({ type: "grenade", dir: [0, 0, 0] });
    }
    const s = this.slot;
    const wantReload = (pressed(input.reload, this.wasReload) || (s.mag === 0 && input.fire)) && s.mag < def.mag && s.reserve > 0;
    if (wantReload && this.reloading === 0 && this.switching === 0) {
      this.reloading = def.reload;
      ev.push({ type: "reload", weapon: this.weapon });
    }

    const trigger = def.auto ? input.fire : pressed(input.fire, this.wasFire);
    if (trigger && this.cool === 0 && this.reloading === 0 && this.switching === 0) {
      if (s.mag === 0) {
        if (pressed(input.fire, this.wasFire)) ev.push({ type: "empty" });
      } else {
        s.mag--;
        this.cool = def.every;
        this.shots++;
        const spread = (input.aim ? def.aimSpread : def.spread) * (1 + this.heat);
        if (def.auto) this.heat = Math.min(1.5, this.heat + 0.12);
        if (def.rocket) ev.push({ type: "rocket", dir: [0, 0, 0] });
        else {
          // Directions as (yaw, pitch) offsets; the caller turns them into rays.
          const dirs: [number, number, number][] = [];
          for (let i = 0; i < def.pellets; i++) {
            const a = rand() * Math.PI * 2;
            const m = Math.sqrt(rand()) * spread;
            dirs.push([Math.cos(a) * m, Math.sin(a) * m, 0]);
          }
          ev.push({ type: "shot", weapon: this.weapon, dirs });
        }
      }
    }
    this.wasFire = input.fire;
    this.wasSwap = input.swap;
    this.wasGrenade = input.grenade;
    this.wasMelee = input.melee;
    this.wasReload = input.reload;
    return ev;
  }
}

function fresh(id: WeaponId): Slot {
  const d = WEAPONS[id];
  return { id, mag: d.mag, reserve: d.reserve };
}

// ---- Shots ------------------------------------------------------------------------------------

export interface Target {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface ShotHit {
  target: string;
  head: boolean;
  damage: number;
}

/** Where a ray meets a standing soldier: head sphere first, then the body cylinder. */
function rayTarget(r: Ray, t: Target, maxT: number): { t: number; head: boolean } | null {
  // Head.
  const hx = t.x - r.ox;
  const hy = t.y + HEAD_Y - r.oy;
  const hz = t.z - r.oz;
  const proj = hx * r.dx + hy * r.dy + hz * r.dz;
  let best: { t: number; head: boolean } | null = null;
  if (proj > 0) {
    const d2 = hx * hx + hy * hy + hz * hz - proj * proj;
    if (d2 < HEAD_R * HEAD_R) {
      const th = proj - Math.sqrt(HEAD_R * HEAD_R - d2);
      if (th < maxT) best = { t: th, head: true };
    }
  }
  // Body: vertical cylinder from the feet to BODY_TOP.
  const ox = r.ox - t.x;
  const oz = r.oz - t.z;
  const a = r.dx * r.dx + r.dz * r.dz;
  if (a > 1e-9) {
    const bq = 2 * (ox * r.dx + oz * r.dz);
    const c = ox * ox + oz * oz - BODY_R * BODY_R;
    const disc = bq * bq - 4 * a * c;
    if (disc >= 0) {
      const tb = (-bq - Math.sqrt(disc)) / (2 * a);
      const yy = r.oy + r.dy * tb - t.y;
      if (tb > 0 && tb < maxT && yy >= 0 && yy <= BODY_TOP && (!best || tb < best.t)) best = { t: tb, head: false };
    }
  }
  return best;
}

/**
 * One bullet: the first soldier along the ray before any wall. With
 * `assist` (radians), a miss that passes that close to someone's chest or
 * head still hits them (mobile aim help).
 */
export function castBullet(
  w: World,
  r: Ray,
  weapon: WeaponId,
  targets: Target[],
  assist = 0
): { hit: ShotHit | null; end: [number, number, number]; dist: number } {
  const def = WEAPONS[weapon];
  const wallT = rayWorld(w, r, def.range);
  let best: { t: number; head: boolean; id: string } | null = null;
  for (const t of targets) {
    const h = rayTarget(r, t, wallT);
    if (h && (!best || h.t < best.t)) best = { ...h, id: t.id };
  }
  if (!best && assist > 0) {
    let bestAng = assist;
    for (const t of targets) {
      for (const [py, head] of [[1.15, false], [HEAD_Y, true]] as [number, boolean][]) {
        const dx = t.x - r.ox;
        const dy = t.y + py - r.oy;
        const dz = t.z - r.oz;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > def.range || dist < 0.5) continue;
        const cos = (dx * r.dx + dy * r.dy + dz * r.dz) / dist;
        const ang = Math.acos(Math.min(1, cos));
        // The cone shrinks a little with distance so far shots still need aim.
        const cone = assist * Math.min(1, 12 / Math.max(6, dist) + 0.35);
        if (ang < cone && ang < bestAng && clearLine(w, r.ox, r.oy, r.oz, t.x, t.y + py, t.z)) {
          bestAng = ang;
          best = { t: dist, head: head && ang < cone * 0.4, id: t.id };
        }
      }
    }
  }
  const t = best ? best.t : wallT;
  const end: [number, number, number] = [r.ox + r.dx * t, r.oy + r.dy * t, r.oz + r.dz * t];
  if (!best) return { hit: null, end, dist: t };
  const fall = t <= def.falloff ? 1 : Math.max(def.minFactor, 1 - ((1 - def.minFactor) * (t - def.falloff)) / Math.max(1, def.range - def.falloff));
  return { hit: { target: best.id, head: best.head, damage: def.damage * fall * (best.head ? def.head : 1) }, end, dist: t };
}

/** A shot's direction: the view direction turned by the spread offsets. */
export function spreadDir(yaw: number, pitch: number, off: [number, number, number]): [number, number, number] {
  return lookDir(yaw + off[0], pitch + off[1]);
}

/** Melee: the closest enemy in front, within reach. */
export function meleeTarget(w: World, from: Target & { yaw: number }, targets: Target[]): string | null {
  const [fx, , fz] = lookDir(from.yaw, 0);
  let best: string | null = null;
  let bestD = MELEE_RANGE;
  for (const t of targets) {
    const dx = t.x - from.x;
    const dz = t.z - from.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD || Math.abs(t.y - from.y) > 1.6) continue;
    if (d > 0.3 && (dx * fx + dz * fz) / d < 0.55) continue;
    if (!clearLine(w, from.x, from.y + 1.2, from.z, t.x, t.y + 1.2, t.z)) continue;
    best = t.id;
    bestD = d;
  }
  return best;
}

// ---- Rockets and grenades ---------------------------------------------------------------------

export type ProjectileKind = "cohete" | "granada";

export interface Projectile {
  kind: ProjectileKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export function launch(kind: ProjectileKind, from: { x: number; y: number; z: number; yaw: number; pitch: number }): Projectile {
  const [dx, dy, dz] = lookDir(from.yaw, kind === "granada" ? from.pitch + 0.22 : from.pitch);
  const speed = kind === "granada" ? GRENADE_SPEED : ROCKET_SPEED;
  const [rx, , rz] = [Math.cos(from.yaw), 0, -Math.sin(from.yaw)];
  const side = kind === "cohete" ? 0.18 : 0;
  return {
    kind,
    x: from.x + dx * 0.6 + rx * side,
    y: from.y + EYE - 0.15 + dy * 0.6,
    z: from.z + dz * 0.6 + rz * side,
    vx: dx * speed,
    vy: dy * speed,
    vz: dz * speed,
  };
}

/**
 * Advances a projectile by dt. A rocket explodes on touching anything solid
 * or a soldier; a grenade bounces and explodes when its fuse (counted by the
 * caller) runs out. Deterministic, so every phone flies it the same way.
 */
export function flyProjectile(w: World, p: Projectile, dt: number, targets: Target[]): { boom: boolean } {
  if (p.kind === "granada") p.vy -= GRAVITY * 0.8 * dt;
  const len = Math.hypot(p.vx, p.vy, p.vz) * dt;
  if (len < 1e-6) return { boom: false };
  const r: Ray = { ox: p.x, oy: p.y, oz: p.z, dx: (p.vx * dt) / len, dy: (p.vy * dt) / len, dz: (p.vz * dt) / len };
  const hitT = rayWorld(w, r, len);
  if (p.kind === "cohete") {
    for (const t of targets) {
      const h = rayTarget(r, t, len);
      if (h && h.t <= hitT) {
        p.x += r.dx * h.t;
        p.y += r.dy * h.t;
        p.z += r.dz * h.t;
        return { boom: true };
      }
    }
    if (hitT < len) {
      p.x += r.dx * Math.max(0, hitT - 0.05);
      p.y += r.dy * Math.max(0, hitT - 0.05);
      p.z += r.dz * Math.max(0, hitT - 0.05);
      return { boom: true };
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    return { boom: false };
  }
  if (hitT < len) {
    // Bounce: find which way the surface faces by probing the axes.
    const px = p.x + r.dx * Math.max(0, hitT - 0.02);
    const py = p.y + r.dy * Math.max(0, hitT - 0.02);
    const pz = p.z + r.dz * Math.max(0, hitT - 0.02);
    const probe = (dx: number, dy: number, dz: number) => rayWorld(w, { ox: px, oy: py, oz: pz, dx, dy, dz }, 0.12) < 0.12;
    if (probe(0, -Math.sign(p.vy) || -1, 0) && Math.abs(p.vy) > 0.01) p.vy = -p.vy * 0.4;
    if (probe(Math.sign(p.vx), 0, 0)) p.vx = -p.vx * 0.5;
    if (probe(0, 0, Math.sign(p.vz))) p.vz = -p.vz * 0.5;
    p.vx *= 0.7;
    p.vz *= 0.7;
    p.x = px;
    p.y = Math.max(0.08, py);
    p.z = pz;
    return { boom: false };
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  return { boom: false };
}

/** Damage of an explosion at (x, y, z) to each soldier in reach (less behind cover). */
export function blast(w: World, kind: ProjectileKind, x: number, y: number, z: number, targets: Target[]): ShotHit[] {
  const radius = kind === "cohete" ? ROCKET_RADIUS : GRENADE_RADIUS;
  const max = kind === "cohete" ? ROCKET_DAMAGE : GRENADE_DAMAGE;
  const out: ShotHit[] = [];
  for (const t of targets) {
    const d = Math.hypot(t.x - x, t.y + 1 - y, t.z - z);
    if (d > radius) continue;
    const cover = clearLine(w, x, y + 0.1, z, t.x, t.y + 1, t.z) ? 1 : 0.3;
    const damage = max * (1 - (d / radius) * 0.85) * cover;
    if (damage >= 1) out.push({ target: t.id, head: false, damage });
  }
  return out;
}

// ---- Spawns ----------------------------------------------------------------------------------

/** The spawn farthest from the enemies (with a little randomness so it isn't predictable). */
export function pickSpawn(map: MapDef, team: "red" | "blue" | null, enemies: { x: number; z: number }[], rand: () => number = Math.random): Spawn {
  const own = team ? map.spawns.filter((s) => s.team === team) : map.spawns;
  const pool = own.length ? own : map.spawns;
  let best = pool[0];
  let bestScore = -Infinity;
  for (const s of pool) {
    const near = enemies.length ? Math.min(...enemies.map((e) => Math.hypot(e.x - s.x, e.z - s.z))) : 50;
    const score = Math.min(near, 40) + rand() * 8;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

// ---- Bots: waypoints --------------------------------------------------------------------------

export interface NavGraph {
  nodes: { x: number; y: number; z: number }[];
  /** Directed: you can walk (or drop) from a node to each of these. */
  edges: number[][];
}

const graphs = new Map<MapId, NavGraph>();

/**
 * Walking straight from a to b (steps and slopes up to STEP, drops allowed,
 * nothing in the way): the height the feet end at, or null if blocked.
 */
function walkable(w: World, ax: number, az: number, bx: number, bz: number): number | null {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.ceil(len / 0.4));
  let feet = topAt(w, ax, az);
  for (let i = 1; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n;
    const z = az + ((bz - az) * i) / n;
    // Walls at body height in the way.
    for (const bx2 of w.boxes) {
      if (bx2.y + bx2.h > feet + STEP && bx2.y < feet + HEIGHT && inside(bx2, x, z, RADIUS * 0.9)) return null;
    }
    // The high side of a ramp.
    for (const rp of w.ramps) {
      if (!inside(rp, x, z, RADIUS * 0.9)) continue;
      const cx = Math.max(rp.x - rp.w / 2, Math.min(rp.x + rp.w / 2, x));
      const cz = Math.max(rp.z - rp.d / 2, Math.min(rp.z + rp.d / 2, z));
      if (rampHeight(rp, cx, cz) > feet + STEP && rp.y < feet + HEIGHT) return null;
    }
    feet = groundAt(w, x, z, feet);
  }
  return feet;
}

export function navGraph(id: MapId): NavGraph {
  let g = graphs.get(id);
  if (g) return g;
  const w = worldOf(id);
  const nodes = w.map.nodes.map(([x, z]) => ({ x, y: topAt(w, x, z), z }));
  const edges = nodes.map((a, i) =>
    nodes
      .map((b2, j) => ({ j, d: Math.hypot(b2.x - a.x, b2.z - a.z) }))
      .filter(({ j, d }) => {
        if (j === i || d > 24) return false;
        const end = walkable(w, a.x, a.z, nodes[j].x, nodes[j].z);
        // It has to arrive at b's level (not walk under a platform b is on).
        return end !== null && Math.abs(end - nodes[j].y) < 0.3;
      })
      .map(({ j }) => j)
  );
  g = { nodes, edges };
  graphs.set(id, g);
  return g;
}

export function nearestNode(g: NavGraph, x: number, y: number, z: number, w?: World): number {
  let best = 0;
  let bestD = Infinity;
  g.nodes.forEach((n, i) => {
    const d = Math.hypot(n.x - x, n.z - z) + Math.abs(n.y - y) * 3;
    if (d < bestD && (!w || bestD === Infinity || clearLine(w, x, y + 1, z, n.x, n.y + 1, n.z))) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Shortest path between two nodes (A*), as node indexes; empty if unreachable. */
export function findPath(g: NavGraph, from: number, to: number): number[] {
  const n = g.nodes.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const open = new Set([from]);
  dist[from] = 0;
  const h = (i: number) => Math.hypot(g.nodes[i].x - g.nodes[to].x, g.nodes[i].z - g.nodes[to].z);
  while (open.size) {
    let cur = -1;
    let curF = Infinity;
    for (const i of open) {
      const f = dist[i] + h(i);
      if (f < curF) {
        curF = f;
        cur = i;
      }
    }
    if (cur === to) break;
    open.delete(cur);
    for (const j of g.edges[cur]) {
      const d = dist[cur] + Math.hypot(g.nodes[j].x - g.nodes[cur].x, g.nodes[j].z - g.nodes[cur].z);
      if (d < dist[j]) {
        dist[j] = d;
        prev[j] = cur;
        open.add(j);
      }
    }
  }
  if (dist[to] === Infinity) return [];
  const path: number[] = [];
  for (let i = to; i !== -1; i = prev[i]) path.unshift(i);
  return path;
}

// ---- Bots: brain ------------------------------------------------------------------------------

export type BotLevel = "facil" | "normal" | "dificil";

const LEVEL: Record<BotLevel, { react: number; aimErr: number; turn: number; burst: number }> = {
  facil: { react: 0.75, aimErr: 0.09, turn: 3, burst: 0.5 },
  normal: { react: 0.45, aimErr: 0.05, turn: 5, burst: 0.75 },
  dificil: { react: 0.25, aimErr: 0.025, turn: 8, burst: 1 },
};

export interface BotMind {
  path: number[];
  goal: number;
  repath: number;
  /** Enemy in sight and since when. */
  target: string | null;
  seenFor: number;
  strafe: number;
  strafeT: number;
  jumpT: number;
  grenadeT: number;
  stuckT: number;
  lastX: number;
  lastZ: number;
}

export function newMind(): BotMind {
  return { path: [], goal: -1, repath: 0, target: null, seenFor: 0, strafe: 1, strafeT: 0, jumpT: 2, grenadeT: 4, stuckT: 0, lastX: 0, lastZ: 0 };
}

export interface BotView {
  enemies: (Target & { alive: boolean })[];
  items: { id: string; kind: PickupKind; x: number; z: number }[];
  hp: number;
  shield: number;
}

export interface BotOutput {
  move: SoldierInput;
  arms: ArsenalInput;
  /** An item to walk over and take. */
  pick: string | null;
}

const angleTo = (a: number, b: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** One tick of a bot: where to walk, where to look and what to press. */
export function botThink(
  w: World,
  g: NavGraph,
  me: Soldier,
  arms: Arsenal,
  mind: BotMind,
  view: BotView,
  level: BotLevel,
  dt: number,
  rand: () => number
): BotOutput {
  const L = LEVEL[level];
  const eyeY = me.y + EYE;
  const move: SoldierInput = { mx: 0, mz: 0, yaw: me.yaw, pitch: me.pitch, jump: false, aiming: false };
  const out: ArsenalInput = { fire: false, aim: false, reload: false, swap: false, grenade: false, melee: false };

  // Enemies in sight.
  const visible = view.enemies
    .filter((e) => e.alive)
    .map((e) => ({ e, d: Math.hypot(e.x - me.x, e.z - me.z, e.y - me.y) }))
    .filter(({ e, d }) => d < 70 && clearLine(w, me.x, eyeY, me.z, e.x, e.y + 1.3, e.z))
    .sort((a, b2) => a.d - b2.d);
  const seen = visible[0];
  if (seen) {
    if (mind.target !== seen.e.id) {
      mind.target = seen.e.id;
      mind.seenFor = 0;
    }
    mind.seenFor += dt;
  } else {
    mind.target = null;
    mind.seenFor = 0;
  }

  // Low on health: go for a medkit; with a weak weapon, for a better one.
  let pick: string | null = null;
  const wantKit = view.hp < 55;
  const better = (k: PickupKind) => (k === "lanzacohetes" || k === "francotirador" || k === "escopeta") && !arms.has(k as WeaponId);
  const items = view.items
    .filter((it) => (wantKit && it.kind === "botiquin") || better(it.kind) || (it.kind === "granadas" && arms.grenades < 2))
    .map((it) => ({ it, d: Math.hypot(it.x - me.x, it.z - me.z) }))
    .filter(({ d }) => d < (wantKit ? 45 : 25))
    .sort((a, b2) => a.d - b2.d);
  for (const { it, d } of view.items.map((it) => ({ it, d: Math.hypot(it.x - me.x, it.z - me.z) }))) {
    if (d < 1.4 && (it.kind !== "botiquin" || view.hp < 100)) pick = it.id;
  }

  // Where to go: toward the item, else the nearest enemy (even unseen), keeping some distance when in sight.
  let goalX: number | null = null;
  let goalZ = 0;
  let goalY = 0;
  if (items[0] && (!seen || wantKit)) {
    goalX = items[0].it.x;
    goalZ = items[0].it.z;
    goalY = topAt(w, goalX, goalZ);
  } else {
    const prey = seen?.e ?? view.enemies.filter((e) => e.alive).sort((a, b2) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b2.x - me.x, b2.z - me.z))[0];
    if (prey) {
      goalX = prey.x;
      goalZ = prey.z;
      goalY = prey.y;
    }
  }

  mind.repath -= dt;
  let walkX = 0;
  let walkZ = 0;
  if (goalX !== null) {
    const goalNode = nearestNode(g, goalX, goalY, goalZ);
    if (mind.repath <= 0 || goalNode !== mind.goal || !mind.path.length) {
      mind.goal = goalNode;
      mind.path = findPath(g, nearestNode(g, me.x, me.y, me.z, w), goalNode);
      mind.repath = 1.5;
    }
    // Drop waypoints already reached.
    while (mind.path.length && Math.hypot(g.nodes[mind.path[0]].x - me.x, g.nodes[mind.path[0]].z - me.z) < 1.2) mind.path.shift();
    const next = mind.path[0] !== undefined ? g.nodes[mind.path[0]] : { x: goalX, z: goalZ };
    walkX = next.x - me.x;
    walkZ = next.z - me.z;
  }

  // Unstick: jump when not getting anywhere.
  const moved = Math.hypot(me.x - mind.lastX, me.z - mind.lastZ);
  mind.lastX = me.x;
  mind.lastZ = me.z;
  mind.stuckT = moved < 0.6 * dt && Math.hypot(walkX, walkZ) > 1 ? mind.stuckT + dt : 0;
  if (mind.stuckT > 0.6) {
    move.jump = true;
    mind.repath = 0;
    mind.stuckT = 0;
  }

  let faceYaw = Math.atan2(-walkX, -walkZ);
  let facePitch = 0;
  if (seen) {
    const e = seen.e;
    const dx = e.x - me.x;
    const dz = e.z - me.z;
    const dy = e.y + 1.25 - eyeY;
    // Aim with an error that shrinks the longer it has had them in sight.
    const err = L.aimErr * (1 + 1 / (0.4 + mind.seenFor * 2));
    faceYaw = Math.atan2(-dx, -dz) + Math.sin(mind.seenFor * 3.1 + me.x) * err;
    facePitch = Math.atan2(dy, Math.hypot(dx, dz)) + Math.cos(mind.seenFor * 2.3) * err * 0.6;
  } else if (Math.hypot(walkX, walkZ) < 0.1) {
    faceYaw = me.yaw;
  }
  const turn = L.turn * dt;
  const dYaw = angleTo(me.yaw, faceYaw);
  move.yaw = me.yaw + Math.max(-turn, Math.min(turn, dYaw));
  move.pitch = me.pitch + Math.max(-turn, Math.min(turn, facePitch - me.pitch));

  // Walk toward the waypoint, relative to where it looks.
  if (Math.hypot(walkX, walkZ) > 0.3) {
    const want = Math.atan2(-walkX, -walkZ);
    const rel = angleTo(move.yaw, want);
    move.mz = Math.cos(rel);
    move.mx = -Math.sin(rel);
  }

  if (seen) {
    const e = seen.e;
    const d = seen.d;
    // Strafe from side to side; keep some distance unless it's a shotgun.
    mind.strafeT -= dt;
    if (mind.strafeT <= 0) {
      mind.strafe = rand() < 0.5 ? -1 : 1;
      mind.strafeT = 0.6 + rand() * 1.2;
    }
    const close = arms.weapon === "escopeta" ? 3 : 9;
    move.mx = mind.strafe * 0.8;
    move.mz = d > close + 6 ? 0.7 : d < close ? -0.4 : 0;
    mind.jumpT -= dt;
    if (mind.jumpT <= 0) {
      move.jump = rand() < 0.35;
      mind.jumpT = 1.5 + rand() * 2;
    }
    const aimedOff = Math.abs(dYaw);
    const def = WEAPONS[arms.weapon];
    const ready = mind.seenFor > L.react && aimedOff < 0.12 + 1 / Math.max(4, d);
    if (ready && d < def.range) {
      // Bursts: shoot most of the time, pausing now and then.
      out.fire = def.auto ? Math.sin(mind.seenFor * 6) > 1 - L.burst * 1.6 : rand() < dt * 3.2;
      out.aim = arms.weapon === "francotirador" || (d > 20 && arms.weapon !== "escopeta");
    }
    if (d < MELEE_RANGE * 0.9) out.melee = true;
    mind.grenadeT -= dt;
    if (mind.grenadeT <= 0 && d > 8 && d < 22 && arms.grenades > 0) {
      out.grenade = true;
      mind.grenadeT = 6 + rand() * 6;
    }
    // A shotgun is useless far away and a sniper up close: switch.
    if (arms.slots.length > 1) {
      const other = arms.slots[1 - arms.current].id;
      if ((arms.weapon === "escopeta" && d > 14 && other !== "escopeta") || (arms.weapon === "francotirador" && d < 8)) out.swap = rand() < dt * 2;
      if (arms.slot.mag === 0 && arms.slot.reserve === 0) out.swap = true;
    }
    void e;
  } else if (arms.slot.mag < WEAPONS[arms.weapon].mag * 0.5) {
    out.reload = true;
  }
  if (arms.slot.mag === 0 && arms.slot.reserve === 0 && arms.slots.length > 1) out.swap = true;

  return { move, arms: out, pick };
}
