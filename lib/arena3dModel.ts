import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/**
 * Arena medieval's modeled knight (public/models/talo-knight, three.js,
 * browser only): the rigged Talo knight GLB plus the helmet pieces made in
 * Meshy, loaded once and shared by the lobby preview and the battle.
 *
 * The battle keeps animating its own little rig (lib/arena3dKnight.ts
 * `animateKnight`, every act and weapon), and `driveKnightModel` copies that
 * rig's rotations onto the GLB's bones each frame. That works because every
 * bone rests with an identity rotation: the model only differs in facing +z
 * (the game's knights face -z, so it hangs under a half turn) and in resting
 * its arms in an A-pose (a fixed correction per arm bone, `REST`).
 */

const MODELS_DIR = "/models/talo-knight";
const KNIGHT_URL = `${MODELS_DIR}/talo-caballero-v2.glb`;

/**
 * GLTFLoader renames every node with `sanitizeNodeName` (spaces → "_", drops
 * `[]\.:/`), so "Casco · cúpula" arrives as "Casco_·_cúpula" and "Clavicle.L"
 * as "ClavicleL". Names from the Blender file go through this first.
 */
export const gltfName = (name: string) => THREE.PropertyBinding.sanitizeNodeName(name);

export const PART = {
  body: gltfName("Talo · cuerpo deformable"),
  shield: gltfName("Escudo · tablero azul"),
  shieldEmblem: gltfName("Escudo · emblema de mando"),
  crest: gltfName("Casco · cresta dorada"),
  cape: gltfName("Capa corta · paño"),
  capeCollar: gltfName("Capa corta · cuello plegado"),
  sword: gltfName("Equipo · espada derecha"),
  shieldGear: gltfName("Equipo · escudo izquierdo"),
};

/** Steel plates that take the armor's finish (whole names: "Rodillera D · correa" is a strap). */
export const ARMOR_PARTS = [
  "Casco · cúpula",
  "Peto · acero",
  "Faldón D · placa",
  "Faldón Centro · placa",
  "Faldón I · placa",
  "Hombrera D · placa",
  "Hombrera I · placa",
  "Brazal D · acero",
  "Brazal I · acero",
  "Rodillera D",
  "Rodillera I",
  "Bota D · acero",
  "Bota I · acero",
].map(gltfName);

/**
 * Helmet pieces, each its own GLB (plain material, base at y = 0, front +z,
 * meters) hung on the "Head" bone. Placed against the dome's real vertices in
 * Head space (the accessor min/max in the knight's GLB are stale, ~0.39 m too
 * low): dome from y 0.29 to 0.66, ~0.32 m half-width at y 0.44, 0.235 m at
 * y 0.56. `color` null = the plume's (or the team's) color.
 */
export interface HelmPiece {
  url: string;
  at: [number, number, number];
  scale?: [number, number, number];
  color: number | null;
  metalness: number;
  roughness: number;
}
export type HelmPieceId = "penacho" | "cuernos" | "corona" | "alas";
export const HELM_PIECES: Record<HelmPieceId, HelmPiece> = {
  penacho: { url: "/models/talo-knight/casco-penacho.glb", at: [0, 0.61, 0], color: null, metalness: 0, roughness: 0.75 },
  cuernos: { url: "/models/talo-knight/casco-cuernos.glb", at: [0, 0.45, 0], color: 0xe9dfc6, metalness: 0, roughness: 0.6 },
  // The dome is oval there (narrower front to back), so the ring is too.
  corona: { url: "/models/talo-knight/casco-corona.glb", at: [0, 0.56, 0.008], scale: [1.02, 1, 0.82], color: 0xe5ae32, metalness: 0.68, roughness: 0.28 },
  alas: { url: "/models/talo-knight/casco-alas.glb", at: [0, 0.43, 0.05], color: 0xe5e7eb, metalness: 0.58, roughness: 0.3 },
};

/** Which pieces a helm wears: every helm but «Cresta» keeps the plume. */
export function helmPieces(helm: string): HelmPieceId[] {
  const pieces: HelmPieceId[] = helm === "cresta" ? [] : ["penacho"];
  if (helm === "cuernos") pieces.push("cuernos");
  if (helm === "corona") pieces.push("corona");
  if (helm === "alado") pieces.push("alas");
  return pieces;
}

/**
 * The weapons, also made in Meshy: each stands up (+y = where it strikes),
 * the grip's center at the origin, the edge or striking face toward +x,
 * meters. The flail is two pieces (its chain is drawn by code so it can
 * swing) and the bow has no string (it stretches when drawn).
 */
