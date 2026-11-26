import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "./random";
import { MAPS, solidBoxes, type Box, type MapDef, type MapId, type MapTheme, type PickupKind, type Ramp } from "./fuegoMaps";
import { EYE, topAt, worldOf, type ProjectileKind, type WeaponId, type World } from "./fuegoSim";

/**
 * Fuego cruzado in 3D (three.js), browser only: the map built from its
 * boxes and ramps, dressed by theme (sky, clouds, sun, ambient particles,
 * glowing panels); armored soldiers made of primitives and animated from
 * their poses alone; pickups floating over glowing pads; tracers, muzzle
 * flashes that light the room, bullet holes, shell casings, sparks, dust,
 * rockets, grenades and explosions (fireball, shockwave, debris, scorch).
 * Your own soldier isn't drawn: the camera is its eyes and your weapon (with
 * arms) is drawn on top in its own pass. On a big screen `renderViews` draws
 * up to four first-person views side by side (scissored viewports, each with
 * its own weapon rig; no bloom there, like Carreras' split screen).
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
  /** Just respawned and still protected: the shield shimmers. */
  guard?: boolean;
}

/** An eye to draw the world from. */
export interface Eye {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll?: number;
  fov: number;
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

type WallKind = "panel" | "stone" | "rock";
type FloorKind = "concrete" | "grass" | "sand";

type ThemeDef = {
  /** What the floor and the walls are made of (each has its own texture). */
  floorKind: FloorKind;
  wallKind: WallKind;
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
    floorKind: "concrete", wallKind: "panel",
    sky: [0x070b14, 0x18202e], fog: 0x121925, floor: "#384150", line: "#56b8d9", wall: "#46505e", block: "#566170", plat: "#647386", crate: "#8a6b3a",
    light: 0xbfd7ff, ground: 0x262b34, accent: 0x38bdf8,
    motes: { color: 0xbfdbfe, drift: [0.05, 0.03, 0.04], size: 0.05, alpha: 0.35 }, impact: "metal", sun: false,
  },
  fortaleza: {
    floorKind: "grass", wallKind: "stone",
    sky: [0x4f8fdb, 0xd9ecff], fog: 0xbcd6ee, floor: "#6f8f5a", line: "#a3c48a", wall: "#8b8f98", block: "#9aa1ab", plat: "#b4bac2", crate: "#a07a45",
    light: 0xfff4e0, ground: 0x5a7046, accent: 0xf59e0b,
    motes: { color: 0xffffff, drift: [0.3, -0.05, 0.15], size: 0.04, alpha: 0.4 }, impact: "concrete", sun: true,
  },
  valle: {
    floorKind: "sand", wallKind: "rock",
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

/** Draws `fn` at (x, y) and wrapped across the tile's edges, so the texture tiles without seams. */
function wrapped(size: number, x: number, y: number, r: number, fn: (x: number, y: number) => void) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) if (x + dx > -r && x + dx < size + r && y + dy > -r && y + dy < size + r) fn(x + dx, y + dy);
}

/** A soft round blotch (stains, patches of grass or dirt). */
function blotch(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/**
 * Walls and blocks: big metal panels (bunker, one per tile, seams only at
 * its edges), staggered stone blocks of uneven width (fortress), rock
 * (valley), or a crate. Everything wraps, so tiles join without a grid.
 */
function panelTexture(base: string, seed: number, kind: WallKind | "crate"): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    const rand = mulberry32(seed);
    const speckle = (n: number, a: number, max: number) => {
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${rand() * a})` : `rgba(0,0,0,${rand() * a * 1.3})`;
        const sz = 1 + rand() * max;
        ctx.fillRect(rand() * 256, rand() * 256, sz, sz * (0.5 + rand()));
      }
    };
    const grime = (n: number, a: number) => {
      for (let i = 0; i < n; i++) {
        const g = ctx.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, `rgba(0,0,0,${a})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(rand() * 256, 0, 2 + rand() * 8, 60 + rand() * 190);
      }
    };
    if (kind === "rock") {
      speckle(3200, 0.12, 5);
      for (let i = 0; i < 14; i++) wrapped(256, rand() * 256, rand() * 256, 60, (x, y) => blotch(ctx, x, y, 30 + rand() * 30, rand() > 0.5 ? "rgba(255,235,210,0.10)" : "rgba(60,35,20,0.14)"));
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
      speckle(500, 0.06, 3);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.font = "bold 28px monospace";
      ctx.fillText("FC-07", 150, 236);
      return;
    }
    if (kind === "stone") {
      // Mortar, then rows of blocks whose widths add up to the tile (so it wraps), each its own shade.
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(0, 0, 256, 256);
      const rowH = 32;
      for (let row = 0; row < 256 / rowH; row++) {
        const widths: number[] = [];
        let total = 0;
        while (total < 256) {
          const w = 40 + rand() * 50;
          widths.push(w);
          total += w;
        }
        const k = 256 / total;
        let x = rand() * 256;
        const y = row * rowH;
        for (const w0 of widths) {
          const w = w0 * k;
          const shade = (rand() - 0.5) * 0.2;
          wrapped(256, x, y, 0, (bx) => {
            if (bx >= 256 || bx + w <= 0) return;
            ctx.fillStyle = base;
            ctx.fillRect(bx + 1.5, y + 1.5, w - 3, rowH - 3);
            ctx.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(0,0,0,${-shade})`;
            ctx.fillRect(bx + 1.5, y + 1.5, w - 3, rowH - 3);
            ctx.fillStyle = "rgba(255,255,255,0.12)";
            ctx.fillRect(bx + 2, y + 2, w - 4, 2);
            ctx.fillStyle = "rgba(0,0,0,0.18)";
            ctx.fillRect(bx + 2, y + rowH - 4, w - 4, 2);
          });
          x = (x + w) % 256;
        }
      }
      speckle(1800, 0.08, 3);
      for (let i = 0; i < 8; i++) wrapped(256, rand() * 256, rand() * 256, 50, (x, y) => blotch(ctx, x, y, 25 + rand() * 25, "rgba(60,80,40,0.12)"));
      grime(10, 0.1);
      return;
    }
    // Metal: one big panel per tile, soft seams on its edges, a recessed band, a few rivets and scratches.
    speckle(900, 0.05, 6);
    for (let i = 0; i < 6; i++) wrapped(256, rand() * 256, rand() * 256, 70, (x, y) => blotch(ctx, x, y, 35 + rand() * 35, rand() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.08)"));
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, 256, 2);
    ctx.fillRect(0, 0, 2, 256);
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(0, 2, 256, 1);
    ctx.fillRect(2, 0, 1, 256);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(0, 170, 256, 24);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(0, 170, 256, 1.5);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    for (const x of [10, 246]) for (const y of [10, 246]) {
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      const x = rand() * 256;
      const y = rand() * 256;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 40, y + (rand() - 0.5) * 12);
      ctx.stroke();
    }
    grime(16, 0.12);
  });
}

/**
 * Floors, with no grid: concrete slabs laid staggered with stains and cracks
 * (bunker), grass with patches of dirt (fortress), rippled sand (valley).
 */
function floorTexture(base: string, line: string, kind: FloorKind): THREE.CanvasTexture {
  return canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    const rand = mulberry32(3);
    const speckle = (n: number, a: number, max: number) => {
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${0.02 + rand() * a})` : `rgba(0,0,0,${0.03 + rand() * a * 1.3})`;
        const sz = 1 + rand() * max;
        ctx.fillRect(rand() * 512, rand() * 512, sz, sz);
      }
    };
    if (kind === "sand") {
      speckle(9000, 0.06, 4);
      for (let i = 0; i < 18; i++) wrapped(512, rand() * 512, rand() * 512, 110, (x, y) => blotch(ctx, x, y, 60 + rand() * 50, rand() > 0.5 ? "rgba(255,240,210,0.10)" : "rgba(120,80,40,0.10)"));
      ctx.strokeStyle = "rgba(120,80,40,0.12)";
      ctx.lineWidth = 3;
      for (let y = 10; y < 512; y += 22) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 512; x += 16) ctx.lineTo(x, y + Math.sin((x / 512) * Math.PI * 4 + y) * 4);
        ctx.stroke();
      }
      return;
    }
    if (kind === "grass") {
      for (let i = 0; i < 30; i++)
        wrapped(512, rand() * 512, rand() * 512, 120, (x, y) =>
          blotch(ctx, x, y, 50 + rand() * 70, rand() > 0.7 ? "rgba(120,92,55,0.35)" : rand() > 0.5 ? "rgba(200,230,140,0.16)" : "rgba(20,50,10,0.18)")
        );
      speckle(4000, 0.05, 2);
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 9000; i++) {
        const x = rand() * 512;
        const y = rand() * 512;
        const l = 3 + rand() * 6;
        const g = 110 + Math.floor(rand() * 80);
        ctx.strokeStyle = `rgba(${60 + Math.floor(rand() * 50)},${g},${30 + Math.floor(rand() * 30)},${0.25 + rand() * 0.35})`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 3, y - l);
        ctx.stroke();
      }
      return;
    }
    // Concrete: big slabs laid staggered (no grid), stains, cracks, a few worn paint marks.
    speckle(5000, 0.05, 2.5);
    for (let i = 0; i < 22; i++) wrapped(512, rand() * 512, rand() * 512, 100, (x, y) => blotch(ctx, x, y, 30 + rand() * 70, rand() > 0.6 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.14)"));
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, 512, 2);
    ctx.fillRect(0, 256, 512, 2);
    ctx.fillRect(0, 0, 2, 256);
    ctx.fillRect(256, 256, 2, 256);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(0, 2, 512, 1);
    ctx.fillRect(0, 258, 512, 1);
    ctx.strokeStyle = "rgba(0,0,0,0.22)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      let x = rand() * 512;
      let y = rand() * 512;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rand() - 0.5) * 50;
        y += (rand() - 0.5) * 50;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = line;
    for (let i = 0; i < 3; i++) {
      const x = 40 + rand() * 420;
      const y = 40 + rand() * 420;
      for (let k = 0; k < 4; k++) ctx.fillRect(x + k * 22, y, 14, 6);
    }
    ctx.globalAlpha = 1;
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

