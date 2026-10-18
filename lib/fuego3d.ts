import * as THREE from "three";
import { mulberry32 } from "./random";
import { MAPS, solidBoxes, type Box, type MapId, type MapTheme, type PickupKind, type Ramp } from "./fuegoMaps";
import { EYE, topAt, worldOf, type ProjectileKind, type WeaponId } from "./fuegoSim";

/**
 * Fuego cruzado in 3D (three.js), browser only: the map built from its
 * boxes and ramps, dressed by theme; armored soldiers made of primitives
 * and animated from their poses alone (walking, aiming up and down, shooting,
 * falling); pickups floating over glowing pads; tracers, muzzle flashes,
 * sparks, rockets, grenades and explosions. Your own soldier isn't drawn:
 * the camera is its eyes and your weapon is drawn on top in its own pass.
 */

export interface SoldierDraw {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  weapon: WeaponId;
  speed: number;
  alive: boolean;
  /** Server-time-free: seconds since it died (for the fall). */
  deadFor: number;
}

export interface ViewModel {
  weapon: WeaponId;
  /** Seconds since the last shot, reload progress (0 = not reloading), switching, melee, aiming. */
  sinceShot: number;
  reload: number;
  switching: number;
  melee: number;
  aiming: boolean;
  speed: number;
  /** Hide it (sniper scope, dead). */
  hidden: boolean;
}

const THEMES: Record<MapTheme, { sky: [number, number]; fog: number; floor: string; line: string; wall: string; block: string; plat: string; crate: string; light: number; ground: number; accent: number }> = {
  bunker: { sky: [0x0b1220, 0x1f2a3a], fog: 0x141b27, floor: "#3a4350", line: "#56b8d9", wall: "#4b5563", block: "#5b6675", plat: "#6b7a8c", crate: "#8a6b3a", light: 0xbfd7ff, ground: 0x2a2f38, accent: 0x38bdf8 },
  fortaleza: { sky: [0x6aa7e8, 0xd9ecff], fog: 0xbcd6ee, floor: "#6f8f5a", line: "#a3c48a", wall: "#8b8f98", block: "#9aa1ab", plat: "#b4bac2", crate: "#a07a45", light: 0xfff4e0, ground: 0x5a7046, accent: 0xf59e0b },
  valle: { sky: [0xe6935a, 0xffd9a0], fog: 0xe8b98a, floor: "#c79a62", line: "#d9b07a", wall: "#9b6a43", block: "#a8744a", plat: "#b98a5c", crate: "#7c5a36", light: 0xffe0b8, ground: 0xa87d4f, accent: 0xef4444 },
};

const SIDE_COLORS: Record<string, number> = { red: 0xd9283f, blue: 0x1f7fd6 };

function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Panels with seams and a few rivets/scratches: walls, blocks, platforms. */
function panelTexture(base: string, seed: number, kind: "panel" | "rock" | "crate"): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 128, 128);
    const rand = mulberry32(seed);
    if (kind === "rock") {
      for (let i = 0; i < 900; i++) {
        const v = rand();
        ctx.fillStyle = v > 0.5 ? `rgba(255,240,220,${0.05 + rand() * 0.08})` : `rgba(60,35,20,${0.06 + rand() * 0.1})`;
        const s = 1 + rand() * 4;
        ctx.fillRect(rand() * 128, rand() * 128, s, s);
      }
      ctx.strokeStyle = "rgba(40,25,15,0.25)";
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(rand() * 128, rand() * 128);
        ctx.lineTo(rand() * 128, rand() * 128);
        ctx.stroke();
      }
      return;
    }
    if (kind === "crate") {
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, 122, 122);
      ctx.beginPath();
      ctx.moveTo(6, 6);
      ctx.lineTo(122, 122);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      for (let y = 10; y < 128; y += 16) ctx.fillRect(6, y, 116, 2);
      return;
    }
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(${rand() > 0.5 ? "255,255,255" : "0,0,0"},${0.03 + rand() * 0.05})`;
      ctx.fillRect(rand() * 128, rand() * 128, 2 + rand() * 6, 1 + rand() * 2);
    }
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, 128, 2);
    ctx.fillRect(0, 0, 2, 128);
    ctx.fillRect(0, 63, 128, 2);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(0, 2, 128, 1);
    ctx.fillRect(0, 65, 128, 1);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    for (const [x, y] of [[8, 8], [120, 8], [8, 56], [120, 56], [8, 72], [120, 72], [8, 120], [120, 120]]) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function floorTexture(base: string, line: string, rocky: boolean): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    const rand = mulberry32(3);
    for (let i = 0; i < (rocky ? 2400 : 900); i++) {
      ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${0.03 + rand() * 0.06})` : `rgba(0,0,0,${0.04 + rand() * 0.08})`;
      const s = 1 + rand() * (rocky ? 3 : 2);
      ctx.fillRect(rand() * 256, rand() * 256, s, s);
    }
    if (!rocky) {
      ctx.strokeStyle = line;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 2;
      for (let i = 0; i <= 256; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 256);
        ctx.moveTo(0, i);
        ctx.lineTo(256, i);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  });
}

