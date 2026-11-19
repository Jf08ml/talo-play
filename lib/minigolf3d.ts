import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { aheadPoint, BALL_R, CUP_R, MILL_T, millAngle, type Hole } from "./minigolfSim";
import type { DrawAim, DrawBall } from "./minigolfDraw";

/**
 * Minigolf in 3D (three.js, browser only), drawn from the same hole and the
 * same balls as the 2D view: nothing here decides anything. A hole point
 * (x, y) is (x, 0, y) in the scene; y is up.
 *
 * Two cameras: "seguir" stands behind my ball looking toward the cup (it
 * eases after the ball and keeps its heading near the cup), "todo" frames
 * the whole hole from one end. Drags are turned into hole directions from
 * the camera's heading (`screenToHoleVec`), so pulling down always shoots
 * "into" the screen.
 */

export type CameraMode = "seguir" | "todo";

export interface Scene3DView {
  t: number;
  balls: DrawBall[];
  aim: DrawAim | null;
  bumped?: Map<number, number>;
  now: number;
}

const WALL_H = 0.42;
const WALL_T = 0.24;
const COLORS = {
  sky: "#A9DCFA",
  out: "#0E4429",
  green: "#00B26B",
  stripe: "#00A562",
  slope: "#00BD74",
  wall: "#FFFFFF",
  sand: "#F3D38B",
  water: "#2D5BFF",
  pink: "#FF5FA2",
  orange: "#FF7A1A",
  ink: "#111111",
  yellow: "#FFD400",
};

function chevronTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(20, 16);
  ctx.lineTo(40, 32);
  ctx.lineTo(20, 48);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function shapeOf(poly: number[]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(poly[0], poly[1]);
  for (let i = 2; i < poly.length; i += 2) s.lineTo(poly[i], poly[i + 1]);
  s.closePath();
  return s;
}

interface BallMesh {
  group: THREE.Group;
  ball: THREE.Mesh;
  ring: THREE.Mesh;
  shadow: THREE.Mesh;
  mat: THREE.MeshLambertMaterial;
  ringMat: THREE.MeshBasicMaterial;
}

