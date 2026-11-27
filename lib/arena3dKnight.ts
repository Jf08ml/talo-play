import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TeamId } from "./teams";
import { KICK_HIT, KICK_SECONDS, SPECIALS, WEAPONS, specialOf, type Act, type Gear, type ItemKind, type WeaponId } from "./arenaSim";
import { EMBLEM_PATHS, EMOTES, EMOTE_SECONDS } from "./arenaLooks";
import { driveKnightModel, knightModel, shieldPart, weaponPart, type KnightModel } from "./arena3dModel";

/**
 * Arena medieval's knights, weapons and items (three.js, browser only), and
 * how a knight moves for its pose. Knights are rounded shapes (capsules,
 * lathed cuirass and helmet) on a small skeleton with elbows and knees; the
 * animation is worked out from the pose alone, so every screen draws the
 * same knight. Yaw 0 faces -z; the right hand (weapon) is on +x.
 */

export const TEAM_COLORS: Record<TeamId, number> = { red: 0xdc2646, blue: 0x1d9bd1 };
export const STEEL = 0xb8c2cc;
export const DARK_STEEL = 0x5b6470;
export const WOOD = 0x8a5a2b;
export const LEATHER = 0x5c3b1e;
export const GOLD = 0xd4a72c;

export interface KnightPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  act: Act;
  /** Seconds into the act, and how long it lasts (wind-up, recover, stagger). */
  actT: number;
  actLen: number;
  blocking: boolean;
  /** Bow draw 0–1. */
  draw: number;
  /** Walking speed (m/s), and whether running. */
  speed: number;
  running: boolean;
  /** Swing number in the current combo (odd ones swing from the other side). */
  combo: number;
  alive: boolean;
  gear: Gear;
  /** A gesture playing (lib/arenaLooks.ts `EMOTES` index + 1, 0/absent none) and seconds into it. */
  emote?: number;
  emoteT?: number;
}

/**
 * How a knight is dressed (lib/arenaProgress.ts): the plume's color ("" =
 * the cloth's), the emblem on its chest and shield, and the helmet's extra.
 */
export interface KnightLook {
  plume: string;
  emblem: string;
  helm: string;
  /** A finish for steel plates; the cloth still carries the team color. */
  armor: string;
  cape: string;
  trail: string;
}

export const PLAIN_LOOK: KnightLook = { plume: "", emblem: "ninguno", helm: "yelmo", armor: "#b8c2cc", cape: "", trail: "" };

/** Shared textures and geometries (never disposed with a knight). */
const SHARED = "shared";
const emblemTextures = new Map<string, THREE.CanvasTexture>();

/** An emblem drawn in pale gold with a dark outline, on a transparent square (made once per emblem). */
export function emblemTexture(id: string): THREE.CanvasTexture | null {
  const path = EMBLEM_PATHS[id];
  if (!path || typeof document === "undefined") return null;
  const known = emblemTextures.get(id);
  if (known) return known;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.translate(14, 14);

  const p = new Path2D(path);
  ctx.lineJoin = "round";
  ctx.lineWidth = 9;
  ctx.strokeStyle = "#1f1408";
  ctx.stroke(p);
  ctx.fillStyle = "#fde68a";
  ctx.fill(p, "evenodd");
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.name = SHARED;
  emblemTextures.set(id, t);
  return t;
}

let decalGeo: THREE.PlaneGeometry | null = null;
/** A flat square facing -z (the knight's front), for emblems. */
function emblemDecal(id: string, size: number): THREE.Mesh | null {
  const map = emblemTexture(id);
  if (!map) return null;
  if (!decalGeo) {
    decalGeo = new THREE.PlaneGeometry(1, 1).rotateY(Math.PI);
    decalGeo.userData.shared = true;
  }
  const m = new THREE.Mesh(decalGeo, new THREE.MeshLambertMaterial({ map, transparent: true, alphaTest: 0.4, depthWrite: false }));
  m.scale.setScalar(size);
  m.renderOrder = 2;
  return m;
}

let helmGeos: Record<"crest" | "horns" | "crown" | "wings", THREE.BufferGeometry> | null = null;
/** The helmets' extras, built once: a crest, horns, an iron crown and wings. */
function helmExtras() {
  if (helmGeos) return helmGeos;
  // A crest from the brow to the nape (front is -z, so the shape's x runs to the back).
  const crest = new THREE.Shape();
  crest.moveTo(-0.17, -0.02);
  crest.quadraticCurveTo(-0.15, 0.17, 0.03, 0.19);
  crest.quadraticCurveTo(0.2, 0.17, 0.26, -0.12);
  crest.lineTo(0.15, -0.04);
  crest.lineTo(-0.08, 0.0);
  crest.closePath();
  const crestG = new THREE.ExtrudeGeometry(crest, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1, curveSegments: 6 });
  crestG.translate(0, 0, -0.0175);
  crestG.rotateY(-Math.PI / 2);
  crestG.translate(0, 0.33, 0);
  // Horns: out and then up, both sides.
  const horn = (side: number) => {
    const base = new THREE.ConeGeometry(0.045, 0.17, 8).translate(0, 0.085, 0).rotateZ(-side * 1.15).translate(side * 0.13, 0.24, 0.01);
    const tip = new THREE.ConeGeometry(0.03, 0.13, 8).translate(0, 0.065, 0).rotateZ(-side * 0.25).translate(side * 0.272, 0.305, 0.01);
    return [base, tip];
  };
  const horns = merge([...horn(1), ...horn(-1)]);
  // An iron crown with points, around the top of the helm.
  const spikes: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.143, 0.152, 0.055, 18, 1, true).translate(0, 0.275, 0)];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    spikes.push(new THREE.ConeGeometry(0.024, 0.085, 4).translate(Math.sin(a) * 0.145, 0.34, Math.cos(a) * 0.145));
  }
  const crown = merge(spikes);
  // Wings on the sides, swept back and up.
  const wing = new THREE.Shape();
  wing.moveTo(0, 0);
  wing.quadraticCurveTo(0.06, 0.2, 0.25, 0.3);
  wing.lineTo(0.19, 0.2);
  wing.lineTo(0.24, 0.17);
  wing.lineTo(0.15, 0.1);
  wing.lineTo(0.2, 0.05);
  wing.lineTo(0.07, 0.02);
  wing.closePath();
  const wingSide = (side: number) =>
    new THREE.ExtrudeGeometry(wing, { depth: 0.016, bevelEnabled: false, curveSegments: 5 })
      .translate(0, 0, -0.008)
      .rotateY(-Math.PI / 2 + side * 0.28)
      .translate(side * 0.158, 0.17, 0.02);
  const wings = merge([wingSide(1), wingSide(-1)]);
  helmGeos = { crest: crestG, horns, crown, wings };
  for (const g of Object.values(helmGeos)) g.userData.shared = true;
  return helmGeos;
}

export const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
export const phong = (color: number, shininess = 80) => new THREE.MeshPhongMaterial({ color, shininess, specular: 0x999999 });

// ---- Geometry helpers ------------------------------------------------------------

/** Several geometries as one (position, normal, uv only). */
function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(n.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") n.deleteAttribute(name);
    return n;
  });
  const out = mergeGeometries(list, false)!;
  for (const g of new Set([...geos, ...list])) g.dispose();
  return out;
}

/** A solid of revolution around y from (radius, height) points, bottom to top. */
function lathe(pts: [number, number][], segments: number, scaleZ = 1): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    segments
  );
  if (scaleZ !== 1) g.scale(1, 1, scaleZ);
  return g;
}

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
const capsule = (r: number, len: number, rad = 8, cap = 3) => new THREE.CapsuleGeometry(r, len, cap, rad);

// ---- Knight geometry (shared by every knight of a scene) ---------------------------

const HIP_Y = 0.95;
const THIGH = 0.44;
const SHIN = 0.42;
const UPPER = 0.29;
const FORE = 0.3;
const SHOULDER_X = 0.3;
const SHOULDER_Y = 0.5;

export interface KnightGeos {
  thighMail: THREE.BufferGeometry;
  thighPlate: THREE.BufferGeometry;
  shin: THREE.BufferGeometry;
  boot: THREE.BufferGeometry;
  toe: THREE.BufferGeometry;
  fauld: THREE.BufferGeometry;
  belt: THREE.BufferGeometry;
  flap: THREE.BufferGeometry;
  torsoSteel: THREE.BufferGeometry;
  torsoCloth: THREE.BufferGeometry;
  torsoGold: THREE.BufferGeometry;
  helm: THREE.BufferGeometry;
  helmGold: THREE.BufferGeometry;
  visor: THREE.BufferGeometry;
  plume: THREE.BufferGeometry;
  upperArm: THREE.BufferGeometry;
  forearm: THREE.BufferGeometry;
  gauntlet: THREE.BufferGeometry;
  shadow: THREE.BufferGeometry;
}

