import * as THREE from "three";

/**
 * Arena medieval's effects (three.js, browser only): pooled point particles
 * (sparks, dust, embers), swing trails that follow a weapon's tip, and hit
 * impacts (a flash and an expanding ring). Everything is created up front.
 */

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

export class Particles {
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
    private dragK = 2
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

  /** One particle; `grow` makes it swell (m/s), for dust. */
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
      this.vel[k + 1] -= this.gravity * dt;
      this.pos[k] += this.vel[k] * dt;
      const y = this.pos[k + 1] + this.vel[k + 1] * dt;
      // Sparks bounce off the sand once, losing most of their speed.
      if (y < 0.02 && this.vel[k + 1] < 0) {
        this.vel[k + 1] *= -0.3;
        this.vel[k] *= 0.5;
        this.vel[k + 2] *= 0.5;
        this.pos[k + 1] = 0.02;
      } else this.pos[k + 1] = y;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.startAlpha[i] * (this.grow[i] > 0 ? Math.min(1, f * 1.6) * f : f);
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

/**
 * A ribbon between a weapon's base and tip over the last moments of a
 * swing, bright at the head and fading at the tail. Fed in world space.
 */
export class SwingTrail {
  readonly mesh: THREE.Mesh;
  private samples: { b: THREE.Vector3; t: THREE.Vector3; at: number; s: number }[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private tipCurve = new THREE.CatmullRomCurve3([], false, "centripetal");
  private baseCurve = new THREE.CatmullRomCurve3([], false, "centripetal");
  private tmp = new THREE.Vector3();
  private static SEG = 18;
  private static LIFE = 0.2;

  constructor(private color: THREE.Color) {
    const n = (SwingTrail.SEG + 1) * 2;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    const idx: number[] = [];
    for (let i = 0; i < SwingTrail.SEG; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
  }

  /** Adds where the weapon is now, at `strength` 0–1. */
  push(base: THREE.Vector3, tip: THREE.Vector3, now: number, strength: number) {
    const last = this.samples[this.samples.length - 1];
    if (last && last.t.distanceToSquared(tip) < 1e-5) return;
    this.samples.push({ b: base.clone(), t: tip.clone(), at: now, s: strength });
    if (this.samples.length > 10) this.samples.shift();
  }

  update(now: number) {
    while (this.samples.length && now - this.samples[0].at > SwingTrail.LIFE) this.samples.shift();
    const n = this.samples.length;
    if (n < 2) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.tipCurve.points = this.samples.map((s) => s.t);
    this.baseCurve.points = this.samples.map((s) => s.b);
    const SEG = SwingTrail.SEG;
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      // Age along the ribbon, from the oldest sample (u = 0) to the newest.
      const fi = u * (n - 1);
      const lo = Math.floor(fi);
      const hi = Math.min(n - 1, lo + 1);
      const at = this.samples[lo].at + (this.samples[hi].at - this.samples[lo].at) * (fi - lo);
      const st = this.samples[lo].s + (this.samples[hi].s - this.samples[lo].s) * (fi - lo);
      const fade = Math.max(0, 1 - (now - at) / SwingTrail.LIFE) * u * st;
      this.tipCurve.getPoint(u, this.tmp);
      this.pos.set([this.tmp.x, this.tmp.y, this.tmp.z], i * 6);
      this.baseCurve.getPoint(u, this.tmp);
      this.pos.set([this.tmp.x, this.tmp.y, this.tmp.z], i * 6 + 3);
      const c = this.color;
      this.col.set([c.r * fade, c.g * fade, c.b * fade], i * 6);
      // The base end of the ribbon is dimmer.
      this.col.set([c.r * fade * 0.15, c.g * fade * 0.15, c.b * fade * 0.15], i * 6 + 3);
    }
    const a = this.mesh.geometry.attributes;
    a.position.needsUpdate = true;
    a.color.needsUpdate = true;
  }

  clear() {
    this.samples.length = 0;
    this.mesh.visible = false;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Hit impacts: a quick flash and a ring that opens facing the camera. */
export class Impacts {
  readonly group = new THREE.Group();
  private flashes: { s: THREE.Sprite; t: number; life: number; size: number }[] = [];
  private rings: { m: THREE.Mesh; t: number; life: number; size: number }[] = [];
  private nf = 0;
  private nr = 0;

  constructor(glow: THREE.Texture, count = 8) {
    const ringGeo = new THREE.RingGeometry(0.72, 1, 32);
    ringGeo.userData.sharedRing = true;
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      s.visible = false;
      s.renderOrder = 5;
      this.flashes.push({ s, t: 1, life: 1, size: 1 });
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.visible = false;
      m.renderOrder = 5;
      this.rings.push({ m, t: 1, life: 1, size: 1 });
      this.group.add(s, m);
    }
  }

  spawn(x: number, y: number, z: number, color: THREE.Color, flashSize: number, ringSize: number, life = 0.22) {
    const f = this.flashes[this.nf];
    this.nf = (this.nf + 1) % this.flashes.length;
    f.s.position.set(x, y, z);
    (f.s.material as THREE.SpriteMaterial).color.copy(color);
    f.t = 0;
    f.life = life * 0.6;
    f.size = flashSize;
    f.s.visible = true;
    if (ringSize > 0) {
      const r = this.rings[this.nr];
      this.nr = (this.nr + 1) % this.rings.length;
      r.m.position.set(x, y, z);
      (r.m.material as THREE.MeshBasicMaterial).color.copy(color);
      r.t = 0;
      r.life = life;
      r.size = ringSize;
      r.m.visible = true;
    }
  }

  update(dt: number, camera: THREE.Camera) {
    for (const f of this.flashes) {
      if (!f.s.visible) continue;
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        f.s.visible = false;
        continue;
      }
      f.s.scale.setScalar(f.size * (0.6 + 0.8 * Math.sqrt(k)));
      (f.s.material as THREE.SpriteMaterial).opacity = 1 - k * k;
    }
    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) {
        r.m.visible = false;
        continue;
      }
      r.m.quaternion.copy(camera.quaternion);
      r.m.scale.setScalar(r.size * (0.15 + 0.85 * (1 - Math.pow(1 - k, 3))));
      (r.m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
    }
  }
}
