/**
 * Fuego cruzado maps, pure data. A map is a flat floor (y = 0) bounded by
 * walls, with boxes (blocks, platforms, crates, walls; `y` lifts floating
 * ones like bridges) and ramps (a slope rising toward `up`, walkable).
 * Coordinates in meters, centered on 0; x/z is the floor, y is up.
 *
 * `spawns` are where fighters (re)appear (team ones are used in team games,
 * all of them in free-for-all), `items` where pickups lie, and `nodes` the
 * points the bots walk between (edges are worked out from the geometry).
 */

export type MapId = "bunker" | "fortaleza" | "valle";
export type MapTheme = "bunker" | "fortaleza" | "valle";
export type BoxKind = "muro" | "bloque" | "plataforma" | "caja";
export type PickupKind = "rifle" | "pistola" | "escopeta" | "francotirador" | "lanzacohetes" | "granadas" | "botiquin";

export interface Box {
  /** Center on the floor plane, size along x (w) and z (d), bottom y and height h. */
  x: number;
  z: number;
  w: number;
  d: number;
  y: number;
  h: number;
  kind: BoxKind;
}

export interface Ramp {
  x: number;
  z: number;
  w: number;
  d: number;
  /** Bottom height and the rise; the high end is toward `up`. */
  y: number;
  h: number;
  up: "x+" | "x-" | "z+" | "z-";
}

export interface Spawn {
  x: number;
  z: number;
  yaw: number;
  team?: "red" | "blue";
}

export interface MapDef {
  id: MapId;
  name: string;
  size: "Chico" | "Mediano" | "Grande";
  hint: string;
  theme: MapTheme;
  /** Half the floor's extent along x and z. */
  hx: number;
  hz: number;
  wallH: number;
  boxes: Box[];
  ramps: Ramp[];
  spawns: Spawn[];
  items: { kind: PickupKind; x: number; z: number }[];
  nodes: [number, number][];
  /** Most fighters it suits. */
  maxPlayers: number;
}

const b = (x: number, z: number, w: number, d: number, h: number, kind: BoxKind = "bloque", y = 0): Box => ({ x, z, w, d, y, h, kind });
const r = (x: number, z: number, w: number, d: number, h: number, up: Ramp["up"], y = 0): Ramp => ({ x, z, w, d, y, h, up });

/** Faces the map's center from (x, z): yaw 0 looks toward -z. */
const facing = (x: number, z: number) => Math.atan2(x, z);
const sp = (x: number, z: number, team?: "red" | "blue"): Spawn => ({ x, z, yaw: facing(x, z), team });

/** Points mirrored into the four quadrants. */
const quad = (list: [number, number][]): [number, number][] =>
  list.flatMap(([x, z]) => [[x, z], [-x, z], [x, -z], [-x, -z]] as [number, number][]);

/** The same shapes mirrored across x = 0 (for symmetric maps). */
const mirrorX = <T extends { x: number }>(list: T[], flipUp = false): T[] =>
  list.flatMap((o) => {
    const m = { ...o, x: -o.x } as T & { up?: Ramp["up"] };
    if (flipUp && m.up) m.up = m.up === "x+" ? "x-" : m.up === "x-" ? "x+" : m.up;
    return o.x === 0 ? [o] : [o, m];
  });
const mirrorZ = <T extends { z: number }>(list: T[], flipUp = false): T[] =>
  list.flatMap((o) => {
    const m = { ...o, z: -o.z } as T & { up?: Ramp["up"] };
    if (flipUp && m.up) m.up = m.up === "z+" ? "z-" : m.up === "z-" ? "z+" : m.up;
    return o.z === 0 ? [o] : [o, m];
  });

// ---- Búnker: small, fast, close quarters ----------------------------------------------

const BUNKER: MapDef = {
  id: "bunker",
  name: "Búnker",
  size: "Chico",
  hint: "Sala cerrada con una plataforma central y pasillos. Combates cortos y rápidos.",
  theme: "bunker",
  hx: 18,
  hz: 18,
  wallH: 7,
  maxPlayers: 6,
  boxes: [
    b(0, 0, 8, 8, 2.4, "plataforma"),
    ...mirrorX(mirrorZ([b(10, 10, 2, 2, 7, "muro")])),
    ...mirrorX([b(13, 0, 1, 12, 3, "muro")]),
    ...mirrorX([b(7, 0, 1.4, 3, 1.2, "caja")]),
    ...mirrorX(mirrorZ([b(14.5, 15, 2, 2, 1.2, "caja"), b(5, 13, 3, 1.2, 1.4, "caja")])),
  ],
  ramps: mirrorZ([r(0, -7, 3, 6, 2.4, "z+")], true),
  spawns: [...mirrorX(mirrorZ([sp(16, 16)])), ...mirrorZ([sp(0, 16)]), ...mirrorX([sp(16, 0)])],
  items: [
    { kind: "escopeta", x: 0, z: 0 },
    ...mirrorX([{ kind: "granadas" as PickupKind, x: 15.5, z: 0 }]),
    ...mirrorZ([{ kind: "botiquin" as PickupKind, x: 0, z: 15.5 }]),
    ...mirrorX([{ kind: "pistola" as PickupKind, x: 9, z: 0 }]),
  ],
  nodes: [
    ...quad([[16, 16], [10, 14], [15.5, 7], [6, 6], [10, 4]]),
    [0, -11], [0, 11], [0, -4.5], [0, 4.5], [0, 0], [15.5, 0], [-15.5, 0], [10, 0], [-10, 0], [0, 15.5], [0, -15.5],
  ],
};

