/**
 * Arena medieval: the arena, the weapons and how a fighter moves and fights.
 * Pure (no Firebase, no DOM): each phone runs its own fighter with it (and
 * the bot host runs the bots), the bots' brains live here too.
 *
 * Units are meters and seconds. The arena is a circle on the x/z plane with
 * pillars; red starts at -x and blue at +x. Yaw 0 looks toward -z (like a
 * three.js camera), so forward is (-sin yaw, -cos yaw) and right is
 * (cos yaw, -sin yaw).
 */

import { mulberry32 } from "./random";
import type { TeamId } from "./teams";

export const ARENA_RADIUS = 17;
export const PILLAR_RADIUS = 0.9;
/** Pillars, mirrored across x = 0 so neither team has better cover. */
export const PILLARS: [number, number][] = [30, 90, 150, 210, 270, 330].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return [Math.round(Math.cos(a) * 8.5 * 100) / 100, Math.round(Math.sin(a) * 8.5 * 100) / 100];
});

export const FIGHTER_RADIUS = 0.42;
export const FIGHTER_HEIGHT = 1.85;
export const EYE_HEIGHT = 1.62;
export const MAX_HP = 100;
export const MAX_STAMINA = 100;

export const WALK_SPEED = 5.2;
/** Running (forward only): faster, and it spends stamina. */
export const SPRINT = 1.5;
const SPRINT_STAMINA = 13;
const GRAVITY = 16;
const JUMP_SPEED = 5.6;
const STAMINA_REGEN = 28;
const STAMINA_REGEN_BLOCKING = 8;
const JUMP_STAMINA = 8;
/** A dodge: a quick dash (nothing touches you while it lasts). */
const DODGE_SECONDS = 0.28;
const DODGE_SPEED = 11.5;
const DODGE_STAMINA = 22;
/** A clean hit makes the target flinch (and loses any attack it was winding up). */
const FLINCH_SECONDS = 0.3;
/** Running out of stamina while blocking. */
const GUARD_BREAK_SECONDS = 0.9;
const KNOCKBACK = 5.5;
/** Each swing carries the attacker forward a little. */
const LUNGE = 3.2;
/** A follow-up attack chained during the recovery: it cuts the recovery short and winds up faster. */
const COMBO_CUT = 0.45;
const COMBO_WINDUP = 0.7;

export type WeaponId = "daga" | "espada" | "hacha" | "maza" | "lanza" | "arco";
export type ItemKind = WeaponId | "escudo" | "pocion";

export interface WeaponSpec {
  label: string;
  /** Melee: damage of a clean hit; bow: at full draw. */
  damage: number;
  reach: number;
  /** Width of the swing in front of the attacker (radians). */
  arc: number;
  windup: number;
  recover: number;
  stamina: number;
  /** Fraction of the damage that still goes through a block. */
  pierce: number;
  /** How hard a blocked hit drains the defender's stamina (× damage). */
  drain: number;
  ranged?: boolean;
}

const deg = (d: number) => (d * Math.PI) / 180;

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  daga: { label: "Daga", damage: 13, reach: 1.6, arc: deg(75), windup: 0.2, recover: 0.24, stamina: 9, pierce: 0, drain: 0.8 },
  espada: { label: "Espada", damage: 24, reach: 2.15, arc: deg(105), windup: 0.3, recover: 0.3, stamina: 15, pierce: 0, drain: 1 },
  hacha: { label: "Hacha", damage: 38, reach: 2.05, arc: deg(95), windup: 0.5, recover: 0.42, stamina: 25, pierce: 0.2, drain: 1.6 },
  maza: { label: "Maza", damage: 30, reach: 1.9, arc: deg(95), windup: 0.42, recover: 0.36, stamina: 21, pierce: 0.35, drain: 1.8 },
  lanza: { label: "Lanza", damage: 26, reach: 3.0, arc: deg(40), windup: 0.36, recover: 0.34, stamina: 17, pierce: 0, drain: 1 },
  arco: { label: "Arco", damage: 40, reach: 30, arc: 0, windup: 0, recover: 0.3, stamina: 10, pierce: 0, drain: 1, ranged: true },
};