export function knightGeos(): KnightGeos {
  // Legs: hip pivot at the top, the knee THIGH below, the ankle SHIN below that.
  const thighMail = at(capsule(0.085, THIGH - 0.14), 0, -THIGH / 2 + 0.01, 0);
  const thighPlate = at(lathe([[0.07, -0.34], [0.094, -0.26], [0.1, -0.12], [0.092, -0.02]], 10, 1.05), 0, 0, -0.012);
  const shin = merge([
    at(new THREE.SphereGeometry(0.074, 10, 6).scale(1, 0.9, 1.15), 0, 0, -0.025),
    lathe([[0.055, -SHIN + 0.04], [0.064, -SHIN + 0.1], [0.082, -0.24], [0.08, -0.08], [0.07, -0.03]], 10, 1.05),
  ]);
  const boot = at(capsule(0.062, 0.13, 8, 3).rotateX(Math.PI / 2).scale(1.25, 0.95, 1), 0, -0.035, -0.055);
  const toe = at(new THREE.SphereGeometry(0.07, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.85, 1.3), 0, -0.02, -0.1);

  // Hips: the armored skirt (fauld) and the belt; tabard flaps hang from it.
  const fauld = lathe([[0.245, -0.14], [0.236, -0.06], [0.215, 0.02]], 14, 0.74);
  const belt = merge([
    at(new THREE.TorusGeometry(0.218, 0.032, 5, 18).rotateX(Math.PI / 2).scale(1, 1, 0.74), 0, 0.03, 0),
  ]);
  const flapShape = new THREE.Shape();
  flapShape.moveTo(-0.15, 0);
  flapShape.lineTo(0.15, 0);
  flapShape.lineTo(0.14, -0.38);
  flapShape.quadraticCurveTo(0.07, -0.43, 0, -0.47);
  flapShape.quadraticCurveTo(-0.07, -0.43, -0.14, -0.38);
  flapShape.closePath();
  const flap = new THREE.ExtrudeGeometry(flapShape, { depth: 0.014, bevelEnabled: false, curveSegments: 3 });
  flap.translate(0, 0, -0.007);

  // Torso: cuirass, surcoat in the team's color, pauldrons, gorget.
  const cuirass = lathe(
    [[0.19, 0.0], [0.22, 0.1], [0.25, 0.24], [0.27, 0.37], [0.262, 0.47], [0.2, 0.555], [0.1, 0.6], [0.0, 0.61]],
    16,
    0.72
  );
  const pauldrons: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    pauldrons.push(
      at(new THREE.SphereGeometry(0.145, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1.05, 0.8, 1.12).rotateZ(-side * 0.38), side * 0.29, SHOULDER_Y + 0.03, 0),
      at(new THREE.SphereGeometry(0.13, 12, 4, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.25).scale(1.05, 0.9, 1.1).rotateZ(-side * 0.5), side * 0.32, SHOULDER_Y - 0.05, 0)
    );
  }
  const gorget = at(new THREE.CylinderGeometry(0.085, 0.12, 0.12, 12), 0, 0.62, 0);
  const torsoSteel = merge([cuirass, gorget, ...pauldrons]);
  const torsoCloth = lathe([[0.208, -0.02], [0.232, 0.1], [0.258, 0.24], [0.274, 0.345]], 16, 0.745);
  const emblemShape = new THREE.Shape();
  emblemShape.moveTo(-0.07, 0.07);
  emblemShape.lineTo(0.07, 0.07);
  emblemShape.lineTo(0.065, -0.02);
  emblemShape.quadraticCurveTo(0.04, -0.07, 0, -0.09);
  emblemShape.quadraticCurveTo(-0.04, -0.07, -0.065, -0.02);
  emblemShape.closePath();
  const torsoGold = merge([
    at(new THREE.TorusGeometry(0.274, 0.012, 4, 22).rotateX(Math.PI / 2).scale(1, 1, 0.745), 0, 0.345, 0),
    at(new THREE.ExtrudeGeometry(emblemShape, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.008, bevelSegments: 1, curveSegments: 3 }), 0, 0.2, -0.198),
  ]);

  // Helmet: a lathed great helm with a visor slit, a gold band and a plume.
  const helm = lathe(
    [[0.115, -0.01], [0.145, 0.04], [0.156, 0.13], [0.152, 0.22], [0.134, 0.29], [0.095, 0.34], [0.045, 0.362], [0.0, 0.367]],
    16
  );
  const helmGold = merge([
    at(new THREE.TorusGeometry(0.153, 0.011, 4, 20).rotateX(Math.PI / 2), 0, 0.235, 0),
    at(new THREE.BoxGeometry(0.018, 0.2, 0.02), 0, 0.12, -0.153),
  ]);
  const visor = merge([
    at(new THREE.CylinderGeometry(0.158, 0.158, 0.03, 12, 1, true, Math.PI - 0.85, 1.7), 0, 0.165, 0),
    at(new THREE.CylinderGeometry(0.157, 0.157, 0.016, 10, 1, true, Math.PI - 0.5, 1.0), 0, 0.105, 0),
  ]);
  const plumeShape = new THREE.Shape();
  plumeShape.moveTo(0, 0);
  plumeShape.quadraticCurveTo(0.02, 0.12, 0.14, 0.13);
  plumeShape.quadraticCurveTo(0.3, 0.12, 0.36, -0.05);
  plumeShape.quadraticCurveTo(0.38, -0.16, 0.34, -0.24);
  plumeShape.quadraticCurveTo(0.3, -0.1, 0.2, -0.03);
  plumeShape.quadraticCurveTo(0.1, 0.01, 0.06, -0.02);
  plumeShape.closePath();
  const plume = new THREE.ExtrudeGeometry(plumeShape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 5 });
  plume.translate(0, 0, -0.015);
  plume.rotateY(-Math.PI / 2);
  plume.translate(0, 0.35, -0.02);

  // Arms: shoulder pivot, the elbow UPPER below, the grip FORE below the elbow.
  const upperArm = at(capsule(0.066, UPPER - 0.12), 0, -UPPER / 2 + 0.01, 0);
  const forearm = merge([
    new THREE.SphereGeometry(0.074, 10, 6).scale(1, 0.95, 1.1),
    lathe([[0.056, -0.22], [0.064, -0.17], [0.072, -0.06], [0.066, -0.02]], 10),
  ]);
  const gauntlet = merge([
    lathe([[0.072, -0.26], [0.085, -0.235], [0.064, -0.205]], 10),
    at(new THREE.SphereGeometry(0.068, 10, 7).scale(0.95, 1.2, 1.1), 0, -FORE + 0.01, -0.005),
  ]);
  const shadow = new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2);

  const all: KnightGeos = {
    thighMail,
    thighPlate,
    shin,
    boot,
    toe,
    fauld,
    belt,
    flap,
    torsoSteel,
    torsoCloth,
    torsoGold,
    helm,
    helmGold,
    visor,
    plume,
    upperArm,
    forearm,
    gauntlet,
    shadow,
  };
  for (const g of Object.values(all)) (g as THREE.BufferGeometry).userData.shared = true;
  return all;
}

export function disposeKnightGeos(g: KnightGeos) {
  for (const geo of Object.values(g)) (geo as THREE.BufferGeometry).dispose();
}

// ---- Weapons ------------------------------------------------------------------

/** A flat blade along -z from z=0, `len` long, beveled so its edges catch the light. */
function bladeGeo(len: number, width: number, thick: number, tipLen: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(width * 0.42, len - tipLen);
  s.quadraticCurveTo(width * 0.32, len - tipLen * 0.35, 0, len);
  s.quadraticCurveTo(-width * 0.32, len - tipLen * 0.35, -width * 0.42, len - tipLen);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: thick * 0.3,
    bevelEnabled: true,
    bevelThickness: thick * 0.35,
    bevelSize: width * 0.16,
    bevelSegments: 1,
    curveSegments: 4,
  });
  g.translate(0, 0, -thick * 0.15);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** The flail's chain from the handle's end (z −0.36), five links along −z; it swings (`swingFlail`). */
function flailChain(): THREE.Group {
  const chain = new THREE.Group();
  chain.position.z = -0.36;
  const link = new THREE.TorusGeometry(0.02, 0.006, 4, 8);
  const linkMat = phong(DARK_STEEL, 90);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(i ? link.clone() : link, linkMat);
    m.position.z = -0.03 - i * 0.045;
    m.rotation.set(0, Math.PI / 2, i % 2 ? Math.PI / 2 : 0);
    chain.add(m);
  }
  return chain;
}

/** Where each weapon's swing trail runs (base → tip), in the weapon's frame. */
const TRAIL: Record<Exclude<WeaponId, "arco" | "mangual">, [THREE.Vector3Tuple, THREE.Vector3Tuple]> = {
  daga: [[0, 0, -0.08], [0, 0, -0.36]],
  espada: [[0, 0, -0.25], [0, 0, -0.92]],
  hacha: [[0, 0, -0.45], [0.22, 0, -0.74]],
  // The modeled hammer's face sticks out less (0.15 m) than the old one's.
  martillo: [[0, 0, -0.6], [0.15, 0, -0.87]],
  maza: [[0, 0, -0.4], [0, 0, -0.7]],
  lanza: [[0, 0, -1.4], [0, 0, -1.9]],
};

/** A modeled piece (standing, +y forward) laid in the weapon frame: forward along −z, +x kept. */
function laid(part: THREE.Object3D, rotX = -Math.PI / 2): THREE.Group {
  const g = new THREE.Group();
  part.rotation.x = rotX;
  g.add(part);
  return g;
}

/** The bow's string: three points, the middle one pulled back with the draw. */
function bowString(): THREE.Line {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.62, 0.1), new THREE.Vector3(0, 0, 0.1), new THREE.Vector3(0, -0.62, 0.1)]),
    new THREE.LineBasicMaterial({ color: 0xf5f5f4 })
  );
}

/**
 * The weapon from the Meshy models (lib/arena3dModel.ts), in the same frame
 * and with the same extras as the drawn ones, or null until they're loaded.
 */
function modeledWeapon(kind: WeaponId): THREE.Group | null {
  if (kind === "arco") {
    // Modeled already in the bow's frame (limbs ±y, belly −z, tips at z +0.1).
    const bow = weaponPart("arco");
    if (!bow) return null;
    const g = new THREE.Group();
    g.add(bow);
    const string = bowString();
    g.add(string);
    g.userData.string = string;
    g.userData.modeled = true;
    return g;
  }
  if (kind === "mangual") {
    const handle = weaponPart("mangual-mango");
    const ball = weaponPart("mangual-bola");
    if (!handle || !ball) return null;
    const g = laid(handle);
    const chain = flailChain();
    // The ball hangs from its ring (origin) toward −y: turned to hang along the chain (−z).
    ball.rotation.x = Math.PI / 2;
    const hang = new THREE.Group();
    hang.position.z = -0.24;
    hang.add(ball);
    chain.add(hang);
    g.add(chain);
    g.userData.flail = chain;
    g.userData.tipObj = hang;
    g.userData.tip = new THREE.Vector3(0, 0, -0.69);
    g.userData.base = new THREE.Vector3(0, 0, -0.4);
    g.userData.modeled = true;
    return g;
  }
  const part = weaponPart(kind);
  if (!part) return null;
  const g = laid(part);
  const [base, tip] = TRAIL[kind];
  g.userData.base = new THREE.Vector3(...base);
  g.userData.tip = new THREE.Vector3(...tip);
  g.userData.modeled = true;
  return g;
}

