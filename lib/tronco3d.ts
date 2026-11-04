import * as THREE from "three";
import { LOG_LENGTH, RING, jumpHeight } from "./tronco";

/**
 * El tronco in 3D (three.js, browser only): a meadow, a sand ring, a stump in
 * the middle with the log turning on it, and the players as talos (flat
 * colored bodies with eyes) that jump, kick and fall. Everything is drawn
 * from what the game tells each frame; nothing here decides anything.
 *
 * Axes: y is up; an angle θ on the ground is the point (cos θ, 0, −sin θ),
 * the same way the log's pivot turns (rotation.y = θ).
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
}

export interface SceneView {
  logAngle: number;
  logDir: 1 | -1;
  shake: boolean;
  /** The log is turning (not resting before the opening kick). */
  rolling: boolean;
  /** A kick now would work: the ring under me turns green. */
  kickable: boolean;
  players: PlayerView[];
  /** Where my camera stands (my seat), or null to watch from the front. */
  myAngle: number | null;
  /** 0 far … 1 the log is on me (the ring under my talo). */
  danger: number;
  time: number;
}

const at = (angle: number, r: number) => new THREE.Vector3(Math.cos(angle) * r, 0, -Math.sin(angle) * r);

interface Talo {
  root: THREE.Group;
  body: THREE.Group;
  foot: THREE.Mesh;
  shadow: THREE.Mesh;
  label: THREE.Sprite;
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

export class TroncoScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  private pivot = new THREE.Group();
  private log = new THREE.Group();
  private talos = new Map<string, Talo>();
  private warn: THREE.Mesh;
  private camAngle = Math.PI / 2;
  private disposables: { dispose: () => void }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
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