export const ITEM_LABEL: Record<ItemKind, string> = {
  ...(Object.fromEntries(Object.entries(WEAPONS).map(([k, v]) => [k, v.label])) as Record<WeaponId, string>),
  escudo: "Escudo",
  pocion: "Poción",
};

/** Health a potion gives back. */
export const POTION_HEAL = 40;

/** Bow: the least draw that shoots, and the time to a full draw. */
export const BOW_MIN_DRAW = 0.25;
export const BOW_FULL_DRAW = 0.85;
const ARROW_MIN_SPEED = 26;
const ARROW_MAX_SPEED = 50;
const ARROW_MIN_DAMAGE = 16;
export const ARROW_GRAVITY = 9.8;
const HEADSHOT = 1.5;

/** Blocking covers this much in front: wider with a shield (and only a shield stops arrows). */
const BLOCK_ARC = deg(100);
const SHIELD_ARC = deg(150);
const SHIELD_DRAIN = 0.6;

export interface Gear {
  w: WeaponId;
  /** Carrying a shield (in the other hand; not usable with the bow). */
  sh: boolean;
}

export const START_GEAR: Gear = { w: "daga", sh: false };

/** What a fighter is doing; others see it in the pose to animate it. Append only (poses send the index). */
export type Act = "idle" | "windup" | "recover" | "draw" | "stagger" | "dodge";
export const ACTS: Act[] = ["idle", "windup", "recover", "draw", "stagger", "dodge"];

export interface FighterInput {
  /** Strafe (-1 left … 1 right) and forward (-1 back … 1 forward), joystick-style. */
  mx: number;
  mz: number;
  yaw: number;
  pitch: number;
  jump: boolean;
  /** Held: melee attacks when pressed (again during the recovery = combo), the bow draws while held and shoots on release. */
  attack: boolean;
  block: boolean;
  sprint: boolean;
  /** Pressed: a dodge toward where you move (backward if standing). */
  dodge: boolean;
}

export const IDLE_INPUT: FighterInput = { mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, attack: false, block: false, sprint: false, dodge: false };

export type FighterEvent =
  /** An attack starts winding up (a whoosh), a jump or a dodge. */
  | { type: "windup" }
  | { type: "jump" }
  | { type: "dodge" }
  /** The swing lands now: the caller checks what it hit. */
  | { type: "strike" }
  /** The bow shoots with this much draw (0–1). */
  | { type: "shoot"; draw: number };

/** Something round fighters bump into (pillars, other fighters). */
export interface Solid {
  x: number;
  z: number;
  r: number;
}

export const PILLAR_SOLIDS: Solid[] = PILLARS.map(([x, z]) => ({ x, z, r: PILLAR_RADIUS }));

export function forward(yaw: number): [number, number] {
  return [-Math.sin(yaw), -Math.cos(yaw)];
}

