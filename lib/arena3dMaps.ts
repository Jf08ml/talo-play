import * as THREE from "three";
import { mulberry32 } from "./random";
import { glowColor } from "./postfx";
import { GOLD, TEAM_COLORS, lambert } from "./arena3dKnight";
import { RAIN_R, bladeAngle, grateState, type ArenaMap, type Block, type Trap } from "./arenaMaps";
import type { TeamId } from "./teams";

/**
 * Arena medieval's maps in 3D (three.js, browser only): the bridge over the
 * abyss, the castle courtyard, the forest and the trap pit's traps (the
 * coliseum itself is built in lib/arena3d.ts). Geometry is merged or
 * instanced so phones on «baja» stay light: one mesh per material for the
 * stone, instanced crates, trunks, crowns and rocks. Plus what the events
 * and modes draw on the ground: the hill, the closing ring and the rain's
 * circles.
 */

// ---- Textures ----------------------------------------------------------------

export function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void, repeat = true): THREE.CanvasTexture {
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

export function sandTexture(): THREE.CanvasTexture {
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

export function stoneTexture(base: string, rows = 4): THREE.CanvasTexture {
  return canvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 128);
    const rand = mulberry32(9);
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

/** Cobbles for the courtyard. */
function cobbleTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#8f8676";
    ctx.fillRect(0, 0, 256, 256);
    const rand = mulberry32(21);
    for (let y = 0; y < 256; y += 32) {
      for (let x = (y / 32) % 2 ? -16 : 0; x < 256; x += 32) {
        const l = 48 + Math.floor(rand() * 16);
        ctx.fillStyle = `hsl(35, 8%, ${l}%)`;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, 28, 28, 7);
        ctx.fill();
      }
    }
  });
}

/** Wooden planks (crates). */
function woodTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = "#9a6a38";
    ctx.fillRect(0, 0, 128, 128);
    const rand = mulberry32(33);
    for (let y = 0; y < 128; y += 32) {
      ctx.fillStyle = `rgba(60,35,10,${0.15 + rand() * 0.15})`;
      ctx.fillRect(0, y, 128, 3);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = "rgba(70,40,15,0.18)";
        ctx.fillRect(rand() * 128, y + 6 + rand() * 20, 30 + rand() * 40, 1.5);
      }
    }
    ctx.strokeStyle = "#5c3b1e";
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 120, 120);
    ctx.beginPath();
    ctx.moveTo(8, 8);
    ctx.lineTo(120, 120);
    ctx.stroke();
  });
}

function grateTexture(): THREE.CanvasTexture {
  return canvasTexture(
    128,
    128,
    (ctx) => {
      ctx.fillStyle = "#1c1a18";
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = "#4a4540";
      for (let i = 4; i < 128; i += 16) {
        ctx.fillRect(i, 0, 5, 128);
        ctx.fillRect(0, i, 128, 5);
      }
      ctx.strokeStyle = "#5e5850";
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, 120, 120);
    },
    false
  );
}

// ---- Geometry helpers ---------------------------------------------------------------

/** Merges geometries (positions, normals, uvs) into one, so a material draws them in one call. */
export function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const count = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array as Float32Array, o * 2);
    o += g.attributes.position.count;
  }
  for (const g of list) g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return out;
}

