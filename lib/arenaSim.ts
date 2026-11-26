/**
 * Arena medieval: the arena, the weapons and how a fighter moves and fights.
 * Pure (no Firebase, no DOM): each phone runs its own fighter with it (and
 * the bot host runs the bots), the bots' brains live here too.
 *
 * Units are meters and seconds. The arena (a map, lib/arenaMaps.ts: the
 * ground, walls, pillars, the void) is on the x/z plane; red starts at -x
 * and blue at +x. Yaw 0 looks toward -z (like a
 * three.js camera), so forward is (-sin yaw, -cos yaw) and right is
 * (cos yaw, -sin yaw).
 */

import { mulberry32 } from "./random";
import {
  FALL_DEPTH,
  MAPS,
  bladeIncoming,
  blockedAt,
  clampToMap,
  ffaSpawn,
  isVoid,
  routeStep,
  sightBlocked,
  solidAt,
  supportAt,
  teamSpawn,
  topAt,
  type ArenaMap,
} from "./arenaMaps";

const deg = (d: number) => (d * Math.PI) / 180;

/** The default map (the coliseum); the arena's geometry lives in lib/arenaMaps.ts. */
const COLISEO = MAPS.coliseo;

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
/** Walking down a slope or a ramp keeps the feet on it (a bigger drop is a fall). */
const SNAP_DOWN = 0.3;
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

/**
 * Parada perfecta: a block that started at most this long before a melee
 * strike lands parries it (no damage, no stamina lost) and leaves the
 * attacker reeling for `PARRY_STAGGER`. Blocks started within `PARRY_REARM`
 * of letting go of the last one don't count, so tapping block over and over
 * doesn't fish for parries.
 */
export const PARRY_WINDOW = 0.22;
const PARRY_REARM = 0.45;
export const PARRY_STAGGER = 0.85;

/**
 * Patada: short, quick and weak, but no guard stops it — a kick into a raised
 * guard drops it and the defender reels (`KICK_GUARD_BREAK`). It can be
 * dodged. One every `KICK_COOLDOWN` seconds.
 */
export const KICK_SECONDS = 0.5;
/** When the foot lands, into the kick. */
export const KICK_HIT = 0.17;
export const KICK_COOLDOWN = 2.5;
export const KICK_REACH = 1.45;
const KICK_ARC = deg(80);
export const KICK_DAMAGE = 6;
const KICK_STAMINA = 12;
/** The kick carries the kicker forward a little (m/s, fading), like a swing's lunge. */
const KICK_STEP = 3;
const KICK_PUSH = 8.5;
const KICK_FLINCH = 0.4;
const KICK_GUARD_BREAK = 0.85;
const KICK_GUARD_DRAIN = 20;

/** The special meter: full at this, filled by hits landed, blocks and parries (see `strike` in lib/arena.ts). */
export const SPECIAL_MAX = 100;

export type WeaponId = "daga" | "espada" | "hacha" | "maza" | "lanza" | "arco" | "martillo" | "mangual";
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
  /**
   * Against a shield: this much goes through instead of `pierce`, and the
   * shield doesn't soften the drain (the flail's chain wraps around it).
   */
  shieldPierce?: number;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  daga: { label: "Daga", damage: 13, reach: 1.6, arc: deg(75), windup: 0.2, recover: 0.24, stamina: 9, pierce: 0, drain: 0.8 },
  espada: { label: "Espada", damage: 24, reach: 2.15, arc: deg(105), windup: 0.3, recover: 0.3, stamina: 15, pierce: 0, drain: 1 },
  hacha: { label: "Hacha", damage: 38, reach: 2.05, arc: deg(95), windup: 0.5, recover: 0.42, stamina: 25, pierce: 0.2, drain: 1.6 },
  maza: { label: "Maza", damage: 30, reach: 1.9, arc: deg(95), windup: 0.42, recover: 0.36, stamina: 21, pierce: 0.35, drain: 1.8 },
  lanza: { label: "Lanza", damage: 26, reach: 3.0, arc: deg(40), windup: 0.36, recover: 0.34, stamina: 17, pierce: 0, drain: 1 },
  arco: { label: "Arco", damage: 40, reach: 30, arc: 0, windup: 0, recover: 0.3, stamina: 10, pierce: 0, drain: 1, ranged: true },
  // Slow and heavy: a blocked blow nearly empties the guard.
  martillo: { label: "Martillo", damage: 36, reach: 2.0, arc: deg(85), windup: 0.6, recover: 0.48, stamina: 28, pierce: 0.25, drain: 2.6 },
  // Wide arcing swings; against a shield almost half goes through.
  mangual: { label: "Mangual", damage: 27, reach: 2.3, arc: deg(115), windup: 0.42, recover: 0.38, stamina: 20, pierce: 0.1, drain: 1.3, shieldPierce: 0.45 },
};

/**
 * The special attack ("Golpe especial") of each weapon family, once the meter
 * is full: a wind-up everyone can read, then the blow (`hit` seconds into the
 * active part), then a recovery. Swords, daggers and the flail spin hitting
 * all around; axes, maces and hammers slam the ground (no guard stops it, a
 * jump does); the spear lunges far; the bow looses three full arrows.
 */
export type SpecialKind = "torbellino" | "terremoto" | "estocada" | "triple";

export interface SpecialSpec {
  label: string;
  windup: number;
  active: number;
  hit: number;
  recover: number;
  damage: number;
  reach: number;
  arc: number;
  /** Fraction through a block (the slam ignores guards). */
  pierce: number;
  push: number;
  stagger: number;
}

