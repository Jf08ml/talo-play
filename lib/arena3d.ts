import * as THREE from "three";
import { mulberry32 } from "./random";
import { Bloom, aimShadow, glowColor, type Quality } from "./postfx";
import type { TeamId } from "./teams";
import {
  EYE_HEIGHT,
  KICK_HIT,
  KICK_SECONDS,
  SPECIALS,
  WEAPONS,
  specialOf,
  type ArenaItem,
  type ItemKind,
  type SpecialKind,
} from "./arenaSim";
import {
  DARK_STEEL,
  GOLD,
  LEATHER,
  TEAM_COLORS,
  animateKnight,
  arrowMesh,
  clamp01,
  disposeKnightGeos,
  disposeTree,
  ease,
  easeOutBack,
  equipKnight,
  itemMesh,
  knightGeos,
  knightMesh,
  lambert,
  lerp,
  phong,
  shieldMesh,
  swingFlail,
  swinging,
  weaponMesh,
  PLAIN_LOOK,
  type Knight,
  type KnightLook,
  type KnightPose,
} from "./arena3dKnight";
import { EMOTES, EMOTE_SECONDS } from "./arenaLooks";
import { Impacts, Particles, Shockwaves, SwingTrail } from "./arena3dFx";
import { knightModelReady, loadKnightModel } from "./arena3dModel";
import { GroundFx, buildMap, buildTrapsFor, canvasTexture, sandTexture, stoneTexture, type WorldFx } from "./arena3dMaps";
import { getMap, supportAt, topAt, type ArenaMap, type ArenaMapId } from "./arenaMaps";

export type { KnightPose } from "./arena3dKnight";
export type { WorldFx } from "./arena3dMaps";

/**
 * Something a knight did that the page may want to hear, seen from the
 * poses (so it's the same for your own knight, bots and rivals): a kick or a
 * special starting, and their blows landing.
 */
export interface ArenaFx {
  id: string;
  kind: "kick" | "kickHit" | "special" | "specialHit";
  special?: SpecialKind;
  x: number;
  z: number;
}

/**
 * Arena medieval in 3D (three.js), browser only: a sand arena inside a
 * stone wall, stands full of people, pillars, torches and the team gates.
 * Knights (lib/arena3dKnight.ts) are rounded armored figures with elbows and
 * knees, animated from their poses alone (walk cycle, wind-up, swing with
 * follow-through, blocking, drawing the bow, staggering, falling), so rivals
 * and bots look the same as your own knight in third person. In first
 * person your knight is hidden and your hands (weapon, shield, bow) are
 * drawn on top, in their own pass. `renderOverview` draws the whole fight
 * from above for a big screen.
 *
 * World axes: the arena's x/z plane is the ground, y is up; a knight with
 * yaw 0 faces -z.
 */

export type ArenaCamera = "primera" | "tercera";

/**
 * Which way the overview camera faces (in fighters' yaw terms: 0 faces -z).
 * It never turns, so "up" on a phone's joystick is always away from it.
 */
export const OVERVIEW_YAW = 0.3;
/** How far the overview camera looks down (radians, ~60°). */
const OVERVIEW_PITCH = 1.05;

const TEAM_LIGHT: Record<TeamId, string> = { red: "#fb3a5d", blue: "#22d3ee" };
const DUST = new THREE.Color(0xe2c391);
const DUST_LIGHT = new THREE.Color(0xf0dcb4);
const HIT_SPARKS = [new THREE.Color(0xfff1c7), new THREE.Color(0xffb26b), new THREE.Color(0xff8a8a)];
const BLOCK_SPARKS = [new THREE.Color(0xfde047), new THREE.Color(0xfffbeb), new THREE.Color(0xfb923c), new THREE.Color(0xffd27a)];
const FLASH_HIT = new THREE.Color(0xffd0a8);
const FLASH_BLOCK = new THREE.Color(0xfff1b0);
const FLASH_HIT_GLOW = glowColor(0xffc49a, 1.35);
const FLASH_BLOCK_GLOW = glowColor(0xfff0a8, 1.6);
// A perfect parry: whiter and brighter than a block.
const PARRY_SPARKS = [new THREE.Color(0xffffff), new THREE.Color(0xfff6c4), new THREE.Color(0xfde047), new THREE.Color(0xbae6fd)];
const FLASH_PARRY = new THREE.Color(0xfffbe8);
const FLASH_PARRY_GLOW = glowColor(0xfff6d8, 2.2);
const PARRY_RING = new THREE.Color(0xfff3b0);
// Specials: the charge's aura, the slam's ring, the whirlwind's.
const AURA = new THREE.Color(0xffc94a);
const AURA_GLOW = glowColor(0xffd36b, 1.6);
const SLAM_RING = new THREE.Color(0xf6d7a0);
const SPIN_RING = new THREE.Color(0xfff2d6);

// ---- Textures ----------------------------------------------------------------