/** A box from x0…x1, y0…y1, z0…z1, its UVs scaled to meters (so the texture repeats evenly). */
function boxGeo(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, uvScale = 0.5): THREE.BufferGeometry {
  const w = x1 - x0;
  const h = y1 - y0;
  const d = z1 - z0;
  const g = new THREE.BoxGeometry(w, h, d);
  // BoxGeometry's faces go +x, −x, +y, −y, +z, −z, 4 vertices each: scale their UVs by the face's size.
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const sizes: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * sizes[f][0] * uvScale, uv.getY(i) * sizes[f][1] * uvScale);
    }
  }
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/** A ramp's wedge: rises from 0 to `b.h` toward its `ramp` side. */
function rampGeo(b: Block): THREE.BufferGeometry {
  const { x0, x1, z0, z1, h } = b;
  const top = (x: number, z: number) =>
    b.ramp === "x+" ? (h * (x - x0)) / (x1 - x0) : b.ramp === "x-" ? (h * (x1 - x)) / (x1 - x0) : b.ramp === "z+" ? (h * (z - z0)) / (z1 - z0) : (h * (z1 - z)) / (z1 - z0);
  const c = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ].map(([x, z]) => new THREE.Vector3(x, top(x, z), z));
  const f = c.map((v) => new THREE.Vector3(v.x, 0, v.z));
  const tris: THREE.Vector3[][] = [
    [c[0], c[2], c[1]],
    [c[0], c[3], c[2]],
    // Sides (some collapse to nothing on the low end).
    [f[0], c[0], c[1]],
    [f[0], c[1], f[1]],
    [f[1], c[1], c[2]],
    [f[1], c[2], f[2]],
    [f[2], c[2], c[3]],
    [f[2], c[3], f[3]],
    [f[3], c[3], c[0]],
    [f[3], c[0], f[0]],
  ];
  const pos: number[] = [];
  const uv: number[] = [];
  for (const t of tris) {
    for (const v of t) {
      pos.push(v.x, v.y, v.z);
      uv.push((v.x + v.z) * 0.5, v.y * 0.5 + v.z * 0.25);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export interface MapBuild {
  /** Animates traps (seconds into the round; negative before it starts). */
  update(dt: number, t: number): void;
  /** Torches to light (the scene adds their flames). */
  torches: { x: number; y: number; z: number; light: boolean }[];
  /** Fog and sky for this map. */
  fog: number;
  sky: [number, number];
}

interface Ctx {
  scene: THREE.Scene;
  map: ArenaMap;
  shadows: boolean;
  glow: THREE.Texture;
}

const shade = (o: THREE.Object3D, cast: boolean, receive: boolean) => {
  o.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) {
      (m as THREE.Mesh).castShadow = cast;
      (m as THREE.Mesh).receiveShadow = receive;
    }
  });
};

/** A team banner hanging on a wall facing `facing` (+1 = toward +x). */
function banner(team: TeamId, x: number, y: number, z: number, rotY: number): THREE.Group {
  const g = new THREE.Group();
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.8), lambert(TEAM_COLORS[team], { side: THREE.DoubleSide }));
  const trim = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.2), lambert(GOLD, { side: THREE.DoubleSide }));
  trim.position.y = 1.3;
  trim.position.z = 0.01;
  g.add(cloth, trim);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  return g;
}

// ---- The bridge -----------------------------------------------------------------------