export function yawTo(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Keeps a point inside the arena wall and out of the solids. */
function pushOut(p: { x: number; z: number }, radius: number, solids: Solid[]) {
  const limit = ARENA_RADIUS - radius;
  const d = Math.hypot(p.x, p.z);
  if (d > limit) {
    p.x *= limit / d;
    p.z *= limit / d;
  }
  for (const s of solids) {
    const dx = p.x - s.x;
    const dz = p.z - s.z;
    const dist = Math.hypot(dx, dz);
    const min = s.r + radius;
    if (dist < min && dist > 1e-6) {
      p.x = s.x + (dx / dist) * min;
      p.z = s.z + (dz / dist) * min;
    }
  }
}

/** One fighter, simulated by its own phone (or by the bot host). */
export class Fighter {
  y = 0;
  vy = 0;
  yaw: number;
  pitch = 0;
  /** Knockback (and lunge) velocity, fading. */
  kx = 0;
  kz = 0;
  /** Horizontal speed this step (for the walk animation), and whether running. */
  speed = 0;
  sprinting = false;
  act: Act = "idle";
  /** Seconds since the act started. */
  actT = 0;
  /** How long the current act lasts (stagger, windup, recover, dodge). */
  actLen = 0;
  blocking = false;
  stamina = MAX_STAMINA;
  /** Bow draw, 0–1. */
  draw = 0;
  /** Swings chained so far (0 = the first); odd ones come from the other side. */
  combo = 0;
  private queued = false;
  private dodgeX = 0;
  private dodgeZ = 0;
  private attackWas = false;
  private jumpWas = false;
  private dodgeWas = false;

  constructor(
    public x: number,
    public z: number,
    yaw: number
  ) {
    this.yaw = yaw;
  }

  get onGround(): boolean {
    return this.y <= 0 && this.vy <= 0;
  }

  private start(act: Act, len: number) {
    this.act = act;
    this.actT = 0;
    this.actLen = len;
  }

  private windup(weapon: WeaponSpec, chained: boolean, events: FighterEvent[]) {
    this.stamina = Math.max(0, this.stamina - weapon.stamina);
    this.combo = chained ? this.combo + 1 : 0;
    this.start("windup", weapon.windup * (chained ? COMBO_WINDUP : 1));
    events.push({ type: "windup" });
  }

  step(input: FighterInput, gear: Gear, dt: number, solids: Solid[]): FighterEvent[] {
    const events: FighterEvent[] = [];
    const weapon = WEAPONS[gear.w];
    this.yaw = input.yaw;
    this.pitch = Math.max(-1.3, Math.min(1.3, input.pitch));
    this.actT += dt;
    const [fx, fz] = forward(this.yaw);

    const pressed = input.attack && !this.attackWas;
    const released = !input.attack && this.attackWas;
    this.attackWas = input.attack;
    const dodge = input.dodge && !this.dodgeWas;
    this.dodgeWas = input.dodge;

    // The act in progress.
    if (this.act === "windup" && this.actT >= this.actLen) {
      events.push({ type: "strike" });
      this.kx += fx * LUNGE;
      this.kz += fz * LUNGE;
      this.start("recover", weapon.recover);
    } else if (this.act === "recover") {
      if (pressed && !weapon.ranged && this.actT > this.actLen * 0.2) this.queued = true;
      if (this.queued && this.actT >= this.actLen * COMBO_CUT && this.stamina >= weapon.stamina * 0.5) {
        this.queued = false;
        this.windup(weapon, true, events);
      } else if (this.actT >= this.actLen) {
        this.queued = false;
        this.combo = 0;
        this.start("idle", 0);
      }
    } else if ((this.act === "stagger" || this.act === "dodge") && this.actT >= this.actLen) {
      this.start("idle", 0);
    }

    // Dodging: from idle or late in a recovery, toward where you move.
    const free = this.act === "idle" || (this.act === "recover" && this.actT > this.actLen * 0.5) || this.act === "draw";
    if (dodge && free && this.onGround && this.stamina >= DODGE_STAMINA) {
      let mx = input.mx;
      let mz = input.mz;
      if (Math.hypot(mx, mz) < 0.2) {
        mx = 0;
        mz = -1;
      }
      const len = Math.hypot(mx, mz);
      const rx = -fz;
      const rz = fx;
      this.dodgeX = ((fx * mz + rx * mx) / len) * DODGE_SPEED;
      this.dodgeZ = ((fz * mz + rz * mx) / len) * DODGE_SPEED;
      this.stamina -= DODGE_STAMINA;
      this.queued = false;
      this.draw = 0;
      this.start("dodge", DODGE_SECONDS);
      events.push({ type: "dodge" });
    }

    // Blocking: only when free; it also cancels an attack being wound up (a feint).
    const canBlock = !weapon.ranged && (this.act === "idle" || this.act === "windup");
    if (input.block && canBlock) {
      if (this.act === "windup") this.start("idle", 0);
      this.blocking = this.stamina > 0;
    } else {
      this.blocking = false;
    }

    if (weapon.ranged) {
      if (this.act === "draw") {
        this.draw = Math.min(1, this.actT / BOW_FULL_DRAW);
        if (released) {
          if (this.actT >= BOW_MIN_DRAW) {
            events.push({ type: "shoot", draw: this.draw });
            this.start("recover", weapon.recover);
          } else {
            this.start("idle", 0);
          }
          this.draw = 0;
        }
      } else if (input.attack && this.act === "idle" && this.stamina >= weapon.stamina) {
        this.stamina -= weapon.stamina;
        this.start("draw", 0);
        this.draw = 0;
      }
    } else if (pressed && this.act === "idle" && !this.blocking && this.stamina >= weapon.stamina * 0.5) {
      this.windup(weapon, false, events);
    }
    if (!weapon.ranged && this.act === "draw") this.start("idle", 0);

    // Moving.
    let mx = Math.max(-1, Math.min(1, input.mx));
    let mz = Math.max(-1, Math.min(1, input.mz));
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    this.sprinting = input.sprint && mz > 0.3 && this.stamina > 4 && this.act === "idle" && !this.blocking && this.onGround;
    let speed = WALK_SPEED;
    if (this.sprinting) {
      speed *= SPRINT;
      this.stamina -= SPRINT_STAMINA * dt;
    }
    if (mz < 0) speed *= 0.8;
    if (this.blocking) speed *= 0.55;
    if (this.act === "windup") speed *= 0.7;
    if (this.act === "draw") speed *= 0.55;
    if (this.act === "stagger") speed *= 0.3;
    if (!this.onGround) speed *= 0.9;
    const rx = -fz;
    const rz = fx;
    let vx = (fx * mz + rx * mx) * speed + this.kx;
    let vz = (fz * mz + rz * mx) * speed + this.kz;
    if (this.act === "dodge") {
      // The dash fades out toward the end.
      const k = 1 - Math.pow(this.actT / this.actLen, 2) * 0.6;
      vx = this.dodgeX * k + this.kx;
      vz = this.dodgeZ * k + this.kz;
    }
    const decay = Math.exp(-dt * 7);
    this.kx *= decay;
    this.kz *= decay;
    const px = this.x;
    const pz = this.z;
    this.x += vx * dt;
    this.z += vz * dt;
    pushOut(this, FIGHTER_RADIUS, solids);
    this.speed = Math.hypot(this.x - px, this.z - pz) / dt;

    // Stamina comes back unless swinging, running or dodging.
    if ((this.act === "idle" || this.act === "recover" || this.act === "draw") && !this.sprinting) {
      this.stamina = Math.min(MAX_STAMINA, this.stamina + (this.blocking ? STAMINA_REGEN_BLOCKING : STAMINA_REGEN) * dt);
    }

    const jump = input.jump && !this.jumpWas;
    this.jumpWas = input.jump;
    if (jump && this.onGround && this.act !== "stagger" && this.act !== "dodge" && this.stamina >= JUMP_STAMINA) {
      this.vy = JUMP_SPEED;
      this.stamina -= JUMP_STAMINA;
      events.push({ type: "jump" });
    }
    if (this.y > 0 || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
      }
    }
    return events;
  }

  /**
   * Took a hit from someone at (fromX, fromZ): a block costs stamina (and
   * breaks the guard when it runs out); a clean hit makes it flinch.
   */
  receive(blocked: boolean, drain: number, fromX: number, fromZ: number) {
    const dx = this.x - fromX;
    const dz = this.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    if (blocked) {
      this.stamina -= drain;
      this.kx += (dx / d) * KNOCKBACK * 0.45;
      this.kz += (dz / d) * KNOCKBACK * 0.45;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.blocking = false;
        this.start("stagger", GUARD_BREAK_SECONDS);
      }
      return;
    }
    this.kx += (dx / d) * KNOCKBACK;
    this.kz += (dz / d) * KNOCKBACK;
    if (this.act !== "recover" && this.act !== "dodge") this.start("stagger", FLINCH_SECONDS);
    this.queued = false;
    this.draw = 0;
  }
}

