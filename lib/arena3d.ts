import * as THREE from "three";
import { mulberry32 } from "./random";
import type { TeamId } from "./teams";
import {
  ARENA_RADIUS,
  EYE_HEIGHT,
  PILLARS,
  PILLAR_RADIUS,
  WEAPONS,
  type Act,
  type ArenaItem,
  type Gear,
  type ItemKind,
  type WeaponId,
} from "./arenaSim";

/**
 * Arena medieval in 3D (three.js), browser only: a sand arena inside a
 * stone wall, stands full of people, pillars, torches and the team gates.
 * Knights are built from boxes and cylinders and animated from their poses
 * alone (walking, winding up, swinging, blocking, drawing the bow, falling),
 * so rivals and bots look the same as your own knight in third person. In
 * first person your knight is hidden and your hands (weapon, shield, bow)
 * are drawn on top, in their own pass.
 *
 * World axes: the arena's x/z plane is the ground, y is up; a knight with
 * yaw 0 faces -z.
 */

export type ArenaCamera = "primera" | "tercera";

const TEAM_COLORS: Record<TeamId, number> = { red: 0xdc2646, blue: 0x1d9bd1 };
const TEAM_LIGHT: Record<TeamId, string> = { red: "#fb3a5d", blue: "#22d3ee" };
const STEEL = 0xb8c2cc;
const DARK_STEEL = 0x5b6470;
const WOOD = 0x8a5a2b;
const LEATHER = 0x5c3b1e;
const GOLD = 0xd4a72c;

export interface KnightPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  act: Act;
  /** Seconds into the act, and how long it lasts (wind-up, recover, stagger). */
  actT: number;
  actLen: number;
  blocking: boolean;
  /** Bow draw 0–1. */
  draw: number;
  /** Walking speed (m/s). */
  speed: number;
  alive: boolean;
  gear: Gear;
}

// ---- Textures ----------------------------------------------------------------

function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void, repeat = true): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function sandTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#d9b77e";
    ctx.fillRect(0, 0, 256, 256);
    const rand = mulberry32(5);
    for (let i = 0; i < 2600; i++) {
      const v = rand();
      ctx.fillStyle = v > 0.5 ? `rgba(255,240,210,${0.08 + rand() * 0.1})` : `rgba(120,85,40,${0.06 + rand() * 0.1})`;
      const s = 1 + rand() * 2.5;
      ctx.fillRect(rand() * 256, rand() * 256, s, s);
    }
    // Raked lines.
    ctx.strokeStyle = "rgba(140,100,50,0.12)";
    ctx.lineWidth = 2;
    for (let y = 8; y < 256; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, y + Math.sin(x / 20) * 2);
      ctx.stroke();
    }
  });
}

function stoneTexture(base: string): THREE.CanvasTexture {
  return canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 128);
    const rand = mulberry32(9);
    const rows = 4;
    const h = 128 / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? 32 : 0;
      for (let x = -off; x < 256; x += 64) {
        const shade = Math.floor(rand() * 30) - 15;
        ctx.fillStyle = `rgba(${shade > 0 ? 255 : 0},${shade > 0 ? 255 : 0},${shade > 0 ? 255 : 0},${Math.abs(shade) / 160})`;
        ctx.fillRect(x + 2, r * h + 2, 60, h - 4);
      }
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(0, r * h, 256, 2);
      for (let x = -off; x < 256; x += 64) ctx.fillRect(x, r * h, 2, h);
    }
  });
}

function glowTexture(): THREE.CanvasTexture {
  const t = canvasTexture(
    64,
    64,
    (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, "rgba(255,255,255,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    },
    false
  );
  t.name = "glow";
  return t;
}

/** Name over a knight's head, with a health bar. */
function tagTexture(name: string, color: string, hp: number): THREE.CanvasTexture {
  return canvasTexture(
    256,
    80,
    (ctx) => {
      ctx.font = "bold 30px system-ui, sans-serif";
      const w = Math.min(248, ctx.measureText(name).width + 24);
      ctx.fillStyle = "rgba(2,6,23,0.7)";
      ctx.beginPath();
      ctx.roundRect(128 - w / 2, 4, w, 44, 12);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name, 128, 27, 232);
      ctx.fillStyle = "rgba(2,6,23,0.75)";
      ctx.fillRect(48, 56, 160, 16);
      ctx.fillStyle = hp > 50 ? "#4ade80" : hp > 25 ? "#facc15" : "#f87171";
      ctx.fillRect(50, 58, (156 * Math.max(0, hp)) / 100, 12);
    },
    false
  );
}

// ---- Weapons ------------------------------------------------------------------

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const phong = (color: number) => new THREE.MeshPhongMaterial({ color, shininess: 80, specular: 0x999999 });

/**
 * A weapon held at the origin (the grip), pointing along -z (blade, head or
 * tip forward). Sizes in meters.
 */