function glowTexture(): THREE.CanvasTexture {
  const t = canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.name = "glow";
  return t;
}

function tagTexture(name: string, color: string): THREE.CanvasTexture {
  const t = canvasTexture(256, 64, (ctx) => {
    ctx.font = "bold 30px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.strokeText(name, 128, 32);
    ctx.fillStyle = color;
    ctx.fillText(name, 128, 32);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const phong = (color: number, shininess = 60) => new THREE.MeshPhongMaterial({ color, shininess, specular: 0x777777 });

/** A ramp as a solid wedge. */
function rampGeometry(rp: Ramp): THREE.BufferGeometry {
  const x0 = rp.x - rp.w / 2;
  const x1 = rp.x + rp.w / 2;
  const z0 = rp.z - rp.d / 2;
  const z1 = rp.z + rp.d / 2;
  const y0 = rp.y;
  const y1 = rp.y + rp.h;
  // Height at each of the four top corners.
  const hAt = (x: number, z: number) =>
    rp.up === "x+" ? (x === x1 ? y1 : y0) : rp.up === "x-" ? (x === x0 ? y1 : y0) : rp.up === "z+" ? (z === z1 ? y1 : y0) : z === z0 ? y1 : y0;
  const corners: [number, number][] = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const top = corners.map(([x, z]) => new THREE.Vector3(x, hAt(x, z), z));
  const bot = corners.map(([x, z]) => new THREE.Vector3(x, y0, z));
  const tris: THREE.Vector3[] = [];
  const quad = (a: THREE.Vector3, b2: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => tris.push(a, b2, c, a, c, d);
  quad(top[0], top[3], top[2], top[1]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    if (top[i].y - y0 < 0.001 && top[j].y - y0 < 0.001) continue;
    quad(bot[i], bot[j], top[j], top[i]);
  }
  const g = new THREE.BufferGeometry().setFromPoints(tris);
  g.computeVertexNormals();
  // Planar UVs for the texture.
  const uv: number[] = [];
  for (const v of tris) uv.push((v.x + v.z) / 2, v.y / 2 + v.z / 2);
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** UVs scaled to a box's size so textures keep their density. */
function boxGeometry(bx: Box): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(bx.w, bx.h, bx.d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const px = pos.getX(i) + bx.x;
    const py = pos.getY(i) + bx.y + bx.h / 2;
    const pz = pos.getZ(i) + bx.z;
    if (ny > 0.5) uv.setXY(i, px / 3, pz / 3);
    else if (nx > 0.5) uv.setXY(i, pz / 3, py / 3);
    else uv.setXY(i, px / 3, py / 3);
  }
  return g;
}

// ---- Weapons -----------------------------------------------------------------------------------

function weaponMesh(id: WeaponId, accent = 0x22d3ee): THREE.Group {
  const g = new THREE.Group();
  const dark = phong(0x2b3138, 40);
  const mid = phong(0x4b5563, 50);
  const glow = new THREE.MeshBasicMaterial({ color: accent });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
    return m;
  };
  // Weapons point toward -z; (0, 0, 0) is the grip.
  if (id === "rifle") {
    add(new THREE.BoxGeometry(0.09, 0.12, 0.62), mid, 0, 0.05, -0.2);
    add(new THREE.BoxGeometry(0.07, 0.08, 0.3), dark, 0, 0.04, -0.62);
    add(new THREE.BoxGeometry(0.06, 0.14, 0.08), dark, 0, -0.06, -0.12, 0.25);
    add(new THREE.BoxGeometry(0.06, 0.12, 0.06), dark, 0, -0.06, 0.02, -0.2);
    add(new THREE.BoxGeometry(0.08, 0.1, 0.2), dark, 0, 0.03, 0.18);
    add(new THREE.BoxGeometry(0.04, 0.02, 0.18), glow, 0, 0.12, -0.2);
  } else if (id === "pistola") {
    add(new THREE.BoxGeometry(0.06, 0.08, 0.3), mid, 0, 0.06, -0.1);
    add(new THREE.BoxGeometry(0.055, 0.14, 0.07), dark, 0, -0.03, 0.01, -0.2);
    add(new THREE.BoxGeometry(0.065, 0.02, 0.08), glow, 0, 0.11, -0.06);
  } else if (id === "escopeta") {
    add(new THREE.BoxGeometry(0.1, 0.12, 0.7), dark, 0, 0.04, -0.25);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 10), mid, 0, 0.0, -0.45, Math.PI / 2);
    add(new THREE.BoxGeometry(0.11, 0.08, 0.2), mid, 0, -0.03, -0.38);
    add(new THREE.BoxGeometry(0.07, 0.12, 0.25), dark, 0, -0.04, 0.15, -0.3);
    add(new THREE.BoxGeometry(0.11, 0.025, 0.1), glow, 0, 0.115, -0.1);
  } else if (id === "francotirador") {
    add(new THREE.BoxGeometry(0.08, 0.1, 0.8), dark, 0, 0.04, -0.25);
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 8), mid, 0, 0.04, -0.85, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 12), mid, 0, 0.14, -0.2, Math.PI / 2);
    add(new THREE.BoxGeometry(0.07, 0.12, 0.26), dark, 0, -0.02, 0.2, -0.25);
    add(new THREE.BoxGeometry(0.05, 0.12, 0.06), dark, 0, -0.07, -0.05, 0.25);
    add(new THREE.CircleGeometry(0.04, 12), glow, 0, 0.14, -0.351);
  } else {
    add(new THREE.CylinderGeometry(0.09, 0.09, 0.95, 12), phong(0x3f4a3a, 30), 0, 0.08, -0.25, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12), dark, 0, 0.08, -0.74, Math.PI / 2);
    add(new THREE.BoxGeometry(0.06, 0.14, 0.08), dark, 0, -0.04, -0.15, 0.2);
    add(new THREE.BoxGeometry(0.06, 0.03, 0.2), glow, 0, 0.18, -0.2);
  }
  return g;
}

