import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "./random";
import type { StartLights } from "./carrerasAudio";
import {
  BRIDGE_CLEARANCE,
  CAR_LENGTH,
  CAR_WIDTH,
  MAX_SPEED,
  RAMP_HEIGHT,
  frameAt,
  type Track,
  type TrackTheme,
  type Zone,
} from "./carrerasTrack";

/**
 * Carreras in 3D (three.js), browser only. The 2D world maps to the ground
 * plane: (x, y) → (x, 0, y), heights go up y, heading h → rotation.y = -h, so
 * steering right still turns right on screen. Everything is built from the
 * track's sampled centerline, dressed by its theme: the road rides on earth
 * banks over the hills and on pillars where it crosses over itself. Road
 * pieces are unlit (fog only), cars and scenery are lit. Wheels, pitch, brake
 * lights, smoke, sparks and boost flames are worked out here from the poses
 * alone, so they look the same for local cars and rivals.
 */

export type CameraMode = "detras" | "cabina";

const ROAD_Y = 0.6;
const SKY_RADIUS = 5200;

interface Look {
  skyTop: number;
  horizon: number;
  fogNear: number;
  fogFar: number;
  hemi: [number, number, number];
  sun: [number, number];
  /** Direction the sunlight comes from (also where the sun/moon is drawn). */
  sunDir: [number, number, number];
  ground: [string, string];
  runoff: number;
  asphalt: [number, number];
  curb: [number, number];
  wall: [number, number];
  scenery: "campo" | "desierto" | "nieve";
  mountain: number;
  snowCaps: boolean;
  clouds: number;
  cloud: number;
  /** Color of the smoke when sliding (dust in the desert, powder on snow). */
  smoke: number;
  night: boolean;
}

const LOOKS: Record<TrackTheme, Look> = {
  campo: {
    skyTop: 0x2f7fd6,
    horizon: 0xc4e7fb,
    fogNear: 900,
    fogFar: 3600,
    hemi: [0xe0f2fe, 0x365314, 1.5],
    sun: [0xffffff, 1.7],
    sunDir: [-0.5, 0.75, -0.35],
    ground: ["#3f9a43", "#378a3b"],
    runoff: 0xd6c38f,
    asphalt: [0x3b3b44, 0x35353d],
    curb: [0xdc2626, 0xf8fafc],
    wall: [0xdc2626, 0xf1f5f9],
    scenery: "campo",
    mountain: 0x64748b,
    snowCaps: true,
    clouds: 16,
    cloud: 0xffffff,
    smoke: 0xe2e8f0,
    night: false,
  },
  atardecer: {
    skyTop: 0x2c2366,
    horizon: 0xff9d66,
    fogNear: 800,
    fogFar: 3300,
    hemi: [0xffd1a8, 0x4a3426, 1.25],
    sun: [0xffa860, 2],
    sunDir: [0.75, 0.22, -0.6],
    ground: ["#5a8f3a", "#52833a"],
    runoff: 0xd9b98a,
    asphalt: [0x3d3a44, 0x37343e],
    curb: [0xe11d48, 0xfff1e6],
    wall: [0xe11d48, 0xfff1e6],
    scenery: "campo",
    mountain: 0x6b4a6e,
    snowCaps: false,
    clouds: 12,
    cloud: 0xffc4a3,
    smoke: 0xf5d0c5,
    night: false,
  },
  desierto: {
    skyTop: 0x3b95d9,
    horizon: 0xf6e3bb,
    fogNear: 900,
    fogFar: 3600,
    hemi: [0xfff4d6, 0x8a6a3a, 1.45],
    sun: [0xfff1d0, 1.9],
    sunDir: [0.3, 0.85, 0.4],
    ground: ["#dcb97c", "#d2ae70"],
    runoff: 0xead5a3,
    asphalt: [0x45434a, 0x3e3c43],
    curb: [0xea580c, 0xfafaf9],
    wall: [0xea580c, 0xfafaf9],
    scenery: "desierto",
    mountain: 0xb4703f,
    snowCaps: false,
    clouds: 4,
    cloud: 0xffffff,
    smoke: 0xe9cf9b,
    night: false,
  },
  nieve: {
    skyTop: 0x6f97c2,
    horizon: 0xe4edf6,
    fogNear: 700,
    fogFar: 3000,
    hemi: [0xf1f5f9, 0x94a3b8, 1.5],
    sun: [0xffffff, 1.25],
    sunDir: [-0.4, 0.6, 0.5],
    ground: ["#eef3f8", "#e2e9f1"],
    runoff: 0xcbd5e1,
    asphalt: [0x40424c, 0x3a3c45],
    curb: [0x2563eb, 0xf8fafc],
    wall: [0x2563eb, 0xf8fafc],
    scenery: "nieve",
    mountain: 0x8796ab,
    snowCaps: true,
    clouds: 18,
    cloud: 0xe2e8f0,
    smoke: 0xffffff,
    night: false,
  },
  noche: {
    skyTop: 0x020617,
    horizon: 0x1c2a4d,
    fogNear: 600,
    fogFar: 2800,
    hemi: [0x6077b8, 0x0b1020, 0.75],
    sun: [0xa5b4fc, 0.7],
    sunDir: [0.45, 0.55, -0.6],
    ground: ["#1c3a24", "#19341f"],
    runoff: 0x5f5848,
    asphalt: [0x2c2c35, 0x282830],
    curb: [0xb91c1c, 0xcbd5e1],
    wall: [0xb91c1c, 0xcbd5e1],
    scenery: "campo",
    mountain: 0x1e293b,
    snowCaps: false,
    clouds: 0,
    cloud: 0xffffff,
    smoke: 0x94a3b8,
    night: true,
  },
};

interface Normals {
  nx: Float64Array;
  ny: Float64Array;
}

function trackNormals(track: Track): Normals {
  const n = track.xs.length;
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    const tx = track.xs[b] - track.xs[a];
    const ty = track.ys[b] - track.ys[a];
    const len = Math.hypot(tx, ty) || 1;
    nx[i] = -ty / len;
    ny[i] = tx / len;
  }
  return { nx, ny };
}

/**
 * A band along the track between two offsets from the centerline (both sides
 * when `mirror`), `y` above the road's height, one color per quad; null skips
 * the quad. UVs run across (u) and along the track (v, one unit every 64), for
 * a grain texture.
 */
