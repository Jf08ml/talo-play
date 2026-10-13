import * as THREE from "three";
import { mulberry32 } from "./random";
import { CAR_LENGTH, CAR_WIDTH, WORLD_H, WORLD_W, getTrack, type Track, type TrackId } from "./carrerasTrack";

/**
 * Carreras in 3D (three.js), browser only. The 2D world maps to the ground
 * plane: (x, y) → (x, 0, y), heading h → rotation.y = -h, so steering right
 * still turns right on screen. Everything is built from the track's sampled
 * centerline; road pieces are unlit (fog only), cars and scenery are lit.
 */

export type CameraMode = "detras" | "cabina";

const SKY = 0x8fd3f5;
const ROAD_Y = 0.6;

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
 * A flat band along the track between two offsets from the centerline (both
 * sides when `mirror`), one color per quad; null skips the quad.
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
  const n = track.xs.length;
  const sides = mirror ? [1, -1] : [1];
  for (const side of sides) {
    for (let i = 0; i < n; i++) {
      const c = color(i);
      if (!c) continue;
      const j = (i + 1) % n;
      const p = (k: number, off: number) => [track.xs[k] + nm.nx[k] * off * side, y, track.ys[k] + nm.ny[k] * off * side];
      const ai = p(i, inner);
      const bi = p(i, outer);
      const aj = p(j, inner);
      const bj = p(j, outer);
      pos.push(...ai, ...bi, ...bj, ...ai, ...bj, ...aj);
      for (let v = 0; v < 6; v++) col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Low walls on both edges, alternating colors like tire barriers. */
function walls(track: Track, nm: Normals, offset: number, height: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const n = track.xs.length;
  const red = new THREE.Color(0xdc2626);
  const white = new THREE.Color(0xf1f5f9);
  for (const side of [1, -1]) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x = (k: number) => track.xs[k] + nm.nx[k] * offset * side;
      const z = (k: number) => track.ys[k] + nm.ny[k] * offset * side;
      const c = Math.floor(track.cum[i] / 30) % 2 ? red : white;
      pos.push(x(i), 0, z(i), x(i), height, z(i), x(j), height, z(j), x(i), 0, z(i), x(j), height, z(j), x(j), 0, z(j));
      for (let v = 0; v < 6; v++) col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
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

function grassTexture(): THREE.CanvasTexture {
  const t = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = "#3f9a43";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#378a3b";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillRect(64, 64, 64, 64);
    const rand = mulberry32(7);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
      ctx.fillRect(rand() * 128, rand() * 128, 2, 2);
    }
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
  sprite.position.y = 30;
  return sprite;
}

function carMesh(color: string): THREE.Group {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1e293b });
  const black = new THREE.MeshLambertMaterial({ color: 0x0b0b0f });
  const light = new THREE.MeshBasicMaterial({ color: 0xfefce8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR_LENGTH, 6, CAR_WIDTH), paint);
  body.position.y = 6.5;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(8, 3, CAR_WIDTH - 4), paint);
  nose.position.set(CAR_LENGTH / 2 + 2, 5, 0);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(13, 6, CAR_WIDTH - 4), dark);
  cabin.position.set(-3, 12.5, 0);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(4, 1.5, CAR_WIDTH + 2), paint);
  wing.position.set(-CAR_LENGTH / 2 + 1, 13, 0);
  const wingPost = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), black);
  wingPost.position.set(-CAR_LENGTH / 2 + 1, 10.5, 0);
  g.add(body, nose, cabin, wing, wingPost);

  const wheel = new THREE.CylinderGeometry(4, 4, 3.5, 12);
  wheel.rotateX(Math.PI / 2);
  for (const [x, z] of [
    [11, CAR_WIDTH / 2 + 1],
    [11, -CAR_WIDTH / 2 - 1],
    [-11, CAR_WIDTH / 2 + 1],
    [-11, -CAR_WIDTH / 2 - 1],
  ]) {
    const w = new THREE.Mesh(wheel, black);
    w.position.set(x, 4, z);
    g.add(w);
  }
  for (const z of [5, -5]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), light);
    l.position.set(CAR_LENGTH / 2 + 0.2, 7, z);
    g.add(l);
  }
  return g;
}

interface Rig {
  camera: THREE.PerspectiveCamera;
  pos: THREE.Vector3;
  look: THREE.Vector3;
  ready: boolean;
}

