// Each game's illustration: talos doing that game, drawn flat in SVG on a
// 120×120 canvas with no background (the tile, cover or lobby band behind it
// is the game's shelf color). Used as the catalog thumbnail, the featured
// cover and the lobby's band, so a game reads the same everywhere.

import type { CSSProperties, ReactNode } from "react";
import type { GameId } from "@/lib/games";

const INK = "#111111";
const W = "#FFFFFF";
const Y = "#FFD400";
const PINK = "#FF5FA2";
const OR = "#FF7A1A";
const BL = "#2D5BFF";
const GR = "#00B26B";

type Expr = "normal" | "contento" | "sospechoso" | "sorprendido";
type Radii = number | [number, number, number, number]; // top-left, top-right, bottom-right, bottom-left

/** A rounded rectangle with its own radius per corner. */
function shape(x: number, y: number, w: number, h: number, r: Radii): string {
  const [a, b, c, d] = (typeof r === "number" ? [r, r, r, r] : r).map((v) => Math.min(v, w / 2, h / 2));
  return `M${x + a} ${y}H${x + w - b}A${b} ${b} 0 0 1 ${x + w} ${y + b}V${y + h - c}A${c} ${c} 0 0 1 ${x + w - c} ${y + h}H${x + d}A${d} ${d} 0 0 1 ${x} ${y + h - d}V${y + a}A${a} ${a} 0 0 1 ${x + a} ${y}Z`;
}

/** Two talo eyes centered on `cx` (sizes as in components/Talo.tsx). */
function Eyes({ cx, cy, e, look = [0, 0], expr = "normal", body, dark }: { cx: number; cy: number; e: number; look?: [number, number]; expr?: Expr; body: string; dark?: boolean }) {
  const r = e / 2;
  const gap = Math.max(1.5, e * 0.24);
  const stroke = dark ? W : INK;
  const xs = [cx - gap / 2 - r, cx + gap / 2 + r];
  if (expr === "contento") {
    return (
      <g fill="none" stroke={stroke} strokeWidth={e * 0.2} strokeLinecap="round">
        {xs.map((x) => (
          <path key={x} d={`M${x - r * 0.8} ${cy + r * 0.2}A${r * 0.8} ${r * 0.8} 0 0 1 ${x + r * 0.8} ${cy + r * 0.2}`} />
        ))}
        <path d={`M${cx - r} ${cy + e * 0.9}A${r} ${r * 0.8} 0 0 0 ${cx + r} ${cy + e * 0.9}`} />
      </g>
    );
  }
  const wow = expr === "sorprendido";
  const p = e * (wow ? 0.16 : 0.23);
  const max = r - p - 0.6;
  const [lx, ly] = wow ? [0, 0] : look;
  return (
    <g className="talo-eyes-svg">
      {xs.map((x) => (
        <g key={x}>
          <circle cx={x} cy={cy} r={r} fill={W} />
          <circle cx={x + lx * max} cy={cy + ly * max} r={p} fill={INK} />
          {expr === "sospechoso" && <path d={`M${x - r - 1} ${cy + r * 0.05}A${r + 1} ${r + 1} 0 0 1 ${x + r + 1} ${cy + r * 0.05}Z`} fill={body} />}
        </g>
      ))}
      {wow && <ellipse cx={cx} cy={cy + e * 1.05} rx={e * 0.22} ry={e * 0.28} fill={stroke} />}
    </g>
  );
}

/** A talo: a flat body with eyes near its top. */
function T({ x, y, w, h, r, c, look, expr, eyesAt }: { x: number; y: number; w: number; h: number; r: Radii; c: string; look?: [number, number]; expr?: Expr; eyesAt?: number }) {
  const e = Math.min(w, h * 1.1) * 0.26;
  const cy = y + (eyesAt ?? Math.min(w, h) * 0.24 + e / 2);
  return (
    <g>
      <path d={shape(x, y, w, h, r)} fill={c} />
      <Eyes cx={x + w / 2} cy={cy} e={e} look={look} expr={expr} body={c} dark={c === INK} />
    </g>
  );
}

/** A playing card (or any card), optionally turned around its center. */
function Card({ x, y, w, h, c = W, rot = 0, children }: { x: number; y: number; w: number; h: number; c?: string; rot?: number; children?: ReactNode }) {
  return (
    <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
      <rect x={x} y={y} width={w} height={h} rx={Math.min(w, h) * 0.14} fill={c} />
      {children}
    </g>
  );
}