function weaponMesh(kind: WeaponId): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const steel = phong(STEEL);
  const wood = lambert(WOOD);
  const leather = lambert(LEATHER);
  const gold = phong(GOLD);
  switch (kind) {
    case "daga":
      add(new THREE.BoxGeometry(0.04, 0.012, 0.3), steel, 0, 0, -0.2);
      add(new THREE.BoxGeometry(0.12, 0.025, 0.03), gold, 0, 0, -0.04);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.1), leather, 0, 0, 0.03);
      break;
    case "espada":
      add(new THREE.BoxGeometry(0.06, 0.014, 0.85), steel, 0, 0, -0.5);
      add(new THREE.ConeGeometry(0.03, 0.08, 4).rotateX(-Math.PI / 2), steel, 0, 0, -0.96);
      add(new THREE.BoxGeometry(0.24, 0.03, 0.04), gold, 0, 0, -0.06);
      add(new THREE.BoxGeometry(0.035, 0.035, 0.16), leather, 0, 0, 0.04);
      add(new THREE.SphereGeometry(0.035, 8, 6), gold, 0, 0, 0.13);
      break;
    case "hacha": {
      add(new THREE.CylinderGeometry(0.025, 0.03, 0.95, 8).rotateX(Math.PI / 2), wood, 0, 0, -0.35);
      const head = new THREE.Shape();
      head.moveTo(0, -0.05);
      head.lineTo(0.12, -0.13);
      head.quadraticCurveTo(0.22, 0, 0.12, 0.13);
      head.lineTo(0, 0.05);
      head.closePath();
      // Drawn outward (x) along the shaft (y), then laid along the shaft (-z).
      const blade = new THREE.ExtrudeGeometry(head, { depth: 0.025, bevelEnabled: false });
      blade.translate(0, 0, -0.0125);
      blade.rotateX(-Math.PI / 2);
      add(blade, steel, 0, 0, -0.74);
      break;
    }
    case "maza": {
      add(new THREE.CylinderGeometry(0.025, 0.03, 0.7, 8).rotateX(Math.PI / 2), wood, 0, 0, -0.25);
      add(new THREE.IcosahedronGeometry(0.1, 0), lambert(DARK_STEEL, { flatShading: true }), 0, 0, -0.65);
      const spike = new THREE.ConeGeometry(0.025, 0.08, 5);
      const up = new THREE.Vector3(0, 1, 0);
      for (const [x, y, z] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, -1],
      ]) {
        const s = new THREE.Mesh(spike, steel);
        s.position.set(x * 0.1, y * 0.1, z * 0.1 - 0.65);
        s.quaternion.setFromUnitVectors(up, new THREE.Vector3(x, y, z));
        g.add(s);
      }
      break;
    }
    case "lanza":
      add(new THREE.CylinderGeometry(0.02, 0.022, 2.0, 8).rotateX(Math.PI / 2), wood, 0, 0, -0.6);
      add(new THREE.ConeGeometry(0.045, 0.28, 6).rotateX(-Math.PI / 2), steel, 0, 0, -1.72);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.12), leather, 0, 0, 0.1);
      break;
    case "arco": {
      // Vertical bow in the x/y plane; the grip at the origin.
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.62, 0.12), new THREE.Vector3(0, 0, -0.22), new THREE.Vector3(0, -0.62, 0.12));
      add(new THREE.TubeGeometry(curve, 16, 0.018, 6, false), wood);
      const string = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.62, 0.12), new THREE.Vector3(0, 0, 0.12), new THREE.Vector3(0, -0.62, 0.12)]),
        new THREE.LineBasicMaterial({ color: 0xf5f5f4 })
      );
      g.add(string);
      g.userData.string = string;
      add(new THREE.BoxGeometry(0.04, 0.12, 0.04), leather);
      break;
    }
  }
  return g;
}

function shieldMesh(team: TeamId | null): THREE.Group {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 20).rotateX(Math.PI / 2), lambert(team ? TEAM_COLORS[team] : WOOD));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 6, 24), phong(DARK_STEEL));
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), phong(GOLD));
  boss.position.z = -0.03;
  g.add(face, rim, boss);
  return g;
}

function arrowMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 5).rotateX(Math.PI / 2), lambert(WOOD)));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 4).rotateX(-Math.PI / 2), phong(STEEL));
  tip.position.z = -0.38;
  const fl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.002, 0.1), lambert(0xf8fafc));
  fl.position.z = 0.3;
  const fl2 = fl.clone();
  fl2.rotation.z = Math.PI / 2;
  g.add(tip, fl, fl2);
  return g;
}

function itemMesh(kind: ItemKind): THREE.Group {
  return kind === "escudo" ? shieldMesh(null) : weaponMesh(kind);
}

// ---- Knights ------------------------------------------------------------------

interface Limb {
  pivot: THREE.Group;
}

interface Knight {
  team: TeamId;
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  legs: [Limb, Limb];
  arms: [Limb, Limb];
  hand: THREE.Group;
  offHand: THREE.Group;
  weapon: THREE.Group | null;
  weaponKind: WeaponId | null;
  shield: THREE.Group | null;
  shadow: THREE.Mesh;
  tag: THREE.Sprite;
  tagKey: string;
  label: string;
  pose: KnightPose | null;
  walk: number;
  /** Seconds since it fell (for the fall animation), -1 standing. */
  fallen: number;
  hp: number;
}