function pickupMesh(kind: PickupKind): THREE.Group {
  if (kind === "botiquin") {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.36), phong(0xf1f5f9)));
    const red = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.37), red);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.37), red);
    a.position.z = b2.position.z = 0.002;
    g.add(a, b2);
    return g;
  }
  if (kind === "granadas") {
    const g = new THREE.Group();
    const mat = phong(0x3f6212);
    for (const dx of [-0.13, 0.13]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), mat);
      s.position.x = dx;
      g.add(s);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 16), new THREE.MeshBasicMaterial({ color: 0x84cc16 }));
      band.position.x = dx;
      band.rotation.x = Math.PI / 2;
      g.add(band);
    }
    return g;
  }
  const g = weaponMesh(kind as WeaponId);
  g.scale.setScalar(1.3);
  g.rotation.y = Math.PI / 2;
  const wrap = new THREE.Group();
  wrap.add(g);
  return wrap;
}

// ---- Soldiers --------------------------------------------------------------------------------

interface SoldierModel {
  root: THREE.Group;
  body: THREE.Group;
  chest: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  arms: THREE.Group;
  gun: THREE.Group;
  gunId: WeaponId | "";
  tag: THREE.Sprite;
  tagKey: string;
  flash: THREE.Sprite;
  walk: number;
  draw: SoldierDraw | null;
  shieldFlash: THREE.Mesh;
  shieldT: number;
}

function soldierModel(color: number, glow: THREE.Texture): SoldierModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const armor = phong(color, 70);
  const under = phong(0x262b33, 30);
  const visorMat = new THREE.MeshPhongMaterial({ color: 0xf2b134, emissive: 0x6b4100, shininess: 120, specular: 0xffffff });

  const legL = new THREE.Group();
  const legR = new THREE.Group();
  for (const [leg, x] of [[legL, -0.15], [legR, 0.15]] as [THREE.Group, number][]) {
    leg.position.set(x, 0.92, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.48, 0.22), under);
    thigh.position.y = -0.24;
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.46, 0.22), armor);
    shin.position.y = -0.68;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.32), under);
    boot.position.set(0, -0.88, -0.04);
    leg.add(thigh, shin, boot);
    body.add(leg);
  }
  const chest = new THREE.Group();
  chest.position.y = 0.95;
  body.add(chest);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.34), armor);
  torso.position.y = 0.32;
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.3), under);
  belly.position.y = 0.0;
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.18), under);
  pack.position.set(0, 0.36, 0.25);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), armor);
  helmet.scale.set(1, 1.08, 1.12);
  helmet.position.y = 0.82;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.32, Math.PI * 0.32), visorMat);
  visor.scale.set(1.15, 1, 1.1);
  visor.rotation.y = Math.PI;
  visor.position.set(0, 0.8, -0.08);
  chest.add(torso, belly, pack, helmet, visor);
  for (const x of [-0.36, 0.36]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.3), armor);
    pad.position.set(x, 0.58, 0);
    chest.add(pad);
  }
  // Arms holding the gun, pitched with the aim.
  const arms = new THREE.Group();
  arms.position.set(0, 0.5, 0);
  chest.add(arms);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.48), under);
  armR.position.set(0.24, -0.05, -0.18);
  armR.rotation.y = 0.35;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.55), under);
  armL.position.set(-0.12, -0.05, -0.3);
  armL.rotation.y = -0.5;
  arms.add(armR, armL);
  const gun = new THREE.Group();
  gun.position.set(0.12, -0.02, -0.38);
  arms.add(gun);

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.scale.setScalar(0.6);
  gun.add(flash);

  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  tag.scale.set(1.6, 0.4, 1);
  tag.position.y = 2.25;
  root.add(tag);

  const shieldFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  shieldFlash.scale.set(1, 1.6, 1);
  shieldFlash.position.y = 0.95;
  root.add(shieldFlash);

  return { root, body, chest, legL, legR, arms, gun, gunId: "", tag, tagKey: "", flash, walk: 0, draw: null, shieldFlash, shieldT: 0 };
}