function buildBridge(c: Ctx): MapBuild {
  const { scene, map } = c;
  const stoneTex = stoneTexture("#9d9384");
  const stone = new THREE.MeshLambertMaterial({ map: stoneTex });
  const darkStone = new THREE.MeshLambertMaterial({ map: stoneTex, color: 0xd6d2ca });
  const deckGeos: THREE.BufferGeometry[] = [];
  const wallGeos: THREE.BufferGeometry[] = [];
  for (const b of map.blocks) {
    if (b.look === "deck") deckGeos.push(boxGeo(b.x0, b.x1, -1.2, 0, b.z0, b.z1));
    else if (b.look === "plat") deckGeos.push(boxGeo(b.x0, b.x1, -3, 0, b.z0, b.z1));
    else if (b.look === "rail") {
      wallGeos.push(boxGeo(b.x0, b.x1, 0, 1.0, b.z0, b.z1));
      // Posts at the ends of each piece.
      for (const x of [b.x0 + 0.2, b.x1 - 0.2]) wallGeos.push(boxGeo(x - 0.22, x + 0.22, 0, 1.25, b.z0 - 0.05, b.z1 + 0.05));
    } else if (b.look === "wall") {
      wallGeos.push(boxGeo(b.x0, b.x1, 0, 1.1, b.z0, b.z1));
      // Merlons along the top.
      const long = b.x1 - b.x0 > b.z1 - b.z0;
      const len = long ? b.x1 - b.x0 : b.z1 - b.z0;
      for (let s = 0.4; s < len - 0.3; s += 1.4) {
        if (long) wallGeos.push(boxGeo(b.x0 + s, b.x0 + s + 0.7, 1.1, 1.6, b.z0, b.z1));
        else wallGeos.push(boxGeo(b.x0, b.x1, 1.1, 1.6, b.z0 + s, b.z0 + s + 0.7));
      }
    }
  }
  // Under the platforms: towers going down into the abyss; under the deck, two piers and arches.
  for (const side of [-1, 1]) {
    wallGeos.push(boxGeo(side > 0 ? 16.5 : -26.5, side > 0 ? 26.5 : -16.5, -60, -3, -5.5, 5.5));
    for (const x of [8, 0]) {
      if (x === 0 && side > 0) continue;
      wallGeos.push(boxGeo(x * side - 1.3, x * side + 1.3, -60, -1.2, -2.2, 2.2));
    }
  }
  const deck = new THREE.Mesh(mergeGeos(deckGeos), stone);
  const walls = new THREE.Mesh(mergeGeos(wallGeos), darkStone);
  shade(deck, c.shadows, c.shadows);
  shade(walls, c.shadows, c.shadows);
  scene.add(deck, walls);

  // The abyss: dark rock far below, and cliffs and mountains around.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), lambert(0x2f3540));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -70;
  scene.add(floor);
  const rand = mulberry32(61);
  const rock = lambert(0x6f6a62);
  const peaks: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand() * 0.2;
    const r = 70 + rand() * 60;
    const h = 30 + rand() * 50;
    const g = new THREE.ConeGeometry(12 + rand() * 16, h + 70, 6);
    g.translate(Math.cos(a) * r, h / 2 - 70 + 35, Math.sin(a) * r);
    peaks.push(g);
  }
  // Cliffs at both ends (behind the platforms) and along the sides, far.
  for (const side of [-1, 1]) {
    const g = new THREE.CylinderGeometry(14, 22, 90, 7);
    g.translate(side * 44, -45 + 2, 0);
    peaks.push(g);
  }
  const mountains = new THREE.Mesh(mergeGeos(peaks), rock);
  scene.add(mountains);

  // Banners on the back walls, torches on the platforms.
  for (const team of ["red", "blue"] as TeamId[]) {
    const side = team === "red" ? -1 : 1;
    for (const z of [-3, 3]) scene.add(banner(team, side * 26.4, 1.9, z, (Math.PI / 2) * side * -1));
  }
  const torches: MapBuild["torches"] = [];
  for (const side of [-1, 1]) for (const z of [-5.5, 5.5]) torches.push({ x: side * 21, y: 1.9, z: z * 0.97, light: z > 0 });
  return { update: () => {}, torches, fog: 0xa9c2d8, sky: [0x3d72b8, 0xbcd3e6] };
}

// ---- The courtyard ------------------------------------------------------------------------