const pips = (cx: number, cy: number, s: number, list: [number, number][], fill = INK) =>
  list.map(([dx, dy], i) => <circle key={i} cx={cx + dx * s} cy={cy + dy * s} r={s * 0.36} fill={fill} />);

const SCENES: Record<GameId, ReactNode> = {
  // ── Para la previa ──
  impostor: (
    <>
      <T x={4} y={78} w={32} h={42} r={[16, 16, 6, 6]} c={W} look={[1, 0]} />
      <T x={84} y={78} w={32} h={42} r={[16, 16, 6, 6]} c={W} look={[-1, 0]} />
      <T x={42} y={60} w={36} h={60} r={[18, 18, 6, 6]} c={INK} expr="sospechoso" look={[0.6, 0]} />
      <text x={60} y={50} textAnchor="middle" fontSize={30} fontWeight={900} fill={INK}>?</text>
    </>
  ),
  probable: (
    <>
      <T x={2} y={80} w={36} h={36} r={18} c={W} look={[1, -0.4]} />
      <T x={82} y={80} w={36} h={36} r={18} c={Y} look={[-1, -0.4]} />
      <T x={40} y={52} w={40} h={68} r={[20, 20, 6, 6]} c={BL} expr="sorprendido" />
      <path d="M60 14l4 9 10 1-7.5 6.5 2.3 9.7L60 35l-8.8 5.2 2.3-9.7L46 24l10-1z" fill={Y} />
    </>
  ),
  yonunca: (
    <>
      <rect x={78} y={30} width={11} height={40} rx={5.5} fill={W} transform="rotate(14 83 70)" />
      <circle cx={89} cy={30} r={9} fill={W} />
      <T x={30} y={56} w={50} h={64} r={[25, 25, 8, 8]} c={W} expr="contento" />
      <T x={4} y={92} w={26} h={28} r={13} c={INK} look={[1, -0.6]} />
    </>
  ),
  onda: (
    <>
      <path d="M14 74A46 46 0 0 1 106 74Z" fill={W} />
      <path d="M60 74L74 31A46 46 0 0 1 88 39Z" fill={OR} />
      <path d="M60 74L80 34A46 46 0 0 1 84 36.5Z" fill={BL} />
      <line x1={60} y1={74} x2={30} y2={40} stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <circle cx={60} cy={74} r={6} fill={INK} />
      <T x={34} y={88} w={52} h={40} r={[26, 26, 6, 6]} c={Y} look={[0, -1]} />
    </>
  ),
  telefono: (
    <>
      <path d="M44 76Q60 100 76 76" fill="none" stroke={INK} strokeWidth={2.5} strokeDasharray="4 3" />
      <T x={2} y={70} w={36} h={50} r={[18, 18, 6, 6]} c={W} look={[1, 0]} />
      <T x={82} y={70} w={36} h={50} r={[18, 18, 6, 6]} c={INK} look={[-1, 0]} />
      <rect x={36} y={68} width={10} height={14} rx={2} fill={Y} />
      <rect x={74} y={68} width={10} height={14} rx={2} fill={Y} />
    </>
  ),
  reto: (
    <>
      <path d="M60 6C78 28 92 40 90 64C88 86 74 98 60 98C46 98 30 88 30 68C30 54 40 46 44 32C50 42 54 46 56 50C58 36 56 24 60 6Z" fill={OR} />
      <path d="M60 46C68 56 76 64 74 76C72 86 66 92 60 92C52 92 46 86 46 78C46 70 52 66 54 58C56 62 58 64 59 66C60 58 59 52 60 46Z" fill={Y} />
      <T x={30} y={84} w={60} h={36} r={[30, 30, 6, 6]} c={INK} expr="contento" />
    </>
  ),
  conoces: (
    <>
      <T x={4} y={62} w={42} h={58} r={[21, 21, 6, 6]} c={BL} look={[1, -0.3]} />
      <T x={74} y={72} w={42} h={48} r={[21, 21, 6, 6]} c={Y} look={[-1, -0.3]} />
      <path d="M60 58C52 50 44 46 44 38C44 32 49 28 54 28C57 28 59 30 60 32C61 30 63 28 66 28C71 28 76 32 76 38C76 46 68 50 60 58Z" fill={W} />
    </>
  ),
  verdades: (
    <>
      <Card x={10} y={10} w={28} h={34} rot={-8} />
      <Card x={46} y={6} w={28} h={34} />
      <Card x={82} y={10} w={28} h={34} c={INK} rot={8} />
      <path d="M17 27l5 5 9-10" fill="none" stroke={GR} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M53 23l5 5 9-10" fill="none" stroke={GR} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M90 21l12 12M102 21l-12 12" stroke={OR} strokeWidth={4} strokeLinecap="round" />
      <T x={28} y={70} w={64} h={50} r={[32, 32, 8, 8]} c={Y} look={[0.8, -1]} />
    </>
  ),
  mimica: (
    <>
      <rect x={24} y={30} width={11} height={42} rx={5.5} fill={W} transform="rotate(-24 30 72)" />
      <rect x={85} y={30} width={11} height={42} rx={5.5} fill={W} transform="rotate(24 90 72)" />
      <T x={34} y={52} w={52} h={68} r={[26, 26, 8, 8]} c={W} expr="contento" />
      <path d="M10 46q-6 8 0 16M110 46q6 8 0 16" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
    </>
  ),
  lobo: (
    <>
      <circle cx={94} cy={24} r={15} fill={W} />
      <path d="M30 66l6-18 10 14zM74 66l6-18 4 18z" fill={INK} />
      <T x={26} y={58} w={60} h={62} r={[30, 30, 8, 8]} c={INK} expr="sospechoso" look={[0.7, 0.2]} />
      <T x={92} y={92} w={24} h={28} r={[12, 12, 4, 4]} c={W} expr="sorprendido" />
    </>
  ),

  // ── Preguntas y palabras ──
  trivia: (
    <>
      <rect x={60} y={8} width={52} height={42} rx={12} fill={W} />
      <path d="M68 46l-6 14 16-12z" fill={W} />
      <text x={86} y={41} textAnchor="middle" fontSize={32} fontWeight={900} fill={INK}>?</text>
      <T x={8} y={56} w={50} h={64} r={[25, 25, 8, 8]} c={BL} look={[1, -0.8]} />
    </>
  ),
  emojis: (
    <>
      <rect x={10} y={10} width={100} height={42} rx={14} fill={W} />
      {[34, 60, 86].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={31} r={11} fill={Y} />
          <circle cx={cx - 4} cy={28} r={1.8} fill={INK} />
          <circle cx={cx + 4} cy={28} r={1.8} fill={INK} />
          <path d={`M${cx - 5} 34q5 5 10 0`} fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        </g>
      ))}
      <T x={32} y={74} w={56} h={46} r={[28, 28, 8, 8]} c={INK} look={[0, -1]} />
    </>
  ),
  palabra: (
    <>
      {[GR, Y, W, GR, W].map((c, i) => (
        <rect key={i} x={6 + i * 22.4} y={14} width={19} height={19} rx={4} fill={c} />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={6 + i * 22.4} y={37} width={19} height={19} rx={4} fill={INK} opacity={0.18} />
      ))}
      <T x={34} y={76} w={52} h={44} r={[26, 26, 8, 8]} c={W} look={[0, -1]} />
    </>
  ),
  sopa: (
    <>
      {Array.from({ length: 16 }, (_, i) => (
        <rect key={i} x={14 + (i % 4) * 21} y={6 + Math.floor(i / 4) * 21} width={18} height={18} rx={3} fill={W} />
      ))}
      <rect x={12} y={46} width={86} height={22} rx={11} fill="none" stroke={INK} strokeWidth={3.5} />
      <T x={84} y={86} w={32} h={34} r={[16, 16, 5, 5]} c={BL} look={[-1, -0.8]} />
    </>
  ),
  ahorcado: (
    <>
      {[14, 47, 80].map((x) => (
        <line key={x} x1={x} y1={44} x2={x + 26} y2={44} stroke={W} strokeWidth={5} strokeLinecap="round" />
      ))}
      <text x={27} y={36} textAnchor="middle" fontSize={26} fontWeight={900} fill={INK}>A</text>
      <text x={93} y={36} textAnchor="middle" fontSize={26} fontWeight={900} fill={INK}>O</text>
      <T x={36} y={66} w={48} h={54} r={[24, 24, 8, 8]} c={W} expr="sorprendido" />
    </>
  ),
  tutti: (
    <>
      <Card x={14} y={8} w={62} h={80} rot={-6}>
        {[24, 38, 52, 66].map((y) => (
          <rect key={y} x={22} y={y} width={46} height={4} rx={2} fill={INK} opacity={0.2} />
        ))}
      </Card>
      <g transform="rotate(35 86 40)">
        <rect x={80} y={14} width={12} height={50} rx={3} fill={Y} />
        <path d="M80 64h12l-6 12z" fill={INK} />
      </g>
      <T x={64} y={84} w={50} h={36} r={[25, 25, 6, 6]} c={INK} look={[-0.8, -0.8]} />
    </>
  ),
  dibujo: (
    <>
      <rect x={10} y={8} width={80} height={60} rx={8} fill={W} />
      <path d="M26 52V36l14-12 14 12v16zM62 24a8 8 0 1 0 0.1 0" fill="none" stroke={BL} strokeWidth={4} strokeLinejoin="round" />
      <line x1={58} y1={78} x2={80} y2={58} stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <T x={62} y={70} w={50} h={50} r={25} c={GR} expr="contento" />
    </>
  ),
  codigo: (
    <>
      {[W, BL, W, PINK, INK, BL, W, PINK, W].map((c, i) => (
        <rect key={i} x={24 + (i % 3) * 25} y={4 + Math.floor(i / 3) * 21} width={22} height={18} rx={4} fill={c} />
      ))}
      <T x={30} y={78} w={60} h={42} r={[30, 30, 8, 8]} c={INK} expr="sospechoso" look={[0, -0.2]} />
    </>
  ),

  // ── Acción y 3D ──
  vibora: (
    <>
      {[[18, 96], [28, 84], [40, 76], [54, 74], [66, 66], [74, 54]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={9 + i * 0.6} fill={GR} />
      ))}
      <T x={68} y={20} w={34} h={34} r={17} c={GR} look={[0.8, -0.4]} />
      {[[100, 70, Y], [24, 30, PINK], [102, 104, W], [46, 22, Y]].map(([cx, cy, c], i) => (
        <circle key={i} cx={cx as number} cy={cy as number} r={4} fill={c as string} />
      ))}
    </>
  ),
  tronco: (
    <>
      {/* A ring of talos; the log sweeps at one of them, who's in the air. */}
      <ellipse cx={60} cy={78} rx={52} ry={26} fill={W} opacity={0.35} />
      <g transform="rotate(-18 60 78)">
        <rect x={56} y={72} width={58} height={12} rx={6} fill={OR} stroke={INK} strokeWidth={3} />
        <circle cx={113} cy={78} r={5} fill={Y} stroke={INK} strokeWidth={2} />
      </g>
      <circle cx={60} cy={78} r={9} fill={INK} />
      <T x={8} y={56} w={22} h={24} r={11} c={PINK} look={[1, 0.2]} />
      <T x={46} y={88} w={24} h={26} r={12} c={GR} look={[0, -1]} />
      <T x={40} y={30} w={22} h={24} r={11} c={W} look={[0.4, 1]} />
      <T x={92} y={26} w={26} h={28} r={13} c={Y} look={[-0.4, 1]} expr="sorprendido" />
    </>
  ),
  ladrillazo: (
    <>
      {[Y, PINK, OR, W].map((c, i) => (
        <rect key={i} x={6 + i * 28} y={8} width={24} height={13} rx={3} fill={c} />
      ))}
      {[W, null, Y, PINK].map((c, i) => (c ? <rect key={i} x={6 + i * 28} y={25} width={24} height={13} rx={3} fill={c} /> : null))}
      {[[38, 44, 4], [48, 48, 3], [42, 53, 3]].map(([x, y, s], i) => (
        <rect key={i} x={x} y={y} width={s} height={s} fill={OR} />
      ))}
      <circle cx={64} cy={62} r={6} fill={W} />
      <T x={28} y={86} w={64} h={26} r={13} c={Y} look={[0.2, -1]} />
    </>
  ),
  fuego: (
    <>
      <path d={shape(30, 38, 56, 82, [28, 28, 8, 8])} fill={INK} />
      <rect x={36} y={56} width={44} height={16} rx={8} fill={Y} />
      <rect x={58} y={60} width={16} height={8} rx={4} fill={W} opacity={0.6} />
      <g stroke={W} strokeWidth={3} strokeLinecap="round" fill="none">
        <circle cx={98} cy={26} r={12} />
        <path d="M98 8v8M98 36v8M80 26h8M108 26h8" />
      </g>
    </>
  ),
  arena: (
    <>
      <g transform="rotate(20 92 70)">
        <rect x={88} y={10} width={9} height={62} rx={2} fill={W} />
        <rect x={80} y={68} width={25} height={6} rx={3} fill={INK} />
        <rect x={89} y={74} width={7} height={14} rx={2} fill={INK} />
      </g>
      <path d={shape(30, 46, 52, 74, [26, 26, 8, 8])} fill={OR} />
      <path d="M30 72V70a26 26 0 0 1 52 0v2z" fill={INK} />
      <Eyes cx={56} cy={84} e={13} body={OR} look={[0.6, 0]} />
      <circle cx={28} cy={96} r={18} fill={Y} />
      <circle cx={28} cy={96} r={7} fill={INK} />
    </>
  ),
  carreras3d: (
    <>
      <path d="M6 40h20M2 54h18M8 68h14" stroke={W} strokeWidth={4} strokeLinecap="round" />
      <path d={shape(36, 36, 52, 34, [22, 22, 0, 0])} fill={PINK} />
      <rect x={26} y={62} width={86} height={32} rx={12} fill={PINK} />
      <Eyes cx={62} cy={52} e={14} body={PINK} look={[1, 0]} />
      <circle cx={46} cy={96} r={11} fill={INK} />
      <circle cx={94} cy={96} r={11} fill={INK} />
      <rect x={100} y={70} width={10} height={7} rx={2} fill={Y} />
    </>
  ),
  carreras: (
    <>
      <rect x={12} y={10} width={96} height={68} rx={34} fill="none" stroke={W} strokeWidth={14} />
      <rect x={12} y={10} width={96} height={68} rx={34} fill="none" stroke={INK} strokeWidth={1.5} strokeDasharray="6 6" />
      <rect x={66} y={4} width={22} height={13} rx={4} fill={Y} />
      <rect x={30} y={70} width={22} height={13} rx={4} fill={PINK} />
      <T x={40} y={92} w={40} h={30} r={[20, 20, 6, 6]} c={OR} look={[0, -1]} />
    </>
  ),
  pasteleria: (
    <>
      <rect x={57} y={18} width={6} height={22} rx={2} fill={W} />
      <path d="M60 6c5 6 5 10 0 12c-5-2-5-6 0-12z" fill={OR} />
      <path d={shape(20, 40, 80, 80, [14, 14, 6, 6])} fill={PINK} />
      <path d="M20 54V52a12 12 0 0 1 12-12h56a12 12 0 0 1 12 12v2c-6 0-6 8-12 8s-6-8-12-8-6 10-12 10-6-10-12-10-6 8-12 8-6-8-10-8z" fill={W} />
      <rect x={20} y={92} width={80} height={6} fill={W} opacity={0.8} />
      <Eyes cx={60} cy={76} e={18} body={PINK} expr="contento" />
    </>
  ),

  // ── Juegos de mesa ──
  cuatro: (
    <>
      <rect x={10} y={40} width={100} height={80} rx={10} fill={BL} />
      {Array.from({ length: 12 }, (_, i) => {
        const filled = [INK, INK, INK, Y, INK, INK, Y, PINK, INK, Y, PINK, PINK][i];
        return <circle key={i} cx={24 + (i % 4) * 24} cy={56 + Math.floor(i / 4) * 22} r={8.5} fill={filled === INK ? "#0b2a9e" : filled} />;
      })}
      <T x={48} y={4} w={26} h={26} r={13} c={Y} look={[0, 1]} />
    </>
  ),
  triqui: (
    <>
      <path d="M44 10v100M76 10v100M10 44h100M10 76h100" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <path d="M17 17l20 20M37 17l-20 20M83 83l20 20M103 83l-20 20" stroke={W} strokeWidth={6} strokeLinecap="round" />
      <T x={47} y={47} w={26} h={26} r={13} c={Y} look={[-0.7, -0.7]} />
    </>
  ),
  cajas: (
    <>
      <path d={shape(36, 36, 26, 26, 3)} fill={Y} />
      <Eyes cx={49} cy={46} e={7} body={Y} look={[0.5, 0.3]} />
      <path d="M36 36h26v26H36zM62 36h26M10 62h26M88 62v26" fill="none" stroke={W} strokeWidth={4} strokeLinecap="round" />
      {Array.from({ length: 16 }, (_, i) => (
        <circle key={i} cx={10 + (i % 4) * 26 + 0} cy={10 + Math.floor(i / 4) * 26} r={4} fill={INK} />
      ))}
    </>
  ),
  naval: (
    <>
      <circle cx={96} cy={26} r={6} fill={W} />
      <circle cx={84} cy={18} r={4} fill={W} />
      <path d={shape(14, 52, 92, 60, [46, 46, 0, 0])} fill={OR} />
      <Eyes cx={60} cy={74} e={16} body={OR} look={[0.8, -0.6]} />
      <path d="M0 98q10-8 20 0t20 0 20 0 20 0 20 0 20 0V120H0z" fill={W} />
    </>
  ),
  damas: (
    <>
      {Array.from({ length: 16 }, (_, i) => {
        const x = i % 4;
        const y = Math.floor(i / 4);
        return <rect key={i} x={12 + x * 24} y={12 + y * 24} width={24} height={24} fill={(x + y) % 2 ? INK : W} />;
      })}
      <T x={39} y={41} w={18} h={18} r={9} c={PINK} look={[1, 0]} />
      <T x={63} y={65} w={18} h={18} r={9} c={Y} look={[-1, -1]} />
    </>
  ),
  ajedrez: (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={i * 15} y={104} width={15} height={16} fill={i % 2 ? INK : W} />
      ))}
      <path d="M44 34l-2-16 9 8 9-12 9 12 9-8-2 16z" fill={Y} />
      <T x={40} y={36} w={40} h={68} r={[20, 20, 4, 4]} c={W} look={[0, -0.2]} />
    </>
  ),
  ludo: (
    <>
      <Card x={78} y={6} w={34} h={34} rot={14}>
        {pips(95, 23, 7, [[-1, -1], [1, 1], [0, 0]])}
      </Card>
      {[PINK, Y, BL, W].map((c, i) => (
        <T key={c} x={4 + i * 29} y={74 - (i % 2) * 8} w={24} h={46 + (i % 2) * 8} r={[12, 12, 4, 4]} c={c} look={[0.5, -0.5]} />
      ))}
    </>
  ),
  backgammon: (
    <>
      {Array.from({ length: 6 }, (_, i) => (
        <g key={i}>
          <path d={`M${4 + i * 19} 0h18l-9 46z`} fill={i % 2 ? INK : W} />
          <path d={`M${4 + i * 19} 120h18l-9-46z`} fill={i % 2 ? W : INK} />
        </g>
      ))}
      <T x={30} y={48} w={24} h={24} r={12} c={Y} look={[1, 0]} />
      <T x={64} y={48} w={24} h={24} r={12} c={PINK} look={[-1, 0]} />
    </>
  ),
  otelo: (
    <>
      <circle cx={40} cy={40} r={18} fill={INK} />
      <circle cx={80} cy={80} r={18} fill={INK} />
      <circle cx={40} cy={80} r={18} fill={W} />
      <T x={62} y={22} w={36} h={36} r={18} c={W} look={[-0.7, 0.7]} />
    </>
  ),
  oca: (
    <>
      <path d="M8 112V12h104v88H28V32h64v48H48V52h24" fill="none" stroke={W} strokeWidth={9} strokeLinejoin="round" opacity={0.85} />
      <path d="M88 64l18 6-18 6z" fill={OR} />
      <T x={52} y={50} w={38} h={40} r={[19, 19, 8, 8]} c={W} look={[1, 0]} />
    </>
  ),

  // ── Cartas y dados ──
  truco: (
    <>
      <Card x={14} y={34} w={50} h={74} rot={-10}>
        <path d="M39 58l4 30h-8z" fill={BL} />
        <rect x={30} y={84} width={18} height={4} rx={2} fill={BL} />
      </Card>
      <g transform="rotate(10 82 72)">
        <path d={shape(56, 30, 52, 78, 7)} fill={Y} />
        <Eyes cx={82} cy={52} e={14} body={Y} look={[-1, -0.4]} />
        {/* A copa, the suit. */}
        <path d="M73 76h18a9 9 0 0 1-18 0zM80 84h4v8h5v4H75v-4h5z" fill={OR} />
      </g>
    </>
  ),
  chinchon: (
    <>
      {/* The fan's middle card (the talo) goes on top. */}
      {[-20, 20, 0].map((rot) => (
        <g key={rot} transform={`rotate(${rot} 60 130)`}>
          <rect x={38} y={30} width={44} height={66} rx={7} fill={rot === 0 ? Y : W} />
          {rot === 0 ? (
            <Eyes cx={60} cy={50} e={12} body={Y} look={[0, -0.4]} />
          ) : (
            <circle cx={60} cy={58} r={7} fill={rot > 0 ? OR : GR} />
          )}
        </g>
      ))}
    </>
  ),
  generala: (
    <>
      <Card x={10} y={40} w={46} h={46} rot={-12}>
        {pips(33, 63, 9, [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]])}
      </Card>
      <Card x={62} y={54} w={46} h={46} c={Y} rot={10}>
        <Eyes cx={85} cy={72} e={13} body={Y} look={[-0.6, -0.3]} />
      </Card>
    </>
  ),
  domino: (
    <>
      <g transform="rotate(-14 60 64)">
        <rect x={34} y={8} width={52} height={104} rx={10} fill={W} />
        <rect x={40} y={58} width={40} height={4} rx={2} fill={INK} />
        <Eyes cx={60} cy={34} e={14} body={W} look={[0.4, -0.4]} />
        {pips(60, 86, 9, [[-1, -1], [0, 0], [1, 1]])}
      </g>
    </>
  ),

  // ── Puzzles y memoria ──
  memotest: (
    <>
      <Card x={12} y={12} w={42} h={46} c={INK} />
      <Card x={66} y={62} w={42} h={46} c={INK} />
      <Card x={66} y={12} w={42} h={46}>
        <T x={75} y={22} w={24} h={24} r={12} c={PINK} look={[-0.6, 0.6]} />
      </Card>
      <Card x={12} y={62} w={42} h={46}>
        <T x={21} y={72} w={24} h={24} r={12} c={PINK} look={[0.6, -0.6]} />
      </Card>
    </>
  ),
  rompecabezas: (
    <>
      <path d="M12 34h22a8 8 0 1 1 16 0h22v26a8 8 0 1 0 0 16v26H12z" fill={W} />
      <path d={shape(76, 40, 36, 36, 4)} fill={BL} />
      <circle cx={76} cy={68} r={8} fill={BL} />
      <Eyes cx={42} cy={64} e={14} body={W} look={[1, 0]} />
      <Eyes cx={96} cy={54} e={9} body={BL} look={[-1, 0.3]} />
    </>
  ),
  puentes: (
    <>
      {/* A river across, two wooden bridges, and a talo halfway over one. */}
      <path d="M0 44C28 34 50 58 76 48S108 34 120 40V70C104 64 88 80 62 78S22 64 0 74Z" fill={BL} />
      <path d="M8 52q8-5 16 0M70 62q8-5 16 0" fill="none" stroke={W} strokeWidth={3} strokeLinecap="round" />
      {[
        [22, 32],
        [84, 28],
      ].map(([x, y], k) => (
        <g key={k}>
          <rect x={x} y={y} width={22} height={54} rx={4} fill={OR} stroke={INK} strokeWidth={3} />
          {[10, 20, 30, 40].map((d) => (
            <line key={d} x1={x + 3} y1={y + 2 + d} x2={x + 19} y2={y + 2 + d} stroke={INK} strokeWidth={2} />
          ))}
        </g>
      ))}
      <T x={78} y={44} w={34} h={30} r={15} c={PINK} look={[-0.6, -0.6]} />
      <path d="M24 112V90M24 90l16 5-16 5" fill={GR} stroke={INK} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
    </>
  ),
  deslizante: (
    <>
      {Array.from({ length: 9 }, (_, i) =>
        i === 8 ? null : (
          <rect key={i} x={8 + (i % 3) * 36} y={8 + Math.floor(i / 3) * 36} width={32} height={32} rx={6} fill={i === 4 ? GR : W} />
        )
      )}
      <Eyes cx={60} cy={58} e={10} body={GR} look={[1, 1]} />
      <path d="M84 96h16M94 90l6 6-6 6" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

/** A game's illustration, filling its box (keep the box square-ish). */
export default function GameArt({ game, className = "" }: { game: GameId; className?: string }) {
  // Each game blinks at its own moment, so a shelf of them doesn't blink in unison.
  const delay = `${[...game].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 60 / 10}s`;
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      aria-hidden="true"
      fontFamily="var(--font-ui), sans-serif"
      style={{ "--blink-delay": delay } as CSSProperties}
    >
      {SCENES[game]}
    </svg>
  );
}