export const SPECIALS: Record<SpecialKind, SpecialSpec> = {
  torbellino: { label: "Torbellino", windup: 0.45, active: 0.55, hit: 0.15, recover: 0.35, damage: 26, reach: 2.6, arc: Math.PI * 2, pierce: 0.4, push: 8, stagger: 0.5 },
  terremoto: { label: "Terremoto", windup: 0.7, active: 0.12, hit: 0, recover: 0.65, damage: 32, reach: 3.4, arc: Math.PI * 2, pierce: 1, push: 12, stagger: 0.9 },
  estocada: { label: "Estocada", windup: 0.5, active: 0.32, hit: 0.2, recover: 0.45, damage: 40, reach: 2.9, arc: deg(40), pierce: 0.5, push: 10, stagger: 0.6 },
  triple: { label: "Triple flecha", windup: 0.4, active: 0.05, hit: 0, recover: 0.45, damage: 40, reach: 30, arc: 0, pierce: 0, push: 0, stagger: 0 },
};
/** The spear's lunge: speed during the active part. */
const LUNGE_DASH = 10;
/** The triple arrow: angle between arrows. */
export const TRIPLE_SPREAD = 0.09;
/** The slam doesn't reach someone this high in the air. */
const SLAM_JUMP = 0.45;

export function specialOf(w: WeaponId): SpecialKind {
  if (w === "arco") return "triple";
  if (w === "lanza") return "estocada";
  if (w === "hacha" || w === "maza" || w === "martillo") return "terremoto";
  return "torbellino";
}

export function specialLength(kind: SpecialKind): number {
  const sp = SPECIALS[kind];
  return sp.windup + sp.active + sp.recover;
}

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

/** What a fighter is doing; others see it in the pose to animate it. Append only (poses send the index; old clients read unknown ones as idle). */
export type Act = "idle" | "windup" | "recover" | "draw" | "stagger" | "dodge" | "kick" | "special";
export const ACTS: Act[] = ["idle", "windup", "recover", "draw", "stagger", "dodge", "kick", "special"];

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
  /** Pressed: a kick (when its cooldown is over). */
  kick: boolean;
  /** Pressed: the special attack. The caller only sets it while the meter (in the room's state) is full. */
  special: boolean;
}

export const IDLE_INPUT: FighterInput = { mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, attack: false, block: false, sprint: false, dodge: false, kick: false, special: false };

export type FighterEvent =
  /** An attack starts winding up (a whoosh), a jump or a dodge. */
  | { type: "windup" }
  | { type: "jump" }
  | { type: "dodge" }
  /** The swing lands now: the caller checks what it hit. */
  | { type: "strike" }
  /** A kick starts, and its foot lands now (the caller checks what it hit). */
  | { type: "kick" }
  | { type: "kickHit" }
  /** The special starts (the caller spends the meter), and its blow lands now. */
  | { type: "special"; kind: SpecialKind }
  | { type: "specialHit"; kind: SpecialKind }
  /** The bow shoots with this much draw (0–1), `yawOff` to the side of where it looks (the triple arrow). */
  | { type: "shoot"; draw: number; yawOff?: number }
  /** It fell off the map (the bridge). */
  | { type: "fell" };

/** How a hit taken lands (besides blocked and the stamina it costs). */
export interface HitExtra {
  /** I parried it: nothing happens to me. */
  parried?: boolean;
  /** A kick (or a slam) knocked my guard aside. */
  guardBreak?: boolean;
  kick?: boolean;
  /** Knockback speed (m/s) and stagger (s), when not the usual. */
  push?: number;
  stagger?: number;
}