function buildCourtyard(c: Ctx): MapBuild {
  const { scene, map } = c;
  const hx = map.bounds.kind === "rect" ? map.bounds.hx : 18;
  const hz = map.bounds.kind === "rect" ? map.bounds.hz : 14;
  const cob = cobbleTexture();
  cob.repeat.set(hx / 2, hz / 2);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2 + 4, hz * 2 + 4), new THREE.MeshLambertMaterial({ map: cob }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = c.shadows;
  scene.add(ground);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), lambert(0x6f8a4a));
  outside.rotation.x = -Math.PI / 2;
  outside.position.y = -0.05;
  scene.add(outside);

  const wallTex = stoneTexture("#a39782");
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
  const walkMat = new THREE.MeshLambertMaterial({ map: wallTex, color: 0xc9bfae });
  const geos: THREE.BufferGeometry[] = [];
  const walkGeos: THREE.BufferGeometry[] = [];
  // The outer walls (beyond the edge), with merlons.
  const T = 1.2;
  const H = 5.5;
  geos.push(boxGeo(-hx - T, hx + T, 0, H, -hz - T, -hz));
  geos.push(boxGeo(-hx - T, hx + T, 0, H, hz, hz + T));
  geos.push(boxGeo(-hx - T, -hx, 0, H, -hz, hz));
  geos.push(boxGeo(hx, hx + T, 0, H, -hz, hz));
  for (let x = -hx; x < hx; x += 1.6) {
    geos.push(boxGeo(x, x + 0.8, H, H + 0.7, -hz - T, -hz));
    geos.push(boxGeo(x, x + 0.8, H, H + 0.7, hz, hz + T));
  }
  for (let z = -hz; z < hz; z += 1.6) {
    geos.push(boxGeo(-hx - T, -hx, H, H + 0.7, z, z + 0.8));
    geos.push(boxGeo(hx, hx + T, H, H + 0.7, z, z + 0.8));
  }
  // Corner towers.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const g = new THREE.CylinderGeometry(2.2, 2.4, H + 3, 10);
      g.translate(sx * (hx + 0.6), (H + 3) / 2, sz * (hz + 0.6));
      geos.push(g);
      const roof = new THREE.ConeGeometry(2.8, 2.6, 10);
      roof.translate(sx * (hx + 0.6), H + 3 + 1.3, sz * (hz + 0.6));
      geos.push(roof);
    }
  }
  const crates: Block[] = [];
  for (const b of map.blocks) {
    if (b.look === "walk") {
      walkGeos.push(boxGeo(b.x0, b.x1, 0, b.h, b.z0, b.z1));
      // A low parapet on its courtyard edge (looks only; the walkway's edge is a drop).
      const edge = b.z1 <= 0 ? b.z1 : b.z0;
      const dir = b.z1 <= 0 ? -1 : 1;
      for (let x = b.x0 + 0.3; x < b.x1 - 0.3; x += 2.4) {
        if (Math.abs(Math.abs(x + 0.4) - 11) < 1.6) continue;
        walkGeos.push(boxGeo(x, x + 0.8, b.h, b.h + 0.35, edge + dir * 0.25 - 0.15, edge + dir * 0.25 + 0.15));
      }
    } else if (b.look === "ramp") walkGeos.push(rampGeo(b));
    else if (b.look === "crate" || b.look === "stack") crates.push(b);
  }
  const walls = new THREE.Mesh(mergeGeos(geos), wallMat);
  const walks = new THREE.Mesh(mergeGeos(walkGeos), walkMat);
  shade(walls, c.shadows, c.shadows);
  shade(walks, c.shadows, c.shadows);
  scene.add(walls, walks);

  // Crates, instanced (a tall stack is two crates).
  const boxes: { x: number; y: number; z: number; s: number; rot: number }[] = [];
  const rand = mulberry32(44);
  for (const b of crates) {
    const s = Math.min(b.x1 - b.x0, b.z1 - b.z0);
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const n = Math.max(1, Math.round(b.h / 1.0));
    for (let k = 0; k < n; k++) boxes.push({ x: cx, y: (b.h / n) * k, z: cz, s: s * (k ? 0.92 : 1), rot: (rand() - 0.5) * 0.15 * k });
  }
  const crate = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ map: woodTexture() }), boxes.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sv = new THREE.Vector3();
  boxes.forEach((b, i) => {
    const h = crates.find((cb) => Math.abs((cb.x0 + cb.x1) / 2 - b.x) < 0.01 && Math.abs((cb.z0 + cb.z1) / 2 - b.z) < 0.01);
    const n = h ? Math.max(1, Math.round(h.h / 1.0)) : 1;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot);
    sv.set(b.s, (h?.h ?? 1) / n, b.s);
    m.compose(new THREE.Vector3(b.x, b.y, b.z), q, sv);
    crate.setMatrixAt(i, m);
  });
  shade(crate, c.shadows, c.shadows);
  scene.add(crate);

  // Gates with banners on red's and blue's walls, torches along the walls.
  for (const team of ["red", "blue"] as TeamId[]) {
    const side = team === "red" ? -1 : 1;
    const gate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 3.6), lambert(0x4a3018));
    gate.position.set(side * (hx - 0.1), 1.7, 0);
    scene.add(gate);
    for (const z of [-3.2, 3.2]) scene.add(banner(team, side * (hx - 0.05), 2.8, z, (Math.PI / 2) * -side));
  }
  const torches: MapBuild["torches"] = [];
  for (const x of [-12, -4, 4, 12]) {
    torches.push({ x, y: 4.2, z: -hz + 0.25, light: Math.abs(x) === 4 });
    torches.push({ x: -x, y: 4.2, z: hz - 0.25, light: false });
  }
  return { update: () => {}, torches, fog: 0xd9c6a5, sky: [0x3a6fb5, 0xf0d2a4] };
}

