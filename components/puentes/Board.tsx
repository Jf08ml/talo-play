"use client";

import { H, W, crossTarget, degrees, edgeMid, type Play, type Puzzle } from "@/lib/puentes";

/**
 * The map: a river with islands (flat, in the brand's colors), wooden
 * bridges, trees, flags and a talo walking. Bridges you can cross from where
 * you stand are outlined; crossed ones fade and the route is drawn over them.
 */

const S = 100;
/** Half the river's width, in map units. */
const G = 15;
const WATER = "#4FB3E8";
const SAND = "#F2DFA7";
const GREENS = ["#7CC86A", "#8FD16E", "#6CBE60", "#9BD67C", "#76C467", "#88CD6F", "#68B95C"];
const WOOD = "#C98A4B";
const WOOD_DARK = "#93602F";

const cx = (i: number) => i % W;
const cy = (i: number) => Math.floor(i / W);
const center = (i: number) => ({ x: cx(i) * S + S / 2, y: cy(i) * S + S / 2 });

/** A rectangle with its own radius per corner (top-left, top-right, bottom-right, bottom-left). */
function shape(x: number, y: number, w: number, h: number, [a, b, c, d]: number[]): string {
  return `M${x + a} ${y}H${x + w - b}A${b} ${b} 0 0 1 ${x + w} ${y + b}V${y + h - c}A${c} ${c} 0 0 1 ${x + w - c} ${y + h}H${x + d}A${d} ${d} 0 0 1 ${x} ${y + h - d}V${y + a}A${a} ${a} 0 0 1 ${x + a} ${y}Z`;
}

/** One cell of land, pulled back from the edges that face water. */
function landPath(pz: Puzzle, i: number, inset: number, radius: number): string {
  const r = pz.cells[i];
  const same = (j: number, ok: boolean) => ok && pz.cells[j] === r;
  const top = same(i - W, cy(i) > 0) ? 0 : inset;
  const bottom = same(i + W, cy(i) < H - 1) ? 0 : inset;
  const left = same(i - 1, cx(i) > 0) ? 0 : inset;
  const right = same(i + 1, cx(i) < W - 1) ? 0 : inset;
  const round = (p: number, q: number) => (p && q ? radius : 0);
  return shape(cx(i) * S + left, cy(i) * S + top, S - left - right, S - top - bottom, [
    round(top, left),
    round(top, right),
    round(bottom, right),
    round(bottom, left),
  ]);
}

/** The cell of a region closest to its middle (for flags and badges). */
export function regionAnchor(pz: Puzzle, region: number): number {
  const mine = pz.cells.map((r, i) => (r === region ? i : -1)).filter((i) => i >= 0);
  const mx = mine.reduce((s, i) => s + cx(i), 0) / mine.length;
  const my = mine.reduce((s, i) => s + cy(i), 0) / mine.length;
  return mine.reduce((best, i) => (Math.hypot(cx(i) - mx, cy(i) - my) < Math.hypot(cx(best) - mx, cy(best) - my) ? i : best), mine[0]);
}

function bridgeBox(a: number, b: number) {
  const m = edgeMid(a, b);
  const horizontal = cy(a) === cy(b);
  const long = G * 2 + 22;
  const wide = 30;
  return { x: m.x * S, y: m.y * S, w: horizontal ? long : wide, h: horizontal ? wide : long, horizontal };
}