// ---- Fortaleza: medium, two bases and a tower ----------------------------------------------

const FORT_BOXES: Box[] = [
  // The bases: a block with parapets on top.
  b(24, 0, 10, 14, 3.2, "plataforma"),
  b(19.6, 0, 0.6, 3, 1.1, "muro", 3.2),
  b(24, 6.7, 6, 0.6, 1.1, "muro", 3.2),
  b(24, -6.7, 6, 0.6, 1.1, "muro", 3.2),
  // Cover on the field.
  b(12, 10, 3, 1, 1.3, "caja"),
  b(12, -10, 3, 1, 1.3, "caja"),
  b(8, 16, 1, 4, 2.5, "muro"),
  b(8, -16, 1, 4, 2.5, "muro"),
  b(16, 14, 2, 2, 5, "muro"),
  b(16, -14, 2, 2, 5, "muro"),
  b(28, 14, 2.5, 2.5, 1.4, "caja"),
  b(28, -14, 2.5, 2.5, 1.4, "caja"),
];

const FORTALEZA: MapDef = {
  id: "fortaleza",
  name: "Fortaleza",
  size: "Mediano",
  hint: "Dos bases enfrentadas y una torre en el medio con el lanzacohetes. Para equipos.",
  theme: "fortaleza",
  hx: 32,
  hz: 24,
  wallH: 8,
  maxPlayers: 8,
  boxes: [
    ...mirrorX(FORT_BOXES),
    // Center tower.
    b(0, 0, 6, 6, 4.5, "plataforma"),
    b(0, 14, 6, 1.2, 1.5, "caja"),
    b(0, -14, 6, 1.2, 1.5, "caja"),
  ],
  ramps: [
    ...mirrorX([r(16, -5, 6, 3, 3.2, "x+"), r(16, 5, 6, 3, 3.2, "x+")], true),
    r(0, 7.5, 3, 9, 4.5, "z-"),
    r(0, -7.5, 3, 9, 4.5, "z+"),
  ],
  spawns: [
    ...[[-30.5, 10], [-30.5, -10], [-26, 11], [-26, -11], [-27, 0]].map(([x, z]) => sp(x, z, "red")),
    ...[[30.5, 10], [30.5, -10], [26, 11], [26, -11], [27, 0]].map(([x, z]) => sp(x, z, "blue")),
    sp(0, 20),
    sp(0, -20),
  ],
  items: [
    { kind: "lanzacohetes", x: 0, z: 0 },
    ...mirrorX([{ kind: "francotirador" as PickupKind, x: 26, z: 0 }]),
    ...mirrorZ([{ kind: "escopeta" as PickupKind, x: 0, z: 19 }]),
    ...mirrorX(mirrorZ([{ kind: "granadas" as PickupKind, x: 12, z: 16 }])),
    ...mirrorX([{ kind: "botiquin" as PickupKind, x: 10, z: 0 }]),
    ...mirrorX([{ kind: "rifle" as PickupKind, x: 22, z: 18 }]),
  ],
  nodes: [
    ...([
      [28, 0], [26, 4], [26, -4], [21, 5], [21, -5], [13, 5], [13, -5], [10, 0], [17, 10], [17, -10], [28, 10], [28, -10], [30.5, 19], [30.5, -19],
      [22, 19], [22, -19], [12, 19], [12, -19], [12, 7], [12, -7], [4, 12], [4, -12],
    ] as [number, number][]).flatMap(([x, z]) => [[x, z], [-x, z]] as [number, number][]),
    [0, 3.5], [0, 12.5], [0, -12.5], [0, -3.5], [0, 19], [0, -19], [0, 0],
  ],
};

// ---- Valle: large, open, long sight lines ----------------------------------------------

