import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Quality } from "./postfx";
import {
  DECORATIONS,
  FILLINGS,
  FROSTINGS,
  SPONGES,
  type Cake,
  type Decoration,
  type Shape,
} from "./bakery";
import { mulberry32 } from "./random";

/**
 * The Pastelería's 3D scene (three.js, browser only): a fantasy kitchen
 * counter with a cake stand, and the cake built from `Cake` piece by piece.
 * Each part (layers, frosting, each decoration) is its own group, rebuilt
 * only when its inputs change and animated in (`pop`), so every choice shows
 * at once. Toy-like look: rounded shapes, pastel glossy materials, warm light.
 *
 * Kept light for phones: one directional light (shadows only on "alta"),
 * primitives and small canvas textures, no post-processing. The constructor
 * throws if WebGL isn't available (the page then draws the 2D cake).
 */

const LAYER_H = 0.42;
const FILLING_H = 0.09;
const R = 1; // round cake radius / half side of the square one
const PLATE_TOP = 0.86;
const TAU = Math.PI * 2;

type Anim = { t: number; dur: number; kind: "pop" | "drop" };

function easeOutBack(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** A vertical gradient (sky behind the kitchen). */
function gradientTexture(stops: [number, string][]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Rounded tiles for the back wall. */
function tileTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f9e1ec";
  ctx.fillRect(0, 0, 128, 128);
  const colors = ["#fde4ef", "#e9e3fb", "#ddf3fb", "#fff3d6"];
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      ctx.fillStyle = colors[(x + y * 2) % colors.length];
      ctx.beginPath();
      ctx.roundRect(x * 64 + 4, y * 64 + 4, 56, 56, 12);
      ctx.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 4);
  return t;
}

/** Soft crumb speckles, tinted by each sponge's material color. */
function crumbTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 128, 128);
  const rand = mulberry32(11);
  for (let i = 0; i < 420; i++) {
    const v = 200 + Math.floor(rand() * 55);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.arc(rand() * 128, rand() * 128, 0.6 + rand() * 1.6, 0, TAU);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

/** A soft round dot for the confetti and the candle glow. */
function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,0.8)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** A disc with rounded edges, as a lathe (cake layers, plates). */
function roundedDisc(r: number, h: number, bevel: number, segments = 48): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - bevel + Math.cos(a) * bevel, bevel + Math.sin(a) * bevel));
  }
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - bevel + Math.cos(a) * bevel, h - bevel + Math.sin(a) * bevel));
  }
  pts.push(new THREE.Vector2(0, h));
  return new THREE.LatheGeometry(pts, segments);
}

function starShape(outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / 2 + (i / 10) * TAU;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i) s.lineTo(x, y);
    else s.moveTo(x, y);
  }
  s.closePath();
  return s;
}

/** Points along the top edge of the cake (circle or rounded square), `n` of them. */
function ringPoints(shape: Shape, n: number, inset: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + Math.PI / 4;
    if (shape === "redonda") out.push([Math.cos(a) * (R - inset), Math.sin(a) * (R - inset)]);
    else {
      // Project the circle onto the square's outline.
      const c = Math.cos(a);
      const s = Math.sin(a);
      const k = (R - inset) / Math.max(Math.abs(c), Math.abs(s));
      out.push([c * k, s * k]);
    }
  }
  return out;
}

const SPRINKLE_COLORS = ["#f472b6", "#60a5fa", "#facc15", "#34d399", "#a78bfa", "#fb923c"];
const FLOWER_COLORS = ["#f9a8d4", "#c4b5fd", "#fde68a", "#99f6e4", "#fecaca"];
const CANDLE_COLORS = ["#7dd3fc", "#f9a8d4", "#fde68a", "#a7f3d0", "#c4b5fd"];

interface Part {
  group: THREE.Group;
  key: string;
  anim: Anim | null;
}