// ---- Seeing others and hitting them ------------------------------------------

/** Another fighter as this client sees it (from its pose). */
export interface FighterView {
  id: string;
  team: TeamId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  blocking: boolean;
  shield: boolean;
  alive: boolean;
  /** Mid-dodge: nothing touches it. */
  dodging?: boolean;
}

export interface Strike {
  target: string;
  blocked: boolean;
  /** Health taken. */
  damage: number;
  /** Stamina the target loses (only when blocked). */
  drain: number;
}

/** Whether `target`'s guard faces something coming from (fromX, fromZ). */
function guarded(target: FighterView, fromX: number, fromZ: number, arrow: boolean): boolean {
  if (!target.blocking || (arrow && !target.shield)) return false;
  const toward = yawTo(fromX - target.x, fromZ - target.z);
  return Math.abs(angleDiff(toward, target.yaw)) <= (target.shield ? SHIELD_ARC : BLOCK_ARC) / 2;
}

/** Does the straight line between two points pass through a pillar? */
function pillarBetween(ax: number, az: number, bx: number, bz: number): boolean {
  for (const [px, pz] of PILLARS) {
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
    if (Math.hypot(ax + dx * t - px, az + dz * t - pz) < PILLAR_RADIUS * 0.8) return true;
  }
  return false;
}

