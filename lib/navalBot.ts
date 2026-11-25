import { FLEET, SIZE, isShot, isSunk, shipAt } from "./naval";
import { pickBest, randomOf, type BotLevel } from "./boardBot";

/**
 * Batalla naval's computer rival. It only uses what a player sees: its own
 * shots, which were hits and which ships are sunk (the rival's fleet is read
 * just for that, never for unshot cells).
 *  - fácil: random shots, and only sometimes follows up a hit;
 *  - normal: hunts on a checkerboard, then finishes ships around its hits;
 *  - difícil: every turn counts the ways the ships still afloat could lie
 *    (not over misses or sunk ships, hits weighing a lot) and fires where
 *    most of them overlap.
 */

const N = SIZE * SIZE;

interface View {
  shot: boolean[];
  /** Hit on a ship that isn't sunk yet. */
  open: boolean[];
  /** Miss, or a cell of a sunk ship: nothing else can be there. */
  closed: boolean[];
  afloat: number[];
}

function viewOf(fleet: string, shots: string): View {
  const shot = Array.from({ length: N }, (_, i) => isShot(shots, i));
  const sunk = FLEET.map((_, ship) => isSunk(fleet, shots, ship));
  const open: boolean[] = [];
  const closed: boolean[] = [];
  for (let i = 0; i < N; i++) {
    const ship = shot[i] ? shipAt(fleet, i) : -1;
    open.push(shot[i] && ship >= 0 && !sunk[ship]);
    closed.push(shot[i] && (ship < 0 || sunk[ship]));
  }
  return { shot, open, closed, afloat: FLEET.map((_, i) => i).filter((i) => !sunk[i]) };
}

const neighbors = (i: number) => {
  const r = Math.floor(i / SIZE);
  const c = i % SIZE;
  return [r > 0 ? i - SIZE : -1, r < SIZE - 1 ? i + SIZE : -1, c > 0 ? i - 1 : -1, c < SIZE - 1 ? i + 1 : -1].filter((x) => x >= 0);
};

/** Free cells next to open hits, preferring those in line with two hits. */
function targets(v: View): number[] {
  const out = new Map<number, number>();
  for (let i = 0; i < N; i++) {
    if (!v.open[i]) continue;
    for (const n of neighbors(i)) {
      if (v.shot[n]) continue;
      // In line with another hit on the opposite side = the ship's direction.
      const opposite = 2 * i - n;
      const inLine = opposite >= 0 && opposite < N && v.open[opposite] && neighbors(i).includes(opposite);
      out.set(n, Math.max(out.get(n) ?? 0, inLine ? 2 : 1));
    }
  }
  const best = Math.max(0, ...out.values());
  return [...out].filter(([, w]) => w === best).map(([i]) => i);
}

function density(v: View): number[] {
  const score = Array<number>(N).fill(0);
  for (const ship of v.afloat) {
    const len = FLEET[ship].len;
    for (let start = 0; start < N; start++) {
      for (const horizontal of [true, false]) {
        const r = Math.floor(start / SIZE);
        const c = start % SIZE;
        if (horizontal ? c + len > SIZE : r + len > SIZE) continue;
        const cells = Array.from({ length: len }, (_, k) => (horizontal ? start + k : start + k * SIZE));
        if (cells.some((i) => v.closed[i])) continue;
        const hits = cells.filter((i) => v.open[i]).length;
        const w = hits ? 30 ** hits : 1;
        for (const i of cells) if (!v.shot[i]) score[i] += w;
      }
    }
  }
  return score;
}

/** The cell the bot fires at, on the rival's `fleet` with its own `shots`. */
export function navalBotShot(fleet: string, shots: string, level: BotLevel): number {
  const v = viewOf(fleet, shots);
  const free = Array.from({ length: N }, (_, i) => i).filter((i) => !v.shot[i]);
  if (level === "facil") {
    const t = targets(v);
    return t.length && Math.random() < 0.55 ? randomOf(t) : randomOf(free);
  }
  if (level === "normal") {
    const t = targets(v);
    if (t.length) return randomOf(t);
    const parity = free.filter((i) => (Math.floor(i / SIZE) + (i % SIZE)) % 2 === 0);
    return randomOf(parity.length ? parity : free);
  }
  const d = density(v);
  return pickBest(free.map((i) => ({ move: i, score: d[i] })));
}
