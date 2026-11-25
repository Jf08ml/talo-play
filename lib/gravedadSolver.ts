import { DT, NO_INPUT, cloneRunner, distanceField, step, type Input, type Level, type Runner } from "./gravedadSim";

/**
 * Finds a way through a level with the real simulation: a best-first search
 * over short "macro" moves (hold a direction for `MACRO` ticks, maybe jumping
 * or turning gravity at its start), guided by the distance to the goal.
 * Used to check that every level can be finished and by the bots, which play
 * the route it returns (with pauses, so they're not perfect).
 */

/** Ticks per macro move (1/12 s). */
export const MACRO = 10;

const GRAVS: Input["grav"][] = ["", "up", "left", "right"];
/** Every macro move: move × jump × gravity, as an index (see `actionInput`). */
export const ACTIONS = 3 * 2 * 4;

export function actionInput(a: number): { move: -1 | 0 | 1; jump: boolean; grav: Input["grav"] } {
  const move = ((a % 3) - 1) as -1 | 0 | 1;
  const jump = Math.floor(a / 3) % 2 === 1;
  const grav = GRAVS[Math.floor(a / 6)];
  return { move, jump, grav };
}

/** Index of "just stand there" (no move, no jump, no gravity change). */
export const IDLE = 1;

/** Plays macro move `a` on `r` (mutates it); false if the runner died during it. */
export function playMacro(lv: Level, r: Runner, a: number): boolean {
  const { move, jump, grav } = actionInput(a);
  for (let i = 0; i < MACRO; i++) {
    const ev = step(lv, r, i === 0 ? { move, jump, grav } : { ...NO_INPUT, move });
    if (ev.died) return false;
    if (r.finished) return true;
  }
  return true;
}

interface Node {
  r: Runner;
  cost: number;
  f: number;
  parent: Node | null;
  action: number;
}

class Heap {
  items: Node[] = [];
  push(n: Node) {
    const a = this.items;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): Node | undefined {
    const a = this.items;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.items.length;
  }
}

export interface SolveOptions {
  /** Cap on expanded nodes. */
  maxNodes?: number;
  /** Weight of the distance guide (higher: faster to find, less optimal). */
  greed?: number;
  /** Random tie-breaking, so bots don't all take the exact same line. */
  rand?: () => number;
}

/** Macro moves from `from` to the goal, or null if none was found. */
export function solve(lv: Level, from: Runner, opts: SolveOptions = {}): number[] | null {
  const field = distanceField(lv);
  const maxNodes = opts.maxNodes ?? 60_000;
  const greed = opts.greed ?? 1.6;
  const rand = opts.rand;
  const timed = !!(lv.movers?.length || lv.pulse || lv.crumbles.length);
  const h = (r: Runner) => {
    const d = field[Math.max(0, Math.min(lv.h - 1, Math.floor(r.y))) * lv.w + Math.max(0, Math.min(lv.w - 1, Math.floor(r.x)))];
    return (d < 0 ? 999 : d) / 7;
  };
  const key = (r: Runner) =>
    `${Math.round(r.x * 4)},${Math.round(r.y * 4)},${r.g},${r.grounded ? 1 : 0},${r.charge ? 1 : 0},${Math.round(r.vx / 2)},${Math.round(r.vy / 2)}${timed ? `,${Math.floor(r.t * 3)}` : ""}`;
  const seen = new Set<string>([key(from)]);
  const open = new Heap();
  open.push({ r: cloneRunner(from), cost: 0, f: greed * h(from), parent: null, action: -1 });
  let expanded = 0;
  while (open.size && expanded < maxNodes) {
    const node = open.pop()!;
    expanded++;
    for (let a = 0; a < ACTIONS; a++) {
      const { jump, grav } = actionInput(a);
      if (jump && !(node.r.grounded || node.r.coyote > 0)) continue;
      if (grav && (!node.r.charge || node.r.gravCool > 0)) continue;
      const r = cloneRunner(node.r);
      if (!playMacro(lv, r, a)) continue;
      const cost = node.cost + MACRO * DT + (grav ? 0.02 : 0);
      const child: Node = { r, cost, f: cost + greed * h(r) + (rand ? rand() * 0.05 : 0), parent: node, action: a };
      if (r.finished) {
        const out: number[] = [];
        for (let n: Node | null = child; n && n.action >= 0; n = n.parent) out.push(n.action);
        return out.reverse();
      }
      const k = key(r);
      if (seen.has(k)) continue;
      seen.add(k);
      open.push(child);
    }
  }
  return null;
}