/** What a melee swing from `me` hits: every enemy in reach and in front (a wide swing can hit two). */
export function meleeStrikes(me: FighterView, gear: Gear, others: FighterView[]): Strike[] {
  const w = WEAPONS[gear.w];
  const out: Strike[] = [];
  for (const t of others) {
    if (!t.alive || t.dodging || t.team === me.team || t.id === me.id) continue;
    const dx = t.x - me.x;
    const dz = t.z - me.z;
    const dist = Math.hypot(dx, dz);
    if (dist > w.reach + FIGHTER_RADIUS || Math.abs(t.y - me.y) > 1.4) continue;
    if (dist > 0.7 && Math.abs(angleDiff(yawTo(dx, dz), me.yaw)) > w.arc / 2 + Math.atan2(FIGHTER_RADIUS, dist)) continue;
    if (pillarBetween(me.x, me.z, t.x, t.z)) continue;
    const blocked = guarded(t, me.x, me.z, false);
    out.push({
      target: t.id,
      blocked,
      damage: Math.round(blocked ? w.damage * w.pierce : w.damage),
      drain: blocked ? w.damage * w.drain * (t.shield ? SHIELD_DRAIN : 1) : 0,
    });
  }
  return out;
}

// ---- Arrows -------------------------------------------------------------------

export interface Arrow {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
}

/** An arrow leaving `f`'s eyes where it looks, faster and stronger the more it was drawn. */
export function launchArrow(f: Fighter, draw: number): Arrow {
  const speed = ARROW_MIN_SPEED + (ARROW_MAX_SPEED - ARROW_MIN_SPEED) * draw;
  const [fx, fz] = forward(f.yaw);
  const c = Math.cos(f.pitch);
  return {
    x: f.x + fx * 0.5,
    y: f.y + EYE_HEIGHT - 0.1,
    z: f.z + fz * 0.5,
    vx: fx * c * speed,
    vy: Math.sin(f.pitch) * speed,
    vz: fz * c * speed,
    damage: Math.round(ARROW_MIN_DAMAGE + (WEAPONS.arco.damage - ARROW_MIN_DAMAGE) * draw),
  };
}