function band(
  track: Track,
  nm: Normals,
  inner: number,
  outer: number,
  y: number,
  color: (i: number) => THREE.Color | null,
  mirror = true
): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const n = track.xs.length;
  const sides = mirror ? [1, -1] : [1];
  for (const side of sides) {
    for (let i = 0; i < n; i++) {
      const c = color(i);
      if (!c) continue;
      const j = (i + 1) % n;
      const p = (k: number, off: number) => [track.xs[k] + nm.nx[k] * off * side, track.hs[k] + y, track.ys[k] + nm.ny[k] * off * side];
      const ai = p(i, inner);
      const bi = p(i, outer);
      const aj = p(j, inner);
      const bj = p(j, outer);
      pos.push(...ai, ...bi, ...bj, ...ai, ...bj, ...aj);
      const vi = track.cum[i] / 64;
      const vj = j === 0 ? track.length / 64 : track.cum[j] / 64;
      const ui = inner / 64;
      const uo = outer / 64;
      uv.push(ui, vi, uo, vi, uo, vj, ui, vi, uo, vj, ui, vj);
      for (let v = 0; v < 6; v++) col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Low walls on both edges, alternating colors like tire barriers, with a lighter top rail. */
function walls(track: Track, nm: Normals, offset: number, height: number, colors: [number, number]): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const n = track.xs.length;
  const a = new THREE.Color(colors[0]);
  const b = new THREE.Color(colors[1]);
  const rail = new THREE.Color(0xe2e8f0);
  for (const side of [1, -1]) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x = (k: number, off = 0) => track.xs[k] + nm.nx[k] * (offset + off) * side;
      const z = (k: number, off = 0) => track.ys[k] + nm.ny[k] * (offset + off) * side;
      const c = Math.floor(track.cum[i] / 30) % 2 ? a : b;
      const hi = track.hs[i];
      const hj = track.hs[j];
      const quad = (y0: number, y1: number, o0: number, o1: number, cc: THREE.Color) => {
        pos.push(x(i, o0), hi + y0, z(i, o0), x(i, o1), hi + y1, z(i, o1), x(j, o1), hj + y1, z(j, o1));
        pos.push(x(i, o0), hi + y0, z(i, o0), x(j, o1), hj + y1, z(j, o1), x(j, o0), hj + y0, z(j, o0));
        for (let v = 0; v < 6; v++) col.push(cc.r, cc.g, cc.b);
      };
      quad(0, height, 0, 0, c);
      // Top of the wall, a bit wide, so it reads as a solid barrier from the cockpit.
      quad(height, height, 0, 5, rail);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** How far the runoff reaches from the centerline; banks and bridge decks start there. */
const edgeOf = (track: Track) => track.def.width / 2 + 26;
/** Earth banks spread this much sideways per unit of height. */
const BANK_SPREAD = 1.3;
const DECK_DEPTH = 8;

/**
 * Samples that carry the road over a lower part of the track (a bridge): there
 * the road rests on pillars instead of an earth bank, which would bury the
 * road underneath.
 */
function bridgeSamples(track: Track): boolean[] {
  const { xs, ys, hs, cum, length } = track;
  const n = xs.length;
  const edge = edgeOf(track);
  const over = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (hs[i] < BRIDGE_CLEARANCE / 3) continue;
    const reach = edge + hs[i] * BANK_SPREAD + track.def.width / 2 + 30;
    for (let j = 0; j < n; j++) {
      if (hs[j] > hs[i] - BRIDGE_CLEARANCE / 3) continue;
      let along = Math.abs(cum[j] - cum[i]);
      along = Math.min(along, length - along);
      if (along < reach * 2 || Math.hypot(xs[j] - xs[i], ys[j] - ys[i]) > reach) continue;
      over[i] = true;
      break;
    }
  }
  return over;
}

/**
 * Under the raised road: sloping earth banks down to the ground (with an end
 * wall where a bridge starts), or a concrete deck over the bridges.
 */
function embankments(track: Track, nm: Normals, over: boolean[], earth: THREE.Color, concrete: THREE.Color): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const n = track.xs.length;
  const edge = edgeOf(track);
  const at = (k: number, off: number, y: number) => [track.xs[k] + nm.nx[k] * off, y, track.ys[k] + nm.ny[k] * off];
  const quad = (a: number[], b: number[], c: number[], d: number[], color: THREE.Color) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let v = 0; v < 6; v++) col.push(color.r, color.g, color.b);
  };
  const tri = (a: number[], b: number[], c: number[], color: THREE.Color) => {
    pos.push(...a, ...b, ...c);
    for (let v = 0; v < 3; v++) col.push(color.r, color.g, color.b);
  };
  const bankColor = earth.clone().multiplyScalar(0.82);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const hi = track.hs[i];
    const hj = track.hs[j];
    if (hi < 0.5 && hj < 0.5) continue;
    if (over[i] || over[j]) {
      for (const side of [1, -1]) {
        const o = edge * side;
        quad(at(i, o, hi + 0.3), at(j, o, hj + 0.3), at(j, o, hj - DECK_DEPTH), at(i, o, hi - DECK_DEPTH), concrete);
      }
      quad(at(i, -edge, hi - DECK_DEPTH), at(j, -edge, hj - DECK_DEPTH), at(j, edge, hj - DECK_DEPTH), at(i, edge, hi - DECK_DEPTH), concrete);
    } else {
      for (const side of [1, -1]) {
        quad(
          at(i, edge * side, hi + 0.3),
          at(j, edge * side, hj + 0.3),
          at(j, (edge + hj * BANK_SPREAD) * side, 0),
          at(i, (edge + hi * BANK_SPREAD) * side, 0),
          bankColor
        );
      }
    }
    // Where the bank meets a bridge: a wall across, so the bank isn't hollow.
    const k = over[i] && !over[j] ? j : !over[i] && over[j] ? i : -1;
    if (k >= 0 && track.hs[k] > 0.5) {
      const h = track.hs[k];
      const spread = edge + h * BANK_SPREAD;
      quad(at(k, -edge, h), at(k, edge, h), at(k, edge, 0), at(k, -edge, 0), concrete);
      for (const side of [1, -1]) tri(at(k, edge * side, h), at(k, spread * side, 0), at(k, edge * side, 0), concrete);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Pillars under the bridges, every so often, never standing on the road below. */
function pillarSpots(track: Track, over: boolean[]): [number, number, number][] {
  const { xs, ys, hs, cum } = track;
  const n = xs.length;
  const spots: [number, number, number][] = [];
  const clear = track.def.width / 2 + 16;
  const free = (x: number, y: number, h: number) => {
    for (let j = 0; j < n; j++) {
      if (hs[j] < h - BRIDGE_CLEARANCE / 3 && Math.hypot(xs[j] - x, ys[j] - y) < clear) return false;
    }
    return true;
  };
  let nextAt = -Infinity;
  for (let i = 0; i < n; i++) {
    if (!over[i] || cum[i] < nextAt || hs[i] < 14) continue;
    if (free(xs[i], ys[i], hs[i])) {
      spots.push([xs[i], ys[i], hs[i] - DECK_DEPTH]);
      nextAt = cum[i] + 90;
    }
  }
  return spots;
}

/** Where a point `d` along a zone and `lat` across it is, and the road's height under it. */
function zonePoint(track: Track, zone: Zone, d: number, lat: number): [number, number, number] {
  const f = frameAt(track, zone.s0 + d);
  return [f.x - f.dy * lat, f.h, f.y + f.dx * lat];
}

/** A ramp: a striped wedge rising to its lip, with orange sides and a dark face at the drop. */
function rampGeometry(track: Track, zone: Zone): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const yellow = new THREE.Color(0xfacc15);
  const dark = new THREE.Color(0x1f2937);
  const side = new THREE.Color(0xf97316);
  const tri = (a: number[], b: number[], c: number[], color: THREE.Color) => {
    pos.push(...a, ...b, ...c);
    for (let v = 0; v < 3; v++) col.push(color.r, color.g, color.b);
  };
  const steps = 8;
  const y0 = ROAD_Y + 0.2;
  const corner = (k: number, lat: number, top: boolean) => {
    const d = (zone.len * k) / steps;
    const [x, h, z] = zonePoint(track, zone, d, lat);
    return [x, h + y0 + (top ? (RAMP_HEIGHT * k) / steps : 0), z];
  };
  for (let k = 0; k < steps; k++) {
    const c = k % 2 ? dark : yellow;
    const a = corner(k, zone.lo, true);
    const b = corner(k, zone.hi, true);
    const cc = corner(k + 1, zone.hi, true);
    const d = corner(k + 1, zone.lo, true);
    tri(a, b, cc, c);
    tri(a, cc, d, c);
    for (const lat of [zone.lo, zone.hi]) {
      const top0 = corner(k, lat, true);
      const top1 = corner(k + 1, lat, true);
      const bot0 = corner(k, lat, false);
      const bot1 = corner(k + 1, lat, false);
      tri(bot0, top0, top1, side);
      tri(bot0, top1, bot1, side);
    }
  }
  const lipLo = corner(steps, zone.lo, true);
  const lipHi = corner(steps, zone.hi, true);
  const baseLo = corner(steps, zone.lo, false);
  const baseHi = corner(steps, zone.hi, false);
  tri(lipLo, lipHi, baseHi, dark);
  tri(lipLo, baseHi, baseLo, dark);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** A boost pad: a strip on the road; its arrows (v runs along the track, square tiles) scroll forward. */
function boostGeometry(track: Track, zone: Zone): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const steps = 6;
  const across = zone.hi - zone.lo;
  for (let k = 0; k < steps; k++) {
    const d0 = (zone.len * k) / steps;
    const d1 = (zone.len * (k + 1)) / steps;
    const p = (d: number, lat: number) => {
      const [x, h, z] = zonePoint(track, zone, d, lat);
      return [x, h + ROAD_Y + 0.35, z];
    };
    pos.push(...p(d0, zone.lo), ...p(d0, zone.hi), ...p(d1, zone.hi), ...p(d0, zone.lo), ...p(d1, zone.hi), ...p(d1, zone.lo));
    const v0 = d0 / across;
    const v1 = d1 / across;
    uv.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function checkerTexture(cols: number, rows: number): THREE.CanvasTexture {
  const t = canvasTexture(cols * 16, rows * 16, (ctx) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 ? "#0f172a" : "#f8fafc";
        ctx.fillRect(c * 16, r * 16, 16, 16);
      }
    }
  });
  t.magFilter = THREE.NearestFilter;
  return t;
}