function glowTexture(): THREE.CanvasTexture {
  const t = canvasTexture(
    64,
    64,
    (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, "rgba(255,255,255,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    },
    false
  );
  t.name = "glow";
  return t;
}

/** Name over a knight's head (with its level, «Nv 7», when it has one), with a health bar. */
function tagTexture(name: string, color: string, hp: number, lv = 0): THREE.CanvasTexture {
  return canvasTexture(
    256,
    80,
    (ctx) => {
      ctx.font = "bold 30px system-ui, sans-serif";
      const nameW = ctx.measureText(name).width;
      ctx.font = "bold 20px system-ui, sans-serif";
      const lvText = lv > 0 ? `Nv ${lv}` : "";
      const lvW = lvText ? ctx.measureText(lvText).width + 10 : 0;
      const w = Math.min(248, nameW + lvW + 24);
      ctx.fillStyle = "rgba(2,6,23,0.7)";
      ctx.beginPath();
      ctx.roundRect(128 - w / 2, 4, w, 44, 12);
      ctx.fill();
      ctx.textBaseline = "middle";
      const left = 128 - w / 2 + 12;
      if (lvText) {
        ctx.fillStyle = "#fde047";
        ctx.textAlign = "left";
        ctx.fillText(lvText, left, 28);
      }
      ctx.font = "bold 30px system-ui, sans-serif";
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.fillText(name, lvText ? left + lvW + Math.min(nameW, w - lvW - 24) / 2 : 128, 27, Math.max(40, w - lvW - 24));
      ctx.fillStyle = "rgba(2,6,23,0.75)";
      ctx.fillRect(48, 56, 160, 16);
      ctx.fillStyle = hp > 50 ? "#4ade80" : hp > 25 ? "#facc15" : "#f87171";
      ctx.fillRect(50, 58, (156 * Math.max(0, hp)) / 100, 12);
    },
    false
  );
}

/** How high an item floats over the sand. */
const itemHeight = (kind: ItemKind) => (kind === "escudo" || kind === "arco" ? 0.75 : kind === "pocion" ? 0.45 : 0.35);

/** What the scene needs to know about a fighter. */
export interface FighterInfo {
  team: TeamId;
  label: string;
  color?: string;
  /** How it's dressed and its level (0/absent: no level on its tag). */
  look?: KnightLook;
  lv?: number;
}

/** A knight in the scene: its level, the look it was built with, and its gesture bubble. */
type SceneKnight = Knight & { lv: number; lookKey: string; bubble: THREE.Sprite; bubbleOf: number };

const lookKey = (l: KnightLook | undefined) => (l ? `${l.plume}|${l.emblem}|${l.helm}|${l.armor}|${l.cape}|${l.trail}` : "");

const bubbleTextures = new Map<number, THREE.CanvasTexture>();
/** A gesture's bubble: its emoji on a white round bubble with a tail (made once per gesture). */
function bubbleTexture(emote: number): THREE.CanvasTexture {
  const known = bubbleTextures.get(emote);
  if (known) return known;
  const t = canvasTexture(
    128,
    128,
    (ctx) => {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(64, 56, 46, 0, Math.PI * 2);
      ctx.moveTo(52, 98);
      ctx.lineTo(64, 122);
      ctx.lineTo(76, 98);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(50, 92, 28, 10);
      ctx.font = "56px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(EMOTES[emote - 1]?.emoji ?? "", 64, 60);
    },
    false
  );
  t.name = "shared";
  bubbleTextures.set(emote, t);
  return t;
}

// ---- First-person hands ---------------------------------------------------------

/** Where the held weapon sits in front of the camera, and how it's turned. */
interface HandPose {
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
}

const HAND_IDLE: HandPose = { px: 0.3, py: -0.32, pz: -0.5, rx: 0.25, ry: 0.15, rz: -0.25 };

function handPose(p: KnightPose, bob: number): { right: HandPose; left: HandPose } {
  const w = WEAPONS[p.gear.w];
  const t = p.actLen > 0 ? clamp01(p.actT / p.actLen) : 0;
  let right: HandPose = { ...HAND_IDLE, py: HAND_IDLE.py + bob };
  let left: HandPose = { px: -0.36, py: -0.42 + bob, pz: -0.48, rx: 0, ry: 0.35, rz: 0 };
  if (w.ranged) {
    // The triple arrow draws all the way in its wind-up.
    const tw = SPECIALS.triple.windup;
    const draw = p.act === "draw" ? p.draw : p.act === "special" && p.actT < tw ? ease(p.actT / tw) : 0;
    left = { px: -0.06, py: -0.18, pz: -0.55, rx: 0, ry: 0, rz: 0.12 };
    right = { px: 0.04, py: -0.2, pz: -0.45 + draw * 0.22, rx: 0, ry: 0, rz: 0 };
    if (p.act === "kick") left = { ...left, py: left.py + 0.05, px: left.px - 0.1 };
    return { right, left };
  }
  const spear = p.gear.w === "lanza";
  // Odd swings of a combo come back from the left: the same arc, mirrored.
  const side = p.combo % 2 ? -1 : 1;
  const mirror = (h: HandPose): HandPose => (side > 0 ? h : { ...h, px: -h.px * 0.8, ry: -h.ry, rz: -h.rz - 0.4 });
  const wound: HandPose = spear
    ? { px: 0.25, py: -0.28, pz: -0.25, rx: 0, ry: 0.05, rz: -0.1 }
    : mirror({ px: 0.6, py: -0.1, pz: -0.38, rx: 0.45, ry: -0.95, rz: -1.15 });
  const swung: HandPose = spear
    ? { px: 0.12, py: -0.25, pz: -1.05, rx: 0, ry: 0, rz: -0.1 }
    : mirror({ px: -0.55, py: -0.36, pz: -0.55, rx: 0.1, ry: 0.95, rz: -1.3 });
  const mix = (a: HandPose, b: HandPose, k: number): HandPose => ({
    px: lerp(a.px, b.px, k),
    py: lerp(a.py, b.py, k),
    pz: lerp(a.pz, b.pz, k),
    rx: lerp(a.rx, b.rx, k),
    ry: lerp(a.ry, b.ry, k),
    rz: lerp(a.rz, b.rz, k),
  });
  if (p.act === "kick") {
    // Arms a little out for balance (the foot comes up from below, see `updateHands`).
    right = { ...right, py: right.py + 0.06, px: right.px + 0.1, rz: right.rz - 0.3 };
    left = { ...left, px: left.px - 0.08, py: left.py + 0.05 };
    return { right, left };
  }
  if (p.act === "special") {
    const kind = specialOf(p.gear.w);
    const sp = SPECIALS[kind];
    const ww = ease(clamp01(p.actT / sp.windup));
    const a = clamp01((p.actT - sp.windup) / sp.active);
    const back = ease(clamp01((p.actT - sp.windup - sp.active) / sp.recover));
    const started = p.actT >= sp.windup;
    if (kind === "torbellino") {
      // Two sweeps across in front while the body turns.
      const sweep = (1 - Math.cos(a * Math.PI * 4)) / 2;
      right = started ? mix(mix(wound, swung, sweep), right, back) : mix(right, wound, ww);
    } else if (kind === "terremoto") {
      const up: HandPose = { px: 0.12, py: 0.1, pz: -0.3, rx: 2.0, ry: 0.1, rz: -0.1 };
      const down: HandPose = { px: 0.04, py: -0.5, pz: -0.8, rx: -0.6, ry: 0, rz: -0.1 };
      const hit = ease(clamp01(a * 2));
      right = started ? mix(mix(up, down, hit), right, back) : mix(right, up, ww);
      const upL = { ...up, px: -0.1, rx: 0.4 };
      const downL = { ...down, px: -0.14, rx: 0 };
      left = started ? mix(mix(upL, downL, hit), left, back) : mix(left, upL, ww);
    } else if (kind === "estocada") {
      const pulled: HandPose = { px: 0.25, py: -0.28, pz: -0.12, rx: 0, ry: 0.05, rz: -0.1 };
      const out: HandPose = { px: 0.08, py: -0.24, pz: -1.35, rx: 0, ry: 0, rz: -0.1 };
      right = started ? mix(mix(pulled, out, easeOutBack(clamp01(a * 1.6), 1.2)), right, back) : mix(right, pulled, ww);
    }
    return { right, left };
  }
  if (p.blocking) {
    if (p.gear.sh) left = { px: -0.12, py: -0.24, pz: -0.42, rx: 0, ry: 0.1, rz: 0 };
    else right = { px: 0.05, py: -0.16, pz: -0.5, rx: 0.15, ry: 0, rz: Math.PI / 2 - 0.15 };
  } else if (p.act === "windup") {
    right = mix(right, wound, ease(t));
  } else if (p.act === "recover") {
    // A fast swing that carries a little past, then back to the guard.
    const swing = clamp01(t / 0.32);
    const back = clamp01((t - 0.45) / 0.55);
    right = mix(mix(wound, swung, easeOutBack(swing, spear ? 1.1 : 1.5)), right, ease(back));
  } else if (p.act === "stagger") {
    right = { ...right, py: right.py - 0.15, rz: right.rz - 0.4 };
  } else if (p.act === "dodge") {
    right = { ...right, py: right.py - 0.12, px: right.px + 0.08 };
    left = { ...left, py: left.py - 0.12 };
  } else if (p.running) {
    right = { ...right, py: right.py - 0.05 + bob * 3, rx: right.rx - 0.25 };
  }
  return { right, left };
}

// ---- Scene ------------------------------------------------------------------------

export interface ArrowDraw {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/** The arena in 3D on one canvas, seen by one camera. */
export class ArenaScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  /** First-person hands, drawn on top of everything. */
  private handScene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(72, 1, 0.05, 400);
  private glow: THREE.Texture;
  private knights = new Map<string, SceneKnight>();
  private items = new Map<string, { kind: ItemKind; group: THREE.Group; modeled: boolean }>();
  private arrows = new Map<string, THREE.Group>();
  private sparks = new Particles(420, true, 9, 1.2);
  private dust = new Particles(300, false, -0.4, 3);
  private impacts: Impacts;
  private shock = new Shockwaves();
  /** A glow around a knight charging its special (made the first time it does). */
  private auras = new Map<string, THREE.Sprite>();
  /** Per knight: the act last seen and whether its blow was already shown (for `ArenaFx`). */
  private actSeen = new Map<string, { act: string; t: number; hit: boolean }>();
  private fxOut: ArenaFx[] = [];
  /** First person: your foot, coming up for a kick. */
  private handFoot = new THREE.Group();
  private handWeapon: THREE.Group | null = null;
  private geos = knightGeos();
  /** Swing trails behind third-person weapons (id → trail). */
  private trails = new Map<string, SwingTrail>();
  private trailColor: THREE.Color;
  private tagScale = 1;
  /** The big screen's camera: where it looks and how far it stands. */
  private overCam = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  /** Split screen: one over-the-shoulder camera per followed fighter. */
  private splitCams = new Map<string, { cam: THREE.PerspectiveCamera; pos: THREE.Vector3; ready: boolean }>();
  private overAt = new THREE.Vector3();
  private overDist = 0;
  /** Embers rising from the torches. */
  private embers = new Particles(160, true, -1.2);
  private flames: THREE.Sprite[] = [];
  private torchLights: THREE.PointLight[] = [];
  private motes: THREE.Points | null = null;
  private sun: THREE.DirectionalLight | null = null;
  private bloom: Bloom | null = null;
  private shadows = false;
  private crowd: THREE.InstancedMesh | null = null;
  private crowdBase: THREE.Matrix4[] = [];
  private cheerT = 0;
  private hands = new THREE.Group();
  private handRight = new THREE.Group();
  private handLeft = new THREE.Group();
  private handKind = "";
  private handShield: THREE.Group | null = null;
  /** A bright arc in front of you while your swing goes through. */
  private trail: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private handNow: { right: HandPose; left: HandPose } = { right: { ...HAND_IDLE }, left: { ...HAND_IDLE } };
  private bob = 0;
  private shake = 0;
  private shakeT = 0;
  private camPos = new THREE.Vector3();
  private camReady = false;
  private camAim = new THREE.Vector3();
  private aimReady = false;
  private rand = mulberry32(42);
  private time = 0;
  /** The map, and its size from the middle (the coliseum's radius on round maps). */
  private map: ArenaMap;
  private R: number;
  /** Traps moving (the pit), the hill/ring/rain on the ground, and fog: base and «niebla». */
  private traps: ((dt: number, t: number) => void) | null = null;
  private ground: GroundFx;
  private fogBase = new THREE.Color(0xf2c48d);
  private fogThick = new THREE.Color(0xc4c7c9);
  private fogNow = new THREE.Color();

  constructor(
    private canvas: HTMLCanvasElement,
    opts: { maxDpr?: number; quality?: Quality; map?: ArenaMapId } = {}
  ) {
    this.map = getMap(opts.map);
    this.R = this.map.bounds.kind === "circle" ? this.map.bounds.r : this.map.extent;
    // The modeled knight: until it's loaded the knights are drawn from the rig,
    // and `setFighters` swaps each one when it arrives.
    void loadKnightModel();
    const high = (opts.quality ?? "alta") === "alta";
    this.shadows = high;
    this.maxDpr = opts.maxDpr ?? (high ? 1.75 : 1.25);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.autoClear = false;
    if (high) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.renderer.setClearColor(0xf2c48d);
    this.scene.fog = new THREE.Fog(0xf2c48d, 60, 170);
    this.glow = glowTexture();
    this.camera.rotation.order = "YXZ";
    this.build();
    this.ground = new GroundFx(this.scene, this.map, high, topAt(this.map, this.map.hill.x, this.map.hill.z));
    this.impacts = new Impacts(this.glow);
    // Under bloom the swing trails glow a little.
    this.trailColor = high ? glowColor(0xfff2d6, 1.25) : new THREE.Color(0xfff2d6).multiplyScalar(0.85);
    this.scene.add(this.sparks.points, this.dust.points, this.embers.points, this.impacts.group, this.shock.group);
    // Specks of dust hanging in the sunlight.
    {
      const n = high ? 160 : 80;
      const rand = mulberry32(5);
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * this.R;
        pos.set([Math.cos(a) * r, 0.5 + rand() * 5, Math.sin(a) * r], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.motes = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff1d6, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false }));
      this.scene.add(this.motes);
    }
    if (high) this.bloom = new Bloom(this.renderer, this.scene, this.camera, { strength: 0.55, radius: 0.5, threshold: 1.0 });

    // The hands have their own light, so they read well wherever you stand.
    this.handScene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b4a2a, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(0.5, 1, 0.3);
    this.handScene.add(key);
    this.trail = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 1.0, 32, 1, -0.25, Math.PI + 0.5),
      new THREE.MeshBasicMaterial({ color: 0xfff7e0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    this.trail.position.set(0, -0.42, -0.95);
    this.trail.rotation.x = -1.05;
    {
      // A boot and greave pointing ahead, seen from above as it kicks.
      const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.2, 3, 10).rotateX(Math.PI / 2).scale(1.2, 0.9, 1), lambert(LEATHER));
      const greave = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.3, 3, 10), phong(DARK_STEEL, 60));
      greave.position.set(0, 0.22, 0.12);
      greave.rotation.x = 0.5;
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.1, 0.8, 1.3).rotateX(-Math.PI / 2), phong(DARK_STEEL, 60));
      toe.position.z = -0.15;
      this.handFoot.add(boot, greave, toe);
      this.handFoot.visible = false;
    }
    this.hands.add(this.handRight, this.handLeft, this.trail, this.handFoot);
    this.handScene.add(this.hands);
  }

  private maxDpr: number;

  private build() {
    const s = this.scene;
    const map = this.map;
    const forest = map.id === "bosque";
    s.add(new THREE.HemisphereLight(forest ? 0xeaf5d6 : 0xfff1d6, forest ? 0x4a5a2a : 0x8a6a3a, 1.5));
    const sun = new THREE.DirectionalLight(0xffe2b0, 1.6);
    sun.position.set(-40, 60, 25);
    s.add(sun, sun.target);
    this.sun = sun;
    if (this.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0005;
      sun.shadow.normalBias = 0.02;
      aimShadow(sun, 0, 0, 0, map.extent + 4, new THREE.Vector3(-40, 60, 25).normalize());
    }

    // The map's own scene (the bridge, the courtyard, the forest), or the coliseum's below.
    const own = buildMap(s, map, this.shadows, this.glow);
    const skyColors: [number, number] = own ? own.sky : [0x3a6fb5, 0xf2c48d];
    if (own) {
      this.fogBase.setHex(own.fog);
      this.renderer.setClearColor(own.fog);
      (s.fog as THREE.Fog).color.setHex(own.fog);
      if (map.chasm) {
        (s.fog as THREE.Fog).near = 40;
        (s.fog as THREE.Fog).far = 150;
      }
    }

    // Sky.
    const skyGeo = new THREE.SphereGeometry(300, 32, 16);
    const top = new THREE.Color(skyColors[0]);
    const hor = new THREE.Color(skyColors[1]);
    const colors: number[] = [];
    const pos = skyGeo.attributes.position;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      c.copy(hor).lerp(top, Math.pow(Math.max(0, pos.getY(i) / 300), 0.5));
      colors.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1;
    s.add(sky);

    if (own) {
      for (const t of own.torches) this.addTorch(t.x, t.y, t.z, t.light);
      return;
    }
    this.buildColiseum();
    this.traps = buildTrapsFor(s, map, this.shadows, this.glow);
  }

  /** A torch: its flame (an ember now and then) and, on «alta», some of them light around. */
  private addTorch(x: number, y: number, z: number, light: boolean) {
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffa23a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flame.position.set(x, y, z);
    flame.scale.setScalar(0.7);
    if (this.shadows) (flame.material as THREE.SpriteMaterial).color = glowColor(0xffa23a, 2.2);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.6, 6), lambert(LEATHER));
    stick.position.set(x, y - 0.4, z);
    this.scene.add(flame, stick);
    this.flames.push(flame);
    if (this.shadows && light) {
      const l = new THREE.PointLight(0xff9a3a, 4, 9, 2);
      l.position.set(x, y, z);
      this.torchLights.push(l);
      this.scene.add(l);
    }
  }

  /** The coliseum (and the trap pit): sand, the wall, the stands with their crowd, the gates, pillars and torches. */
  private buildColiseum() {
    const s = this.scene;
    const ARENA_RADIUS = this.R;

    // Sand, with a ring in the middle.
    const sand = sandTexture();
    sand.repeat.set(10, 10);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_RADIUS + 0.5, 64), new THREE.MeshLambertMaterial({ map: sand }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = this.shadows;
    s.add(floor);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 2.85, 48),
      new THREE.MeshBasicMaterial({ color: 0x9a6b35, transparent: true, opacity: 0.45, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    s.add(ring);
    const outside = new THREE.Mesh(new THREE.CircleGeometry(200, 32), lambert(0x8f7a55));
    outside.rotation.x = -Math.PI / 2;
    outside.position.y = -0.05;
    s.add(outside);

    // The wall around the sand.
    const wallTex = stoneTexture("#a39782");
    wallTex.repeat.set(14, 1);
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_RADIUS + 0.3, ARENA_RADIUS + 0.3, 3.2, 64, 1, true),
      new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.BackSide })
    );
    wall.position.y = 1.6;
    wall.receiveShadow = this.shadows;
    s.add(wall);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(ARENA_RADIUS + 0.45, 0.25, 6, 64), lambert(0x8d8270));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 3.2;
    s.add(rim);

    this.buildStands();
    this.buildGates();

    // Pillars.
    const stone = stoneTexture("#b5a98f");
    stone.repeat.set(3, 3);
    const pillarMat = new THREE.MeshLambertMaterial({ map: stone });
    const PILLAR_RADIUS = 0.9;
    for (const { x, z } of this.map.circles) {
      const p = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(PILLAR_RADIUS * 0.85, PILLAR_RADIUS * 0.9, 4.4, 16), pillarMat);
      shaft.position.y = 2.4;
      const base = new THREE.Mesh(new THREE.BoxGeometry(PILLAR_RADIUS * 2.2, 0.35, PILLAR_RADIUS * 2.2), pillarMat);
      base.position.y = 0.17;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(PILLAR_RADIUS * 2.3, 0.4, PILLAR_RADIUS * 2.3), pillarMat);
      cap.position.y = 4.75;
      p.add(shaft, base, cap);
      p.position.set(x, 0, z);
      p.traverse((o) => {
        (o as THREE.Mesh).castShadow = this.shadows;
        (o as THREE.Mesh).receiveShadow = this.shadows;
      });
      s.add(p);
    }

    // Torches on the wall.
    const torchMat = lambert(LEATHER);
    for (let i = 0; i < 12; i++) {
      const a = ((i + 0.5) / 12) * Math.PI * 2;
      const r = ARENA_RADIUS + 0.05;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.6, 6), torchMat);
      stick.position.set(x * 0.985, 2.5, z * 0.985);
      stick.rotation.z = Math.cos(a) * 0.4;
      stick.rotation.x = -Math.sin(a) * 0.4;
      s.add(stick);
      const flame = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glow, color: 0xffa23a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
      );
      flame.position.set(x * 0.975, 2.9, z * 0.975);
      flame.scale.setScalar(0.7);
      // Under bloom the flames glow.
      if (this.shadows) (flame.material as THREE.SpriteMaterial).color = glowColor(0xffa23a, 2.2);
      if (this.shadows && i % 3 === 0) {
        const light = new THREE.PointLight(0xff9a3a, 4, 9, 2);
        light.position.set(x * 0.94, 2.9, z * 0.94);
        this.torchLights.push(light);
        s.add(light);
      }
      s.add(flame);
      this.flames.push(flame);
    }
  }

  /** Rising rings of stone seats around the arena, full of people. */
  private buildStands() {
    const s = this.scene;
    const ARENA_RADIUS = this.R;
    const rand = mulberry32(17);
    const tiers = 7;
    const seatTex = stoneTexture("#9c8f78");
    seatTex.repeat.set(30, 1);
    const seatMat = new THREE.MeshLambertMaterial({ map: seatTex, side: THREE.DoubleSide });
    const people: THREE.Vector3[] = [];
    for (let k = 0; k < tiers; k++) {
      const r = ARENA_RADIUS + 0.8 + k * 1.3;
      const y = 3.2 + k * 0.85;
      const riser = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.85, 72, 1, true), seatMat);
      riser.position.y = y + 0.42;
      const step = new THREE.Mesh(new THREE.RingGeometry(r, r + 1.3, 72, 1), seatMat);
      step.rotation.x = -Math.PI / 2;
      step.position.y = y + 0.85;
      s.add(riser, step);
      const around = Math.floor((2 * Math.PI * (r + 0.6)) / 0.62);
      for (let i = 0; i < around; i++) {
        const a = (i / around) * Math.PI * 2 + rand() * 0.02;
        // Leave the gates' sides empty.
        if (Math.abs(Math.sin(a)) < 0.12) continue;
        if (rand() < 0.22) continue;
        people.push(new THREE.Vector3(Math.cos(a) * (r + 0.55), y + 0.85, Math.sin(a) * (r + 0.55)));
      }
    }
    // Outer wall behind the top row.
    const outerR = ARENA_RADIUS + 0.8 + tiers * 1.3;
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(outerR, outerR, 4, 72, 1, true), seatMat);
    outer.position.y = 3.2 + tiers * 0.85 + 1.6;
    s.add(outer);

    const bodyGeo = new THREE.BoxGeometry(0.36, 0.55, 0.3);
    bodyGeo.translate(0, 0.28, 0);
    const headGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    headGeo.translate(0, 0.68, 0);
    const merged = mergeBoxes(bodyGeo, headGeo);
    const crowd = new THREE.InstancedMesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }), people.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const color = new THREE.Color();
    people.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(p.x, p.z) + Math.PI);
      m.compose(p, q, one);
      crowd.setMatrixAt(i, m);
      this.crowdBase.push(m.clone());
      // Half the crowd leans to each team.
      const side = p.x < 0 ? "red" : "blue";
      if (rand() < 0.45) color.set(TEAM_COLORS[side]);
      else color.setHSL(rand(), 0.45, 0.45 + rand() * 0.2);
      crowd.setColorAt(i, color);
    });
    this.crowd = crowd;
    s.add(crowd);
  }

  /** A gate on each team's side, with its banners. */
  private buildGates() {
    const s = this.scene;
    const ARENA_RADIUS = this.R;
    for (const team of ["red", "blue"] as TeamId[]) {
      const side = team === "red" ? -1 : 1;
      const g = new THREE.Group();
      const arch = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.2, 4.4), lambert(0x857a66));
      arch.position.y = 2.1;
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 3.2), lambert(0x4a3018));
      door.position.set(-0.2 * side, 1.5, 0);
      g.add(arch, door);
      for (const z of [-3.2, 3.2]) {
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.6), new THREE.MeshLambertMaterial({ color: TEAM_COLORS[team], side: THREE.DoubleSide }));
        banner.position.set(-0.32 * side, 2.2, z);
        banner.rotation.y = (Math.PI / 2) * side;
        const trim = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.18), new THREE.MeshLambertMaterial({ color: GOLD, side: THREE.DoubleSide }));
        trim.position.set(-0.33 * side, 3.4, z);
        trim.rotation.y = (Math.PI / 2) * side;
        g.add(banner, trim);
      }
      g.position.set(side * (ARENA_RADIUS + 0.35), 0, 0);
      g.traverse((o) => ((o as THREE.Mesh).castShadow = this.shadows));
      s.add(g);
    }
  }

  /** Makes the scene's knights match `info` (id → team, name, and how it's dressed and its level). */
  setFighters(info: Record<string, FighterInfo>) {
    const modeled = knightModelReady();
    for (const [id, k] of this.knights) {
      const want = info[id]?.color ? parseInt(info[id].color!.slice(1), 16) : TEAM_COLORS[info[id]?.team ?? k.team];
      if (!(id in info) || info[id].team !== k.team || want !== k.tint || lookKey(info[id].look) !== k.lookKey || (modeled && !k.model)) {
        this.scene.remove(k.root, k.shadow);
        disposeTree(k.root);
        disposeTree(k.shadow);
        this.knights.delete(id);
        this.auras.delete(id);
        this.actSeen.delete(id);
        const trail = this.trails.get(id);
        if (trail) {
          this.scene.remove(trail.mesh);
          trail.dispose();
          this.trails.delete(id);
        }
      }
    }
    for (const [id, f] of Object.entries(info)) {
      const known = this.knights.get(id);
      if (known) {
        known.label = f.label;
        known.lv = f.lv ?? 0;
        continue;
      }
      const parts = knightMesh(f.team, this.geos, f.color ? parseInt(f.color.slice(1), 16) : TEAM_COLORS[f.team], f.look ?? PLAIN_LOOK);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ depthWrite: false, transparent: true }));
      this.placeTag(tag);
      parts.root.add(tag);
      parts.root.userData.shadows = this.shadows;
      if (this.shadows) {
        parts.root.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).isMesh && o !== tag));
        // Real shadows replace the soft blob under the feet.
        parts.shadow.visible = false;
      } else {
        (parts.shadow.material as THREE.MeshBasicMaterial).map = this.glow;
      }
      this.scene.add(parts.root, parts.shadow);
      const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ depthWrite: false, transparent: true }));
      bubble.visible = false;
      parts.root.add(bubble);
      this.knights.set(id, { ...parts, tag, tagKey: "", label: f.label, pose: null, hp: 100, lv: f.lv ?? 0, lookKey: lookKey(f.look), bubble, bubbleOf: 0 });
      const trail = new SwingTrail(this.trailColor);
      this.trails.set(id, trail);
      this.scene.add(trail.mesh);
    }
  }

  /** Who a knight looks at: the nearest standing knight within 9 m, rivals before teammates. */
  private nearestRival(id: string, k: SceneKnight, p: KnightPose): { x: number; z: number } | null {
    let best: KnightPose | null = null;
    let bestD = 81;
    for (const [other, o] of this.knights) {
      const q = o.pose;
      if (other === id || !q?.alive) continue;
      // Teammates count as twice as far (in «todos contra todos» everyone has their own tint).
      const ally = o.team === k.team && o.tint === k.tint;
      const d = ((q.x - p.x) ** 2 + (q.z - p.z) ** 2) * (ally ? 4 : 1);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    return best ? { x: best.x, z: best.z } : null;
  }

  private placeTag(tag: THREE.Sprite) {
    tag.scale.set(1.3 * this.tagScale, 0.41 * this.tagScale, 1);
    tag.position.y = 2.35 + (this.tagScale - 1) * 0.25;
  }

  /** A gesture's bubble over the head: shown while it plays, popping in. */
  private updateBubble(k: SceneKnight, p: KnightPose) {
    const t = p.emoteT ?? 99;
    const on = !!p.emote && p.alive && t < EMOTE_SECONDS && p.act === "idle" && !p.blocking;
    k.bubble.visible = on;
    if (!on) return;
    if (k.bubbleOf !== p.emote) {
      k.bubbleOf = p.emote!;
      const mat = k.bubble.material as THREE.SpriteMaterial;
      mat.map = bubbleTexture(p.emote!);
      mat.needsUpdate = true;
    }
    const pop = Math.min(easeOutBack(clamp01(t / 0.25)), clamp01((EMOTE_SECONDS - t) / 0.25));
    const s = 0.62 * Math.max(0.01, pop) * Math.max(1, this.tagScale * 0.8);
    k.bubble.scale.set(s, s, 1);
    k.bubble.position.y = 2.35 + (this.tagScale - 1) * 0.25 + 0.55 * Math.max(1, this.tagScale) + 0.05 * Math.sin(t * 6);
  }

  /** Makes the floating name and health tags bigger (a TV far away) or smaller. */
  setTagScale(scale: number) {
    this.tagScale = Math.max(0.2, scale);
    for (const k of this.knights.values()) this.placeTag(k.tag);
  }

  setHealth(id: string, hp: number) {
    const k = this.knights.get(id);
    if (k) k.hp = hp;
  }

  setPose(id: string, pose: KnightPose) {
    const k = this.knights.get(id);
    if (!k) return;
    k.pose = pose;
    // What it holds.
    equipKnight(k, pose.gear);
  }

  /** The weapons on the floor (id → kind and place). */
  setItems(items: Record<string, ArenaItem>) {
    for (const [id, it] of this.items) {
      const now = items[id];
      // Also remade once the models arrive, if it was drawn before them.
      if (!now || now.kind !== it.kind || (!it.modeled && knightModelReady())) {
        this.scene.remove(it.group);
        disposeTree(it.group);
        this.items.delete(id);
      }
    }
    for (const [id, it] of Object.entries(items)) {
      const known = this.items.get(id);
      if (known) {
        known.group.position.set(it.x, known.group.position.y, it.z);
        continue;
      }
      const group = new THREE.Group();
      const mesh = itemMesh(it.kind);
      // Shown upright and turning, so it's easy to spot.
      const upright = it.kind === "arco" || it.kind === "escudo" || it.kind === "pocion";
      mesh.rotation.x = upright ? 0 : -Math.PI / 2;
      if (it.kind === "lanza") mesh.scale.setScalar(0.75);
      const spinner = new THREE.Group();
      spinner.add(mesh);
      spinner.position.y = itemHeight(it.kind);
      const halo = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 1.6),
        new THREE.MeshBasicMaterial({ map: this.glow, color: it.kind === "pocion" ? 0xff6b6b : 0xffd36b, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.03;
      group.add(spinner, halo);
      group.position.set(it.x, 0, it.z);
      this.scene.add(group);
      this.items.set(id, { kind: it.kind, group, modeled: knightModelReady() });
    }
  }

  /** Arrows in flight (id → where it is now and where it's going). */
  setArrows(list: Record<string, ArrowDraw>) {
    for (const [id, g] of this.arrows) {
      if (!(id in list)) {
        this.scene.remove(g);
        disposeTree(g);
        this.arrows.delete(id);
      }
    }
    const look = new THREE.Vector3();
    for (const [id, a] of Object.entries(list)) {
      let g = this.arrows.get(id);
      if (!g) {
        g = arrowMesh();
        this.arrows.set(id, g);
        this.scene.add(g);
      }
      g.position.set(a.x, a.y, a.z);
      look.set(a.x - a.vx, a.y - a.vy, a.z - a.vz);
      g.lookAt(look);
    }
  }

  /**
   * A hit: sparks on metal (`block`), a flash, sparks and a ring on a clean
   * hit, sand on a fall; a perfect parry is a bigger, whiter burst with a
   * ring around; a kick, a puff and a few sparks.
   */
  burst(x: number, y: number, z: number, kind: "hit" | "block" | "dust" | "parry" | "kick", emblem = "ninguno") {
    const high = this.shadows;
    if (kind === "dust") {
      this.dustRing(x, z, 18, 1.6, 0.55, Math.max(0, y - 0.05));
      return;
    }
    if (kind === "parry") {
      const n = high ? 64 : 36;
      for (let i = 0; i < n; i++) {
        const a = this.rand() * Math.PI * 2;
        const fast = this.rand() < 0.45;
        const sp = 4 + this.rand() * (fast ? 9 : 4);
        this.sparks.spawn(x, y, z, Math.cos(a) * sp, 1 + this.rand() * 5, Math.sin(a) * sp, PARRY_SPARKS[i % PARRY_SPARKS.length], fast ? 0.06 : 0.1 + this.rand() * 0.08, 0.3 + this.rand() * 0.5, 1);
      }
      this.impacts.spawn(x, y, z, high ? FLASH_PARRY_GLOW : FLASH_PARRY, 1.5, 1.3, 0.32);
      this.shock.spawn(x, y, z, PARRY_RING, 1.7, 0.32);
      return;
    }
    if (kind === "kick") {
      for (let i = 0; i < (high ? 14 : 8); i++) {
        const a = this.rand() * Math.PI * 2;
        const sp = 2 + this.rand() * 3;
        this.sparks.spawn(x, y, z, Math.cos(a) * sp, 0.5 + this.rand() * 2, Math.sin(a) * sp, HIT_SPARKS[i % HIT_SPARKS.length], 0.07, 0.25, 1);
      }
      this.impacts.spawn(x, y, z, high ? FLASH_HIT_GLOW : FLASH_HIT, 0.55, 0.6, 0.18);
      for (let i = 0; i < 8; i++) {
        const a = this.rand() * Math.PI * 2;
        this.dust.spawn(x, y, z, Math.cos(a) * 1.4, 0.3 + this.rand(), Math.sin(a) * 1.4, DUST_LIGHT, 0.3, 0.5, 0.4, 0.9);
      }
      return;
    }
    const block = kind === "block";
    const n = block ? (high ? 40 : 26) : high ? 30 : 20;
    const emblemHex: Record<string, number> = { cruz: 0xf5f0dc, estrella: 0xffd34f, rayo: 0x8cecff, luna: 0xc4a7ff, corona: 0xffcc55, dragon: 0xff694f, calavera: 0xf4f4f5 };
    const customColor = block && emblemHex[emblem] ? new THREE.Color(emblemHex[emblem]) : undefined;
    const colors: THREE.Color[] = block && customColor ? [customColor, new THREE.Color(0xffffff)] : block ? BLOCK_SPARKS : HIT_SPARKS;
    for (let i = 0; i < n; i++) {
      // Mostly outward and up, a few fast streaks.
      const a = this.rand() * Math.PI * 2;
      const fast = this.rand() < 0.3;
      const sp = (block ? 3 : 2.2) + this.rand() * (fast ? 7 : 3.5);
      const c = colors[i % colors.length];
      const size = fast ? 0.05 + this.rand() * 0.03 : 0.08 + this.rand() * 0.08;
      this.sparks.spawn(x, y, z, Math.cos(a) * sp, 0.8 + this.rand() * (block ? 4.5 : 3), Math.sin(a) * sp, c, size, 0.22 + this.rand() * (block ? 0.45 : 0.3), 1);
    }
    // A flash and an impact ring; under bloom the flash glows.
    const flash = block && customColor ? customColor : block ? (high ? FLASH_BLOCK_GLOW : FLASH_BLOCK) : high ? FLASH_HIT_GLOW : FLASH_HIT;
    this.impacts.spawn(x, y, z, flash, block ? 0.75 : 0.6, block ? 0.6 : 0.75, block ? 0.16 : 0.22);
    if (block && customColor) this.shock.spawn(x, y, z, customColor, 0.78, 0.19);
    if (!block) {
      // A little cloud of grit off the armor.
      for (let i = 0; i < 6; i++) {
        const a = this.rand() * Math.PI * 2;
        this.dust.spawn(x, y, z, Math.cos(a) * 1.2, 0.4 + this.rand(), Math.sin(a) * 1.2, DUST_LIGHT, 0.25, 0.5, 0.35, 0.8);
      }
    }
  }

  /** A ring of sand thrown out along the ground. */
  private dustRing(x: number, z: number, n: number, speed: number, alpha: number, y = 0) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rand() * 0.3;
      const sp = speed * (0.6 + this.rand() * 0.6);
      this.dust.spawn(x + Math.cos(a) * 0.2, y + 0.08, z + Math.sin(a) * 0.2, Math.cos(a) * sp, 0.2 + this.rand() * 0.5, Math.sin(a) * sp, i % 3 ? DUST : DUST_LIGHT, 0.35 + this.rand() * 0.2, 0.7 + this.rand() * 0.5, alpha, 0.9);
    }
  }

  /** A knight that just took a clean hit flashes white and rocks back. */
  hitFlash(id: string) {
    const k = this.knights.get(id);
    if (!k) return;
    k.flashT = 0.15;
    k.hitV += 5.5;
  }

  /** Shakes the camera (you got hit, or landed a heavy blow). */
  jolt(amount: number) {
    this.shake = Math.min(1.6, Math.max(this.shake, amount) + amount * 0.25);
  }

  /** The crowd jumps for a moment. */
  cheer() {
    this.cheerT = 2.2;
  }

  /** What the knights did since the last call (kicks and specials starting and landing). */
  takeFx(): ArenaFx[] {
    const out = this.fxOut;
    this.fxOut = [];
    return out;
  }

  /** Notices kicks and specials from the pose (new act, the blow's moment), shows their effects and the charge's glow. */
  private actFx(id: string, k: Knight, p: KnightPose, dt: number) {
    let seen = this.actSeen.get(id);
    if (!seen) {
      seen = { act: "", t: 0, hit: false };
      this.actSeen.set(id, seen);
    }
    const fresh = p.act !== seen.act || p.actT < seen.t - 0.05;
    seen.act = p.act;
    seen.t = p.actT;
    if (fresh) seen.hit = false;
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    let charging = false;
    let charge = 0;
    if (p.alive && p.act === "kick") {
      if (fresh) this.fxOut.push({ id, kind: "kick", x: p.x, z: p.z });
      if (!seen.hit && p.actT >= KICK_HIT) {
        seen.hit = true;
        this.fxOut.push({ id, kind: "kickHit", x: p.x, z: p.z });
        // Sand off the planted foot.
        for (let i = 0; i < 5; i++) {
          const a = this.rand() * Math.PI * 2;
          this.dust.spawn(p.x + Math.cos(a) * 0.15, p.y + 0.06, p.z + Math.sin(a) * 0.15, Math.cos(a) * 0.6, 0.3, Math.sin(a) * 0.6, DUST, 0.3, 0.5, 0.35, 0.7);
        }
      }
    } else if (p.alive && p.act === "special") {
      const kind = specialOf(p.gear.w);
      const sp = SPECIALS[kind];
      if (fresh) this.fxOut.push({ id, kind: "special", special: kind, x: p.x, z: p.z });
      charging = p.actT < sp.windup + sp.hit;
      charge = clamp01(p.actT / sp.windup);
      if (!seen.hit && p.actT >= sp.windup + sp.hit) {
        seen.hit = true;
        this.fxOut.push({ id, kind: "specialHit", special: kind, x: p.x, z: p.z });
        this.specialFx(kind, p, fx, fz);
      }
      // The lunge raises sand all along the dash.
      if (kind === "estocada" && p.actT >= sp.windup && p.actT < sp.windup + sp.active) {
        k.dustAcc += dt * 50;
        while (k.dustAcc > 1) {
          k.dustAcc -= 1;
          const a = this.rand() * Math.PI * 2;
          this.dust.spawn(p.x + Math.cos(a) * 0.2, p.y + 0.06, p.z + Math.sin(a) * 0.2, -fx * 1.2 + Math.cos(a) * 0.4, 0.4, -fz * 1.2 + Math.sin(a) * 0.4, DUST, 0.35, 0.6, 0.4, 0.8);
        }
      }
    }
    // The charge's glow: grows through the wind-up, flickering.
    let aura = this.auras.get(id);
    if (charging && !aura) {
      aura = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glow, color: this.shadows ? AURA_GLOW : AURA, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })
      );
      aura.position.y = 1.0;
      k.root.add(aura);
      this.auras.set(id, aura);
    }
    if (aura) {
      aura.visible = charging;
      if (charging) {
        aura.scale.setScalar(1.5 + charge * 1.3 + Math.sin(this.time * 32) * 0.12);
        (aura.material as THREE.SpriteMaterial).opacity = 0.3 + 0.5 * charge;
      }
    }
  }

  /** The moment a special's blow lands, on every screen. */
  private specialFx(kind: SpecialKind, p: KnightPose, fx: number, fz: number) {
    const high = this.shadows;
    const sp = SPECIALS[kind];
    if (kind === "terremoto") {
      const x = p.x + fx * 0.9;
      const z = p.z + fz * 0.9;
      this.shock.spawn(x, p.y + 0.06, z, SLAM_RING, sp.reach + 0.6, 0.6);
      this.shock.spawn(x, p.y + 0.08, z, SLAM_RING, sp.reach * 0.55, 0.35);
      this.dustRing(x, z, high ? 34 : 22, 4.5, 0.7, p.y);
      // Clods thrown up.
      for (let i = 0; i < (high ? 16 : 9); i++) {
        const a = this.rand() * Math.PI * 2;
        const s = 1 + this.rand() * 2.5;
        this.dust.spawn(x, 0.1, z, Math.cos(a) * s, 3 + this.rand() * 3, Math.sin(a) * s, DUST, 0.22, 0.8, 0.8, 0.3);
      }
      this.impacts.spawn(x, 0.3, z, high ? FLASH_BLOCK_GLOW : FLASH_BLOCK, 1.3, 0, 0.25);
    } else if (kind === "torbellino") {
      this.shock.spawn(p.x, p.y + 1.05, p.z, SPIN_RING, sp.reach + 0.3, 0.5);
      this.dustRing(p.x, p.z, high ? 22 : 14, 2.6, 0.5, p.y);
    } else if (kind === "estocada") {
      const x = p.x + fx * 2.0;
      const z = p.z + fz * 2.0;
      this.impacts.spawn(x, p.y + 1.3, z, high ? FLASH_HIT_GLOW : FLASH_HIT, 0.9, 0.9, 0.22);
    } else {
      this.impacts.spawn(p.x + fx * 0.7, p.y + 1.5, p.z + fz * 0.7, high ? FLASH_BLOCK_GLOW : FLASH_BLOCK, 0.8, 0.6, 0.2);
    }
  }

  private tip = new THREE.Vector3();
  private base = new THREE.Vector3();

  /** What the round puts on the map now: the traps' clock, the hill, the ring, the rain, the fog. */
  setWorld(w: WorldFx) {
    this.world = w;
  }
  private world: WorldFx = { t: -1, ring: null, fog: 0, rain: [] };

  private update(dt: number) {
    this.time += dt;
    const w = this.world;
    this.traps?.(dt, w.t);
    this.ground.update(w, dt);
    // «Niebla»: the fog closes in and greys the sky.
    const fog = this.scene.fog as THREE.Fog;
    const far = this.map.chasm ? 150 : 170;
    const near = this.map.chasm ? 40 : 60;
    fog.near = near + (2 - near) * w.fog;
    fog.far = far + (17 - far) * w.fog;
    this.fogNow.copy(this.fogBase).lerp(this.fogThick, w.fog);
    fog.color.copy(this.fogNow);
    this.renderer.setClearColor(this.fogNow);
    for (const [id, k] of this.knights) {
      const p = k.pose;
      k.root.visible = !!p;
      k.shadow.visible = !!p && !this.shadows;
      const trail = this.trails.get(id);
      if (!p) {
        trail?.clear();
        continue;
      }
      // Hit flash fading out.
      if (k.flashT > 0) {
        k.flashT = Math.max(0, k.flashT - dt);
        for (const m of k.flashMats) m.emissive.setScalar(k.flashT * 4);
      }
      k.root.position.set(p.x, p.y, p.z);
      k.root.rotation.y = p.yaw;
      // The ground under it (a walkway, a slope; none over the void).
      const gy = supportAt(this.map, p.x, p.z, p.y);
      const lift = Number.isFinite(gy) ? p.y - gy : 99;
      k.shadow.position.set(p.x, (Number.isFinite(gy) ? gy : 0) + 0.02, p.z);
      if (lift > 3) k.shadow.visible = false;
      // The blob shadow shrinks while in the air.
      k.shadow.scale.setScalar(1 - Math.min(0.5, lift * 0.6));
      // Deep in the abyss: gone.
      if (p.y < -25) k.root.visible = false;
      if (k.model) k.target = this.nearestRival(id, k, p);
      const ev = animateKnight(k, p, dt, this.time);
      this.actFx(id, k, p, dt);
      // A flail's chain hangs and swings.
      if (k.weapon?.userData.flail) {
        k.root.updateMatrixWorld(true);
        swingFlail(k.weapon, swinging(p), dt);
      }
      // Sand kicked up: footsteps when running, a puff on dodges and landings.
      if (p.alive && lift < 0.05) {
        if (k.trailColor !== null && p.speed > 3) {
          k.trailAcc += dt * (p.running ? 14 : 8);
          while (k.trailAcc >= 1) {
            k.trailAcc -= 1;
            const backX = Math.sin(p.yaw) * 0.42;
            const backZ = Math.cos(p.yaw) * 0.42;
            this.sparks.spawn(p.x + backX, gy + 0.38 + this.rand() * 0.28, p.z + backZ, (this.rand() - 0.5) * 0.7, 0.45 + this.rand() * 0.6, (this.rand() - 0.5) * 0.7, k.trailColor, 0.06 + this.rand() * 0.035, 0.22 + this.rand() * 0.14, 0.8);
          }
        }
        if (p.act === "dodge" && k.lastAct !== "dodge") this.dustRing(p.x, p.z, 14, 1.8, 0.5, gy);
        if (ev.land > 0) this.dustRing(p.x, p.z, 16, 1.4 + ev.land, 0.45, gy);
        if (ev.steps && p.speed > 3) {
          const run = p.running ? 1 : 0.5;
          const rx = Math.cos(p.yaw);
          const rz = -Math.sin(p.yaw);
          const side = ev.steps & 1 ? -1 : 1;
          const fx = p.x + rx * side * 0.13;
          const fz = p.z + rz * side * 0.13;
          for (let i = 0; i < (p.running ? 5 : 2); i++) {
            const a = this.rand() * Math.PI * 2;
            this.dust.spawn(fx, gy + 0.06, fz, Math.cos(a) * 0.5 + Math.sin(p.yaw) * 0.6, 0.25 + this.rand() * 0.3, Math.sin(a) * 0.5 + Math.cos(p.yaw) * 0.6, DUST, 0.28, 0.55, 0.35 * run, 0.6);
          }
        }
        if (p.act === "dodge") {
          k.dustAcc += dt * 40;
          while (k.dustAcc > 1) {
            k.dustAcc -= 1;
            const a = this.rand() * Math.PI * 2;
            this.dust.spawn(p.x + Math.cos(a) * 0.2, gy + 0.06, p.z + Math.sin(a) * 0.2, Math.cos(a) * 0.4, 0.3, Math.sin(a) * 0.4, DUST, 0.3, 0.5, 0.35, 0.6);
          }
        }
      }
      if (ev.fell && lift < 1) this.dustRing(p.x, p.z, 10, 1, 0.35, gy);
      if (ev.thud && lift < 1) {
        // Lying on its back: the dust comes up along the body.
        for (const d of [0.4, 0.9, 1.4]) this.dustRing(p.x + Math.sin(p.yaw) * d, p.z + Math.cos(p.yaw) * d, 8, 1.4, 0.5, gy);
      }
      k.lastAct = p.act;
      // The weapon's swing trail.
      if (trail) {
        const sw = swinging(p);
        if (sw > 0 && k.weapon?.userData.tip) {
          k.root.updateMatrixWorld(true);
          this.tip.copy(k.weapon.userData.tip as THREE.Vector3);
          this.base.copy(k.weapon.userData.base as THREE.Vector3);
          const ball = k.weapon.userData.tipObj as THREE.Object3D | undefined;
          if (ball) ball.getWorldPosition(this.tip);
          else k.weapon.localToWorld(this.tip);
          k.weapon.localToWorld(this.base);
          trail.push(this.base, this.tip, this.time, sw);
        }
        trail.update(this.time);
      }
      const key = `${k.label}:${Math.round(k.hp)}:${p.alive}:${k.lv}`;
      if (key !== k.tagKey) {
        k.tagKey = key;
        const mat = k.tag.material as THREE.SpriteMaterial;
        mat.map?.dispose();
        mat.map = tagTexture(k.label, k.tint === TEAM_COLORS[k.team] ? TEAM_LIGHT[k.team] : `#${k.tint.toString(16).padStart(6, "0")}`, k.hp, k.lv);
        mat.needsUpdate = true;
      }
      k.tag.visible = p.alive;
      this.updateBubble(k, p);
    }
    for (const [, it] of this.items) {
      const spin = it.group.children[0];
      spin.rotation.y += dt * 1.4;
      spin.position.y = itemHeight(it.kind) + Math.sin(this.time * 2.5) * 0.06;
    }
    for (const f of this.flames) {
      f.scale.setScalar(0.6 + Math.sin(this.time * 13 + f.position.x) * 0.06 + this.rand() * 0.08);
      // Now and then an ember floats up from a torch.
      if (this.rand() < dt * 2.5) {
        this.embers.spawn(f.position.x, f.position.y + 0.1, f.position.z, (this.rand() - 0.5) * 0.3, 0.6 + this.rand() * 0.6, (this.rand() - 0.5) * 0.3, new THREE.Color(0xffb347), 0.05, 1.5 + this.rand(), 1);
      }
    }
    for (const [i, l] of this.torchLights.entries()) l.intensity = 3.5 + Math.sin(this.time * 11 + i * 2) * 0.6 + this.rand() * 0.8;
    if (this.motes) {
      const pos = this.motes.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i) + Math.sin(this.time * 0.4 + i) * 0.12 * dt + 0.08 * dt;
        let y = pos.getY(i) + Math.cos(this.time * 0.3 + i * 1.7) * 0.05 * dt;
        const z = pos.getZ(i) + Math.cos(this.time * 0.5 + i * 0.6) * 0.12 * dt;
        if (Math.hypot(x, z) > this.R) x = -x * 0.95;
        if (y > 6) y = 0.5;
        if (y < 0.3) y = 5.5;
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    }
    if (this.crowd && this.cheerT > 0) {
      this.cheerT -= dt;
      const m = new THREE.Matrix4();
      this.crowdBase.forEach((base, i) => {
        const jump = Math.max(0, Math.sin(this.time * 9 + i * 1.7)) * 0.25 * Math.min(1, this.cheerT);
        m.copy(base);
        m.elements[13] += jump;
        this.crowd!.setMatrixAt(i, m);
      });
      this.crowd.instanceMatrix.needsUpdate = true;
    }
    this.sparks.update(dt);
    this.dust.update(dt);
    this.embers.update(dt);
    this.shock.update(dt);
    this.shake = Math.max(0, this.shake - dt * (1.1 + this.shake * 1.6));
    this.shakeT += dt;
  }

  /** First-person hands: the held weapon (and shield or bow), moving with the pose. */
  private updateHands(p: KnightPose, team: TeamId, dt: number, emblem = "ninguno") {
    // Remade once the modeled weapons arrive.
    const kind = `${p.gear.w}:${p.gear.sh}:${emblem}:${knightModelReady()}`;
    if (kind !== this.handKind) {
      this.handKind = kind;
      for (const g of [this.handRight, this.handLeft]) {
        for (const c of [...g.children]) {
          g.remove(c);
          disposeTree(c);
        }
      }
      this.handShield = null;
      this.handWeapon = null;
      const fist = () => new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.05, 3, 10).rotateX(Math.PI / 2), phong(DARK_STEEL));
      if (p.gear.w === "arco") {
        const bow = weaponMesh("arco");
        bow.rotation.set(0, 0, 0.15);
        this.handLeft.add(bow, fist());
        const arrow = arrowMesh();
        arrow.position.set(0, 0, -0.2);
        this.handRight.add(arrow, fist());
      } else {
        const w = weaponMesh(p.gear.w);
        w.rotation.x = 0.5;
        this.handRight.add(w, fist());
        this.handWeapon = w;
        if (p.gear.sh) {
          this.handShield = shieldMesh(team, undefined, emblem);
          this.handShield.scale.setScalar(0.85);
          this.handLeft.add(this.handShield);
        } else {
          this.handLeft.add(fist());
        }
      }
    }
    const moving = Math.min(1, p.speed / 4.6);
    this.bob += dt * (3 + p.speed * 1.8);
    const target = handPose(p, Math.sin(this.bob) * 0.015 * moving);
    const k = 1 - Math.exp(-dt * 22);
    const mixInto = (cur: HandPose, to: HandPose) => {
      for (const key of Object.keys(cur) as (keyof HandPose)[]) cur[key] = lerp(cur[key], to[key], k);
    };
    mixInto(this.handNow.right, target.right);
    mixInto(this.handNow.left, target.left);
    const apply = (g: THREE.Group, h: HandPose) => {
      g.position.set(h.px, h.py, h.pz);
      g.rotation.set(h.rx, h.ry, h.rz);
    };
    apply(this.handRight, this.handNow.right);
    apply(this.handLeft, this.handNow.left);
    // Kicking: the foot comes up from below the view and goes out.
    if (p.act === "kick") {
      const kt = p.actT / KICK_SECONDS;
      const hitT = KICK_HIT / KICK_SECONDS;
      const out = ease(clamp01(kt / hitT)) * (1 - ease(clamp01((kt - 0.5) / 0.4)));
      this.handFoot.visible = out > 0.02;
      this.handFoot.position.set(0.14, lerp(-1.15, -0.55, out), lerp(-0.35, -0.95, out));
      this.handFoot.rotation.set(lerp(0.6, -0.45, out), 0, -0.15 * out);
    } else this.handFoot.visible = false;
    // The swing's trail: bright as it goes through, fading right after (and through a special's blow).
    const melee = !WEAPONS[p.gear.w].ranged && p.gear.w !== "lanza";
    const swingT = p.act === "recover" && p.actLen > 0 ? p.actT / p.actLen : 1;
    const spSwing = p.act === "special" ? swinging(p) : 0;
    this.trail.material.opacity = Math.max(melee && swingT < 0.45 ? (1 - swingT / 0.45) * 0.5 : 0, spSwing * 0.55);
    this.trail.scale.x = p.combo % 2 ? -1 : 1;
    if (this.handWeapon?.userData.flail) swingFlail(this.handWeapon, swingT < 0.45 || spSwing > 0 ? 1 : 0, dt);
    // The bow's string follows the draw.
    const bow = this.handLeft.children.find((c) => c.userData.string) as THREE.Group | undefined;
    const string = bow?.userData.string as THREE.Line | undefined;
    if (string) {
      const pos = string.geometry.attributes.position as THREE.BufferAttribute;
      pos.setZ(1, 0.12 + (p.act === "draw" ? p.draw * 0.3 : 0));
      pos.needsUpdate = true;
    }
  }

  /** Fits the renderer to the canvas; the canvas' size in CSS pixels, or null while it has none. */
  private fit(): { cw: number; ch: number; dpr: number } | null {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (!cw || !ch) return null;
    if (this.renderer.getPixelRatio() !== dpr) this.renderer.setPixelRatio(dpr);
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== cw || size.y !== ch) this.renderer.setSize(cw, ch, false);
    return { cw, ch, dpr };
  }

  /** Keeps a camera inside the walls (round or square) and above the ground. */
  private clampCam(v: THREE.Vector3) {
    const b = this.map.bounds;
    if (b.kind === "circle") {
      const r = Math.hypot(v.x, v.z);
      const lim = b.r - 0.4;
      if (r > lim) {
        v.x *= lim / r;
        v.z *= lim / r;
      }
    } else if (!this.map.chasm) {
      v.x = Math.max(-b.hx + 0.4, Math.min(b.hx - 0.4, v.x));
      v.z = Math.max(-b.hz + 0.4, Math.min(b.hz - 0.4, v.z));
    } else {
      // The bridge: in front of the platforms' back walls (over the void at the sides is fine).
      v.x = Math.max(-b.hx + 1.4, Math.min(b.hx - 1.4, v.x));
    }
    const g = supportAt(this.map, v.x, v.z, v.y);
    if (Number.isFinite(g) && v.y < g + 0.4) v.y = g + 0.4;
  }

  /** A jolt: the camera shakes and rolls, smoothly (not a new random spot every frame). */
  private applyShake(cam: THREE.PerspectiveCamera, amount = 1) {
    if (this.shake <= 0) return;
    const s = Math.min(1, this.shake) * this.shake * amount;
    const t = this.shakeT * 38;
    cam.position.x += (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * s * 0.09;
    cam.position.y += (Math.sin(t * 1.7 + 1) + Math.sin(t * 2.9) * 0.5) * s * 0.09;
    cam.rotateZ(Math.sin(t * 0.9 + 2) * s * 0.035);
    cam.rotateX(Math.sin(t * 1.3) * s * 0.02);
  }

  /** Draws the scene through `cam`. */
  private draw(cam: THREE.PerspectiveCamera, view: { ch: number; cw: number; dpr: number }, dt: number) {
    const scale = (view.ch * view.dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    this.sparks.setScale(scale);
    this.dust.setScale(scale);
    this.embers.setScale(scale);
    this.impacts.update(dt, cam);
    this.renderer.setViewport(0, 0, view.cw, view.ch);
    if (this.bloom) {
      this.bloom.render(cam, dt);
    } else {
      this.renderer.clear();
      this.renderer.render(this.scene, cam);
    }
  }

  /**
   * Draws the arena from `follow`'s eyes (first person, with your hands) or
   * over its shoulder; `look` is where the camera points (your own look, or
   * the followed knight's). Nobody to follow: a slow tour around the arena.
   */
  render(follow: string | null, mode: ArenaCamera, look: { yaw: number; pitch: number; roll?: number; fov?: number; smooth?: boolean }, dt: number) {
    const view = this.fit();
    if (!view) return;
    const { cw, ch } = view;
    const fov = look.fov ?? 72;
    if (this.camera.aspect !== cw / ch || Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.aspect = cw / ch;
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.update(dt);

    const k = follow ? this.knights.get(follow) : undefined;
    const p = k?.pose;
    const cam = this.camera;
    let firstPerson = false;
    if (!k || !p) {
      const a = this.time / 12;
      cam.position.set(Math.cos(a) * 14, 9, Math.sin(a) * 14);
      cam.lookAt(0, 1, 0);
      this.camReady = false;
    } else if (mode === "primera" && p.alive) {
      firstPerson = true;
      cam.position.set(p.x, p.y + EYE_HEIGHT + Math.sin(this.bob * 2) * 0.02 * Math.min(1, p.speed / 4.6), p.z);
      cam.rotation.set(look.pitch, look.yaw, look.roll ?? 0);
      this.camReady = false;
    } else {
      // Over the right shoulder, pulled in if the wall is behind.
      const yaw = look.yaw;
      const pitch = Math.max(-0.6, Math.min(0.8, look.pitch));
      const back = p.alive ? 3.2 : 4.5;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const eye = new THREE.Vector3(p.x, p.y + EYE_HEIGHT + 0.25, p.z);
      const want = new THREE.Vector3(
        eye.x - fx * back * Math.cos(pitch) + rx * 0.7,
        eye.y + 0.35 + Math.sin(pitch) * back,
        eye.z - fz * back * Math.cos(pitch) + rz * 0.7
      );
      this.clampCam(want);
      if (!this.camReady) this.camPos.copy(want);
      // Watching someone (`smooth`): softer, and the point it looks at glides too.
      else this.camPos.lerp(want, 1 - Math.exp(-dt * (look.smooth ? 6 : 14)));
      this.camReady = true;
      cam.position.copy(this.camPos);
      const aim = new THREE.Vector3(eye.x + fx * 6 * Math.cos(pitch), eye.y - Math.sin(pitch) * 6 + 0.2, eye.z + fz * 6 * Math.cos(pitch));
      if (!look.smooth || !this.aimReady) this.camAim.copy(aim);
      else this.camAim.lerp(aim, 1 - Math.exp(-dt * 7));
      this.aimReady = !!look.smooth;
      cam.lookAt(this.camAim);
    }
    this.applyShake(cam);
    // Your own knight (and its swing trail) would be in the way of your eyes.
    if (k) k.root.visible = !firstPerson && !!p && p.y > -25;
    const myTrail = follow ? this.trails.get(follow) : undefined;
    if (myTrail && firstPerson) myTrail.mesh.visible = false;
    // Watching someone from just behind: their own name would cover the view.
    const tagShown = k?.tag.visible ?? false;
    if (k && look.smooth) k.tag.visible = false;

    this.draw(cam, view, dt);
    if (k) k.tag.visible = tagShown;
    if (firstPerson && p && k) {
      this.updateHands(p, k.team, dt, k.emblem);
      cam.updateMatrixWorld();
      this.hands.position.copy(cam.position);
      this.hands.quaternion.copy(cam.quaternion);
      this.renderer.clearDepth();
      this.renderer.render(this.handScene, cam);
    }
  }

  /**
   * The whole fight from above, for a big screen: a camera up on the
   * stands, always facing `OVERVIEW_YAW`, that pans and zooms to keep the
   * fighters in `ids` (standing ones; none = the arena's middle) in frame.
   * Every knight is drawn; no hands. Can be mixed with `render` on the same scene.
   */
  renderOverview(ids: string[], dt: number) {
    const view = this.fit();
    if (!view) return;
    const cam = this.overCam;
    const aspect = view.cw / view.ch;
    if (cam.aspect !== aspect) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
    this.update(dt);

    // What to keep in frame, in the camera's own ground axes (right, ahead).
    const fx = -Math.sin(OVERVIEW_YAW);
    const fz = -Math.cos(OVERVIEW_YAW);
    const rx = -fz;
    const rz = fx;
    let minR = Infinity;
    let maxR = -Infinity;
    let minF = Infinity;
    let maxF = -Infinity;
    for (const id of ids) {
      const p = this.knights.get(id)?.pose;
      if (!p || !p.alive) continue;
      const r = p.x * rx + p.z * rz;
      const f = p.x * fx + p.z * fz;
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
      minF = Math.min(minF, f);
      maxF = Math.max(maxF, f);
    }
    if (minR === Infinity) minR = maxR = minF = maxF = 0;
    const margin = 2.6;
    const cr = (minR + maxR) / 2;
    const cf = (minF + maxF) / 2;
    const center = new THREE.Vector3(cr * rx + cf * fx, 0.9, cr * rz + cf * fz);
    // The distance that fits the spread across the screen (width) and along
    // the view (height, foreshortened by looking down).
    const pitch = OVERVIEW_PITCH;
    const halfV = (cam.fov * Math.PI) / 360;
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const wide = (maxR - minR) / 2 + margin;
    const deep = ((maxF - minF) / 2 + margin * 0.65) * Math.sin(pitch) + 0.8;
    const minDist = 7;
    const maxDist = ((this.map.extent + 2) / Math.tan(Math.min(halfH, halfV * 1.3))) * 0.95;
    const want = Math.max(minDist, Math.min(maxDist, Math.max(wide / Math.tan(halfH), deep / Math.tan(halfV))));
    if (!this.overDist) {
      this.overAt.copy(center);
      this.overDist = want;
    } else {
      this.overAt.lerp(center, 1 - Math.exp(-dt * 2.2));
      this.overDist += (want - this.overDist) * (1 - Math.exp(-dt * 1.8));
    }
    // Keep the view's middle on the sand.
    const lim = this.map.extent - 3;
    const r = Math.hypot(this.overAt.x, this.overAt.z);
    if (r > lim) this.overAt.multiplyScalar(lim / r);
    const d = this.overDist;
    cam.position.set(this.overAt.x - fx * d * Math.cos(pitch), this.overAt.y + d * Math.sin(pitch), this.overAt.z - fz * d * Math.cos(pitch));
    cam.lookAt(this.overAt);
    this.applyShake(cam, 0.5);
    this.draw(cam, view, dt);
  }

  /**
   * Split screen for a big screen: each view (`rect` in fractions of the
   * canvas, from the top-left) follows a fighter over its shoulder, looking
   * along `yaw`. The scene advances once; no bloom (it works on the whole
   * canvas), shadows and the rest as usual.
   */
  renderSplit(views: { id: string; yaw: number; pitch?: number; rect: [number, number, number, number] }[], dt: number) {
    const view = this.fit();
    if (!view) return;
    this.update(dt);
    const { cw, ch, dpr } = view;
    this.renderer.setScissorTest(true);
    this.renderer.setViewport(0, 0, cw, ch);
    this.renderer.setScissor(0, 0, cw, ch);
    this.renderer.clear();
    views.forEach((v, i) => {
      const [fx0, fy0, fw, fh] = v.rect;
      const x = Math.round(fx0 * cw);
      const w = Math.round(fw * cw);
      const h = Math.round(fh * ch);
      const y = ch - Math.round(fy0 * ch) - h;
      let slot = this.splitCams.get(v.id);
      if (!slot) {
        slot = { cam: new THREE.PerspectiveCamera(62, 1, 0.05, 400), pos: new THREE.Vector3(), ready: false };
        this.splitCams.set(v.id, slot);
      }
      const cam = slot.cam;
      if (Math.abs(cam.aspect - w / h) > 1e-3) {
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
      const p = this.knights.get(v.id)?.pose;
      if (p) {
        // Over the right shoulder, like third person on the phone, tilting with the look.
        const back = p.alive ? 3.4 : 5;
        const pitch = Math.max(-0.6, Math.min(0.8, v.pitch ?? 0));
        const fx = -Math.sin(v.yaw);
        const fz = -Math.cos(v.yaw);
        const rx = Math.cos(v.yaw);
        const rz = -Math.sin(v.yaw);
        const eye = new THREE.Vector3(p.x, p.y + EYE_HEIGHT + 0.25, p.z);
        const want = new THREE.Vector3(
          eye.x - fx * back * Math.cos(pitch) + rx * 0.6,
          eye.y + 0.45 + Math.sin(pitch) * back,
          eye.z - fz * back * Math.cos(pitch) + rz * 0.6
        );
        this.clampCam(want);
        if (!slot.ready) slot.pos.copy(want);
        // Close behind: the look already glides, so the camera only softens bumps.
        else slot.pos.lerp(want, 1 - Math.exp(-dt * 30));
        slot.ready = true;
        cam.position.copy(slot.pos);
        cam.lookAt(eye.x + fx * 6 * Math.cos(pitch), eye.y - Math.sin(pitch) * 6 + 0.1, eye.z + fz * 6 * Math.cos(pitch));
      } else {
        cam.position.set(0, 12, 16);
        cam.lookAt(0, 1, 0);
      }
      this.applyShake(cam, 0.6);
      const scale = (h * dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360));
      this.sparks.setScale(scale);
      this.dust.setScale(scale);
      this.embers.setScale(scale);
      this.impacts.update(i === 0 ? dt : 0, cam);
      this.renderer.setViewport(x, y, w, h);
      this.renderer.setScissor(x, y, w, h);
      // Your own name would float right in front of your camera.
      const own = this.knights.get(v.id);
      const shown = own?.tag.visible ?? false;
      if (own) own.tag.visible = false;
      this.renderer.render(this.scene, cam);
      if (own) own.tag.visible = shown;
    });
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, cw, ch);
  }

  dispose() {
    for (const t of this.trails.values()) t.dispose();
    disposeTree(this.scene);
    disposeTree(this.handScene);
    disposeKnightGeos(this.geos);
    this.bloom?.dispose();
    this.glow.dispose();
    this.renderer.dispose();
  }
}

/** Two box geometries as one, with a per-vertex white color (instance colors tint it). */
function mergeBoxes(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const ga = a.toNonIndexed();
  const gb = b.toNonIndexed();
  const pos = new Float32Array([...(ga.attributes.position.array as Float32Array), ...(gb.attributes.position.array as Float32Array)]);
  const nor = new Float32Array([...(ga.attributes.normal.array as Float32Array), ...(gb.attributes.normal.array as Float32Array)]);
  const col = new Float32Array(pos.length).fill(1);
  // Heads in skin tone: darken the second box's vertices a little toward tan.
  for (let i = ga.attributes.position.count; i < pos.length / 3; i++) {
    col[i * 3] = 0.95;
    col[i * 3 + 1] = 0.78;
    col[i * 3 + 2] = 0.62;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
