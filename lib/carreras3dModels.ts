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

// ---- Track dressing (public/models/carreras/deco, Meshy) ------------------------------------

/**
 * The track's dressing: each piece in meters, front +z, on y = 0. The race
 * scene puts them where its drawn ones were (ramps, boost pads, tunnel mouths,
 * tire stacks, trees, buildings), instanced per material.
 */
export type DecoId =
  | "rampa"
  | "turbo"
  | "tunel-boca"
  | "llantas"
  | "cono"
  | "arbol"
  | "cactus"
  | "pino-nieve"
  | "edificio-a"
  | "edificio-b"
  | "edificio-c"
  | "farol"
  | "grada"
  | "cartel"
  | "largada"
  | "valla";
const DECO_IDS: DecoId[] = [
  "rampa", "turbo", "tunel-boca", "llantas", "cono", "arbol", "cactus", "pino-nieve", "edificio-a", "edificio-b", "edificio-c",
  "farol", "grada", "cartel", "largada", "valla",
];

let decos: Partial<Record<DecoId, THREE.Object3D>> | null = null;
let decoLoading: Promise<boolean> | null = null;

/** Loads the dressing once (true when it's there; what fails keeps its drawn piece). */
export function loadDecoModels(): Promise<boolean> {
  if (decoLoading) return decoLoading;
  if (typeof window === "undefined") return Promise.resolve(false);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  decoLoading = (async () => {
    await MeshoptDecoder.ready;
    const got = await Promise.all(DECO_IDS.map((id) => loader.loadAsync(`${DIR}/deco/deco-${id}.glb`).catch(() => null)));
    const out: Partial<Record<DecoId, THREE.Object3D>> = {};
    DECO_IDS.forEach((id, i) => {
      const g = got[i];
      if (!g) return;
      g.scene.updateMatrixWorld(true);
      prepare(g.scene);
      out[id] = g.scene;
    });
    decos = out;
    return Object.keys(out).length > 0;
  })();
  return decoLoading;
}

/** Parts that sway in the wind (leaves, needles, the snow on them). */
const SWAY = new Set(["Hojas", "Verde claro", "Pino", "Nieve"]);
/** Shiny parts. */
const SHINY: Record<string, number> = { Metal: 90, Vidrio: 140, Cartel: 30, Amarillo: 40, Rojo: 40, Azul: 40, Blanco: 30 };

export interface DecoOpts {
  night: boolean;
  shadows: boolean;
  glow: (c: THREE.Color, k: number) => THREE.Color;
  /** A color per copy for a part (multiplies its own; near white), or null to leave it. */
  tint?: (part: string, i: number) => THREE.Color | null;
  /** The wind's clock (seconds), shared with the scene: leaves sway with it. */
  wind?: { value: number };
}

/**
 * A dressing piece repeated at `at` (each a full transform, in the race's
 * units), one InstancedMesh per part with its own material, named like the
 * part. Colors a bit livelier than the files', metal and glass shiny, "Luz"
 * glowing at night; leaves sway with `wind`. Null if the piece didn't load.
 */