/** A rounded box (radius kept under half its smallest side). */
function rbox(w: number, h: number, d: number, r = Math.min(w, h, d) * 0.25): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) * 0.48));
}

function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

/** A rounded limb (capsule) from a to b, with round ends at both joints. */
function limb(parent: THREE.Object3D, a: [number, number, number], b: [number, number, number], r: number, mat: THREE.Material): THREE.Mesh {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, dir.length()), 4, 10), mat);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(m);
  return m;
}

/** Merges a group's direct child meshes that share a material into one mesh each: far fewer draw calls. */
function bake(group: THREE.Object3D) {
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const ch of [...group.children]) {
    const m = ch as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) continue;
    m.updateMatrix();
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    m.geometry.dispose();
    group.remove(m);
    const list = byMat.get(m.material) ?? [];
    list.push(g);
    byMat.set(m.material, list);
  }
  for (const [mat, list] of byMat) {
    const merged = list.length === 1 ? list[0] : mergeGeometries(list);
    if (merged) group.add(new THREE.Mesh(merged, mat));
    else for (const g of list) group.add(new THREE.Mesh(g, mat));
  }
}

/**
 * A map block, already in place: softly rounded edges, UVs from the world
 * position (textures line up across blocks), and darker toward its foot
 * (a cheap ambient occlusion, in vertex colors).
 */