function knightMesh(team: TeamId, glow: THREE.Texture): Omit<Knight, "tag" | "tagKey" | "label" | "pose" | "walk" | "fallen" | "hp"> {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const armor = phong(STEEL);
  const darkArmor = phong(DARK_STEEL);
  const cloth = lambert(TEAM_COLORS[team]);
  const leather = lambert(LEATHER);
  const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  };

  const legs: Limb[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.13, 0.95, 0);
    pivot.add(box(0.17, 0.5, 0.19, darkArmor, 0, -0.25, 0));
    pivot.add(box(0.16, 0.45, 0.17, armor, 0, -0.68, 0));
    pivot.add(box(0.17, 0.08, 0.28, leather, 0, -0.9, -0.04));
    body.add(pivot);
    legs.push({ pivot });
  }

  const torso = new THREE.Group();
  torso.position.y = 0.95;
  body.add(torso);
  torso.add(box(0.5, 0.58, 0.3, armor, 0, 0.32, 0));
  // Tabard in the team's color, front and back, with a belt.
  torso.add(box(0.44, 0.7, 0.32, cloth, 0, 0.2, 0));
  torso.add(box(0.46, 0.06, 0.33, leather, 0, 0.02, 0));
  const pauldron = new THREE.SphereGeometry(0.13, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(pauldron, armor);
    p.position.set(side * 0.29, 0.56, 0);
    torso.add(p);
  }

  const head = new THREE.Group();
  head.position.y = 0.66;
  torso.add(head);
  const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.3, 14), armor);
  helm.position.y = 0.12;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), armor);
  top.position.y = 0.27;
  const visor = box(0.2, 0.035, 0.04, lambert(0x0b0b0f), 0, 0.16, -0.14);
  const plume = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.3), cloth);
  plume.position.set(0, 0.42, 0.04);
  head.add(helm, top, visor, plume);

  const arms: Limb[] = [];
  let hand = new THREE.Group();
  let offHand = new THREE.Group();
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.rotation.order = "YZX";
    pivot.position.set(side * 0.33, 0.52, 0);
    pivot.add(box(0.13, 0.32, 0.14, armor, 0, -0.16, 0));
    pivot.add(box(0.12, 0.3, 0.13, darkArmor, 0, -0.45, 0));
    pivot.add(box(0.12, 0.1, 0.12, leather, 0, -0.62, 0));
    const grip = new THREE.Group();
    grip.position.y = -0.63;
    pivot.add(grip);
    torso.add(pivot);
    arms.push({ pivot });
    if (side === 1) hand = grip;
    else offHand = grip;
  }

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({ map: glow, color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  shadow.renderOrder = 1;

  return {
    team,
    root,
    body,
    torso,
    head,
    legs: legs as [Limb, Limb],
    arms: arms as [Limb, Limb],
    hand,
    offHand,
    weapon: null,
    weaponKind: null,
    shield: null,
    shadow,
  };
}

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Arm angles: raise forward (x), raise sideways (z), sweep around the body (y). */
interface ArmPose {
  x: number;
  y: number;
  z: number;
}

const ARM_DOWN: ArmPose = { x: 0.15, y: 0, z: 0.08 };
const ARM_GUARD: ArmPose = { x: 0.95, y: 0.15, z: 0.12 };
const ARM_WOUND: ArmPose = { x: 0.35, y: -0.55, z: 1.45 };
const ARM_SWUNG: ArmPose = { x: 0.6, y: 2.1, z: 1.35 };

function mixArm(a: ArmPose, b: ArmPose, t: number): ArmPose {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

/** Where a knight's limbs are for its pose (third person and rivals). */
function animateKnight(k: Knight, p: KnightPose, dt: number) {
  const weapon = WEAPONS[p.gear.w];
  const right = k.arms[1].pivot;
  const left = k.arms[0].pivot;
  let rArm: ArmPose = ARM_GUARD;
  let lArm: ArmPose = p.gear.sh ? { x: 0.7, y: -0.3, z: -0.1 } : ARM_DOWN;
  let twist = 0;
  let lean = 0;
  let thrust = 0;
  let weaponRoll = 0;
  const t = p.actLen > 0 ? clamp01(p.actT / p.actLen) : 0;
  const spear = p.gear.w === "lanza";

  if (weapon.ranged) {
    const aim = Math.PI / 2 + p.pitch;
    lArm = { x: aim, y: 0.25, z: 0 };
    rArm = p.act === "draw" ? { x: aim, y: -0.15 - p.draw * 0.5, z: 0 } : { x: aim - 0.3, y: -0.3, z: 0 };
    twist = 0.2;
  } else if (p.blocking) {
    if (p.gear.sh) lArm = { x: 1.45, y: -0.55, z: 0 };
    else {
      rArm = { x: 1.5, y: 0.8, z: 0.2 };
      weaponRoll = Math.PI / 2;
    }
  } else if (p.act === "windup") {
    if (spear) {
      rArm = mixArm(ARM_GUARD, { x: 1.35, y: 0.1, z: 0.1 }, ease(t));
      thrust = -0.25 * ease(t);
    } else {
      rArm = mixArm(ARM_GUARD, ARM_WOUND, ease(t));
      twist = -0.45 * ease(t);
    }
  } else if (p.act === "recover") {
    const swing = clamp01(t / 0.4);
    const back = clamp01((t - 0.4) / 0.6);
    if (spear) {
      rArm = { x: 1.45, y: 0.1, z: 0.1 };
      thrust = lerp(lerp(-0.25, 0.55, ease(swing)), 0, ease(back));
    } else {
      rArm = mixArm(mixArm(ARM_WOUND, ARM_SWUNG, ease(swing)), ARM_GUARD, ease(back));
      twist = lerp(lerp(-0.45, 0.5, ease(swing)), 0, ease(back));
    }
  } else if (p.act === "stagger") {
    lean = 0.3 * Math.sin(t * Math.PI);
    rArm = { x: 0.4, y: -0.2, z: 0.7 };
    lArm = { x: 0.4, y: 0.2, z: -0.7 };
  }

  const k1 = 1 - Math.exp(-dt * 18);
  right.rotation.x = lerp(right.rotation.x, rArm.x, k1);
  right.rotation.y = lerp(right.rotation.y, rArm.y, k1);
  right.rotation.z = lerp(right.rotation.z, rArm.z, k1);
  left.rotation.x = lerp(left.rotation.x, lArm.x, k1);
  left.rotation.y = lerp(left.rotation.y, lArm.y, k1);
  left.rotation.z = lerp(left.rotation.z, -lArm.z, k1);
  k.torso.rotation.y = lerp(k.torso.rotation.y, twist, k1);
  k.torso.rotation.x = lerp(k.torso.rotation.x, lean, k1);
  right.position.z = lerp(right.position.z, -thrust, k1);
  k.head.rotation.x = lerp(k.head.rotation.x, p.pitch * 0.6, k1);
  if (k.weapon) k.weapon.rotation.z = lerp(k.weapon.rotation.z, weaponRoll, k1);

  // Bow string pulled back with the draw.
  const string = k.weapon?.userData.string as THREE.Line | undefined;
  if (string) {
    const pos = string.geometry.attributes.position as THREE.BufferAttribute;
    pos.setZ(1, 0.12 + (p.act === "draw" ? p.draw * 0.45 : 0));
    pos.needsUpdate = true;
  }

  // Legs swing with the walk.
  const moving = Math.min(1, p.speed / 4.6);
  k.walk += dt * (2 + p.speed * 1.8);
  const swing = Math.sin(k.walk) * 0.65 * moving;
  const air = p.y > 0.05 ? 0.4 : 0;
  k.legs[0].pivot.rotation.x = lerp(k.legs[0].pivot.rotation.x, swing - air, k1);
  k.legs[1].pivot.rotation.x = lerp(k.legs[1].pivot.rotation.x, -swing + air * 0.5, k1);
  k.body.position.y = Math.abs(Math.sin(k.walk)) * 0.04 * moving;
}

// ---- Particles ----------------------------------------------------------------

const PARTICLE_VERT = `
attribute float alpha;
attribute float size;
attribute vec3 pcolor;
uniform float scale;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = alpha;
  vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FRAG = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float r = length(gl_PointCoord - 0.5);
  if (r > 0.5) discard;
  gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.0, r));
}`;

class Particles {
  readonly points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private pos: Float32Array;
  private col: Float32Array;
  private alpha: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private startAlpha: Float32Array;
  private next = 0;

  constructor(
    private max: number,
    additive: boolean,
    private gravity: number
  ) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.startAlpha = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("pcolor", new THREE.BufferAttribute(this.col, 3));
    g.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute("size", new THREE.BufferAttribute(this.size, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 300 } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, size: number, life: number, alpha: number) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.startAlpha[i] = alpha;
    this.alpha[i] = alpha;
  }

  update(dt: number) {
    const drag = Math.exp(-dt * 2);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      const k = i * 3;
      this.vel[k] *= drag;
      this.vel[k + 2] *= drag;
      this.vel[k + 1] -= this.gravity * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] = Math.max(0.02, this.pos[k + 1] + this.vel[k + 1] * dt);
      this.pos[k + 2] += this.vel[k + 2] * dt;
      this.alpha[i] = this.startAlpha[i] * (this.life[i] / this.maxLife[i]);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true;
    a.alpha.needsUpdate = true;
    a.size.needsUpdate = true;
    a.pcolor.needsUpdate = true;
  }

  setScale(scale: number) {
    this.material.uniforms.scale.value = scale;
  }
}