// ---- The forest ---------------------------------------------------------------------------

function buildForest(c: Ctx): MapBuild {
  const { scene, map } = c;
  const ground = map.terrain ?? (() => 0);
  const size = 90;
  const seg = c.shadows ? 90 : 60;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const col = new THREE.Color();
  const rand = mulberry32(71);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    // Past the clearing the ground keeps rising into the woods.
    const y = ground(x, z) + Math.max(0, r - 19) * 0.12;
    pos.setY(i, y);
    const dirt = r < 3.4 ? 0.5 : 0;
    col.setHSL(0.24 - dirt * 0.12 + rand() * 0.02, 0.38 - dirt * 0.15, 0.32 + y * 0.06 + rand() * 0.03 + dirt * 0.08);
    colors.push(col.r, col.g, col.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const floor = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  floor.receiveShadow = c.shadows;
  scene.add(floor);

  // Trees: the clearing's (they block) and a thick wood around it (looks only).
  const trees: { x: number; z: number; r: number; h: number }[] = map.circles.filter((t) => t.h === undefined).map((t) => ({ ...t, h: 7 + rand() * 4 }));
  const R = map.bounds.kind === "circle" ? map.bounds.r : 18;
  for (let i = 0; i < (c.shadows ? 110 : 70); i++) {
    const a = rand() * Math.PI * 2;
    const r = R + 1.2 + Math.pow(rand(), 0.7) * 24;
    trees.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, r: 0.45 + rand() * 0.5, h: 8 + rand() * 6 });
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.8, 1, 1, 8).translate(0, 0.5, 0), lambert(0x5b3d23), trees.length);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), trees.length * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3();
  const p = new THREE.Vector3();
  trees.forEach((t, i) => {
    const gy = ground(t.x, t.z) + Math.max(0, Math.hypot(t.x, t.z) - 19) * 0.12;
    m.compose(p.set(t.x, gy - 0.3, t.z), q.identity(), one.set(t.r, t.h, t.r));
    trunk.setMatrixAt(i, m);
    for (let k = 0; k < 2; k++) {
      const s = (2.2 + rand() * 1.4) * (k ? 0.75 : 1) * (0.7 + t.r * 0.6);
      q.setFromEuler(new THREE.Euler(rand(), rand() * 6, rand()));
      m.compose(p.set(t.x + (rand() - 0.5), gy + t.h - 0.6 + k * 1.6, t.z + (rand() - 0.5)), q, one.set(s, s * 0.85, s));
      crown.setMatrixAt(i * 2 + k, m);
      crown.setColorAt(i * 2 + k, col.setHSL(0.27 + rand() * 0.06, 0.45, 0.24 + rand() * 0.1));
    }
  });
  shade(trunk, c.shadows, false);
  shade(crown, c.shadows, false);
  scene.add(trunk, crown);

  // Rocks, and bushes here and there.
  const rocks = map.circles.filter((t) => t.h !== undefined);
  const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), lambert(0x8d8a82), rocks.length);
  rocks.forEach((r, i) => {
    q.setFromEuler(new THREE.Euler(rand(), rand() * 6, rand()));
    m.compose(p.set(r.x, ground(r.x, r.z) + (r.h ?? 1) * 0.35, r.z), q, one.set(r.r * 1.05, (r.h ?? 1) * 0.75, r.r * 1.05));
    rockMesh.setMatrixAt(i, m);
  });
  shade(rockMesh, c.shadows, c.shadows);
  scene.add(rockMesh);
  const bushN = c.shadows ? 60 : 30;
  const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), lambert(0x3f6b2a), bushN);
  for (let i = 0; i < bushN; i++) {
    const a = rand() * Math.PI * 2;
    const r = 9 + rand() * (R - 9.5);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const s = 0.35 + rand() * 0.4;
    m.compose(p.set(x, ground(x, z) + s * 0.3, z), q.identity(), one.set(s * 1.3, s, s * 1.3));
    bush.setMatrixAt(i, m);
  }
  scene.add(bush);
  return { update: () => {}, torches: [], fog: 0xb7c9a6, sky: [0x5a8fc9, 0xd6e3c4] };
}