export class BakeryScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  private turntable = new THREE.Group();
  private cakeRoot = new THREE.Group();
  private parts = new Map<string, Part>();
  private raf = 0;
  private last = 0;
  private paused = false;
  private disposed = false;
  private high: boolean;
  private reduced: boolean;
  private crumb: THREE.CanvasTexture;
  private dot: THREE.CanvasTexture;
  private textures: THREE.Texture[] = [];
  private spin = 0;
  private spinVel = 0;
  private dragging = false;
  private hop: { t: number; kind: "win" | "wrong" | "out" } | null = null;
  private confetti: { points: THREE.Points; vel: Float32Array; life: number } | null = null;
  private flames: THREE.Object3D[] = [];
  private topY = PLATE_TOP;
  private cakeShape: Shape = "redonda";

  constructor(
    private canvas: HTMLCanvasElement,
    opts: { quality?: Quality; reducedMotion?: boolean } = {}
  ) {
    this.high = (opts.quality ?? "alta") === "alta";
    this.reduced = !!opts.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "default" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.high ? 2 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    if (this.high) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.crumb = crumbTexture();
    this.dot = dotTexture();
    this.textures.push(this.crumb, this.dot);
    this.buildKitchen();
    this.scene.add(this.turntable);
    this.turntable.add(this.cakeRoot);
    this.camera.position.set(0, 3.7, 6.4);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---- Materials -----------------------------------------------------------

  /** Glossy toy plastic / icing. */
  private glossy(color: THREE.ColorRepresentation, opts: { rough?: number; emissive?: THREE.ColorRepresentation } = {}) {
    if (this.high) {
      return new THREE.MeshPhysicalMaterial({
        color,
        roughness: opts.rough ?? 0.35,
        clearcoat: 0.7,
        clearcoatRoughness: 0.25,
        emissive: opts.emissive ?? 0x000000,
      });
    }
    return new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.4, emissive: opts.emissive ?? 0x000000 });
  }

  private matte(color: THREE.ColorRepresentation, map?: THREE.Texture) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.85, map: map ?? null });
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = this.high && cast;
    m.receiveShadow = this.high;
    return m;
  }

  // ---- Kitchen -------------------------------------------------------------

  private buildKitchen() {
    const sky = gradientTexture([
      [0, "#fbcfe8"],
      [0.5, "#e9d5ff"],
      [1, "#fff1dc"],
    ]);
    this.textures.push(sky);
    this.scene.background = sky;

    const hemi = new THREE.HemisphereLight(0xfff1f8, 0xf6e7c8, 1.5);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.1);
    sun.position.set(3.5, 7, 4.5);
    if (this.high) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      const c = sun.shadow.camera;
      c.left = -4;
      c.right = 4;
      c.top = 4;
      c.bottom = -4;
      c.near = 1;
      c.far = 20;
      sun.shadow.bias = -0.0015;
      sun.shadow.radius = 4;
    }
    this.scene.add(sun);

    // Back wall with pastel tiles and a shelf.
    const tiles = tileTexture();
    this.textures.push(tiles);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(26, 10), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.9 }));
    wall.position.set(0, 4, -4.5);
    wall.receiveShadow = this.high;
    this.scene.add(wall);

    const shelf = this.mesh(new RoundedBoxGeometry(7, 0.18, 0.9, 2, 0.06), this.glossy("#fbcfe8"), false);
    shelf.position.set(0, 4.3, -4.0);
    this.scene.add(shelf);
    const jarColors = ["#fca5a5", "#fde68a", "#a7f3d0", "#bfdbfe", "#ddd6fe"];
    jarColors.forEach((color, i) => {
      const x = -2.8 + i * 1.4;
      const jar = new THREE.Group();
      const glass = new THREE.Mesh(
        roundedDisc(0.32, 0.75, 0.12, 24),
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.1 })
      );
      const candy = new THREE.Mesh(roundedDisc(0.27, 0.45, 0.1, 24), this.glossy(color));
      candy.position.y = 0.04;
      const lid = this.mesh(roundedDisc(0.34, 0.14, 0.05, 24), this.glossy(i % 2 ? "#f472b6" : "#a78bfa"), false);
      lid.position.y = 0.72;
      jar.add(candy, glass, lid);
      jar.position.set(x, 4.39, -4.0);
      this.scene.add(jar);
    });

    // Counter.
    const counter = this.mesh(new RoundedBoxGeometry(14, 1.1, 5.2, 3, 0.18), this.glossy("#b9ecd9", { rough: 0.5 }), false);
    counter.position.set(0, -0.55, -0.4);
    this.scene.add(counter);
    const top = this.mesh(new RoundedBoxGeometry(14.3, 0.22, 5.5, 3, 0.1), this.glossy("#fff7ec", { rough: 0.45 }), false);
    top.position.set(0, 0.05, -0.4);
    this.scene.add(top);

    // Cake stand (it turns with the cake).
    const stand = new THREE.Group();
    const foot = this.mesh(roundedDisc(0.62, 0.12, 0.05), this.glossy("#e9d5ff"));
    const stem = this.mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.62, 24), this.glossy("#e9d5ff"));
    stem.position.y = 0.42;
    const plate = this.mesh(roundedDisc(1.55, 0.14, 0.06, 64), this.glossy("#f5f3ff"));
    plate.position.y = 0.72;
    const rim = this.mesh(new THREE.TorusGeometry(1.52, 0.06, 10, 64), this.glossy("#ddd6fe"));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.86;
    stand.add(foot, stem, plate, rim);
    stand.position.y = 0.16;
    this.turntable.add(stand);
    this.cakeRoot.position.y = 0.16;

    // Props: mixing bowl with a whisk, rolling pin, two cupcakes.
    const bowl = this.mesh(
      new THREE.LatheGeometry(
        Array.from({ length: 12 }, (_, i) => {
          const a = (i / 11) * (Math.PI / 2);
          return new THREE.Vector2(0.15 + Math.sin(a) * 0.75, 0.75 - Math.cos(a) * 0.7);
        }),
        32
      ),
      this.glossy("#93c5fd")
    );
    (bowl.material as THREE.Material).side = THREE.DoubleSide;
    bowl.position.set(-3.6, 0.16, -0.9);
    const batter = this.mesh(new THREE.CircleGeometry(0.78, 32), this.matte("#fde7c7"), false);
    batter.rotation.x = -Math.PI / 2;
    batter.position.set(-3.6, 0.78, -0.9);
    const whisk = new THREE.Group();
    const handle = this.mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 12), this.glossy("#f472b6"));
    handle.position.y = 0.4;
    whisk.add(handle);
    for (let i = 0; i < 4; i++) {
      const loop = this.mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 24), new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.8, roughness: 0.3 }));
      loop.scale.set(0.7, 1.4, 1);
      loop.rotation.y = (i / 4) * Math.PI;
      loop.position.y = -0.1;
      whisk.add(loop);
    }
    whisk.position.set(-3.35, 0.95, -0.85);
    whisk.rotation.z = -0.5;
    this.scene.add(bowl, batter, whisk);

    const pin = new THREE.Group();
    const roll = this.mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.5, 20), this.glossy("#fde68a", { rough: 0.6 }));
    roll.rotation.z = Math.PI / 2;
    pin.add(roll);
    for (const s of [-1, 1]) {
      const h = this.mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.45, 12), this.glossy("#f9a8d4"));
      h.rotation.z = Math.PI / 2;
      h.position.x = s * 0.95;
      pin.add(h);
    }
    pin.position.set(3.4, 0.37, 0.4);
    pin.rotation.y = -0.4;
    this.scene.add(pin);

    for (const [x, z, frost] of [
      [3.1, -1.3, "#c4b5fd"],
      [4.2, -0.8, "#9fd8f5"],
    ] as [number, number, string][]) {
      const cup = new THREE.Group();
      const wrap = this.mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.42, 16), this.glossy("#fda4af"));
      wrap.position.y = 0.21;
      const top = this.mesh(new THREE.SphereGeometry(0.38, 20, 14, 0, TAU, 0, Math.PI / 2), this.glossy(frost));
      top.position.y = 0.42;
      top.scale.y = 0.9;
      const cherry = this.mesh(new THREE.SphereGeometry(0.09, 14, 10), this.glossy("#dc2626", { rough: 0.2 }));
      cherry.position.y = 0.8;
      cup.add(wrap, top, cherry);
      cup.position.set(x, 0.16, z);
      this.scene.add(cup);
    }
  }

  // ---- Cake ----------------------------------------------------------------

  /** Shows `cake`; parts whose inputs changed are rebuilt and pop in. */
  setCake(cake: Cake) {
    const shape: Shape = cake.shape ?? "redonda";
    this.cakeShape = shape;
    const hasBase = !!cake.shape && !!cake.sponge;
    const layers = hasBase ? cake.layers : 0;
    const filling = layers > 1 ? cake.filling : null;
    this.topY = PLATE_TOP + layers * LAYER_H + Math.max(0, layers - 1) * FILLING_H;

    // Only the shape so far: an empty mold shows where the cake goes.
    this.syncPart("mold", cake.shape && !cake.sponge ? shape : "", () => this.buildMold(shape), "pop");

    // Each layer is its own part, so a new one can drop in on top.
    for (let i = 0; i < MAX_PARTS_LAYERS; i++) {
      const key = i < layers ? `${shape}|${cake.sponge}|${i}` : "";
      this.syncPart(`layer${i}`, key, () => this.buildLayer(shape, cake.sponge!, i), "drop");
    }
    for (let i = 0; i < MAX_PARTS_LAYERS - 1; i++) {
      const key = i < layers - 1 && filling ? `${shape}|${filling}|${i}` : "";
      this.syncPart(`filling${i}`, key, () => this.buildFilling(shape, filling!, i), "pop");
    }
    const frostKey = hasBase && cake.frosting ? `${shape}|${cake.frosting}|${layers}` : "";
    this.syncPart("frosting", frostKey, () => this.buildFrosting(shape, cake.frosting!), "pop");

    const decos = hasBase ? cake.decorations : [];
    const frostLift = cake.frosting ? 0.08 : 0;
    for (const d of Object.keys(DECORATIONS) as Decoration[]) {
      const slot = decos.indexOf(d);
      const key = slot >= 0 ? `${shape}|${layers}|${slot}|${decos.length}|${frostLift}` : "";
      this.syncPart(`deco-${d}`, key, () => this.buildDecoration(d, shape, slot, decos.length, this.topY + frostLift), "pop");
    }
  }

  private syncPart(name: string, key: string, build: () => THREE.Group, kind: Anim["kind"]) {
    const current = this.parts.get(name);
    if (current?.key === key) return;
    if (current) {
      this.cakeRoot.remove(current.group);
      disposeTree(current.group);
      this.parts.delete(name);
      this.flames = this.flames.filter((f) => f.parent && this.isInScene(f));
    }
    if (!key) return;
    const group = build();
    this.cakeRoot.add(group);
    this.parts.set(name, { group, key, anim: this.reduced ? null : { t: 0, dur: kind === "drop" ? 0.45 : 0.35, kind } });
    if (!this.reduced) group.scale.setScalar(kind === "pop" ? 0.01 : 1);
  }

  private isInScene(o: THREE.Object3D): boolean {
    let p: THREE.Object3D | null = o;
    while (p) {
      if (p === this.scene) return true;
      p = p.parent;
    }
    return false;
  }

  private body(shape: Shape, r: number, h: number): THREE.BufferGeometry {
    if (shape === "redonda") return roundedDisc(r, h, Math.min(0.08, h / 2.2));
    const g = new RoundedBoxGeometry(r * 2, h, r * 2, 3, Math.min(0.1, h / 2.2));
    g.translate(0, h / 2, 0);
    return g;
  }

  private buildMold(shape: Shape): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, roughness: 0.2, depthWrite: false });
    const geo = this.body(shape, R, LAYER_H);
    g.add(new THREE.Mesh(geo, mat));
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 30),
      new THREE.LineBasicMaterial({ color: "#a78bfa", transparent: true, opacity: 0.8 })
    );
    g.add(edge);
    g.position.y = PLATE_TOP;
    return g;
  }

  private buildLayer(shape: Shape, sponge: NonNullable<Cake["sponge"]>, i: number): THREE.Group {
    const g = new THREE.Group();
    const mat = this.matte(SPONGES[sponge].color, this.crumb);
    const layer = this.mesh(this.body(shape, R, LAYER_H), mat);
    g.add(layer);
    g.position.y = PLATE_TOP + i * (LAYER_H + FILLING_H);
    g.userData.baseY = g.position.y;
    return g;
  }

  private buildFilling(shape: Shape, filling: NonNullable<Cake["filling"]>, i: number): THREE.Group {
    const g = new THREE.Group();
    const color = FILLINGS[filling].color;
    const band = this.mesh(this.body(shape, R + 0.035, FILLING_H), this.glossy(color, { rough: 0.3 }));
    g.add(band);
    // Little blobs squeezing out of the edge.
    for (const [x, z] of ringPoints(shape, shape === "redonda" ? 22 : 24, -0.02)) {
      const blob = this.mesh(new THREE.SphereGeometry(0.065, 10, 8), this.glossy(color, { rough: 0.3 }), false);
      blob.position.set(x, FILLING_H / 2, z);
      blob.scale.set(1, 0.75, 1);
      g.add(blob);
    }
    g.position.y = PLATE_TOP + (i + 1) * LAYER_H + i * FILLING_H;
    return g;
  }

  private buildFrosting(shape: Shape, frosting: NonNullable<Cake["frosting"]>): THREE.Group {
    const g = new THREE.Group();
    const mat = this.glossy(FROSTINGS[frosting].color, { rough: 0.22 });
    const cap = this.mesh(this.body(shape, R + 0.05, 0.1), mat);
    cap.position.y = -0.02;
    g.add(cap);
    // Drips down the side, a bit random but the same every time.
    const rand = mulberry32(shape === "redonda" ? 3 : 4);
    const n = shape === "redonda" ? 20 : 24;
    for (const [x, z] of ringPoints(shape, n, -0.04)) {
      const len = 0.12 + rand() * 0.22;
      const drip = this.mesh(new THREE.CapsuleGeometry(0.075, len, 4, 10), mat, false);
      drip.position.set(x, 0.02 - len / 2, z);
      g.add(drip);
    }
    // A soft swirl in the middle.
    const swirl = this.mesh(new THREE.TorusGeometry(0.28, 0.07, 10, 28), mat, false);
    swirl.rotation.x = Math.PI / 2;
    swirl.position.y = 0.1;
    const tip = this.mesh(new THREE.ConeGeometry(0.16, 0.22, 16), mat, false);
    tip.position.y = 0.2;
    g.add(swirl, tip);
    g.position.y = this.topY;
    return g;
  }

  /**
   * One decoration: the first one goes around the edge, a second one
   * in the middle (sprinkles cover the whole top).
   */
  private buildDecoration(d: Decoration, shape: Shape, slot: number, count: number, y: number): THREE.Group {
    const g = new THREE.Group();
    g.position.y = y;
    const outer = slot === 0 || count === 1;
    const rand = mulberry32(31 + slot);
    const spots = (n: number) => (outer ? ringPoints(shape, n, 0.24) : ringPoints("redonda", n, R - 0.32));
    switch (d) {
      case "chispas": {
        const n = this.high ? 90 : 60;
        const geo = new THREE.CapsuleGeometry(0.022, 0.07, 2, 6);
        const mat = new THREE.MeshStandardMaterial({ roughness: 0.4 });
        const inst = new THREE.InstancedMesh(geo, mat, n);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const e = new THREE.Euler();
        const color = new THREE.Color();
        for (let i = 0; i < n; i++) {
          const a = rand() * TAU;
          const r = Math.sqrt(rand()) * (R - 0.12);
          const x = shape === "redonda" ? Math.cos(a) * r : (rand() * 2 - 1) * (R - 0.12);
          const z = shape === "redonda" ? Math.sin(a) * r : (rand() * 2 - 1) * (R - 0.12);
          e.set(Math.PI / 2, rand() * TAU, 0);
          q.setFromEuler(e);
          m.compose(new THREE.Vector3(x, 0.03, z), q, new THREE.Vector3(1, 1, 1));
          inst.setMatrixAt(i, m);
          inst.setColorAt(i, color.set(SPRINKLE_COLORS[i % SPRINKLE_COLORS.length]));
        }
        g.add(inst);
        break;
      }
      case "cerezas": {
        const cherryMat = this.glossy("#dc2626", { rough: 0.15 });
        const stemMat = this.matte("#4d7c0f");
        const creamMat = this.glossy("#fff8e7", { rough: 0.3 });
        for (const [x, z] of spots(outer ? 8 : 4)) {
          const cream = this.mesh(new THREE.SphereGeometry(0.13, 14, 10), creamMat, false);
          cream.scale.y = 0.6;
          cream.position.set(x, 0.05, z);
          const cherry = this.mesh(new THREE.SphereGeometry(0.12, 16, 12), cherryMat);
          cherry.position.set(x, 0.2, z);
          const stem = this.mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), stemMat, false);
          stem.position.set(x + 0.04, 0.36, z);
          stem.rotation.z = -0.35;
          g.add(cream, cherry, stem);
        }
        break;
      }
      case "estrellas": {
        const geo = new THREE.ExtrudeGeometry(starShape(0.17, 0.075), { depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
        geo.center();
        const mat = this.glossy("#facc15", { rough: 0.2, emissive: "#6b4b00" });
        const list = outer ? spots(6) : count > 1 ? spots(3) : [[0, 0] as [number, number]];
        for (const [x, z] of list) {
          const star = this.mesh(geo, mat);
          star.position.set(x, 0.2, z);
          star.rotation.y = Math.atan2(x, z);
          star.rotation.z = (rand() - 0.5) * 0.4;
          g.add(star);
        }
        break;
      }
      case "flores": {
        const center = this.glossy("#fde047", { rough: 0.3 });
        spots(outer ? 6 : 3).forEach(([x, z], k) => {
          const petals = this.glossy(FLOWER_COLORS[k % FLOWER_COLORS.length], { rough: 0.35 });
          const flower = new THREE.Group();
          for (let p = 0; p < 5; p++) {
            const a = (p / 5) * TAU;
            const petal = this.mesh(new THREE.SphereGeometry(0.08, 10, 8), petals, false);
            petal.scale.set(1, 0.4, 0.65);
            petal.position.set(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08);
            petal.rotation.y = -a;
            flower.add(petal);
          }
          const c = this.mesh(new THREE.SphereGeometry(0.05, 10, 8), center, false);
          c.position.y = 0.02;
          flower.add(c);
          flower.position.set(x, 0.07, z);
          g.add(flower);
        });
        break;
      }
      case "velas": {
        const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffb347").multiplyScalar(1.2) });
        const glowMat = new THREE.SpriteMaterial({ map: this.dot, color: "#ffd27a", transparent: true, opacity: 0.8, depthWrite: false });
        const list: [number, number][] = outer ? spots(5) : [[0, 0], [0.18, 0.12], [-0.18, 0.12]];
        list.forEach(([x, z], k) => {
          const candle = this.mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.38, 12), this.glossy(CANDLE_COLORS[k % CANDLE_COLORS.length]));
          candle.position.set(x, 0.19, z);
          const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 4), new THREE.MeshBasicMaterial({ color: 0x333333 }));
          wick.position.set(x, 0.41, z);
          const flame = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), flameMat);
          flame.scale.set(0.8, 1.6, 0.8);
          flame.position.set(x, 0.48, z);
          flame.userData.phase = k * 1.7;
          const glow = new THREE.Sprite(glowMat);
          glow.scale.setScalar(0.32);
          glow.position.set(x, 0.48, z);
          this.flames.push(flame, glow);
          g.add(candle, wick, flame, glow);
        });
        break;
      }
    }
    return g;
  }

  // ---- Feedback --------------------------------------------------------------

  /** Right cake: a hop and a confetti burst. */
  celebrate() {
    if (this.reduced) return;
    this.hop = { t: 0, kind: "win" };
    this.burst();
  }

  /** Wrong cake: a little shake. */
  wrong() {
    if (this.reduced) return;
    this.hop = { t: 0, kind: "wrong" };
  }

  private burst() {
    if (this.confetti) {
      this.scene.remove(this.confetti.points);
      this.confetti.points.geometry.dispose();
      (this.confetti.points.material as THREE.Material).dispose();
    }
    const n = this.high ? 160 : 90;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      pos[i * 3] = 0;
      pos[i * 3 + 1] = this.topY + 0.3;
      pos[i * 3 + 2] = 0;
      const a = Math.random() * TAU;
      const sp = 1.2 + Math.random() * 2.2;
      vel[i * 3] = Math.cos(a) * sp;
      vel[i * 3 + 1] = 3 + Math.random() * 3;
      vel[i * 3 + 2] = Math.sin(a) * sp;
      c.set(SPRINKLE_COLORS[i % SPRINKLE_COLORS.length]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.16, map: this.dot, vertexColors: true, transparent: true, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.confetti = { points, vel, life: 1.8 };
  }

  // ---- Controls ----------------------------------------------------------------

  /** Turns the cake stand by a pointer drag of `dx` CSS pixels. */
  drag(dx: number) {
    this.spin += dx * 0.01;
    this.spinVel = dx * 0.6;
  }

  setDragging(on: boolean) {
    this.dragging = on;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
  }

  // ---- Loop ----------------------------------------------------------------------

  private loop(now: number) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    if (this.paused || document.hidden) return;
    this.resize();

    // Gentle idle turn, plus the leftover of a fling.
    if (!this.dragging) {
      this.spinVel *= Math.pow(0.04, dt);
      this.spin += (this.spinVel * dt) / 60 + (this.reduced ? 0 : dt * 0.25);
    }
    this.turntable.rotation.y = this.spin;

    for (const part of this.parts.values()) {
      const a = part.anim;
      if (!a) continue;
      a.t = Math.min(1, a.t + dt / a.dur);
      if (a.kind === "pop") part.group.scale.setScalar(Math.max(0.01, easeOutBack(a.t)));
      else part.group.position.y = (part.group.userData.baseY as number) + (1 - easeOutBack(a.t)) * 1.2;
      if (a.t >= 1) part.anim = null;
    }

    // Win hop / wrong shake.
    this.cakeRoot.position.y = 0.16;
    this.cakeRoot.rotation.z = 0;
    if (this.hop) {
      this.hop.t += dt;
      const t = this.hop.t;
      if (this.hop.kind === "win") {
        this.cakeRoot.position.y = 0.16 + Math.max(0, Math.sin(Math.min(1, t / 0.55) * Math.PI)) * 0.45;
        this.spin += dt * 9 * Math.max(0, 1 - t / 0.8);
        if (t > 0.9) this.hop = null;
      } else {
        this.cakeRoot.rotation.z = Math.sin(t * 40) * 0.07 * Math.max(0, 1 - t / 0.5);
        if (t > 0.5) this.hop = null;
      }
    }

    for (const f of this.flames) {
      const k = 1 + Math.sin(now / 90 + (f.userData.phase ?? 0)) * 0.12;
      if (f instanceof THREE.Sprite) f.scale.setScalar(0.32 * k);
      else f.scale.set(0.8, 1.6 * k, 0.8);
    }

    if (this.confetti) {
      const c = this.confetti;
      c.life -= dt;
      const pos = c.points.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        c.vel[i + 1] -= 7 * dt;
        arr[i] += c.vel[i] * dt;
        arr[i + 1] = Math.max(0.2, arr[i + 1] + c.vel[i + 1] * dt);
        arr[i + 2] += c.vel[i + 2] * dt;
      }
      pos.needsUpdate = true;
      (c.points.material as THREE.PointsMaterial).opacity = Math.min(1, c.life * 1.5);
      if (c.life <= 0) {
        this.scene.remove(c.points);
        c.points.geometry.dispose();
        (c.points.material as THREE.Material).dispose();
        this.confetti = null;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  /** Keeps the canvas sharp and the cake framed for any aspect ratio. */
  private resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== w || size.y !== h) this.renderer.setSize(w, h, false);
    const aspect = w / h;
    if (this.camera.aspect !== aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    // Narrow (portrait phone) screens step back so the stand fits.
    const dist = aspect < 1 ? 6.4 / Math.max(0.55, aspect) : aspect > 1.4 ? 7.6 : 6.8;
    const lookY = PLATE_TOP + 0.55;
    this.camera.position.set(0, lookY + dist * 0.42, dist);
    this.camera.lookAt(0, lookY, 0);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const p of this.parts.values()) disposeTree(p.group);
    this.parts.clear();
    if (this.confetti) {
      this.confetti.points.geometry.dispose();
      (this.confetti.points.material as THREE.Material).dispose();
    }
    disposeTree(this.scene);
    for (const t of this.textures) t.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  /** The shape currently shown (for tests and the 2D fallback). */
  get shape(): Shape {
    return this.cakeShape;
  }
}

const MAX_PARTS_LAYERS = 3;

function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) mat.dispose();
  });
}
