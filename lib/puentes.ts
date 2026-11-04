import { mulberry32 } from "./random";

/**
 * Puentes: cross every bridge exactly once (the Königsberg bridges). Every
 * map is generated from a seed, so there's nothing to memorize; the same
 * seed gives the same map on every phone.
 *
 * The map is a W×H grid of cells grouped into land regions; rivers run
 * between regions and a bridge sits on a cell edge where two regions meet.
 * The generator walks at random from region to region laying a bridge at
 * each step, so that walk is always a solution. Tricks, unlocked by level:
 * one-way bridges (the walk's direction), double bridges (crossed twice), a
 * fixed start/finish, and impossible maps (more than two regions with an odd
 * number of bridges: no route exists, and saying so wins).
 */

export const W = 6;
export const H = 8;

export interface Bridge {
  /** Cells on each side (adjacent). A one-way bridge only goes a → b. */
  a: number;
  b: number;
  /** Times it has to be crossed (1, or 2 for a double bridge). */
  times: 1 | 2;
  oneWay: boolean;
}

export interface Step {
  bridge: number;
  /** Region the step leaves from. */
  from: number;
}

export interface Puzzle {
  level: number;
  /** Region of each cell. */
  cells: number[];
  regions: number;
  bridges: Bridge[];
  /** Region where the route must start / end (−1 = any). */
  start: number;
  end: number;
  impossible: boolean;
  /** A route that works (empty when impossible). */
  solution: Step[];
  /** Cells with a tree, for looks. */
  trees: number[];
}

export interface Tricks {
  oneWay: number;
  doubles: number;
  impossible: number;
  flags: number;
}

/** Map size and tricks for a level (1…). */
export function levelParams(n: number, tricks = true): { regions: number; bridges: number } & Tricks {
  const regions = Math.min(7, 3 + Math.floor(n / 3));
  const bridges = Math.min(13, 4 + Math.floor(n * 0.75));
  return {
    regions,
    bridges,
    oneWay: tricks && n >= 4 ? 0.3 : 0,
    doubles: tricks && n >= 7 ? 0.12 : 0,
    impossible: tricks && n >= 9 ? 0.18 : 0,
    flags: tricks && n >= 12 ? 0.4 : 0,
  };
}

export const regionOf = (pz: Puzzle, cell: number) => pz.cells[cell];
const cx = (i: number) => i % W;
const cy = (i: number) => Math.floor(i / W);

function neighbors(i: number): number[] {
  const out: number[] = [];
  if (cx(i) > 0) out.push(i - 1);
  if (cx(i) < W - 1) out.push(i + 1);
  if (cy(i) > 0) out.push(i - W);
  if (cy(i) < H - 1) out.push(i + W);
  return out;
}

/** Grows `k` regions from spread-out seeds, balancing their sizes. */
function makeRegions(rand: () => number, k: number): number[] | null {
  const cells = Array<number>(W * H).fill(-1);
  const seeds: number[] = [];
  for (let tries = 0; seeds.length < k && tries < 400; tries++) {
    const c = Math.floor(rand() * W * H);
    if (seeds.every((s) => Math.abs(cx(s) - cx(c)) + Math.abs(cy(s) - cy(c)) >= 3)) seeds.push(c);
  }
  if (seeds.length < k) return null;
  seeds.forEach((s, r) => (cells[s] = r));
  const size = Array<number>(k).fill(1);
  let left = W * H - k;
  while (left > 0) {
    // The smallest region that can still grow gets the next cell, most of the time.
    const growable: number[] = [];
    for (let r = 0; r < k; r++) {
      if (cells.some((v, i) => v === r && neighbors(i).some((j) => cells[j] === -1))) growable.push(r);
    }
    if (!growable.length) return null;
    growable.sort((a, b) => size[a] - size[b]);
    const r = rand() < 0.65 ? growable[0] : growable[Math.floor(rand() * growable.length)];
    const frontier: number[] = [];
    cells.forEach((v, i) => {
      if (v === r) for (const j of neighbors(i)) if (cells[j] === -1) frontier.push(j);
    });
    const c = frontier[Math.floor(rand() * frontier.length)];
    cells[c] = r;
    size[r]++;
    left--;
  }
  return size.every((s) => s >= 4) ? cells : null;
}

/** Edges between two regions, as [cellA, cellB] with B to the right of or below A. */
function boundaryEdges(cells: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < W * H; i++) {
    if (cx(i) < W - 1 && cells[i] !== cells[i + 1]) out.push([i, i + 1]);
    if (cy(i) < H - 1 && cells[i] !== cells[i + W]) out.push([i, i + W]);
  }
  return out;
}

/** Middle of the edge between two adjacent cells, in cells. */
export function edgeMid(a: number, b: number): { x: number; y: number } {
  return { x: (cx(a) + cx(b)) / 2 + 0.5, y: (cy(a) + cy(b)) / 2 + 0.5 };
}