// ---- The trap pit's traps -------------------------------------------------------------------

/** Fire grates and the blade (the pit itself is the coliseum's build). */
function buildTraps(c: Ctx): (dt: number, t: number) => void {
  const { scene, map } = c;
  const updates: ((dt: number, t: number) => void)[] = [];
  const grateTex = grateTexture();
  const rand = mulberry32(88);
  map.traps.forEach((tr: Trap) => {
    if (tr.kind === "fuego") {
      const g = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(tr.half * 2, tr.half * 2), new THREE.MeshLambertMaterial({ map: grateTex }));
      plate.rotation.x = -Math.PI / 2;
      plate.position.y = 0.02;
      plate.receiveShadow = c.shadows;
      const heat = new THREE.Mesh(
        new THREE.PlaneGeometry(tr.half * 2.3, tr.half * 2.3),
        new THREE.MeshBasicMaterial({ map: c.glow, color: c.shadows ? glowColor(0xff7a1a, 1.6) : 0xff7a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      heat.rotation.x = -Math.PI / 2;
      heat.position.y = 0.05;
      const flames: THREE.Sprite[] = [];
      for (let i = 0; i < 5; i++) {
        const f = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: c.glow, color: c.shadows ? glowColor(0xff9a2a, 2) : 0xff8a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
        );
        f.position.set((rand() - 0.5) * tr.half * 1.6, 0.6, (rand() - 0.5) * tr.half * 1.6);
        f.userData.seed = rand() * 10;
        flames.push(f);
        g.add(f);
      }
      g.add(plate, heat);
      g.position.set(tr.x, 0, tr.z);
      scene.add(g);
      updates.push((_dt, t) => {
        const st = grateState(tr, t);
        const mat = heat.material as THREE.MeshBasicMaterial;
        mat.opacity = st.on ? 0.85 : st.warn ? 0.25 + 0.3 * Math.abs(Math.sin(t * 14)) : 0;
        for (const f of flames) {
          const s = f.userData.seed as number;
          const on = st.on ? Math.min(1, st.k * 6) : 0;
          f.visible = on > 0.02;
          const flick = 0.85 + Math.sin(t * 17 + s * 3) * 0.12;
          f.scale.set(1.2 * on * flick, 2.6 * on * flick, 1);
          f.position.y = 0.9 * on + Math.sin(t * 9 + s) * 0.08;
        }
      });
    } else {
      const g = new THREE.Group();
      const steel = new THREE.MeshPhongMaterial({ color: 0xc8ced6, shininess: 120, specular: 0xffffff });
      const dark = new THREE.MeshLambertMaterial({ color: 0x3a3632 });
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.7, 14), dark);
      hub.position.y = 0.35;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(tr.len * 2, 0.08, 0.32), steel);
      blade.position.y = tr.top - 0.18;
      const edge = new THREE.Mesh(new THREE.BoxGeometry(tr.len * 2, 0.04, 0.5), steel);
      edge.position.y = tr.top - 0.18;
      const spin = new THREE.Group();
      spin.add(blade, edge);
      // A track in the sand where it sweeps.
      const track = new THREE.Mesh(
        new THREE.RingGeometry(tr.len - 0.25, tr.len + 0.05, 48),
        new THREE.MeshBasicMaterial({ color: 0x7a5530, transparent: true, opacity: 0.35, depthWrite: false })
      );
      track.rotation.x = -Math.PI / 2;
      track.position.y = 0.015;
      g.add(hub, spin, track);
      g.position.set(tr.x, 0, tr.z);
      shade(g, c.shadows, false);
      scene.add(g);
      updates.push((_dt, t) => {
        // Yaw convention: the blade's arm points along (cos a, sin a) on x/z.
        spin.rotation.y = -bladeAngle(tr, t);
      });
    }
  });
  return (dt, t) => {
    for (const u of updates) u(dt, t);
  };
}