/** Where an arrow is `t` seconds after it left. */
export function arrowAt(a: Arrow, t: number): [number, number, number] {
  return [a.x + a.vx * t, a.y + a.vy * t - (ARROW_GRAVITY * t * t) / 2, a.z + a.vz * t];
}

export type ArrowResult = { stop: false } | { stop: true; strike?: Strike };

/**
 * Moves an arrow from `t0` to `t1` seconds of flight: it stops in the
 * ground, the wall, a pillar or a fighter of the other team (the shooter's
 * phone decides the hit, like melee). Heads take more damage.
 */
export function flyArrow(a: Arrow, t0: number, t1: number, shooterTeam: TeamId, others: FighterView[]): ArrowResult {
  const steps = Math.max(1, Math.ceil((t1 - t0) / 0.01));
  for (let k = 1; k <= steps; k++) {
    const [x, y, z] = arrowAt(a, t0 + ((t1 - t0) * k) / steps);
    if (y <= 0 || Math.hypot(x, z) >= ARENA_RADIUS || t1 > 4) return { stop: true };
    for (const [px, pz] of PILLARS) if (Math.hypot(x - px, z - pz) < PILLAR_RADIUS) return { stop: true };
    for (const t of others) {
      if (!t.alive || t.dodging || t.team === shooterTeam) continue;
      if (Math.hypot(x - t.x, z - t.z) > FIGHTER_RADIUS + 0.05 || y < t.y || y > t.y + FIGHTER_HEIGHT) continue;
      const blocked = guarded(t, t.x - a.vx, t.z - a.vz, true);
      const head = y > t.y + EYE_HEIGHT - 0.2;
      const damage = blocked ? 0 : Math.round(a.damage * (head ? HEADSHOT : 1));
      return { stop: true, strike: { target: t.id, blocked, damage, drain: blocked ? a.damage * SHIELD_DRAIN : 0 } };
    }
  }
  return { stop: false };
}

// ---- Spawns and items -----------------------------------------------------------

/** Where fighter `i` of a team of `n` starts, facing the middle. */
export function spawnPoint(team: TeamId, i: number, n: number): { x: number; z: number; yaw: number } {
  const side = team === "red" ? -1 : 1;
  const z = (i - (n - 1) / 2) * 2.6;
  return { x: side * (ARENA_RADIUS - 2.5), z, yaw: yawTo(-side, 0) };
}

export interface ArenaItem {
  kind: ItemKind;
  x: number;
  z: number;
}

/** Items whose id starts with this come back a while after being taken (potions). */
export const RESPAWN_PREFIX = "p";

/**
 * The items laid out for a round: mirrored weapon pairs (same weapon on both
 * sides, so it's fair) plus one in the middle, shuffled by the seed; and
 * with `potions`, two mirrored pairs of potions.
 */
export function roundItems(seed: number, round: number, potions = false): Record<string, ArenaItem> {
  const rand = mulberry32((seed ^ Math.imul(round + 1, 0x85ebca6b)) >>> 0);
  const pairs: ItemKind[] = ["espada", "escudo", "lanza", "maza", "arco", "espada"];
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  // Spots on the red half (x < 0); blue's are their mirror.
  const spots: [number, number][] = [
    [-11, 6.5],
    [-11, -6.5],
    [-5.5, 3],
    [-5.5, -3],
    [-4, 11],
    [-4, -11],
  ];
  const items: Record<string, ArenaItem> = {};
  spots.forEach(([x, z], i) => {
    items[`i${i}r`] = { kind: pairs[i], x, z };
    items[`i${i}b`] = { kind: pairs[i], x: -x, z: -z };
  });
  items.c = { kind: rand() < 0.5 ? "hacha" : "maza", x: 0, z: 0 };
  if (potions) {
    const potionSpots: [number, number][] = [
      [-8.5, 0],
      [-1.5, 13.5],
    ];
    potionSpots.forEach(([x, z], i) => {
      items[`${RESPAWN_PREFIX}${i}r`] = { kind: "pocion", x, z };
      items[`${RESPAWN_PREFIX}${i}b`] = { kind: "pocion", x: -x, z: -z };
    });
  }
  return items;
}