function groundTexture(colors: [string, string]): THREE.CanvasTexture {
  const t = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = colors[1];
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillRect(64, 64, 64, 64);
    const rand = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
      const s = 1 + rand() * 2.5;
      ctx.fillRect(rand() * 128, rand() * 128, s, s);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Light grain multiplied over the asphalt's vertex colors. */
function grainTexture(): THREE.CanvasTexture {
  const t = canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(0, 0, 64, 64);
    const rand = mulberry32(11);
    for (let i = 0; i < 700; i++) {
      const v = Math.floor(200 + rand() * 55);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(rand() * 64, rand() * 64, 1 + rand() * 1.5, 1 + rand() * 1.5);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** A soft round spot, white in the middle; tinted by the material. */
function glowTexture(): THREE.CanvasTexture {
  const t = canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  t.name = "glow";
  return t;
}

/** Boost pad tile: a bright chevron pointing forward (up the texture) on a translucent orange. */
function arrowTexture(): THREE.CanvasTexture {
  const t = canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = "rgba(249,115,22,0.45)";
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = "#fde047";
    ctx.lineWidth = 11;
    ctx.lineJoin = "miter";
    ctx.beginPath();
    ctx.moveTo(10, 46);
    ctx.lineTo(32, 20);
    ctx.lineTo(54, 46);
    ctx.stroke();
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function labelSprite(text: string, color: string): THREE.Sprite {
  const tex = canvasTexture(256, 64, (ctx) => {
    ctx.font = "bold 36px system-ui, sans-serif";
    const w = Math.min(248, ctx.measureText(text).width + 28);
    ctx.fillStyle = "rgba(2,6,23,0.75)";
    ctx.beginPath();
    ctx.roundRect(128 - w / 2, 6, w, 52, 14);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 33, 230);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.scale.set(48, 12, 1);
  sprite.position.y = 32;
  return sprite;
}

// ---- Cars ------------------------------------------------------------------

const WHEEL_R = 4.2;
const TAIL_OFF = new THREE.Color(0x7f1d1d);
const TAIL_ON = new THREE.Color(0xff2d2d);

interface CarParts {
  /** Placed at the car and turned to its heading. */
  group: THREE.Group;
  /** The car itself, pitched with the climb or the flight. */
  body: THREE.Group;
  /** On the road under the car (blob shadow, headlight beam), pitched with the road. */
  floor: THREE.Group;
  shadow: THREE.MeshBasicMaterial;
  wheels: THREE.Object3D[];
  steering: THREE.Object3D[];
  tail: THREE.MeshBasicMaterial;
}

function wheelMesh(tire: THREE.Material, rim: THREE.Material, hub: THREE.Material): THREE.Group {
  const w = new THREE.Group();
  const t = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 3.6, 16);
  t.rotateX(Math.PI / 2);
  const r = new THREE.CylinderGeometry(2.5, 2.5, 3.8, 10);
  r.rotateX(Math.PI / 2);
  w.add(new THREE.Mesh(t, tire), new THREE.Mesh(r, rim));
  // A spoke, so the wheel is seen turning.
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1, 3.9), hub);
  w.add(spoke);
  return w;
}

function carMesh(color: string, night: boolean, glow: THREE.Texture): CarParts {
  // root (position, heading) holds the body and the floor, each pitched about the lateral axis (z).
  const root = new THREE.Group();
  const group = new THREE.Group();
  const floor = new THREE.Group();
  root.add(group, floor);
  const paint = new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x777777 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x0f172a, shininess: 120, specular: 0x9fb4ff });
  const black = new THREE.MeshLambertMaterial({ color: 0x0b0b0f });
  const rim = new THREE.MeshPhongMaterial({ color: 0xcbd5e1, shininess: 80 });
  const hub = new THREE.MeshLambertMaterial({ color: 0x334155 });
  const head = new THREE.MeshBasicMaterial({ color: 0xfefce8 });
  const tail = new THREE.MeshBasicMaterial({ color: TAIL_OFF.clone() });

  // Body: a side profile extruded across the car, nose at +x.
  const half = CAR_LENGTH / 2;
  const profile = new THREE.Shape();
  profile.moveTo(-half, 2.6);
  profile.lineTo(half - 2, 2.6);
  profile.quadraticCurveTo(half + 3, 2.6, half + 3, 5);
  profile.lineTo(half + 1, 7.2);
  profile.lineTo(4, 9.4);
  profile.lineTo(-half + 3, 10);
  profile.lineTo(-half, 9.2);
  profile.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(profile, {
    depth: CAR_WIDTH - 2,
    bevelEnabled: true,
    bevelThickness: 1,
    bevelSize: 1,
    bevelSegments: 2,
    curveSegments: 6,
  });
  bodyGeo.translate(0, 0, -(CAR_WIDTH - 2) / 2);
  const body = new THREE.Mesh(bodyGeo, paint);

  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-10, 9.6);
  cabinShape.lineTo(3.5, 9.4);
  cabinShape.lineTo(-1.5, 15);
  cabinShape.lineTo(-8.5, 15.2);
  cabinShape.closePath();
  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: CAR_WIDTH - 7,
    bevelEnabled: true,
    bevelThickness: 0.8,
    bevelSize: 0.8,
    bevelSegments: 1,
  });
  cabinGeo.translate(0, 0, -(CAR_WIDTH - 7) / 2);
  const cabin = new THREE.Mesh(cabinGeo, glass);

  // Roof stripe and rear wing.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.4, 3.2), new THREE.MeshLambertMaterial({ color: 0xf8fafc }));
  stripe.position.set(-5, 15.5, 0);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.2, CAR_WIDTH + 3), paint);
  wing.position.set(-half + 1.5, 14.2, 0);
  group.add(body, cabin, stripe, wing);
  for (const z of [5.5, -5.5]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.5, 4.5, 1.2), black);
    post.position.set(-half + 2, 11.5, z);
    group.add(post);
  }

  const wheels: THREE.Object3D[] = [];
  const steering: THREE.Object3D[] = [];
  for (const [x, z, front] of [
    [11, CAR_WIDTH / 2 + 0.6, true],
    [11, -CAR_WIDTH / 2 - 0.6, true],
    [-11, CAR_WIDTH / 2 + 0.6, false],
    [-11, -CAR_WIDTH / 2 - 0.6, false],
  ] as [number, number, boolean][]) {
    const w = wheelMesh(black, rim, hub);
    wheels.push(w);
    if (front) {
      const pivot = new THREE.Group();
      pivot.position.set(x, WHEEL_R, z);
      pivot.add(w);
      steering.push(pivot);
      group.add(pivot);
    } else {
      w.position.set(x, WHEEL_R, z);
      group.add(w);
    }
  }

  for (const z of [5.5, -5.5]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 3.4), head);
    l.position.set(half + 2.4, 5.6, z);
    const t = new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 4), tail);
    t.position.set(-half - 0.6, 7.6, z);
    group.add(l, t);
  }

  // Blob shadow: cheaper than real shadows and reads well from the chase camera.
  const shadowMat = new THREE.MeshBasicMaterial({ map: glow, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(CAR_LENGTH + 16, CAR_WIDTH + 14), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = ROAD_Y + 0.4;
  shadow.renderOrder = 1;
  floor.add(shadow);

  if (night) {
    // Headlight beam on the road.
    const beam = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 60),
      new THREE.MeshBasicMaterial({
        map: glow,
        color: 0xfff1c1,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(half + 50, ROAD_Y + 0.5, 0);
    beam.renderOrder = 2;
    floor.add(beam);
  }
  return { group: root, body: group, floor, shadow: shadowMat, wheels, steering, tail };
}

// ---- Particles ---------------------------------------------------------------

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
  gl_PointSize = size * scale / max(1.0, -mv.z);
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

/** A pool of round particles (smoke, sparks) with per-particle color, size and fade. */
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
  /** Height each particle can't sink below (the road it came from). */
  private floor: Float32Array;
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
    this.floor = new Float32Array(max);
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

  spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: THREE.Color,
    size: number,
    life: number,
    alpha: number,
    grow: number,
    floor = 0
  ) {
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
    this.floor[i] = floor + 0.5;
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
      this.vel[k + 1] -= this.gravity * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] = Math.max(this.floor[i], this.pos[k + 1] + this.vel[k + 1] * dt);
      this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = this.startAlpha[i] * (this.life[i] / this.maxLife[i]);
    }
    const attrs = this.points.geometry.attributes;
    attrs.position.needsUpdate = true;
    attrs.alpha.needsUpdate = true;
    attrs.size.needsUpdate = true;
    attrs.pcolor.needsUpdate = true;
  }

  setScale(scale: number) {
    this.material.uniforms.scale.value = scale;
  }
}