// ---- Particles (same idea as the arena's) -------------------------------------------------------

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
  private grow: Float32Array;
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
    this.grow = new Float32Array(max);
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

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, size: number, life: number, alpha: number, grow = 0) {
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
    this.grow[i] = grow;
  }

  update(dt: number) {
    const drag = Math.exp(-dt * 2.5);
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
      this.vel[k + 1] = this.vel[k + 1] * drag - this.gravity * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] = Math.max(0.02, this.pos[k + 1] + this.vel[k + 1] * dt);
      this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
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

// ---- Scene ------------------------------------------------------------------------------------

interface Tracer {
  mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  life: number;
}

interface Blast {
  sprite: THREE.Sprite;
  light: THREE.PointLight;
  t: number;
  size: number;
}

export interface ProjectileDraw {
  kind: ProjectileKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export class FuegoScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private handScene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(78, 1, 0.05, 600);
  private glow: THREE.Texture;
  private soldiers = new Map<string, SoldierModel>();
  private pickups = new Map<string, { kind: PickupKind; group: THREE.Group; pad: THREE.Mesh; x: number; y: number; z: number }>();
  private projectiles = new Map<string, THREE.Group>();
  private sparks = new Particles(400, true, 9);
  private smoke = new Particles(300, false, -0.6);
  private tracers: Tracer[] = [];
  private blasts: Blast[] = [];
  private hand = new THREE.Group();
  private handGun = new THREE.Group();
  private handFlash: THREE.Sprite;
  private handId = "";
  private bob = 0;
  private shake = 0;
  private rand = mulberry32(11);
  private time = 0;
  private maxDpr: number;
  private theme: (typeof THEMES)[MapTheme];

  constructor(
    private canvas: HTMLCanvasElement,
    mapId: MapId,
    opts: { maxDpr?: number } = {}
  ) {
    this.maxDpr = opts.maxDpr ?? 1.5;
    const map = MAPS[mapId];
    this.theme = THEMES[map.theme];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.autoClear = false;
    this.renderer.setClearColor(this.theme.fog);
    this.scene.fog = new THREE.Fog(this.theme.fog, map.theme === "bunker" ? 30 : 60, map.theme === "valle" ? 230 : 150);
    this.glow = glowTexture();
    this.camera.rotation.order = "YXZ";
    this.build(mapId);
    this.scene.add(this.sparks.points, this.smoke.points);

    this.handScene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f4a, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(0.5, 1, 0.4);
    this.handScene.add(key);
    this.handFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.handFlash.scale.setScalar(0.35);
    this.hand.add(this.handGun);
    this.handScene.add(this.hand);
  }

  private build(mapId: MapId) {
    const s = this.scene;
    const map = MAPS[mapId];
    const th = this.theme;
    const w = worldOf(mapId);
    s.add(new THREE.HemisphereLight(th.light, th.ground, map.theme === "bunker" ? 1.25 : 1.45));
    const sun = new THREE.DirectionalLight(th.light, map.theme === "bunker" ? 0.9 : 1.5);
    sun.position.set(-30, 60, 20);
    s.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(30, 20, -40);
    s.add(fill);

    // Sky.
    const skyGeo = new THREE.SphereGeometry(500, 32, 16);
    const top = new THREE.Color(th.sky[0]);
    const hor = new THREE.Color(th.sky[1]);
    const colors: number[] = [];
    const pos = skyGeo.attributes.position;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      c.copy(hor).lerp(top, Math.pow(Math.max(0, pos.getY(i) / 500), 0.6));
      colors.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1;
    s.add(sky);

    // Floor, and ground outside the walls.
    const rocky = map.theme === "valle";
    const floorTex = floorTexture(th.floor, th.line, rocky);
    floorTex.repeat.set(map.hx / 4, map.hz / 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(map.hx * 2, map.hz * 2), new THREE.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const out = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), lambert(th.ground));
    out.rotation.x = -Math.PI / 2;
    out.position.y = -0.05;
    s.add(out);