/** How close a fighter has to be to pick an item up. */
export const PICK_RADIUS = 1.6;

/** Is this item worth getting? (bots use it; people decide for themselves) */
export function wants(gear: Gear, kind: ItemKind, hp = MAX_HP): boolean {
  if (kind === "pocion") return hp < 65;
  if (kind === "escudo") return !gear.sh && gear.w !== "arco";
  if (gear.w === "daga") return true;
  return false;
}

// ---- Bots -----------------------------------------------------------------------

export interface BotMind {
  /** Seconds before the next attack decision. */
  wait: number;
  strafe: number;
  strafeT: number;
  /** Seconds of block left. */
  blockT: number;
  /** Enemy wind-ups already reacted to (by id → act start). */
  seen: Record<string, number>;
  /** Bow: draw to release at. */
  releaseAt: number;
  /** Swings left to chain in this flurry, and the swing it last pressed for. */
  chain: number;
  pressFor: number;
}

export function newMind(): BotMind {
  return { wait: 0.5, strafe: 0, strafeT: 0, blockT: 0, seen: {}, releaseAt: 0.8, chain: 0, pressFor: -1 };
}

/** What a bot sees of an enemy: its view plus what it's doing and with what. */
export interface BotEnemy extends FighterView {
  act: Act;
  /** Server time (ms) the act started, to notice a new wind-up. */
  actAt: number;
  weapon: WeaponId;
}

export interface BotWorld {
  enemies: BotEnemy[];
  items: { id: string; kind: ItemKind; x: number; z: number }[];
}

/**
 * A bot's input for this step: go for a better weapon (or a potion when
 * hurt) if one is near, then close in running (or keep its distance with
 * the bow), strafe, attack in short combos when in reach, and block or dodge
 * some of the swings it sees coming. `pick` = an item to grab.
 */