/** Something round fighters bump into (pillars, other fighters). */
export interface Solid {
  x: number;
  z: number;
  r: number;
}


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
  /** Seconds until the next kick. */
  kickCd = 0;
  /** The special being done (while `act` is "special"). */
  specialKind: SpecialKind = "torbellino";
  /** Seconds holding the current block, whether it can parry, and seconds since the last one ended. */
  private blockAge = 0;
  private parryOk = false;
  private sinceBlock = 10;
  private hitDone = false;
  private kickWas = false;
  private specialWas = false;
  private queued = false;
  private dodgeX = 0;
  private dodgeZ = 0;
  private attackWas = false;
  private jumpWas = false;
  private dodgeWas = false;
  /** On the ground (not jumping or falling), the ground's height under it, and whether it fell into the void. */
  grounded = true;
  floor = 0;
  fell = false;
  /** The map's push multiplier (knockback is stronger on the bridge). */
  private pushMul = 1;
  /** Set on the ground of its spot (a walkway, a slope) at its first step. */
  private placed = false;

  constructor(
    public x: number,
    public z: number,
    yaw: number
  ) {
    this.yaw = yaw;
  }

  get onGround(): boolean {
    return this.grounded;
  }

  /** Seconds since a block that can still parry started (Infinity when not blocking or it can't). */
  get parryAge(): number {
    return this.blocking && this.parryOk ? this.blockAge : Infinity;
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

  /** One step on `map`; `solids` are the other fighters (the map's pillars and trunks are added). */
  step(input: FighterInput, gear: Gear, dt: number, solids: Solid[], map: ArenaMap = COLISEO): FighterEvent[] {
    const events: FighterEvent[] = [];
    this.pushMul = map.pushMul;
    if (!this.placed) {
      this.placed = true;
      const top = topAt(map, this.x, this.z);
      if (Number.isFinite(top) && Math.abs(top - this.y) > 0.4) this.y = top;
    }
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
    const kick = input.kick && !this.kickWas;
    this.kickWas = input.kick;
    const special = input.special && !this.specialWas;
    this.specialWas = input.special;
    this.kickCd = Math.max(0, this.kickCd - dt);

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
    } else if (this.act === "kick") {
      if (!this.hitDone && this.actT >= KICK_HIT) {
        this.hitDone = true;
        events.push({ type: "kickHit" });
      } else if (!this.hitDone && this.actT - dt <= 0) {
        this.kx += fx * KICK_STEP;
        this.kz += fz * KICK_STEP;
      }
      if (this.actT >= this.actLen) this.start("idle", 0);
    } else if (this.act === "special") {
      const sp = SPECIALS[this.specialKind];
      if (!this.hitDone && this.actT >= sp.windup + sp.hit) {
        this.hitDone = true;
        if (this.specialKind === "triple") {
          for (const off of [-TRIPLE_SPREAD, 0, TRIPLE_SPREAD]) events.push({ type: "shoot", draw: 1, yawOff: off });
        } else {
          events.push({ type: "specialHit", kind: this.specialKind });
        }
      }
      if (this.actT >= this.actLen) this.start("idle", 0);
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

    // A kick or the special: from the same moments as a dodge (a raised guard drops for them).
    const ready = this.act === "idle" || (this.act === "recover" && this.actT > this.actLen * 0.5) || this.act === "draw";
    if (special && ready && this.onGround) {
      this.specialKind = specialOf(gear.w);
      this.queued = false;
      this.draw = 0;
      this.combo = 0;
      this.hitDone = false;
      this.start("special", specialLength(this.specialKind));
      events.push({ type: "special", kind: this.specialKind });
    } else if (kick && ready && this.onGround && this.kickCd <= 0 && this.stamina >= KICK_STAMINA) {
      this.stamina -= KICK_STAMINA;
      this.kickCd = KICK_COOLDOWN;
      this.queued = false;
      this.draw = 0;
      this.combo = 0;
      this.hitDone = false;
      this.start("kick", KICK_SECONDS);
      events.push({ type: "kick" });
    }

    // Blocking: only when free; it also cancels an attack being wound up (a feint).
    const canBlock = !weapon.ranged && (this.act === "idle" || this.act === "windup");
    const wasBlocking = this.blocking;
    if (input.block && canBlock) {
      if (this.act === "windup") this.start("idle", 0);
      this.blocking = this.stamina > 0;
    } else {
      this.blocking = false;
    }
    if (this.blocking) {
      if (!wasBlocking) {
        this.parryOk = this.sinceBlock >= PARRY_REARM;
        this.blockAge = 0;
      } else this.blockAge += dt;
    } else {
      this.sinceBlock = wasBlocking ? 0 : this.sinceBlock + dt;
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
    if (this.act === "kick") speed *= 0.35;
    if (this.act === "special") speed *= this.specialKind === "torbellino" ? 0.55 : this.specialKind === "triple" ? 0.4 : 0.1;
    if (!this.onGround) speed *= 0.9;
    const rx = -fz;
    const rz = fx;
    let vx = (fx * mz + rx * mx) * speed + this.kx;
    let vz = (fz * mz + rz * mx) * speed + this.kz;
    if (this.act === "special" && this.specialKind === "estocada") {
      // The lunge: a dash straight ahead during the blow.
      const sp = SPECIALS.estocada;
      if (this.actT >= sp.windup && this.actT < sp.windup + sp.active) {
        vx = fx * LUNGE_DASH + this.kx;
        vz = fz * LUNGE_DASH + this.kz;
      }
    }
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
    // Walls and boxes stop each axis on its own (so you slide along them); stuck inside one, you may leave.
    const stuck = blockedAt(map, this.x, this.z, this.y, FIGHTER_RADIUS);
    const nx = this.x + vx * dt;
    if (stuck || !blockedAt(map, nx, this.z, this.y, FIGHTER_RADIUS)) this.x = nx;
    else this.kx = 0;
    const nz = this.z + vz * dt;
    if (stuck || !blockedAt(map, this.x, nz, this.y, FIGHTER_RADIUS)) this.z = nz;
    else this.kz = 0;
    clampToMap(map, this, FIGHTER_RADIUS, solids.length ? [...map.circles, ...solids] : map.circles);
    this.speed = Math.hypot(this.x - px, this.z - pz) / dt;

    // Stamina comes back unless swinging, running or dodging.
    if ((this.act === "idle" || this.act === "recover" || this.act === "draw") && !this.sprinting) {
      this.stamina = Math.min(MAX_STAMINA, this.stamina + (this.blocking ? STAMINA_REGEN_BLOCKING : STAMINA_REGEN) * dt);
    }

    const jump = input.jump && !this.jumpWas;
    this.jumpWas = input.jump;
    const busy = this.act === "stagger" || this.act === "dodge" || this.act === "kick" || this.act === "special";
    if (jump && this.grounded && !busy && this.stamina >= JUMP_STAMINA) {
      this.vy = JUMP_SPEED;
      this.stamina -= JUMP_STAMINA;
      events.push({ type: "jump" });
    }
    // The ground under the feet: walk up small steps, follow slopes down, fall off ledges (and into the void).
    const floor = supportAt(map, this.x, this.z, this.y);
    this.floor = floor;
    if (this.vy > 0 || this.y > floor + 1e-4) {
      if (this.grounded && this.vy <= 0 && this.y - floor <= SNAP_DOWN) {
        this.y = floor;
      } else {
        this.vy -= GRAVITY * dt;
        this.y += this.vy * dt;
        if (this.y <= floor) {
          this.y = floor;
          this.vy = 0;
        }
      }
    } else {
      this.y = floor;
      this.vy = 0;
    }
    this.grounded = this.y <= floor + 1e-4 && this.vy <= 0;
    if (!Number.isFinite(floor) && this.y < -FALL_DEPTH && !this.fell) {
      this.fell = true;
      events.push({ type: "fell" });
    }
    return events;
  }

  /**
   * Took a hit from someone at (fromX, fromZ): a block costs stamina (and
   * breaks the guard when it runs out); a clean hit makes it flinch.
   */
  receive(blocked: boolean, drain: number, fromX: number, fromZ: number, extra: HitExtra = {}) {
    const dx = this.x - fromX;
    const dz = this.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    const mul = this.pushMul;
    if (extra.parried) {
      // My parry: just a little step back.
      this.kx += (dx / d) * KNOCKBACK * 0.2;
      this.kz += (dz / d) * KNOCKBACK * 0.2;
      return;
    }
    if (extra.guardBreak) {
      // The guard is knocked aside: it drops and I reel.
      this.stamina = Math.max(0, this.stamina - drain);
      this.blocking = false;
      const push = (extra.push ?? KICK_PUSH) * mul;
      this.kx += (dx / d) * push;
      this.kz += (dz / d) * push;
      if (this.act !== "special" && this.act !== "dodge") this.start("stagger", extra.stagger ?? KICK_GUARD_BREAK);
      this.queued = false;
      this.draw = 0;
      return;
    }
    if (blocked) {
      this.stamina -= drain;
      this.kx += (dx / d) * KNOCKBACK * 0.45 * mul;
      this.kz += (dz / d) * KNOCKBACK * 0.45 * mul;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.blocking = false;
        this.start("stagger", GUARD_BREAK_SECONDS);
      }
      return;
    }
    // Mid-special the knight doesn't flinch (it still gets pushed, a little).
    const armored = this.act === "special";
    const push = (extra.push ?? KNOCKBACK) * (armored ? 0.3 : 1) * mul;
    this.kx += (dx / d) * push;
    this.kz += (dz / d) * push;
    if (armored || this.act === "dodge") return;
    // A kick or a special also stops a recovery; a plain hit doesn't.
    if (this.act !== "recover" || extra.kick || extra.stagger) this.start("stagger", extra.stagger ?? (extra.kick ? KICK_FLINCH : FLINCH_SECONDS));
    this.queued = false;
    this.draw = 0;
  }

  /** A trap's push (the blade): away, and a short flinch. */
  shove(vx: number, vz: number) {
    this.kx += vx;
    this.kz += vz;
    if (this.act !== "special" && this.act !== "dodge") this.start("stagger", FLINCH_SECONDS);
    this.queued = false;
    this.draw = 0;
  }

  /** Back on its feet somewhere else (a respawn, a new wave). */
  reset(x: number, z: number, yaw: number) {
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vy = 0;
    this.kx = 0;
    this.kz = 0;
    this.yaw = yaw;
    this.grounded = true;
    this.fell = false;
    this.placed = false;
    this.stamina = MAX_STAMINA;
    this.blocking = false;
    this.draw = 0;
    this.start("idle", 0);
  }

  /** My blow was parried: knocked back and wide open for a moment. */
  parried(fromX: number, fromZ: number) {
    const dx = this.x - fromX;
    const dz = this.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.kx += (dx / d) * KNOCKBACK * 0.6;
    this.kz += (dz / d) * KNOCKBACK * 0.6;
    this.queued = false;
    this.combo = 0;
    this.blocking = false;
    this.start("stagger", PARRY_STAGGER);
  }
}