export type WeaponPartId = "daga" | "espada" | "hacha" | "maza" | "lanza" | "arco" | "martillo" | "mangual-mango" | "mangual-bola" | "flecha";
const WEAPON_FILES: Record<WeaponPartId, string> = {
  daga: "arma-daga.glb",
  espada: "arma-espada.glb",
  hacha: "arma-hacha.glb",
  maza: "arma-maza.glb",
  lanza: "arma-lanza.glb",
  arco: "arma-arco.glb",
  martillo: "arma-martillo.glb",
  "mangual-mango": "arma-mangual-mango.glb",
  "mangual-bola": "arma-mangual-bola.glb",
  flecha: "flecha.glb",
};

// ---- Loading ------------------------------------------------------------------

interface Templates {
  knight: THREE.Object3D;
  animations: THREE.AnimationClip[];
  pieces: Partial<Record<HelmPieceId, THREE.Object3D>>;
  weapons: Partial<Record<WeaponPartId, THREE.Object3D>>;
}

let templates: Templates | null = null;
let loading: Promise<boolean> | null = null;

/** Geometry kept by the template: bounds recomputed, never disposed with a copy. */
function prepare(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    // The exporter's accessor min/max don't match the vertices, and GLTFLoader
    // takes the bounds from them: wrong bounds = wrong frustum culling.
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.userData.shared = true;
  });
}

/** Merged armor meshes are named after their material; this one takes the armor's finish. */
export const MERGED_STEEL = "Fusión · Acero frío";
/** Pieces that stay on their own: they turn on and off, or move by themselves. */
const KEEP_APART = new Set([
  PART.crest,
  PART.capeCollar,
  ...["Ojo D · blanco", "Ojo D · pupila", "Ojo I · blanco", "Ojo I · pupila"].map(gltfName),
]);

/** A geometry with plain float positions and normals only (the files are quantized to 16 bits). */
function floatCopy(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of ["position", "normal"]) {
    const a = source.getAttribute(name);
    const out = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) {
      out[i * 3] = a.getX(i);
      out[i * 3 + 1] = a.getY(i);
      out[i * 3 + 2] = a.getZ(i);
    }
    g.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  if (source.index) g.setIndex(Array.from(source.index.array));
  return g;
}

/**
 * Fewer draw calls per knight (~49 meshes → ~12): every rigid armor piece
 * hung on a bone becomes skinned 100% to that bone, and the pieces that share
 * a material are joined into one skinned mesh on the body's skeleton. Done
 * once on the template; copies share the result.
 */
function mergeArmor(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  const body = scene.getObjectByName(PART.body) as THREE.SkinnedMesh | undefined;
  if (!body?.isSkinnedMesh) return;
  const skeleton = body.skeleton;
  const gear = [PART.sword, PART.shieldGear].map((n) => scene.getObjectByName(n)).filter(Boolean) as THREE.Object3D[];
  const inGear = (o: THREE.Object3D) => gear.some((g) => g === o || g.getObjectById(o.id));
  const groups = new Map<string, { material: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const merged: THREE.Mesh[] = [];
  const toBone = new THREE.Matrix4();
  const bind = new THREE.Matrix4();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || KEEP_APART.has(mesh.name) || inGear(mesh)) return;
    const boneIndex = skeleton.bones.indexOf(mesh.parent as THREE.Bone);
    if (boneIndex < 0) return;
    const material = mesh.material as THREE.Material;
    // From the mesh to its bone, then to where the bone was bound: the bind pose.
    toBone.copy(mesh.parent!.matrixWorld).invert().multiply(mesh.matrixWorld);
    bind.copy(skeleton.boneInverses[boneIndex]).invert().multiply(toBone);
    const g = floatCopy(mesh.geometry);
    g.applyMatrix4(bind);
    const n = g.getAttribute("position").count;
    const index = new Uint16Array(n * 4);
    const weight = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      index[i * 4] = boneIndex;
      weight[i * 4] = 1;
    }
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(index, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weight, 4));
    // The file repeats materials under the same name ("Oro pulido" ×3): join by name.
    const group = groups.get(material.name) ?? { material, geos: [] };
    group.geos.push(g);
    groups.set(material.name, group);
    merged.push(mesh);
  });
  for (const mesh of merged) mesh.parent?.remove(mesh);
  for (const [name, { material, geos }] of groups) {
    const geometry = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!geometry) continue;
    const skinned = new THREE.SkinnedMesh(geometry, material);
    skinned.name = `Fusión · ${name}`;
    body.parent!.add(skinned);
    skinned.bind(skeleton, body.bindMatrix);
  }
}