export function decoInstances(id: DecoId, at: THREE.Matrix4[], opts: DecoOpts): THREE.Group | null {
  const t = decos?.[id];
  if (!t || !at.length) return null;
  const g = new THREE.Group();
  const m = new THREE.Matrix4();
  // Many copies (trees, fences, buildings): split by zone of the map, so each view only draws the zones it sees.
  const zones = new Map<string, number[]>();
  at.forEach((mat, i) => {
    const key = at.length > ZONE_MIN ? `${Math.floor(mat.elements[12] / ZONE_SIZE)},${Math.floor(mat.elements[14] / ZONE_SIZE)}` : "";
    const list = zones.get(key);
    if (list) list.push(i);
    else zones.set(key, [i]);
  });
  const zoned = zones.size > 1;
  const zoneGroups = [...zones.values()].map(() => new THREE.Group());
  t.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as THREE.MeshStandardMaterial;
    const name = src.name;
    // The files are quantized (16-bit, normalized): baked as is, the positions would be clamped to ±1. Plain floats first.
    const geo = new THREE.BufferGeometry();
    for (const attrName of ["position", "normal"]) {
      const attr = mesh.geometry.getAttribute(attrName);
      if (!attr) continue;
      const out = new Float32Array(attr.count * 3);
      for (let i = 0; i < attr.count; i++) {
        out[i * 3] = attr.getX(i);
        out[i * 3 + 1] = attr.getY(i);
        out[i * 3 + 2] = attr.getZ(i);
      }
      geo.setAttribute(attrName, new THREE.BufferAttribute(out, 3));
    }
    if (mesh.geometry.index) geo.setIndex(Array.from(mesh.geometry.index.array));
    geo.applyMatrix4(mesh.matrixWorld);
    const normals = geo.getAttribute("normal");
    if (!normals) geo.computeVertexNormals();
    else {
      // Some exported normals are zero: in the shader that's a NaN, and bloom smears one NaN pixel over the whole screen.
      const flat = geo.clone();
      flat.computeVertexNormals();
      const fix = flat.getAttribute("normal");
      for (let i = 0; i < normals.count; i++) {
        const x = normals.getX(i), y = normals.getY(i), z = normals.getZ(i);
        const len = Math.hypot(x, y, z);
        if (!(len > 1e-4)) {
          const fx = fix.getX(i), fy = fix.getY(i), fz = fix.getZ(i);
          if (Math.hypot(fx, fy, fz) > 1e-4) normals.setXYZ(i, fx, fy, fz);
          else normals.setXYZ(i, 0, 1, 0);
        } else normals.setXYZ(i, x / len, y / len, z / len);
      }
      flat.dispose();
    }
    // Livelier than the file: a touch more saturated and light.
    const color = src.color.clone().offsetHSL(0, 0.12, 0.03);
    let material: THREE.Material;
    if (name === "Luz") {
      // Lights glow only at night (softly); by day they're plain surfaces.
      material = opts.night ? new THREE.MeshBasicMaterial({ color: opts.glow(src.color.clone(), 1.15) }) : new THREE.MeshLambertMaterial({ color: src.color.clone().multiplyScalar(0.55) });
    } else if (name in SHINY) {
      material = new THREE.MeshPhongMaterial({ color, shininess: SHINY[name], specular: name === "Vidrio" || name === "Metal" ? 0xcfe3ff : 0x444444 });
    } else {
      material = new THREE.MeshLambertMaterial({ color });
    }
    material.name = name;
    if (opts.wind && SWAY.has(name)) {
      const wind = opts.wind;
      // Sway: the higher a vertex, the more it moves; each copy in its own phase.
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uWind = wind;
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nuniform float uWind;")
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
            #ifdef USE_INSTANCING
              float ph = instanceMatrix[3].x * 0.011 + instanceMatrix[3].z * 0.017;
            #else
              float ph = 0.0;
            #endif
            float hgt = max(position.y - 1.0, 0.0);
            transformed.x += sin(uWind * 1.7 + ph) * hgt * 0.045;
            transformed.z += cos(uWind * 1.3 + ph) * hgt * 0.03;`
          );
      };
      material.customProgramCacheKey = () => "deco-sway";
    }
    [...zones.values()].forEach((list, z) => {
      const inst = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((i, k) => {
        inst.setMatrixAt(k, m.copy(at[i]));
        const c = opts.tint?.(name, i);
        if (c) inst.setColorAt(k, c);
      });
      inst.name = name;
      inst.castShadow = opts.shadows && name !== "Luz";
      inst.computeBoundingSphere();
      (zoned ? zoneGroups[z] : g).add(inst);
    });
  });
  if (zoned) {
    // Each zone knows its bounds: the scene hides the ones past the fog (`userData.zone`).
    for (const zg of zoneGroups) {
      const sphere = new THREE.Sphere();
      let first = true;
      for (const c of zg.children) {
        const b = (c as THREE.InstancedMesh).boundingSphere;
        if (!b) continue;
        if (first) sphere.copy(b);
        else sphere.union(b);
        first = false;
      }
      zg.userData.zone = sphere;
      g.add(zg);
    }
  }
  return g;
}

/** Pieces with more copies than this are split by zone, `ZONE_SIZE` units a side. */
const ZONE_MIN = 24;
const ZONE_SIZE = 700;