// ---- Seeing others and hitting them ------------------------------------------

/** Another fighter as this client sees it (from its pose). */
export interface FighterView {
  id: string;
  /** Its side: the team, or its own id in «Todos contra todos». */
  team: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  blocking: boolean;
  shield: boolean;
  alive: boolean;
  /** Mid-dodge: nothing touches it. */
  dodging?: boolean;
  /** Seconds since a block that can parry started (absent or Infinity: none). */
  blockAge?: number;
}

export interface Strike {
  target: string;
  blocked: boolean;
  /** Health taken. */
  damage: number;
  /** Stamina the target loses (when blocked, or its guard knocked aside). */
  drain: number;
  /** A perfect parry (blocked too): no damage, and the attacker reels. */
  parried?: boolean;
  kick?: boolean;
  /** The target's guard was knocked aside (a kick or a slam into a raised guard). */
  guardBreak?: boolean;
  /** Part of a special attack (doesn't fill the meter). */
  special?: boolean;
  /** Knockback speed and stagger seconds when not the usual. */
  push?: number;
  stagger?: number;
}

const canParry = (t: FighterView) => (t.blockAge ?? Infinity) <= PARRY_WINDOW;

/** Whether `target`'s guard faces something coming from (fromX, fromZ). */
function guarded(target: FighterView, fromX: number, fromZ: number, arrow: boolean): boolean {
  if (!target.blocking || (arrow && !target.shield)) return false;
  const toward = yawTo(fromX - target.x, fromZ - target.z);
  return Math.abs(angleDiff(toward, target.yaw)) <= (target.shield ? SHIELD_ARC : BLOCK_ARC) / 2;
}

/** What a melee swing from `me` hits: every enemy in reach and in front (a wide swing can hit two). */
export function meleeStrikes(me: FighterView, gear: Gear, others: FighterView[], map: ArenaMap = COLISEO): Strike[] {
  const w = WEAPONS[gear.w];
  const out: Strike[] = [];
  for (const t of others) {
    if (!t.alive || t.dodging || t.team === me.team || t.id === me.id) continue;
    const dx = t.x - me.x;
    const dz = t.z - me.z;
    const dist = Math.hypot(dx, dz);
    if (dist > w.reach + FIGHTER_RADIUS || Math.abs(t.y - me.y) > 1.4) continue;
    if (dist > 0.7 && Math.abs(angleDiff(yawTo(dx, dz), me.yaw)) > w.arc / 2 + Math.atan2(FIGHTER_RADIUS, dist)) continue;
    if (sightBlocked(map, me.x, me.z, t.x, t.z, Math.min(me.y, t.y))) continue;
    const blocked = guarded(t, me.x, me.z, false);
    if (blocked && canParry(t)) {
      out.push({ target: t.id, blocked, parried: true, damage: 0, drain: 0 });
      continue;
    }
    const wraps = t.shield && w.shieldPierce !== undefined;
    out.push({
      target: t.id,
      blocked,
      damage: Math.round(blocked ? w.damage * (wraps ? w.shieldPierce! : w.pierce) : w.damage),
      drain: blocked ? w.damage * w.drain * (t.shield && !wraps ? SHIELD_DRAIN : 1) : 0,
    });
  }
  return out;
}