// ---- Scene -------------------------------------------------------------------

interface Rig {
  camera: THREE.PerspectiveCamera;
  pos: THREE.Vector3;
  look: THREE.Vector3;
  ready: boolean;
}

interface CarObj extends CarParts {
  label: THREE.Sprite | null;
  /** Speed along the heading (negative backing up). */
  forward: number;
  lateral: number;
  heading: number;
  /** Height of the car and of the road under it. */
  z: number;
  ground: number;
  bump: number;
  steer: number;
  brake: number;
  lastForward: number;
  lastHeading: number;
  lastZ: number;
  lastGround: number;
  /** Nose up (+) or down, of the car and of the road under it. */
  pitch: number;
  groundPitch: number;
  /** Camera shake left after a hit. */
  shake: number;
  smokeAcc: number;
  flameAcc: number;
}

export interface CarPoseInput {
  x: number;
  y: number;
  /** Height of the car (0 if unknown). */
  z?: number;
  /** Height of the road under it (the car's own height if unknown). */
  ground?: number;
  heading: number;
  vx: number;
  vy: number;
  /** Seconds of wall scrape left (sparks), if known. */
  bump?: number;
}

export interface ViewRequest {
  /** Car to follow. */
  key: string;
}

/** The race in 3D on one canvas: any number of cars, one camera per view. */
export class RaceScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private look: Look;
  private cars = new Map<string, CarObj>();
  private rigs = new Map<string, Rig>();
  private maxDpr: number;
  private glow: THREE.Texture;
  private smoke = new Particles(500, false, -6);
  private sparks = new Particles(300, true, 160);
  private flames = new Particles(260, true, -20);
  private smokeColor: THREE.Color;
  private sparkColors = [new THREE.Color(0xfde047), new THREE.Color(0xfb923c), new THREE.Color(0xfffbeb)];
  private flameColors = [new THREE.Color(0xfb923c), new THREE.Color(0xfde047), new THREE.Color(0x60a5fa)];
  private lights: THREE.MeshBasicMaterial[] = [];
  private clouds: THREE.Object3D | null = null;
  private snow: THREE.Points | null = null;
  private snowVel: Float32Array | null = null;
  private arrows: THREE.Texture | null = null;
  private rand = mulberry32(99);
  /** Middle of the track's world. */
  private cx: number;
  private cz: number;
  private worldW: number;
  private worldH: number;

  constructor(
    private canvas: HTMLCanvasElement,
    track: Track,
    opts: { maxDpr?: number } = {}
  ) {
    this.maxDpr = opts.maxDpr ?? 2;
    this.look = LOOKS[track.def.theme] ?? LOOKS.campo;
    this.worldW = track.worldW;
    this.worldH = track.worldH;
    this.cx = track.worldW / 2;
    this.cz = track.worldH / 2;
    const L = this.look;
    // Bigger worlds see a bit farther before the haze.
    const far = Math.max(1, Math.min(1.4, track.worldW / 1800));
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(L.horizon);
    this.scene.fog = new THREE.Fog(L.horizon, L.fogNear * far, L.fogFar * far);
    this.scene.add(new THREE.HemisphereLight(L.hemi[0], L.hemi[1], L.hemi[2]));
    const sun = new THREE.DirectionalLight(L.sun[0], L.sun[1]);
    sun.position.set(L.sunDir[0] * 1000, L.sunDir[1] * 1000, L.sunDir[2] * 1000);
    this.scene.add(sun);
    this.glow = glowTexture();
    this.smokeColor = new THREE.Color(L.smoke);
    this.scene.add(this.smoke.points, this.sparks.points, this.flames.points);
    this.build(track);
  }

  private build(track: Track) {
    const L = this.look;
    const nm = trackNormals(track);
    const w = track.def.width;
    const rand = mulberry32(Math.round(track.length) * 7919 + track.xs.length);

    this.buildSky(rand);

    // Ground.
    const ground = groundTexture(L.ground);
    ground.repeat.set(90, 90);
    const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ map: ground }));
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.set(this.cx, 0, this.cz);
    this.scene.add(groundMesh);

    // Runoff, asphalt, curbs inside the edge, center dashes, walls.
    const unlit = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const asphaltMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, map: grainTexture() });
    const runoff = new THREE.Color(L.runoff);
    const asphalt = new THREE.Color(L.asphalt[0]);
    const asphaltDark = new THREE.Color(L.asphalt[1]);
    const curbA = new THREE.Color(L.curb[0]);
    const curbB = new THREE.Color(L.curb[1]);
    const white = new THREE.Color(L.night ? 0xcbd5e1 : 0xf8fafc);
    const block = (i: number, size: number) => Math.floor(track.cum[i] / size) % 2 === 0;
    this.scene.add(new THREE.Mesh(band(track, nm, w / 2, w / 2 + 26, 0.3, () => runoff), unlit));
    this.scene.add(new THREE.Mesh(band(track, nm, 0, w / 2, ROAD_Y, (i) => (block(i, 40) ? asphalt : asphaltDark)), asphaltMat));
    this.scene.add(new THREE.Mesh(band(track, nm, w / 2 - 9, w / 2, ROAD_Y + 0.15, (i) => (block(i, 18) ? curbA : curbB)), unlit));
    // Thin white edge line just inside the curbs.
    this.scene.add(new THREE.Mesh(band(track, nm, w / 2 - 12, w / 2 - 10, ROAD_Y + 0.12, () => white), unlit));
    this.scene.add(new THREE.Mesh(band(track, nm, -1.5, 1.5, ROAD_Y + 0.15, (i) => (block(i, 26) ? white : null), false), unlit));
    this.scene.add(new THREE.Mesh(walls(track, nm, w / 2 + 3, 9, L.wall), unlit));

    // What holds the raised road up: banks, bridge decks and pillars.
    const over = bridgeSamples(track);
    const lit = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
    const concrete = new THREE.Color(L.night ? 0x64748b : 0xa8b3c2);
    this.scene.add(new THREE.Mesh(embankments(track, nm, over, new THREE.Color(L.ground[0]), concrete), lit));
    const pillars = pillarSpots(track, over);
    if (pillars.length) {
      const geo = new THREE.CylinderGeometry(7, 9, 1, 10);
      geo.translate(0, 0.5, 0);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: concrete }), pillars.length);
      const m = new THREE.Matrix4();
      pillars.forEach(([x, z, h], i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1))));
      this.scene.add(mesh);
    }

    // Ramps and boost pads.
    const rampMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
    for (const r of track.ramps) this.scene.add(new THREE.Mesh(rampGeometry(track, r), rampMat));
    if (track.boosts.length) {
      this.arrows = arrowTexture();
      const mat = new THREE.MeshBasicMaterial({ map: this.arrows, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      for (const b of track.boosts) {
        const pad = new THREE.Mesh(boostGeometry(track, b), mat);
        pad.renderOrder = 1;
        this.scene.add(pad);
      }
    }

    this.buildStart(track, w);
    const stand = this.buildGrandstand(track, nm, w, rand);
    if (L.night) this.buildLamps(track, nm, w);
    this.buildScenery(track, w, rand, stand);
  }

  private buildSky(rand: () => number) {
    const L = this.look;
    const { cx, cz } = this;
    const geo = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
    const top = new THREE.Color(L.skyTop);
    const hor = new THREE.Color(L.horizon);
    const pos = geo.attributes.position;
    const colors: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, pos.getY(i) / SKY_RADIUS);
      c.copy(hor).lerp(top, Math.pow(t, 0.55));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.position.set(cx, 0, cz);
    sky.renderOrder = -1;
    this.scene.add(sky);

    // Sun or moon, with a halo.
    const dir = new THREE.Vector3(...L.sunDir).normalize();
    const disc = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glow,
        color: L.night ? 0xe0e7ff : L.sun[0],
        fog: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    disc.position.set(cx + dir.x * 4600, dir.y * 4600, cz + dir.z * 4600);
    disc.scale.setScalar(L.night ? 380 : 900);
    this.scene.add(disc);

    if (L.night) {
      const stars: number[] = [];
      for (let i = 0; i < 700; i++) {
        const a = rand() * Math.PI * 2;
        const y = 0.12 + rand() * 0.88;
        const r = Math.sqrt(1 - y * y);
        stars.push(cx + Math.cos(a) * r * 4800, y * 4800, cz + Math.sin(a) * r * 4800);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(stars, 3));
      this.scene.add(
        new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }))
      );
    }

    if (L.clouds > 0) {
      const puffs = new THREE.InstancedMesh(
        new THREE.IcosahedronGeometry(1, 1),
        new THREE.MeshLambertMaterial({ color: L.cloud, flatShading: true, fog: false, emissive: L.cloud, emissiveIntensity: 0.35 }),
        L.clouds * 4
      );
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      let k = 0;
      for (let i = 0; i < L.clouds; i++) {
        const a = rand() * Math.PI * 2;
        const r = 1200 + rand() * 2600;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const y = 650 + rand() * 500;
        for (let p = 0; p < 4; p++) {
          const s = 70 + rand() * 90;
          m.compose(new THREE.Vector3(x + (p - 1.5) * 85 + rand() * 30, y + rand() * 25, z + rand() * 60), q, new THREE.Vector3(s * 1.4, s * 0.55, s));
          puffs.setMatrixAt(k++, m);
        }
      }
      const holder = new THREE.Group();
      holder.position.set(cx, 0, cz);
      holder.add(puffs);
      this.clouds = holder;
      this.scene.add(holder);
    }

    if (L.scenery === "nieve") {
      const n = 2200;
      const p = new Float32Array(n * 3);
      this.snowVel = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        p[i * 3] = -400 + rand() * (this.worldW + 800);
        p[i * 3 + 1] = rand() * 520;
        p[i * 3 + 2] = -300 + rand() * (this.worldH + 600);
        this.snowVel[i] = 25 + rand() * 30;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(p, 3));
      this.snow = new THREE.Points(
        g,
        new THREE.PointsMaterial({ color: 0xffffff, size: 3.2, map: this.glow, transparent: true, depthWrite: false, opacity: 0.95 })
      );
      this.snow.frustumCulled = false;
      this.scene.add(this.snow);
    }
  }

  /** Checkered line, the gantry with the banner and the start lights. */
  private buildStart(track: Track, w: number) {
    const sx = track.xs[0];
    const sz = track.ys[0];
    const angle = -Math.atan2(track.ys[1] - track.ys[0], track.xs[1] - track.xs[0]);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(14, w), new THREE.MeshBasicMaterial({ map: checkerTexture(2, Math.round(w / 9)) }));
    line.rotation.x = -Math.PI / 2;
    line.position.y = ROAD_Y + 0.25;
    const lineHolder = new THREE.Group();
    lineHolder.add(line);
    lineHolder.position.set(sx, 0, sz);
    lineHolder.rotation.y = angle;
    this.scene.add(lineHolder);

    const gantry = new THREE.Group();
    const postMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    for (const side of [1, -1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(5, 64, 5), postMat);
      post.position.set(0, 32, side * (w / 2 + 8));
      gantry.add(post);
    }
    const bannerTex = canvasTexture(512, 64, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 512, 0);
      g.addColorStop(0, "#6d28d9");
      g.addColorStop(1, "#db2777");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 64);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 44px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("TALO · LARGADA", 256, 34);
    });
    // Local x runs along the track, so the ±x faces are the ones drivers see.
    const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTex });
    const banner = new THREE.Mesh(new THREE.BoxGeometry(4, 14, w + 20), [bannerMat, bannerMat, postMat, postMat, postMat, postMat]);
    banner.position.set(0, 58, 0);
    gantry.add(banner);

    // Start lights, facing the grid (which is behind the line, at -x).
    const housing = new THREE.Mesh(new THREE.BoxGeometry(3, 9, 52), new THREE.MeshLambertMaterial({ color: 0x0f172a }));
    housing.position.set(-1, 70, 0);
    gantry.add(housing);
    const bulb = new THREE.CircleGeometry(3, 16);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x1e1b1b });
      const b = new THREE.Mesh(bulb, mat);
      b.position.set(-2.6, 70, -18 + i * 12);
      b.rotation.y = -Math.PI / 2;
      gantry.add(b);
      this.lights.push(mat);
    }
    gantry.position.set(sx, 0, sz);
    gantry.rotation.y = angle;
    this.scene.add(gantry);
  }

  /**
   * Stands full of people next to the start, on whichever side has room
   * (another part of the track may run close by). Returns where it went, so
   * no tree grows inside it.
   */
  private buildGrandstand(track: Track, nm: Normals, w: number, rand: () => number): [number, number] | null {
    const n = track.xs.length;
    const i0 = 6 % n;
    const tx = track.xs[(i0 + 1) % n] - track.xs[i0];
    const ty = track.ys[(i0 + 1) % n] - track.ys[i0];
    const tl = Math.hypot(tx, ty) || 1;
    const depth = 64;
    const gap = w / 2 + 34;
    const free = (x: number, z: number, r: number) => {
      for (let i = 0; i < n; i++) if (Math.hypot(track.xs[i] - x, track.ys[i] - z) < r) return false;
      return true;
    };
    for (const side of [1, -1]) {
      const ox = track.xs[i0] + nm.nx[i0] * side * (gap + depth / 2);
      const oz = track.ys[i0] + nm.ny[i0] * side * (gap + depth / 2);
      const ends = [-1, 0, 1].every((k) => free(ox + (tx / tl) * k * 100, oz + (ty / tl) * k * 100, gap + depth / 2 - 4));
      if (!ends) continue;

      const stand = new THREE.Group();
      const concrete = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
      const steps = 4;
      const crowdPos: THREE.Vector3[] = [];
      for (let k = 0; k < steps; k++) {
        const h = 6 + k * 7;
        const step = new THREE.Mesh(new THREE.BoxGeometry(190, h, depth / steps), concrete);
        const z = gap + (k + 0.5) * (depth / steps);
        step.position.set(0, h / 2, z);
        stand.add(step);
        for (let x = -90; x <= 90; x += 4.6) {
          if (rand() < 0.2) continue;
          crowdPos.push(new THREE.Vector3(x + (rand() - 0.5) * 1.5, h, z + (rand() - 0.5) * 5));
        }
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(200, 2.5, depth + 10), new THREE.MeshLambertMaterial({ color: 0x7c3aed }));
      roof.position.set(0, 50, gap + depth / 2);
      stand.add(roof);
      for (const x of [-95, 0, 95]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(3, 50, 3), concrete);
        post.position.set(x, 25, gap + depth - 2);
        stand.add(post);
      }
      // People: a shirt and a head each.
      const bodyGeo = new THREE.BoxGeometry(2.8, 4.2, 2.4);
      bodyGeo.translate(0, 2.1, 0);
      const headGeo = new THREE.BoxGeometry(2, 2, 2);
      headGeo.translate(0, 5.3, 0);
      const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial(), crowdPos.length);
      const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial(), crowdPos.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const one = new THREE.Vector3(1, 1, 1);
      const c = new THREE.Color();
      crowdPos.forEach((p, i) => {
        m.compose(p, q, one);
        bodies.setMatrixAt(i, m);
        heads.setMatrixAt(i, m);
        bodies.setColorAt(i, c.setHSL(rand(), 0.7, 0.55));
        heads.setColorAt(i, c.setHSL(0.07, 0.45, 0.35 + rand() * 0.4));
      });
      stand.add(bodies, heads);

      // Local z points away from the track: rotate so it lines up with the normal on this side.
      const angle = -Math.atan2(ty, tx);
      stand.rotation.y = side === 1 ? angle : angle + Math.PI;
      stand.position.set(track.xs[i0], 0, track.ys[i0]);
      this.scene.add(stand);
      return [ox, oz];
    }
    return null;
  }

  /** Night: street lamps along the track, each with a pool of light on the asphalt. */
  private buildLamps(track: Track, nm: Normals, w: number) {
    const n = track.xs.length;
    const spots: { x: number; y: number; z: number; px: number; pz: number }[] = [];
    let nextAt = 60;
    let side = 1;
    for (let i = 0; i < n; i++) {
      if (track.cum[i] < nextAt) continue;
      nextAt += 210;
      side = -side;
      spots.push({
        x: track.xs[i] + nm.nx[i] * side * (w / 2 + 16),
        y: track.hs[i],
        z: track.ys[i] + nm.ny[i] * side * (w / 2 + 16),
        px: track.xs[i] + nm.nx[i] * side * (w / 4),
        pz: track.ys[i] + nm.ny[i] * side * (w / 4),
      });
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    // Poles reach down to the ground, so they also stand beside the raised road.
    const poleGeo = new THREE.CylinderGeometry(1.2, 1.8, 1, 6);
    poleGeo.translate(0, 0.5, 0);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x334155 }), spots.length);
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(3.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }), spots.length);
    const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const pools = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.glow,
        color: 0xffd98a,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      spots.length
    );
    pools.renderOrder = 2;
    const halos: number[] = [];
    spots.forEach((s, i) => {
      m.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(1, s.y + 56, 1));
      poles.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(s.x, s.y + 57, s.z), q, one);
      bulbs.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(s.px, s.y + ROAD_Y + 0.45, s.pz), flat, new THREE.Vector3(170, 170, 1));
      pools.setMatrixAt(i, m);
      halos.push(s.x, s.y + 57, s.z);
    });
    const hg = new THREE.BufferGeometry();
    hg.setAttribute("position", new THREE.Float32BufferAttribute(halos, 3));
    const halo = new THREE.Points(
      hg,
      new THREE.PointsMaterial({
        map: this.glow,
        color: 0xffe2a0,
        size: 46,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.scene.add(poles, bulbs, pools, halo);
  }

  /** Trees (or cacti and rocks) away from the track, and mountains on the horizon. */
  private buildScenery(track: Track, w: number, rand: () => number, stand: [number, number] | null) {
    const L = this.look;
    const spots: [number, number, number][] = [];
    // Clear of the road and of the banks under it.
    const clear = w / 2 + 50;
    const area = (this.worldW + 1100) * (this.worldH + 900);
    const count = Math.round(((L.scenery === "desierto" ? 110 : 190) * area) / (2700 * 1800));
    for (let tries = 0; tries < count * 14 && spots.length < count; tries++) {
      const x = -550 + rand() * (this.worldW + 1100);
      const z = -450 + rand() * (this.worldH + 900);
      let ok = !stand || Math.hypot(stand[0] - x, stand[1] - z) > 150;
      for (let i = 0; ok && i < track.xs.length; i += 2) {
        if (Math.hypot(track.xs[i] - x, track.ys[i] - z) < clear + track.hs[i] * BANK_SPREAD) ok = false;
      }
      if (ok) spots.push([x, z, 0.7 + rand() * 0.8]);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const s3 = new THREE.Vector3();
    const tint = new THREE.Color();

    const place = (mesh: THREE.InstancedMesh, list: [number, number, number][], y: (s: number) => number, color?: (i: number) => THREE.Color) => {
      list.forEach(([x, z, s], i) => {
        q.setFromAxisAngle(up, (x * 13 + z * 7) % (Math.PI * 2));
        m.compose(v.set(x, y(s), z), q, s3.set(s, s, s));
        mesh.setMatrixAt(i, m);
        if (color) mesh.setColorAt(i, color(i));
      });
      // Instance colors multiply the material's: keep it white when they're set.
      if (color) (mesh.material as THREE.MeshLambertMaterial).color.set(0xffffff);
      this.scene.add(mesh);
    };

    if (L.scenery === "desierto") {
      const cacti = spots.filter((_, i) => i % 3 !== 0);
      const rocks = spots.filter((_, i) => i % 3 === 0);
      const arm = (x: number, h: number, lift: number) => {
        const out = new THREE.CylinderGeometry(2.4, 2.4, 9, 6);
        out.rotateZ(Math.PI / 2);
        out.translate(x / 2, h, 0);
        const rise = new THREE.CylinderGeometry(2.4, 2.4, lift, 6);
        rise.translate(x, h + lift / 2, 0);
        return [out, rise];
      };
      const trunk = new THREE.CylinderGeometry(3.6, 4, 40, 7);
      trunk.translate(0, 20, 0);
      const cactusGeo = mergeGeometries([trunk, ...arm(9, 16, 12), ...arm(-9, 24, 9)]);
      place(new THREE.InstancedMesh(cactusGeo, new THREE.MeshLambertMaterial({ color: 0x4d7c2f }), cacti.length), cacti, () => 0);
      place(
        new THREE.InstancedMesh(new THREE.DodecahedronGeometry(9, 0), new THREE.MeshLambertMaterial({ color: 0xa8714a, flatShading: true }), rocks.length),
        rocks,
        (s) => 4 * s,
        () => tint.setHSL(0.07, 0.35, 0.38 + rand() * 0.15)
      );
    } else {
      const snowy = L.scenery === "nieve";
      const pines = L.scenery === "nieve" ? spots : spots.filter((_, i) => i % 3 !== 0);
      const round = L.scenery === "nieve" ? [] : spots.filter((_, i) => i % 3 === 0);
      const crownColor = L.night ? 0x0f3b24 : 0x166534;
      const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(3, 4, 14, 6), new THREE.MeshLambertMaterial({ color: 0x7c4a1e }), spots.length);
      place(trunks, spots, (s) => 7 * s);
      place(
        new THREE.InstancedMesh(new THREE.ConeGeometry(16, 46, 7), new THREE.MeshLambertMaterial({ color: snowy ? 0x1f5139 : crownColor }), pines.length),
        pines,
        (s) => 34 * s,
        () => tint.set(snowy ? 0x1f5139 : crownColor).offsetHSL(0, 0, (rand() - 0.5) * 0.08)
      );
      if (snowy) {
        place(
          new THREE.InstancedMesh(new THREE.ConeGeometry(9.5, 19, 7), new THREE.MeshLambertMaterial({ color: 0xf8fafc }), pines.length),
          pines,
          (s) => 48 * s
        );
      }
      if (round.length) {
        place(
          new THREE.InstancedMesh(new THREE.IcosahedronGeometry(15, 0), new THREE.MeshLambertMaterial({ color: crownColor, flatShading: true }), round.length),
          round,
          (s) => 26 * s,
          () => tint.set(L.night ? 0x14432a : 0x2f8a3a).offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.1)
        );
      }
    }

    const peaks = 30;
    const mountains = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), new THREE.MeshLambertMaterial({ flatShading: true }), peaks);
    const caps = L.snowCaps
      ? new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), new THREE.MeshLambertMaterial({ color: 0xf8fafc, flatShading: true }), peaks)
      : null;
    for (let i = 0; i < peaks; i++) {
      const a = (i / peaks) * Math.PI * 2 + rand() * 0.2;
      const r = Math.hypot(this.worldW, this.worldH) / 2 + 1350 + rand() * 600;
      const h = 260 + rand() * 380;
      const s = 380 + rand() * 300;
      const x = this.cx + Math.cos(a) * r;
      const z = this.cz + Math.sin(a) * r;
      q.identity();
      m.compose(v.set(x, h / 2, z), q, s3.set(s, h, s));
      mountains.setMatrixAt(i, m);
      mountains.setColorAt(i, tint.set(L.mountain).offsetHSL(0, 0, (rand() - 0.5) * 0.08));
      if (caps) {
        // A slightly fatter copy of the tip, so it sits on the slopes without flickering.
        const k = 0.34;
        m.compose(v.set(x, h - (h * k) / 2 + 0.5, z), q, s3.set(s * k * 1.06, h * k, s * k * 1.06));
        caps.setMatrixAt(i, m);
      }
    }
    this.scene.add(mountains);
    if (caps) this.scene.add(caps);
  }

  /** Makes the scene's cars match `cars` (key → color and name label). */
  setCars(cars: Record<string, { color: string; label?: string }>) {
    for (const [key, obj] of this.cars) {
      if (!(key in cars)) {
        this.scene.remove(obj.group);
        disposeTree(obj.group);
        this.cars.delete(key);
      }
    }
    for (const [key, info] of Object.entries(cars)) {
      if (this.cars.has(key)) continue;
      const parts = carMesh(info.color, this.look.night, this.glow);
      const label = info.label ? labelSprite(info.label, info.color) : null;
      if (label) parts.group.add(label);
      this.scene.add(parts.group);
      this.cars.set(key, {
        ...parts,
        label,
        forward: 0,
        lateral: 0,
        heading: 0,
        z: 0,
        ground: 0,
        bump: 0,
        steer: 0,
        brake: 0,
        lastForward: 0,
        lastHeading: NaN,
        lastZ: NaN,
        lastGround: NaN,
        pitch: 0,
        groundPitch: 0,
        shake: 0,
        smokeAcc: 0,
        flameAcc: 0,
      });
    }
  }

  setPose(key: string, pose: CarPoseInput) {
    const car = this.cars.get(key);
    if (!car) return;
    const fx = Math.cos(pose.heading);
    const fy = Math.sin(pose.heading);
    car.z = pose.z ?? 0;
    car.ground = Math.min(car.z, pose.ground ?? car.z);
    car.group.position.set(pose.x, car.z, pose.y);
    car.group.rotation.y = -pose.heading;
    car.heading = pose.heading;
    car.forward = pose.vx * fx + pose.vy * fy;
    car.lateral = -pose.vx * fy + pose.vy * fx;
    car.bump = pose.bump ?? 0;
  }

  /** A hit (wall or another car): a burst of sparks and a camera shake. */
  impact(key: string, strength: number) {
    const car = this.cars.get(key);
    if (!car) return;
    const k = Math.min(1, strength / 300);
    car.shake = Math.max(car.shake, 0.25 + k * 0.5);
    const p = car.group.position;
    const fx = Math.cos(car.heading);
    const fz = Math.sin(car.heading);
    for (let i = 0; i < 6 + k * 18; i++) {
      const a = this.rand() * Math.PI * 2;
      const sp = 40 + this.rand() * 120;
      this.sparks.spawn(
        p.x + fx * 14,
        p.y + 6,
        p.z + fz * 14,
        Math.cos(a) * sp,
        40 + this.rand() * 90,
        Math.sin(a) * sp,
        this.sparkColors[i % 3],
        2.5 + this.rand() * 2,
        0.35 + this.rand() * 0.35,
        1,
        -2,
        car.ground
      );
    }
  }

  setStartLights(state: StartLights) {
    this.lights.forEach((mat, i) => {
      if (state === "go") mat.color.set(0x22e36b);
      else mat.color.set(i < state ? 0xff2020 : 0x1e1b1b);
    });
  }

  /** Wheels, steering, pitch, brake lights, smoke, sparks and flames; then the ambience. */
  private update(dt: number) {
    if (dt <= 0) return;
    const ease = (k: number) => 1 - Math.exp(-dt * k);
    for (const car of this.cars.values()) {
      // Wheels roll with the speed; front wheels follow how fast the car turns.
      for (const w of car.wheels) w.rotation.z -= (car.forward * dt) / WHEEL_R;
      if (!Number.isNaN(car.lastHeading)) {
        let d = car.heading - car.lastHeading;
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        const target = Math.max(-1, Math.min(1, d / dt / 2.4));
        car.steer += (target - car.steer) * ease(12);
      }
      car.lastHeading = car.heading;
      for (const s of car.steering) s.rotation.y = -car.steer * 0.45;

      // Pitch from how fast the car (and the road under it) goes up or down.
      const run = Math.max(80, Math.abs(car.forward));
      const lift = car.z - car.ground;
      if (!Number.isNaN(car.lastZ)) {
        const clamp = (v: number) => Math.max(-0.45, Math.min(0.45, v));
        const climb = clamp(Math.atan2((car.ground - car.lastGround) / dt, run));
        car.groundPitch += (climb - car.groundPitch) * ease(10);
        const target = lift > 1 ? clamp(Math.atan2((car.z - car.lastZ) / dt, run) * 0.8) : car.groundPitch;
        car.pitch += (target - car.pitch) * ease(lift > 1 ? 5 : 14);
        // Touching down after a real jump: a puff of dust and a jolt.
        if (car.lastZ - car.lastGround > 10 && lift < 1) {
          const p = car.group.position;
          for (let i = 0; i < 14; i++) {
            const a = this.rand() * Math.PI * 2;
            this.smoke.spawn(
              p.x + Math.cos(a) * 10,
              car.ground + 2,
              p.z + Math.sin(a) * 10,
              Math.cos(a) * 60,
              10 + this.rand() * 15,
              Math.sin(a) * 60,
              this.smokeColor,
              9,
              0.7 + this.rand() * 0.4,
              0.4,
              22,
              car.ground
            );
          }
          car.shake = Math.max(car.shake, 0.25);
        }
      }
      car.lastZ = car.z;
      car.lastGround = car.ground;
      car.body.rotation.z = car.pitch;
      car.floor.rotation.z = car.groundPitch;
      car.floor.position.y = -lift;
      // The shadow spreads and fades the higher the car flies.
      const spread = 1 + Math.min(1, lift / 60) * 0.6;
      car.floor.scale.set(spread, 1, spread);
      car.shadow.opacity = 0.55 / (spread * spread);

      const decel = (car.lastForward - car.forward) / dt;
      car.lastForward = car.forward;
      const braking = car.forward > 20 && decel > 260 && lift < 1 ? 1 : 0;
      car.brake += (braking - car.brake) * ease(14);
      car.tail.color.copy(TAIL_OFF).lerp(TAIL_ON, car.brake);

      const p = car.group.position;
      const fx = Math.cos(car.heading);
      const fz = Math.sin(car.heading);
      const slip = Math.abs(car.lateral);
      if (slip > 55 && Math.abs(car.forward) > 60 && lift < 1) {
        car.smokeAcc += dt * Math.min(40, (slip - 40) * 0.35);
        while (car.smokeAcc >= 1) {
          car.smokeAcc -= 1;
          for (const side of [1, -1]) {
            this.smoke.spawn(
              p.x - fx * 11 - fz * side * 9 + (this.rand() - 0.5) * 3,
              p.y + 2,
              p.z - fz * 11 + fx * side * 9 + (this.rand() - 0.5) * 3,
              -fx * 20 + (this.rand() - 0.5) * 18,
              6 + this.rand() * 8,
              -fz * 20 + (this.rand() - 0.5) * 18,
              this.smokeColor,
              7,
              0.9 + this.rand() * 0.5,
              0.32,
              16,
              car.ground
            );
          }
        }
      } else {
        car.smokeAcc = 0;
      }
      if (car.bump > 0 && this.rand() < 0.7) {
        const a = this.rand() * Math.PI * 2;
        this.sparks.spawn(
          p.x,
          p.y + 4,
          p.z,
          Math.cos(a) * 70,
          50 + this.rand() * 50,
          Math.sin(a) * 70,
          this.sparkColors[Math.floor(this.rand() * 3)],
          2.5,
          0.3,
          1,
          -2,
          car.ground
        );
      }
      // Boosting (faster than the engine alone can go): flames out of the exhausts.
      if (car.forward > MAX_SPEED * 1.06) {
        car.flameAcc += dt * 90;
        const back = CAR_LENGTH / 2 + 2;
        const up = p.y + 6 - Math.sin(car.pitch) * back;
        while (car.flameAcc >= 1) {
          car.flameAcc -= 1;
          for (const side of [1, -1]) {
            this.flames.spawn(
              p.x - fx * back - fz * side * 4.5,
              up,
              p.z - fz * back + fx * side * 4.5,
              car.forward * fx * 0.6 - fx * 120 + (this.rand() - 0.5) * 20,
              (this.rand() - 0.2) * 20,
              car.forward * fz * 0.6 - fz * 120 + (this.rand() - 0.5) * 20,
              this.flameColors[this.rand() < 0.15 ? 2 : Math.floor(this.rand() * 2)],
              5 + this.rand() * 3,
              0.12 + this.rand() * 0.1,
              0.95,
              -14,
              car.ground
            );
          }
        }
      } else {
        car.flameAcc = 0;
      }
      car.shake = Math.max(0, car.shake - dt);
    }
    this.smoke.update(dt);
    this.sparks.update(dt);
    this.flames.update(dt);
    if (this.arrows) this.arrows.offset.y -= dt * 2.2;

    if (this.clouds) this.clouds.rotation.y += dt * 0.004;
    if (this.snow && this.snowVel) {
      const pos = this.snow.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const t = performance.now() / 1000;
      for (let i = 0; i < this.snowVel.length; i++) {
        arr[i * 3 + 1] -= this.snowVel[i] * dt;
        arr[i * 3] += Math.sin(t + i) * 6 * dt;
        if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] += 520;
      }
      pos.needsUpdate = true;
    }
  }

  /** Draws one view per request (1 full, 2 side by side, 3–4 in a grid). */
  render(views: ViewRequest[], mode: CameraMode, dt: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (!cw || !ch) return;
    if (this.renderer.getPixelRatio() !== dpr) this.renderer.setPixelRatio(dpr);
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== cw || size.y !== ch) this.renderer.setSize(cw, ch, false);
    this.update(dt);

    const n = Math.max(1, views.length);
    const cols = n === 1 ? 1 : 2;
    const rows = n <= 2 ? 1 : 2;
    const vw = cw / cols;
    const vh = ch / rows;
    // Clear everything first: with 3 views the fourth quadrant stays empty.
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, cw, ch);
    this.renderer.clear();
    this.renderer.setScissorTest(n > 1);
    views.forEach((view, i) => {
      const x = (i % cols) * vw;
      const yTop = Math.floor(i / cols) * vh;
      const rig = this.rig(view.key);
      this.aim(rig, view.key, mode, dt, vw / vh);
      // Particles are sized in world units: convert for this view's height.
      const scale = (vh * dpr) / (2 * Math.tan((rig.camera.fov * Math.PI) / 360));
      this.smoke.setScale(scale);
      this.sparks.setScale(scale);
      this.flames.setScale(scale);
      const own = this.cars.get(view.key);
      // Your own name tag would float in front of the camera.
      if (own?.label) own.label.visible = false;
      this.renderer.setViewport(x, ch - yTop - vh, vw, vh);
      this.renderer.setScissor(x, ch - yTop - vh, vw, vh);
      this.renderer.render(this.scene, rig.camera);
      if (own?.label) own.label.visible = true;
    });
  }

  private rig(key: string): Rig {
    let rig = this.rigs.get(key);
    if (!rig) {
      rig = { camera: new THREE.PerspectiveCamera(68, 1, 2, 7500), pos: new THREE.Vector3(), look: new THREE.Vector3(), ready: false };
      this.rigs.set(key, rig);
    }
    return rig;
  }

  private aim(rig: Rig, key: string, mode: CameraMode, dt: number, aspect: number) {
    const car = this.cars.get(key);
    const cam = rig.camera;
    if (!car) {
      // Nothing to follow: a slow aerial orbit around the track.
      const a = performance.now() / 14000;
      const r = Math.max(900, this.worldW * 0.55);
      cam.position.set(this.cx + Math.cos(a) * r, r, this.cz + Math.sin(a) * r);
      cam.lookAt(this.cx, 0, this.cz);
      if (cam.aspect !== aspect || cam.fov !== 60) {
        cam.aspect = aspect;
        cam.fov = 60;
        cam.updateProjectionMatrix();
      }
      return;
    }
    const p = car.group.position;
    const h = car.heading;
    const fx = Math.cos(h);
    const fz = Math.sin(h);
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    if (mode === "cabina") {
      const tilt = Math.tan(car.pitch);
      pos = new THREE.Vector3(p.x + fx * 2, p.y + 15 + tilt * 2, p.z + fz * 2);
      look = new THREE.Vector3(p.x + fx * 80, p.y + 9 + tilt * 80, p.z + fz * 80);
    } else {
      // Behind and above, following the slope; in a jump it rises less than the car.
      const slope = Math.tan(car.groundPitch);
      const y = car.ground + (p.y - car.ground) * 0.6;
      pos = new THREE.Vector3(p.x - fx * 70, y + 30 - slope * 70, p.z - fz * 70);
      look = new THREE.Vector3(p.x + fx * 35, p.y + 8 + slope * 35, p.z + fz * 35);
    }
    if (!rig.ready || mode === "cabina") {
      rig.pos.copy(pos);
      rig.look.copy(look);
      rig.ready = true;
    } else {
      const k = 1 - Math.exp(-dt * 9);
      rig.pos.lerp(pos, k);
      rig.look.lerp(look, k);
    }
    cam.position.copy(rig.pos);
    if (car.shake > 0) {
      const s = car.shake * 3;
      cam.position.x += (this.rand() - 0.5) * s;
      cam.position.y += (this.rand() - 0.5) * s;
      cam.position.z += (this.rand() - 0.5) * s;
    }
    cam.lookAt(rig.look);
    // Wider the faster, and wider still with a boost.
    const fov = 66 + Math.min(22, (Math.abs(car.forward) / MAX_SPEED) * 14 + Math.max(0, car.forward / MAX_SPEED - 1) * 30);
    if (cam.aspect !== aspect || Math.abs(cam.fov - fov) > 0.1) {
      cam.aspect = aspect;
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  dispose() {
    disposeTree(this.scene);
    this.glow.dispose();
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
      // The shared glow texture is disposed once, by the scene.
      if (map && map.name !== "glow") map.dispose();
      mat.dispose();
    }
  });
}