/**
 * A weapon held at the origin (the grip), pointing along -z (blade, head or
 * tip forward). Sizes in meters. `userData.tip` / `userData.base` are the
 * points a swing trail follows.
 */
export function weaponMesh(kind: WeaponId): THREE.Group {
  const modeled = modeledWeapon(kind);
  if (modeled) return modeled;
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const steel = phong(STEEL, 110);
  const wood = lambert(WOOD);
  const leather = lambert(LEATHER);
  const gold = phong(GOLD);
  const hilt = (guard: number, grip: number) => {
    add(capsule(0.016, guard, 6, 2).rotateZ(Math.PI / 2), gold, 0, 0, -0.05);
    add(new THREE.CylinderGeometry(0.019, 0.021, grip, 8).rotateX(Math.PI / 2), leather, 0, 0, -0.04 + grip / 2);
    add(new THREE.SphereGeometry(0.032, 10, 8), gold, 0, 0, -0.03 + grip);
  };
  switch (kind) {
    case "daga":
      add(bladeGeo(0.3, 0.045, 0.012, 0.09), steel, 0, 0, -0.06);
      hilt(0.09, 0.1);
      g.userData.tip = new THREE.Vector3(0, 0, -0.36);
      g.userData.base = new THREE.Vector3(0, 0, -0.08);
      break;
    case "espada":
      add(bladeGeo(0.86, 0.058, 0.014, 0.14), steel, 0, 0, -0.06);
      hilt(0.2, 0.15);
      g.userData.tip = new THREE.Vector3(0, 0, -0.92);
      g.userData.base = new THREE.Vector3(0, 0, -0.25);
      break;
    case "hacha": {
      add(new THREE.CylinderGeometry(0.024, 0.03, 0.95, 8).rotateX(Math.PI / 2), wood, 0, 0, -0.35);
      const head = new THREE.Shape();
      head.moveTo(0, -0.05);
      head.lineTo(0.1, -0.1);
      head.quadraticCurveTo(0.16, -0.16, 0.2, -0.17);
      head.quadraticCurveTo(0.25, 0, 0.2, 0.17);
      head.quadraticCurveTo(0.16, 0.16, 0.1, 0.1);
      head.lineTo(0, 0.05);
      head.lineTo(-0.08, 0.03);
      head.lineTo(-0.11, 0);
      head.lineTo(-0.08, -0.03);
      head.closePath();
      // Drawn outward (x) along the shaft (y), then laid along the shaft (-z).
      const blade = new THREE.ExtrudeGeometry(head, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 1, curveSegments: 5 });
      blade.translate(0, 0, -0.006);
      blade.rotateX(-Math.PI / 2);
      add(blade, steel, 0, 0, -0.74);
      add(new THREE.CylinderGeometry(0.034, 0.034, 0.1, 8).rotateX(Math.PI / 2), lambert(DARK_STEEL), 0, 0, -0.74);
      add(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 8).rotateX(Math.PI / 2), leather, 0, 0, 0.03);
      g.userData.tip = new THREE.Vector3(0.22, 0, -0.74);
      g.userData.base = new THREE.Vector3(0, 0, -0.45);
      break;
    }
    case "martillo": {
      // A war hammer: a long shaft, a heavy square head with a flat face (+x) and a back spike.
      add(new THREE.CylinderGeometry(0.024, 0.03, 1.0, 8).rotateX(Math.PI / 2), wood, 0, 0, -0.38);
      add(new THREE.CylinderGeometry(0.029, 0.029, 0.16, 8).rotateX(Math.PI / 2), leather, 0, 0, 0.04);
      const dark = phong(DARK_STEEL, 70);
      add(new THREE.BoxGeometry(0.3, 0.13, 0.15), dark, 0.02, 0, -0.87);
      add(new THREE.CylinderGeometry(0.09, 0.08, 0.05, 12).rotateZ(Math.PI / 2), steel, 0.19, 0, -0.87);
      add(new THREE.ConeGeometry(0.045, 0.2, 6).rotateZ(Math.PI / 2), steel, -0.21, 0, -0.87);
      add(new THREE.ConeGeometry(0.03, 0.12, 6).rotateX(-Math.PI / 2), steel, 0, 0, -1.0);
      for (const z of [-0.8, -0.94]) add(new THREE.BoxGeometry(0.31, 0.14, 0.012), gold, 0.02, 0, z);
      g.userData.tip = new THREE.Vector3(0.22, 0, -0.87);
      g.userData.base = new THREE.Vector3(0, 0, -0.6);
      break;
    }
    case "mangual": {
      // A flail: a short handle, a chain from its end and a spiked ball (its chain swings, see `swingFlail`).
      add(new THREE.CylinderGeometry(0.022, 0.026, 0.42, 8).rotateX(Math.PI / 2), wood, 0, 0, -0.12);
      add(new THREE.CylinderGeometry(0.027, 0.027, 0.12, 8).rotateX(Math.PI / 2), leather, 0, 0, 0.03);
      add(new THREE.SphereGeometry(0.03, 10, 8), gold, 0, 0, 0.1);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8).rotateX(Math.PI / 2), phong(DARK_STEEL), 0, 0, -0.34);
      const chain = flailChain();
      const spikes: THREE.BufferGeometry[] = [new THREE.SphereGeometry(0.075, 12, 9)];
      const dirs: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, -0.7, 0], [0.7, 0, 0.7], [-0.7, 0, -0.7]];
      for (const [x, y, z] of dirs) {
        const c = new THREE.ConeGeometry(0.018, 0.06, 5);
        c.translate(0, 0.095, 0);
        c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z).normalize()));
        spikes.push(c);
      }
      const ball = new THREE.Mesh(merge(spikes), phong(DARK_STEEL, 60));
      ball.position.z = -0.33;
      chain.add(ball);
      g.add(chain);
      g.userData.flail = chain;
      g.userData.tipObj = ball;
      g.userData.tip = new THREE.Vector3(0, 0, -0.69);
      g.userData.base = new THREE.Vector3(0, 0, -0.4);
      break;
    }
    case "maza": {
      add(new THREE.CylinderGeometry(0.023, 0.028, 0.7, 8).rotateX(Math.PI / 2), wood, 0, 0, -0.25);
      add(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 8).rotateX(Math.PI / 2), leather, 0, 0, 0.03);
      const dark = phong(DARK_STEEL, 60);
      const flange = new THREE.Shape();
      flange.moveTo(0, -0.1);
      flange.quadraticCurveTo(0.1, -0.07, 0.11, 0);
      flange.quadraticCurveTo(0.1, 0.07, 0, 0.11);
      flange.closePath();
      const parts: THREE.BufferGeometry[] = [new THREE.SphereGeometry(0.06, 10, 8), at(new THREE.ConeGeometry(0.035, 0.08, 8), 0, 0.13, 0)];
      for (let i = 0; i < 6; i++) {
        const f = new THREE.ExtrudeGeometry(flange, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 1, curveSegments: 4 });
        f.translate(0, 0, -0.004);
        f.rotateY((i / 6) * Math.PI * 2);
        parts.push(f);
      }
      const head = merge(parts);
      head.rotateX(-Math.PI / 2);
      add(head, dark, 0, 0, -0.64);
      g.userData.tip = new THREE.Vector3(0, 0, -0.7);
      g.userData.base = new THREE.Vector3(0, 0, -0.4);
      break;
    }
    case "lanza": {
      add(new THREE.CylinderGeometry(0.019, 0.022, 2.0, 8).rotateX(Math.PI / 2), wood, 0, 0, -0.6);
      const leaf = lathe([[0, 0], [0.026, 0.03], [0.045, 0.11], [0.032, 0.21], [0, 0.31]], 4).scale(1, 1, 0.35);
      leaf.rotateX(-Math.PI / 2);
      add(leaf, steel, 0, 0, -1.6);
      add(new THREE.CylinderGeometry(0.02, 0.026, 0.09, 8).rotateX(Math.PI / 2), phong(DARK_STEEL), 0, 0, -1.58);
      add(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 8).rotateX(Math.PI / 2), leather, 0, 0, 0.08);
      g.userData.tip = new THREE.Vector3(0, 0, -1.9);
      g.userData.base = new THREE.Vector3(0, 0, -1.4);
      break;
    }
    case "arco": {
      // Vertical bow in the x/y plane; the grip at the origin.
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.62, 0.1),
        new THREE.Vector3(0, 0.4, -0.12),
        new THREE.Vector3(0, 0, -0.18),
        new THREE.Vector3(0, -0.4, -0.12),
        new THREE.Vector3(0, -0.62, 0.1),
      ]);
      add(new THREE.TubeGeometry(curve, 20, 0.017, 6, false), wood);
      const string = bowString();
      g.add(string);
      g.userData.string = string;
      add(capsule(0.026, 0.1, 6, 2), leather, 0, 0, -0.17);
      break;
    }
  }
  return g;
}

