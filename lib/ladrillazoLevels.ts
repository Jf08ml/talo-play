import { mulberry32 } from "./random";
import { COLS, ROWS, type Goal } from "./ladrillazoSim";

/**
 * Ladrillazo's levels: the campaign, drawn by hand (append-only: rooms store
 * the index), and the generator for random levels (`generateLevel`, the same
 * level for the same seed on every phone). Legend in `lib/ladrillazoSim.ts`.
 */

export interface Level {
  name: string;
  goal: Goal;
  /** Lives. */
  balls: number;
  /** Seconds that still earn the third star. */
  par: number;
  /** Rows from the top, COLS characters each. */
  rows: string[];
}

export const CAMPAIGN: Level[] = [
  {
    name: "Primer ladrillazo",
    goal: "limpiar",
    balls: 3,
    par: 120,
    rows: [
      ".....................",
      ".....................",
      ".....................",
      "..bbbbbbbbbbbbbbbbb..",
      "..bbbbbbbbbbbbbbbbb..",
      "..bbbbbbbbbbbbbbbbb..",
      "..bbbbbbbbmbbbbbbbb..",
      "..bbbbbbbbbbbbbbbbb..",
    ],
  },
  {
    name: "Al blanco",
    goal: "objetivos",
    balls: 3,
    par: 60,
    rows: [
      ".....................",
      ".....................",
      "...o.............o...",
      "..bbb...........bbb..",
      ".....................",
      ".........bbb.........",
      ".........bob.........",
      ".........bbb.........",
      ".....................",
      "..bbbbbbbbbbbbbbbbb..",
    ],
  },
  {
    name: "La pirámide",
    goal: "limpiar",
    balls: 3,
    par: 150,
    rows: [
      ".....................",
      ".....................",
      "..........B..........",
      ".........BbB.........",
      "........BbbbB........",
      ".......BbbbbbB.......",
      "......BbbbmbbbB......",
      ".....BbbbbbbbbbB.....",
      "....BbbbbbbbbbbbB....",
      "...BbbbbbbbbbbbbbB...",
    ],
  },
  {
    name: "Bombazo",
    goal: "limpiar",
    balls: 3,
    par: 120,
    rows: [
      ".....................",
      ".....................",
      "..bbbbbbbbbbbbbbbbb..",
      "..bbbxbbbbbbbbbxbbb..",
      "..bbbbbbbbbbbbbbbbb..",
      "..BBBBBBBBxBBBBBBBB..",
      "..bbbbbbbbbbbbbbbbb..",
      "..bbbxbbbbbbbbbxbbb..",
      "..bbbbbbbbbbbbbbbbb..",
    ],
  },
  {
    name: "Detrás del muro",
    goal: "objetivos",
    balls: 3,
    par: 90,
    rows: [
      ".....................",
      ".....................",
      "....o.....o.....o....",
      "...bbb...bbb...bbb...",
      ".....................",
      "#######.......#######",
      ".....................",
      "..bbbbbbbbbbbbbbbbb..",
      "..bbbbbbbblbbbbbbbb..",
    ],
  },
  {
    name: "Los tubos",
    goal: "objetivos",
    balls: 4,
    par: 200,
    rows: [
      ".....................",
      ".....................",
      "..####..#####..####..",
      "..#oo#..#ooo#..#oo#..",
      "..#bb#..#bbb#..#bb#..",
      "..#bb#..#bbb#..#bb#..",
      "..#..#..#...#..#..#..",
      "..#..#..#...#..#..#..",
      "..#..#..#...#..#..#..",
      "..#..#..#...#..#..#..",
      ".....................",
      ".....................",
      "bbbbbb...bbb...bbbbbb",
    ],
  },
  {
    name: "Ajedrez",
    goal: "limpiar",
    balls: 3,
    par: 180,
    rows: [
      ".....................",
      ".....................",
      "..bBbBbBbBbBbBbBbBb..",
      "..BbBbBbBbBbBbBbBbB..",
      "..bBbBbBbBmBbBbBbBb..",
      "..BbBbBbBbBbBbBbBbB..",
      "..bBbBbBbBbBbBbBbBb..",
      "..BbBbBbBlBbBbBbBbB..",
      "..bBbBbBbBbBbBbBbBb..",
    ],
  },
  {
    name: "La fortaleza",
    goal: "objetivos",
    balls: 4,
    par: 90,
    rows: [
      ".....................",
      ".....................",
      ".....................",
      "......#########......",
      "......#BBBBBBB#......",
      "......#BBBoBBB#......",
      "......#BBBBBBB#......",
      "......###...###......",
      ".....................",
      "..bbbbbbbbbbbbbbbbb..",
      "..bbbbbbbbmbbbbbbbb..",
    ],
  },
  {
    name: "El embudo",
    goal: "objetivos",
    balls: 4,
    par: 100,
    rows: [
      ".....................",
      ".....o....o....o.....",
      "....bbb..bbb..bbb....",
      ".....................",
      "#...................#",
      ".#.................#.",
      "..#...............#..",
      "...#.............#...",
      "....#...........#....",
      ".....#.........#.....",
      "......#.......#......",
      ".......#.....#.......",
      "........#...#........",
      ".....................",
      "bbbbbbb.......bbbbbbb",
      "bbbbbbv.......vbbbbbb",
    ],
  },
  {
    name: "Multiplicate",
    goal: "limpiar",
    balls: 3,
    par: 180,
    rows: [
      ".....................",
      ".....................",
      ".bbbbbbbbbbbbbbbbbbb.",
      ".bbbmbbbbbbbbbbbmbbb.",
      ".bbbbbbbbbbbbbbbbbbb.",
      ".BBBBBBBBBBBBBBBBBBB.",
      ".bbbbbbbbbmbbbbbbbbb.",
      ".bbbbbbbbbbbbbbbbbbb.",
      ".BBBBBBBBBBBBBBBBBBB.",
      ".bbbmbbbbbbbbbbbmbbb.",
      ".bbbbbbbbbbbbbbbbbbb.",
    ],
  },
  {
    name: "Las torres",
    goal: "objetivos",
    balls: 4,
    par: 80,
    rows: [
      ".....................",
      ".....................",
      ".....................",
      "...#o#...#o#...#o#...",
      "...###...###...###...",
      "...###...###...###...",
      "...###...###...###...",
      "...###...###...###...",
      "...###...###...###...",
      ".....................",
      ".....................",
      "..bbbbbbbbbbbbbbbbb..",
      "..bbbbbbbblbbbbbbbb..",
    ],
  },
  {
    name: "Corazón",
    goal: "limpiar",
    balls: 3,
    par: 200,
    rows: [
      ".....................",
      ".....................",
      "...BBBBB.....BBBBB...",
      "..BbbbbbB...BbbbbbB..",
      ".BbbbbbbbB.BbbbbbbbB.",
      ".BbbbbbbbbBbbbbbbbbB.",
      ".Bbbbbbbbbvbbbbbbbbb.",
      "..BbbbbbbbbbbbbbbbB..",
      "...BbbbbbbmbbbbbbB...",
      "....BbbbbbbbbbbbB....",
      ".....BbbbbbbbbbB.....",
      "......BbbbbbbbB......",
      ".......BbbbbbB.......",
      "........BbbbB........",
      ".........BbB.........",
      "..........B..........",
    ],
  },
  {
    name: "Laberinto",
    goal: "objetivos",
    balls: 4,
    par: 80,
    rows: [
      ".....................",
      ".........ooo.........",
      ".....................",
      "#########...#########",
      ".....................",
      "....bbbb.....bbbb....",
      ".....................",
      "###...#########...###",
      ".....................",
      "......bbbbbbbbb......",
      ".....................",
      "#######.......#######",
      ".....................",
      "..bbbbbbbbbbbbbbbbb..",
    ],
  },
  {
    name: "Cuatro esquinas",
    goal: "objetivos",
    balls: 4,
    par: 100,
    rows: [
      "oo.#.............#.oo",
      "...#.............#...",
      "...#......o......#...",
      "#..#.............#..#",
      ".....................",
      "....bbbbbbbbbbbbb....",
      "....bBbBbBbBbBbBb....",
      "....bbbbbbmbbbbbb....",
    ],
  },
  {
    name: "Bombas en cadena",
    goal: "limpiar",
    balls: 3,
    par: 200,
    rows: [
      ".....................",
      ".....................",
      "..BBBBBBBBBBBBBBBBB..",
      "..BxBBBBxBBBBxBBBBx..",
      "..BBBBBBBBBBBBBBBBB..",
      "..BBBBBBBBBBBBBBBBB..",
      "..xBBBBxBBBBBxBBBBx..",
      "..BBBBBBBBBBBBBBBBB..",
      "..BBBBBBBBBBBBBBBBB..",
      "..BBBxBBBBxBBBBxBBB..",
    ],
  },
  {
    name: "El final",
    goal: "objetivos",
    balls: 5,
    par: 300,
    rows: [
      ".####...#####...####.",
      ".#oo#...#ooo#...#oo#.",
      ".#BB#...#BBB#...#BB#.",
      ".#BB#.x.#BBB#.x.#BB#.",
      ".#bb#...#bbb#...#bb#.",
      ".#..#...#...#...#..#.",
      ".#..#...#...#...#..#.",
      ".....................",
      "..bbbbbbbbmbbbbbbbb..",
      "..BBBBBBBBBBBBBBBBB..",
      "..bbbbbbblbbbbbbbbv..",
    ],
  },
];