/** Loads the knight and its helmet pieces once (true when the knight is there). */
export function loadKnightModel(): Promise<boolean> {
  if (loading) return loading;
  if (typeof window === "undefined") return Promise.resolve(false);
  // The files are meshopt-compressed (gltf-transform meshopt): ~1/3 the size.
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loading = (async () => {
    try {
      await MeshoptDecoder.ready;
      const helmIds = Object.keys(HELM_PIECES) as HelmPieceId[];
      const weaponIds = Object.keys(WEAPON_FILES) as WeaponPartId[];
      // A piece that fails is drawn the old way; only the knight is required.
      const [knight, parts, arms] = await Promise.all([
        loader.loadAsync(KNIGHT_URL),
        Promise.all(helmIds.map((id) => loader.loadAsync(HELM_PIECES[id].url).catch(() => null))),
        Promise.all(weaponIds.map((id) => loader.loadAsync(`${MODELS_DIR}/${WEAPON_FILES[id]}`).catch(() => null))),
      ]);
      mergeArmor(knight.scene);
      prepare(knight.scene);
      const pieces: Templates["pieces"] = {};
      helmIds.forEach((id, i) => {
        const part = parts[i];
        if (!part) return;
        prepare(part.scene);
        pieces[id] = part.scene;
      });
      const weapons: Templates["weapons"] = {};
      weaponIds.forEach((id, i) => {
        const part = arms[i];
        if (!part) return;
        prepare(part.scene);
        weapons[id] = part.scene;
      });
      templates = { knight: knight.scene, animations: knight.animations, pieces, weapons };
      return true;
    } catch {
      return false;
    }
  })();
  return loading;
}

export const knightModelReady = () => templates !== null;

/** A copy of a weapon piece as modeled (standing up, +y forward), own materials; null if not loaded. */
export function weaponPart(id: WeaponPartId): THREE.Object3D | null {
  const t = templates?.weapons[id];
  if (!t) return null;
  const copy = t.clone();
  copy.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.material = (mesh.material as THREE.Material).clone();
  });
  return copy;
}

/**
 * A copy of the knight's own shield (the heater one), turned like the
 * battle's shields: its face toward −z, the handle's grip at the origin.
 * `emblemSpot` is where an emblem goes on its face (the model's own symbol
 * is `PART.shieldEmblem`, hidden when the knight chose one).
 */
export function shieldPart(face: number): { group: THREE.Group; emblemAt: THREE.Vector3; symbol: THREE.Object3D | null } | null {
  const gear = templates?.knight.getObjectByName(PART.shieldGear);
  if (!gear) return null;
  const copy = gear.clone();
  copy.position.set(0, 0, 0);
  copy.quaternion.identity();
  copy.scale.set(1, 1, 1);
  copy.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    if (mesh.name === PART.shield) mat.color.set(face);
    mesh.material = mat;
  });
  // Measured in its own frame: face toward +z (front at z ≈ 0.19), the handle
  // at the back around z ≈ 0.04. Half a turn, and moved so the handle sits in the fist.
  copy.rotation.y = Math.PI;
  copy.position.z = 0.09;
  const group = new THREE.Group();
  group.add(copy);
  return { group, emblemAt: new THREE.Vector3(0, 0.013, -0.107), symbol: copy.getObjectByName(PART.shieldEmblem) ?? null };
}
export const knightAnimations = () => templates?.animations ?? [];

// ---- First person ------------------------------------------------------------------

/** Pieces of the model cut out for first person (shared geometry), per limb. */
const limbCache = new Map<string, { name: string; material: THREE.Material; geometry: THREE.BufferGeometry }[]>();

/**
 * The triangles of the knight's skinned meshes (the body and the merged
 * armor) that follow `boneNames`, at rest, in `frameName`'s bone frame: the
 * talo's mitt and the bracer for an arm, the shin and boot for a foot.
 */