export function shieldMesh(team: TeamId | null, color?: number, emblem = "ninguno"): THREE.Group {
  // The modeled knight's own shield once it's loaded: the face in the team's
  // color, and the chosen emblem over the model's symbol.
  const modeled = shieldPart(color ?? (team ? TEAM_COLORS[team] : WOOD));
  if (modeled) {
    const decal = emblemDecal(emblem, 0.3);
    if (decal && modeled.symbol) {
      modeled.symbol.visible = false;
      decal.position.copy(modeled.emblemAt);
      modeled.group.add(decal);
    }
    modeled.group.userData.modeled = true;
    return modeled.group;
  }
  const g = new THREE.Group();
  // A slightly domed round shield, its front facing -z.
  const R = 0.34;
  const sphereR = 0.95;
  const theta = Math.asin(R / sphereR);
  const dome = new THREE.SphereGeometry(sphereR, 22, 3, 0, Math.PI * 2, 0, theta);
  dome.rotateX(-Math.PI / 2);
  dome.translate(0, 0, sphereR * Math.cos(theta) - 0.01);
  const face = new THREE.Mesh(dome, lambert(color ?? (team ? TEAM_COLORS[team] : WOOD), { side: THREE.DoubleSide }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.024, 6, 26), phong(DARK_STEEL));
  rim.position.z = -0.005;
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), phong(GOLD));
  boss.position.z = -0.06;
  // A gold cross band over the face.
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.05, R * 1.9, 0.012), phong(GOLD));
  band.position.z = -0.045;
  const band2 = band.clone();
  band2.rotation.z = Math.PI / 2;
  // With an emblem, it takes the place of the cross and the boss.
  const decal = emblemDecal(emblem, 0.4);
  if (decal) {
    decal.position.z = -0.082;
    g.add(face, rim, decal);
  } else g.add(face, rim, band, band2, boss);
  return g;
}

export function arrowMesh(): THREE.Group {
  // Modeled tip up (+y), centered: laid with the tip toward −z like the drawn one.
  const modeled = weaponPart("flecha");
  if (modeled) return laid(modeled);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 5).rotateX(Math.PI / 2), lambert(WOOD)));
  const tip = new THREE.Mesh(lathe([[0, 0], [0.018, 0.02], [0, 0.08]], 4).rotateX(-Math.PI / 2), phong(STEEL));
  tip.position.z = -0.35;
  const vane = new THREE.Shape();
  vane.moveTo(0, 0);
  vane.lineTo(0.035, 0.03);
  vane.lineTo(0.035, 0.11);
  vane.lineTo(0, 0.09);
  vane.closePath();
  const vaneGeo = new THREE.ShapeGeometry(vane).rotateX(Math.PI / 2);
  const fmat = lambert(0xf8fafc, { side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const v = new THREE.Mesh(i ? vaneGeo.clone() : vaneGeo, fmat);
    v.rotation.z = (i / 3) * Math.PI * 2;
    v.position.z = 0.24;
    g.add(v);
  }
  g.add(tip);
  return g;
}

/** A round flask of red potion with a cork, glowing a little. */
function potionMesh(): THREE.Group {
  const g = new THREE.Group();
  const glass = new THREE.MeshPhongMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.35, shininess: 120 });
  const liquid = new THREE.MeshLambertMaterial({ color: 0xef4444, emissive: 0x991b1b, emissiveIntensity: 0.8 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), glass);
  const fill = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 12), liquid);
  fill.position.y = -0.01;
  const neck = new THREE.Mesh(lathe([[0.075, 0], [0.05, 0.06], [0.046, 0.16], [0.06, 0.18]], 12), glass);
  neck.position.y = 0.12;
  const cork = new THREE.Mesh(capsule(0.045, 0.03, 8, 2), lambert(0xa16207));
  cork.position.y = 0.32;
  g.add(fill, bulb, neck, cork);
  return g;
}

export function itemMesh(kind: ItemKind): THREE.Group {
  if (kind === "pocion") return potionMesh();
  return kind === "escudo" ? shieldMesh(null) : weaponMesh(kind);
}

// ---- Knights ------------------------------------------------------------------

interface LegRig {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
}

interface ArmRig {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  grip: THREE.Group;
}

/** Arm angles (in the right arm's terms; the left one is mirrored). */
interface ArmT {
  /** Raise forward (x), sweep around the body (y, + = inward), raise sideways (z). */
  x: number;
  y: number;
  z: number;
  elbow: number;
  /** Hand bend (forward +) and the weapon's roll along its length. */
  wrist: number;
  roll: number;
  /** Shoulder pushed back (+) or forward (−). */
  push: number;
}

/** Everything the animation drives, eased toward each frame's target. */
interface Anim {
  r: ArmT;
  l: ArmT;
  thighX0: number;
  thighZ0: number;
  knee0: number;
  thighX1: number;
  thighZ1: number;
  knee1: number;
  crouch: number;
  bodyX: number;
  bodyZ: number;
  tiltX: number;
  tiltZ: number;
  hipYaw: number;
  hipRoll: number;
  torsoYaw: number;
  torsoX: number;
  torsoZ: number;
  headX: number;
  headY: number;
}

export interface Knight {
  team: TeamId;
  /** Its cloth and shield color (the team's, or its own in «todos contra todos»). */
  tint: number;
  /** Its emblem (on the chest and the shield). */
  emblem: string;
  cape: THREE.Group | null;
  trailColor: THREE.Color | null;
  root: THREE.Group;
  body: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  legs: [LegRig, LegRig];
  arms: [ArmRig, ArmRig];
  flaps: [THREE.Group, THREE.Group];
  hand: THREE.Group;
  offHand: THREE.Group;
  weapon: THREE.Group | null;
  weaponKind: WeaponId | null;
  shield: THREE.Group | null;
  shadow: THREE.Mesh;
  tag: THREE.Sprite;
  tagKey: string;
  label: string;
  pose: KnightPose | null;
  hp: number;
  /** Armor that flashes white for a moment when hit. */
  flashMats: (THREE.MeshPhongMaterial | THREE.MeshStandardMaterial)[];
  /**
   * The modeled knight (lib/arena3dModel.ts) when it's loaded: the rig above
   * is then only animated, never drawn, and drives the model's bones.
   */
  model: KnightModel | null;
  /** Where the nearest rival stands (the modeled knight looks at it), or null. */
  target: { x: number; z: number } | null;
  flashT: number;
  lastAct: string;
  dustAcc: number;
  trailAcc: number;
  /** Walk cycle phase, smoothed velocity in the world, last position. */
  walk: number;
  vx: number;
  vz: number;
  px: number;
  pz: number;
  havePrev: boolean;
  /** Seconds since it fell (for the fall animation), -1 standing. */
  fallen: number;
  fallLanded: boolean;
  /** Springs: a hit rocks the torso back, a landing squashes the legs. */
  hitX: number;
  hitV: number;
  squash: number;
  squashV: number;
  wasAir: boolean;
  seed: number;
  anim: Anim;
}

const armT = (x: number, y: number, z: number, elbow: number, wrist = 0, roll = 0, push = 0): ArmT => ({ x, y, z, elbow, wrist, roll, push });