/** A level as the board's cell string (rows padded to the full grid). */
export function levelCells(level: Level): string {
  return level.rows
    .map((r) => r.padEnd(COLS, ".").slice(0, COLS))
    .join("")
    .padEnd(COLS * ROWS, ".");
}

/** Mirrors the left half (cols 0…10) onto the right. */
function mirror(half: string[][]): string[] {
  return half.map((row) => {
    const out = Array<string>(COLS).fill(".");
    for (let c = 0; c <= COLS >> 1; c++) {
      out[c] = row[c] ?? ".";
      out[COLS - 1 - c] = row[c] ?? ".";
    }
    return out.join("");
  });
}

const NAMES = ["Sorpresa", "Al azar", "Mezcladito", "Sin aviso", "Ni idea", "Ruleta", "A ciegas", "Lotería"];

/**
 * A random level: symmetric, harder with `n` (0 = easy). Some ask to clear
 * everything, some to hit targets hidden behind walls and hard bricks.
 */
export function generateLevel(seed: number, n = 4, targetShare = 0.45): Level {
  const rand = mulberry32(seed);
  const d = Math.min(1, n / 12);
  const half = COLS >> 1; // 10: the center column
  const targets = rand() < targetShare;
  // Clearing everything takes long (the last bricks hide): those get a smaller wall.
  const height = targets ? 4 + Math.floor(rand() * 3 + d * 3) : 3 + Math.floor(rand() * 2 + d * 2);
  const top = 1 + Math.floor(rand() * 2);
  const rows: string[][] = Array.from({ length: top + height + 4 }, () => Array<string>(half + 1).fill("."));
  const pattern = Math.floor(rand() * 4);

  const brick = () => {
    const r = rand();
    if (r < 0.025) return "m";
    if (r < 0.045) return "l";
    if (r < 0.055) return "v";
    if (r < 0.085 + d * 0.03) return "x";
    if (r < 0.2 + d * 0.35) return "B";
    return "b";
  };

  for (let r = top; r < top + height; r++) {
    for (let c = targets ? 1 : 2; c <= half; c++) {
      const rr = r - top;
      let on = true;
      if (pattern === 1) on = (rr + c) % 2 === 0 || rr % 3 === 0; // lattice
      else if (pattern === 2) on = Math.abs(c - half) <= rr + 1; // pyramid
      else if (pattern === 3) on = (Math.floor(c / 3) + Math.floor(rr / 2)) % 2 === 0; // blocks
      if (on) rows[r][c] = brick();
    }
  }

  if (targets) {
    // Targets in a pocket at the top: a roof of hard bricks or a wall with a gap under them.
    const k = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < k; i++) {
      const c = 2 + Math.floor(rand() * (half - 2));
      rows[top][c] = "o";
      rows[top + 1][c] = "B";
    }
    if (rand() < 0.4 + d * 0.4) {
      const wall = top + height + 1;
      const gap = 2 + Math.floor(rand() * 4);
      for (let c = 0; c <= half; c++) if (Math.abs(c - (half - gap)) > 1) rows[wall][c] = "#";
    }
  } else if (rand() < d * 0.6) {
    // Two short wall stubs to bounce around.
    const r = top + Math.floor(height / 2);
    rows[r][1] = rows[r][2] = "#";
  }

  return {
    name: NAMES[Math.floor(rand() * NAMES.length)],
    goal: targets ? "objetivos" : "limpiar",
    balls: 3 + (d > 0.5 ? 1 : 0),
    par: 90 + Math.round(d * 60),
    rows: mirror(rows),
  };
}

