import { DECORATIONS, FILLINGS, FROSTINGS, SPONGES, type Cake, type Decoration } from "@/lib/bakery";

/**
 * A cake drawn in 2D (side view): the order card's picture and the stand-in
 * for the 3D scene when WebGL isn't available. Same data as the 3D cake, so
 * it shows the same layers, filling, frosting and decorations.
 */

const W = 200;
const H = 170;
const CX = W / 2;
const LAYER = 26;
const FILL = 7;

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

function DecoIcon({ d, x, y, s = 1, i = 0 }: { d: Decoration; x: number; y: number; s?: number; i?: number }) {
  switch (d) {
    case "cerezas":
      return (
        <g transform={`translate(${x} ${y}) scale(${s})`}>
          <path d="M0 -6 q4 -8 8 -10" stroke="#4d7c0f" strokeWidth="1.5" fill="none" />
          <circle cx="0" cy="-2" r="5" fill="#dc2626" />
          <circle cx="-1.5" cy="-3.5" r="1.4" fill="#fecaca" />
        </g>
      );
    case "estrellas":
      return (
        <polygon
          transform={`translate(${x} ${y - 6}) scale(${s})`}
          points="0,-7 2,-2 7,-2 3,1 5,6 0,3 -5,6 -3,1 -7,-2 -2,-2"
          fill="#facc15"
          stroke="#ca8a04"
          strokeWidth="0.8"
        />
      );
    case "flores":
      return (
        <g transform={`translate(${x} ${y - 3}) scale(${s})`}>
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx={Math.cos((a * Math.PI) / 180) * 3.5} cy={Math.sin((a * Math.PI) / 180) * 3.5} r="3" fill={["#f9a8d4", "#c4b5fd", "#99f6e4"][i % 3]} />
          ))}
          <circle r="2" fill="#fde047" />
        </g>
      );
    case "velas":
      return (
        <g transform={`translate(${x} ${y}) scale(${s})`}>
          <rect x="-2" y="-16" width="4" height="16" rx="1" fill={["#7dd3fc", "#f9a8d4", "#fde68a"][i % 3]} />
          <ellipse cx="0" cy="-20" rx="2.4" ry="4" fill="#fb923c" />
          <ellipse cx="0" cy="-19" rx="1.2" ry="2" fill="#fef08a" />
        </g>
      );
    case "chispas":
      return (
        <g transform={`translate(${x} ${y - 2}) scale(${s})`}>
          {[-6, -2, 2, 6].map((dx, k) => (
            <rect
              key={dx}
              x={dx}
              y={(k % 2) * 2 - 1}
              width="3.5"
              height="1.4"
              rx="0.7"
              fill={["#f472b6", "#60a5fa", "#facc15", "#34d399"][k]}
              transform={`rotate(${k * 40} ${dx} 0)`}
            />
          ))}
        </g>
      );
  }
}

export default function CakeArt({ cake, className = "", label }: { cake: Cake; className?: string; label?: string }) {
  const ready = !!cake.shape && !!cake.sponge;
  const round = cake.shape !== "cuadrada";
  const width = round ? 120 : 112;
  const x0 = CX - width / 2;
  const layers = ready ? cake.layers : 0;
  const bottom = 140;
  const height = layers * LAYER + Math.max(0, layers - 1) * FILL;
  const top = bottom - height;
  const sponge = cake.sponge ? SPONGES[cake.sponge].color : "#f6d79a";
  const ry = round ? 10 : 6;
  const frost = cake.frosting ? FROSTINGS[cake.frosting].color : null;

  const parts: React.ReactNode[] = [];
  for (let i = 0; i < layers; i++) {
    const y = bottom - (i + 1) * LAYER - i * FILL;
    parts.push(<rect key={`l${i}`} x={x0} y={y} width={width} height={LAYER} fill={sponge} />);
    if (i < layers - 1 && cake.filling) {
      parts.push(<rect key={`f${i}`} x={x0 - 2} y={y - FILL} width={width + 4} height={FILL} rx="3" fill={FILLINGS[cake.filling].color} />);
    }
  }
  const decos = ready ? cake.decorations : [];
  const spots = (n: number) => Array.from({ length: n }, (_, k) => x0 + 14 + (k * (width - 28)) / Math.max(1, n - 1));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={label ?? "Torta"}>
      <ellipse cx={CX} cy={bottom + 6} rx="88" ry="14" fill="#ede9fe" stroke="#c4b5fd" strokeWidth="2" />
      {!ready && cake.shape && (
        <rect x={x0} y={bottom - LAYER} width={width} height={LAYER} rx="6" fill="#ffffff55" stroke="#a78bfa" strokeDasharray="5 4" strokeWidth="2" />
      )}
      {ready && (
        <>
          <ellipse cx={CX} cy={bottom} rx={width / 2} ry={ry} fill={shade(sponge, 0.8)} />
          {parts}
          <ellipse cx={CX} cy={top} rx={width / 2} ry={ry} fill={frost ?? shade(sponge, 1.08)} />
          {frost && (
            <>
              <path
                d={`M${x0 - 3} ${top} ${Array.from({ length: 9 }, (_, k) => {
                  const x = x0 - 3 + ((k + 0.5) * (width + 6)) / 9;
                  const len = 6 + ((k * 7) % 5) * 3;
                  return `L${x - 5} ${top + 2} Q${x - 5} ${top + len} ${x} ${top + len} Q${x + 5} ${top + len} ${x + 5} ${top + 2}`;
                }).join(" ")} L${x0 + width + 3} ${top} Z`}
                fill={frost}
              />
              <ellipse cx={CX} cy={top - 1} rx={width / 2 + 3} ry={ry + 1} fill={frost} />
              <ellipse cx={CX - 18} cy={top - 3} rx="16" ry="3" fill="#ffffff66" />
            </>
          )}
          {decos.map((d, slot) => {
            const n = d === "velas" ? 3 : d === "chispas" ? 4 : 4;
            const y = top - (slot === 0 ? 0 : 6);
            const xs = slot === 0 ? spots(n) : [CX - 14, CX, CX + 14];
            return xs.map((x, k) => <DecoIcon key={`${d}${k}`} d={d} x={x} y={y} i={k} s={slot === 0 ? 1 : 0.8} />);
          })}
        </>
      )}
    </svg>
  );
}

/** A decoration's small icon, for buttons and the order card. */
export function DecorationIcon({ d, className = "h-8 w-8" }: { d: Decoration; className?: string }) {
  return (
    <svg viewBox="-12 -24 24 28" className={className} aria-hidden="true">
      <DecoIcon d={d} x={0} y={0} s={1.2} />
      <title>{DECORATIONS[d].label}</title>
    </svg>
  );
}