function limbParts(key: string, boneNames: string[], frameName: string) {
  const known = limbCache.get(key);
  if (known || !templates) return known ?? null;
  const out: { name: string; material: THREE.Material; geometry: THREE.BufferGeometry }[] = [];
  const v = new THREE.Vector3();
  templates.knight.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const bones = m.skeleton.bones;
    const ids = new Set(boneNames.map((n) => bones.findIndex((b) => b.name === gltfName(n))));
    const frame = bones.findIndex((b) => b.name === gltfName(frameName));
    if (frame < 0) return;
    const g = m.geometry;
    const si = g.getAttribute("skinIndex");
    const sw = g.getAttribute("skinWeight");
    const pos = g.getAttribute("position");
    const nor = g.getAttribute("normal");
    if (!si || !sw) return;
    // The bone that moves each vertex the most.
    const dominant = (i: number) => {
      let best = -1;
      let weight = -1;
      for (let c = 0; c < 4; c++) {
        const w = sw.getComponent(i, c);
        if (w > weight) {
          weight = w;
          best = si.getComponent(i, c);
        }
      }
      return best;
    };
    const toFrame = new THREE.Matrix4().copy(m.skeleton.boneInverses[frame]).multiply(m.bindMatrix);
    const normals = new THREE.Matrix3().getNormalMatrix(toFrame);
    const remap = new Map<number, number>();
    const P: number[] = [];
    const N: number[] = [];
    const I: number[] = [];
    const tris = (g.index ? g.index.count : pos.count) / 3;
    const at = (k: number) => (g.index ? g.index.getX(k) : k);
    for (let t = 0; t < tris; t++) {
      const tri = [at(t * 3), at(t * 3 + 1), at(t * 3 + 2)];
      if (!tri.every((i) => ids.has(dominant(i)))) continue;
      for (const i of tri) {
        let j = remap.get(i);
        if (j === undefined) {
          j = P.length / 3;
          remap.set(i, j);
          v.fromBufferAttribute(pos, i).applyMatrix4(toFrame);
          P.push(v.x, v.y, v.z);
          v.fromBufferAttribute(nor, i).applyMatrix3(normals).normalize();
          N.push(v.x, v.y, v.z);
        }
        I.push(j);
      }
    }
    if (!I.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
    geometry.setIndex(I);
    geometry.computeBoundingSphere();
    geometry.userData.shared = true;
    out.push({ name: m.name, material: m.material as THREE.Material, geometry });
  });
  limbCache.set(key, out);
  return out;
}

/** The limb's meshes with their own materials: the body in `tint`, steel in the armor's color. */
function limbMeshes(parts: NonNullable<ReturnType<typeof limbParts>>, tint: number, armor: string): THREE.Mesh[] {
  return parts.map(({ name, material, geometry }) => {
    const mat = material.clone() as THREE.MeshStandardMaterial;
    if (name === PART.body) mat.color.set(tint);
    if (name === MERGED_STEEL && armor) mat.color.set(armor);
    return new THREE.Mesh(geometry, mat);
  });
}

/**
 * Which way the forearm runs from the fist in first person (the right hand's;
 * the left is mirrored): back toward the camera, down and out. The hands'
 * frame has the weapon along −z.
 */
const FP_FOREARM = new THREE.Vector3(0.3, -0.36, 0.88).normalize();
/** The forearm turned on itself so the back of the hand faces out and up. */
const FP_ROLL = 0.6;
const FP_SCALE = 1.05;

/**
 * Your own forearm and hand in first person, from the model (the mitt in
 * your color and the bracer in your armor's): the fist at the origin, where
 * the weapon or shield is held. Null until the model is loaded.
 */
export function firstPersonArm(side: "L" | "R", tint: number, armor: string): THREE.Group | null {
  const parts = limbParts(`arm${side}`, [`Elbow.${side}`, `Wrist.${side}`, `HandTip.${side}`], `Wrist.${side}`);
  const wrist = templates?.knight.getObjectByName(gltfName(`Wrist.${side}`));
  const tip = templates?.knight.getObjectByName(gltfName(`HandTip.${side}`));
  if (!parts?.length || !wrist || !tip) return null;
  // In the wrist's frame: the fist halfway along the hand, the elbow back where the forearm starts.
  const fist = tip.position.clone().multiplyScalar(0.55);
  const toElbow = wrist.position.clone().negate().sub(fist).normalize();
  const want = FP_FOREARM.clone();
  if (side === "L") want.x = -want.x;
  const turn = new THREE.Quaternion().setFromUnitVectors(toElbow, want);
  turn.premultiply(new THREE.Quaternion().setFromAxisAngle(want, side === "R" ? FP_ROLL : -FP_ROLL));
  const g = new THREE.Group();
  for (const mesh of limbMeshes(parts, tint, armor)) {
    mesh.quaternion.copy(turn);
    mesh.position.copy(fist).negate().applyQuaternion(turn);
    g.add(mesh);
  }
  g.scale.setScalar(FP_SCALE);
  g.userData.modeled = true;
  return g;
}