const VALLE_ROCKS: Box[] = [
  b(-15, -8, 5, 4, 2.2),
  b(12, 6, 4, 6, 3),
  b(0, -14, 7, 3, 1.6),
  b(-5, 12, 3, 3, 2.8),
  b(22, -12, 4, 4, 2),
  b(-24, 10, 5, 3, 1.8),
  b(35, 14, 3, 5, 2.4),
  b(-35, -14, 3, 5, 2.4),
  b(30, -2, 2, 2, 1.2, "caja"),
  b(-30, 2, 2, 2, 1.2, "caja"),
  b(-12, 18, 4, 2, 1.5),
  b(14, -19, 4, 2, 1.5),
];

const VALLE: MapDef = {
  id: "valle",
  name: "Valle",
  size: "Grande",
  hint: "Un cañón abierto con bases en las puntas, crestas a los costados y una torre de francotirador.",
  theme: "valle",
  hx: 60,
  hz: 34,
  wallH: 10,
  maxPlayers: 8,
  boxes: [
    // Bases.
    ...mirrorX([b(50, 0, 12, 16, 3.5, "plataforma"), b(44.7, 5.5, 0.6, 3, 1.1, "muro", 3.5), b(44.7, -5.5, 0.6, 3, 1.1, "muro", 3.5)]),
    // Ridges along the sides.
    ...mirrorZ([b(0, 29, 70, 10, 5, "plataforma")]),
    ...mirrorZ(mirrorX([b(18, 24.5, 1, 4, 1.1, "muro", 5)])),
    // Center tower.
    b(0, 0, 8, 8, 6, "plataforma"),
    b(0, 3.7, 8, 0.6, 1.1, "muro", 6),
    b(0, -3.7, 8, 0.6, 1.1, "muro", 6),
    ...VALLE_ROCKS,
  ],
  ramps: [
    ...mirrorX([r(41, 0, 6, 4, 3.5, "x+")], true),
    ...mirrorZ(mirrorX([r(25, 20, 4, 8, 5, "z+")]), true),
    r(9, 0, 10, 3, 6, "x-"),
    r(-9, 0, 10, 3, 6, "x+"),
  ],
  spawns: [
    ...[[-56, 10], [-56, -10], [-50, 12], [-50, -12], [-52, 0]].map(([x, z]) => sp(x, z, "red")),
    ...[[56, 10], [56, -10], [50, 12], [50, -12], [52, 0]].map(([x, z]) => sp(x, z, "blue")),
    sp(0, 18),
    sp(0, -18),
    sp(25, 29),
    sp(-25, -29),
  ],
  items: [
    { kind: "francotirador", x: 0, z: 0 },
    ...mirrorZ([{ kind: "francotirador" as PickupKind, x: 0, z: 29 }]),
    ...mirrorZ([{ kind: "lanzacohetes" as PickupKind, x: 0, z: 18 }]),
    ...mirrorX([{ kind: "escopeta" as PickupKind, x: 40, z: 12 }]),
    ...mirrorX([{ kind: "rifle" as PickupKind, x: 52, z: 5 }]),
    ...mirrorX(mirrorZ([{ kind: "botiquin" as PickupKind, x: 25, z: 8 }])),
    ...mirrorX(mirrorZ([{ kind: "granadas" as PickupKind, x: 15, z: 14 }])),
  ],
  nodes: [
    ...([
      [54, 0], [50, 6], [50, -6], [46, 0], [37, 0], [37, 10], [37, -10], [46, 12], [46, -12], [54, 14], [54, -14],
      [30, 6], [30, -8], [25, 14], [25, -14], [25, 25], [25, -25], [25, 29], [25, -29], [10, 29], [10, -29], [32, 29], [32, -29],
      [20, 0], [15, 8], [15, -12], [18, -16], [8, 10], [8, -10], [14, 2], [6, 0],
    ] as [number, number][]).flatMap(([x, z]) => [[x, z], [-x, z]] as [number, number][]),
    [0, 0], [0, 18], [0, -18], [0, 29], [0, -29], [0, 9], [0, -9],
  ],
};

export const MAPS: Record<MapId, MapDef> = { bunker: BUNKER, fortaleza: FORTALEZA, valle: VALLE };
export const MAP_ORDER: MapId[] = ["bunker", "fortaleza", "valle"];

/** The map's boxes plus its boundary walls. */
export function solidBoxes(map: MapDef): Box[] {
  const t = 1;
  const h = map.wallH;
  return [
    ...map.boxes,
    b(0, -map.hz - t / 2, map.hx * 2 + t * 2, t, h, "muro"),
    b(0, map.hz + t / 2, map.hx * 2 + t * 2, t, h, "muro"),
    b(-map.hx - t / 2, 0, t, map.hz * 2, h, "muro"),
    b(map.hx + t / 2, 0, t, map.hz * 2, h, "muro"),
  ];
}
