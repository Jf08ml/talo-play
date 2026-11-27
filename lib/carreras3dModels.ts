import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/**
 * Carreras 3D's modeled cars (public/models/carreras, made in Meshy,
 * meshopt-compressed): six bodies without wheels and two wheels, loaded once.
 * A body comes in meters, nose toward +z, wheels resting on y = 0; the race
 * draws it a quarter turn round and `MODEL_SCALE` up, so it measures what the
 * old drawn car did (34 long). Materials are named by part ("Pintura",
 * "Franjas", "Vidrio", "Negro", "Cromo", "Faros", "Luces traseras"; wheels
 * "Neumático", "Llanta") and swapped for the car's own (lib/carreras3d.ts).
 */

export type CarBodyId = "deportivo" | "kart" | "clasico" | "camioneta" | "formula" | "muscle";
type WheelId = "rueda" | "rueda-gruesa";

/** Race units per meter: a 4 m body is the 34-unit car. */
export const MODEL_SCALE = 8.5;

/**
 * Each body's wheels, measured on the models (the empty wheel wells; the
 * formula's are outside its narrow body): which wheel, its radius, how far
 * out (x) and where along (z, front and back), in meters.
 */
export const CAR_BODIES: Record<CarBodyId, { wheel: WheelId; r: number; x: number; front: number; back: number }> = {
  deportivo: { wheel: "rueda", r: 0.35, x: 0.82, front: 1.22, back: -1.22 },
  kart: { wheel: "rueda", r: 0.35, x: 0.85, front: 1.22, back: -1.2 },
  clasico: { wheel: "rueda", r: 0.35, x: 0.81, front: 1.22, back: -1.22 },
  camioneta: { wheel: "rueda-gruesa", r: 0.47, x: 0.8, front: 1.23, back: -1.23 },
  formula: { wheel: "rueda", r: 0.35, x: 0.87, front: 1.0, back: -1.4 },
  muscle: { wheel: "rueda", r: 0.35, x: 0.84, front: 1.24, back: -1.24 },
};

const DIR = "/models/carreras";

interface BodyTemplate {
  scene: THREE.Object3D;
  /** Where the race number goes on the right door (model space; mirrored on the left). */
  number: THREE.Vector3;
}

let bodies: Partial<Record<CarBodyId, BodyTemplate>> | null = null;
const wheels: Partial<Record<WheelId, THREE.Object3D>> = {};
let loading: Promise<boolean> | null = null;

/** Bounds from the vertices (the exporter's are not to be trusted), geometry kept by the template. */
function prepare(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.computeBoundingBox();
    m.geometry.computeBoundingSphere();
    m.geometry.userData.shared = true;
  });
}

/** The door: the body's side around the middle, at door height. */
function numberSpot(root: THREE.Object3D): THREE.Vector3 {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let side = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const p = m.geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      if (Math.abs(v.z) < 0.35 && v.y > 0.45 && v.y < 0.85) side = Math.max(side, v.x);
    }
  });
  return new THREE.Vector3(side + 0.02, 0.65, 0);
}

/** Loads every body and wheel once (true when at least the bodies are there). */
export function loadCarModels(): Promise<boolean> {
  if (loading) return loading;
  if (typeof window === "undefined") return Promise.resolve(false);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loading = (async () => {
    await MeshoptDecoder.ready;
    const ids = Object.keys(CAR_BODIES) as CarBodyId[];
    const wheelIds: WheelId[] = ["rueda", "rueda-gruesa"];
    const [bs, ws] = await Promise.all([
      Promise.all(ids.map((id) => loader.loadAsync(`${DIR}/auto-${id}.glb`).catch(() => null))),
      Promise.all(wheelIds.map((id) => loader.loadAsync(`${DIR}/${id}.glb`).catch(() => null))),
    ]);
    const got: Partial<Record<CarBodyId, BodyTemplate>> = {};
    ids.forEach((id, i) => {
      const g = bs[i];
      if (!g) return;
      prepare(g.scene);
      got[id] = { scene: g.scene, number: numberSpot(g.scene) };
    });
    wheelIds.forEach((id, i) => {
      const g = ws[i];
      if (!g) return;
      prepare(g.scene);
      wheels[id] = g.scene;
    });
    // Without the wheels a body can't be drawn: then the race keeps the drawn cars.
    if (!wheels.rueda) return false;
    bodies = got;
    return Object.keys(got).length > 0;
  })();
  return loading;
}

export const carModelsReady = () => bodies !== null;

/** A body's copy (its own nodes; geometry shared) and where its number goes, or null if not loaded. */
export function carBody(id: string): { scene: THREE.Object3D; number: THREE.Vector3; spec: (typeof CAR_BODIES)[CarBodyId] } | null {
  const t = bodies?.[id as CarBodyId];
  const spec = CAR_BODIES[id as CarBodyId];
  const wheel = spec && (wheels[spec.wheel] ?? wheels.rueda);
  if (!t || !spec || !wheel) return null;
  return { scene: t.scene.clone(), number: t.number, spec };
}

/** A wheel's copy for a body (its axle along x, outer face +x). */
export function carWheel(id: string): THREE.Object3D | null {
  const spec = CAR_BODIES[id as CarBodyId];
  const t = spec ? (wheels[spec.wheel] ?? wheels.rueda) : null;
  return t ? t.clone() : null;
}