/** Builds a map's own scene (not the coliseum's walls and stands); null for the arena maps. */
export function buildMap(scene: THREE.Scene, map: ArenaMap, shadows: boolean, glow: THREE.Texture): MapBuild | null {
  const c = { scene, map, shadows, glow };
  if (map.id === "puente") return buildBridge(c);
  if (map.id === "patio") return buildCourtyard(c);
  if (map.id === "bosque") return buildForest(c);
  return null;
}

export function buildTrapsFor(scene: THREE.Scene, map: ArenaMap, shadows: boolean, glow: THREE.Texture): ((dt: number, t: number) => void) | null {
  return map.traps.length ? buildTraps({ scene, map, shadows, glow }) : null;
}

// ---- What modes and events draw on the ground -----------------------------------------------

export interface WorldFx {
  /** Seconds into the round (traps); negative before it starts. */
  t: number;
  /** «Rey»: who holds the hill ("red", "blue", "contest", ""); undefined: no hill. */
  hill?: string;
  /** «La arena se achica»: the ring's radius, or null. */
  ring: number | null;
  /** «Niebla»: 0–1. */
  fog: number;
  /** Arrow rain: circles warning (k 0→1 until it lands) at (x, y, z). */
  rain: { x: number; y: number; z: number; k: number }[];
}

const HILL_COLORS: Record<string, number> = { red: 0xfb3a5d, blue: 0x22d3ee, contest: 0xffffff, "": 0xfde68a };

/** The hill's circle, the closing ring of fire and the rain's circles (pooled). */
export class GroundFx {
  private hill: THREE.Group;
  private hillDisc: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private hillRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private hillBeam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private ring: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private ringGlow: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private drops: THREE.Group[] = [];
  private arrows: THREE.LineSegments;
  private time = 0;

