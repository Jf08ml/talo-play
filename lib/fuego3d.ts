import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { mulberry32 } from "./random";
import { MAPS, solidBoxes, type Box, type MapDef, type MapId, type MapTheme, type PickupKind, type Ramp } from "./fuegoMaps";
import { EYE, topAt, worldOf, type ProjectileKind, type WeaponId } from "./fuegoSim";

/**
 * Fuego cruzado in 3D (three.js), browser only: the map built from its
 * boxes and ramps, dressed by theme (sky, clouds, sun, ambient particles,
 * glowing panels); armored soldiers made of primitives and animated from
 * their poses alone; pickups floating over glowing pads; tracers, muzzle
 * flashes that light the room, bullet holes, shell casings, sparks, dust,
 * rockets, grenades and explosions (fireball, shockwave, debris, scorch).
 * Your own soldier isn't drawn: the camera is its eyes and your weapon (with
 * arms) is drawn on top in its own pass.
 *
 * Quality "alta" adds bloom (bright things glow) and real-time shadows;
 * "baja" skips both for weaker phones. Every light is created up front and
 * reused, so nothing makes three.js recompile shaders mid-game.
 */

export type { Quality } from "./postfx";
import type { Quality } from "./postfx";

export interface SoldierDraw {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  weapon: WeaponId;
  speed: number;
  alive: boolean;
  /** Seconds since it died (for the fall). */
  deadFor: number;
}

export interface ViewModel {
  weapon: WeaponId;
  /** Seconds since the last shot, reload progress (0 = not reloading), switching, melee (0–1), aiming. */
  sinceShot: number;
  reload: number;
  switching: number;
  melee: number;
  aiming: boolean;
  speed: number;
  /** How much the view turned this frame (radians), for the weapon to lag behind. */
  lookDX: number;
  lookDY: number;
  /** Landing from a jump (0–1, fades out). */
  land: number;
  /** Your armor's color, for the sleeves. */
  color: string;
  /** Hide it (sniper scope, dead). */
  hidden: boolean;
}

type ThemeDef = {
  sky: [number, number];
  fog: number;
  floor: string;
  line: string;
  wall: string;
  block: string;
  plat: string;
  crate: string;
  light: number;
  ground: number;
  accent: number;
  /** Ambient particles: color, how they drift. */
  motes: { color: number; drift: [number, number, number]; size: number; alpha: number };
  /** What bullets kick up. */
  impact: "metal" | "concrete" | "sand";
  sun: boolean;
};

const THEMES: Record<MapTheme, ThemeDef> = {
  bunker: {
    sky: [0x070b14, 0x18202e], fog: 0x121925, floor: "#384150", line: "#56b8d9", wall: "#46505e", block: "#566170", plat: "#647386", crate: "#8a6b3a",
    light: 0xbfd7ff, ground: 0x262b34, accent: 0x38bdf8,
    motes: { color: 0xbfdbfe, drift: [0.05, 0.03, 0.04], size: 0.05, alpha: 0.35 }, impact: "metal", sun: false,
  },
  fortaleza: {
    sky: [0x4f8fdb, 0xd9ecff], fog: 0xbcd6ee, floor: "#6f8f5a", line: "#a3c48a", wall: "#8b8f98", block: "#9aa1ab", plat: "#b4bac2", crate: "#a07a45",
    light: 0xfff4e0, ground: 0x5a7046, accent: 0xf59e0b,
    motes: { color: 0xffffff, drift: [0.3, -0.05, 0.15], size: 0.04, alpha: 0.4 }, impact: "concrete", sun: true,
  },
  valle: {
    sky: [0xd9783f, 0xffd9a0], fog: 0xe8b98a, floor: "#c79a62", line: "#d9b07a", wall: "#9b6a43", block: "#a8744a", plat: "#b98a5c", crate: "#7c5a36",
    light: 0xffe0b8, ground: 0xa87d4f, accent: 0xef4444,
    motes: { color: 0xf3d3a2, drift: [2.4, 0.05, 0.6], size: 0.05, alpha: 0.5 }, impact: "sand", sun: true,
  },
};

const IMPACT_COLORS = { metal: 0xffd27a, concrete: 0xb8b8b8, sand: 0xd6b07a } as const;

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