/** Too close to a bridge already placed (they'd overlap on screen). */
function crowded(edge: [number, number], used: [number, number][]): boolean {
  const m = edgeMid(edge[0], edge[1]);
  return used.some(([a, b]) => {
    const n = edgeMid(a, b);
    return Math.hypot(m.x - n.x, m.y - n.y) < 1.05;
  });
}

export function degrees(pz: Pick<Puzzle, "regions" | "cells" | "bridges">): number[] {
  const deg = Array<number>(pz.regions).fill(0);
  for (const br of pz.bridges) {
    deg[pz.cells[br.a]] += br.times;
    deg[pz.cells[br.b]] += br.times;
  }
  return deg;
}

/** The random walk that lays the bridges (and is the solution). */
function walk(
  rand: () => number,
  cells: number[],
  regions: number,
  count: number,
  doubles: number
): { bridges: Bridge[]; solution: Step[]; start: number; end: number } | null {
  const edges = boundaryEdges(cells);
  const used: [number, number][] = [];
  const bridges: Bridge[] = [];
  const solution: Step[] = [];
  const visits = Array<number>(regions).fill(0);
  let cur = Math.floor(rand() * regions);
  const start = cur;
  visits[cur]++;
  for (let s = 0; s < count; s++) {
    // Crossing an existing bridge a second time (double bridge).
    if (doubles && rand() < doubles) {
      const again = bridges
        .map((br, i) => ({ br, i }))
        .filter(({ br }) => br.times === 1 && (cells[br.a] === cur || cells[br.b] === cur));
      if (again.length) {
        const { br, i } = again[Math.floor(rand() * again.length)];
        br.times = 2;
        solution.push({ bridge: i, from: cur });
        cur = cells[br.a] === cur ? cells[br.b] : cells[br.a];
        visits[cur]++;
        continue;
      }
    }
    const options = edges.filter(([a, b]) => (cells[a] === cur || cells[b] === cur) && !used.some(([x, y]) => x === a && y === b) && !crowded([a, b], used));
    if (!options.length) return null;
    // Prefer going where it hasn't been, so every region gets bridges.
    const weights = options.map(([a, b]) => {
      const other = cells[a] === cur ? cells[b] : cells[a];
      return 1 + (visits[other] === 0 ? 6 : 0);
    });
    let pick = rand() * weights.reduce((x, y) => x + y, 0);
    let k = 0;
    while (pick > weights[k]) pick -= weights[k++];
    const [ea, eb] = options[Math.min(k, options.length - 1)];
    used.push([ea, eb]);
    // Oriented the way the walk crosses it (a one-way bridge goes a → b).
    const [a, b] = cells[ea] === cur ? [ea, eb] : [eb, ea];
    bridges.push({ a, b, times: 1, oneWay: false });
    solution.push({ bridge: bridges.length - 1, from: cur });
    cur = cells[b];
    visits[cur]++;
  }
  if (visits.some((v) => v === 0)) return null;
  return { bridges, solution, start, end: cur };
}

/** Adds bridges between even regions until more than two are odd: then no route exists. */
function breakIt(rand: () => number, cells: number[], regions: number, bridges: Bridge[]): boolean {
  const edges = boundaryEdges(cells);
  const used = bridges.map((br) => (br.a < br.b ? [br.a, br.b] : [br.b, br.a]) as [number, number]);
  for (let added = 0; added < 2; added++) {
    const deg = degrees({ regions, cells, bridges });
    if (deg.filter((d) => d % 2).length >= 4) return true;
    const options = edges.filter(
      ([a, b]) => deg[cells[a]] % 2 === 0 && deg[cells[b]] % 2 === 0 && !used.some(([x, y]) => x === a && y === b) && !crowded([a, b], used)
    );
    if (!options.length) return false;
    const [a, b] = options[Math.floor(rand() * options.length)];
    used.push([a, b]);
    bridges.push({ a, b, times: 1, oneWay: false });
  }
  return degrees({ regions, cells, bridges }).filter((d) => d % 2).length >= 4;
}