export function botInput(
  f: Fighter,
  gear: Gear,
  hp: number,
  mind: BotMind,
  world: BotWorld,
  dt: number,
  rand: () => number
): { input: FighterInput; pick?: string } {
  const input: FighterInput = { ...IDLE_INPUT, yaw: f.yaw, pitch: 0 };
  const alive = world.enemies.filter((e) => e.alive);
  let target: BotEnemy | null = null;
  let targetDist = Infinity;
  for (const e of alive) {
    const d = Math.hypot(e.x - f.x, e.z - f.z);
    if (d < targetDist) {
      target = e;
      targetDist = d;
    }
  }

  // Something worth getting close by, and not much farther than the fight (potions: farther when hurt).
  let goal: { x: number; z: number } | null = null;
  let pick: string | undefined;
  let itemDist = Infinity;
  for (const it of world.items) {
    if (!wants(gear, it.kind, hp)) continue;
    const d = Math.hypot(it.x - f.x, it.z - f.z);
    const range = it.kind === "pocion" ? 14 : 7;
    if (d < itemDist && (d < range || d < targetDist * 0.8)) {
      itemDist = d;
      goal = it;
      if (d < PICK_RADIUS * 0.8) pick = it.id;
    }
  }

  const turnTo = (yaw: number, rate: number) => {
    const d = angleDiff(yaw, f.yaw);
    input.yaw = f.yaw + Math.max(-rate * dt, Math.min(rate * dt, d));
  };

  mind.strafeT -= dt;
  if (mind.strafeT <= 0) {
    mind.strafe = rand() < 0.3 ? 0 : rand() < 0.5 ? -1 : 1;
    mind.strafeT = 0.5 + rand() * 1.0;
  }

  if (goal && !pick && (!target || itemDist < targetDist)) {
    turnTo(yawTo(goal.x - f.x, goal.z - f.z), 8);
    input.mz = 1;
    input.sprint = itemDist > 4 && f.stamina > 40;
  } else if (target) {
    const w = WEAPONS[gear.w];
    const dx = target.x - f.x;
    const dz = target.z - f.z;
    if (w.ranged) {
      // Lead the target a little and aim up for the drop.
      const flight = targetDist / 40;
      const aim = yawTo(dx + (rand() - 0.5) * 0.6, dz + (rand() - 0.5) * 0.6);
      turnTo(aim, 6);
      input.pitch = Math.atan2(ARROW_GRAVITY * flight * flight * 0.5, targetDist) + 0.02;
      input.mz = targetDist < 7 ? -1 : targetDist > 13 ? 1 : 0;
      input.mx = mind.strafe;
      if (targetDist < 4 && f.stamina > 40 && rand() < 0.02) input.dodge = true;
      const facing = Math.abs(angleDiff(aim, f.yaw)) < 0.12;
      if (f.act === "draw") input.attack = f.draw < mind.releaseAt;
      else if (f.act === "idle" && facing && mind.wait <= 0) {
        input.attack = true;
        mind.releaseAt = 0.55 + rand() * 0.45;
        mind.wait = 0.25 + rand() * 0.5;
      }
    } else {
      turnTo(yawTo(dx, dz), 7);
      const close = w.reach * 0.85;
      input.mz = targetDist > close ? 1 : targetDist < w.reach * 0.45 ? -0.6 : 0;
      input.sprint = targetDist > 7 && f.stamina > 50;
      input.mx = targetDist < 6 ? mind.strafe * 0.8 : 0;
      // A swing it sees coming: block it, dodge it, or (sometimes) take it.
      if (target.act === "windup" && mind.seen[target.id] !== target.actAt) {
        mind.seen[target.id] = target.actAt;
        const reach = WEAPONS[target.weapon].reach + 1;
        const aimed = Math.abs(angleDiff(yawTo(f.x - target.x, f.z - target.z), target.yaw)) < 0.8;
        if (targetDist < reach && aimed) {
          const r = rand();
          if (r < (gear.sh ? 0.6 : 0.4)) mind.blockT = WEAPONS[target.weapon].windup + 0.2;
          else if (r < 0.7 && f.stamina > 35) {
            input.dodge = true;
            input.mx = rand() < 0.5 ? -1 : 1;
            input.mz = -0.4;
          }
        }
      }
      if (mind.blockT > 0) {
        mind.blockT -= dt;
        input.block = f.stamina > 15;
      } else if (f.act === "recover" && mind.chain > 0) {
        // Keep the flurry going: one press per swing, once the recovery accepts it.
        if (mind.pressFor !== f.combo && f.actT > f.actLen * 0.25) {
          mind.pressFor = f.combo;
          input.attack = true;
          mind.chain--;
        }
      } else if (
        f.act === "idle" &&
        mind.wait <= 0 &&
        targetDist < w.reach + 0.2 &&
        Math.abs(angleDiff(yawTo(dx, dz), f.yaw)) < 0.35 &&
        f.stamina > w.stamina
      ) {
        input.attack = true;
        mind.chain = rand() < 0.5 ? 1 + Math.floor(rand() * 2) : 0;
        mind.wait = 0.2 + rand() * 0.6;
      }
    }
  }
  mind.wait -= dt;

  // Steer around a pillar right ahead.
  const [fx, fz] = forward(input.yaw);
  for (const [px, pz] of PILLARS) {
    const ax = px - f.x;
    const az = pz - f.z;
    const along = ax * fx + az * fz;
    if (along > 0 && along < 2.2 && Math.abs(ax * -fz + az * fx) < PILLAR_RADIUS + FIGHTER_RADIUS + 0.2 && input.mz > 0) {
      input.mx = ax * -fz + az * fx > 0 ? -1 : 1;
    }
  }
  return { input, pick };
}

export const BOT_NAMES = ["Sir Tornillo", "Lady Chispa", "Don Yunque", "Sir Bulón", "Lady Remache", "Don Cerrojo"];