interface CarObj {
  group: THREE.Group;
  label: THREE.Sprite | null;
  speed: number;
}

export interface ViewRequest {
  /** Car to follow. */
  key: string;
}

/** The race in 3D on one canvas: any number of cars, one camera per view. */
export class RaceScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cars = new Map<string, CarObj>();
  private rigs = new Map<string, Rig>();
  private maxDpr: number;
  private disposables: { dispose: () => void }[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    trackId: TrackId,
    opts: { maxDpr?: number } = {}
  ) {
    this.maxDpr = opts.maxDpr ?? 2;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(SKY);
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 900, 3400);
    this.scene.add(new THREE.HemisphereLight(0xe0f2fe, 0x365314, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-600, 900, -300);
    this.scene.add(sun);
    this.build(getTrack(trackId), trackId);
  }

  private add<T extends THREE.Object3D>(obj: T): T {
    this.scene.add(obj);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) this.disposables.push(m.geometry);
      if (m.material) this.disposables.push(...(Array.isArray(m.material) ? m.material : [m.material]));
    });
    return obj;
  }

  private build(track: Track, trackId: TrackId) {
    const nm = trackNormals(track);
    const w = track.def.width;
    const unlit = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });

    // Ground.
    const grass = grassTexture();
    grass.repeat.set(90, 90);
    this.disposables.push(grass);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshLambertMaterial({ map: grass })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(WORLD_W / 2, 0, WORLD_H / 2);
    this.add(ground);

    // Runoff, asphalt, curbs inside the edge, center dashes, walls.
    const sand = new THREE.Color(0xd6c38f);
    const asphalt = new THREE.Color(0x3b3b44);
    const asphaltDark = new THREE.Color(0x35353d);
    const red = new THREE.Color(0xdc2626);
    const white = new THREE.Color(0xf8fafc);
    const block = (i: number, size: number) => Math.floor(track.cum[i] / size) % 2 === 0;
    this.add(new THREE.Mesh(band(track, nm, w / 2, w / 2 + 26, 0.3, () => sand), unlit));
    this.add(new THREE.Mesh(band(track, nm, 0, w / 2, ROAD_Y, (i) => (block(i, 40) ? asphalt : asphaltDark)), unlit));
    this.add(new THREE.Mesh(band(track, nm, w / 2 - 9, w / 2, ROAD_Y + 0.15, (i) => (block(i, 18) ? red : white)), unlit));
    this.add(new THREE.Mesh(band(track, nm, -1.5, 1.5, ROAD_Y + 0.15, (i) => (block(i, 26) ? white : null), false), unlit));
    this.add(new THREE.Mesh(walls(track, nm, w / 2 + 3, 9), unlit));

    // Checkered line and the start gantry.
    const sx = track.xs[0];
    const sz = track.ys[0];
    const angle = -Math.atan2(track.ys[1] - track.ys[0], track.xs[1] - track.xs[0]);
    const checker = checkerTexture(2, Math.round(w / 9));
    this.disposables.push(checker);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(14, w), new THREE.MeshBasicMaterial({ map: checker }));
    line.rotation.x = -Math.PI / 2;
    const lineHolder = new THREE.Group();
    lineHolder.add(line);
    line.position.y = ROAD_Y + 0.25;
    lineHolder.position.set(sx, 0, sz);
    lineHolder.rotation.y = angle;
    this.add(lineHolder);

    const gantry = new THREE.Group();
    const postMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    for (const side of [1, -1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(5, 60, 5), postMat);
      post.position.set(0, 30, side * (w / 2 + 8));
      gantry.add(post);
    }
    const bannerTex = canvasTexture(512, 64, (ctx) => {
      ctx.fillStyle = "#7c3aed";
      ctx.fillRect(0, 0, 512, 64);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 44px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("TALO · LARGADA", 256, 34);
    });
    this.disposables.push(bannerTex);
    // Local x runs along the track, so the ±x faces are the ones drivers see.
    const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTex });
    const banner = new THREE.Mesh(new THREE.BoxGeometry(4, 14, w + 20), [
      bannerMat,
      bannerMat,
      postMat,
      postMat,
      postMat,
      postMat,
    ]);
    banner.position.set(0, 58, 0);
    gantry.add(banner);
    gantry.position.set(sx, 0, sz);
    gantry.rotation.y = angle;
    this.add(gantry);

    // Trees away from the track, and mountains on the horizon.
    const rand = mulberry32(trackId.length * 7919 + track.xs.length);
    const spots: [number, number, number][] = [];
    const clear = w / 2 + 50;
    for (let tries = 0; tries < 2000 && spots.length < 170; tries++) {
      const x = -500 + rand() * (WORLD_W + 1000);
      const z = -400 + rand() * (WORLD_H + 800);
      let ok = true;
      for (let i = 0; i < track.xs.length; i += 2) {
        if (Math.hypot(track.xs[i] - x, track.ys[i] - z) < clear) {
          ok = false;
          break;
        }
      }
      if (ok) spots.push([x, z, 0.7 + rand() * 0.8]);
    }
    const crowns = new THREE.InstancedMesh(
      new THREE.ConeGeometry(16, 46, 7),
      new THREE.MeshLambertMaterial({ color: 0x166534 }),
      spots.length
    );
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(3, 4, 14, 6),
      new THREE.MeshLambertMaterial({ color: 0x7c4a1e }),
      spots.length
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach(([x, z, s], i) => {
      m.compose(new THREE.Vector3(x, 7 * s, z), q, new THREE.Vector3(s, s, s));
      trunks.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(x, 34 * s, z), q, new THREE.Vector3(s, s, s));
      crowns.setMatrixAt(i, m);
    });
    this.add(crowns);
    this.add(trunks);

    const mountains = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 5),
      new THREE.MeshLambertMaterial({ color: 0x64748b }),
      28
    );
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + rand() * 0.2;
      const r = 2300 + rand() * 500;
      const h = 250 + rand() * 350;
      const s = 380 + rand() * 300;
      m.compose(
        new THREE.Vector3(WORLD_W / 2 + Math.cos(a) * r, h / 2, WORLD_H / 2 + Math.sin(a) * r),
        q,
        new THREE.Vector3(s, h, s)
      );
      mountains.setMatrixAt(i, m);
    }
    this.add(mountains);
  }

  /** Makes the scene's cars match `cars` (key → color and name label). */
  setCars(cars: Record<string, { color: string; label?: string }>) {
    for (const [key, obj] of this.cars) {
      if (!(key in cars)) {
        this.scene.remove(obj.group);
        this.cars.delete(key);
      }
    }
    for (const [key, info] of Object.entries(cars)) {
      if (this.cars.has(key)) continue;
      const group = this.add(carMesh(info.color));
      const label = info.label ? labelSprite(info.label, info.color) : null;
      if (label) {
        group.add(label);
        this.disposables.push(label.material, label.material.map!);
      }
      this.cars.set(key, { group, label, speed: 0 });
    }
  }

  setPose(key: string, x: number, y: number, heading: number, speed: number) {
    const car = this.cars.get(key);
    if (!car) return;
    car.group.position.set(x, 0, y);
    car.group.rotation.y = -heading;
    car.speed = speed;
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
      rig = { camera: new THREE.PerspectiveCamera(68, 1, 2, 6000), pos: new THREE.Vector3(), look: new THREE.Vector3(), ready: false };
      this.rigs.set(key, rig);
    }
    return rig;
  }

  private aim(rig: Rig, key: string, mode: CameraMode, dt: number, aspect: number) {
    const car = this.cars.get(key);
    const cam = rig.camera;
    if (!car) {
      // Nothing to follow: an aerial view of the whole track.
      cam.position.set(WORLD_W / 2, 1300, WORLD_H / 2 + 900);
      cam.lookAt(WORLD_W / 2, 0, WORLD_H / 2);
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
      return;
    }
    const p = car.group.position;
    const h = -car.group.rotation.y;
    const fx = Math.cos(h);
    const fz = Math.sin(h);
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    if (mode === "cabina") {
      pos = new THREE.Vector3(p.x + fx * 2, 12.5, p.z + fz * 2);
      look = new THREE.Vector3(p.x + fx * 80, 9, p.z + fz * 80);
    } else {
      pos = new THREE.Vector3(p.x - fx * 70, 30, p.z - fz * 70);
      look = new THREE.Vector3(p.x + fx * 35, 8, p.z + fz * 35);
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
    cam.lookAt(rig.look);
    const fov = 66 + Math.min(14, (Math.abs(car.speed) / 430) * 14);
    if (cam.aspect !== aspect || Math.abs(cam.fov - fov) > 0.1) {
      cam.aspect = aspect;
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}