// ---- First-person hands ---------------------------------------------------------

/** Where the held weapon sits in front of the camera, and how it's turned. */
interface HandPose {
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
}

const HAND_IDLE: HandPose = { px: 0.3, py: -0.32, pz: -0.5, rx: 0.25, ry: 0.15, rz: -0.25 };

function handPose(p: KnightPose, bob: number): { right: HandPose; left: HandPose } {
  const w = WEAPONS[p.gear.w];
  const t = p.actLen > 0 ? clamp01(p.actT / p.actLen) : 0;
  let right: HandPose = { ...HAND_IDLE, py: HAND_IDLE.py + bob };
  let left: HandPose = { px: -0.36, py: -0.42 + bob, pz: -0.48, rx: 0, ry: 0.35, rz: 0 };
  if (w.ranged) {
    left = { px: -0.06, py: -0.18, pz: -0.55, rx: 0, ry: 0, rz: 0.12 };
    right = { px: 0.04, py: -0.2, pz: -0.45 + (p.act === "draw" ? p.draw * 0.22 : 0), rx: 0, ry: 0, rz: 0 };
    return { right, left };
  }
  const spear = p.gear.w === "lanza";
  const wound: HandPose = spear ? { px: 0.25, py: -0.28, pz: -0.25, rx: 0, ry: 0.05, rz: -0.1 } : { px: 0.6, py: -0.12, pz: -0.4, rx: 0.4, ry: -0.9, rz: -1.1 };
  const swung: HandPose = spear ? { px: 0.12, py: -0.25, pz: -1.05, rx: 0, ry: 0, rz: -0.1 } : { px: -0.5, py: -0.36, pz: -0.55, rx: 0.1, ry: 0.9, rz: -1.3 };
  const mix = (a: HandPose, b: HandPose, k: number): HandPose => ({
    px: lerp(a.px, b.px, k),
    py: lerp(a.py, b.py, k),
    pz: lerp(a.pz, b.pz, k),
    rx: lerp(a.rx, b.rx, k),
    ry: lerp(a.ry, b.ry, k),
    rz: lerp(a.rz, b.rz, k),
  });
  if (p.blocking) {
    if (p.gear.sh) left = { px: -0.12, py: -0.24, pz: -0.42, rx: 0, ry: 0.1, rz: 0 };
    else right = { px: 0.05, py: -0.16, pz: -0.5, rx: 0.15, ry: 0, rz: Math.PI / 2 - 0.15 };
  } else if (p.act === "windup") {
    right = mix(right, wound, ease(t));
  } else if (p.act === "recover") {
    const swing = clamp01(t / 0.4);
    const back = clamp01((t - 0.4) / 0.6);
    right = mix(mix(wound, swung, ease(swing)), right, ease(back));
  } else if (p.act === "stagger") {
    right = { ...right, py: right.py - 0.15, rz: right.rz - 0.4 };
  }
  return { right, left };
}

// ---- Scene ------------------------------------------------------------------------

