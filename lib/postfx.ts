import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * Graphics quality shared by the 3D games (Fuego cruzado, Arena medieval,
 * Carreras 3D). "alta" adds bloom (bright things glow) and real-time shadows;
 * "baja" skips both so weaker phones stay smooth. Browser only.
 */
export type Quality = "alta" | "baja";

/** Colors over 1 glow under bloom: a material color multiplied by `k`. */
export function glowColor(color: THREE.ColorRepresentation, k: number): THREE.Color {
  return new THREE.Color(color).multiplyScalar(k);
}

/**
 * Bloom over a scene: render it through `render(camera)` instead of
 * `renderer.render`. The camera can change between calls (split screens
 * draw full-canvas views only).
 */
export class Bloom {
  private composer: EffectComposer;
  private pass: RenderPass;
  private size = new THREE.Vector2();

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    opts: { strength?: number; radius?: number; threshold?: number } = {}
  ) {
    this.composer = new EffectComposer(renderer);
    this.pass = new RenderPass(scene, camera);
    this.composer.addPass(this.pass);
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), opts.strength ?? 0.7, opts.radius ?? 0.45, opts.threshold ?? 0.82));
    this.composer.addPass(new OutputPass());
  }

  render(camera: THREE.Camera, dt: number) {
    const r = this.renderer;
    const dpr = r.getPixelRatio();
    r.getSize(this.size);
    if (this.composer.renderer.getPixelRatio() !== dpr) this.composer.setPixelRatio(dpr);
    // Keep the composer's buffers the canvas' size.
    const w = this.size.x;
    const h = this.size.y;
    const target = this.composer.readBuffer;
    if (target.width !== Math.floor(w * dpr) || target.height !== Math.floor(h * dpr)) this.composer.setSize(w, h);
    this.pass.camera = camera;
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose();
  }
}

/** Points the sun's shadow camera at an area around (x, z), `half` units each side. */
export function aimShadow(sun: THREE.DirectionalLight, x: number, y: number, z: number, half: number, dir: THREE.Vector3) {
  sun.position.set(x + dir.x * half * 3, y + dir.y * half * 3, z + dir.z * half * 3);
  sun.target.position.set(x, y, z);
  sun.target.updateMatrixWorld();
  const c = sun.shadow.camera;
  if (c.right !== half) {
    c.left = -half;
    c.right = half;
    c.top = half;
    c.bottom = -half;
    c.near = half * 0.5;
    c.far = half * 6;
    c.updateProjectionMatrix();
  }
}