/** Panels with seams and rivets (walls, blocks, platforms), rock, or a crate. */
function panelTexture(base: string, seed: number, kind: "panel" | "rock" | "crate"): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    const rand = mulberry32(seed);
    if (kind === "rock") {
      for (let i = 0; i < 3200; i++) {
        const v = rand();
        ctx.fillStyle = v > 0.5 ? `rgba(255,240,220,${0.04 + rand() * 0.08})` : `rgba(60,35,20,${0.05 + rand() * 0.1})`;
        const s = 1 + rand() * 5;
        ctx.fillRect(rand() * 256, rand() * 256, s, s * (0.5 + rand()));
      }
      ctx.strokeStyle = "rgba(40,25,15,0.3)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        let x = rand() * 256;
        let y = rand() * 256;
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (rand() - 0.5) * 60;
          y += (rand() - 0.5) * 60;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Strata.
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      for (let y = 0; y < 256; y += 32 + Math.floor(rand() * 20)) ctx.fillRect(0, y, 256, 6);
      return;
    }
    if (kind === "crate") {
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 12;
      ctx.strokeRect(6, 6, 244, 244);
      ctx.beginPath();
      ctx.moveTo(12, 12);
      ctx.lineTo(244, 244);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      for (let y = 20; y < 256; y += 32) ctx.fillRect(12, y, 232, 4);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.font = "bold 28px monospace";
      ctx.fillText("FC-07", 150, 236);
      return;
    }
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = `rgba(${rand() > 0.5 ? "255,255,255" : "0,0,0"},${0.025 + rand() * 0.05})`;
      ctx.fillRect(rand() * 256, rand() * 256, 2 + rand() * 10, 1 + rand() * 3);
    }
    // Streaks of grime running down.
    for (let i = 0; i < 18; i++) {
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "rgba(0,0,0,0.12)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(rand() * 256, 0, 2 + rand() * 6, 80 + rand() * 170);
    }
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    for (const y of [0, 127]) ctx.fillRect(0, y, 256, 3);
    for (const x of [0, 127]) ctx.fillRect(x, 0, 3, 256);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    for (const y of [3, 130]) ctx.fillRect(0, y, 256, 1);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    for (const x of [12, 116, 140, 244]) for (const y of [12, 116, 140, 244]) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function floorTexture(base: string, line: string, rocky: boolean): THREE.CanvasTexture {
  return canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    const rand = mulberry32(3);
    for (let i = 0; i < (rocky ? 9000 : 3500); i++) {
      ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${0.025 + rand() * 0.06})` : `rgba(0,0,0,${0.03 + rand() * 0.08})`;
      const s = 1 + rand() * (rocky ? 4 : 2.5);
      ctx.fillRect(rand() * 512, rand() * 512, s, s);
    }
    if (rocky) {
      // Ripples of sand.
      ctx.strokeStyle = "rgba(120,80,40,0.12)";
      ctx.lineWidth = 3;
      for (let y = 10; y < 512; y += 22) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 512; x += 16) ctx.lineTo(x, y + Math.sin(x / 30 + y) * 4);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = line;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 3;
      for (let i = 0; i <= 512; i += 128) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 512);
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.12;
      ctx.lineWidth = 1;
      for (let i = 64; i < 512; i += 128) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 512);
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
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
      g.addColorStop(0.35, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    },
    false
  );
  t.name = "glow";
  return t;
}

/** A muzzle flash: a four-pointed star. */
function flashTexture(): THREE.CanvasTexture {
  const t = canvasTexture(
    64,
    64,
    (ctx) => {
      ctx.translate(32, 32);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
      g.addColorStop(0, "rgba(255,255,240,1)");
      g.addColorStop(0.3, "rgba(255,210,120,0.9)");
      g.addColorStop(1, "rgba(255,140,40,0)");
      ctx.fillStyle = g;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(30, 0);
        ctx.lineTo(0, 5);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
    },
    false
  );
  t.name = "glow";
  return t;
}

function holeTexture(): THREE.CanvasTexture {
  const t = canvasTexture(
    64,
    64,
    (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
      g.addColorStop(0, "rgba(0,0,0,0.95)");
      g.addColorStop(0.25, "rgba(20,20,20,0.85)");
      g.addColorStop(0.5, "rgba(40,40,40,0.35)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    },
    false
  );
  t.name = "glow";
  return t;
}

function scorchTexture(): THREE.CanvasTexture {
  const t = canvasTexture(
    128,
    128,
    (ctx) => {
      const rand = mulberry32(8);
      for (let i = 0; i < 40; i++) {
        const r = 10 + rand() * 40;
        const x = 64 + (rand() - 0.5) * 40;
        const y = 64 + (rand() - 0.5) * 40;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, "rgba(10,8,6,0.35)");
        g.addColorStop(1, "rgba(10,8,6,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
      }
    },
    false
  );
  t.name = "glow";
  return t;
}

function cloudTexture(): THREE.CanvasTexture {
  const t = canvasTexture(
    128,
    64,
    (ctx) => {
      const rand = mulberry32(4);
      for (let i = 0; i < 14; i++) {
        const x = 20 + rand() * 88;
        const y = 24 + rand() * 18;
        const r = 12 + rand() * 18;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, "rgba(255,255,255,0.55)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 64);
      }
    },
    false
  );
  t.name = "glow";
  return t;
}

function tagTexture(name: string, color: string): THREE.CanvasTexture {
  return canvasTexture(
    256,
    64,
    (ctx) => {
      ctx.font = "bold 30px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.strokeText(name, 128, 32);
      ctx.fillStyle = color;
      ctx.fillText(name, 128, 32);
    },
    false
  );
}

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const phong = (color: number, shininess = 60) => new THREE.MeshPhongMaterial({ color, shininess, specular: 0x777777 });
/** A color bright enough to glow under bloom (values over 1). */
const glowMat = (color: number, k = 2.5, extra: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), ...extra });

function rampGeometry(rp: Ramp): THREE.BufferGeometry {
  const x0 = rp.x - rp.w / 2;
  const x1 = rp.x + rp.w / 2;
  const z0 = rp.z - rp.d / 2;
  const z1 = rp.z + rp.d / 2;
  const y0 = rp.y;
  const y1 = rp.y + rp.h;
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
  const uv: number[] = [];
  for (const v of tris) uv.push((v.x + v.z) / 3, v.y / 3 + v.z / 3);
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

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
    if (ny > 0.5) uv.setXY(i, px / 4, pz / 4);
    else if (nx > 0.5) uv.setXY(i, pz / 4, py / 4);
    else uv.setXY(i, px / 4, py / 4);
  }
  return g;
}

// ---- Weapons ----------------------------------------------------------------------------------

function weaponMesh(id: WeaponId, accent = 0x22d3ee): THREE.Group {
  const g = new THREE.Group();
  const dark = phong(0x22272e, 50);
  const mid = phong(0x4b5563, 70);
  const light = phong(0x9ca3af, 90);
  const glow = glowMat(accent, 2.2);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.rotation.z = rz;
    g.add(m);
    return m;
  };
  // Weapons point toward -z; (0, 0, 0) is the grip.
  if (id === "rifle") {
    add(new THREE.BoxGeometry(0.1, 0.13, 0.6), mid, 0, 0.05, -0.2);
    add(new THREE.BoxGeometry(0.11, 0.06, 0.62), dark, 0, 0.13, -0.21);
    add(new THREE.CylinderGeometry(0.028, 0.028, 0.32, 10), dark, 0, 0.04, -0.62, Math.PI / 2);
    add(new THREE.BoxGeometry(0.07, 0.16, 0.09), dark, 0, -0.08, -0.12, 0.25);
    add(new THREE.BoxGeometry(0.06, 0.13, 0.06), dark, 0, -0.06, 0.02, -0.2);
    add(new THREE.BoxGeometry(0.09, 0.11, 0.22), dark, 0, 0.03, 0.19);
    add(new THREE.BoxGeometry(0.04, 0.025, 0.16), glow, 0, 0.165, -0.22);
    add(new THREE.BoxGeometry(0.105, 0.02, 0.05), glow, 0, 0.06, -0.42);
    add(new THREE.BoxGeometry(0.02, 0.05, 0.03), light, 0, 0.18, -0.05);
  } else if (id === "pistola") {
    add(new THREE.BoxGeometry(0.065, 0.085, 0.3), mid, 0, 0.06, -0.1);
    add(new THREE.BoxGeometry(0.07, 0.03, 0.3), light, 0, 0.11, -0.1);
    add(new THREE.BoxGeometry(0.058, 0.15, 0.075), dark, 0, -0.03, 0.01, -0.2);
    add(new THREE.BoxGeometry(0.03, 0.015, 0.1), glow, 0, 0.13, -0.08);
  } else if (id === "escopeta") {
    add(new THREE.BoxGeometry(0.11, 0.13, 0.66), dark, 0, 0.04, -0.24);
    add(new THREE.CylinderGeometry(0.036, 0.036, 0.62, 12), mid, 0, 0.02, -0.46, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 10), dark, 0, -0.04, -0.42, Math.PI / 2);
    add(new THREE.BoxGeometry(0.12, 0.09, 0.2), light, 0, -0.04, -0.4);
    add(new THREE.BoxGeometry(0.075, 0.13, 0.26), dark, 0, -0.04, 0.15, -0.3);
    add(new THREE.BoxGeometry(0.03, 0.02, 0.24), glow, 0, 0.115, -0.15);
  } else if (id === "francotirador") {
    add(new THREE.BoxGeometry(0.08, 0.1, 0.8), dark, 0, 0.04, -0.25);
    add(new THREE.CylinderGeometry(0.022, 0.026, 0.6, 10), mid, 0, 0.04, -0.88, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 14), mid, 0, 0.15, -0.2, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.052, 0.045, 0.06, 14), dark, 0, 0.15, -0.39, Math.PI / 2);
    add(new THREE.BoxGeometry(0.075, 0.13, 0.28), dark, 0, -0.02, 0.21, -0.25);
    add(new THREE.BoxGeometry(0.05, 0.13, 0.06), dark, 0, -0.07, -0.05, 0.25);
    add(new THREE.CircleGeometry(0.042, 14), glowMat(0x60a5fa, 2), 0, 0.15, -0.421);
    add(new THREE.BoxGeometry(0.02, 0.015, 0.4), glow, 0.042, 0.04, -0.3);
  } else {
    add(new THREE.CylinderGeometry(0.095, 0.095, 0.95, 14), phong(0x3f4a3a, 40), 0, 0.08, -0.25, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.11, 0.1, 0.14, 14), dark, 0, 0.08, -0.75, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.1, 0.11, 0.1, 14), dark, 0, 0.08, 0.23, Math.PI / 2);
    add(new THREE.BoxGeometry(0.06, 0.14, 0.08), dark, 0, -0.05, -0.15, 0.2);
    add(new THREE.BoxGeometry(0.1, 0.1, 0.16), light, 0, 0.21, -0.1);
    add(new THREE.BoxGeometry(0.06, 0.03, 0.22), glow, 0, 0.18, -0.4);
  }
  return g;
}

function pickupMesh(kind: PickupKind): THREE.Group {
  if (kind === "botiquin") {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.36), phong(0xf1f5f9)));
    const red = glowMat(0xdc2626, 1.4);
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
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 16), glowMat(0x84cc16, 1.8));
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

// ---- Soldiers ------------------------------------------------------------------------------

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
  shield: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  shieldT: number;
  wasAlive: boolean;
  color: number;
}

function soldierModel(color: number, glow: THREE.Texture, flash: THREE.Texture, shadows: boolean): SoldierModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const armor = phong(color, 80);
  const under = phong(0x262b33, 30);
  const trim = glowMat(color, 1.6);
  const visorMat = new THREE.MeshPhongMaterial({ color: 0xf2b134, emissive: new THREE.Color(0xd97706).multiplyScalar(0.9), shininess: 140, specular: 0xffffff });

  const legL = new THREE.Group();
  const legR = new THREE.Group();
  for (const [leg, x] of [[legL, -0.15], [legR, 0.15]] as [THREE.Group, number][]) {
    leg.position.set(x, 0.92, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.48, 0.22), under);
    thigh.position.y = -0.24;
    const knee = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.12, 0.24), armor);
    knee.position.set(0, -0.46, -0.02);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.38, 0.22), armor);
    shin.position.y = -0.7;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.32), under);
    boot.position.set(0, -0.88, -0.04);
    leg.add(thigh, knee, shin, boot);
    body.add(leg);
  }
  const chest = new THREE.Group();
  chest.position.y = 0.95;
  body.add(chest);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.34), armor);
  torso.position.y = 0.32;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.06), armor);
  plate.position.set(0, 0.42, -0.19);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.02), trim);
  strip.position.set(0, 0.27, -0.21);
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.3), under);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.18), under);
  pack.position.set(0, 0.36, 0.25);
  const packLight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.02), trim);
  packLight.position.set(0.12, 0.36, 0.345);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), armor);
  helmet.scale.set(1, 1.08, 1.12);
  helmet.position.y = 0.82;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 10, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.32, Math.PI * 0.32), visorMat);
  visor.scale.set(1.15, 1, 1.1);
  visor.rotation.y = Math.PI;
  visor.position.set(0, 0.8, -0.08);
  chest.add(torso, plate, strip, belly, pack, packLight, helmet, visor);
  for (const x of [-0.36, 0.36]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.3), armor);
    pad.position.set(x, 0.58, 0);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.02, 0.31), trim);
    edge.position.set(x, 0.5, 0);
    chest.add(pad, edge);
  }
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

  const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flash, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  fl.scale.setScalar(0.7);
  gun.add(fl);

  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  tag.scale.set(1.6, 0.4, 1);
  tag.position.y = 2.25;
  root.add(tag);

  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 18, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x67e8f9).multiplyScalar(1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true })
  );
  shield.scale.set(1, 1.6, 1);
  shield.position.y = 0.95;
  root.add(shield);

  if (shadows) root.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : null));
  shield.castShadow = false;
  void glow;
  return { root, body, chest, legL, legR, arms, gun, gunId: "", tag, tagKey: "", flash: fl, walk: 0, draw: null, shield, shieldT: 0, wasAlive: true, color };
}

// ---- Particles ------------------------------------------------------------------------------

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
    private gravity: number,
    private dragK = 2.5
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
    const drag = Math.exp(-dt * this.dragK);
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

/** Dust motes / blowing sand that hang around the camera and wrap as it moves. */
class Motes {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private material: THREE.ShaderMaterial;
  private readonly R = 22;

  constructor(
    private count: number,
    private def: ThemeDef["motes"]
  ) {
    this.pos = new Float32Array(count * 3);
    const rand = mulberry32(17);
    for (let i = 0; i < count; i++) this.pos.set([(rand() - 0.5) * 2 * this.R, rand() * 8, (rand() - 0.5) * 2 * this.R], i * 3);
    const col = new Float32Array(count * 3);
    const alpha = new Float32Array(count);
    const size = new Float32Array(count);
    const c = new THREE.Color(def.color);
    for (let i = 0; i < count; i++) {
      col.set([c.r, c.g, c.b], i * 3);
      alpha[i] = def.alpha * (0.4 + rand() * 0.6);
      size[i] = def.size * (0.6 + rand() * 0.8);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("pcolor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
    g.setAttribute("size", new THREE.BufferAttribute(size, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 300 } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
  }

  update(dt: number, cx: number, cy: number, cz: number, time: number) {
    const [dx, dy, dz] = this.def.drift;
    const R = this.R;
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      this.pos[k] += (dx + Math.sin(time * 0.7 + i) * 0.15) * dt;
      this.pos[k + 1] += (dy + Math.cos(time * 0.5 + i * 1.3) * 0.05) * dt;
      this.pos[k + 2] += (dz + Math.cos(time * 0.6 + i * 0.7) * 0.15) * dt;
      // Keep them in a box around the camera.
      if (this.pos[k] - cx > R) this.pos[k] -= 2 * R;
      if (this.pos[k] - cx < -R) this.pos[k] += 2 * R;
      if (this.pos[k + 2] - cz > R) this.pos[k + 2] -= 2 * R;
      if (this.pos[k + 2] - cz < -R) this.pos[k + 2] += 2 * R;
      if (this.pos[k + 1] - cy > 6) this.pos[k + 1] -= 8;
      if (this.pos[k + 1] < Math.max(0.1, cy - 2)) this.pos[k + 1] += 8;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  setScale(scale: number) {
    this.material.uniforms.scale.value = scale;
  }
}

// ---- Pools of short-lived things ------------------------------------------------------------

interface Debris {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  life: number;
  floor: number;
}

interface Tracer {
  mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  life: number;
  max: number;
}

interface Blast {
  core: THREE.Sprite;
  fire: THREE.Sprite;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
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
  /** Seconds since thrown (a grenade blinks faster before it goes off). */
  age?: number;
}

const SIDE_COLORS: Record<string, number> = { red: 0xd9283f, blue: 0x1f7fd6 };

export class FuegoScene {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private scene = new THREE.Scene();
  private handScene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(78, 1, 0.05, 700);
  private glow: THREE.Texture;
  private flashTex: THREE.Texture;
  private holeTex: THREE.Texture;
  private scorchTex: THREE.Texture;
  private soldiers = new Map<string, SoldierModel>();
  private pickups = new Map<string, { kind: PickupKind; group: THREE.Group; pad: THREE.Mesh; beam: THREE.Mesh; x: number; y: number; z: number }>();
  private projectiles = new Map<string, THREE.Group>();
  private sparks = new Particles(500, true, 9);
  private smoke = new Particles(360, false, -0.5, 1.2);
  private motes: Motes;
  private tracers: Tracer[] = [];
  private blasts: Blast[] = [];
  private holes: THREE.Mesh[] = [];
  private holeNext = 0;
  private scorches: THREE.Mesh[] = [];
  private scorchNext = 0;
  private debris: Debris[] = [];
  private debrisNext = 0;
  private shells: Debris[] = [];
  private shellNext = 0;
  private beams: { mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>; t: number }[] = [];
  private flashLights: THREE.PointLight[] = [];
  private flashNext = 0;
  private blastLights: THREE.PointLight[] = [];
  private blastNext = 0;
  private clouds: THREE.Sprite[] = [];
  private hand = new THREE.Group();
  private handRig = new THREE.Group();
  private handGun = new THREE.Group();
  private handFlash: THREE.Sprite;
  private handKey = "";
  private sway = { x: 0, y: 0, vx: 0, vy: 0 };
  private bob = 0;
  private shake = 0;
  private rand = mulberry32(11);
  private time = 0;
  private maxDpr: number;
  private theme: ThemeDef;
  private map: MapDef;
  private shadows: boolean;

  constructor(
    private canvas: HTMLCanvasElement,
    mapId: MapId,
    opts: { quality?: Quality } = {}
  ) {
    const high = (opts.quality ?? "alta") === "alta";
    this.maxDpr = high ? 1.75 : 1.25;
    this.shadows = high;
    this.map = MAPS[mapId];
    this.theme = THEMES[this.map.theme];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.autoClear = false;
    this.renderer.setClearColor(this.theme.fog);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.map.theme === "bunker" ? 1.25 : 1.1;
    if (high) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.scene.fog = new THREE.Fog(this.theme.fog, this.map.theme === "bunker" ? 32 : 70, this.map.theme === "valle" ? 260 : 170);
    this.glow = glowTexture();
    this.flashTex = flashTexture();
    this.holeTex = holeTexture();
    this.scorchTex = scorchTexture();
    this.camera.rotation.order = "YXZ";
    this.build(mapId);
    this.motes = new Motes(high ? 260 : 140, this.theme.motes);
    this.scene.add(this.sparks.points, this.smoke.points, this.motes.points);
    this.makePools();

    // The hands have their own light, so they read well wherever you stand.
    this.handScene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f4a, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(0.5, 1, 0.4);
    this.handScene.add(key);
    this.handFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.handFlash.scale.setScalar(0.4);
    this.handRig.add(this.handGun);
    this.hand.add(this.handRig);
    this.handScene.add(this.hand);

    if (high) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.45, 0.82);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
  }

  private makePools() {
    const s = this.scene;
    // Lights for muzzle flashes and explosions, always in the scene (intensity 0 when idle).
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffc070, 0, 9, 2);
      this.flashLights.push(l);
      s.add(l);
    }
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xff9a40, 0, 18, 2);
      this.blastLights.push(l);
      s.add(l);
    }
    const holeMat = new THREE.MeshBasicMaterial({ map: this.holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const holeGeo = new THREE.PlaneGeometry(0.16, 0.16);
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(holeGeo, holeMat);
      m.visible = false;
      this.holes.push(m);
      s.add(m);
    }
    const scorchMat = new THREE.MeshBasicMaterial({ map: this.scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const scorchGeo = new THREE.PlaneGeometry(3.4, 3.4);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(scorchGeo, scorchMat);
      m.visible = false;
      this.scorches.push(m);
      s.add(m);
    }
    const chunkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const chunkMat = lambert(0x3f3f46);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(chunkGeo, chunkMat);
      m.visible = false;
      s.add(m);
      this.debris.push({ mesh: m, vx: 0, vy: 0, vz: 0, spin: 0, life: 0, floor: 0 });
    }
    const shellGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.028, 6);
    const shellMat = phong(0xd4a72c, 100);
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(shellGeo, shellMat);
      m.visible = false;
      s.add(m);
      this.shells.push({ mesh: m, vx: 0, vy: 0, vz: 0, spin: 0, life: 0, floor: 0 });
    }
  }

  private build(mapId: MapId) {
    const s = this.scene;
    const map = this.map;
    const th = this.theme;
    const w = worldOf(mapId);
    const indoor = map.theme === "bunker";
    s.add(new THREE.HemisphereLight(th.light, th.ground, indoor ? 1.0 : 1.25));
    const sun = new THREE.DirectionalLight(th.light, indoor ? 1.0 : 2.1);
    const sunDir = new THREE.Vector3(-0.45, 0.85, 0.3).normalize();
    sun.position.copy(sunDir.clone().multiplyScalar(80));
    sun.target.position.set(0, 0, 0);
    s.add(sun, sun.target);
    if (this.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const c = sun.shadow.camera;
      const ext = Math.max(map.hx, map.hz) + 6;
      c.left = -ext;
      c.right = ext;
      c.top = ext;
      c.bottom = -ext;
      c.near = 10;
      c.far = 200;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.03;
    }
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(30, 20, -40);
    s.add(fill);

    // Sky dome.
    const skyGeo = new THREE.SphereGeometry(600, 32, 16);
    const top = new THREE.Color(th.sky[0]);
    const hor = new THREE.Color(th.sky[1]);
    const colors: number[] = [];
    const pos = skyGeo.attributes.position;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      c.copy(hor).lerp(top, Math.pow(Math.max(0, pos.getY(i) / 600), 0.55));
      colors.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1;
    s.add(sky);
    // Sun and clouds.
    if (th.sun) {
      const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: new THREE.Color(0xfff1c4).multiplyScalar(2.2), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      sunSprite.position.copy(sunDir.clone().multiplyScalar(500));
      sunSprite.scale.setScalar(140);
      s.add(sunSprite);
      const cloudTex = cloudTexture();
      const rand = mulberry32(31);
      for (let i = 0; i < 16; i++) {
        const cl = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: map.theme === "valle" ? 0xffe6c8 : 0xffffff, transparent: true, opacity: 0.85, fog: false, depthWrite: false }));
        const a = rand() * Math.PI * 2;
        const r = 160 + rand() * 260;
        cl.position.set(Math.cos(a) * r, 90 + rand() * 80, Math.sin(a) * r);
        cl.scale.set(120 + rand() * 120, 45 + rand() * 30, 1);
        this.clouds.push(cl);
        s.add(cl);
      }
    }

    // Floor, and ground outside the walls.
    const rocky = map.theme === "valle";
    const floorTex = floorTexture(th.floor, th.line, rocky);
    floorTex.repeat.set(map.hx / 6, map.hz / 6);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(map.hx * 2, map.hz * 2), new THREE.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = this.shadows;
    s.add(floor);
    const out = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), lambert(th.ground));
    out.rotation.x = -Math.PI / 2;
    out.position.y = -0.05;
    s.add(out);

    const tex = {
      muro: panelTexture(th.wall, 1, rocky ? "rock" : "panel"),
      bloque: panelTexture(th.block, 2, rocky ? "rock" : "panel"),
      plataforma: panelTexture(th.plat, 3, "panel"),
      caja: panelTexture(th.crate, 4, "crate"),
    };
    const mats = Object.fromEntries(Object.entries(tex).map(([k, t]) => [k, new THREE.MeshLambertMaterial({ map: t })])) as Record<Box["kind"], THREE.MeshLambertMaterial>;
    const accent = glowMat(th.accent, 2.4);
    const lampMat = glowMat(0xffffff, 1.8);
    for (const bx of solidBoxes(map)) {
      const m = new THREE.Mesh(boxGeometry(bx), mats[bx.kind]);
      m.position.set(bx.x, bx.y + bx.h / 2, bx.z);
      m.castShadow = this.shadows;
      m.receiveShadow = this.shadows;
      s.add(m);
      if (bx.kind === "plataforma" && bx.w < 40) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(bx.w + 0.04, 0.07, bx.d + 0.04), accent);
        strip.position.set(bx.x, bx.y + bx.h - 0.12, bx.z);
        s.add(strip);
      }
      // Small lamps on the corners of blocks and pillars.
      if ((bx.kind === "muro" || bx.kind === "bloque") && bx.h >= 2.4 && bx.w < 12 && bx.d < 12) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.14), lampMat);
        lamp.position.set(bx.x + bx.w / 2 - 0.08, bx.y + bx.h + 0.04, bx.z + bx.d / 2 - 0.08);
        s.add(lamp);
      }
    }
    if (indoor) {
      // Glowing strips and light panels along the walls.
      for (const z of [-map.hz + 0.02, map.hz - 0.02]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(map.hx * 2, 0.12, 0.04), accent);
        strip.position.set(0, 4.2, z);
        s.add(strip);
        for (let x = -map.hx + 4; x < map.hx; x += 8) {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.05), lampMat);
          panel.position.set(x, 6.2, z);
          s.add(panel);
        }
      }
      for (const x of [-map.hx + 0.02, map.hx - 0.02]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, map.hz * 2), accent);
        strip.position.set(x, 4.2, 0);
        s.add(strip);
        for (let z = -map.hz + 4; z < map.hz; z += 8) {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 1.6), lampMat);
          panel.position.set(x, 6.2, z);
          s.add(panel);
        }
      }
      // A ceiling grid of beams (open, so light comes in).
      const beam = lambert(0x2a3140);
      for (let x = -map.hx; x <= map.hx; x += 6) {
        const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, map.hz * 2), beam);
        b2.position.set(x, map.wallH + 0.2, 0);
        s.add(b2);
      }
    }
    const rampMat = mats.plataforma;
    for (const rp of map.ramps) {
      const m = new THREE.Mesh(rampGeometry(rp), rampMat);
      m.castShadow = this.shadows;
      m.receiveShadow = this.shadows;
      s.add(m);
    }

    // Distant mountains (outdoor maps).
    if (!indoor) {
      const rand = mulberry32(21);
      const mountMat = lambert(map.theme === "valle" ? 0x9c6b45 : 0x5f7f86);
      const farMat = lambert(map.theme === "valle" ? 0xc49a72 : 0x8fa9b4);
      for (let i = 0; i < 34; i++) {
        const a = (i / 34) * Math.PI * 2 + rand() * 0.1;
        const far = i % 2 === 0;
        const r2 = Math.max(map.hx, map.hz) + (far ? 180 : 70) + rand() * 80;
        const h = (far ? 60 : 25) + rand() * 50;
        const m = new THREE.Mesh(new THREE.ConeGeometry(25 + rand() * 30, h, 6), far ? farMat : mountMat);
        m.position.set(Math.cos(a) * r2, h / 2 - 2, Math.sin(a) * r2);
        m.rotation.y = rand() * Math.PI;
        s.add(m);
      }
    }

    // Team spawn rings and base beacons.
    for (const sp of map.spawns) {
      if (!sp.team) continue;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.7, 24), glowMat(SIDE_COLORS[sp.team], 1.4, { transparent: true, opacity: 0.6, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(sp.x, topAt(w, sp.x, sp.z) + 0.02, sp.z);
      s.add(ring);
    }
  }

  // ---- Soldiers -----------------------------------------------------------------------------

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
        k = soldierModel(new THREE.Color(inf.color).getHex(), this.glow, this.flashTex, this.shadows);
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
    // Died just now: the shield pops. Back alive: a spawn shimmer.
    if (k.wasAlive && !d.alive) this.burst(d.x, d.y + 1.1, d.z, 0x67e8f9, 22, 6);
    if (!k.wasAlive && d.alive) this.spawnFx(d.x, d.y, d.z, k.color);
    k.wasAlive = d.alive;
    if (k.gunId !== d.weapon) {
      k.gunId = d.weapon;
      for (const ch of [...k.gun.children]) if (ch !== k.flash) k.gun.remove(ch);
      const gm = weaponMesh(d.weapon);
      if (this.shadows) gm.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : null));
      k.gun.add(gm);
      k.flash.position.set(0, 0.05, d.weapon === "pistola" ? -0.3 : d.weapon === "francotirador" ? -1.2 : -0.82);
    }
  }

  /** A shot: muzzle flash (and its light), a tracer, and what it hits (soldier or a wall, with a hole). */
  shot(
    id: string | null,
    from: [number, number, number],
    ex: number,
    ey: number,
    ez: number,
    weapon: WeaponId,
    hit: "nada" | "escudo" | "cuerpo" | null,
    normal: [number, number, number] | null = null
  ) {
    if (id) {
      const k = this.soldiers.get(id);
      if (k) (k.flash.material as THREE.SpriteMaterial).opacity = 1;
    }
    const [fx, fy, fz] = from;
    this.flashLight(fx, fy, fz, weapon === "escopeta" || weapon === "francotirador" ? 1.6 : 1);
    const dx = ex - fx;
    const dy = ey - fy;
    const dz = ez - fz;
    const len = Math.hypot(dx, dy, dz);
    if (len > 0.5 && weapon !== "lanzacohetes") {
      const sniper = weapon === "francotirador";
      const thick = sniper ? 0.03 : 0.012;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(thick, thick, len, 5, 1, true),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(sniper ? 0x93c5fd : 0xffe08a).multiplyScalar(sniper ? 2.5 : 2),
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      mesh.position.set(fx + dx / 2, fy + dy / 2, fz + dz / 2);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
      this.scene.add(mesh);
      const max = sniper ? 0.45 : 0.07;
      this.tracers.push({ mesh, life: max, max });
    }
    if (hit) this.impact(ex, ey, ez, hit, normal);
  }

  private flashLight(x: number, y: number, z: number, k: number) {
    const l = this.flashLights[this.flashNext];
    this.flashNext = (this.flashNext + 1) % this.flashLights.length;
    l.position.set(x, y, z);
    l.intensity = 6 * k;
  }

  impact(x: number, y: number, z: number, kind: "nada" | "escudo" | "cuerpo", normal: [number, number, number] | null = null) {
    const [nx, ny, nz] = normal ?? [0, 1, 0];
    if (kind === "nada") {
      const surf = this.theme.impact;
      const color = new THREE.Color(IMPACT_COLORS[surf]);
      // A bullet hole oriented on the surface.
      if (normal) {
        const h = this.holes[this.holeNext];
        this.holeNext = (this.holeNext + 1) % this.holes.length;
        h.visible = true;
        h.position.set(x + nx * 0.01, y + ny * 0.01, z + nz * 0.01);
        h.lookAt(x + nx, y + ny, z + nz);
        h.rotation.z = this.rand() * Math.PI;
      }
      const spark = surf === "metal" ? 7 : 3;
      for (let i = 0; i < spark; i++) {
        this.sparks.spawn(x, y, z, nx * 2 + (this.rand() - 0.5) * 4, ny * 2 + this.rand() * 3, nz * 2 + (this.rand() - 0.5) * 4, new THREE.Color(0xffd27a), 0.05, 0.2 + this.rand() * 0.2, 1);
      }
      for (let i = 0; i < (surf === "metal" ? 1 : 3); i++) {
        this.smoke.spawn(x + nx * 0.1, y + ny * 0.1, z + nz * 0.1, nx * 0.8 + (this.rand() - 0.5) * 0.4, ny * 0.8 + 0.3, nz * 0.8 + (this.rand() - 0.5) * 0.4, color, 0.18, 0.7 + this.rand() * 0.4, 0.55, 0.7);
      }
      return;
    }
    const color = new THREE.Color(kind === "escudo" ? 0x67e8f9 : 0xef4444);
    for (let i = 0; i < 10; i++) {
      this.sparks.spawn(x, y, z, (this.rand() - 0.5) * 5, this.rand() * 4, (this.rand() - 0.5) * 5, color, kind === "escudo" ? 0.07 : 0.06, 0.25 + this.rand() * 0.2, 1);
    }
  }

  private burst(x: number, y: number, z: number, color: number, n: number, speed: number) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const e = (this.rand() - 0.3) * Math.PI;
      const v = speed * (0.4 + this.rand() * 0.6);
      this.sparks.spawn(x, y, z, Math.cos(a) * Math.cos(e) * v, Math.sin(e) * v + 1, Math.sin(a) * Math.cos(e) * v, c, 0.08, 0.5 + this.rand() * 0.4, 1);
    }
  }

  /** Coming back to life: a column of light and rising sparks. */
  private spawnFx(x: number, y: number, z: number, color: number) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 3.2, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    mesh.position.set(x, y + 1.6, z);
    this.scene.add(mesh);
    this.beams.push({ mesh, t: 0 });
    const c = new THREE.Color(color);
    for (let i = 0; i < 18; i++) {
      const a = this.rand() * Math.PI * 2;
      this.sparks.spawn(x + Math.cos(a) * 0.5, y + this.rand() * 0.4, z + Math.sin(a) * 0.5, 0, 2 + this.rand() * 3, 0, c, 0.06, 0.8, 1);
    }
  }

  /** The shield shimmering around a soldier that got hit. */
  shieldHit(id: string) {
    const k = this.soldiers.get(id);
    if (k) k.shieldT = 0.3;
  }

  explosion(x: number, y: number, z: number, big: boolean, near: number) {
    const size = big ? 7.5 : 6;
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: new THREE.Color(0xfff2c4).multiplyScalar(3), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.position.set(x, y + 0.4, z);
    const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: new THREE.Color(0xff7a1a).multiplyScalar(2.2), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    fire.position.set(x, y + 0.8, z);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd7a0).multiplyScalar(1.8), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, Math.max(0.05, y - 0.2), z);
    this.scene.add(core, fire, ring);
    const light = this.blastLights[this.blastNext];
    this.blastNext = (this.blastNext + 1) % this.blastLights.length;
    light.position.set(x, y + 1.2, z);
    light.intensity = 45;
    this.blasts.push({ core, fire, ring, light, t: 0, size });
    // Embers, smoke and flying chunks.
    const ember = new THREE.Color(0xffb347);
    for (let i = 0; i < 46; i++) {
      const a = this.rand() * Math.PI * 2;
      const v = 3 + this.rand() * 10;
      this.sparks.spawn(x, y + 0.3, z, Math.cos(a) * v, this.rand() * 9, Math.sin(a) * v, ember, 0.1, 0.4 + this.rand() * 0.6, 1);
    }
    const gray = new THREE.Color(0x9ca3af);
    const dark = new THREE.Color(0x52525b);
    for (let i = 0; i < 16; i++) {
      this.smoke.spawn(
        x + (this.rand() - 0.5) * 1.5,
        y + 0.4 + this.rand(),
        z + (this.rand() - 0.5) * 1.5,
        (this.rand() - 0.5) * 3,
        1 + this.rand() * 2,
        (this.rand() - 0.5) * 3,
        i % 3 ? gray : dark,
        0.5 + this.rand() * 0.5,
        1.4 + this.rand(),
        0.45,
        1.1
      );
    }
    for (let i = 0; i < 10; i++) {
      const d = this.debris[this.debrisNext];
      this.debrisNext = (this.debrisNext + 1) % this.debris.length;
      const a = this.rand() * Math.PI * 2;
      const v = 4 + this.rand() * 7;
      d.mesh.visible = true;
      d.mesh.position.set(x, y + 0.3, z);
      d.mesh.scale.setScalar(0.5 + this.rand());
      d.vx = Math.cos(a) * v;
      d.vz = Math.sin(a) * v;
      d.vy = 4 + this.rand() * 6;
      d.spin = (this.rand() - 0.5) * 20;
      d.life = 2.5;
      d.floor = topAt(worldOf(this.map.id), x, z);
    }
    // A scorch mark on the floor.
    if (y < topAt(worldOf(this.map.id), x, z) + 1.2) {
      const sc = this.scorches[this.scorchNext];
      this.scorchNext = (this.scorchNext + 1) % this.scorches.length;
      sc.visible = true;
      sc.rotation.set(-Math.PI / 2, 0, this.rand() * Math.PI);
      sc.position.set(x, topAt(worldOf(this.map.id), x, z) + 0.02, z);
    }
    this.shake = Math.max(this.shake, Math.max(0, 1 - near / 20) * 1.3);
  }

  /** A spent casing flying out of your weapon (to the right). */
  ejectShell(weapon: WeaponId) {
    if (weapon === "lanzacohetes") return;
    const cam = this.camera;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const d = this.shells[this.shellNext];
    this.shellNext = (this.shellNext + 1) % this.shells.length;
    d.mesh.visible = true;
    d.mesh.position.copy(cam.position).addScaledVector(right, 0.2).addScaledVector(fwd, 0.45).add(new THREE.Vector3(0, -0.12, 0));
    d.vx = right.x * (2 + this.rand()) + fwd.x * 0.5;
    d.vz = right.z * (2 + this.rand()) + fwd.z * 0.5;
    d.vy = 2 + this.rand() * 1.5;
    d.spin = 15 + this.rand() * 10;
    d.life = 1.2;
    d.floor = cam.position.y - EYE;
  }

  /** Dust when a soldier lands or runs. */
  dust(x: number, y: number, z: number, amount: number) {
    const c = new THREE.Color(IMPACT_COLORS[this.theme.impact]);
    for (let i = 0; i < amount; i++) {
      const a = this.rand() * Math.PI * 2;
      this.smoke.spawn(x + Math.cos(a) * 0.3, y + 0.05, z + Math.sin(a) * 0.3, Math.cos(a) * 1.2, 0.3, Math.sin(a) * 1.2, c, 0.3, 0.6, 0.4, 0.8);
    }
  }

  setPickups(items: Record<string, { kind: PickupKind; x: number; z: number }>, mapId: MapId, all: { kind: PickupKind; x: number; z: number }[]) {
    const w = worldOf(mapId);
    all.forEach((it, i) => {
      const id = `i${i}`;
      let p = this.pickups.get(id);
      if (!p) {
        const group = pickupMesh(it.kind);
        const y = topAt(w, it.x, it.z);
        const color = it.kind === "botiquin" ? 0xf87171 : it.kind === "granadas" ? 0x84cc16 : this.theme.accent;
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.08, 24), glowMat(color, 1.4, { transparent: true, opacity: 0.6 }));
        pad.position.set(it.x, y + 0.04, it.z);
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.55, 1.6, 20, 1, true),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.2), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
        );
        beam.position.set(it.x, y + 0.85, it.z);
        this.scene.add(pad, beam, group);
        p = { kind: it.kind, group, pad, beam, x: it.x, y, z: it.z };
        this.pickups.set(id, p);
      }
      const here = id in items;
      if (here && !p.group.visible) this.burst(p.x, p.y + 0.6, p.z, 0xffffff, 10, 2);
      p.group.visible = here;
      p.beam.visible = here;
      (p.pad.material as THREE.MeshBasicMaterial).opacity = here ? 0.65 : 0.12;
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
          const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: new THREE.Color(0xffa040).multiplyScalar(3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
          fl.scale.setScalar(1.1);
          fl.position.z = 0.35;
          g.add(body, tip, fl);
        } else {
          g.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), phong(0x3f6212)));
          const blink = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: new THREE.Color(0x84cc16).multiplyScalar(2.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
          blink.scale.setScalar(0.45);
          blink.name = "blink";
          g.add(blink);
        }
        this.projectiles.set(id, g);
        this.scene.add(g);
      }
      g.position.set(p.x, p.y, p.z);
      const sp = Math.hypot(p.vx, p.vy, p.vz);
      if (sp > 0.1) g.lookAt(p.x - p.vx, p.y - p.vy, p.z - p.vz);
      if (p.kind === "cohete") {
        this.smoke.spawn(p.x, p.y, p.z, (this.rand() - 0.5) * 0.3, 0.2, (this.rand() - 0.5) * 0.3, new THREE.Color(0xd1d5db), 0.3, 1.1, 0.45, 0.9);
        this.sparks.spawn(p.x, p.y, p.z, -p.vx * 0.05, -p.vy * 0.05, -p.vz * 0.05, new THREE.Color(0xffa040), 0.09, 0.15, 1);
      } else {
        // Blinks faster as the fuse runs out.
        const blink = g.getObjectByName("blink") as THREE.Sprite | undefined;
        if (blink) {
          const age = p.age ?? 0;
          const rate = 4 + age * 10;
          (blink.material as THREE.SpriteMaterial).opacity = Math.sin(this.time * rate) > 0 ? 1 : 0.15;
        }
      }
    }
  }

  jolt(amount: number) {
    this.shake = Math.max(this.shake, amount);
  }

  private stepBits(list: Debris[], dt: number, bounce: number) {
    for (const d of list) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.mesh.visible = false;
        continue;
      }
      d.vy -= 18 * dt;
      const p = d.mesh.position;
      p.x += d.vx * dt;
      p.y += d.vy * dt;
      p.z += d.vz * dt;
      if (p.y < d.floor + 0.03) {
        p.y = d.floor + 0.03;
        d.vy = Math.abs(d.vy) * bounce;
        d.vx *= 0.6;
        d.vz *= 0.6;
        d.spin *= 0.6;
      }
      d.mesh.rotation.x += d.spin * dt;
      d.mesh.rotation.z += d.spin * 0.7 * dt;
    }
  }

  private update(dt: number) {
    this.time += dt;
    this.sparks.update(dt);
    this.smoke.update(dt);
    this.motes.update(dt, this.camera.position.x, this.camera.position.y, this.camera.position.z, this.time);
    this.stepBits(this.debris, dt, 0.35);
    this.stepBits(this.shells, dt, 0.3);
    for (const l of this.flashLights) l.intensity = Math.max(0, l.intensity - dt * 120);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, (t.life / t.max) * 0.9);
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
      const k = b2.t / 0.55;
      b2.core.scale.setScalar(b2.size * 0.6 * (0.3 + k * 0.8));
      (b2.core.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - k * 1.8);
      b2.fire.scale.setScalar(b2.size * (0.4 + k));
      b2.fire.position.y += dt * 1.5;
      (b2.fire.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - k);
      b2.ring.scale.setScalar(1 + k * b2.size * 1.4);
      b2.ring.material.opacity = Math.max(0, 0.8 * (1 - k));
      b2.light.intensity = Math.max(0, 45 * (1 - k * 1.4));
      if (k >= 1) {
        this.scene.remove(b2.core, b2.fire, b2.ring);
        (b2.core.material as THREE.SpriteMaterial).dispose();
        (b2.fire.material as THREE.SpriteMaterial).dispose();
        b2.ring.geometry.dispose();
        b2.ring.material.dispose();
        b2.light.intensity = 0;
        this.blasts.splice(i, 1);
      }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b2 = this.beams[i];
      b2.t += dt;
      b2.mesh.material.opacity = Math.max(0, 0.6 * (1 - b2.t / 0.8));
      b2.mesh.scale.set(1 - b2.t * 0.5, 1 + b2.t, 1 - b2.t * 0.5);
      if (b2.t > 0.8) {
        this.scene.remove(b2.mesh);
        b2.mesh.geometry.dispose();
        b2.mesh.material.dispose();
        this.beams.splice(i, 1);
      }
    }
    for (const cl of this.clouds) {
      cl.position.x += dt * 1.5;
      if (cl.position.x > 450) cl.position.x -= 900;
    }
    for (const p of this.pickups.values()) {
      p.group.position.set(p.x, p.y + 0.75 + Math.sin(this.time * 2 + p.x) * 0.1, p.z);
      p.group.rotation.y = this.time * 1.2 + p.z;
      (p.beam.material as THREE.MeshBasicMaterial).opacity = 0.08 + Math.sin(this.time * 3 + p.x) * 0.04;
    }
    this.shake = Math.max(0, this.shake - dt * 3);

    for (const k of this.soldiers.values()) {
      const d = k.draw;
      if (!d) continue;
      k.root.position.set(d.x, d.y, d.z);
      k.root.rotation.y = d.yaw;
      k.walk += dt * d.speed * 1.6;
      const swing = Math.sin(k.walk * 3) * Math.min(1, d.speed / 4) * 0.6;
      k.legL.rotation.x = swing;
      k.legR.rotation.x = -swing;
      k.body.position.y = Math.abs(Math.cos(k.walk * 3)) * Math.min(1, d.speed / 4) * 0.05;
      k.arms.rotation.x = Math.max(-1.2, Math.min(1.2, d.pitch));
      k.chest.rotation.x = Math.max(-0.3, Math.min(0.3, d.pitch * 0.25));
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
      fm.rotation = this.rand() * Math.PI;
      k.shieldT = Math.max(0, k.shieldT - dt);
      k.shield.material.opacity = k.shieldT * 2.2;
      k.shield.rotation.y += dt * 4;
    }
  }

  private updateHand(v: ViewModel, dt: number) {
    const key = `${v.weapon}|${v.color}`;
    if (this.handKey !== key) {
      this.handKey = key;
      for (const ch of [...this.handGun.children]) {
        this.handGun.remove(ch);
        if (ch !== this.handFlash) disposeTree(ch);
      }
      const gun = weaponMesh(v.weapon);
      this.handGun.add(gun);
      // Gloved hands with short forearms in a dark suit, a small armor plate in your color on each.
      const suit = phong(0x2b313b, 40);
      const glove = phong(0x1f242c, 30);
      const plate = phong(new THREE.Color(v.color).getHex(), 80);
      const pistol = v.weapon === "pistola";
      const forearm = (x: number, y: number, z: number, ry: number) => {
        const g2 = new THREE.Group();
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.24), suit);
        arm.position.z = 0.12;
        const pl = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.14), plate);
        pl.position.set(0, 0.05, 0.13);
        g2.add(arm, pl);
        g2.position.set(x, y, z);
        g2.rotation.set(0.35, ry, 0);
        return g2;
      };
      const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.12), glove);
      rightHand.position.set(0.015, -0.07, 0.04);
      const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.12), glove);
      leftHand.position.set(-0.03, -0.05, pistol ? 0.0 : -0.38);
      this.handGun.add(
        rightHand,
        leftHand,
        forearm(0.03, -0.1, 0.08, 0.15),
        forearm(-0.05, -0.08, pistol ? 0.04 : -0.33, -0.25)
      );
      this.handGun.add(this.handFlash);
      this.handFlash.position.set(0, 0.05, pistol ? -0.33 : v.weapon === "francotirador" ? -1.2 : v.weapon === "lanzacohetes" ? -0.84 : -0.82);
      this.handGun.scale.setScalar(0.62);
    }
    this.hand.visible = !v.hidden;
    const moving = Math.min(1, v.speed / 5);
    this.bob += dt * moving * 9;
    const bobX = Math.sin(this.bob) * 0.012 * moving;
    const bobY = Math.abs(Math.cos(this.bob)) * 0.012 * moving;
    // The weapon lags behind when you turn, then springs back.
    const sw = this.sway;
    const k1 = 60;
    const damp = 10;
    sw.vx += (-v.lookDX * 0.9 - sw.x) * k1 * dt - sw.vx * damp * dt;
    sw.vy += (v.lookDY * 0.9 - sw.y) * k1 * dt - sw.vy * damp * dt;
    sw.x += sw.vx * dt;
    sw.y += sw.vy * dt;
    sw.x = Math.max(-0.06, Math.min(0.06, sw.x));
    sw.y = Math.max(-0.06, Math.min(0.06, sw.y));
    const aimK = v.aiming ? 0.25 : 1;
    const hip = { x: 0.16, y: -0.15, z: -0.34 };
    const ads = { x: 0, y: v.weapon === "francotirador" ? -0.1 : -0.075, z: -0.26 };
    const target = v.aiming ? ads : hip;
    const kick = Math.max(0, 1 - v.sinceShot / 0.12);
    const big = v.weapon === "escopeta" || v.weapon === "lanzacohetes" || v.weapon === "francotirador";
    const breathe = Math.sin(this.time * 1.6) * 0.004 * aimK;
    let x = target.x + bobX * aimK + sw.x * aimK;
    let y = target.y + bobY * aimK + breathe - sw.y * aimK - v.land * 0.05;
    let z = target.z + kick * (big ? 0.11 : 0.035);
    let rx = kick * (big ? 0.32 : 0.07) + sw.y * 2 * aimK;
    let rz = -sw.x * 3 * aimK;
    if (v.reload > 0) {
      const t = Math.sin(Math.min(1, v.reload) * Math.PI);
      y -= t * 0.18;
      rx -= t * 0.6;
      rz += t * 0.4;
    }
    if (v.switching > 0) y -= Math.min(1, v.switching / 0.45) * 0.4;
    if (v.melee > 0) {
      const t = Math.sin(Math.min(1, v.melee) * Math.PI);
      z -= t * 0.25;
      x -= t * 0.12;
      rx -= t * 0.3;
    }
    const k = 1 - Math.exp(-dt * 18);
    const g = this.handGun;
    g.position.x += (x - g.position.x) * k;
    g.position.y += (y - g.position.y) * k;
    g.position.z += (z - g.position.z) * k;
    g.rotation.x += (rx - g.rotation.x) * k;
    g.rotation.z += (rz - g.rotation.z) * k;
    const fm = this.handFlash.material as THREE.SpriteMaterial;
    fm.opacity = v.sinceShot < 0.05 && v.weapon !== "lanzacohetes" ? 1 : Math.max(0, fm.opacity - dt * 20);
    fm.rotation = this.rand() * Math.PI;
    this.handFlash.scale.setScalar(v.weapon === "escopeta" ? 0.6 : v.weapon === "francotirador" ? 0.55 : 0.4);
  }

  /** Draws the world from the eye, with your weapon on top unless hidden. */
  render(eye: { x: number; y: number; z: number; yaw: number; pitch: number; roll?: number; fov: number }, view: ViewModel | null, dt: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (!cw || !ch) return;
    if (this.renderer.getPixelRatio() !== dpr) {
      this.renderer.setPixelRatio(dpr);
      this.composer?.setPixelRatio(dpr);
    }
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== cw || size.y !== ch) {
      this.renderer.setSize(cw, ch, false);
      this.composer?.setSize(cw, ch);
    }
    if (this.camera.aspect !== cw / ch || Math.abs(this.camera.fov - eye.fov) > 0.05) {
      this.camera.aspect = cw / ch;
      this.camera.fov = eye.fov;
      this.camera.updateProjectionMatrix();
    }
    const cam = this.camera;
    cam.position.set(eye.x, eye.y, eye.z);
    cam.rotation.set(eye.pitch, eye.yaw, eye.roll ?? 0);
    if (this.shake > 0) {
      cam.position.x += (this.rand() - 0.5) * this.shake * 0.12;
      cam.position.y += (this.rand() - 0.5) * this.shake * 0.12;
    }
    this.update(dt);
    const scale = (ch * dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    this.sparks.setScale(scale);
    this.smoke.setScale(scale);
    this.motes.setScale(scale);
    this.renderer.setViewport(0, 0, cw, ch);
    if (this.composer) {
      this.composer.render(dt);
    } else {
      this.renderer.clear();
      this.renderer.render(this.scene, cam);
    }
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
    for (const t of [this.glow, this.flashTex, this.holeTex, this.scorchTex]) t.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
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