function boxGeometry(bx: Box): THREE.BufferGeometry {
  const r = Math.min(0.09, bx.w / 4, bx.h / 4, bx.d / 4);
  // Rounded boxes come out non-indexed; plain ones are made so too, so all of them merge.
  const g: THREE.BufferGeometry = r > 0.012 ? new RoundedBoxGeometry(bx.w, bx.h, bx.d, 2, r) : new THREE.BoxGeometry(bx.w, bx.h, bx.d).toNonIndexed();
  g.translate(bx.x, bx.y + bx.h / 2, bx.z);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const onGround = bx.y < 0.05;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = nor.getY(i);
    const nz = Math.abs(nor.getZ(i));
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    if (Math.abs(ny) >= nx && Math.abs(ny) >= nz) uv.setXY(i, px / 4, pz / 4);
    else if (nx >= nz) uv.setXY(i, pz / 4, py / 4);
    else uv.setXY(i, px / 4, py / 4);
    const up = py - bx.y;
    let k = 1;
    if (ny < -0.5) k = 0.55;
    else if (ny < 0.5) {
      const t = Math.min(1, up / (onGround ? 1.5 : Math.max(0.3, bx.h)));
      k = onGround ? 0.58 + 0.42 * t * (2 - t) : 0.82 + 0.18 * t;
    }
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = k;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Soft dark skirts on the floor around the foot of blocks (contact shadows), all in one geometry. */
function skirtGeometry(boxes: Box[]): THREE.BufferGeometry | null {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (const bx of boxes) {
    const m = Math.min(1.1, 0.35 + Math.min(bx.h, 3) * 0.25);
    const x0 = bx.x - bx.w / 2;
    const x1 = bx.x + bx.w / 2;
    const z0 = bx.z - bx.d / 2;
    const z1 = bx.z + bx.d / 2;
    const y = bx.y + 0.015;
    const base = pos.length / 3;
    for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
      pos.push(x, y, z);
      col.push(0, 0, 0, 0.42);
    }
    for (const [x, z] of [[x0 - m, z0 - m], [x1 + m, z0 - m], [x1 + m, z1 + m], [x0 - m, z1 + m]]) {
      pos.push(x, y, z);
      col.push(0, 0, 0, 0);
    }
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      idx.push(base + i, base + 4 + i, base + 4 + j, base + i, base + 4 + j, base + j);
    }
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

// ---- Weapons ----------------------------------------------------------------------------------

/**
 * A weapon from rounded parts with real details (rails, curved magazine,
 * sights, muzzle brakes, pump, scope, bipod), baked into a few meshes.
 * Weapons point toward -z; (0, 0, 0) is the grip.
 */
function weaponMesh(id: WeaponId, accent = 0x22d3ee): THREE.Group {
  const g = new THREE.Group();
  const dark = phong(0x1d2229, 70);
  const mid = phong(0x48525f, 90);
  const light = phong(0x9aa3ad, 110);
  const glow = glowMat(accent, 2.2);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => put(g, geo, mat, x, y, z, rx, ry, rz);
  const tube = (rTop: number, rBottom: number, len: number, seg = 14) => new THREE.CylinderGeometry(rTop, rBottom, len, seg);
  // A cylinder turned to lie along z (its top toward +z).
  const Z = Math.PI / 2;
  const guard = (z: number, y = -0.012) => add(new THREE.TorusGeometry(0.032, 0.007, 6, 14, Math.PI), dark, 0, y, z, 0, Z, Math.PI);
  if (id === "rifle") {
    add(rbox(0.1, 0.12, 0.4, 0.025), mid, 0, 0.05, -0.16);
    add(rbox(0.085, 0.035, 0.5, 0.012), dark, 0, 0.13, -0.22);
    for (let i = 0; i < 7; i++) add(rbox(0.092, 0.014, 0.025, 0.005), dark, 0, 0.152, -0.03 - i * 0.065);
    add(rbox(0.105, 0.105, 0.3, 0.035), dark, 0, 0.045, -0.5);
    for (const sd of [-1, 1]) add(rbox(0.008, 0.02, 0.18, 0.003), glow, sd * 0.053, 0.05, -0.5);
    add(tube(0.022, 0.022, 0.2), mid, 0, 0.05, -0.72, Z);
    add(tube(0.032, 0.032, 0.07), dark, 0, 0.05, -0.785, Z);
    add(rbox(0.055, 0.12, 0.085, 0.02), dark, 0, -0.06, -0.2, 0.12);
    add(rbox(0.055, 0.11, 0.08, 0.02), dark, 0, -0.16, -0.235, 0.4);
    add(rbox(0.055, 0.14, 0.07, 0.022), dark, 0, -0.06, 0.0, -0.3);
    guard(-0.08);
    add(rbox(0.07, 0.09, 0.22, 0.03), dark, 0, 0.045, 0.17);
    add(rbox(0.075, 0.15, 0.045, 0.02), mid, 0, 0.015, 0.29);
    add(rbox(0.06, 0.03, 0.14, 0.012), light, 0, 0.1, 0.16);
    add(rbox(0.06, 0.055, 0.09, 0.015), dark, 0, 0.19, -0.13);
    add(new THREE.CircleGeometry(0.02, 14), glowMat(0xf87171, 2.2), 0, 0.195, -0.084);
    add(rbox(0.012, 0.04, 0.02, 0.004), light, 0, 0.165, -0.6);
    add(rbox(0.008, 0.02, 0.16, 0.003), glow, 0.051, 0.06, -0.15);
  } else if (id === "pistola") {
    add(rbox(0.066, 0.07, 0.3, 0.018), light, 0, 0.1, -0.1);
    for (let i = 0; i < 5; i++) add(rbox(0.07, 0.05, 0.007, 0.002), mid, 0, 0.1, 0.0 + i * 0.012);
    add(rbox(0.058, 0.05, 0.25, 0.015), mid, 0, 0.05, -0.08);
    add(tube(0.014, 0.014, 0.03, 10), dark, 0, 0.1, -0.255, Z);
    add(rbox(0.058, 0.16, 0.08, 0.024), dark, 0, -0.035, 0.015, -0.22);
    guard(-0.07, 0.02);
    add(rbox(0.012, 0.018, 0.012, 0.004), glow, 0, 0.142, -0.23);
    add(rbox(0.04, 0.018, 0.012, 0.004), dark, 0, 0.142, 0.03);
    add(rbox(0.02, 0.01, 0.1, 0.004), glow, 0, 0.137, -0.1);
  } else if (id === "escopeta") {
    add(rbox(0.1, 0.12, 0.34, 0.03), dark, 0, 0.05, -0.08);
    add(tube(0.03, 0.03, 0.6), mid, 0, 0.075, -0.52, Z);
    add(tube(0.036, 0.036, 0.05), dark, 0, 0.075, -0.8, Z);
    add(tube(0.026, 0.026, 0.48), dark, 0, 0.0, -0.48, Z);
    add(rbox(0.105, 0.085, 0.2, 0.035), light, 0, 0.005, -0.44);
    for (let i = 0; i < 4; i++) add(rbox(0.11, 0.07, 0.012, 0.004), dark, 0, 0.005, -0.375 - i * 0.045);
    add(rbox(0.07, 0.03, 0.42, 0.012), dark, 0, 0.112, -0.52);
    add(rbox(0.06, 0.14, 0.075, 0.022), dark, 0, -0.06, 0.06, -0.3);
    guard(-0.02, 0.0);
    add(rbox(0.075, 0.11, 0.26, 0.035), dark, 0, 0.02, 0.22, -0.12);
    add(rbox(0.08, 0.15, 0.04, 0.02), mid, 0, 0.0, 0.35, -0.12);
    add(rbox(0.008, 0.02, 0.22, 0.003), glow, 0.051, 0.07, -0.1);
  } else if (id === "francotirador") {
    add(rbox(0.08, 0.1, 0.56, 0.025), dark, 0, 0.04, -0.15);
    add(tube(0.024, 0.026, 0.68), mid, 0, 0.05, -0.77, Z);
    add(rbox(0.055, 0.05, 0.09, 0.015), dark, 0, 0.05, -1.155);
    add(tube(0.038, 0.038, 0.3), mid, 0, 0.16, -0.2, Z);
    add(tube(0.04, 0.052, 0.09), mid, 0, 0.16, -0.39, Z);
    add(tube(0.044, 0.036, 0.06), mid, 0, 0.16, -0.02, Z);
    add(tube(0.016, 0.016, 0.04), mid, 0, 0.21, -0.2);
    add(tube(0.016, 0.016, 0.04), mid, 0.045, 0.16, -0.2, 0, 0, Z);
    for (const z of [-0.1, -0.3]) add(rbox(0.05, 0.07, 0.03, 0.01), mid, 0, 0.11, z);
    add(new THREE.CircleGeometry(0.046, 16), glowMat(0x60a5fa, 2), 0, 0.16, -0.436, 0, Math.PI);
    add(rbox(0.06, 0.12, 0.07, 0.02), dark, 0, -0.04, -0.12);
    add(rbox(0.055, 0.14, 0.07, 0.022), dark, 0, -0.07, 0.04, -0.3);
    guard(-0.04);
    add(rbox(0.075, 0.13, 0.3, 0.035), dark, 0, 0.0, 0.27, -0.15);
    add(rbox(0.06, 0.03, 0.16, 0.01), light, 0, 0.085, 0.22);
    for (const sd of [-1, 1]) add(tube(0.008, 0.008, 0.26, 6), mid, sd * 0.02, 0.0, -0.75, Z + 0.12);
    add(rbox(0.008, 0.015, 0.4, 0.003), glow, 0.042, 0.04, -0.2);
  } else {
    const olive = phong(0x4a5a3c, 50);
    const band = phong(0xfacc15, 60);
    add(tube(0.095, 0.095, 0.95, 18), olive, 0, 0.08, -0.25, Z);
    add(tube(0.1, 0.115, 0.14, 18), dark, 0, 0.08, -0.75, Z);
    add(tube(0.11, 0.1, 0.12, 18), dark, 0, 0.08, 0.27, Z);
    for (const z of [-0.55, 0.05]) add(tube(0.098, 0.098, 0.05, 18), band, 0, 0.08, z, Z);
    add(rbox(0.06, 0.15, 0.08, 0.022), dark, 0, -0.06, -0.02, 0.2);
    add(rbox(0.055, 0.12, 0.07, 0.02), dark, 0, -0.04, -0.4, 0.15);
    add(rbox(0.1, 0.09, 0.15, 0.025), dark, 0, 0.21, -0.1);
    add(rbox(0.07, 0.05, 0.006, 0.002), glow, 0, 0.215, -0.024);
    add(rbox(0.012, 0.03, 0.22, 0.005), glow, 0.096, 0.1, -0.4);
  }
  bake(g);
  return g;
}

function pickupMesh(kind: PickupKind): THREE.Group {
  if (kind === "botiquin") {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(rbox(0.5, 0.32, 0.36, 0.06), phong(0xf1f5f9)));
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
  /** The whole figure (it falls when dead); hips hold the legs, chest everything above. */
  body: THREE.Group;
  hips: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
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
  /** Materials that flash red when hit, and how much is left of the flash. */
  hurtMats: THREE.MeshPhongMaterial[];
  hurtT: number;
  /** Smoothed velocity in its own frame (forward, right), last position, and how much it's in the air. */
  vf: number;
  vs: number;
  prev: { x: number; z: number } | null;
  air: number;
}

/**
 * An armored soldier of rounded parts: capsule limbs with knees and elbows,
 * a helmet with a visor, shoulder pads, chest and shin plates, a backpack
 * with a light. Each rigid part is baked into a few meshes.
 */
function soldierModel(color: number, glow: THREE.Texture, flash: THREE.Texture, shadows: boolean): SoldierModel {
  void glow;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const armor = new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x888888 });
  const plate = new THREE.MeshPhongMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.2), shininess: 110, specular: 0x999999 });
  const under = new THREE.MeshPhongMaterial({ color: 0x2a3038, shininess: 25, specular: 0x333333 });
  const dark = new THREE.MeshPhongMaterial({ color: 0x171b21, shininess: 40, specular: 0x444444 });
  const trim = glowMat(color, 1.6);
  const visorMat = new THREE.MeshPhongMaterial({ color: 0xf2b134, emissive: new THREE.Color(0xd97706).multiplyScalar(0.9), shininess: 140, specular: 0xffffff });

  // Hips and legs (thigh, then the knee with shin and boot).
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  body.add(hips);
  put(hips, rbox(0.36, 0.2, 0.26, 0.08), under, 0, 0.02, 0);
  put(hips, new THREE.TorusGeometry(0.17, 0.032, 6, 22), dark, 0, 0.09, 0, Math.PI / 2).scale.set(1.08, 0.82, 1);
  for (const x of [-0.13, 0.13]) put(hips, rbox(0.08, 0.1, 0.06, 0.02), dark, x, 0.05, -0.14);
  const legs: { leg: THREE.Group; knee: THREE.Group }[] = [];
  for (const x of [-0.12, 0.12]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0, 0);
    hips.add(leg);
    limb(leg, [0, -0.02, 0], [0, -0.44, 0], 0.1, under);
    put(leg, rbox(0.19, 0.25, 0.08, 0.03), armor, 0, -0.2, -0.085);
    const knee = new THREE.Group();
    knee.position.y = -0.46;
    leg.add(knee);
    put(knee, rbox(0.14, 0.12, 0.09, 0.035), plate, 0, 0, -0.07);
    limb(knee, [0, 0, 0], [0, -0.36, 0], 0.085, under);
    put(knee, rbox(0.17, 0.27, 0.11, 0.04), armor, 0, -0.19, -0.05);
    put(knee, rbox(0.16, 0.11, 0.3, 0.045), dark, 0, -0.435, -0.05);
    bake(leg);
    bake(knee);
    legs.push({ leg, knee });
  }

  // Chest (pivot at the waist).
  const chest = new THREE.Group();
  chest.position.y = 0.95;
  body.add(chest);
  put(chest, new THREE.CapsuleGeometry(0.15, 0.12, 4, 12), under, 0, 0.16, 0);
  put(chest, rbox(0.56, 0.42, 0.33, 0.12), armor, 0, 0.43, 0);
  put(chest, rbox(0.44, 0.16, 0.28, 0.07), under, 0, 0.27, 0);
  put(chest, rbox(0.38, 0.24, 0.06, 0.03), plate, 0, 0.46, -0.16);
  put(chest, rbox(0.26, 0.12, 0.05, 0.022), armor, 0, 0.2, -0.14);
  put(chest, rbox(0.28, 0.022, 0.02, 0.008), trim, 0, 0.33, -0.19);
  put(chest, new THREE.CylinderGeometry(0.11, 0.13, 0.08, 16), dark, 0, 0.65, 0);
  put(chest, rbox(0.36, 0.36, 0.15, 0.05), under, 0, 0.42, 0.22);
  for (const x of [-0.08, 0.08]) put(chest, rbox(0.07, 0.24, 0.03, 0.012), dark, x, 0.42, 0.3);
  put(chest, rbox(0.05, 0.2, 0.02, 0.008), trim, 0.16, 0.42, 0.29);
  for (const x of [-0.31, 0.31]) {
    put(chest, new THREE.SphereGeometry(0.09, 12, 10), under, x, 0.54, 0);
    put(chest, rbox(0.2, 0.15, 0.3, 0.065), armor, x * 1.04, 0.58, 0, 0, 0, -Math.sign(x) * 0.3);
    put(chest, rbox(0.21, 0.025, 0.31, 0.01), trim, x * 1.07, 0.52, 0, 0, 0, -Math.sign(x) * 0.3);
  }

  // Head: helmet, visor, crest, ear pods.
  const head = new THREE.Group();
  head.position.y = 0.7;
  chest.add(head);
  limb(head, [0, -0.04, 0], [0, 0.06, 0], 0.07, under);
  put(head, new THREE.SphereGeometry(0.17, 22, 16), armor, 0, 0.13, 0).scale.set(1, 1.07, 1.12);
  const visor = put(head, new THREE.SphereGeometry(0.15, 22, 12, -Math.PI * 0.36, Math.PI * 0.72, Math.PI * 0.3, Math.PI * 0.34), visorMat, 0, 0.12, -0.075, 0, Math.PI);
  visor.scale.set(1.18, 1, 1.12);
  put(head, rbox(0.05, 0.05, 0.26, 0.02), plate, 0, 0.3, 0.0);
  for (const x of [-0.165, 0.165]) put(head, new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14), dark, x, 0.12, 0.01, 0, 0, Math.PI / 2);
  put(head, rbox(0.14, 0.06, 0.08, 0.025), dark, 0, 0.0, -0.11);

  // Arms (they pitch with the aim): shoulder → elbow → hand on the gun.
  const arms = new THREE.Group();
  arms.position.set(0, 0.5, 0);
  chest.add(arms);
  const RS: [number, number, number] = [0.3, 0.05, 0];
  const RE: [number, number, number] = [0.28, -0.14, -0.17];
  const RH: [number, number, number] = [0.13, -0.08, -0.34];
  const LS: [number, number, number] = [-0.3, 0.05, 0];
  const LE: [number, number, number] = [-0.2, -0.16, -0.34];
  const LH: [number, number, number] = [0.05, -0.05, -0.6];
  limb(arms, RS, RE, 0.072, under);
  limb(arms, RE, RH, 0.064, under);
  limb(arms, LS, LE, 0.072, under);
  limb(arms, LE, LH, 0.064, under);
  for (const e of [RE, LE]) put(arms, new THREE.SphereGeometry(0.068, 12, 10), plate, e[0], e[1], e[2]);
  for (const h of [RH, LH]) put(arms, rbox(0.085, 0.09, 0.1, 0.035), dark, h[0], h[1], h[2]);
  const gun = new THREE.Group();
  gun.position.set(0.12, -0.02, -0.38);
  arms.add(gun);
  bake(chest);
  bake(head);
  bake(arms);

  const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flash, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  fl.scale.setScalar(0.7);
  gun.add(fl);

  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  tag.scale.set(1.6, 0.4, 1);
  tag.position.y = 2.25;
  root.add(tag);

  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 22, 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x67e8f9).multiplyScalar(1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true })
  );
  shield.scale.set(1, 1.6, 1);
  shield.position.y = 0.95;
  root.add(shield);

  if (shadows) root.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : null));
  shield.castShadow = false;
  return {
    root,
    body,
    hips,
    chest,
    head,
    legL: legs[0].leg,
    legR: legs[1].leg,
    kneeL: legs[0].knee,
    kneeR: legs[1].knee,
    arms,
    gun,
    gunId: "",
    tag,
    tagKey: "",
    flash: fl,
    walk: 0,
    draw: null,
    shield,
    shieldT: 0,
    wasAlive: true,
    color,
    hurtMats: [armor, plate, under],
    hurtT: 0,
    vf: 0,
    vs: 0,
    prev: null,
    air: 0,
  };
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
  /** Weapon and arms per view ("" = the phone's own view). */
  private hands = new Map<string, HandRig>();
  private viewCams = new Map<string, THREE.PerspectiveCamera>();
  private shake = 0;
  private rand = mulberry32(11);
  private time = 0;
  private maxDpr: number;
  private theme: ThemeDef;
  private map: MapDef;
  private world: World;
  /** Adaptive resolution: fraction of the pixel ratio drawn, average frame time, and when it was last checked. */
  private dprScale = 1;
  private frameAvg = 1 / 60;
  private adaptClock = 0;
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
    this.world = worldOf(mapId);
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

    // Floor: its own texture (no grid), with a slow large-scale color drift so the tiles don't repeat.
    const floorTex = floorTexture(th.floor, th.line, th.floorKind);
    floorTex.repeat.set(map.hx / 10, map.hz / 10);
    const floorGeo = new THREE.PlaneGeometry(map.hx * 2, map.hz * 2, 40, 40);
    const fp = floorGeo.attributes.position;
    const fc = new Float32Array(fp.count * 3);
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i);
      const y = fp.getY(i);
      const n = Math.sin(x * 0.071 + 1.3) * Math.sin(y * 0.083 + 0.4) + 0.5 * Math.sin(x * 0.19 + y * 0.13 + 2);
      fc[i * 3] = fc[i * 3 + 1] = fc[i * 3 + 2] = 0.93 + n * 0.08;
    }
    floorGeo.setAttribute("color", new THREE.BufferAttribute(fc, 3));
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ map: floorTex, vertexColors: true }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = this.shadows;
    s.add(floor);
    const out = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), lambert(th.ground));
    out.rotation.x = -Math.PI / 2;
    out.position.y = -0.05;
    s.add(out);

    const tex = {
      muro: panelTexture(th.wall, 1, th.wallKind),
      bloque: panelTexture(th.block, 2, th.wallKind),
      plataforma: panelTexture(th.plat, 3, th.wallKind === "stone" ? "stone" : "panel"),
      caja: panelTexture(th.crate, 4, "crate"),
    };
    const mats = Object.fromEntries(Object.entries(tex).map(([k, t]) => [k, new THREE.MeshLambertMaterial({ map: t, vertexColors: true })])) as Record<Box["kind"], THREE.MeshLambertMaterial>;
    const accent = glowMat(th.accent, 2.4);
    const lampMat = glowMat(0xffffff, 1.8);
    // Static geometry is merged per material (a handful of draw calls for the whole map) and never moves.
    const addStatic = (geo: THREE.BufferGeometry | null, mat: THREE.Material, shadow: boolean) => {
      if (!geo) return null;
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = m.receiveShadow = shadow && this.shadows;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      s.add(m);
      return m;
    };
    const merged = (list: THREE.BufferGeometry[]) => (list.length ? mergeGeometries(list) : null);
    const placed = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => geo.translate(x, y, z);
    const byKind = new Map<Box["kind"], THREE.BufferGeometry[]>();
    const glowGeos: THREE.BufferGeometry[] = [];
    const lampGeos: THREE.BufferGeometry[] = [];
    const beamGeos: THREE.BufferGeometry[] = [];
    const grounded: Box[] = [];
    for (const bx of solidBoxes(map)) {
      const list = byKind.get(bx.kind) ?? [];
      list.push(boxGeometry(bx));
      byKind.set(bx.kind, list);
      if (bx.y < 0.05 && bx.h > 0.3) grounded.push(bx);
      if (bx.kind === "plataforma" && bx.w < 40) glowGeos.push(placed(new THREE.BoxGeometry(bx.w + 0.04, 0.07, bx.d + 0.04), bx.x, bx.y + bx.h - 0.12, bx.z));
      // Small lamps on the corners of blocks and pillars.
      if ((bx.kind === "muro" || bx.kind === "bloque") && bx.h >= 2.4 && bx.w < 12 && bx.d < 12) {
        lampGeos.push(placed(new THREE.BoxGeometry(0.14, 0.08, 0.14), bx.x + bx.w / 2 - 0.08, bx.y + bx.h + 0.04, bx.z + bx.d / 2 - 0.08));
      }
    }
    for (const [kind, list] of byKind) addStatic(merged(list), mats[kind], true);
    addStatic(
      skirtGeometry(grounded),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      false
    );
    if (indoor) {
      // Glowing strips and light panels along the walls, and a ceiling grid of beams (open, so light comes in).
      for (const z of [-map.hz + 0.02, map.hz - 0.02]) {
        glowGeos.push(placed(new THREE.BoxGeometry(map.hx * 2, 0.12, 0.04), 0, 4.2, z));
        for (let x = -map.hx + 4; x < map.hx; x += 8) lampGeos.push(placed(new THREE.BoxGeometry(1.6, 0.5, 0.05), x, 6.2, z));
      }
      for (const x of [-map.hx + 0.02, map.hx - 0.02]) {
        glowGeos.push(placed(new THREE.BoxGeometry(0.04, 0.12, map.hz * 2), x, 4.2, 0));
        for (let z = -map.hz + 4; z < map.hz; z += 8) lampGeos.push(placed(new THREE.BoxGeometry(0.05, 0.5, 1.6), x, 6.2, z));
      }
      for (let x = -map.hx; x <= map.hx; x += 6) beamGeos.push(placed(rbox(0.3, 0.4, map.hz * 2, 0.06), x, map.wallH + 0.2, 0));
    }
    addStatic(merged(glowGeos), accent, false);
    addStatic(merged(lampGeos), lampMat, false);
    addStatic(merged(beamGeos), lambert(0x2a3140), false);
    const rampMat = new THREE.MeshLambertMaterial({ map: tex.plataforma });
    for (const rp of map.ramps) {
      const m = new THREE.Mesh(rampGeometry(rp), rampMat);
      m.castShadow = this.shadows;
      m.receiveShadow = this.shadows;
      s.add(m);
    }

    if (!indoor) {
      const rand = mulberry32(21);
      const valle = map.theme === "valle";
      // Distant mountains: smooth, uneven cones shaded from their foot to their peak (snow in the fortress).
      const near = new THREE.Color(valle ? 0x9c6b45 : 0x5f7f86);
      const far = new THREE.Color(valle ? 0xc49a72 : 0x8fa9b4);
      const peak = new THREE.Color(valle ? 0xe8c49a : 0xf1f5f9);
      const mountains: THREE.BufferGeometry[] = [];
      const c = new THREE.Color();
      for (let i = 0; i < 34; i++) {
        const a = (i / 34) * Math.PI * 2 + rand() * 0.1;
        const isFar = i % 2 === 0;
        const r2 = Math.max(map.hx, map.hz) + (isFar ? 180 : 70) + rand() * 80;
        const h = (isFar ? 60 : 25) + rand() * 50;
        const seed = rand() * 100;
        const g = new THREE.ConeGeometry(25 + rand() * 30, h, 22, 7);
        const gp = g.attributes.position;
        const col = new Float32Array(gp.count * 3);
        for (let k = 0; k < gp.count; k++) {
          const x = gp.getX(k);
          const y = gp.getY(k);
          const z = gp.getZ(k);
          const t = (y + h / 2) / h;
          const n = Math.sin(x * 0.21 + seed) * Math.cos(z * 0.17 + seed * 1.7) + 0.6 * Math.sin((x + z) * 0.43 + seed * 0.3);
          const grow = 1 + n * 0.16 * (1 - t * 0.6);
          gp.setXYZ(k, x * grow, y + (t < 0.98 ? n * h * 0.035 : 0), z * grow);
          c.copy(isFar ? far : near).multiplyScalar(0.78 + 0.28 * t);
          if (!valle && isFar && t > 0.7 + n * 0.05) c.lerp(peak, 0.85);
          else if (valle && t > 0.6) c.lerp(peak, (t - 0.6) * 0.7);
          col[k * 3] = c.r;
          col[k * 3 + 1] = c.g;
          col[k * 3 + 2] = c.b;
        }
        g.setAttribute("color", new THREE.BufferAttribute(col, 3));
        g.computeVertexNormals();
        g.rotateY(rand() * Math.PI);
        g.translate(Math.cos(a) * r2, h / 2 - 2, Math.sin(a) * r2);
        mountains.push(g);
      }
      addStatic(merged(mountains), new THREE.MeshLambertMaterial({ vertexColors: true }), false);

      // Trees (fortress) or boulders (valley) around the walls, as instances.
      const spot = (): [number, number] => {
        for (;;) {
          const x = (rand() * 2 - 1) * (map.hx + 55);
          const z = (rand() * 2 - 1) * (map.hz + 55);
          if (Math.abs(x) > map.hx + 4 || Math.abs(z) > map.hz + 4) return [x, z];
        }
      };
      const lumpy = (geo: THREE.BufferGeometry, amount: number, seed: number) => {
        geo.deleteAttribute("normal");
        geo.deleteAttribute("uv");
        const g = mergeVertices(geo);
        const gp = g.attributes.position;
        for (let k = 0; k < gp.count; k++) {
          const x = gp.getX(k);
          const y = gp.getY(k);
          const z = gp.getZ(k);
          const n = 1 + amount * (Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + seed) + 0.5 * Math.sin(y * 4.3 + seed * 2));
          gp.setXYZ(k, x * n, y * n, z * n);
        }
        g.computeVertexNormals();
        return g;
      };
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const v = new THREE.Vector3();
      const sc = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      if (valle) {
        const n = 60;
        const rocks = new THREE.InstancedMesh(lumpy(new THREE.DodecahedronGeometry(1, 1), 0.12, 3), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
        for (let i = 0; i < n; i++) {
          const [x, z] = spot();
          const sz = 1 + rand() * 3.2;
          sc.set(sz * (0.8 + rand() * 0.6), sz * (0.45 + rand() * 0.45), sz * (0.8 + rand() * 0.6));
          m4.compose(v.set(x, sc.y * 0.35, z), q.setFromAxisAngle(up, rand() * Math.PI * 2), sc);
          rocks.setMatrixAt(i, m4);
          rocks.setColorAt(i, c.copy(near).lerp(far, rand() * 0.6).multiplyScalar(0.85 + rand() * 0.25));
        }
        s.add(rocks);
      } else {
        const n = 70;
        const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.32, 2.6, 8).translate(0, 1.3, 0), lambert(0x6b4a2f), n);
        const crowns = new THREE.InstancedMesh(lumpy(new THREE.IcosahedronGeometry(1.7, 2), 0.1, 7), new THREE.MeshLambertMaterial({ color: 0xffffff }), n * 2);
        const greens = [0x3f7a3a, 0x4d8a3f, 0x356b34, 0x5a9446];
        for (let i = 0; i < n; i++) {
          const [x, z] = spot();
          const sz = 0.8 + rand() * 0.9;
          const yaw = rand() * Math.PI * 2;
          q.setFromAxisAngle(up, yaw);
          m4.compose(v.set(x, 0, z), q, sc.set(sz, sz * (0.9 + rand() * 0.4), sz));
          trunks.setMatrixAt(i, m4);
          for (let k = 0; k < 2; k++) {
            const cs = sz * (k ? 0.75 : 1);
            m4.compose(v.set(x + (k ? 0.5 : 0) * sz, (k ? 2.7 : 3.5) * sz, z + (k ? 0.3 : 0) * sz), q, sc.set(cs * (0.9 + rand() * 0.3), cs * (0.85 + rand() * 0.3), cs * (0.9 + rand() * 0.3)));
            crowns.setMatrixAt(i * 2 + k, m4);
            crowns.setColorAt(i * 2 + k, c.set(greens[Math.floor(rand() * greens.length)]).multiplyScalar(0.9 + rand() * 0.2));
          }
        }
        s.add(trunks, crowns);
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

  /** Hit: on the shield it shimmers; on health the armor flashes red and the soldier flinches. */
  hurt(id: string, shield: boolean) {
    const k = this.soldiers.get(id);
    if (!k) return;
    if (shield) k.shieldT = 0.3;
    else k.hurtT = 0.25;
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
      // Velocity from how it moved since the last frame (poses carry none), in its own frame, smoothed.
      let vx = 0;
      let vz = 0;
      if (k.prev && dt > 0) {
        vx = (d.x - k.prev.x) / dt;
        vz = (d.z - k.prev.z) / dt;
        if (Math.hypot(vx, vz) > 14) vx = vz = 0;
      }
      k.prev = { x: d.x, z: d.z };
      const sy = Math.sin(d.yaw);
      const cy = Math.cos(d.yaw);
      const ease = 1 - Math.exp(-dt * 9);
      k.vf += (Math.max(-7, Math.min(7, -vx * sy - vz * cy)) - k.vf) * ease;
      k.vs += (Math.max(-7, Math.min(7, vx * cy - vz * sy)) - k.vs) * ease;
      const speed = d.alive ? Math.hypot(k.vf, k.vs) : 0;
      k.root.position.set(d.x, d.y, d.z);
      k.root.rotation.y = d.yaw;
      const inAir = d.alive && d.y - topAt(this.world, d.x, d.z) > 0.25;
      k.air += ((inAir ? 1 : 0) - k.air) * (1 - Math.exp(-dt * 10));

      // Walk cycle: thighs swing (sideways when strafing), knees bend on the way forward, the chest bobs.
      const amt = Math.min(1, speed / 5);
      k.walk += dt * (1.5 + speed * 1.55) * (k.vf < -0.5 ? -1 : 1) * (amt > 0.05 ? 1 : 0);
      const ph = k.walk;
      const side = Math.abs(k.vs) / (Math.abs(k.vf) + Math.abs(k.vs) + 0.001);
      const swing = Math.sin(ph) * 0.7 * amt;
      const tuck = k.air;
      k.legL.rotation.x = swing * (1 - side) * (1 - tuck) + 0.55 * tuck;
      k.legR.rotation.x = -swing * (1 - side) * (1 - tuck) - 0.1 * tuck;
      k.legL.rotation.z = -Math.sin(ph) * 0.22 * amt * side;
      k.legR.rotation.z = Math.sin(ph) * 0.22 * amt * side;
      k.kneeL.rotation.x = -(Math.max(0, Math.sin(ph + 1.3)) * 1.0 * amt + 0.06) * (1 - tuck) - 1.0 * tuck;
      k.kneeR.rotation.x = -(Math.max(0, Math.sin(ph + 1.3 + Math.PI)) * 1.0 * amt + 0.06) * (1 - tuck) - 0.45 * tuck;
      k.chest.position.y = 0.95 + Math.abs(Math.cos(ph)) * 0.035 * amt - 0.05 * amt;
      // Lean into the run and the strafe, look up and down with the aim; a flinch when hit.
      const flinch = k.hurtT * 1.2;
      k.chest.rotation.x = Math.max(-0.35, Math.min(0.35, d.pitch * 0.25 - k.vf * 0.03)) + flinch * 0.5;
      k.chest.rotation.z = -k.vs * 0.025;
      k.chest.rotation.y = Math.sin(ph) * 0.06 * amt * (1 - side);
      k.arms.rotation.x = Math.max(-1.2, Math.min(1.2, d.pitch)) - flinch * 0.3;
      k.head.rotation.x = Math.max(-0.5, Math.min(0.5, d.pitch * 0.4));
      k.hurtT = Math.max(0, k.hurtT - dt);
      for (const m of k.hurtMats) m.emissive.setRGB(k.hurtT * 3.2, k.hurtT * 0.5, k.hurtT * 0.4);

      if (!d.alive) {
        // Falls back with the knees giving way, then sinks into the floor before it's gone.
        const f = Math.min(1, d.deadFor / 0.55);
        const e = 1 - (1 - f) * (1 - f);
        k.body.rotation.x = e * (Math.PI / 2) * 0.95;
        k.body.position.y = -e * 0.55 - Math.max(0, d.deadFor - 2.4) * 0.8;
        k.kneeL.rotation.x = -0.8 * e;
        k.kneeR.rotation.x = -0.5 * e;
        k.arms.rotation.x = -0.6 * e;
        k.tag.visible = false;
      } else {
        k.body.rotation.x = 0;
        k.body.position.y = 0;
        k.tag.visible = true;
      }
      const fm = k.flash.material as THREE.SpriteMaterial;
      fm.opacity = Math.max(0, fm.opacity - dt * 18);
      fm.rotation = this.rand() * Math.PI;
      k.shieldT = Math.max(d.guard && d.alive ? 0.07 + Math.sin(this.time * 9) * 0.03 : 0, k.shieldT - dt);
      k.shield.material.opacity = k.shieldT * 2.2;
      k.shield.rotation.y += dt * 4;
    }
  }

  /** Draws the world from the eye, with your weapon on top unless hidden. */
  render(eye: Eye, view: ViewModel | null, dt: number) {
    this.adapt(dt);
    const fit = this.fit();
    if (!fit) return;
    const { cw, ch, dpr } = fit;
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
    if (view) this.drawHand("", view, cam, dt);
  }

  /**
   * Adaptive resolution: when frames get slow for a while, draw fewer pixels;
   * when they're fast again, go back up. Keeps weak phones and the split big screen smooth.
   */
  private adapt(dt: number) {
    if (dt <= 0 || dt >= 0.1) return;
    this.frameAvg += (dt - this.frameAvg) * 0.05;
    this.adaptClock += dt;
    if (this.adaptClock < 1.5) return;
    this.adaptClock = 0;
    if (this.frameAvg > 1 / 40 && this.dprScale > 0.6) this.dprScale = Math.max(0.6, this.dprScale - 0.1);
    else if (this.frameAvg < 1 / 56 && this.dprScale < 1) this.dprScale = Math.min(1, this.dprScale + 0.05);
  }

  /** The canvas' size in CSS pixels and the pixel ratio, with the renderer resized to match (null while hidden). */
  private fit(): { cw: number; ch: number; dpr: number } | null {
    const dpr = Math.round(Math.min(window.devicePixelRatio || 1, this.maxDpr) * this.dprScale * 100) / 100;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (!cw || !ch) return null;
    if (this.renderer.getPixelRatio() !== dpr) {
      this.renderer.setPixelRatio(dpr);
      this.composer?.setPixelRatio(dpr);
    }
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== cw || size.y !== ch) {
      this.renderer.setSize(cw, ch, false);
      this.composer?.setSize(cw, ch);
    }
    return { cw, ch, dpr };
  }

  /** The weapon rig of a view, drawn over what's already there (only that rig is shown). */
  private drawHand(key: string, view: ViewModel, cam: THREE.PerspectiveCamera, dt: number) {
    let rig = this.hands.get(key);
    if (!rig) {
      rig = new HandRig(this.flashTex);
      this.hands.set(key, rig);
      this.handScene.add(rig.root);
    }
    rig.update(view, dt, this.time, this.rand);
    if (view.hidden) return;
    for (const r of this.hands.values()) r.root.visible = r === rig;
    cam.updateMatrixWorld();
    rig.root.position.copy(cam.position);
    rig.root.quaternion.copy(cam.quaternion);
    this.renderer.clearDepth();
    this.renderer.render(this.handScene, cam);
  }

  /**
   * Big screen: several first-person views at once. `rect` is the view's
   * place as fractions of the canvas from the top-left; `id` is whose eyes
   * they are (their own soldier is hidden in their view). No bloom; the sun's
   * shadow map is drawn once for all of them.
   */
  renderViews(views: { id: string; eye: Eye; view: ViewModel | null; rect: [number, number, number, number] }[], dt: number) {
    this.adapt(dt);
    const fit = this.fit();
    if (!fit || !views.length) return;
    const { cw, ch, dpr } = fit;
    const first = views[0].eye;
    this.camera.position.set(first.x, first.y, first.z);
    this.update(dt);
    const r = this.renderer;
    // No bloom here: a touch more exposure keeps the views as bright as the single one.
    const exposure = r.toneMappingExposure;
    r.toneMappingExposure = exposure * 1.15;
    r.setScissorTest(true);
    r.setViewport(0, 0, cw, ch);
    r.setScissor(0, 0, cw, ch);
    r.clear();
    if (this.shadows) {
      r.shadowMap.autoUpdate = false;
      r.shadowMap.needsUpdate = true;
    }
    for (const v of views) {
      const [fx, fy, fw, fh] = v.rect;
      const x = Math.round(fx * cw);
      const w = Math.round(fw * cw);
      const h = Math.round(fh * ch);
      const y = ch - Math.round(fy * ch) - h;
      let cam = this.viewCams.get(v.id);
      if (!cam) {
        cam = new THREE.PerspectiveCamera(78, 1, 0.05, 700);
        cam.rotation.order = "YXZ";
        this.viewCams.set(v.id, cam);
      }
      if (Math.abs(cam.aspect - w / h) > 1e-3 || Math.abs(cam.fov - v.eye.fov) > 0.05) {
        cam.aspect = w / h;
        cam.fov = v.eye.fov;
        cam.updateProjectionMatrix();
      }
      cam.position.set(v.eye.x, v.eye.y, v.eye.z);
      cam.rotation.set(v.eye.pitch, v.eye.yaw, v.eye.roll ?? 0);
      const scale = (h * dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360));
      this.sparks.setScale(scale);
      this.smoke.setScale(scale);
      this.motes.setScale(scale);
      r.setViewport(x, y, w, h);
      r.setScissor(x, y, w, h);
      // In your own eyes you don't see yourself.
      const own = v.view ? this.soldiers.get(v.id) : undefined;
      const shown = own?.root.visible ?? false;
      if (own) own.root.visible = false;
      r.render(this.scene, cam);
      if (own) own.root.visible = shown;
      if (v.view) this.drawHand(v.id, v.view, cam, dt);
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, cw, ch);
    if (this.shadows) r.shadowMap.autoUpdate = true;
    r.toneMappingExposure = exposure;
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