/**
 * A blow decided before the target's newest pose arrived (the network is
 * late): `t` as seen a moment later, with `blockAge` measured at the blow's
 * time. If its guard faces the attacker at (fromX, fromZ) and was raised
 * within the window before the blow, the blow becomes a parry; else it stays.
 * Kicks and the slam can't be parried.
 */
export function lateParry(st: Strike, t: FighterView, fromX: number, fromZ: number): Strike {
  if (st.parried || st.blocked || st.kick || st.guardBreak || !guarded(t, fromX, fromZ, false) || !canParry(t)) return st;
  return { target: st.target, blocked: true, parried: true, special: st.special, damage: 0, drain: 0 };
}

/** The distance to `t` if it's an enemy in reach and in front (same rules as a swing), else null. */
function inFront(me: FighterView, t: FighterView, reach: number, arc: number, map: ArenaMap, maxDy = 1.4): number | null {
  if (!t.alive || t.dodging || t.team === me.team || t.id === me.id) return null;
  const dx = t.x - me.x;
  const dz = t.z - me.z;
  const dist = Math.hypot(dx, dz);
  if (dist > reach + FIGHTER_RADIUS || Math.abs(t.y - me.y) > maxDy) return null;
  if (arc < Math.PI * 2 && dist > 0.7 && Math.abs(angleDiff(yawTo(dx, dz), me.yaw)) > arc / 2 + Math.atan2(FIGHTER_RADIUS, dist)) return null;
  if (sightBlocked(map, me.x, me.z, t.x, t.z, Math.min(me.y, t.y))) return null;
  return dist;
}

/** What a kick hits: no guard stops it (a raised one is knocked aside); a dodge does. */
export function kickStrikes(me: FighterView, others: FighterView[], map: ArenaMap = COLISEO): Strike[] {
  const out: Strike[] = [];
  for (const t of others) {
    if (inFront(me, t, KICK_REACH, KICK_ARC, map, 0.8) === null) continue;
    const breaks = t.blocking;
    out.push({
      target: t.id,
      blocked: false,
      kick: true,
      guardBreak: breaks,
      damage: KICK_DAMAGE,
      drain: breaks ? KICK_GUARD_DRAIN : 0,
      push: KICK_PUSH,
      stagger: breaks ? KICK_GUARD_BREAK : KICK_FLINCH,
    });
  }
  return out;
}

/**
 * What a special's blow hits. The slam: everyone around, weaker toward the
 * edge, no guard stops it (a raised one is knocked aside) but a jump does.
 * The spin and the lunge: blocked like a swing (more goes through) and they
 * can be parried.
 */
