import { tvDpr } from "@/lib/tvMode";
import * as THREE from "three";
import { JUMP_LEN, LOG_LENGTH, RING, jumpHeight, wrapPi, type Cue } from "./tronco";

/**
 * El tronco in 3D (three.js, browser only): a meadow, a sand ring, a stump in
 * the middle with the log turning on it, and the players as talos (flat
 * colored bodies with eyes) that jump, kick and fall. Everything is drawn
 * from what the game tells each frame; nothing here decides anything.
 *
 * Life on top of that, all derived from the frames: talos breathe, follow
 * the log with their eyes and get scared when it comes; the log leaves a
 * streak that grows with its speed; a kick (seen as the log turning around)
 * throws wood chips and a shock ring; landings and falls raise dust, and the
 * fallen see stars.
 *
 * Axes: y is up; an angle θ on the ground is the point (cos θ, 0, −sin θ),
 * the same way the log's pivot turns (rotation.y = θ). Seen from behind a
 * seat, looking at the middle, a growing angle goes to the right.
 */

export interface PlayerView {
  id: string;
  name: string;
  color: string;
  angle: number;
  me: boolean;
  /** Seconds since the last jump / kick (large = none), and since falling (−1 = standing). */
  jumpS: number;
  kickS: number;
  fallS: number;
  /** What their buttons would do now: shown as the ring under them (absent = no ring). */
  cue?: Cue;
}

export interface SceneView {
  logAngle: number;
  logDir: 1 | -1;
  /** Radians per second (0 while resting). */
  speed: number;
  shake: boolean;
  /** The log is turning (not resting before the opening kick). */
  rolling: boolean;
  players: PlayerView[];
  /** Where my camera stands (my seat), or null to watch from the front. */
  myAngle: number | null;
  time: number;
}

const at = (angle: number, r: number) => new THREE.Vector3(Math.cos(angle) * r, 0, -Math.sin(angle) * r);
const TAU = Math.PI * 2;

interface Talo {
  root: THREE.Group;
  body: THREE.Group;
  foot: THREE.Mesh;
  spot: THREE.Mesh;
  warn: THREE.Mesh;
  eyes: THREE.Mesh[];
  pupils: THREE.Mesh[];
  shadow: THREE.Mesh;
  label: THREE.Sprite;
  stars: THREE.Group;
  phase: number;
  lastJumpS: number;
  wasDown: boolean;
}

interface Bit {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  spin: number;
  gravity: number;
}