    // Trees and bushes around the meadow.
    const trunk = geo(new THREE.CylinderGeometry(0.18, 0.24, 1.2, 8));
    const crown = geo(new THREE.SphereGeometry(1, 12, 10));
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2 + (k % 3) * 0.2;
      const r = 10 + (k % 4) * 2.2;
      const p = at(a, r);
      const t = new THREE.Mesh(trunk, mat("#7A4E26"));
      t.position.set(p.x, 0.6, p.z);
      const c = new THREE.Mesh(crown, mat(k % 2 ? "#3E9B4F" : "#4FB15E"));
      c.position.set(p.x, 1.7, p.z);
      c.scale.setScalar(0.9 + (k % 3) * 0.25);
      c.castShadow = true;
      this.scene.add(t, c);
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
    const bark = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.3, 0.3, logLen, 18)), mat("#8B5A2B"));
    bark.rotation.z = Math.PI / 2;
    bark.position.set(logLen / 2, 0, 0);
    bark.castShadow = true;
    this.log.add(bark);
    for (let k = 1; k < 6; k++) {
      const ring = new THREE.Mesh(geo(new THREE.TorusGeometry(0.305, 0.03, 6, 18)), mat("#6B4220"));
      ring.rotation.y = Math.PI / 2;
      ring.position.x = (logLen * k) / 6;
      this.log.add(ring);
    }
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
    this.scene.add(this.pivot);

    // The warning ring under my talo.
    const warnMat = new THREE.MeshBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.0 });
    this.disposables.push(warnMat);
    this.warn = new THREE.Mesh(geo(new THREE.RingGeometry(0.62, 0.8, 32)), warnMat);
    this.warn.rotation.x = -Math.PI / 2;
    this.warn.position.y = 0.02;
    this.scene.add(this.warn);
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
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, white);
      eye.position.set(side * 0.16, 1.0, 0.36);
      const pupil = new THREE.Mesh(pupilGeo, black);
      pupil.position.set(side * 0.16, 0.98, 0.47);
      body.add(eye, pupil);
    }
    const footGeo = new THREE.SphereGeometry(0.15, 10, 8);
    const footMat = new THREE.MeshLambertMaterial({ color: "#222222" });
    const left = new THREE.Mesh(footGeo, footMat);
    left.position.set(-0.18, 0.08, 0.05);
    const foot = new THREE.Mesh(footGeo, footMat);
    foot.position.set(0.18, 0.08, 0.05);
    body.add(left, foot);
    root.add(body);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.22, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.015;
    root.add(shadow);
    const label = labelSprite(p.me ? "Vos" : p.name, p.me);
    label.position.y = 1.85;
    root.add(label);
    this.scene.add(root);
    return { root, body, foot, shadow, label };
  }

  private dropTalo(t: Talo) {
    this.scene.remove(t.root);
    t.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        (mat as THREE.SpriteMaterial).map?.dispose();
        mat.dispose();
      }
    });
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    // Narrow phones: a wider view so the whole ring fits.
    this.camera.fov = this.camera.aspect < 0.8 ? 62 : 48;
    this.camera.updateProjectionMatrix();
  }

  frame(v: SceneView) {
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
      const h = p.fallS < 0 ? jumpHeight(p.jumpS) : 0;
      t.body.position.y = h;
      t.shadow.scale.setScalar(1 - h * 0.35);
      // Kick: lean back and the foot goes forward.
      const kick = p.kickS >= 0 && p.kickS < 0.3 ? Math.sin((p.kickS / 0.3) * Math.PI) : 0;
      t.foot.position.z = 0.05 + kick * 0.45;
      t.foot.position.y = 0.08 + kick * 0.25;
      t.body.rotation.x = -kick * 0.35;
      // Squash before a jump lands.
      t.body.scale.set(1, 1, 1);
      if (p.fallS < 0 && p.jumpS >= 0 && p.jumpS < 0.06) t.body.scale.set(1.12, 0.85, 1.12);
      // Knocked down: falls backwards and slides out.
      if (p.fallS >= 0) {
        const f = Math.min(1, p.fallS / 0.35);
        t.body.rotation.x = (-Math.PI / 2) * f;
        t.root.position.copy(at(p.angle, RING + 0.9 * f));
        t.label.visible = false;
      } else {
        t.label.visible = true;
      }
    }

    // The log.
    this.pivot.rotation.y = v.logAngle;
    const jiggle = v.shake ? Math.sin(v.time * 55) * 0.05 : 0;
    this.log.rotation.x = jiggle;
    this.log.position.y = 0.34 + (v.shake ? Math.abs(jiggle) * 0.6 : 0);
    // It rolls as it goes.
    if (v.rolling) (this.log.children[0] as THREE.Mesh).rotation.x = v.time * 6 * v.logDir;

    // Warning under me.
    const me = v.players.find((p) => p.me && p.fallS < 0);
    const warnMat = this.warn.material as THREE.MeshBasicMaterial;
    if (me) {
      this.warn.position.copy(at(me.angle, RING)).setY(0.02);
      if (v.kickable) {
        // Kick now: green and a bit bigger, pulsing.
        warnMat.opacity = 0.95;
        warnMat.color.set("#34C759");
        this.warn.scale.setScalar(1.3 + Math.sin(v.time * 30) * 0.06);
      } else {
        warnMat.opacity = 0.25 + v.danger * 0.7;
        warnMat.color.set(v.danger > 0.75 ? "#FF3B30" : v.danger > 0.4 ? "#FFD400" : "#FFFFFF");
        this.warn.scale.setScalar(1.25 - v.danger * 0.25);
      }
    } else {
      warnMat.opacity = 0;
    }

    // Camera: behind my seat, looking over the ring.
    const want = v.myAngle ?? Math.PI / 2 + Math.PI;
    let d = want - this.camAngle;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.camAngle += d * 0.08;
    const narrow = this.camera.aspect < 0.8;
    const back = at(this.camAngle, RING + (narrow ? 6.2 : 5.4));
    this.camera.position.set(back.x, narrow ? 8.2 : 6.2, back.z);
    const look = at(this.camAngle, narrow ? -0.6 : -0.3);
    this.camera.lookAt(look.x, 0.2, look.z);

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const t of this.talos.values()) this.dropTalo(t);
    this.talos.clear();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}