export default function Board({
  pz,
  play,
  onCell,
  onBridge,
  reveal = null,
  className = "",
}: {
  pz: Puzzle;
  play: Play | null;
  onCell?: (cell: number) => void;
  onBridge?: (bridge: number) => void;
  /** After the round: the route that worked, or why it was impossible. */
  reveal?: "solution" | "odd" | null;
  className?: string;
}) {
  const interactive = !!onBridge && !reveal;
  const order: Record<number, number[]> = {};
  if (reveal === "solution") pz.solution.forEach((s, k) => (order[s.bridge] ??= []).push(k + 1));
  const deg = reveal === "odd" ? degrees(pz) : [];

  // The route walked so far: cell → bridge → cell…
  const route: string[] = [];
  if (play && play.cell >= 0 && !reveal) {
    const c0 = center(play.startCell);
    route.push(`M${c0.x} ${c0.y}`);
    for (const step of play.path) {
      const br = pz.bridges[step.bridge];
      const m = edgeMid(br.a, br.b);
      const to = center(step.to);
      route.push(`L${m.x * S} ${m.y * S}L${to.x} ${to.y}`);
    }
  }
  const here = play && play.cell >= 0 ? center(play.cell) : null;
  const starting = interactive && play && play.cell < 0;

  return (
    <svg viewBox={`0 0 ${W * S} ${H * S}`} className={`h-auto w-full select-none rounded-2xl ${className}`} role="img" aria-label="Mapa de islas y puentes">
      <rect width={W * S} height={H * S} fill={WATER} />
      {/* Ripples */}
      {Array.from({ length: 10 }, (_, k) => (
        <path
          key={k}
          d={`M${(k * 137) % (W * S)} ${(k * 251) % (H * S)}q10 -6 20 0t20 0`}
          stroke="#ffffff55"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      ))}

      {pz.cells.map((_, i) => (
        <path key={`s${i}`} d={landPath(pz, i, G - 5, 18)} fill={SAND} />
      ))}
      {pz.cells.map((r, i) => (
        <path key={`l${i}`} d={landPath(pz, i, G + 1, 14)} fill={GREENS[r % GREENS.length]} />
      ))}

      {pz.trees.map((i) => {
        const c = center(i);
        const dx = ((i * 37) % 30) - 15;
        return (
          <g key={`t${i}`} transform={`translate(${c.x + dx} ${c.y - 6})`}>
            <rect x={-4} y={8} width={8} height={14} rx={2} fill="#7A4E26" />
            <circle r={17} fill="#3E9B4F" />
            <circle cx={-6} cy={-5} r={6} fill="#4FB15E" />
          </g>
        );
      })}

      {/* Flags */}
      {pz.start >= 0 && <Flag at={center(regionAnchor(pz, pz.start))} kind="start" />}
      {pz.end >= 0 && <Flag at={center(regionAnchor(pz, pz.end))} kind="end" />}

      {/* Tap a cell to start */}
      {pz.cells.map((r, i) => (
        <rect
          key={`c${i}`}
          x={cx(i) * S}
          y={cy(i) * S}
          width={S}
          height={S}
          fill={starting && (pz.start < 0 || pz.start === r) ? "#ffffff00" : "transparent"}
          className={starting && (pz.start < 0 || pz.start === r) ? "cursor-pointer" : ""}
          onClick={() => onCell?.(i)}
        />
      ))}

      {pz.bridges.map((br, i) => {
        const box = bridgeBox(br.a, br.b);
        const done = play ? play.counts[i] >= br.times : false;
        const half = play ? play.counts[i] > 0 && !done : false;
        const can = interactive && play ? crossTarget(pz, play, i) >= 0 : false;
        const planks = [];
        const n = 6;
        for (let k = 1; k < n; k++) {
          const t = -0.5 + k / n;
          planks.push(
            box.horizontal ? (
              <line key={k} x1={box.x + t * box.w} y1={box.y - box.h / 2 + 3} x2={box.x + t * box.w} y2={box.y + box.h / 2 - 3} stroke={WOOD_DARK} strokeWidth="2" />
            ) : (
              <line key={k} x1={box.x - box.w / 2 + 3} y1={box.y + t * box.h} x2={box.x + box.w / 2 - 3} y2={box.y + t * box.h} stroke={WOOD_DARK} strokeWidth="2" />
            )
          );
        }
        const to = center(br.b);
        const from = center(br.a);
        const ang = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
        return (
          <g key={`b${i}`} opacity={done && !reveal ? 0.45 : 1}>
            {can && (
              <rect
                x={box.x - box.w / 2 - 6}
                y={box.y - box.h / 2 - 6}
                width={box.w + 12}
                height={box.h + 12}
                rx={10}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="5"
                className="animate-pulse"
              />
            )}
            <rect x={box.x - box.w / 2} y={box.y - box.h / 2} width={box.w} height={box.h} rx={5} fill={done ? "#8B6A4A" : WOOD} stroke={WOOD_DARK} strokeWidth="3" />
            {planks}
            {br.oneWay && (
              <path d="M-9 -8 L9 0 L-9 8 Z" fill="#FFFFFF" stroke={WOOD_DARK} strokeWidth="2" transform={`translate(${box.x} ${box.y}) rotate(${ang})`} />
            )}
            {br.times === 2 && (
              <g transform={`translate(${box.x + (box.horizontal ? 0 : 20)} ${box.y + (box.horizontal ? -22 : 0)})`}>
                <circle r={13} fill={half ? "#FFD400" : "#FFFFFF"} stroke={WOOD_DARK} strokeWidth="2" />
                <text textAnchor="middle" dy="5" fontSize="15" fontWeight="800" fill="#111111">
                  {play ? Math.max(0, br.times - play.counts[i]) : 2}
                </text>
              </g>
            )}
            {order[i] && (
              <g transform={`translate(${box.x} ${box.y})`}>
                <rect x={-17} y={-13} width={34} height={26} rx={13} fill="#111111" />
                <text textAnchor="middle" dy="5" fontSize="15" fontWeight="800" fill="#FFD400">
                  {order[i].join("·")}
                </text>
              </g>
            )}
            {onBridge && !reveal && !starting && (
              <rect
                x={box.x - 36}
                y={box.y - 36}
                width={72}
                height={72}
                fill="transparent"
                className={can ? "cursor-pointer" : ""}
                onClick={(e) => {
                  e.stopPropagation();
                  onBridge(i);
                }}
              />
            )}
          </g>
        );
      })}

      {route.length > 0 && (
        <path d={route.join("")} fill="none" stroke="#FFD400" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 14" pointerEvents="none" />
      )}

      {reveal === "odd" &&
        deg.map((d, r) => {
          const c = center(regionAnchor(pz, r));
          return (
            <g key={`d${r}`} transform={`translate(${c.x} ${c.y})`} pointerEvents="none">
              <circle r={24} fill={d % 2 ? "#FF3B30" : "#FFFFFF"} stroke="#111111" strokeWidth="3" />
              <text textAnchor="middle" dy="7" fontSize="21" fontWeight="800" fill={d % 2 ? "#FFFFFF" : "#111111"}>
                {d}
              </text>
            </g>
          );
        })}

      {here && <Token x={here.x} y={here.y} />}
    </svg>
  );
}