export function knightMesh(team: TeamId, geos: KnightGeos, tint: number = TEAM_COLORS[team], look: KnightLook = PLAIN_LOOK): Omit<Knight, "tag" | "tagKey" | "label" | "pose" | "hp"> {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const armorColor = Number.parseInt((look.armor || "#b8c2cc").replace(/^#/, ""), 16);
  const armor = phong(Number.isFinite(armorColor) ? armorColor : STEEL, 90);
  const darkArmor = phong(DARK_STEEL, 40);
  const cloth = lambert(tint, { side: THREE.DoubleSide });
  const leather = lambert(LEATHER);
  const gold = phong(GOLD);
  const black = lambert(0x0b0b0f, { side: THREE.DoubleSide });
  // The modeled knight, once loaded; until then (or without it) the rig is drawn.
  const model = knightModel({ armor: look.armor, tint, plume: look.plume, helm: look.helm, cape: look.cape });
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D) => {
    if (model) return;
    parent.add(new THREE.Mesh(geo, mat));
  };

  const hips = new THREE.Group();
  hips.position.y = HIP_Y;
  body.add(hips);
  mesh(geos.fauld, armor, hips);
  mesh(geos.belt, leather, hips);
  const flaps: THREE.Group[] = [];
  for (const z of [-1, 1]) {
    const f = new THREE.Group();
    f.position.set(0, 0.0, z * 0.19);
    mesh(geos.flap, cloth, f);
    hips.add(f);
    flaps.push(f);
  }

  const legs: LegRig[] = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.12, 0, 0);
    mesh(geos.thighMail, darkArmor, hip);
    mesh(geos.thighPlate, armor, hip);
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    hip.add(knee);
    mesh(geos.shin, armor, knee);
    const ankle = new THREE.Group();
    ankle.position.y = -SHIN;
    knee.add(ankle);
    mesh(geos.boot, leather, ankle);
    mesh(geos.toe, darkArmor, ankle);
    hips.add(hip);
    legs.push({ hip, knee, ankle });
  }

  const torso = new THREE.Group();
  torso.position.y = HIP_Y;
  body.add(torso);
  let cape: THREE.Group | null = null;
  if (model) {
    // Only its sway is used: the model's own cape follows it.
    if (look.cape) cape = new THREE.Group();
  } else if (look.cape) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.16, 0.22);
    shape.quadraticCurveTo(0, 0.25, 0.16, 0.22);
    shape.lineTo(0.23, -0.36);
    shape.quadraticCurveTo(0, -0.43, -0.23, -0.36);
    shape.closePath();
    cape = new THREE.Group();
    cape.position.set(0, -0.05, 0.17);
    const capeColor = Number.parseInt(look.cape.replace(/^#/, ""), 16);
    const capeMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), lambert(Number.isFinite(capeColor) ? capeColor : tint, { side: THREE.DoubleSide }));
    capeMesh.position.z = 0.015;
    capeMesh.castShadow = true;
    cape.add(capeMesh);
    torso.add(cape);
  }
  mesh(geos.torsoSteel, armor, torso);
  mesh(geos.torsoCloth, cloth, torso);
  mesh(geos.torsoGold, gold, torso);
  const chest = emblemDecal(look.emblem, 0.13);
  if (chest && model) {
    // On the breastplate's front (+z in the model, where it's most forward).
    chest.position.set(0, -0.02, 0.197);
    chest.rotation.y = Math.PI;
    model.chest.add(chest);
  } else if (chest) {
    chest.position.set(0, 0.2, -0.222);
    torso.add(chest);
  }

  const head = new THREE.Group();
  head.position.y = 0.66;
  torso.add(head);
  mesh(geos.helm, armor, head);
  mesh(geos.helmGold, gold, head);
  mesh(geos.visor, black, head);
  if (!model) {
    const plumeMat = look.plume ? lambert(parseInt(look.plume.slice(1), 16), { side: THREE.DoubleSide }) : cloth;
    const extras = look.helm !== "yelmo" ? helmExtras() : null;
    if (look.helm === "cresta") mesh(extras!.crest, plumeMat, head);
    else mesh(geos.plume, plumeMat, head);
    if (look.helm === "cuernos") mesh(extras!.horns, lambert(0xe9dfc6), head);
    if (look.helm === "corona") mesh(extras!.crown, gold, head);
    if (look.helm === "alado") mesh(extras!.wings, phong(0xe5e7eb, 60), head);
  }

  const arms: ArmRig[] = [];
  let hand = new THREE.Group();
  let offHand = new THREE.Group();
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.rotation.order = "YZX";
    shoulder.position.set(side * SHOULDER_X, SHOULDER_Y, 0);
    mesh(geos.upperArm, darkArmor, shoulder);
    const elbow = new THREE.Group();
    elbow.position.y = -UPPER;
    shoulder.add(elbow);
    mesh(geos.forearm, armor, elbow);
    mesh(geos.gauntlet, darkArmor, elbow);
    const grip = new THREE.Group();
    grip.position.y = -FORE;
    elbow.add(grip);
    torso.add(shoulder);
    arms.push({ shoulder, elbow, grip });
    // With the model, weapons go in its fists (same frame as the rig's grips).
    const held = model ? model.grips[side === 1 ? 1 : 0] : grip;
    if (side === 1) hand = held;
    else offHand = held;
  }
  if (model) body.add(model.holder);

  const shadow = new THREE.Mesh(geos.shadow, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
  shadow.position.y = 0.02;
  shadow.renderOrder = 1;

  const rest = armT(0.12, 0, 0.1, 0.25);
  return {
    team,
    tint,
    emblem: look.emblem,
    cape,
    trailColor: look.trail ? new THREE.Color(Number.parseInt(look.trail.replace(/^#/, ""), 16)) : null,
    root,
    body,
    hips,
    torso,
    head,
    legs: legs as [LegRig, LegRig],
    arms: arms as [ArmRig, ArmRig],
    flaps: flaps as [THREE.Group, THREE.Group],
    hand,
    offHand,
    weapon: null,
    weaponKind: null,
    shield: null,
    shadow,
    flashMats: model ? model.armor : [armor, darkArmor, gold],
    model,
    target: null,
    flashT: 0,
    lastAct: "",
    dustAcc: 0,
    trailAcc: 0,
    walk: Math.random() * 6,
    vx: 0,
    vz: 0,
    px: 0,
    pz: 0,
    havePrev: false,
    fallen: -1,
    fallLanded: false,
    hitX: 0,
    hitV: 0,
    squash: 0,
    squashV: 0,
    wasAir: false,
    seed: Math.random() * 100,
    anim: {
      r: { ...rest },
      l: { ...rest },
      thighX0: 0,
      thighZ0: 0,
      knee0: 0,
      thighX1: 0,
      thighZ1: 0,
      knee1: 0,
      crouch: 0,
      bodyX: 0,
      bodyZ: 0,
      tiltX: 0,
      tiltZ: 0,
      hipYaw: 0,
      hipRoll: 0,
      torsoYaw: 0,
      torsoX: 0,
      torsoZ: 0,
      headX: 0,
      headY: 0,
    },
  };
}

/** Puts a weapon (and the shield) in the knight's hands for its gear. */
export function equipKnight(k: Knight, gear: Gear) {
  if (k.weaponKind !== gear.w) {
    if (k.weapon) {
      k.weapon.parent?.remove(k.weapon);
      disposeTree(k.weapon);
    }
    k.weapon = weaponMesh(gear.w);
    k.weaponKind = gear.w;
    if (gear.w === "arco") {
      // Limbs up and the belly forward when the arm points ahead.
      k.weapon.rotation.set(-Math.PI / 2, 0, 0);
      k.offHand.add(k.weapon);
    } else {
      // Blade forward from the fist, tilted up a bit.
      k.weapon.rotation.x = 0.3;
      k.hand.add(k.weapon);
    }
    k.weapon.traverse((o) => ((o as THREE.Mesh).castShadow = (k.root.userData.shadows as boolean) ?? false));
  }
  if (!!k.shield !== gear.sh) {
    if (k.shield) {
      k.offHand.remove(k.shield);
      disposeTree(k.shield);
      k.shield = null;
    } else {
      // Center grip: the face across the forearm, facing where the forearm points.
      k.shield = shieldMesh(k.team, k.tint, k.emblem);
      k.shield.rotation.x = -Math.PI / 2;
      k.shield.position.set(0, -0.07, 0);
      k.offHand.add(k.shield);
      k.shield.traverse((o) => ((o as THREE.Mesh).castShadow = (k.root.userData.shadows as boolean) ?? false));
    }
  }
}

// ---- Animation ------------------------------------------------------------------

export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => t * t * (3 - 2 * t);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Ends past 1 and settles back: the swing's overshoot. */
export const easeOutBack = (t: number, c = 1.6) => 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);

function mixArm(a: ArmT, b: ArmT, t: number): ArmT {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
    elbow: lerp(a.elbow, b.elbow, t),
    wrist: lerp(a.wrist, b.wrist, t),
    roll: lerp(a.roll, b.roll, t),
    push: lerp(a.push, b.push, t),
  };
}

// Melee guard and the strikes, right arm. Wrist values aim the weapon so
// (shoulder x + elbow + wrist + 0.3 mount) ≈ 1.3: up and a bit forward.
const GUARD = armT(0.35, 0.3, 0.18, 1.3, -0.65);
const SPEAR_GUARD = armT(0.35, 0.15, 0.2, 1.3, -1.7, 0, 0.05);
const RUN_ARM = armT(0.3, 0.1, 0.15, 1.45, -0.7);
// Horizontal slashes (espada, daga): from the right, and back from the left.
const SLASH_WOUND = armT(0.2, -0.7, 1.35, 1.6, 1.2, 0, 0.06);
const SLASH_SWUNG = armT(0.3, 2.0, 1.3, 0.35, -1.9, 0, -0.08);
const SLASH_WOUND_L = armT(0.3, 2.4, 1.3, 1.5, 1.2, 0, 0);
const SLASH_SWUNG_L = armT(0.25, -0.5, 1.4, 0.3, -1.9, 0, -0.05);
// Overhead chops (hacha, maza): up behind the head, down through the target.
const CHOP_WOUND = armT(2.75, 0.15, 0.35, 1.5, -1.6, 0, 0.08);
const CHOP_SWUNG = armT(0.35, 0.45, 0.1, 0.15, -1.1, 0, -0.12);
// Thrusts (lanza, a dagger's stab): fist pulled back to the chest, then straight out.
const THRUST_WOUND = armT(0.2, -0.05, 0.25, 1.95, -2.3, 0, 0.18);
const THRUST_SWUNG = armT(1.5, 0.12, 0.08, 0.05, -1.9, 0, -0.28);
// Left arm.
const SHIELD_GUARD = armT(0.5, 0.45, 0.12, 1.05, 0);
const SHIELD_BLOCK = armT(0.95, 0.6, 0.15, 0.95, 0);
const FIST_GUARD = armT(0.35, 0.3, 0.15, 1.35, 0);
const SPEAR_SUPPORT = armT(0.95, 0.6, 0.1, 0.55, 0);
// Kick: arms out for balance.
const KICK_ARM_R = armT(0.45, -0.25, 0.75, 1.0, -0.5);
const KICK_ARM_L = armT(0.55, -0.1, 0.7, 0.9);
// Specials: the spin (arms out wide), the slam (both hands up, then down to the ground), the lunge (all the way out).
const SPIN_OUT = armT(0.35, 0.55, 1.45, 0.15, -1.6, 0, -0.05);
const SPIN_OFF = armT(0.3, 0.2, 1.35, 0.35);
const SLAM_UP = armT(3.0, 0.3, 0.2, 1.15, -1.4, 0, 0.1);
const SLAM_UP_L = armT(3.0, 0.75, 0.25, 1.15);
const SLAM_DOWN = armT(0.15, 0.4, 0.1, 0.05, -0.8, 0, -0.15);
const SLAM_DOWN_L = armT(0.35, 0.8, 0.15, 0.2);
const LUNGE_OUT = armT(1.55, 0.08, 0.05, 0.0, -1.9, 0, -0.4);

export interface KnightEvents {
  /** Feet that touched the ground this frame (bit 1 left, bit 2 right). */
  steps: number;
  /** Landed from a jump (how hard, 0–1). */
  land: number;
  /** Just fell down / just hit the ground lying. */
  fell: boolean;
  thud: boolean;
}

const LEG = (THIGH + SHIN) / 2;

/** Where a knight's limbs are for its pose (third person and rivals). */
export function animateKnight(k: Knight, p: KnightPose, dt: number, time: number): KnightEvents {
  const ev: KnightEvents = { steps: 0, land: 0, fell: false, thud: false };
  const weapon = WEAPONS[p.gear.w];
  const kind = p.gear.w;

  // Velocity, measured from the positions (direction of travel in the knight's frame).
  if (k.havePrev && dt > 0) {
    let vx = (p.x - k.px) / dt;
    let vz = (p.z - k.pz) / dt;
    if (Math.hypot(vx, vz) > 20) vx = vz = 0;
    const kv = 1 - Math.exp(-dt * 10);
    k.vx += (vx - k.vx) * kv;
    k.vz += (vz - k.vz) * kv;
  }
  k.px = p.x;
  k.pz = p.z;
  k.havePrev = true;
  const fx = -Math.sin(p.yaw);
  const fz = -Math.cos(p.yaw);
  const vf = k.vx * fx + k.vz * fz;
  const vs = k.vx * -fz + k.vz * fx;
  const vm = Math.hypot(vf, vs);
  const dirF = vm > 0.3 ? vf / vm : 1;
  const dirS = vm > 0.3 ? vs / vm : 0;
  const air = p.y > 0.05;
  const speed = p.act === "dodge" ? 0 : p.speed;
  const moving = air ? 0 : clamp01(speed / 4.2);
  const running = p.running && moving > 0.5;
  if (k.cape) {
    const speedLift = Math.min(0.5, moving * 0.38);
    k.cape.rotation.x = -0.08 - speedLift - Math.sin(time * 6 + k.seed) * (0.035 + moving * 0.09);
    k.cape.rotation.z = Math.sin(time * 3.5 + k.seed) * (0.025 + moving * 0.075);
  }

  // Walk cycle: the phase follows the distance walked (backwards when backing up).
  const stride = running ? 3.0 : 2.1;
  const before = Math.sin(k.walk);
  k.walk += ((dt * speed) / stride) * Math.PI * 2 * (dirF < -0.3 ? -1 : 1);
  if (!air && moving > 0.25 && Math.sign(Math.sin(k.walk)) !== Math.sign(before)) ev.steps |= before > 0 ? 1 : 2;
  const amp = moving * (running ? 0.85 : 0.6);
  const s0 = Math.sin(k.walk);
  const s1 = -s0;
  const c0 = Math.cos(k.walk);
  const lift0 = Math.max(0, c0);
  const lift1 = Math.max(0, -c0);
  const fwdAmt = Math.min(1, Math.abs(dirF) + 0.2);
  const idle = 1 - moving;

  // Breathing and a slow weight shift while standing.
  const breathe = Math.sin(time * 1.7 + k.seed);
  const shift = Math.sin(time * 0.55 + k.seed * 2);

  const t = p.actLen > 0 ? clamp01(p.actT / p.actLen) : 0;
  const side = p.combo % 2 ? -1 : 1;
  const family: "slash" | "chop" | "thrust" | "bow" = weapon.ranged
    ? "bow"
    : kind === "hacha" || kind === "maza" || kind === "martillo" || kind === "mangual"
      ? "chop"
      : kind === "lanza" || (kind === "daga" && p.combo % 3 === 2)
        ? "thrust"
        : "slash";

  // Defaults: guard stance, with the walk on top.
  let r: ArmT = kind === "lanza" ? SPEAR_GUARD : GUARD;
  let l: ArmT = p.gear.sh ? SHIELD_GUARD : kind === "lanza" ? SPEAR_SUPPORT : FIST_GUARD;
  let crouch = 0.035 * idle + 0.02 * moving;
  let torsoYaw = -0.12 * amp * s1 + 0.06 * idle;
  let torsoX = -0.04 - (running ? 0.2 : 0.05) * moving + 0.015 * breathe;
  let torsoZ = -0.12 * dirS * moving + 0.02 * shift * idle;
  let hipYaw = 0.22 * amp * s1;
  let headX = p.pitch * 0.6 - 0.01 * breathe;
  let headY = 0;
  let bodyZ = 0;
  let tiltX = 0;
  let tiltZ = 0;
  // A fighting stance: left foot forward, right back.
  let stance0 = 0.2 * idle;
  let stance1 = -0.16 * idle;
  let spread = 0.06 + 0.03 * idle;
  let armK = 16;

  if (running) r = mixArm(r, { ...RUN_ARM, x: RUN_ARM.x - s1 * 0.7 }, 0.85);
  else r = { ...r, x: r.x - 0.25 * amp * s1 };
  if (running && !p.gear.sh) l = mixArm(l, { ...RUN_ARM, x: RUN_ARM.x - s0 * 0.7, wrist: 0 }, 0.85);
  else l = { ...l, x: l.x - (p.gear.sh ? 0.15 : 0.4) * amp * s0 };

  const strikeFamily = () => {
    if (family === "slash") return side > 0 ? [SLASH_WOUND, SLASH_SWUNG] : [SLASH_WOUND_L, SLASH_SWUNG_L];
    if (family === "chop") return [{ ...CHOP_WOUND, y: CHOP_WOUND.y * side, z: side > 0 ? CHOP_WOUND.z : -0.15 }, { ...CHOP_SWUNG, y: side > 0 ? CHOP_SWUNG.y : 0.05 }];
    return [THRUST_WOUND, THRUST_SWUNG];
  };

  // A kick (right leg, applied with the legs below) and the body spinning (the whirlwind).
  let kickAmt = 0;
  let kickExt = 0;
  let spin = 0;
  let rise = 0;
  const spKind = specialOf(kind);
  const sp = SPECIALS[spKind];
  // Seconds into the special's wind-up (0–1), its blow (0–1) and its recovery (0–1).
  const spW = p.act === "special" ? clamp01(p.actT / sp.windup) : 0;
  const spA = p.act === "special" ? clamp01((p.actT - sp.windup) / sp.active) : 0;
  const spR = p.act === "special" ? clamp01((p.actT - sp.windup - sp.active) / sp.recover) : 0;

  if (p.act === "kick") {
    const kt = p.actT / KICK_SECONDS;
    const hitT = KICK_HIT / KICK_SECONDS;
    const back = ease(clamp01((kt - 0.55) / 0.45));
    kickAmt = ease(clamp01(kt / (hitT * 0.7))) * (1 - back);
    kickExt = clamp01((kt - hitT * 0.55) / (hitT * 0.5)) * (1 - back);
    r = mixArm(r, KICK_ARM_R, kickAmt);
    l = mixArm(l, p.gear.sh ? SHIELD_GUARD : KICK_ARM_L, kickAmt);
    torsoX += 0.3 * kickAmt + 0.1 * kickExt;
    headX -= 0.15 * kickAmt;
    stance0 = 0.05;
    crouch += 0.05 * kickAmt;
    bodyZ = -0.12 * kickExt;
    armK = 30;
  } else if (p.act === "special" && spKind === "torbellino") {
    const w = easeInOutCubic(spW);
    r = mixArm(r, SLASH_WOUND, w);
    torsoYaw = -1.1 * w;
    hipYaw = -0.4 * w;
    crouch += 0.12 * w;
    stance0 = 0.3;
    stance1 = -0.25;
    spread = 0.14;
    if (spA > 0) {
      // Two full turns (to the right), arms flung out.
      spin = -Math.PI * 4 * easeInOutCubic(spA);
      r = mixArm(SPIN_OUT, r, spR);
      l = mixArm(SPIN_OFF, l, spR);
      torsoYaw = lerp(0.2, 0, spR);
      hipYaw = 0;
      crouch += 0.05;
    }
    armK = 30;
  } else if (p.act === "special" && spKind === "terremoto") {
    const w = easeInOutCubic(spW);
    if (spA <= 0) {
      // Both hands up, leaning back and rising on the toes.
      r = mixArm(r, SLAM_UP, w);
      l = mixArm(l, SLAM_UP_L, w);
      torsoX += 0.3 * w;
      headX += 0.15 * w;
      rise = 0.14 * ease(clamp01((spW - 0.45) / 0.55));
      crouch += 0.12 * Math.sin(Math.min(1, spW * 2) * Math.PI) * (spW < 0.5 ? 1 : 0);
    } else {
      // Down into the ground, deep.
      const down = ease(clamp01(spA * 2)) * (1 - ease(spR));
      r = mixArm(mixArm(SLAM_UP, SLAM_DOWN, ease(clamp01(spA * 2))), r, ease(spR));
      l = mixArm(mixArm(SLAM_UP_L, SLAM_DOWN_L, ease(clamp01(spA * 2))), l, ease(spR));
      torsoX -= 0.6 * down;
      headX -= 0.2 * down;
      crouch += 0.36 * down;
      stance0 = 0.45 * down + 0.2 * (1 - down);
      stance1 = -0.35 * down;
      spread = 0.16;
    }
    armK = spA > 0 ? 45 : 22;
  } else if (p.act === "special" && spKind === "estocada") {
    const w = easeInOutCubic(spW);
    r = mixArm(r, THRUST_WOUND, w);
    if (!p.gear.sh) l = mixArm(l, armT(0.7, 0.7, 0.1, 1.0), w);
    torsoYaw = -0.7 * w;
    hipYaw = -0.3 * w;
    crouch += 0.16 * w;
    stance0 = 0.45 * w;
    stance1 = -0.4 * w;
    spread = 0.12;
    if (spA > 0) {
      const out = easeOutBack(clamp01(spA * 1.6), 1.2) * (1 - ease(spR));
      r = mixArm(mixArm(THRUST_WOUND, LUNGE_OUT, out), r, ease(spR));
      if (!p.gear.sh) l = mixArm(armT(1.35, 0.5, 0.1, 0.25), l, ease(spR));
      torsoYaw = lerp(0.5, 0, ease(spR));
      torsoX -= 0.35 * out;
      bodyZ = -0.3 * out;
      stance0 = 0.75 * (1 - ease(spR)) + 0.2 * ease(spR);
      stance1 = -0.6 * (1 - ease(spR));
    }
    armK = spA > 0 ? 40 : 24;
  } else if (family === "bow") {
    const aim = Math.PI / 2;
    l = armT(aim, -0.15, 0, 0.05);
    // The triple arrow: a quick full draw, then the release.
    const drawing = p.act === "draw" ? p.draw : p.act === "special" && spA <= 0 ? ease(spW) : 0;
    r = mixArm(armT(aim - 0.25, 0.9, 0.2, 0.7), armT(0.05, -0.35, 1.45, 2.35), ease(drawing));
    torsoX += p.pitch * 0.45;
    headX = p.pitch * 0.25;
    torsoYaw = -0.15 - 0.15 * drawing;
    stance0 = 0.25;
    stance1 = -0.2;
    spread = 0.1;
    crouch += 0.03;
  } else if (p.blocking) {
    if (p.gear.sh) {
      l = SHIELD_BLOCK;
      r = armT(0.3, 0.1, 0.25, 1.35, -0.6);
      headX -= 0.12;
    } else {
      r = armT(0.25, 0.35, 1.25, 1.3, -0.1, Math.PI / 2);
      l = armT(0.3, 0.55, 1.1, 1.5, 0);
    }
    crouch += 0.1;
    torsoX -= 0.08;
    stance0 = 0.28;
    stance1 = -0.22;
    spread = 0.12;
  } else if (p.act === "windup") {
    const [wound] = strikeFamily();
    // Chained swings start from where the last one ended.
    const prevSwung = family === "slash" ? (side > 0 ? SLASH_SWUNG_L : SLASH_SWUNG) : family === "chop" ? CHOP_SWUNG : THRUST_SWUNG;
    const w = easeInOutCubic(t);
    r = mixArm(p.combo > 0 ? prevSwung : r, wound, w);
    armK = 26;
    if (family === "slash") {
      torsoYaw = -0.6 * side * w;
      hipYaw = -0.25 * side * w;
      torsoX += 0.05 * w;
    } else if (family === "chop") {
      torsoX += 0.25 * w;
      torsoYaw = -0.2 * side * w;
      headX += 0.1 * w;
      stance0 = 0.3;
    } else {
      torsoYaw = -0.5 * w;
      hipYaw = -0.2 * w;
      torsoX += 0.05 * w;
      stance0 = 0.25;
      stance1 = -0.25;
    }
    crouch += 0.05 * w;
    if (kind === "lanza" && !p.gear.sh) l = mixArm(l, armT(0.7, 0.7, 0.1, 1.0), w);
  } else if (p.act === "recover") {
    const [wound, swung] = strikeFamily();
    const s = clamp01(t / 0.32);
    const f = easeOutBack(s, family === "thrust" ? 1.2 : 1.7);
    const back = ease(clamp01((t - 0.5) / 0.5));
    const hit = Math.sin(Math.min(1, t / 0.55) * Math.PI);
    r = mixArm(mixArm(wound, swung, f), r, back);
    armK = s < 1 ? 40 : 18;
    if (family === "slash") {
      torsoYaw = lerp(lerp(-0.6 * side, 0.7 * side, f), 0, back);
      hipYaw = lerp(lerp(-0.25 * side, 0.3 * side, f), 0, back);
      torsoX -= 0.15 * hit;
      stance0 = 0.3 * (1 - back);
    } else if (family === "chop") {
      torsoX += lerp(lerp(0.25, -0.32, f), 0, back);
      headX -= 0.25 * hit;
      crouch += 0.1 * hit;
      stance0 = 0.4 * (1 - back) + 0.2 * back;
      stance1 = -0.3;
    } else {
      torsoYaw = lerp(lerp(-0.5, 0.45, f), 0, back);
      hipYaw = lerp(lerp(-0.2, 0.2, f), 0, back);
      torsoX -= 0.22 * hit;
      bodyZ = -0.18 * hit;
      stance0 = 0.5 * hit + 0.2 * (1 - hit);
      stance1 = -0.35 * hit - 0.1;
      if (kind === "lanza" && !p.gear.sh) l = mixArm(armT(0.7, 0.7, 0.1, 1.0), armT(1.35, 0.5, 0.1, 0.25), f * (1 - back));
    }
    crouch += 0.06 * hit;
  } else if (p.act === "stagger") {
    // Head snaps back, the body rocks back and a foot steps back to catch it.
    const snap = Math.pow(1 - t, 2);
    torsoX += 0.45 * Math.sin(t * Math.PI) * (1.2 - t);
    torsoZ += 0.15 * Math.sin(t * Math.PI * 2) * (1 - t);
    headX += 0.7 * snap;
    headY = 0.25 * Math.sin(t * 9) * snap;
    r = armT(0.4, -0.2, 0.75, 0.6, -0.2);
    l = p.gear.sh ? armT(0.5, -0.1, 0.7, 0.6) : armT(0.4, -0.2, 0.75, 0.6);
    stance1 = -0.45 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5);
    stance0 = 0.1;
    crouch += 0.08 * Math.sin(t * Math.PI);
    armK = 22;
  } else if (p.act === "dodge") {
    // A quick ducking lunge toward where it goes.
    const d = Math.sin(Math.min(1, t * 1.3) * Math.PI);
    const mf = Math.hypot(vf, vs) > 0.5 ? vf / Math.hypot(vf, vs) : -1;
    const ms = Math.hypot(vf, vs) > 0.5 ? vs / Math.hypot(vf, vs) : 0;
    tiltX = -0.45 * mf * d;
    tiltZ = -0.45 * ms * d;
    crouch += 0.3 * d;
    r = mixArm(r, armT(0.6, 0.4, 0.3, 1.7, -0.6), d);
    l = mixArm(l, armT(0.6, 0.4, 0.3, 1.6), d);
    torsoX -= 0.15 * d;
    headX -= 0.2 * d;
    armK = 26;
  }

  // A gesture, only standing still and free (any act cuts it).
  const emT = p.emoteT ?? 99;
  if (p.alive && p.emote && emT < EMOTE_SECONDS && p.act === "idle" && !p.blocking) {
    const e = Math.min(ease(clamp01(emT / 0.25)), ease(clamp01((EMOTE_SECONDS - emT) / 0.35)));
    const id = EMOTES[p.emote - 1]?.id;
    if (id === "saludo") {
      r = mixArm(r, armT(2.55, 0.25, 0.55 + 0.4 * Math.sin(emT * 13), 0.55, -0.4), e);
      headY += 0.15 * e;
      torsoZ += 0.06 * e;
    } else if (id === "festejo") {
      const hop = Math.abs(Math.sin(emT * 8));
      r = mixArm(r, armT(2.95, 0.1, 0.35 + 0.15 * Math.sin(emT * 16), 0.35, -1.2), e);
      l = mixArm(l, armT(2.95, 0.1, 0.35 - 0.15 * Math.sin(emT * 16), 0.35), e);
      rise += 0.09 * hop * e;
      torsoX -= 0.12 * e;
      headX -= 0.2 * e;
    } else if (id === "burla") {
      r = mixArm(r, armT(0.15, -0.7, 0.95, 2.0, 0.4), e);
      l = mixArm(l, armT(0.15, -0.7, 0.95, 2.0), e);
      torsoZ += 0.22 * Math.sin(emT * 7) * e;
      headY += 0.45 * Math.sin(emT * 11) * e;
      hipYaw += 0.2 * Math.sin(emT * 7) * e;
    } else if (id === "reverencia") {
      const bow = ease(clamp01((emT - 0.15) / 0.45)) * e;
      r = mixArm(r, armT(0.95, 0.75, 0.15, 1.6, -0.4), e);
      l = mixArm(l, armT(0.35, -0.3, 0.55, 0.15), e);
      torsoX += 0.8 * bow;
      headX += 0.35 * bow;
      stance0 = lerp(stance0, 0.35, e);
      stance1 = lerp(stance1, -0.2, e);
    }
    armK = 18;
  }

  // Springs: being hit rocks the torso back; landing squashes the legs.
  const sk = Math.min(dt, 0.05);
  k.hitV += (-140 * k.hitX - 11 * k.hitV) * sk;
  k.hitX += k.hitV * sk;
  if (k.wasAir && !air) {
    ev.land = clamp01(-k.squash + 0.6);
    k.squashV += 2.2;
  }
  k.wasAir = air;
  k.squashV += (-160 * k.squash - 14 * k.squashV) * sk;
  k.squash += k.squashV * sk;
  torsoX += k.hitX;
  headX += k.hitX * 0.8;
  crouch += Math.max(0, k.squash) * 0.6;

  // Legs: a crouch bends both knees so the feet stay under the hips.
  crouch = Math.max(0, crouch);
  const bend = Math.acos(Math.max(-1, 1 - crouch / (2 * LEG)));
  let thighX0 = stance0 + bend + amp * s0 * fwdAmt;
  let thighX1 = stance1 + bend + amp * s1 * fwdAmt;
  let knee0 = 2 * bend + 0.12 + lift0 * amp * 1.7 + Math.max(0, stance0) * 0.6;
  let knee1 = 2 * bend + 0.12 + lift1 * amp * 1.7 + Math.max(0, stance1 * -0.4);
  let thighZ0 = -spread + amp * 0.55 * s0 * dirS;
  let thighZ1 = spread + amp * 0.55 * s1 * dirS;
  if (kickAmt > 0) {
    // The right leg: knee chambered up, then the foot straight out.
    thighX1 = lerp(thighX1, 1.1 + 0.4 * kickExt, kickAmt);
    knee1 = lerp(knee1, 1.95 * (1 - kickExt) + 0.1, kickAmt);
    thighZ1 = lerp(thighZ1, 0.04, kickAmt);
  }
  if (air) {
    // Tuck the legs in the air.
    const tuck = clamp01(p.y / 0.3);
    thighX0 = lerp(thighX0, 0.95, tuck);
    knee0 = lerp(knee0, 1.6, tuck);
    thighX1 = lerp(thighX1, 0.45, tuck);
    knee1 = lerp(knee1, 1.3, tuck);
    torsoX -= 0.12 * tuck;
    r = { ...r, z: r.z + 0.25 * tuck };
    l = { ...l, z: l.z + 0.25 * tuck };
  }
  const bob = moving * (running ? 0.055 : 0.035) * Math.cos(2 * k.walk) - moving * 0.02;

  // Falling: knees buckle, then a fall backwards that speeds up and bounces.
  let fallRot = 0;
  let fallY = 0;
  if (!p.alive) {
    if (k.fallen < 0) {
      k.fallen = 0;
      k.fallLanded = false;
      ev.fell = true;
    }
    k.fallen += dt;
    const f = k.fallen;
    const buckle = ease(clamp01(f / 0.25));
    const tip = clamp01((f - 0.15) / 0.5);
    fallRot = tip * tip * 1.52;
    if (tip >= 1) {
      if (!k.fallLanded) {
        k.fallLanded = true;
        ev.thud = true;
      }
      const b = f - 0.65;
      fallRot = 1.52 - 0.14 * Math.exp(-b * 7) * Math.abs(Math.sin(b * 16));
    }
    fallY = lerp(-0.28 * buckle, 0.13, tip);
    const lim = armT(0.4 + 0.9 * tip, -0.2 * tip, 0.25 + 1.0 * tip, 0.5 * (1 - tip) + 0.3);
    r = lim;
    l = lim;
    torsoX = -0.3 * buckle * (1 - tip);
    torsoYaw = 0.15 * tip;
    torsoZ = 0;
    headX = -0.35 * buckle * (1 - tip) + 0.45 * tip;
    headY = 0.4 * tip;
    thighX0 = 0.5 * buckle * (1 - tip) + 0.3 * tip;
    thighX1 = 0.6 * buckle * (1 - tip) + 0.15 * tip;
    knee0 = 1.0 * buckle * (1 - tip) + 0.5 * tip;
    knee1 = 1.1 * buckle * (1 - tip) + 0.2 * tip;
    thighZ0 = -0.12;
    thighZ1 = 0.18;
    crouch = 0;
    bodyZ = 0;
    tiltX = tiltZ = 0;
    armK = 20;
  } else if (k.fallen >= 0) {
    k.fallen = -1;
  }

  // Ease everything toward its target (frame-rate independent).
  const a = k.anim;
  const kArm = 1 - Math.exp(-dt * armK);
  const kBody = 1 - Math.exp(-dt * 14);
  const kLeg = 1 - Math.exp(-dt * 22);
  for (const key of Object.keys(r) as (keyof ArmT)[]) {
    a.r[key] = lerp(a.r[key], r[key], kArm);
    a.l[key] = lerp(a.l[key], l[key], kArm);
  }
  a.thighX0 = lerp(a.thighX0, thighX0, kLeg);
  a.thighX1 = lerp(a.thighX1, thighX1, kLeg);
  a.thighZ0 = lerp(a.thighZ0, thighZ0, kLeg);
  a.thighZ1 = lerp(a.thighZ1, thighZ1, kLeg);
  a.knee0 = lerp(a.knee0, knee0, kLeg);
  a.knee1 = lerp(a.knee1, knee1, kLeg);
  a.crouch = lerp(a.crouch, crouch, kLeg);
  a.bodyZ = lerp(a.bodyZ, bodyZ, kBody);
  a.bodyX = lerp(a.bodyX, 0.025 * shift * idle, kBody);
  a.tiltX = lerp(a.tiltX, tiltX, kArm);
  a.tiltZ = lerp(a.tiltZ, tiltZ, kArm);
  a.hipYaw = lerp(a.hipYaw, hipYaw, kBody);
  a.hipRoll = lerp(a.hipRoll, 0.04 * shift * idle + 0.05 * amp * s0, kBody);
  a.torsoYaw = lerp(a.torsoYaw, torsoYaw, Math.max(kBody, kArm * 0.8));
  a.torsoX = lerp(a.torsoX, torsoX, kBody);
  a.torsoZ = lerp(a.torsoZ, torsoZ, kBody);
  a.headX = lerp(a.headX, headX, kBody);
  a.headY = lerp(a.headY, headY, kBody);

  // Apply.
  k.body.position.set(a.bodyX, bob - a.crouch + fallY + rise, a.bodyZ);
  k.body.rotation.set(p.alive ? a.tiltX : fallRot, p.alive ? spin : 0, p.alive ? a.tiltZ : 0);
  k.hips.rotation.set(0, a.hipYaw, a.hipRoll);
  k.torso.position.y = HIP_Y;
  k.torso.rotation.set(a.torsoX, a.torsoYaw, a.torsoZ);
  // Breathing lifts the shoulders a little.
  k.head.rotation.set(a.headX, a.headY, 0);
  const lift = 0.006 * breathe * idle;
  for (const [i, arm] of k.arms.entries()) {
    const m = i === 1 ? 1 : -1;
    const v = i === 1 ? a.r : a.l;
    arm.shoulder.rotation.set(v.x, v.y * m, v.z * m);
    arm.shoulder.position.set(m * SHOULDER_X, SHOULDER_Y + lift, v.push);
    arm.elbow.rotation.x = v.elbow;
    arm.grip.rotation.x = v.wrist;
  }
  // Melee weapons are held edge-first in the swing's plane (an axe's edge leads).
  if (k.weapon && kind !== "arco") k.weapon.rotation.z = -Math.PI / 2 + a.r.roll;
  const legsT: [number, number, number][] = [
    [a.thighX0, a.thighZ0, a.knee0],
    [a.thighX1, a.thighZ1, a.knee1],
  ];
  for (const [i, leg] of k.legs.entries()) {
    const [tx, tz, kn] = legsT[i];
    leg.hip.rotation.set(tx, 0, tz);
    leg.knee.rotation.x = -kn;
    // Feet stay flat on the ground (pointing down in the air).
    leg.ankle.rotation.x = air ? -0.3 : kn - tx;
  }
  // The tabard flaps swing with the legs and stream back when running.
  const most = Math.max(a.thighX0, a.thighX1);
  const least = Math.min(a.thighX0, a.thighX1);
  k.flaps[0].rotation.x = Math.max(0, most) * 0.85 + (running ? 0.1 : 0);
  k.flaps[1].rotation.x = Math.min(0, least) * 0.85 - (running ? 0.35 : 0) - (air ? 0.3 : 0);

  // Bow string pulled back with the draw.
  const string = k.weapon?.userData.string as THREE.Line | undefined;
  if (string) {
    const pos = string.geometry.attributes.position as THREE.BufferAttribute;
    pos.setZ(1, 0.1 + (p.act === "draw" ? p.draw * 0.45 : 0));
    pos.needsUpdate = true;
  }
  if (k.model) driveKnightModel(k.model, k, a.crouch, k.cape, [a.thighX0, a.thighX1], faceCue(k, p, time, dirS * moving), dt, time);
  return ev;
}