/** Your own right foot for the kick in first person (shin and boot), toe toward −z, from the ankle. */
export function firstPersonFoot(tint: number, armor: string): THREE.Group | null {
  // With the thigh and knee plate, so the cut at the top stays below the view.
  const parts = limbParts("footR", ["Hip.R", "KneePlate.R", "Knee.R", "Ankle.R", "Toe.R"], "Ankle.R");
  if (!parts?.length) return null;
  const g = new THREE.Group();
  for (const mesh of limbMeshes(parts, tint, armor)) {
    // The model's toes point +z: half a turn. Then the leg laid level, running
    // back toward the hip under the camera (its cut stays below the view), and
    // the sole facing the rival.
    mesh.rotation.set(Math.PI / 2, Math.PI, 0);
    g.add(mesh);
  }
  g.scale.setScalar(FP_SCALE);
  g.userData.modeled = true;
  return g;
}

// ---- Eyes ------------------------------------------------------------------

/**
 * The talo's eyes, alive like the brand's characters: each eye pivots on its
 * white's center (blinks and squints squash it), the pupil slides inside it,
 * and a knocked-out knight gets X eyes. Right eye ("D") first.
 */
export interface Eyes {
  eyes: [THREE.Group, THREE.Group];
  pupils: [THREE.Group, THREE.Group];
  xs: [THREE.Group, THREE.Group];
  nextBlink: number;
  blinkT: number;
  open: number;
  lookX: number;
  lookY: number;
}

/** What the eyes should do now. `open` 1 wide … 0 shut; look −1…1 (+x the knight's right, +y up). */
export interface EyeCue {
  ko: boolean;
  open: number;
  lookX: number;
  lookY: number;
}

let xGeo: THREE.BoxGeometry | null = null;

function rigEyes(root: THREE.Object3D): Eyes | null {
  const head = root.getObjectByName("Head");
  if (!head) return null;
  const made = (["D", "I"] as const).map((s) => {
    const white = root.getObjectByName(gltfName(`Ojo ${s} · blanco`)) as THREE.Mesh | undefined;
    const pupil = root.getObjectByName(gltfName(`Ojo ${s} · pupila`)) as THREE.Mesh | undefined;
    if (!white || !pupil || white.parent !== head || pupil.parent !== head) return null;
    white.updateMatrix();
    const center = white.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(white.matrix);
    const eye = new THREE.Group();
    eye.position.copy(center);
    head.add(eye);
    white.position.sub(center);
    pupil.position.sub(center);
    const look = new THREE.Group();
    eye.add(white, look);
    look.add(pupil);
    // An X over the white, just in front of where the pupil sits.
    if (!xGeo) {
      xGeo = new THREE.BoxGeometry(0.13, 0.026, 0.012);
      xGeo.userData.shared = true;
    }
    const x = new THREE.Group();
    const ink = new THREE.MeshBasicMaterial({ color: 0x0b0b0f });
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(xGeo, ink);
      bar.rotation.z = a;
      x.add(bar);
    }
    x.position.z = 0.05;
    x.visible = false;
    eye.add(x);
    return { eye, look, x };
  });
  if (!made[0] || !made[1]) return null;
  const [d, i] = made as { eye: THREE.Group; look: THREE.Group; x: THREE.Group }[];
  return { eyes: [d.eye, i.eye], pupils: [d.look, i.look], xs: [d.x, i.x], nextBlink: 1 + Math.random() * 3, blinkT: 9, open: 1, lookX: 0, lookY: 0 };
}

const BLINK_SECONDS = 0.14;

/** Blinks on its own every few seconds, eases toward the cue. */
export function updateEyes(e: Eyes, cue: EyeCue, dt: number, time: number) {
  if (time >= e.nextBlink) {
    e.blinkT = 0;
    // Now and then a double blink.
    e.nextBlink = time + (Math.random() < 0.15 ? 0.28 : 2 + Math.random() * 3.5);
  }
  e.blinkT += dt;
  const blink = e.blinkT < BLINK_SECONDS ? Math.sin((e.blinkT / BLINK_SECONDS) * Math.PI) : 0;
  const k = 1 - Math.exp(-dt * 14);
  e.open += (cue.open - e.open) * k;
  e.lookX += (cue.lookX - e.lookX) * k;
  e.lookY += (cue.lookY - e.lookY) * k;
  for (let i = 0; i < 2; i++) {
    e.xs[i].visible = cue.ko;
    e.pupils[i].visible = !cue.ko;
    e.eyes[i].scale.y = cue.ko ? 1 : Math.max(0.08, e.open * (1 - blink * 0.92));
    // The model faces +z, so the knight's right is −x.
    e.pupils[i].position.set(-e.lookX * 0.035, e.lookY * 0.028, 0);
  }
}