function Token({ x, y }: { x: number; y: number }) {
  return (
    <g style={{ transform: `translate(${x}px, ${y - 4}px)`, transition: "transform 220ms ease-out" }} pointerEvents="none">
      <ellipse cy={22} rx={18} ry={5} fill="#00000033" />
      <circle r={21} fill="#FFD400" stroke="#111111" strokeWidth="3" />
      <circle cx={-7} cy={-4} r={6} fill="#FFFFFF" />
      <circle cx={7} cy={-4} r={6} fill="#FFFFFF" />
      <circle cx={-6} cy={-3} r={3} fill="#111111" />
      <circle cx={8} cy={-3} r={3} fill="#111111" />
    </g>
  );
}

function Flag({ at, kind }: { at: { x: number; y: number }; kind: "start" | "end" }) {
  const x = at.x + 14;
  const y = at.y - 30;
  return (
    <g pointerEvents="none">
      <rect x={x - 2} y={y} width={4} height={42} fill="#111111" />
      {kind === "start" ? (
        <path d={`M${x + 2} ${y}h24l-6 8 6 8h-24z`} fill="#00B26B" stroke="#111111" strokeWidth="2" />
      ) : (
        <g>
          <rect x={x + 2} y={y} width={24} height={16} fill="#FFFFFF" stroke="#111111" strokeWidth="2" />
          {[0, 1, 2].map((k) => (
            <rect key={k} x={x + 2 + k * 8} y={y + (k % 2 ? 8 : 0)} width={8} height={8} fill="#111111" />
          ))}
          <rect x={x + 6} y={y + 8} width={0} height={0} />
        </g>
      )}
    </g>
  );
}