/**
 * The modeled knight's face for its pose: X eyes when down, a wince when hit,
 * narrowed when attacking or guarding, happy squints for the cheerful gestures,
 * and the head and eyes on the nearest rival (`k.target`, set by the scene),
 * else wandering a little and toward where it sidesteps.
 */
function faceCue(k: Knight, p: KnightPose, time: number, sidestep: number) {
  const emote = p.emote && (p.emoteT ?? 99) < EMOTE_SECONDS ? EMOTES[p.emote - 1]?.id : undefined;
  let open = 1;
  if (k.flashT > 0 || p.act === "stagger") open = 0.35;
  else if (emote === "festejo" || emote === "burla") open = 0.3;
  else if (p.act === "windup" || p.act === "kick" || p.act === "special" || p.act === "draw") open = 0.7;
  else if (p.blocking) open = 0.75;
  let look = Math.sin(time * 0.6 + k.seed) * 0.35 + sidestep * 0.4;
  if (k.target && p.alive) {
    // The rival in the knight's own frame (it faces −z, its right is +x).
    const dx = k.target.x - p.x;
    const dz = k.target.z - p.z;
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    const ang = Math.atan2(c * dx - s * dz, -(s * dx + c * dz));
    if (Math.abs(ang) < 1.7) look = ang;
  }
  // Mid-swing the head stays with the body; the eyes still follow.
  const busy = p.act !== "idle" || p.blocking;
  const turn = Math.max(-0.5, Math.min(0.5, look)) * (busy ? 0.35 : 1);
  return { ko: !p.alive, open, lookX: Math.max(-1, Math.min(1, (look - turn) / 0.5)), lookY: p.pitch * 0.8, turn };
}