// ---- Dressing ------------------------------------------------------------------

export interface ModelDress {
  /** Steel color ("" keeps the model's). */
  armor: string;
  /** The body under the armor and the shield's face (the team's or own color). */
  tint: number;
  plume: string;
  helm: string;
  /** "" = no cape, "equipo" = the tint, or its color. */
  cape: string;
  /** Keep the model's own sword and shield (the preview), else hidden (the battle brings its gear). */
  keepGear?: boolean;
}

/**
 * A dressed copy of the knight (with its own skeleton and materials; the
 * geometry is shared). Returns null until `loadKnightModel` is done.
 */
export function cloneKnightModel(dress: ModelDress): { root: THREE.Object3D; armor: THREE.MeshStandardMaterial[]; eyes: Eyes | null } | null {
  if (!templates) return null;
  const root = cloneSkinned(templates.knight);
  const armorMats: THREE.MeshStandardMaterial[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    // Skinned parts move far from their bind pose (falls, spins): never culled.
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) mesh.frustumCulled = false;
    const source = mesh.material as THREE.Material;
    const material = source.clone() as THREE.MeshStandardMaterial;
    mesh.material = material;
    const name = mesh.name;
    if (name === MERGED_STEEL || ARMOR_PARTS.includes(name)) {
      if (dress.armor) material.color.set(dress.armor);
      armorMats.push(material);
    }
    if (name === PART.body || name === PART.shield) material.color.set(dress.tint);
    if (name === PART.crest) {
      mesh.visible = dress.helm === "cresta";
      if (dress.plume) material.color.set(dress.plume);
    }
    if (name === PART.cape || name === PART.capeCollar) {
      mesh.visible = !!dress.cape;
      material.color.set(dress.cape && dress.cape !== "equipo" ? dress.cape : dress.tint);
    }
  });
  if (!dress.keepGear) {
    for (const gear of [PART.sword, PART.shieldGear]) {
      const g = root.getObjectByName(gear);
      if (g) g.visible = false;
    }
  }
  const head = root.getObjectByName("Head");
  if (head) {
    for (const id of helmPieces(dress.helm)) {
      const template = templates.pieces[id];
      if (!template) continue;
      const piece = HELM_PIECES[id];
      const part = template.clone();
      const color = piece.color ?? (dress.plume || dress.tint);
      part.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.material = new THREE.MeshStandardMaterial({ color, metalness: piece.metalness, roughness: piece.roughness });
      });
      part.position.set(...piece.at);
      if (piece.scale) part.scale.set(...piece.scale);
      head.add(part);
    }
  }
  return { root, armor: armorMats, eyes: rigEyes(root) };
}

// ---- Driving the bones from the battle's rig ----------------------------------------

/** The battle knight's rig (lib/arena3dKnight.ts), in the body's frame. */
export interface DriverRig {
  hips: THREE.Object3D;
  torso: THREE.Object3D;
  head: THREE.Object3D;
  /** Left (shield) first, like the rig's. */
  arms: { shoulder: THREE.Object3D; elbow: THREE.Object3D; grip: THREE.Object3D }[];
  legs: { hip: THREE.Object3D; knee: THREE.Object3D; ankle: THREE.Object3D }[];
}

/** How much smaller the model's legs are than the rig's (thigh + shin), for the crouch. */
const RIG_LEG = 0.86;
/**
 * The model's size in the battle. At 1 its helmet's top is ~1.8 m, near the
 * old knight's, so name tags and hit feel stay where they were.
 */
export const MODEL_SCALE = 1;

interface ArmBones {
  shoulder: THREE.Bone;
  elbow: THREE.Bone;
  wrist: THREE.Bone;
}

export interface KnightModel {
  /** Under the knight's body: a half turn, so the model faces -z like the rig. */
  holder: THREE.Group;
  pelvis: THREE.Bone;
  spine: THREE.Bone;
  chest: THREE.Bone;
  neck: THREE.Bone;
  head: THREE.Bone;
  arms: [ArmBones, ArmBones];
  legs: [THREE.Bone, THREE.Bone, THREE.Bone][];
  tassets: [THREE.Bone | null, THREE.Bone | null];
  cape: [THREE.Bone | null, THREE.Bone | null];
  /** Where the battle's weapon and shield go: in the fist, in the rig's grip frame. */
  grips: [THREE.Group, THREE.Group];
  /** A-pose → arms down, per arm bone (shoulder, elbow, wrist), left then right. */
  rest: [THREE.Quaternion, THREE.Quaternion, THREE.Quaternion][];
  /** Model legs / rig legs: a crouch lowers the model less, so it's lifted back. */
  legRatio: number;
  armor: THREE.MeshStandardMaterial[];
  eyes: Eyes | null;
  /** The head's extra turn toward what it looks at (eased, radians, + = its right). */
  turn: number;
}