/** A first-person weapon with gloved hands, that sways, bobs, kicks and reloads. One per view. */
class HandRig {
  root = new THREE.Group();
  private rig = new THREE.Group();
  private gun = new THREE.Group();
  private flash: THREE.Sprite;
  private key = "";
  private sway = { x: 0, y: 0, vx: 0, vy: 0 };
  private bob = 0;

  constructor(flashTex: THREE.Texture) {
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash.scale.setScalar(0.4);
    this.rig.add(this.gun);
    this.root.add(this.rig);
  }

  update(v: ViewModel, dt: number, time: number, rand: () => number) {
    const key = `${v.weapon}|${v.color}`;
    if (this.key !== key) {
      this.key = key;
      for (const ch of [...this.gun.children]) {
        this.gun.remove(ch);
        if (ch !== this.flash) disposeTree(ch);
      }
      const gun = weaponMesh(v.weapon);
      this.gun.add(gun);
      // Gloved hands with short forearms in a dark suit, a small armor plate in your color on each.
      const suit = phong(0x2b313b, 40);
      const glove = phong(0x1f242c, 35);
      const plate = phong(new THREE.Color(v.color).getHex(), 90);
      const pistol = v.weapon === "pistola";
      // Rounded forearms in the suit with an armor plate in your color, a cuff at the wrist.
      const forearm = (x: number, y: number, z: number, ry: number) => {
        const g2 = new THREE.Group();
        put(g2, new THREE.CapsuleGeometry(0.046, 0.2, 4, 12), suit, 0, 0, 0.15, Math.PI / 2);
        put(g2, rbox(0.09, 0.035, 0.16, 0.015), plate, 0, 0.045, 0.15);
        put(g2, new THREE.TorusGeometry(0.05, 0.013, 8, 16), glove, 0, 0, 0.04);
        g2.position.set(x, y, z);
        g2.rotation.set(0.35, ry, 0);
        bake(g2);
        return g2;
      };
      // A gloved hand: palm, four fingers wrapped around the grip and a thumb along it.
      const hand = (x: number, y: number, z: number) => {
        const h = new THREE.Group();
        put(h, rbox(0.075, 0.09, 0.1, 0.03), glove, 0, 0, 0.01);
        for (let i = 0; i < 4; i++) put(h, new THREE.CapsuleGeometry(0.016, 0.05, 3, 8), glove, -0.005, 0.03 - i * 0.022, -0.052, 0, 0, Math.PI / 2);
        put(h, new THREE.CapsuleGeometry(0.017, 0.05, 3, 8), glove, 0.04, 0.035, -0.02, Math.PI / 2);
        h.position.set(x, y, z);
        bake(h);
        return h;
      };
      this.gun.add(
        hand(0.015, -0.07, 0.04),
        hand(-0.03, -0.05, pistol ? 0.0 : -0.38),
        forearm(0.04, -0.1, 0.08, 0.38),
        forearm(-0.06, -0.08, pistol ? 0.04 : -0.33, pistol ? -0.4 : -0.65)
      );
      this.gun.add(this.flash);
      this.flash.position.set(0, 0.05, pistol ? -0.33 : v.weapon === "francotirador" ? -1.2 : v.weapon === "lanzacohetes" ? -0.84 : -0.82);
      this.gun.scale.setScalar(0.62);
    }
    this.root.visible = !v.hidden;
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
    const breathe = Math.sin(time * 1.6) * 0.004 * aimK;
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
    const g = this.gun;
    g.position.x += (x - g.position.x) * k;
    g.position.y += (y - g.position.y) * k;
    g.position.z += (z - g.position.z) * k;
    g.rotation.x += (rx - g.rotation.x) * k;
    g.rotation.z += (rz - g.rotation.z) * k;
    const fm = this.flash.material as THREE.SpriteMaterial;
    fm.opacity = v.sinceShot < 0.05 && v.weapon !== "lanzacohetes" ? 1 : Math.max(0, fm.opacity - dt * 20);
    fm.rotation = rand() * Math.PI;
    this.flash.scale.setScalar(v.weapon === "escopeta" ? 0.6 : v.weapon === "francotirador" ? 0.55 : 0.4);
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