export interface ArrowDraw {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/** The arena in 3D on one canvas, seen by one camera. */
export class ArenaScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  /** First-person hands, drawn on top of everything. */
  private handScene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(72, 1, 0.05, 400);
  private glow: THREE.Texture;
  private knights = new Map<string, Knight>();
  private items = new Map<string, { kind: ItemKind; group: THREE.Group }>();
  private arrows = new Map<string, THREE.Group>();
  private sparks = new Particles(300, true, 9);
  private dust = new Particles(240, false, -0.5);
  private flames: THREE.Sprite[] = [];
  private crowd: THREE.InstancedMesh | null = null;
  private crowdBase: THREE.Matrix4[] = [];
  private cheerT = 0;
  private hands = new THREE.Group();
  private handRight = new THREE.Group();
  private handLeft = new THREE.Group();
  private handKind = "";
  private handShield: THREE.Group | null = null;
  private handNow: { right: HandPose; left: HandPose } = { right: { ...HAND_IDLE }, left: { ...HAND_IDLE } };
  private bob = 0;
  private shake = 0;
  private camPos = new THREE.Vector3();
  private camReady = false;
  private rand = mulberry32(42);
  private time = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    opts: { maxDpr?: number } = {}
  ) {
    this.maxDpr = opts.maxDpr ?? 2;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0xf2c48d);
    this.scene.fog = new THREE.Fog(0xf2c48d, 60, 170);
    this.glow = glowTexture();
    this.camera.rotation.order = "YXZ";
    this.build();
    this.scene.add(this.sparks.points, this.dust.points);

    // The hands have their own light, so they read well wherever you stand.
    this.handScene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b4a2a, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(0.5, 1, 0.3);
    this.handScene.add(key);
    this.hands.add(this.handRight, this.handLeft);
    this.handScene.add(this.hands);
  }

  private maxDpr: number;

  private build() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xfff1d6, 0x8a6a3a, 1.5));
    const sun = new THREE.DirectionalLight(0xffe2b0, 1.6);
    sun.position.set(-40, 60, 25);
    s.add(sun);

    // Sky.
    const skyGeo = new THREE.SphereGeometry(300, 32, 16);
    const top = new THREE.Color(0x3a6fb5);
    const hor = new THREE.Color(0xf2c48d);
    const colors: number[] = [];
    const pos = skyGeo.attributes.position;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      c.copy(hor).lerp(top, Math.pow(Math.max(0, pos.getY(i) / 300), 0.5));
      colors.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1;
    s.add(sky);

    // Sand, with a ring in the middle.
    const sand = sandTexture();
    sand.repeat.set(10, 10);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_RADIUS + 0.5, 64), new THREE.MeshLambertMaterial({ map: sand }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 2.85, 48),
      new THREE.MeshBasicMaterial({ color: 0x9a6b35, transparent: true, opacity: 0.45, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    s.add(ring);
    const outside = new THREE.Mesh(new THREE.CircleGeometry(200, 32), lambert(0x8f7a55));
    outside.rotation.x = -Math.PI / 2;
    outside.position.y = -0.05;
    s.add(outside);

    // The wall around the sand.
    const wallTex = stoneTexture("#a39782");
    wallTex.repeat.set(14, 1);
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_RADIUS + 0.3, ARENA_RADIUS + 0.3, 3.2, 64, 1, true),
      new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.BackSide })
    );
    wall.position.y = 1.6;
    s.add(wall);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(ARENA_RADIUS + 0.45, 0.25, 6, 64), lambert(0x8d8270));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 3.2;
    s.add(rim);

    this.buildStands();
    this.buildGates();

    // Pillars.
    const stone = stoneTexture("#b5a98f");
    stone.repeat.set(3, 3);
    const pillarMat = new THREE.MeshLambertMaterial({ map: stone });
    for (const [x, z] of PILLARS) {
      const p = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(PILLAR_RADIUS * 0.85, PILLAR_RADIUS * 0.9, 4.4, 16), pillarMat);
      shaft.position.y = 2.4;
      const base = new THREE.Mesh(new THREE.BoxGeometry(PILLAR_RADIUS * 2.2, 0.35, PILLAR_RADIUS * 2.2), pillarMat);
      base.position.y = 0.17;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(PILLAR_RADIUS * 2.3, 0.4, PILLAR_RADIUS * 2.3), pillarMat);
      cap.position.y = 4.75;
      p.add(shaft, base, cap);
      p.position.set(x, 0, z);
      s.add(p);
    }

    // Torches on the wall.
    const torchMat = lambert(LEATHER);
    for (let i = 0; i < 12; i++) {
      const a = ((i + 0.5) / 12) * Math.PI * 2;
      const r = ARENA_RADIUS + 0.05;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.6, 6), torchMat);
      stick.position.set(x * 0.985, 2.5, z * 0.985);
      stick.rotation.z = Math.cos(a) * 0.4;
      stick.rotation.x = -Math.sin(a) * 0.4;
      s.add(stick);
      const flame = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glow, color: 0xffa23a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
      );
      flame.position.set(x * 0.975, 2.9, z * 0.975);
      flame.scale.setScalar(0.7);
      s.add(flame);
      this.flames.push(flame);
    }
  }

  /** Rising rings of stone seats around the arena, full of people. */
  private buildStands() {
    const s = this.scene;
    const rand = mulberry32(17);
    const tiers = 7;
    const seatTex = stoneTexture("#9c8f78");
    seatTex.repeat.set(30, 1);
    const seatMat = new THREE.MeshLambertMaterial({ map: seatTex, side: THREE.DoubleSide });
    const people: THREE.Vector3[] = [];
    for (let k = 0; k < tiers; k++) {
      const r = ARENA_RADIUS + 0.8 + k * 1.3;
      const y = 3.2 + k * 0.85;
      const riser = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.85, 72, 1, true), seatMat);
      riser.position.y = y + 0.42;
      const step = new THREE.Mesh(new THREE.RingGeometry(r, r + 1.3, 72, 1), seatMat);
      step.rotation.x = -Math.PI / 2;
      step.position.y = y + 0.85;
      s.add(riser, step);
      const around = Math.floor((2 * Math.PI * (r + 0.6)) / 0.62);
      for (let i = 0; i < around; i++) {
        const a = (i / around) * Math.PI * 2 + rand() * 0.02;
        // Leave the gates' sides empty.
        if (Math.abs(Math.sin(a)) < 0.12) continue;
        if (rand() < 0.22) continue;
        people.push(new THREE.Vector3(Math.cos(a) * (r + 0.55), y + 0.85, Math.sin(a) * (r + 0.55)));
      }
    }
    // Outer wall behind the top row.
    const outerR = ARENA_RADIUS + 0.8 + tiers * 1.3;
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(outerR, outerR, 4, 72, 1, true), seatMat);
    outer.position.y = 3.2 + tiers * 0.85 + 1.6;
    s.add(outer);

    const bodyGeo = new THREE.BoxGeometry(0.36, 0.55, 0.3);
    bodyGeo.translate(0, 0.28, 0);
    const headGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    headGeo.translate(0, 0.68, 0);
    const merged = mergeBoxes(bodyGeo, headGeo);
    const crowd = new THREE.InstancedMesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }), people.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const color = new THREE.Color();
    people.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(p.x, p.z) + Math.PI);
      m.compose(p, q, one);
      crowd.setMatrixAt(i, m);
      this.crowdBase.push(m.clone());
      // Half the crowd leans to each team.
      const side = p.x < 0 ? "red" : "blue";
      if (rand() < 0.45) color.set(TEAM_COLORS[side]);
      else color.setHSL(rand(), 0.45, 0.45 + rand() * 0.2);
      crowd.setColorAt(i, color);
    });
    this.crowd = crowd;
    s.add(crowd);
  }

  /** A gate on each team's side, with its banners. */
  private buildGates() {
    const s = this.scene;
    for (const team of ["red", "blue"] as TeamId[]) {
      const side = team === "red" ? -1 : 1;
      const g = new THREE.Group();
      const arch = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.2, 4.4), lambert(0x857a66));
      arch.position.y = 2.1;
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 3.2), lambert(0x4a3018));
      door.position.set(-0.2 * side, 1.5, 0);
      g.add(arch, door);
      for (const z of [-3.2, 3.2]) {
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.6), new THREE.MeshLambertMaterial({ color: TEAM_COLORS[team], side: THREE.DoubleSide }));
        banner.position.set(-0.32 * side, 2.2, z);
        banner.rotation.y = (Math.PI / 2) * side;
        const trim = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.18), new THREE.MeshLambertMaterial({ color: GOLD, side: THREE.DoubleSide }));
        trim.position.set(-0.33 * side, 3.4, z);
        trim.rotation.y = (Math.PI / 2) * side;
        g.add(banner, trim);
      }
      g.position.set(side * (ARENA_RADIUS + 0.35), 0, 0);
      s.add(g);
    }
  }

  /** Makes the scene's knights match `info` (id → team and name). */
  setFighters(info: Record<string, { team: TeamId; label: string }>) {
    for (const [id, k] of this.knights) {
      if (!(id in info) || info[id].team !== k.team) {
        this.scene.remove(k.root, k.shadow);
        disposeTree(k.root);
        disposeTree(k.shadow);
        this.knights.delete(id);
      }
    }
    for (const [id, f] of Object.entries(info)) {
      const known = this.knights.get(id);
      if (known) {
        known.label = f.label;
        continue;
      }
      const parts = knightMesh(f.team, this.glow);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ depthWrite: false, transparent: true }));
      tag.scale.set(1.3, 0.41, 1);
      tag.position.y = 2.35;
      parts.root.add(tag);
      this.scene.add(parts.root, parts.shadow);
      this.knights.set(id, { ...parts, tag, tagKey: "", label: f.label, pose: null, walk: Math.random() * 6, fallen: -1, hp: 100 });
    }
  }

  setHealth(id: string, hp: number) {
    const k = this.knights.get(id);
    if (k) k.hp = hp;
  }

  setPose(id: string, pose: KnightPose) {
    const k = this.knights.get(id);
    if (!k) return;
    k.pose = pose;
    // What it holds.
    if (k.weaponKind !== pose.gear.w) {
      if (k.weapon) {
        k.hand.remove(k.weapon);
        k.offHand.remove(k.weapon);
        disposeTree(k.weapon);
      }
      k.weapon = weaponMesh(pose.gear.w);
      k.weaponKind = pose.gear.w;
      if (pose.gear.w === "arco") {
        // Limbs up and the belly forward when the arm points ahead.
        k.weapon.rotation.set(-Math.PI / 2, 0, 0);
        k.offHand.add(k.weapon);
      } else {
        // Blade forward from the fist, tilted up a bit.
        k.weapon.rotation.x = 0.3;
        k.hand.add(k.weapon);
      }
    }
    if (!!k.shield !== pose.gear.sh) {
      if (k.shield) {
        k.offHand.remove(k.shield);
        disposeTree(k.shield);
        k.shield = null;
      } else {
        // Its face along the forearm's length, so it faces ahead when the arm is raised.
        k.shield = shieldMesh(k.team);
        k.shield.position.set(-0.06, -0.04, 0);
        k.shield.rotation.x = Math.PI / 2;
        k.offHand.add(k.shield);
      }
    }
  }

  /** The weapons on the floor (id → kind and place). */
  setItems(items: Record<string, ArenaItem>) {
    for (const [id, it] of this.items) {
      const now = items[id];
      if (!now || now.kind !== it.kind) {
        this.scene.remove(it.group);
        disposeTree(it.group);
        this.items.delete(id);
      }
    }
    for (const [id, it] of Object.entries(items)) {
      const known = this.items.get(id);
      if (known) {
        known.group.position.set(it.x, known.group.position.y, it.z);
        continue;
      }
      const group = new THREE.Group();
      const mesh = itemMesh(it.kind);
      // Shown upright and turning, so it's easy to spot.
      mesh.rotation.x = it.kind === "arco" || it.kind === "escudo" ? 0 : -Math.PI / 2;
      if (it.kind === "lanza") mesh.scale.setScalar(0.75);
      const spinner = new THREE.Group();
      spinner.add(mesh);
      spinner.position.y = it.kind === "escudo" || it.kind === "arco" ? 0.75 : 0.35;
      const halo = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 1.6),
        new THREE.MeshBasicMaterial({ map: this.glow, color: 0xffd36b, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.03;
      group.add(spinner, halo);
      group.position.set(it.x, 0, it.z);
      this.scene.add(group);
      this.items.set(id, { kind: it.kind, group });
    }
  }

  /** Arrows in flight (id → where it is now and where it's going). */
  setArrows(list: Record<string, ArrowDraw>) {
    for (const [id, g] of this.arrows) {
      if (!(id in list)) {
        this.scene.remove(g);
        disposeTree(g);
        this.arrows.delete(id);
      }
    }
    const look = new THREE.Vector3();
    for (const [id, a] of Object.entries(list)) {
      let g = this.arrows.get(id);
      if (!g) {
        g = arrowMesh();
        this.arrows.set(id, g);
        this.scene.add(g);
      }
      g.position.set(a.x, a.y, a.z);
      look.set(a.x - a.vx, a.y - a.vy, a.z - a.vz);
      g.lookAt(look);
    }
  }

  /** A hit: sparks on metal (`block`), a puff and a few sparks on a clean hit, sand on a fall. */
  burst(x: number, y: number, z: number, kind: "hit" | "block" | "dust") {
    const n = kind === "block" ? 22 : kind === "hit" ? 12 : 16;
    const colors =
      kind === "block"
        ? [new THREE.Color(0xfde047), new THREE.Color(0xfffbeb), new THREE.Color(0xfb923c)]
        : kind === "hit"
          ? [new THREE.Color(0xfef3c7), new THREE.Color(0xfca5a5)]
          : [new THREE.Color(0xe7cc9a)];
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const sp = kind === "dust" ? 1 + this.rand() * 1.5 : 2 + this.rand() * 4;
      const c = colors[i % colors.length];
      if (kind === "dust") this.dust.spawn(x, y, z, Math.cos(a) * sp, 0.3 + this.rand(), Math.sin(a) * sp, c, 0.5, 0.8 + this.rand() * 0.5, 0.5);
      else this.sparks.spawn(x, y, z, Math.cos(a) * sp, 1 + this.rand() * 3, Math.sin(a) * sp, c, 0.08 + this.rand() * 0.06, 0.25 + this.rand() * 0.3, 1);
    }
  }

  /** Shakes the camera (you got hit, or landed a heavy blow). */
  jolt(amount: number) {
    this.shake = Math.max(this.shake, amount);
  }

  /** The crowd jumps for a moment. */
  cheer() {
    this.cheerT = 2.2;
  }

  private update(dt: number) {
    this.time += dt;
    for (const [, k] of this.knights) {
      const p = k.pose;
      k.root.visible = !!p;
      k.shadow.visible = !!p;
      if (!p) continue;
      k.root.position.set(p.x, p.y, p.z);
      k.root.rotation.y = p.yaw;
      k.shadow.position.set(p.x, 0.02, p.z);
      animateKnight(k, p, dt);
      // Falling over backwards, and staying down.
      if (!p.alive) {
        if (k.fallen < 0) {
          k.fallen = 0;
          this.burst(p.x, 0.1, p.z, "dust");
        }
        k.fallen += dt;
        const f = ease(clamp01(k.fallen / 0.6));
        k.body.rotation.x = (Math.PI / 2) * f * 0.97;
        k.body.position.y = 0.15 * f;
      } else if (k.fallen >= 0) {
        k.fallen = -1;
        k.body.rotation.x = 0;
      }
      const key = `${k.label}:${Math.round(k.hp)}:${p.alive}`;
      if (key !== k.tagKey) {
        k.tagKey = key;
        const mat = k.tag.material as THREE.SpriteMaterial;
        mat.map?.dispose();
        mat.map = tagTexture(k.label, TEAM_LIGHT[k.team], k.hp);
        mat.needsUpdate = true;
      }
      k.tag.visible = p.alive;
    }
    for (const [, it] of this.items) {
      const spin = it.group.children[0];
      spin.rotation.y += dt * 1.4;
      spin.position.y = (it.kind === "escudo" || it.kind === "arco" ? 0.75 : 0.35) + Math.sin(this.time * 2.5) * 0.06;
    }
    for (const f of this.flames) f.scale.setScalar(0.6 + Math.sin(this.time * 13 + f.position.x) * 0.06 + this.rand() * 0.08);
    if (this.crowd && this.cheerT > 0) {
      this.cheerT -= dt;
      const m = new THREE.Matrix4();
      this.crowdBase.forEach((base, i) => {
        const jump = Math.max(0, Math.sin(this.time * 9 + i * 1.7)) * 0.25 * Math.min(1, this.cheerT);
        m.copy(base);
        m.elements[13] += jump;
        this.crowd!.setMatrixAt(i, m);
      });
      this.crowd.instanceMatrix.needsUpdate = true;
    }
    this.sparks.update(dt);
    this.dust.update(dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  /** First-person hands: the held weapon (and shield or bow), moving with the pose. */
  private updateHands(p: KnightPose, team: TeamId, dt: number) {
    const kind = `${p.gear.w}:${p.gear.sh}`;
    if (kind !== this.handKind) {
      this.handKind = kind;
      for (const g of [this.handRight, this.handLeft]) {
        for (const c of [...g.children]) {
          g.remove(c);
          disposeTree(c);
        }
      }
      this.handShield = null;
      const fist = () => new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.12), phong(DARK_STEEL));
      if (p.gear.w === "arco") {
        const bow = weaponMesh("arco");
        bow.rotation.set(0, 0, 0.15);
        this.handLeft.add(bow, fist());
        const arrow = arrowMesh();
        arrow.position.set(0, 0, -0.2);
        this.handRight.add(arrow, fist());
      } else {
        const w = weaponMesh(p.gear.w);
        w.rotation.x = 0.5;
        this.handRight.add(w, fist());
        if (p.gear.sh) {
          this.handShield = shieldMesh(team);
          this.handShield.scale.setScalar(0.85);
          this.handLeft.add(this.handShield);
        } else {
          this.handLeft.add(fist());
        }
      }
    }
    const moving = Math.min(1, p.speed / 4.6);
    this.bob += dt * (3 + p.speed * 1.8);
    const target = handPose(p, Math.sin(this.bob) * 0.015 * moving);
    const k = 1 - Math.exp(-dt * 22);
    const mixInto = (cur: HandPose, to: HandPose) => {
      for (const key of Object.keys(cur) as (keyof HandPose)[]) cur[key] = lerp(cur[key], to[key], k);
    };
    mixInto(this.handNow.right, target.right);
    mixInto(this.handNow.left, target.left);
    const apply = (g: THREE.Group, h: HandPose) => {
      g.position.set(h.px, h.py, h.pz);
      g.rotation.set(h.rx, h.ry, h.rz);
    };
    apply(this.handRight, this.handNow.right);
    apply(this.handLeft, this.handNow.left);
    // The bow's string follows the draw.
    const bow = this.handLeft.children.find((c) => c.userData.string) as THREE.Group | undefined;
    const string = bow?.userData.string as THREE.Line | undefined;
    if (string) {
      const pos = string.geometry.attributes.position as THREE.BufferAttribute;
      pos.setZ(1, 0.12 + (p.act === "draw" ? p.draw * 0.3 : 0));
      pos.needsUpdate = true;
    }
  }

  /**
   * Draws the arena from `follow`'s eyes (first person, with your hands) or
   * over its shoulder; `look` is where the camera points (your own look, or
   * the followed knight's). Nobody to follow: a slow tour around the arena.
   */
  render(follow: string | null, mode: ArenaCamera, look: { yaw: number; pitch: number }, dt: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (!cw || !ch) return;
    if (this.renderer.getPixelRatio() !== dpr) this.renderer.setPixelRatio(dpr);
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== cw || size.y !== ch) this.renderer.setSize(cw, ch, false);
    if (this.camera.aspect !== cw / ch) {
      this.camera.aspect = cw / ch;
      this.camera.updateProjectionMatrix();
    }
    this.update(dt);

    const k = follow ? this.knights.get(follow) : undefined;
    const p = k?.pose;
    const cam = this.camera;
    let firstPerson = false;
    if (!k || !p) {
      const a = this.time / 12;
      cam.position.set(Math.cos(a) * 14, 9, Math.sin(a) * 14);
      cam.lookAt(0, 1, 0);
      this.camReady = false;
    } else if (mode === "primera" && p.alive) {
      firstPerson = true;
      cam.position.set(p.x, p.y + EYE_HEIGHT + Math.sin(this.bob * 2) * 0.02 * Math.min(1, p.speed / 4.6), p.z);
      cam.rotation.set(look.pitch, look.yaw, 0);
      this.camReady = false;
    } else {
      // Over the right shoulder, pulled in if the wall is behind.
      const yaw = look.yaw;
      const pitch = Math.max(-0.6, Math.min(0.8, look.pitch));
      const back = p.alive ? 3.2 : 4.5;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const eye = new THREE.Vector3(p.x, p.y + EYE_HEIGHT + 0.25, p.z);
      const want = new THREE.Vector3(
        eye.x - fx * back * Math.cos(pitch) + rx * 0.7,
        eye.y + 0.35 + Math.sin(pitch) * back,
        eye.z - fz * back * Math.cos(pitch) + rz * 0.7
      );
      const r = Math.hypot(want.x, want.z);
      if (r > ARENA_RADIUS - 0.4) {
        want.x *= (ARENA_RADIUS - 0.4) / r;
        want.z *= (ARENA_RADIUS - 0.4) / r;
      }
      if (!this.camReady) this.camPos.copy(want);
      else this.camPos.lerp(want, 1 - Math.exp(-dt * 14));
      this.camReady = true;
      cam.position.copy(this.camPos);
      cam.lookAt(eye.x + fx * 6 * Math.cos(pitch), eye.y - Math.sin(pitch) * 6 + 0.2, eye.z + fz * 6 * Math.cos(pitch));
    }
    if (this.shake > 0) {
      cam.position.x += (this.rand() - 0.5) * this.shake * 0.15;
      cam.position.y += (this.rand() - 0.5) * this.shake * 0.15;
    }
    // Your own knight would be in the way of your eyes.
    if (k) k.root.visible = !firstPerson && !!p;

    const scale = (ch * dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    this.sparks.setScale(scale);
    this.dust.setScale(scale);

    this.renderer.setViewport(0, 0, cw, ch);
    this.renderer.clear();
    this.renderer.render(this.scene, cam);
    if (firstPerson && p && k) {
      this.updateHands(p, k.team, dt);
      cam.updateMatrixWorld();
      this.hands.position.copy(cam.position);
      this.hands.quaternion.copy(cam.quaternion);
      this.renderer.clearDepth();
      this.renderer.render(this.handScene, cam);
    }
  }

  dispose() {
    disposeTree(this.scene);
    disposeTree(this.handScene);
    this.glow.dispose();
    this.renderer.dispose();
  }
}

/** Two box geometries as one, with a per-vertex white color (instance colors tint it). */
function mergeBoxes(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const ga = a.toNonIndexed();
  const gb = b.toNonIndexed();
  const pos = new Float32Array([...(ga.attributes.position.array as Float32Array), ...(gb.attributes.position.array as Float32Array)]);
  const nor = new Float32Array([...(ga.attributes.normal.array as Float32Array), ...(gb.attributes.normal.array as Float32Array)]);
  const col = new Float32Array(pos.length).fill(1);
  // Heads in skin tone: darken the second box's vertices a little toward tan.
  for (let i = ga.attributes.position.count; i < pos.length / 3; i++) {
    col[i * 3] = 0.95;
    col[i * 3 + 1] = 0.78;
    col[i * 3 + 2] = 0.62;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      const map = (mat as THREE.MeshBasicMaterial).map;
      if (map && map.name !== "glow") map.dispose();
      mat.dispose();
    }
  });
}