/** What the face does this frame (worked out from the pose in `animateKnight`). */
export interface FaceCue extends EyeCue {
  /** Where to turn the head (radians, + = its right; the eyes do the rest). */
  turn: number;
}

/**
 * Tuning for the model's build (a big head, short arms): the arms held a bit
 * out from the round body so they don't sink into it, and the torso's twist
 * made bigger so swings read at the size of these arms.
 */
const ARM_OUT = 0.22;
const TWIST = 1.3;

const DOWN = new THREE.Vector3(0, -1, 0);
const HALF_TURN = new THREE.Quaternion(0, 1, 0, 0);
const HALF_TURN_INV = HALF_TURN.clone().invert();

const bone = (root: THREE.Object3D, name: string) => root.getObjectByName(gltfName(name)) as THREE.Bone | undefined;

/** The battle's modeled knight for a look, or null until the model is loaded. */
export function knightModel(dress: ModelDress): KnightModel | null {
  const made = cloneKnightModel({ ...dress, keepGear: false });
  if (!made) return null;
  const { root } = made;
  const need = (name: string) => {
    const b = bone(root, name);
    if (!b) throw new Error(`Knight model without bone ${name}`);
    return b;
  };
  try {
    const holder = new THREE.Group();
    holder.quaternion.copy(HALF_TURN);
    holder.scale.setScalar(MODEL_SCALE);
    holder.add(root);
    const sides = ["L", "R"] as const;
    const arms = sides.map((s) => ({ shoulder: need(`Shoulder.${s}`), elbow: need(`Elbow.${s}`), wrist: need(`Wrist.${s}`) })) as [ArmBones, ArmBones];
    const rest = sides.map((s) => {
      // Each bone points at its child; this turns that direction straight down.
      const downFrom = (child: string) => new THREE.Quaternion().setFromUnitVectors(need(child).position.clone().normalize(), DOWN);
      return [downFrom(`Elbow.${s}`), downFrom(`Wrist.${s}`), downFrom(`HandTip.${s}`)] as [THREE.Quaternion, THREE.Quaternion, THREE.Quaternion];
    });
    // The fist: halfway along the hand, turned so the rig's grip frame holds there.
    const grips = sides.map((s, i) => {
      const g = new THREE.Group();
      const tip = need(`HandTip.${s}`).position;
      g.position.copy(tip).multiplyScalar(0.55);
      g.quaternion.copy(rest[i][2]).invert().multiply(HALF_TURN_INV);
      arms[i].wrist.add(g);
      return g;
    }) as [THREE.Group, THREE.Group];
    const legs = sides.map((s) => [need(`Hip.${s}`), need(`Knee.${s}`), need(`Ankle.${s}`)] as [THREE.Bone, THREE.Bone, THREE.Bone]);
    const thigh = need("Knee.L").position.length();
    const shin = need("Ankle.L").position.length();
    return {
      holder,
      pelvis: need("Pelvis"),
      spine: need("Spine"),
      chest: need("Chest"),
      neck: need("Neck"),
      head: need("Head"),
      arms,
      legs,
      tassets: [bone(root, "Tasset.L") ?? null, bone(root, "Tasset.R") ?? null],
      cape: [bone(root, "CapeUpper") ?? null, bone(root, "CapeLower") ?? null],
      grips,
      rest,
      legRatio: ((thigh + shin) * MODEL_SCALE) / RIG_LEG,
      armor: made.armor,
      eyes: made.eyes,
      turn: 0,
    };
  } catch {
    return null;
  }
}

// Scratch quaternions (one knight at a time).
const qHips = new THREE.Quaternion();
const qTorso = new THREE.Quaternion();
const qHead = new THREE.Quaternion();
const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const qC = new THREE.Quaternion();
const qParent = new THREE.Quaternion();
const qWant = new THREE.Quaternion();
const qMid = new THREE.Quaternion();
const qTurn = new THREE.Quaternion();
const eTorso = new THREE.Euler();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
/** Each arm a bit out from the body, in its shoulder's frame (left goes −x, right +x). */
const ARM_OUT_Q = [new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -ARM_OUT), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ARM_OUT)];