export function specialStrikes(me: FighterView, kind: SpecialKind, others: FighterView[], map: ArenaMap = COLISEO): Strike[] {
  const sp = SPECIALS[kind];
  const out: Strike[] = [];
  if (kind === "triple") return out;
  const slam = kind === "terremoto";
  for (const t of others) {
    if (slam && t.y - me.y > SLAM_JUMP) continue;
    const dist = inFront(me, t, sp.reach, sp.arc, map);
    if (dist === null) continue;
    if (slam) {
      out.push({
        target: t.id,
        blocked: false,
        special: true,
        guardBreak: t.blocking,
        damage: Math.round(sp.damage * (1 - 0.4 * Math.min(1, dist / sp.reach))),
        drain: t.blocking ? KICK_GUARD_DRAIN : 0,
        push: sp.push,
        stagger: sp.stagger,
      });
      continue;
    }
    const blocked = guarded(t, me.x, me.z, false);
    if (blocked && canParry(t)) {
      out.push({ target: t.id, blocked, parried: true, special: true, damage: 0, drain: 0 });
      continue;
    }
    out.push({
      target: t.id,
      blocked,
      special: true,
      damage: Math.round(blocked ? sp.damage * sp.pierce : sp.damage),
      drain: blocked ? sp.damage * 1.2 * (t.shield ? SHIELD_DRAIN : 1) : 0,
      push: blocked ? sp.push * 0.4 : sp.push,
      stagger: blocked ? undefined : sp.stagger,
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
export function launchArrow(f: Fighter, draw: number, yawOff = 0): Arrow {
  const speed = ARROW_MIN_SPEED + (ARROW_MAX_SPEED - ARROW_MIN_SPEED) * draw;
  const [fx, fz] = forward(f.yaw + yawOff);
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
export function flyArrow(a: Arrow, t0: number, t1: number, shooterTeam: string, others: FighterView[], map: ArenaMap = COLISEO): ArrowResult {
  const steps = Math.max(1, Math.ceil((t1 - t0) / 0.01));
  for (let k = 1; k <= steps; k++) {
    const [x, y, z] = arrowAt(a, t0 + ((t1 - t0) * k) / steps);
    if (t1 > 4 || solidAt(map, x, y, z)) return { stop: true };
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

/** Where fighter `i` of a team of `n` starts, facing the middle (`ffa`: its own spot, «Todos contra todos»). */
export function spawnPoint(team: string, i: number, n: number, map: ArenaMap = COLISEO, ffa = false): { x: number; z: number; yaw: number } {
  if (ffa) return ffaSpawn(map, Math.max(0, i));
  return teamSpawn(map, team === "red" ? -1 : 1, Math.max(0, i), Math.max(1, n));
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
 * sides, so it's fair) plus a heavy one in the middle, shuffled by the seed:
 * always a sword and a shield, and four of the rest. With `potions`, two
 * mirrored pairs of potions.
 */
export function roundItems(seed: number, round: number, potions = false, map: ArenaMap = COLISEO): Record<string, ArenaItem> {
  const rand = mulberry32((seed ^ Math.imul(round + 1, 0x85ebca6b)) >>> 0);
  const shuffle = <T,>(list: T[]) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const rest = shuffle<ItemKind>(["lanza", "maza", "arco", "mangual", "martillo", "espada"]).slice(0, 4);
  const pairs = shuffle<ItemKind>(["espada", "escudo", ...rest]);
  // Spots on the red half (x < 0); blue's are their mirror.
  const spots = map.items;
  const items: Record<string, ArenaItem> = {};
  spots.forEach(([x, z], i) => {
    items[`i${i}r`] = { kind: pairs[i], x, z };
    items[`i${i}b`] = { kind: pairs[i], x: -x, z: -z };
  });
  items.c = { kind: (["hacha", "martillo", "hacha", "maza"] as ItemKind[])[Math.floor(rand() * 4)], x: map.center[0], z: map.center[1] };
  if (potions) {
    map.potions.forEach(([x, z], i) => {
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
  /** Seconds until it raises its guard to parry a swing it saw coming (−1: none planned). */
  parryIn: number;
  /** Seconds before it considers kicking again (on top of the kick's own cooldown). */
  kickWait: number;
  /** 0–1: how sharp it is (reactions, parries, how often it waits). 1 = the usual bot. */
  skill: number;
  /** Where its route goes next (around walls, up a ramp), the goal it was for, and when to look again. */
  way: [number, number] | null;
  wayFor: [number, number];
  wayT: number;
}

export function newMind(skill = 1): BotMind {
  return { wait: 0.5, strafe: 0, strafeT: 0, blockT: 0, seen: {}, releaseAt: 0.8, chain: 0, pressFor: -1, parryIn: -1, kickWait: 1, skill, way: null, wayFor: [0, 0], wayT: 0 };
}

/** What a bot sees of an enemy: its view plus what it's doing and with what. */
export interface BotEnemy extends FighterView {
  act: Act;
  /** Server time (ms) the act started, to notice a new wind-up, and how long it lasts (s). */
  actAt: number;
  actLen?: number;
  weapon: WeaponId;
}

export interface BotWorld {
  enemies: BotEnemy[];
  items: { id: string; kind: ItemKind; x: number; z: number }[];
  /** Server time now (to time a parry) and the bot's special meter. */
  now?: number;
  special?: number;
  /** The map (default: the coliseum). */
  map?: ArenaMap;
  /** Something that hurts at (x, z) now or soon: a trap, outside the ring, a rain circle. */
  danger?: (x: number, z: number) => boolean;
  /** «Rey de la colina»: the zone to hold. */
  hill?: { x: number; z: number; r: number };
  /** How far it sees (fog). */
  sight?: number;
  /** Seconds into the round (it jumps the trap pit's blade when it comes). */
  t?: number;
}

/** How often a bot tries a perfect parry on a swing it sees coming (else block, dodge or take it). */
const BOT_PARRY = 0.22;
/** How often a bot kicks a raised guard in reach, per decision. */
const BOT_KICK_GUARD = 0.55;
/** Directions a bot tries when the way ahead is bad (radians off what it wanted). */
const DETOURS = [0.5, -0.5, 1, -1, 1.5, -1.5, 2.2, -2.2, Math.PI];

/**
 * A bot's input for this step: go for a better weapon (or a potion when
 * hurt) if one is near, then close in running (or keep its distance with
 * the bow), strafe, attack in short combos when in reach, and block or dodge
 * some of the swings it sees coming. On the map it takes routes around walls
 * and up ramps, jumps onto low crates, keeps away from the void, traps and
 * marked danger, and on the bridge it kicks rivals standing with the void
 * behind them. `pick` = an item to grab.
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
  const map = world.map ?? COLISEO;
  const skill = mind.skill ?? 1;
  const input: FighterInput = { ...IDLE_INPUT, yaw: f.yaw, pitch: 0 };
  const sight = world.sight ?? Infinity;
  const alive = world.enemies.filter((e) => e.alive);
  let target: BotEnemy | null = null;
  let targetDist = Infinity;
  for (const e of alive) {
    const d = Math.hypot(e.x - f.x, e.z - f.z);
    if (d < targetDist && d <= sight) {
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
    if (d < itemDist && (d < range || d < targetDist * 0.8) && !world.danger?.(it.x, it.z)) {
      itemDist = d;
      goal = it;
      if (d < PICK_RADIUS * 0.8) pick = it.id;
    }
  }
  // The hill: hold it unless a fight is right here.
  const hill = world.hill;
  if (hill && !(goal && itemDist < 5) && targetDist > 4.5 && Math.hypot(hill.x - f.x, hill.z - f.z) > hill.r * 0.6) {
    goal = hill;
    itemDist = Math.hypot(hill.x - f.x, hill.z - f.z);
    pick = undefined;
  }
  // Nobody in sight (fog, or all hidden): toward the middle.
  if (!target && !goal) goal = { x: map.hill.x, z: map.hill.z };

  const turnTo = (yaw: number, rate: number) => {
    const d = angleDiff(yaw, f.yaw);
    const r = rate * (0.6 + 0.4 * skill);
    input.yaw = f.yaw + Math.max(-r * dt, Math.min(r * dt, d));
  };
  /** The next spot on the way to (x, z): straight, or around walls and up ramps. */
  mind.wayT -= dt;
  const wayTo = (x: number, z: number, y: number): [number, number] => {
    if (mind.wayT <= 0 || Math.hypot(mind.wayFor[0] - x, mind.wayFor[1] - z) > 2) {
      mind.way = map.nav.length || map.blocks.length ? routeStep(map, f.x, f.z, f.y, x, z, y) : null;
      mind.wayFor = [x, z];
      mind.wayT = 0.4;
    }
    return mind.way ?? [x, z];
  };

  mind.strafeT -= dt;
  if (mind.strafeT <= 0) {
    mind.strafe = rand() < 0.3 ? 0 : rand() < 0.5 ? -1 : 1;
    mind.strafeT = 0.5 + rand() * 1.0;
  }

  // The meter is full: the special, when it would reach someone.
  if (target && (world.special ?? 0) >= SPECIAL_MAX && (f.act === "idle" || f.act === "draw") && f.onGround) {
    const kind = specialOf(gear.w);
    const facing = Math.abs(angleDiff(yawTo(target.x - f.x, target.z - f.z), f.yaw));
    const near =
      kind === "terremoto" ? targetDist < SPECIALS.terremoto.reach * 0.85 :
      kind === "torbellino" ? targetDist < SPECIALS.torbellino.reach * 0.85 :
      kind === "estocada" ? targetDist < SPECIALS.estocada.reach + 2.5 && facing < 0.25 && !isVoid(map, f.x + Math.sin(-f.yaw) * 3, f.z - Math.cos(f.yaw) * 3, f.y) :
      targetDist < 22 && facing < 0.15;
    if (near && rand() < dt * 3) input.special = true;
  }

  if (goal && !pick && (!target || itemDist < targetDist)) {
    const [wx, wz] = wayTo(goal.x, goal.z, f.y);
    turnTo(yawTo(wx - f.x, wz - f.z), 8);
    input.mz = itemDist < 0.6 ? 0 : 1;
    input.sprint = itemDist > 4 && f.stamina > 40;
  } else if (target) {
    const w = WEAPONS[gear.w];
    const dx = target.x - f.x;
    const dz = target.z - f.z;
    // Far, or out of reach of a straight walk: follow the route first.
    const way = targetDist > 2.5 ? wayTo(target.x, target.z, target.y) : null;
    const detour = way && Math.hypot(way[0] - target.x, way[1] - target.z) > 0.5;
    if (detour) {
      turnTo(yawTo(way[0] - f.x, way[1] - f.z), 8);
      input.mz = 1;
      input.sprint = f.stamina > 45;
    } else if (w.ranged) {
      // Lead the target a little and aim up for the drop (and at its height).
      const flight = targetDist / 40;
      const aim = yawTo(dx + (rand() - 0.5) * 0.6, dz + (rand() - 0.5) * 0.6);
      turnTo(aim, 6);
      input.pitch = Math.atan2(ARROW_GRAVITY * flight * flight * 0.5 + (target.y - f.y), targetDist) + 0.02;
      input.mz = targetDist < 7 ? -1 : targetDist > 13 ? 1 : 0;
      input.mx = mind.strafe;
      if (targetDist < 4 && f.stamina > 40 && rand() < 0.02) input.dodge = true;
      const facing = Math.abs(angleDiff(aim, f.yaw)) < 0.12;
      if (f.act === "draw") input.attack = f.draw < mind.releaseAt;
      else if (f.act === "idle" && facing && mind.wait <= 0) {
        input.attack = true;
        mind.releaseAt = 0.55 + rand() * 0.45;
        mind.wait = 0.25 + rand() * 0.5 + (1 - skill) * 0.8;
      }
    } else {
      turnTo(yawTo(dx, dz), 7);
      const close = w.reach * 0.85;
      input.mz = targetDist > close ? 1 : targetDist < w.reach * 0.45 ? -0.6 : 0;
      input.sprint = targetDist > 7 && f.stamina > 50;
      input.mx = targetDist < 6 ? mind.strafe * 0.8 : 0;
      // The void right behind the target (the bridge): a kick would throw it off.
      const ux = dx / (targetDist || 1);
      const uz = dz / (targetDist || 1);
      const pushable = !!map.chasm && isVoid(map, target.x + ux * 1.7, target.z + uz * 1.7, target.y);
      // A swing it sees coming: parry it, block it, dodge it, or (sometimes) take it.
      if (target.act === "windup" && mind.seen[target.id] !== target.actAt) {
        mind.seen[target.id] = target.actAt;
        const reach = WEAPONS[target.weapon].reach + 1;
        const aimed = Math.abs(angleDiff(yawTo(f.x - target.x, f.z - target.z), target.yaw)) < 0.8;
        if (targetDist < reach && aimed) {
          const r = rand();
          // When the blow lands: what's left of the wind-up.
          const left = target.actLen !== undefined && world.now !== undefined ? target.actLen - (world.now - target.actAt) / 1000 : -1;
          if (r < BOT_PARRY * skill && left > 0.15 && mind.blockT <= 0) {
            // Let go of any guard now and raise it again just before the blow (a little early or late at times).
            mind.parryIn = Math.max(0.02, left - 0.12 + (rand() - 0.5) * 0.12);
          } else if (r < (gear.sh ? 0.6 : 0.4) * (0.5 + 0.5 * skill)) mind.blockT = WEAPONS[target.weapon].windup + 0.2;
          else if (r < 0.7 && f.stamina > 35) {
            input.dodge = true;
            input.mx = rand() < 0.5 ? -1 : 1;
            input.mz = -0.4;
          }
        }
      }
      // A special winding up close by: mostly get away from it.
      if (target.act === "special" && mind.seen[target.id] !== target.actAt) {
        mind.seen[target.id] = target.actAt;
        const kind = specialOf(target.weapon);
        if (targetDist < SPECIALS[kind].reach + 1.5 && f.stamina > 25) {
          const r = rand();
          if (r < 0.55 * skill) {
            input.dodge = true;
            input.mx = rand() < 0.5 ? -1 : 1;
            input.mz = -1;
          } else if (r < 0.75 && kind === "terremoto") input.jump = true;
          else if (kind !== "terremoto") mind.blockT = SPECIALS[kind].windup + 0.3;
        }
      }
      mind.kickWait -= dt;
      if (mind.parryIn >= 0) {
        mind.parryIn -= dt;
        if (mind.parryIn < 0) mind.blockT = 0.35;
      } else if (mind.blockT > 0) {
        mind.blockT -= dt;
        input.block = f.stamina > 15;
      } else if (
        f.act === "idle" &&
        mind.kickWait <= 0 &&
        f.kickCd <= 0 &&
        targetDist < KICK_REACH + 0.25 &&
        Math.abs(angleDiff(yawTo(dx, dz), f.yaw)) < 0.5
      ) {
        // Kick a raised guard open often, someone with the void behind almost always, and now and then just to push.
        mind.kickWait = 0.6 + rand() * 0.8;
        if (rand() < (pushable ? 0.8 : target.blocking ? BOT_KICK_GUARD : 0.12)) input.kick = true;
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
        mind.chain = rand() < 0.5 * skill ? 1 + Math.floor(rand() * 2) : 0;
        mind.wait = 0.2 + rand() * 0.6 + (1 - skill) * 0.7;
      }
      // On the bridge, close in rather than strafe toward an edge.
      if (map.chasm && pushable) input.mx = 0;
    }
  }
  mind.wait -= dt;

  // Steer around a pillar or a trunk right ahead.
  const [fx, fz] = forward(input.yaw);
  for (const c of map.circles) {
    const ax = c.x - f.x;
    const az = c.z - f.z;
    const along = ax * fx + az * fz;
    if (along > 0 && along < 2.2 && Math.abs(ax * -fz + az * fx) < c.r + FIGHTER_RADIUS + 0.2 && input.mz > 0) {
      input.mx = ax * -fz + az * fx > 0 ? -1 : 1;
    }
  }

  steerSafe(f, input, map, world.danger);
  // The blade sweeping in: over it.
  if (world.t !== undefined && f.grounded && map.traps.length && bladeIncoming(map, world.t, f.x, f.z) && rand() < 0.4 + 0.55 * skill) input.jump = true;
  return { input, pick };
}

/**
 * Keeps a bot's move (and dodge) off the void, out of walls and danger: if
 * the way it wants is bad, the nearest good direction (or standing still);
 * a low crate in the way is jumped; standing in danger, it runs out.
 */
function steerSafe(f: Fighter, input: FighterInput, map: ArenaMap, danger?: (x: number, z: number) => boolean) {
  const [fx, fz] = forward(input.yaw);
  const rx = -fz;
  const rz = fx;
  const bad = (x: number, z: number) => isVoid(map, x, z, f.y) || !!danger?.(x, z);
  const wall = (x: number, z: number) => blockedAt(map, x, z, f.y, FIGHTER_RADIUS);
  const ok = (dx: number, dz: number, far: number) => {
    for (const d of [0.7, far]) {
      const x = f.x + dx * d;
      const z = f.z + dz * d;
      if (bad(x, z) || wall(x, z)) return false;
    }
    return true;
  };
  let wx = fx * input.mz + rx * input.mx;
  let wz = fz * input.mz + rz * input.mx;
  const len = Math.hypot(wx, wz);
  const inDanger = !!danger?.(f.x, f.z);
  if (inDanger) {
    // Out, whichever way is safe and closest to what it wanted.
    const base = len > 0.1 ? Math.atan2(wz, wx) : Math.atan2(-f.z, -f.x);
    for (const off of [0, ...DETOURS]) {
      const a = base + off;
      if (ok(Math.cos(a), Math.sin(a), 2.6)) {
        wx = Math.cos(a);
        wz = Math.sin(a);
        input.sprint = f.stamina > 20;
        break;
      }
    }
  } else if (len > 0.1) {
    const ux = wx / len;
    const uz = wz / len;
    // A low crate right ahead: jump onto it.
    const ax = f.x + ux * 0.75;
    const az = f.z + uz * 0.75;
    if (wall(ax, az) && f.grounded && !bad(ax, az)) {
      const top = supportAt(map, ax, az, f.y + 1.0);
      if (top > f.y + 0.2 && !blockedAt(map, ax, az, f.y + 0.98, FIGHTER_RADIUS)) input.jump = true;
    }
    if (!ok(ux, uz, 1.5) && !input.jump) {
      let found = false;
      const base = Math.atan2(uz, ux);
      for (const off of DETOURS) {
        const a = base + off;
        if (ok(Math.cos(a), Math.sin(a), 1.5)) {
          wx = Math.cos(a) * len;
          wz = Math.sin(a) * len;
          found = true;
          break;
        }
      }
      if (!found) {
        wx = 0;
        wz = 0;
      }
    }
  }
  input.mz = wx * fx + wz * fz;
  input.mx = wx * rx + wz * rz;
  if (input.mz <= 0.3) input.sprint = false;
  // A dodge must land somewhere safe.
  if (input.dodge) {
    let mx = input.mx;
    let mz = input.mz;
    if (Math.hypot(mx, mz) < 0.2) {
      mx = 0;
      mz = -1;
    }
    const l = Math.hypot(mx, mz);
    const dx = (fx * mz + rx * mx) / l;
    const dz = (fz * mz + rz * mx) / l;
    if (!ok(dx, dz, 2.8)) input.dodge = false;
  }
}

export const BOT_NAMES = ["Sir Tornillo", "Lady Chispa", "Don Yunque", "Sir Bulón", "Lady Remache", "Don Cerrojo"];