function labelSprite(text: string, me: boolean): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.font = "bold 34px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = Math.min(240, ctx.measureText(text).width + 28);
  ctx.fillStyle = me ? "#FFD400" : "rgba(17,17,17,0.75)";
  ctx.beginPath();
  ctx.roundRect(128 - w / 2, 8, w, 48, 24);
  ctx.fill();
  ctx.fillStyle = me ? "#111111" : "#FFFFFF";
  ctx.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** A tiny deterministic hash (decoration placement): same meadow every time. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export class TroncoScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  private pivot = new THREE.Group();
  private log = new THREE.Group();
  private bark: THREE.Mesh;
  private streaks: { group: THREE.Group; mat: THREE.MeshBasicMaterial }[] = [];
  private talos = new Map<string, Talo>();
  private warnGeo: THREE.BufferGeometry;
  /** Bigger name tags, for a TV seen from the couch. */
  private tv: boolean;
  /** Modo TV (lib/tvMode.ts): fewer pixels, no antialiasing, no shadows. */
  private lite: boolean;
  private wave: THREE.Mesh;
  private waveLife = 1;
  private bits: Bit[] = [];
  private bitGeo: { chip: THREE.BufferGeometry; dust: THREE.BufferGeometry };
  private bitMat: { chip: THREE.Material; chip2: THREE.Material; dust: THREE.Material; star: THREE.Material };
  private camAngle = Math.PI / 2;
  private shakeAmt = 0;
  private lastDir: 1 | -1 | 0 = 0;
  private lastShake = false;
  private lastTime = 0;
  private disposables: { dispose: () => void }[] = [];

  constructor(canvas: HTMLCanvasElement, { tv = false, lite = false }: { tv?: boolean; lite?: boolean } = {}) {
    this.tv = tv;
    this.lite = lite;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    // Modo TV: no real-time shadows (the talos keep their blob shadow if any).
    this.renderer.shadowMap.enabled = !lite;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color("#A9DCFA");
    this.scene.fog = new THREE.Fog("#A9DCFA", 18, 40);

    this.scene.add(new THREE.HemisphereLight(0xe6f4ff, 0x6fae5a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(6, 12, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -9;
    sc.right = 9;
    sc.top = 9;
    sc.bottom = -9;
    this.scene.add(sun);

    const mat = (color: string | number) => {
      const m = new THREE.MeshLambertMaterial({ color });
      this.disposables.push(m);
      return m;
    };
    const geo = <G extends THREE.BufferGeometry>(g: G) => {
      this.disposables.push(g);
      return g;
    };

    const grass = new THREE.Mesh(geo(new THREE.CircleGeometry(40, 48)), mat("#7CC86A"));
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    this.scene.add(grass);
    const sand = new THREE.Mesh(geo(new THREE.RingGeometry(0.7, RING + 1.1, 64)), mat("#EAD39C"));
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = 0.01;
    sand.receiveShadow = true;
    this.scene.add(sand);
    // A darker edge around the sand.
    const edge = new THREE.Mesh(geo(new THREE.RingGeometry(RING + 1.1, RING + 1.35, 64)), mat("#C9AE72"));
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.012;
    this.scene.add(edge);

    // Trees and bushes around the meadow.
    const trunk = geo(new THREE.CylinderGeometry(0.18, 0.24, 1.2, 8));
    const crown = geo(new THREE.SphereGeometry(1, 12, 10));
    const trunkMat = mat("#7A4E26");
    const crownMats = [mat("#3E9B4F"), mat("#4FB15E")];
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * TAU + (k % 3) * 0.2;
      const r = 10 + (k % 4) * 2.2;
      const p = at(a, r);
      const t = new THREE.Mesh(trunk, trunkMat);
      t.position.set(p.x, 0.6, p.z);
      const c = new THREE.Mesh(crown, crownMats[k % 2]);
      c.position.set(p.x, 1.7, p.z);
      c.scale.setScalar(0.9 + (k % 3) * 0.25);
      c.castShadow = true;
      this.scene.add(t, c);
    }
    const bush = geo(new THREE.SphereGeometry(0.5, 10, 8));
    for (let k = 0; k < 14; k++) {
      const a = hash(k + 40) * TAU;
      const p = at(a, 7.2 + hash(k + 60) * 2.5);
      const b = new THREE.Mesh(bush, crownMats[k % 2]);
      b.position.set(p.x, 0.25, p.z);
      b.scale.set(1 + hash(k) * 0.6, 0.7 + hash(k + 3) * 0.3, 1 + hash(k + 5) * 0.6);
      this.scene.add(b);
    }

    // Flowers (instanced per color) and a few rocks.
    const petal = geo(new THREE.SphereGeometry(0.09, 6, 5));
    const flowerColors = ["#FFFFFF", "#FFD400", "#FF5FA2", "#A78BFA"];
    flowerColors.forEach((color, ci) => {
      const count = 18;
      const inst = new THREE.InstancedMesh(petal, mat(color), count);
      const m = new THREE.Matrix4();
      for (let i = 0; i < count; i++) {
        const n = ci * 100 + i;
        const p = at(hash(n) * TAU, RING + 1.8 + hash(n + 7) * 5);
        m.makeTranslation(p.x, 0.09, p.z);
        inst.setMatrixAt(i, m);
      }
      this.scene.add(inst);
    });
    const rock = geo(new THREE.DodecahedronGeometry(0.35, 0));
    const rockMat = mat("#9AA0A6");
    for (let k = 0; k < 9; k++) {
      const p = at(hash(k + 200) * TAU, RING + 2.2 + hash(k + 210) * 4);
      const r = new THREE.Mesh(rock, rockMat);
      r.position.set(p.x, 0.1, p.z);
      r.scale.setScalar(0.5 + hash(k + 220) * 0.8);
      r.rotation.set(hash(k) * 3, hash(k + 1) * 3, 0);
      r.castShadow = true;
      this.scene.add(r);
    }

    // The stump and the log.
    const stump = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.6, 0.7, 0.55, 20)), mat("#8A5A2B"));
    stump.position.y = 0.27;
    stump.castShadow = true;
    const top = new THREE.Mesh(geo(new THREE.CircleGeometry(0.6, 20)), mat("#E0B57E"));
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.555;
    this.scene.add(stump, top);

    const logLen = LOG_LENGTH;
    this.bark = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.3, 0.3, logLen, 18)), mat("#8B5A2B"));
    this.bark.rotation.z = Math.PI / 2;
    this.bark.position.set(logLen / 2, 0, 0);
    this.bark.castShadow = true;
    this.log.add(this.bark);
    const ringMat = mat("#6B4220");
    for (let k = 1; k < 6; k++) {
      const ring = new THREE.Mesh(geo(new THREE.TorusGeometry(0.305, 0.03, 6, 18)), ringMat);
      ring.rotation.y = Math.PI / 2;
      ring.position.x = (logLen * k) / 6;
      this.log.add(ring);
    }
    // A knot and a little leafy twig, so the roll shows.
    const knot = new THREE.Mesh(geo(new THREE.SphereGeometry(0.09, 8, 6)), ringMat);
    knot.position.set(0, 0.29, 0);
    knot.scale.set(1, 0.5, 1.4);
    this.bark.add(knot);
    const leaf = new THREE.Mesh(geo(new THREE.SphereGeometry(0.12, 8, 6)), mat("#5BBF5E"));
    leaf.position.set(0.9, -0.31, 0);
    leaf.scale.set(1.6, 0.5, 1);
    this.bark.add(leaf);
    const cap = new THREE.Mesh(geo(new THREE.CircleGeometry(0.3, 18)), mat("#E0B57E"));
    cap.rotation.y = Math.PI / 2;
    cap.position.x = logLen + 0.001;
    this.log.add(cap);
    const capRing = new THREE.Mesh(geo(new THREE.RingGeometry(0.12, 0.15, 18)), mat("#B9864F"));
    capRing.rotation.y = Math.PI / 2;
    capRing.position.x = logLen + 0.002;
    this.log.add(capRing);
    this.log.position.y = 0.34;
    this.pivot.add(this.log);

    // The streak it leaves on the sand: slices behind it, fading out.
    const slice = geo(new THREE.CircleGeometry(logLen, 4, 0, 0.11));
    for (let k = 0; k < 5; k++) {
      const m = new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0, depthWrite: false });
      this.disposables.push(m);
      const mesh = new THREE.Mesh(slice, m);
      mesh.rotation.x = -Math.PI / 2;
      const group = new THREE.Group();
      group.position.y = 0.025;
      group.add(mesh);
      this.pivot.add(group);
      this.streaks.push({ group, mat: m });
    }
    this.scene.add(this.pivot);

    this.warnGeo = geo(new THREE.RingGeometry(0.62, 0.8, 32));

    // The shock ring of a kick.
    const waveMat = new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0, depthWrite: false });
    this.disposables.push(waveMat);
    this.wave = new THREE.Mesh(geo(new THREE.RingGeometry(0.85, 1, 32)), waveMat);
    this.wave.rotation.x = -Math.PI / 2;
    this.wave.position.y = 0.04;
    this.scene.add(this.wave);

    this.bitGeo = { chip: geo(new THREE.BoxGeometry(0.12, 0.05, 0.07)), dust: geo(new THREE.IcosahedronGeometry(0.16, 0)) };
    this.bitMat = { chip: mat("#B9864F"), chip2: mat("#E0B57E"), dust: mat("#F3E6C4"), star: mat("#FFD400") };
  }

  private makeTalo(p: PlayerView): Talo {
    const root = new THREE.Group();
    const body = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: p.color });
    const bodyGeo = new THREE.CapsuleGeometry(0.42, 0.5, 6, 14);
    const trunk = new THREE.Mesh(bodyGeo, bodyMat);
    trunk.position.y = 0.42 + 0.25;
    trunk.castShadow = true;
    body.add(trunk);
    const white = new THREE.MeshBasicMaterial({ color: "#FFFFFF" });
    const black = new THREE.MeshBasicMaterial({ color: "#111111" });
    const eyeGeo = new THREE.SphereGeometry(0.13, 12, 10);
    const pupilGeo = new THREE.SphereGeometry(0.065, 10, 8);
    const eyes: THREE.Mesh[] = [];
    const pupils: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, white);
      eye.position.set(side * 0.16, 1.0, 0.36);
      const pupil = new THREE.Mesh(pupilGeo, black);
      pupil.position.set(side * 0.16, 0.98, 0.47);
      body.add(eye, pupil);
      eyes.push(eye);
      pupils.push(pupil);
    }
    const footGeo = new THREE.SphereGeometry(0.15, 10, 8);
    const footMat = new THREE.MeshLambertMaterial({ color: "#222222" });
    const left = new THREE.Mesh(footGeo, footMat);
    left.position.set(-0.18, 0.08, 0.05);
    const foot = new THREE.Mesh(footGeo, footMat);
    foot.position.set(0.18, 0.08, 0.05);
    body.add(left, foot);
    root.add(body);
    // The spot where each one stands, so the ring of places reads.
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), new THREE.MeshLambertMaterial({ color: "#D9BE80" }));
    spot.rotation.x = -Math.PI / 2;
    spot.position.y = 0.013;
    spot.receiveShadow = true;
    root.add(spot);
    // The warning ring (its own material: each one has its color).
    const warn = new THREE.Mesh(this.warnGeo, new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0, depthWrite: false }));
    warn.rotation.x = -Math.PI / 2;
    warn.position.y = 0.03;
    warn.visible = false;
    root.add(warn);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.22, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.018;
    root.add(shadow);
    const label = labelSprite(p.me ? "Tú" : p.name, p.me);
    label.position.y = this.tv ? 2.2 : 1.85;
    if (this.tv) label.scale.multiplyScalar(1.7);
    root.add(label);
    // Stars going round the head of the fallen.
    const stars = new THREE.Group();
    const starGeo = new THREE.OctahedronGeometry(0.09, 0);
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Mesh(starGeo, this.bitMat.star);
      s.position.set(Math.cos((k / 3) * TAU) * 0.32, 0, Math.sin((k / 3) * TAU) * 0.32);
      stars.add(s);
    }
    stars.position.set(0, 0.6, -1.15);
    stars.visible = false;
    root.add(stars);
    this.scene.add(root);
    let phase = 0;
    for (const ch of p.id) phase = (phase * 31 + ch.charCodeAt(0)) % 1000;
    return { root, body, foot, spot, warn, eyes, pupils, shadow, label, stars, phase: phase / 159, lastJumpS: 99, wasDown: false };
  }

  private dropTalo(t: Talo) {
    this.scene.remove(t.root);
    const keep = new Set<THREE.Material>([this.bitMat.star]);
    t.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry !== this.warnGeo) m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        if (keep.has(mat)) continue;
        (mat as THREE.SpriteMaterial).map?.dispose();
        mat.dispose();
      }
    });
  }

  /** Throws `n` bits from `pos`: wood chips (fly and fall) or dust (puffs that rise a little). */
  private burst(kind: "chips" | "dust", pos: THREE.Vector3, n: number, power = 1) {
    for (let i = 0; i < n; i++) {
      let bit: Bit;
      if (this.bits.length >= 90) {
        bit = this.bits.shift()!;
      } else {
        const mesh = new THREE.Mesh(this.bitGeo.dust, this.bitMat.dust);
        this.scene.add(mesh);
        bit = { mesh, vel: new THREE.Vector3(), life: 0, max: 1, size: 1, spin: 0, gravity: 0 };
      }
      const a = Math.random() * TAU;
      if (kind === "chips") {
        bit.mesh.geometry = this.bitGeo.chip;
        bit.mesh.material = Math.random() < 0.5 ? this.bitMat.chip : this.bitMat.chip2;
        const sp = (2 + Math.random() * 2.5) * power;
        bit.vel.set(Math.cos(a) * sp, 2.5 + Math.random() * 3 * power, Math.sin(a) * sp);
        bit.max = 0.7 + Math.random() * 0.4;
        bit.size = 0.8 + Math.random() * 0.8;
        bit.spin = (Math.random() - 0.5) * 20;
        bit.gravity = 12;
      } else {
        bit.mesh.geometry = this.bitGeo.dust;
        bit.mesh.material = this.bitMat.dust;
        const sp = (0.8 + Math.random() * 1.2) * power;
        bit.vel.set(Math.cos(a) * sp, 0.3 + Math.random() * 0.6, Math.sin(a) * sp);
        bit.max = 0.45 + Math.random() * 0.3;
        bit.size = 0.6 + Math.random() * 0.9;
        bit.spin = 0;
        bit.gravity = 0;
      }
      bit.mesh.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.1 + Math.random() * 0.2, (Math.random() - 0.5) * 0.3));
      bit.life = 0;
      bit.mesh.visible = true;
      this.bits.push(bit);
    }
  }

  private stepBits(dt: number) {
    for (const b of this.bits) {
      if (!b.mesh.visible) continue;
      b.life += dt;
      if (b.life >= b.max) {
        b.mesh.visible = false;
        continue;
      }
      b.vel.y -= b.gravity * dt;
      b.vel.multiplyScalar(b.gravity ? 1 : Math.exp(-dt * 3));
      b.mesh.position.addScaledVector(b.vel, dt);
      if (b.mesh.position.y < 0.03) {
        b.mesh.position.y = 0.03;
        b.vel.y *= -0.3;
        b.vel.x *= 0.6;
        b.vel.z *= 0.6;
      }
      b.mesh.rotation.x += b.spin * dt;
      b.mesh.rotation.z += b.spin * 0.7 * dt;
      const p = b.life / b.max;
      // Dust grows then vanishes; chips just shrink at the end.
      const s = b.gravity ? b.size * Math.min(1, (1 - p) * 4) : b.size * (0.6 + p) * (1 - p) * 1.6;
      b.mesh.scale.setScalar(Math.max(0.001, s));
    }
  }

  private kickFx(angle: number, near: boolean) {
    const p = at(angle, RING - 0.4);
    this.burst("chips", p, 14, 1);
    this.burst("dust", p, 6, 0.8);
    this.wave.position.set(p.x, 0.04, p.z);
    this.waveLife = 0;
    this.shakeAmt = Math.max(this.shakeAmt, near ? 0.22 : 0.08);
  }

  resize(w: number, h: number) {
    const base = Math.min(2, window.devicePixelRatio || 1);
    const dpr = this.lite ? tvDpr(base, w, h) : base;
    if (this.renderer.getPixelRatio() !== dpr) this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    // Narrow phones: a wider view so the whole ring fits.
    this.camera.fov = this.camera.aspect < 0.8 ? 62 : 48;
    this.camera.updateProjectionMatrix();
  }

  frame(v: SceneView) {
    const dt = this.lastTime ? Math.min(0.1, Math.max(0, v.time - this.lastTime)) : 0;
    this.lastTime = v.time;
    // Modo TV: follow the level's pixel budget as it changes (Automático moves it).
    if (this.lite) {
      const size = this.renderer.getSize(new THREE.Vector2());
      const dpr = tvDpr(Math.min(2, window.devicePixelRatio || 1), size.x, size.y);
      if (Math.abs(this.renderer.getPixelRatio() - dpr) > 0.01) {
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(size.x, size.y, false);
      }
    }
    const meView = v.players.find((p) => p.me);

    // A kick shows as the log turning around (or leaving the opener's feet).
    if (this.lastShake && !v.shake && v.rolling === false) {
      this.kickFx(v.logAngle, !!meView && Math.abs(wrapPi(meView.angle - v.logAngle)) < 0.6);
    } else if (v.rolling && this.lastDir !== 0 && v.logDir !== this.lastDir) {
      this.kickFx(v.logAngle, !!meView && Math.abs(wrapPi(meView.angle - v.logAngle)) < 0.6);
    }
    this.lastShake = v.shake;
    this.lastDir = v.rolling ? v.logDir : 0;

    // Players: build / remove, then pose.
    const ids = new Set(v.players.map((p) => p.id));
    for (const [id, t] of this.talos) {
      if (!ids.has(id)) {
        this.dropTalo(t);
        this.talos.delete(id);
      }
    }
    for (const p of v.players) {
      let t = this.talos.get(p.id);
      if (!t) {
        t = this.makeTalo(p);
        this.talos.set(p.id, t);
      }
      const pos = at(p.angle, RING);
      t.root.position.copy(pos);
      // Facing the middle.
      t.root.rotation.y = p.angle - Math.PI / 2;
      const down = p.fallS >= 0;

      // How close the log is coming at this one (0 far … 1 on them).
      const gap = ((((p.angle - v.logAngle) * v.logDir) % TAU) + TAU) % TAU;
      const fear = v.rolling && !down ? Math.max(0, 1 - gap / 1.1) : 0;
      // Eyes follow the log (a growing angle is their right, local −x) and widen with fear.
      const side = wrapPi(v.logAngle - p.angle);
      const look = Math.max(-1, Math.min(1, side / 1.2)) * (Math.abs(side) < 2.4 ? 1 : 0);
      for (let k = 0; k < 2; k++) {
        const sx = k ? 1 : -1;
        t.eyes[k].scale.setScalar(1 + fear * 0.35);
        t.pupils[k].position.x = sx * 0.16 - look * 0.06;
        t.pupils[k].position.y = 0.98 - fear * 0.03;
        t.pupils[k].position.z = 0.47 + fear * 0.04;
        t.pupils[k].scale.setScalar(1 - fear * 0.35);
      }

      const h = down ? 0 : jumpHeight(p.jumpS);
      const idle = down || h > 0 ? 0 : Math.sin(v.time * 3.2 + t.phase) * 0.025;
      t.body.position.y = h + Math.max(0, idle);
      t.shadow.scale.setScalar(1 - h * 0.35);
      // Kick: lean back and the foot goes forward.
      const kick = p.kickS >= 0 && p.kickS < 0.3 ? Math.sin((p.kickS / 0.3) * Math.PI) : 0;
      t.foot.position.z = 0.05 + kick * 0.45;
      t.foot.position.y = 0.08 + kick * 0.25;
      t.body.rotation.x = -kick * 0.35;
      t.body.rotation.z = 0;
      // Squash and stretch: crouch to jump, stretch going up, squash on landing,
      // a nervous crouch when the log comes, breathing otherwise.
      let sx = 1 + idle * 0.6;
      let sy = 1 - idle * 0.6;
      if (!down) {
        if (p.jumpS >= 0 && p.jumpS < 0.06) [sx, sy] = [1.14, 0.84];
        else if (p.jumpS >= 0.06 && p.jumpS < 0.24) [sx, sy] = [0.92, 1.12];
        else if (p.jumpS >= JUMP_LEN && p.jumpS < JUMP_LEN + 0.12) {
          const q = 1 - (p.jumpS - JUMP_LEN) / 0.12;
          [sx, sy] = [1 + 0.16 * q, 1 - 0.2 * q];
        } else if (fear > 0) {
          sx = 1 + fear * 0.05;
          sy = 1 - fear * 0.07;
          // A shiver when it's about to arrive.
          t.body.rotation.z = fear > 0.6 ? Math.sin(v.time * 40 + t.phase) * 0.03 * fear : 0;
        }
      }
      t.body.scale.set(sx, sy, sx);
      // Landing: a puff of dust.
      if (!down && t.lastJumpS < JUMP_LEN && p.jumpS >= JUMP_LEN && p.jumpS < JUMP_LEN + 0.2) this.burst("dust", pos, 5, 0.7);
      t.lastJumpS = p.jumpS;

      // Knocked down: falls backwards, slides out, dust and stars.
      if (down) {
        const f = Math.min(1, p.fallS / 0.35);
        t.body.rotation.x = (-Math.PI / 2) * f;
        t.root.position.copy(at(p.angle, RING + 0.9 * f));
        // The spot stays on the ring (outward is the talo's −z).
        t.spot.position.z = 0.9 * f;
        t.label.visible = false;
        if (!t.wasDown) {
          this.burst("dust", t.root.position, 10, 1.3);
          if (p.me) this.shakeAmt = Math.max(this.shakeAmt, 0.35);
        }
        t.stars.visible = p.fallS > 0.35;
        t.stars.rotation.y = v.time * 4;
        t.stars.position.y = 0.6 + Math.sin(v.time * 6) * 0.05;
      } else {
        t.label.visible = true;
        t.spot.position.z = 0;
        t.stars.visible = false;
      }
      t.wasDown = down;
    }

    // The log.
    this.pivot.rotation.y = v.logAngle;
    const jiggle = v.shake ? Math.sin(v.time * 55) * 0.05 : 0;
    this.log.rotation.x = jiggle;
    this.log.position.y = 0.34 + (v.shake ? Math.abs(jiggle) * 0.6 : 0);
    // It rolls as it goes, faster the faster it turns.
    if (v.rolling) this.bark.rotation.x += dt * (2 + v.speed * 3) * v.logDir;

    // The streak behind it, longer and stronger with speed.
    const strength = v.rolling ? Math.min(1, 0.25 + (v.speed - 1) / 3) : 0;
    this.streaks.forEach((s, k) => {
      s.group.rotation.y = v.logDir === 1 ? -(k + 1) * 0.11 : k * 0.11;
      const visible = k < 2 + Math.round(strength * 3);
      s.mat.opacity = visible ? strength * 0.38 * (1 - k / 5) : 0;
    });

    // Warning rings (players with a cue: me, or everyone on the TV): they grow
    // as the log comes; yellow = jump now, green = kick (or jump) now.
    for (const p of v.players) {
      const t = this.talos.get(p.id);
      if (!t) continue;
      const mat = t.warn.material as THREE.MeshBasicMaterial;
      const cue = p.fallS < 0 ? p.cue : undefined;
      if (!cue) {
        t.warn.visible = false;
        continue;
      }
      t.warn.visible = true;
      const near = Number.isFinite(cue.ttc) ? Math.max(0, Math.min(1, 1 - cue.ttc / 1.3)) : 0;
      if (cue.kick) {
        mat.opacity = 0.95;
        mat.color.set("#34C759");
        t.warn.scale.setScalar(1.3 + Math.sin(v.time * 30) * 0.06);
      } else if (cue.jump) {
        mat.opacity = 0.95;
        mat.color.set("#FFD400");
        t.warn.scale.setScalar(1.2 + Math.sin(v.time * 30) * 0.05);
      } else {
        // On the TV, only a hint while it's coming; under me, always there.
        mat.opacity = p.me ? 0.2 + near * 0.5 : near * 0.45;
        mat.color.set("#FFFFFF");
        t.warn.scale.setScalar(1.5 - near * 0.35);
      }
    }

    // Kick shock ring.
    const waveMat = this.wave.material as THREE.MeshBasicMaterial;
    if (this.waveLife < 1) {
      this.waveLife = Math.min(1, this.waveLife + dt / 0.45);
      this.wave.scale.setScalar(0.4 + this.waveLife * 2.4);
      waveMat.opacity = 0.8 * (1 - this.waveLife);
    } else {
      waveMat.opacity = 0;
    }
    this.stepBits(dt);

    // Camera: behind my seat, looking over the ring; with no seat (the TV, or
    // watching) high up in front, the whole ring in view. It shakes on hits.
    const narrow = this.camera.aspect < 0.8;
    if (v.myAngle !== null) {
      let d = v.myAngle - this.camAngle;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.camAngle += d * 0.08;
      const back = at(this.camAngle, RING + (narrow ? 6.2 : 5.4));
      this.camera.position.set(back.x, narrow ? 8.2 : 6.2, back.z);
      const look = at(this.camAngle, narrow ? -0.6 : -0.3);
      this.camera.lookAt(look.x, 0.2, look.z);
    } else {
      // A slow drift so the TV never looks frozen.
      const sway = Math.sin(v.time * 0.15) * 0.12;
      const pos = at(-Math.PI / 2 + sway, narrow ? 12.5 : 9.4);
      this.camera.position.set(pos.x, narrow ? 15 : 12.2, pos.z);
      this.camera.lookAt(0, 0, narrow ? 0.4 : 0.35);
    }
    if (this.shakeAmt > 0.002) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-dt * 9);
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const t of this.talos.values()) this.dropTalo(t);
    this.talos.clear();
    for (const b of this.bits) this.scene.remove(b.mesh);
    this.bits = [];
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}