/** A rig rotation (knight frame, facing -z) as the model sees it (facing +z): the half turn's conjugate. */
const turned = (q: THREE.Quaternion, out: THREE.Quaternion) => out.set(-q.x, q.y, -q.z, q.w);

/** Sets `b`'s local rotation so its orientation in the model is `want`, under a parent at `parent`. */
function place(b: THREE.Bone, parent: THREE.Quaternion, want: THREE.Quaternion) {
  b.quaternion.copy(parent).invert().multiply(want);
}

/**
 * Poses the model like the rig `animateKnight` just set. Orientations are
 * worked out in the body's frame (the holder hangs under the body), turned
 * into the model's, then made local to each parent bone.
 */
export function driveKnightModel(
  m: KnightModel,
  rig: DriverRig,
  crouch: number,
  cape: THREE.Object3D | null,
  thighX: [number, number],
  face: FaceCue,
  dt: number,
  time: number
) {
  qHips.copy(rig.hips.quaternion);
  const tr = rig.torso.rotation;
  qTorso.setFromEuler(eTorso.set(tr.x, tr.y * TWIST, tr.z, tr.order));
  qHead.copy(qTorso).multiply(rig.head.quaternion);

  // Spine: the hips, halfway to the chest, the chest, halfway to the head, the head.
  turned(qHips, qWant);
  m.pelvis.quaternion.copy(qWant);
  qParent.copy(qWant);
  qMid.copy(qHips).slerp(qTorso, 0.5);
  turned(qMid, qWant);
  place(m.spine, qParent, qWant);
  qParent.copy(qWant);
  turned(qTorso, qWant);
  place(m.chest, qParent, qWant);
  const chest = qC.copy(qWant);
  qParent.copy(qWant);
  qMid.copy(qTorso).slerp(qHead, 0.5);
  turned(qMid, qWant);
  place(m.neck, qParent, qWant);
  qParent.copy(qWant);
  turned(qHead, qWant);
  place(m.head, qParent, qWant);
  // Turned toward what it looks at (the model's +y turn goes to its left).
  m.turn += (face.turn - m.turn) * (1 - Math.exp(-dt * 8));
  m.head.quaternion.multiply(qTurn.setFromAxisAngle(Y_AXIS, -m.turn));
  if (m.eyes) updateEyes(m.eyes, face, dt, time);

  // Arms (the clavicles keep their rest under the chest).
  for (let i = 0; i < 2; i++) {
    const arm = rig.arms[i];
    const bones = m.arms[i];
    const rest = m.rest[i];
    qA.copy(qTorso).multiply(arm.shoulder.quaternion).multiply(ARM_OUT_Q[i]);
    turned(qA, qWant).multiply(rest[0]);
    place(bones.shoulder, chest, qWant);
    qParent.copy(qWant);
    qA.multiply(arm.elbow.quaternion);
    turned(qA, qWant).multiply(rest[1]);
    place(bones.elbow, qParent, qWant);
    qParent.copy(qWant);
    qA.multiply(arm.grip.quaternion);
    turned(qA, qWant).multiply(rest[2]);
    place(bones.wrist, qParent, qWant);
  }

  // Legs, under the pelvis.
  turned(qHips, qB);
  for (let i = 0; i < 2; i++) {
    const leg = rig.legs[i];
    const [hip, knee, ankle] = m.legs[i];
    qA.copy(qHips).multiply(leg.hip.quaternion);
    turned(qA, qWant);
    place(hip, qB, qWant);
    qParent.copy(qWant);
    qA.multiply(leg.knee.quaternion);
    turned(qA, qWant);
    place(knee, qParent, qWant);
    qParent.copy(qWant);
    qA.multiply(leg.ankle.quaternion);
    turned(qA, qWant);
    place(ankle, qParent, qWant);
  }

  // The skirt plates lift with the thigh going forward (front is +z here, so negative x).
  for (let i = 0; i < 2; i++) m.tassets[i]?.rotation.set(-Math.max(0, thighX[i]) * 0.7, 0, 0);
  // The cape sways like the rig's (mirrored by the half turn). It's longer and
  // has two bones, so each takes a part of it or it would fly flat when running.
  if (cape) {
    m.cape[0]?.rotation.set(-cape.rotation.x * 0.45, 0, -cape.rotation.z * 0.6);
    m.cape[1]?.rotation.set(-cape.rotation.x * 0.3, 0, -cape.rotation.z * 0.4);
  }

  // Shorter legs bend less for the same crouch: lift the model so the feet stay down.
  m.holder.position.y = crouch * (1 - m.legRatio);
}