export class GolfScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
  private disposables: { dispose: () => void }[] = [];
  private mills: { group: THREE.Group; index: number }[] = [];
  private bumpers: THREE.Group[] = [];
  private slopeTex: { tex: THREE.Texture; dir: THREE.Vector2 }[] = [];
  private balls = new Map<string, BallMesh>();
  private aimDots: THREE.Mesh[] = [];
  private aimMat: THREE.MeshBasicMaterial;
  private flag: THREE.Group;
  private flagCloth: THREE.Mesh;
  private camTarget = new THREE.Vector3();
  private camYaw = 0;
  private camReady = false;
  /** The "todo" camera, worked out once per size. */
  private overview: { target: THREE.Vector3; yaw: number; dist: number; height: number; aspect: number } | null = null;
  mode: CameraMode = "seguir";

  constructor(
    canvas: HTMLCanvasElement,
    private hole: Hole,
    shadows: boolean
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(COLORS.sky);
    const span = Math.max(hole.w, hole.h);
    this.scene.fog = new THREE.Fog(COLORS.sky, span * 1.4, span * 3.2);

    this.scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x5e9e52, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(hole.w / 2 + 8, 18, hole.h / 2 - 6);
    sun.target.position.set(hole.w / 2, 0, hole.h / 2);
    this.scene.add(sun.target);
    if (shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera;
      sc.left = -span * 0.8;
      sc.right = span * 0.8;
      sc.top = span * 0.8;
      sc.bottom = -span * 0.8;
      sc.far = 60;
      sun.shadow.bias = -0.0008;
    }
    this.scene.add(sun);

    const mat = (color: string, opts: THREE.MeshLambertMaterialParameters = {}) => {
      const m = new THREE.MeshLambertMaterial({ color, ...opts });
      this.disposables.push(m);
      return m;
    };
    const keep = <G extends THREE.BufferGeometry>(g: G) => {
      this.disposables.push(g);
      return g;
    };

    // The ground around the hole.
    const out = new THREE.Mesh(keep(new THREE.PlaneGeometry(span * 8, span * 8)), mat(COLORS.out));
    out.rotation.x = -Math.PI / 2;
    out.position.set(hole.w / 2, -0.02, hole.h / 2);
    out.receiveShadow = true;
    this.scene.add(out);

    // The green: raster runs as thin boxes, alternate stripes in two colors.
    const runs: [THREE.BufferGeometry[], THREE.BufferGeometry[]] = [[], []];
    const { cols, rows, res, floor } = hole;
    for (let r = 0; r < rows; r++) {
      const band = Math.floor((r * res) / 1.25) % 2;
      let start = -1;
      for (let c = 0; c <= cols; c++) {
        const on = c < cols && floor[r * cols + c] === 1;
        if (on && start < 0) start = c;
        if (!on && start >= 0) {
          const g = new THREE.BoxGeometry((c - start) * res, 0.1, res);
          g.translate(((start + c) / 2) * res, -0.05, (r + 0.5) * res);
          runs[band].push(g);
          start = -1;
        }
      }
    }
    runs.forEach((list, band) => {
      if (!list.length) return;
      const merged = keep(mergeGeometries(list)!);
      list.forEach((g) => g.dispose());
      const m = new THREE.Mesh(merged, mat(band ? COLORS.stripe : COLORS.green));
      m.receiveShadow = true;
      this.scene.add(m);
    });

    // Zones, flat on the green.
    const chev = chevronTexture();
    this.disposables.push(chev);
    hole.zones.forEach((z, i) => {
      const g = keep(new THREE.ShapeGeometry(shapeOf(z.poly)));
      const y = 0.004 + i * 0.0005;
      if (z.kind === "slope" && z.slope) {
        const base = new THREE.Mesh(g, mat(COLORS.slope, { side: THREE.DoubleSide }));
        base.rotation.x = Math.PI / 2;
        base.position.y = y;
        base.receiveShadow = true;
        this.scene.add(base);
        const tex = chev.clone();
        tex.needsUpdate = true;
        tex.repeat.set(1 / 1.2, 1 / 1.2);
        tex.center.set(0.5, 0.5);
        tex.rotation = -Math.atan2(z.slope.y, z.slope.x);
        this.disposables.push(tex);
        const arrows = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        this.disposables.push(arrows.material as THREE.Material);
        arrows.rotation.x = Math.PI / 2;
        arrows.position.y = y + 0.002;
        this.scene.add(arrows);
        this.slopeTex.push({ tex, dir: new THREE.Vector2(z.slope.x, z.slope.y).normalize() });
      } else {
        const m = new THREE.Mesh(g, mat(z.kind === "sand" ? COLORS.sand : COLORS.water, { side: THREE.DoubleSide }));
        m.rotation.x = Math.PI / 2;
        // Just over the green (the green's top is at 0), like the sand.
        m.position.y = y;
        m.receiveShadow = true;
        this.scene.add(m);
      }
    });

    // Walls, banks and blocks.
    const wallParts: THREE.BufferGeometry[] = [];
    for (const w of hole.walls) {
      const len = Math.hypot(w.bx - w.ax, w.by - w.ay);
      const g = new THREE.BoxGeometry(len + WALL_T, WALL_H, WALL_T);
      g.rotateY(-Math.atan2(w.by - w.ay, w.bx - w.ax));
      g.translate((w.ax + w.bx) / 2, WALL_H / 2, (w.ay + w.by) / 2);
      wallParts.push(g);
    }
    for (const b of hole.blocks) {
      const g = new THREE.ExtrudeGeometry(shapeOf(b), { depth: WALL_H, bevelEnabled: false });
      g.rotateX(Math.PI / 2);
      g.translate(0, WALL_H, 0);
      wallParts.push(g.index ? g.toNonIndexed() : g.clone());
      g.dispose();
    }
    if (wallParts.length) {
      const merged = keep(mergeGeometries(wallParts.map((g) => (g.index ? g.toNonIndexed() : g)))!);
      wallParts.forEach((g) => g.dispose());
      const walls = new THREE.Mesh(merged, mat(COLORS.wall));
      walls.castShadow = true;
      walls.receiveShadow = true;
      this.scene.add(walls);
    }

    // Bumpers: pink talos with eyes.
    const eyeW = mat(COLORS.wall);
    const eyeB = mat(COLORS.ink);
    const eyeGeo = keep(new THREE.SphereGeometry(1, 16, 12));
    for (const b of hole.bumpers) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(keep(new THREE.CylinderGeometry(b.r, b.r, 0.55, 24)), mat(COLORS.pink));
      body.position.y = 0.275;
      body.castShadow = true;
      g.add(body);
      const top = new THREE.Mesh(keep(new THREE.SphereGeometry(b.r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), mat(COLORS.pink));
      top.position.y = 0.55;
      top.castShadow = true;
      g.add(top);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(eyeGeo, eyeW);
        eye.scale.setScalar(b.r * 0.28);
        eye.position.set(s * b.r * 0.38, 0.55, b.r * 0.86);
        g.add(eye);
        const pupil = new THREE.Mesh(eyeGeo, eyeB);
        pupil.scale.setScalar(b.r * 0.14);
        pupil.position.set(s * b.r * 0.38, 0.55, b.r * 0.86 + b.r * 0.2);
        g.add(pupil);
      }
      g.position.set(b.x, 0, b.y);
      this.scene.add(g);
      this.bumpers.push(g);
    }

    // Mills: a post and arms turning over the lane.
    const armMat = mat(COLORS.orange);
    hole.mills.forEach((m, index) => {
      const post = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.2, 0.26, 0.9, 16)), mat(COLORS.ink));
      post.position.set(m.x, 0.45, m.y);
      post.castShadow = true;
      this.scene.add(post);
      const group = new THREE.Group();
      group.position.set(m.x, 0, m.y);
      for (let k = 0; k < m.arms; k++) {
        const arm = new THREE.Mesh(keep(new THREE.BoxGeometry(m.len, 0.34, MILL_T * 2)), armMat);
        arm.position.set(m.len / 2, 0.2, 0);
        const holder = new THREE.Group();
        holder.rotation.y = -(k * Math.PI * 2) / m.arms;
        arm.castShadow = true;
        holder.add(arm);
        group.add(holder);
      }
      const cap = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 16)), mat(COLORS.yellow));
      cap.position.y = 0.96;
      group.add(cap);
      this.scene.add(group);
      this.mills.push({ group, index });
    });

    // The cup and its flag.
    const cup = new THREE.Mesh(keep(new THREE.CircleGeometry(CUP_R, 32)), new THREE.MeshBasicMaterial({ color: COLORS.ink }));
    this.disposables.push(cup.material as THREE.Material);
    cup.rotation.x = -Math.PI / 2;
    cup.position.set(hole.cup.x, 0.008, hole.cup.y);
    this.scene.add(cup);
    const rim = new THREE.Mesh(keep(new THREE.RingGeometry(CUP_R, CUP_R + 0.05, 32)), mat(COLORS.wall));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(hole.cup.x, 0.009, hole.cup.y);
    this.scene.add(rim);
    this.flag = new THREE.Group();
    const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8)), mat(COLORS.wall));
    pole.position.y = 1.1;
    pole.castShadow = true;
    this.flag.add(pole);
    const cloth = new THREE.Shape();
    cloth.moveTo(0, 0);
    cloth.lineTo(0.95, -0.25);
    cloth.lineTo(0, -0.55);
    cloth.closePath();
    this.flagCloth = new THREE.Mesh(keep(new THREE.ShapeGeometry(cloth)), mat(COLORS.yellow, { side: THREE.DoubleSide }));
    this.flagCloth.position.y = 2.2;
    this.flagCloth.castShadow = true;
    this.flag.add(this.flagCloth);
    this.flag.position.set(hole.cup.x, 0, hole.cup.y);
    this.scene.add(this.flag);

    // The tee: a white ring.
    const tee = new THREE.Mesh(keep(new THREE.RingGeometry(0.44, 0.5, 32)), new THREE.MeshBasicMaterial({ color: COLORS.wall, transparent: true, opacity: 0.7 }));
    this.disposables.push(tee.material as THREE.Material);
    tee.rotation.x = -Math.PI / 2;
    tee.position.set(hole.tee.x, 0.01, hole.tee.y);
    this.scene.add(tee);

    // Aim dots (a pool).
    this.aimMat = new THREE.MeshBasicMaterial({ color: COLORS.wall });
    this.disposables.push(this.aimMat);
    const dotGeo = keep(new THREE.SphereGeometry(0.07, 10, 8));
    for (let i = 0; i < 20; i++) {
      const d = new THREE.Mesh(dotGeo, this.aimMat);
      d.visible = false;
      this.scene.add(d);
      this.aimDots.push(d);
    }
  }

  setSize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** A drag on screen (dx right, dy down) as a direction on the hole, from the camera's heading. */
  screenToHoleVec(dx: number, dy: number): { x: number; y: number } {
    const fx = Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    // Screen right is (−fz, fx); screen up is forward.
    return { x: -fz * dx + fx * -dy, y: fx * dx + fz * -dy };
  }

  private ballMesh(id: string): BallMesh {
    let b = this.balls.get(id);
    if (b) return b;
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: COLORS.wall, transparent: true });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), mat);
    ball.position.y = BALL_R;
    ball.castShadow = true;
    group.add(ball);
    const ringMat = new THREE.MeshBasicMaterial({ color: COLORS.wall, transparent: true });
    const ring = new THREE.Mesh(new THREE.RingGeometry(BALL_R + 0.04, BALL_R + 0.14, 24), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    group.add(ring);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_R * 1.05, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0.05, 0.011, 0.07);
    group.add(shadow);
    this.scene.add(group);
    b = { group, ball, ring, shadow, mat, ringMat };
    this.balls.set(id, b);
    return b;
  }

  private placeCamera(v: Scene3DView, first: boolean) {
    const h = this.hole;
    const me = v.balls.find((b) => b.me);
    let target: THREE.Vector3;
    let yaw: number;
    let dist: number;
    let height: number;
    if (this.mode === "todo" || !me) {
      const o = this.fitOverview();
      target = o.target;
      yaw = o.yaw;
      dist = o.dist;
      height = o.height;
    } else {
      target = new THREE.Vector3(me.x, 0, me.y);
      // Toward where the route goes from here (not straight at a cup behind a wall).
      const to = aheadPoint(h, me.x, me.y, 6);
      const dx = to.x - me.x;
      const dy = to.y - me.y;
      yaw = Math.hypot(dx, dy) > 1.2 ? Math.atan2(dx, -dy) : this.camYaw;
      dist = 6.5;
      height = 7.5;
    }
    if (first || !this.camReady) {
      this.camTarget.copy(target);
      this.camYaw = yaw;
      this.camReady = true;
    } else {
      this.camTarget.lerp(target, 0.06);
      let d = yaw - this.camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.camYaw += d * 0.035;
    }
    const fx = Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    this.camera.position.set(this.camTarget.x - fx * dist, height, this.camTarget.z - fz * dist);
    this.camera.lookAt(this.camTarget.x + fx * 1.5, 0, this.camTarget.z + fz * 1.5);
  }

  /**
   * The whole hole in view: looking along its longer side on a tall screen
   * (across it on a wide one), from the tee's end, as close as the corners allow.
   */
  private fitOverview() {
    const aspect = this.camera.aspect;
    if (this.overview && this.overview.aspect === aspect) return this.overview;
    const h = this.hole;
    const target = new THREE.Vector3(h.w / 2, 0, h.h / 2);
    const tall = h.h >= h.w;
    // Look along y (yaw 0 or π) or along x (±π/2): the long side into the screen when the screen is tall.
    const alongY = tall === aspect < 1.2;
    const options = alongY ? [0, Math.PI] : [Math.PI / 2, -Math.PI / 2];
    // From the tee's end: the tee nearer the camera.
    const yaw = options.reduce((best, y) => {
      const fx = Math.sin(y);
      const fz = -Math.cos(y);
      const score = (h.tee.x - target.x) * fx + (h.tee.y - target.z) * fz;
      const bx = Math.sin(best);
      const bz = -Math.cos(best);
      return score < (h.tee.x - target.x) * bx + (h.tee.y - target.z) * bz ? y : best;
    });
    const fx = Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const corners = [
      [0, 0],
      [h.w, 0],
      [0, h.h],
      [h.w, h.h],
    ].map(([x, z]) => new THREE.Vector3(x, WALL_H, z));
    const cam = this.camera.clone();
    const fits = (k: number) => {
      cam.position.set(target.x - fx * k * 0.75, k, target.z - fz * k * 0.75);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      return corners.every((c) => {
        const p = c.clone().project(cam);
        return Math.abs(p.x) < 0.94 && Math.abs(p.y) < 0.9;
      });
    };
    let lo = 2;
    let hi = 120;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    // placeCamera looks 1.5 ahead of the target; aim the target that much short.
    const o = { target: target.clone().addScaledVector(new THREE.Vector3(fx, 0, fz), -1.5), yaw, dist: hi * 0.75, height: hi, aspect };
    this.overview = o;
    return o;
  }

  /** Switching camera snaps to the new one. */
  setMode(mode: CameraMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.camReady = false;
  }

  render(v: Scene3DView) {
    // Mills and bumpers.
    for (const { group, index } of this.mills) group.rotation.y = -millAngle(this.hole.mills[index], v.t);
    this.bumpers.forEach((g, i) => {
      const hit = v.bumped?.get(i);
      const age = hit === undefined ? 1 : v.now - hit;
      const squash = age < 0.35 ? Math.sin(age * 40) * 0.18 * (1 - age / 0.35) : 0;
      g.scale.set(1 + squash, 1 - squash, 1 + squash);
      // Look at the camera.
      g.rotation.y = Math.atan2(this.camera.position.x - g.position.x, this.camera.position.z - g.position.z);
    });
    for (const s of this.slopeTex) {
      const k = (v.now * 0.5) / 1.2;
      s.tex.offset.set(-k, 0);
    }
    this.flagCloth.rotation.y = Math.sin(v.now * 2.4) * 0.25;

    // Balls.
    const seen = new Set<string>();
    for (const b of v.balls) {
      seen.add(b.id);
      const m = this.ballMesh(b.id);
      m.group.visible = !b.sunk;
      m.group.position.set(b.x, 0, b.y);
      m.mat.opacity = b.me ? 1 : 0.65;
      m.mat.color.set(b.me ? COLORS.wall : b.color);
      m.ringMat.color.set(b.color);
      m.ringMat.opacity = b.me ? 1 : 0.5;
    }
    for (const [id, m] of this.balls) {
      if (seen.has(id)) continue;
      this.scene.remove(m.group);
      m.ball.geometry.dispose();
      m.ring.geometry.dispose();
      m.shadow.geometry.dispose();
      m.mat.dispose();
      m.ringMat.dispose();
      (m.shadow.material as THREE.Material).dispose();
      this.balls.delete(id);
    }
    // Flag lifts away when a ball is near, like the 2D one.
    const near = v.balls.some((b) => !b.sunk && Math.hypot(b.x - this.hole.cup.x, b.y - this.hole.cup.y) < 2.2);
    this.flag.visible = !near;

    // Aim.
    if (v.aim) {
      const { x, y, angle, power } = v.aim;
      const len = 1 + power * 6;
      this.aimMat.color.set(power < 0.45 ? COLORS.wall : power < 0.8 ? COLORS.yellow : COLORS.orange);
      this.aimDots.forEach((d, i) => {
        const dd = 0.6 + i * 0.38;
        d.visible = dd < len;
        d.position.set(x + Math.cos(angle) * dd, BALL_R * 0.6, y + Math.sin(angle) * dd);
        d.scale.setScalar(1 - (dd / (len + 0.5)) * 0.5);
      });
    } else for (const d of this.aimDots) d.visible = false;

    this.placeCamera(v, false);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const [, m] of this.balls) {
      m.ball.geometry.dispose();
      m.ring.geometry.dispose();
      m.shadow.geometry.dispose();
      m.mat.dispose();
      m.ringMat.dispose();
      (m.shadow.material as THREE.Material).dispose();
    }
    this.balls.clear();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}