/** Whether the knight's weapon is in the fast part of a swing (for the trail). */
export function swinging(p: KnightPose): number {
  if (WEAPONS[p.gear.w].ranged || !p.alive || p.actLen <= 0) return 0;
  if (p.act === "special") {
    // The special's blow (the slam's from late in its wind-up).
    const kind = specialOf(p.gear.w);
    const sp = SPECIALS[kind];
    const from = kind === "terremoto" ? sp.windup - 0.12 : sp.windup;
    const a = (p.actT - from) / (sp.active + (kind === "terremoto" ? 0.2 : 0.1));
    return a >= 0 && a < 1 ? 1 - a * a * 0.6 : 0;
  }
  if (p.act !== "recover") return 0;
  const t = p.actT / p.actLen;
  return t < 0.45 ? 1 - Math.pow(t / 0.45, 2) : 0;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpF = new THREE.Vector3();
const AXIS = new THREE.Vector3(0, 0, -1);

/**
 * A flail's chain: it hangs toward the ground, lagging behind the handle, and
 * flies straight out while the weapon swings (`swing` 0–1). Needs the
 * weapon's world matrix up to date. Cheap: one direction eased per frame.
 */
export function swingFlail(weapon: THREE.Group, swing: number, dt: number) {
  const chain = weapon.userData.flail as THREE.Group | undefined;
  if (!chain) return;
  weapon.getWorldQuaternion(tmpQ);
  tmpF.copy(AXIS).applyQuaternion(tmpQ);
  const want = tmpV.copy(tmpF).lerp(DOWN, swing > 0 ? 0.05 : 0.8).normalize();
  let dir = weapon.userData.flailDir as THREE.Vector3 | undefined;
  if (!dir) {
    dir = want.clone();
    weapon.userData.flailDir = dir;
  }
  dir.lerp(want, 1 - Math.exp(-dt * (swing > 0 ? 30 : 9))).normalize();
  // Into the weapon's own frame.
  const local = tmpV.copy(dir).applyQuaternion(tmpQ.invert());
  chain.quaternion.setFromUnitVectors(AXIS, local);
}

export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      const map = (mat as THREE.MeshBasicMaterial).map;
      if (map && map.name !== "glow" && map.name !== SHARED) map.dispose();
      mat.dispose();
    }
  });
}