/** A map for a level; always solvable unless it came out impossible on purpose. */
export function generatePuzzle(seed: number, level: number, tricks = true): Puzzle {
  const rand = mulberry32(seed);
  const p = levelParams(level, tricks);
  const impossible = rand() < p.impossible;
  for (let attempt = 0; attempt < 400; attempt++) {
    // Fewer bridges if it keeps failing (small maps run out of room).
    const count = Math.max(p.regions + 1, p.bridges - Math.floor(attempt / 60));
    const cells = makeRegions(rand, p.regions);
    if (!cells) continue;
    const w = walk(rand, cells, p.regions, impossible ? count - 1 : count, impossible ? 0 : p.doubles);
    if (!w) continue;
    const bridges = w.bridges;
    let start = -1;
    let end = -1;
    if (impossible) {
      if (!breakIt(rand, cells, p.regions, bridges)) continue;
    } else {
      for (const br of bridges) if (br.times === 1 && rand() < p.oneWay) br.oneWay = true;
      if (rand() < p.flags) start = w.start;
      if (rand() < p.flags) end = w.end;
    }
    // Shuffle the bridges' order so the solution isn't their index order.
    // Fisher-Yates (a random sort comparator would differ between browsers).
    const order = bridges.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const inverse = Array<number>(order.length);
    order.forEach((old, i) => (inverse[old] = i));
    const shuffled = order.map((i) => bridges[i]);
    const solution = impossible ? [] : w.solution.map((s) => ({ ...s, bridge: inverse[s.bridge] }));
    const near = new Set(shuffled.flatMap((br) => [br.a, br.b]));
    const trees = cells.map((_, i) => i).filter((i) => !near.has(i) && rand() < 0.22);
    return { level, cells, regions: p.regions, bridges: shuffled, start, end, impossible, solution, trees };
  }
  // Practically unreachable; an easier map instead.
  return generatePuzzle(seed + 1, Math.max(1, level - 2), tricks);
}

// ---- Playing ---------------------------------------------------------------

export interface Play {
  /** The cell the player stands on (−1 = not started). */
  cell: number;
  /** Crossings per bridge. */
  counts: number[];
  path: { bridge: number; from: number; to: number }[];
  startCell: number;
}

export function newPlay(pz: Puzzle): Play {
  return { cell: -1, counts: pz.bridges.map(() => 0), path: [], startCell: -1 };
}

/** Starting on a cell (null if the map asks to start elsewhere). */
export function startAt(pz: Puzzle, cell: number): Play | null {
  if (pz.start >= 0 && pz.cells[cell] !== pz.start) return null;
  return { ...newPlay(pz), cell, startCell: cell };
}

/** Where crossing bridge `i` from here takes you (−1 = it can't be crossed). */
export function crossTarget(pz: Puzzle, p: Play, i: number): number {
  const br = pz.bridges[i];
  if (p.cell < 0 || p.counts[i] >= br.times) return -1;
  const here = pz.cells[p.cell];
  if (pz.cells[br.a] === here) return br.b;
  if (pz.cells[br.b] === here && !br.oneWay) return br.a;
  return -1;
}

export function cross(pz: Puzzle, p: Play, i: number): Play | null {
  const to = crossTarget(pz, p, i);
  if (to < 0) return null;
  const counts = p.counts.slice();
  counts[i]++;
  return { ...p, cell: to, counts, path: [...p.path, { bridge: i, from: p.cell, to }] };
}

export function undo(pz: Puzzle, p: Play): Play {
  const last = p.path[p.path.length - 1];
  if (!last) return newPlay(pz);
  const counts = p.counts.slice();
  counts[last.bridge]--;
  return { ...p, cell: last.from, counts, path: p.path.slice(0, -1) };
}

export const totalCrossings = (pz: Puzzle) => pz.bridges.reduce((s, br) => s + br.times, 0);

export function isSolved(pz: Puzzle, p: Play): boolean {
  return p.cell >= 0 && p.path.length === totalCrossings(pz) && (pz.end < 0 || pz.cells[p.cell] === pz.end);
}

/** No bridge left to cross from here, and not solved. */
export function isStuck(pz: Puzzle, p: Play): boolean {
  if (p.cell < 0 || isSolved(pz, p)) return false;
  return pz.bridges.every((_, i) => crossTarget(pz, p, i) < 0);
}

/** Today in Argentina (UTC−3), as yyyymmdd. */
export function dayKey(now: number): string {
  return new Date(now - 3 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
}

/** The daily challenge: the same map for everyone today. */
export function dailyPuzzle(day: string): Puzzle {
  return generatePuzzle(Number(day) * 7919 + 13, 11);
}

/** What makes a map special, for the chips over the board. */
export function tricksOf(pz: Puzzle): string[] {
  const out: string[] = [];
  if (pz.bridges.some((b) => b.oneWay)) out.push("Puentes de una mano: solo se cruzan hacia donde marca la flecha");
  if (pz.bridges.some((b) => b.times === 2)) out.push("Puentes dobles: hay que cruzarlos dos veces");
  if (pz.start >= 0) out.push("Salida fija: empezá en la bandera verde");
  if (pz.end >= 0) out.push("Llegada fija: terminá en la bandera a cuadros");
  return out;
}

/** Levels where a map can come out impossible. */
export const canBeImpossible = (level: number, tricks = true) => levelParams(level, tricks).impossible > 0;