/**
 * The level a room plays: a campaign one (0…) or one generated from the seed
 * (−1), mostly with targets so a race doesn't end hunting the last brick.
 */
export function roomLevel(level: number, seed: number): Level {
  return level >= 0 && level < CAMPAIGN.length ? CAMPAIGN[level] : generateLevel(seed, 6, 0.7);
}

// ---- The attack's field ----------------------------------------------------

/** A fresh row of the attack: bricks with a few holes and goodies. */
export function attackRow(rand: () => number): string {
  let out = "";
  for (let c = 0; c < COLS; c++) {
    const r = rand();
    out += r < 0.14 ? "." : r < 0.3 ? "B" : r < 0.33 ? "x" : r < 0.35 ? "m" : r < 0.37 ? "l" : "b";
  }
  return out;
}

/** A row sent by a rival: hard bricks with three holes. */
export function garbageRow(rand: () => number): string {
  const row = Array<string>(COLS).fill("B");
  for (let k = 0; k < 3; k++) row[Math.floor(rand() * COLS)] = ".";
  return row.join("");
}

export function attackField(seed: number): string {
  const rand = mulberry32(seed);
  const rows = [".".repeat(COLS)];
  for (let r = 0; r < 8; r++) rows.push(attackRow(rand));
  return rows.join("").padEnd(COLS * ROWS, ".");
}

// ---- The duel's field --------------------------------------------------------

/** Bricks in the middle band, symmetric both ways so neither side has it easier. */
export function duelField(seed: number): string {
  const rand = mulberry32(seed);
  const half = COLS >> 1;
  const mid = ROWS >> 1; // 16
  const grid: string[][] = Array.from({ length: ROWS }, () => Array<string>(COLS).fill("."));
  const band = 4;
  for (let r = mid - band; r <= mid; r++) {
    for (let c = 0; c <= half; c++) {
      const p = rand();
      let ch = p < 0.3 ? "." : p < 0.55 ? "B" : p < 0.6 ? "x" : "b";
      if (r === mid - band + 1 && (c === 2 || c === 3) && rand() < 0.6) ch = "#";
      grid[r][c] = grid[r][COLS - 1 - c] = ch;
      grid[2 * mid - r][c] = grid[2 * mid - r][COLS - 1 - c] = ch;
    }
  }
  return grid.map((r) => r.join("")).join("");
}