    // Boxes and ramps.
    const tex = {
      muro: panelTexture(th.wall, 1, rocky ? "rock" : "panel"),
      bloque: panelTexture(th.block, 2, rocky ? "rock" : "panel"),
      plataforma: panelTexture(th.plat, 3, "panel"),
      caja: panelTexture(th.crate, 4, "crate"),
    };
    const mats = Object.fromEntries(Object.entries(tex).map(([k, t]) => [k, new THREE.MeshLambertMaterial({ map: t })])) as Record<Box["kind"], THREE.MeshLambertMaterial>;
    const accent = new THREE.MeshBasicMaterial({ color: th.accent });
    for (const bx of solidBoxes(map)) {
      const m = new THREE.Mesh(boxGeometry(bx), mats[bx.kind]);
      m.position.set(bx.x, bx.y + bx.h / 2, bx.z);
      s.add(m);
      // A glowing strip around the top of platforms.
      if (bx.kind === "plataforma" && bx.w < 40) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(bx.w + 0.04, 0.06, bx.d + 0.04), accent);
        strip.position.set(bx.x, bx.y + bx.h - 0.12, bx.z);
        s.add(strip);
      }
    }
    // Lights strip along the boundary walls (bunker), or rock tops (valle).
    if (map.theme === "bunker") {
      for (const z of [-map.hz + 0.02, map.hz - 0.02]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(map.hx * 2, 0.12, 0.04), accent);
        strip.position.set(0, 4.2, z);
        s.add(strip);
      }
      for (const x of [-map.hx + 0.02, map.hx - 0.02]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, map.hz * 2), accent);
        strip.position.set(x, 4.2, 0);
        s.add(strip);
      }
    }
    const rampMat = mats.plataforma;
    for (const rp of map.ramps) s.add(new THREE.Mesh(rampGeometry(rp), rampMat));

    // Distant scenery: mountains outside (fortaleza, valle).
    if (map.theme !== "bunker") {
      const rand = mulberry32(21);
      const mountMat = lambert(map.theme === "valle" ? 0x9c6b45 : 0x5f7f86);
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        const r2 = Math.max(map.hx, map.hz) + 60 + rand() * 80;
        const h = 25 + rand() * 50;
        const m = new THREE.Mesh(new THREE.ConeGeometry(20 + rand() * 25, h, 6), mountMat);
        m.position.set(Math.cos(a) * r2, h / 2 - 2, Math.sin(a) * r2);
        m.rotation.y = rand() * Math.PI;
        s.add(m);
      }
    }

    // Team bases tinted (spawns marked on the floor).
    for (const sp of map.spawns) {
      if (!sp.team) continue;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.7, 24),
        new THREE.MeshBasicMaterial({ color: SIDE_COLORS[sp.team], transparent: true, opacity: 0.5, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(sp.x, topAt(w, sp.x, sp.z) + 0.02, sp.z);
      s.add(ring);
    }
  }

  // ---- Soldiers -------------------------------------------------------------------------------

  setSoldiers(info: Record<string, { color: string; label: string; ally: boolean }>) {
    for (const [id, k] of this.soldiers) {
      if (!(id in info)) {
        this.scene.remove(k.root);
        disposeTree(k.root);
        this.soldiers.delete(id);
      }
    }
    for (const [id, inf] of Object.entries(info)) {
      let k = this.soldiers.get(id);
      if (!k) {
        k = soldierModel(new THREE.Color(inf.color).getHex(), this.glow);
        this.soldiers.set(id, k);
        this.scene.add(k.root);
      }
      const key = `${inf.label}|${inf.ally}`;
      if (k.tagKey !== key) {
        k.tagKey = key;
        const mat = k.tag.material as THREE.SpriteMaterial;
        mat.map?.dispose();
        mat.map = tagTexture(inf.label, inf.ally ? "#7dd3fc" : "#fca5a5");
        mat.needsUpdate = true;
      }
    }
  }

  setSoldier(id: string, d: SoldierDraw | null) {
    const k = this.soldiers.get(id);
    if (!k) return;
    k.draw = d;
    k.root.visible = !!d && (d.alive || d.deadFor < 4);
    if (!d) return;
    if (k.gunId !== d.weapon) {
      k.gunId = d.weapon;
      for (const ch of [...k.gun.children]) if (ch !== k.flash) k.gun.remove(ch);
      k.gun.add(weaponMesh(d.weapon));
      k.flash.position.set(0, 0.05, d.weapon === "pistola" ? -0.3 : d.weapon === "francotirador" ? -1.15 : -0.8);
    }
  }

  /** A shot by `id`: muzzle flash and a tracer to (ex, ey, ez). */
  shot(id: string | null, from: [number, number, number], ex: number, ey: number, ez: number, weapon: WeaponId, hit: "nada" | "escudo" | "cuerpo" | null) {
    if (id) {
      const k = this.soldiers.get(id);
      if (k) (k.flash.material as THREE.SpriteMaterial).opacity = 1;
    }
    const [fx, fy, fz] = from;
    const dx = ex - fx;
    const dy = ey - fy;
    const dz = ez - fz;
    const len = Math.hypot(dx, dy, dz);
    if (len > 0.5 && weapon !== "lanzacohetes") {
      const thick = weapon === "francotirador" ? 0.025 : 0.012;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(thick, thick, len, 4, 1, true),
        new THREE.MeshBasicMaterial({ color: weapon === "francotirador" ? 0x93c5fd : 0xffe08a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      mesh.position.set(fx + dx / 2, fy + dy / 2, fz + dz / 2);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
      this.scene.add(mesh);
      this.tracers.push({ mesh, life: weapon === "francotirador" ? 0.35 : 0.07 });
    }
    if (hit) this.impact(ex, ey, ez, hit);
  }

  impact(x: number, y: number, z: number, kind: "nada" | "escudo" | "cuerpo") {
    const color = new THREE.Color(kind === "escudo" ? 0x67e8f9 : kind === "cuerpo" ? 0xef4444 : 0xffd27a);
    const n = kind === "nada" ? 5 : 9;
    for (let i = 0; i < n; i++) {
      this.sparks.spawn(x, y, z, (this.rand() - 0.5) * 5, this.rand() * 4, (this.rand() - 0.5) * 5, color, 0.07, 0.25 + this.rand() * 0.2, 1);
    }
    if (kind === "nada") this.smoke.spawn(x, y, z, 0, 0.4, 0, new THREE.Color(0x9ca3af), 0.25, 0.6, 0.5, 0.6);
  }

  /** The shield shimmering around a soldier that got hit. */
  shieldHit(id: string) {
    const k = this.soldiers.get(id);
    if (k) k.shieldT = 0.25;
  }

  explosion(x: number, y: number, z: number, big: boolean, near: number) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffa040, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.position.set(x, y + 0.3, z);
    this.scene.add(sprite);
    const light = new THREE.PointLight(0xffa040, 30, 14, 2);
    light.position.set(x, y + 1, z);
    this.scene.add(light);
    this.blasts.push({ sprite, light, t: 0, size: big ? 7 : 5.5 });
    const fire = new THREE.Color(0xffb347);
    const dark = new THREE.Color(0x4b4b4b);
    for (let i = 0; i < 40; i++) {
      const a = this.rand() * Math.PI * 2;
      const v = 3 + this.rand() * 9;
      this.sparks.spawn(x, y + 0.3, z, Math.cos(a) * v, this.rand() * 8, Math.sin(a) * v, fire, 0.12, 0.4 + this.rand() * 0.4, 1);
    }
    for (let i = 0; i < 18; i++) {
      this.smoke.spawn(x + (this.rand() - 0.5), y + 0.5 + this.rand(), z + (this.rand() - 0.5), (this.rand() - 0.5) * 2, 1 + this.rand() * 1.5, (this.rand() - 0.5) * 2, dark, 1 + this.rand(), 1.4 + this.rand(), 0.7, 1.5);
    }
    this.shake = Math.max(this.shake, Math.max(0, 1 - near / 18) * 1.2);
  }

  setPickups(items: Record<string, { kind: PickupKind; x: number; z: number }>, mapId: MapId, all: { kind: PickupKind; x: number; z: number }[]) {
    // Pads stay at every spot; the item shows when it's there.
    const w = worldOf(mapId);
    all.forEach((it, i) => {
      const id = `i${i}`;
      let p = this.pickups.get(id);
      if (!p) {
        const group = pickupMesh(it.kind);
        const y = topAt(w, it.x, it.z);
        const pad = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.65, 0.08, 20),
          new THREE.MeshBasicMaterial({ color: it.kind === "botiquin" ? 0xf87171 : it.kind === "granadas" ? 0x84cc16 : this.theme.accent, transparent: true, opacity: 0.55 })
        );
        pad.position.set(it.x, y + 0.04, it.z);
        this.scene.add(pad, group);
        p = { kind: it.kind, group, pad, x: it.x, y, z: it.z };
        this.pickups.set(id, p);
      }
      p.group.visible = id in items;
      (p.pad.material as THREE.MeshBasicMaterial).opacity = id in items ? 0.6 : 0.15;
    });
  }

  setProjectiles(list: Record<string, ProjectileDraw>) {
    for (const [id, g] of this.projectiles) {
      if (!(id in list)) {
        this.scene.remove(g);
        disposeTree(g);
        this.projectiles.delete(id);
      }
    }
    for (const [id, p] of Object.entries(list)) {
      let g = this.projectiles.get(id);
      if (!g) {
        g = new THREE.Group();
        if (p.kind === "cohete") {
          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), phong(0x9ca3af));
          body.rotation.x = Math.PI / 2;
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 8), phong(0xdc2626));
          tip.rotation.x = -Math.PI / 2;
          tip.position.z = -0.33;
          const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
          fl.scale.setScalar(0.8);
          fl.position.z = 0.35;
          g.add(body, tip, fl);
        } else {
          g.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), phong(0x3f6212)));
          const blink = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0x84cc16, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
          blink.scale.setScalar(0.4);
          g.add(blink);
        }
        this.projectiles.set(id, g);
        this.scene.add(g);
      }
      g.position.set(p.x, p.y, p.z);
      const sp = Math.hypot(p.vx, p.vy, p.vz);
      if (sp > 0.1) g.lookAt(p.x - p.vx, p.y - p.vy, p.z - p.vz);
      if (p.kind === "cohete" && this.rand() < 0.7) this.smoke.spawn(p.x, p.y, p.z, 0, 0.3, 0, new THREE.Color(0xd1d5db), 0.35, 0.9, 0.5, 0.8);
    }
  }

  jolt(amount: number) {
    this.shake = Math.max(this.shake, amount);
  }

  private update(dt: number) {
    this.time += dt;
    this.sparks.update(dt);
    this.smoke.update(dt);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life * 8);
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.mesh.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b2 = this.blasts[i];
      b2.t += dt;
      const k = b2.t / 0.45;
      b2.sprite.scale.setScalar(b2.size * (0.4 + k));
      (b2.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - k);
      b2.light.intensity = Math.max(0, 30 * (1 - k * 1.5));
      if (k >= 1) {
        this.scene.remove(b2.sprite, b2.light);
        (b2.sprite.material as THREE.SpriteMaterial).dispose();
        b2.light.dispose();
        this.blasts.splice(i, 1);
      }
    }
    for (const p of this.pickups.values()) {
      p.group.position.set(p.x, p.y + 0.7 + Math.sin(this.time * 2 + p.x) * 0.1, p.z);
      p.group.rotation.y = this.time * 1.2 + p.z;
    }
    this.shake = Math.max(0, this.shake - dt * 3);

    for (const k of this.soldiers.values()) {
      const d = k.draw;
      if (!d) continue;
      k.root.position.set(d.x, d.y, d.z);
      k.root.rotation.y = d.yaw;
      // Walk cycle.
      k.walk += dt * d.speed * 1.6;
      const swing = Math.sin(k.walk * 3) * Math.min(1, d.speed / 4) * 0.6;
      k.legL.rotation.x = swing;
      k.legR.rotation.x = -swing;
      k.body.position.y = Math.abs(Math.cos(k.walk * 3)) * Math.min(1, d.speed / 4) * 0.05;
      k.arms.rotation.x = Math.max(-1.2, Math.min(1.2, d.pitch));
      k.chest.rotation.x = Math.max(-0.3, Math.min(0.3, d.pitch * 0.25));
      // Falling over when dead.
      if (!d.alive) {
        const f = Math.min(1, d.deadFor / 0.5);
        k.body.rotation.x = f * (Math.PI / 2) * 0.95;
        k.body.position.y = -f * 0.6;
        k.tag.visible = false;
      } else {
        k.body.rotation.x = 0;
        k.tag.visible = true;
      }
      const fm = k.flash.material as THREE.SpriteMaterial;
      fm.opacity = Math.max(0, fm.opacity - dt * 18);
      k.shieldT = Math.max(0, k.shieldT - dt);
      (k.shieldFlash.material as THREE.MeshBasicMaterial).opacity = k.shieldT * 2;
    }
  }

  private updateHand(v: ViewModel, dt: number) {
    if (this.handId !== v.weapon) {
      this.handId = v.weapon;
      for (const ch of [...this.handGun.children]) {
        this.handGun.remove(ch);
        if (ch !== this.handFlash) disposeTree(ch);
      }
      const gun = weaponMesh(v.weapon);
      this.handGun.add(gun);
      this.handGun.scale.setScalar(0.62);
      // Gloved hands on the grip and under the barrel.
      const glove = phong(0x262b33, 30);
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.16), glove);
      r.position.set(0.02, -0.07, 0.04);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.16), glove);
      l.position.set(-0.03, -0.04, v.weapon === "pistola" ? 0.0 : -0.38);
      this.handGun.add(r, l);
      this.handGun.add(this.handFlash);
      this.handFlash.position.set(0, 0.05, v.weapon === "pistola" ? -0.32 : v.weapon === "francotirador" ? -1.15 : v.weapon === "lanzacohetes" ? -0.8 : -0.82);
    }
    this.hand.visible = !v.hidden;
    this.bob += dt * Math.min(1, v.speed / 5) * 9;
    const bobX = Math.sin(this.bob) * 0.012 * Math.min(1, v.speed / 5);
    const bobY = Math.abs(Math.cos(this.bob)) * 0.012 * Math.min(1, v.speed / 5);
    // Hip and sights positions.
    const hip = { x: 0.16, y: -0.15, z: -0.34 };
    const ads = { x: 0, y: v.weapon === "francotirador" ? -0.1 : -0.075, z: -0.26 };
    const target = v.aiming ? ads : hip;
    const kick = Math.max(0, 1 - v.sinceShot / 0.12);
    const big = v.weapon === "escopeta" || v.weapon === "lanzacohetes" || v.weapon === "francotirador";
    let y = target.y + bobY;
    let z = target.z + kick * (big ? 0.12 : 0.04);
    let rx = kick * (big ? 0.35 : 0.08);
    let x = target.x + bobX;
    if (v.reload > 0) {
      const t = Math.sin(Math.min(1, v.reload) * Math.PI);
      y -= t * 0.18;
      rx -= t * 0.6;
    }
    if (v.switching > 0) y -= Math.min(1, v.switching / 0.45) * 0.4;
    if (v.melee > 0) {
      const t = Math.sin(Math.min(1, v.melee) * Math.PI);
      z -= t * 0.25;
      x -= t * 0.12;
      rx -= t * 0.3;
    }
    const k = 1 - Math.exp(-dt * 18);
    this.handGun.position.x += (x - this.handGun.position.x) * k;
    this.handGun.position.y += (y - this.handGun.position.y) * k;
    this.handGun.position.z += (z - this.handGun.position.z) * k;
    this.handGun.rotation.x += (rx - this.handGun.rotation.x) * k;
    const fm = this.handFlash.material as THREE.SpriteMaterial;
    fm.opacity = v.sinceShot < 0.05 && v.weapon !== "lanzacohetes" ? 1 : Math.max(0, fm.opacity - dt * 20);
    this.handFlash.material.rotation = this.rand() * Math.PI;
  }

  /** Draws the world from (x, y, z) looking along yaw/pitch, with your weapon on top unless hidden. */
  render(eye: { x: number; y: number; z: number; yaw: number; pitch: number; roll?: number; fov: number }, view: ViewModel | null, dt: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (!cw || !ch) return;
    if (this.renderer.getPixelRatio() !== dpr) this.renderer.setPixelRatio(dpr);
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== cw || size.y !== ch) this.renderer.setSize(cw, ch, false);
    if (this.camera.aspect !== cw / ch || Math.abs(this.camera.fov - eye.fov) > 0.05) {
      this.camera.aspect = cw / ch;
      this.camera.fov = eye.fov;
      this.camera.updateProjectionMatrix();
    }
    this.update(dt);
    const cam = this.camera;
    cam.position.set(eye.x, eye.y, eye.z);
    cam.rotation.set(eye.pitch, eye.yaw, eye.roll ?? 0);
    if (this.shake > 0) {
      cam.position.x += (this.rand() - 0.5) * this.shake * 0.12;
      cam.position.y += (this.rand() - 0.5) * this.shake * 0.12;
    }
    const scale = (ch * dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    this.sparks.setScale(scale);
    this.smoke.setScale(scale);
    this.renderer.setViewport(0, 0, cw, ch);
    this.renderer.clear();
    this.renderer.render(this.scene, cam);
    if (view) {
      this.updateHand(view, dt);
      if (!view.hidden) {
        cam.updateMatrixWorld();
        this.hand.position.copy(cam.position);
        this.hand.quaternion.copy(cam.quaternion);
        this.renderer.clearDepth();
        this.renderer.render(this.handScene, cam);
      }
    }
  }

  /** Where a soldier's muzzle is (for tracers drawn from someone else's gun). */
  muzzle(id: string): [number, number, number] | null {
    const k = this.soldiers.get(id);
    if (!k || !k.draw) return null;
    const v = new THREE.Vector3();
    k.flash.getWorldPosition(v);
    return [v.x, v.y, v.z];
  }

  dispose() {
    disposeTree(this.scene);
    disposeTree(this.handScene);
    this.glow.dispose();
    this.renderer.dispose();
  }
}

/** Eye height over the feet, for the camera. */
export const EYE_HEIGHT = EYE;

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