  constructor(scene: THREE.Scene, map: ArenaMap, high: boolean, groundY: number) {
    this.hill = new THREE.Group();
    this.hillDisc = new THREE.Mesh(new THREE.CircleGeometry(map.hill.r, 40), new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.18, depthWrite: false }));
    this.hillDisc.rotation.x = -Math.PI / 2;
    this.hillRing = new THREE.Mesh(new THREE.RingGeometry(map.hill.r - 0.18, map.hill.r, 48), new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.85, depthWrite: false }));
    this.hillRing.rotation.x = -Math.PI / 2;
    this.hillRing.position.y = 0.01;
    this.hillBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(map.hill.r, map.hill.r, 6, 40, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    );
    this.hillBeam.position.y = 3;
    this.hill.add(this.hillDisc, this.hillRing, this.hillBeam);
    this.hill.position.set(map.hill.x, groundY + 0.03, map.hill.z);
    this.hill.visible = false;
    scene.add(this.hill);

    const fire = high ? glowColor(0xff5a1a, 1.4) : new THREE.Color(0xff5a1a);
    this.ring = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 2.6, 64, 1, true),
      new THREE.MeshBasicMaterial({ color: fire, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    );
    this.ring.position.y = 1.3;
    this.ringGlow = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 0.5, 64, 1, true),
      new THREE.MeshBasicMaterial({ color: fire, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    );
    this.ringGlow.position.y = 0.25;
    this.ring.visible = this.ringGlow.visible = false;
    scene.add(this.ring, this.ringGlow);

    for (let i = 0; i < 15; i++) {
      const g = new THREE.Group();
      const edge = new THREE.Mesh(new THREE.RingGeometry(RAIN_R - 0.2, RAIN_R, 36), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.9, depthWrite: false }));
      const fill = new THREE.Mesh(new THREE.CircleGeometry(RAIN_R, 36), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.2, depthWrite: false }));
      edge.rotation.x = fill.rotation.x = -Math.PI / 2;
      g.add(fill, edge);
      g.visible = false;
      this.drops.push(g);
      scene.add(g);
    }
    const lines = new THREE.BufferGeometry();
    lines.setAttribute("position", new THREE.BufferAttribute(new Float32Array(15 * 6 * 2 * 3), 3));
    this.arrows = new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0x3b2a1a }));
    this.arrows.frustumCulled = false;
    scene.add(this.arrows);
  }

  update(w: WorldFx, dt: number) {
    this.time += dt;
    this.hill.visible = w.hill !== undefined;
    if (w.hill !== undefined) {
      const color = HILL_COLORS[w.hill] ?? 0xfde68a;
      const pulse = w.hill === "contest" ? 0.5 + 0.5 * Math.abs(Math.sin(this.time * 8)) : 1;
      this.hillDisc.material.color.setHex(color);
      this.hillRing.material.color.setHex(color);
      this.hillBeam.material.color.setHex(color);
      this.hillDisc.material.opacity = (w.hill ? 0.3 : 0.15) * pulse;
      this.hillBeam.material.opacity = (w.hill ? 0.14 : 0.06) * pulse;
    }
    const on = w.ring !== null;
    this.ring.visible = this.ringGlow.visible = on;
    if (on) {
      const r = w.ring!;
      this.ring.scale.set(r, 1, r);
      this.ringGlow.scale.set(r, 1, r);
      this.ring.material.opacity = 0.3 + Math.sin(this.time * 6) * 0.08;
    }
    const pos = this.arrows.geometry.attributes.position as THREE.BufferAttribute;
    let n = 0;
    this.drops.forEach((g, i) => {
      const d = w.rain[i];
      g.visible = !!d;
      if (!d) return;
      g.position.set(d.x, d.y + 0.04, d.z);
      const fill = g.children[0] as THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
      fill.material.opacity = 0.12 + 0.3 * d.k;
      fill.scale.setScalar(Math.max(0.05, d.k));
      // The last moment: arrows coming down.
      const fall = (d.k - 0.82) / 0.18;
      if (fall > 0) {
        for (let a = 0; a < 6; a++) {
          const ang = a * 1.05 + i;
          const rr = (a % 3) * 0.6 + 0.3;
          const x = d.x + Math.cos(ang) * rr;
          const z = d.z + Math.sin(ang) * rr;
          const y = d.y + (1 - fall) * 14;
          pos.setXYZ(n++, x, y, z);
          pos.setXYZ(n++, x - 0.15, y + 0.9, z - 0.1);
        }
      }
    });
    for (let k = n; k < pos.count; k++) pos.setXYZ(k, 0, -100, 0);
    pos.needsUpdate = true;
  }
}

