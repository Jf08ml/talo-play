import type { ReactNode } from "react";
import type { ArtId } from "@/lib/guides";

/**
 * Small diagrams for the instructions (`lib/guides.ts`): one idea each,
 * drawn in a 320×150 box with a caption-like label or two.
 */

const W = 320;
const H = 150;
const TXT = { fontFamily: "system-ui, sans-serif", fontSize: 11, fill: "#cbd5e1" } as const;

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full rounded-xl bg-slate-950/70 ring-1 ring-slate-800">
      {children}
    </svg>
  );
}

const Arrow = ({ d, color = "#fbbf24" }: { d: string; color?: string }) => (
  <>
    <defs>
      <marker id={`ah-${color.slice(1)}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill={color} />
      </marker>
    </defs>
    <path d={d} stroke={color} strokeWidth="2.5" fill="none" markerEnd={`url(#ah-${color.slice(1)})`} strokeLinecap="round" />
  </>
);

const Disc = ({ x, y, fill, r = 11, stroke = "#00000066" }: { x: number; y: number; fill: string; r?: number; stroke?: string }) => (
  <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth="2" />
);

function Parchis() {
  // A strip of track: exit square, a safe square, a barrier and an eat.
  const cells = Array.from({ length: 9 }, (_, i) => 20 + i * 31);
  return (
    <Frame label="Salida, seguro, barrera y comer en el parchís">
      {cells.map((x, i) => (
        <rect key={i} x={x} y="45" width="29" height="34" rx="3" fill={i === 0 ? "#ef4444" : i === 4 ? "#e2e8f0" : "#f8fafc"} stroke="#94a3b8" />
      ))}
      <circle cx={cells[4] + 14.5} cy="62" r="7" fill="none" stroke="#64748b" strokeWidth="2" />
      <Disc x={cells[0] + 14.5} y={62} fill="#ef4444" r={9} stroke="#fff" />
      <Disc x={cells[2] + 9} y={62} fill="#22c55e" r={7} stroke="#fff" />
      <Disc x={cells[2] + 20} y={62} fill="#22c55e" r={7} stroke="#fff" />
      <Disc x={cells[7] + 14.5} y={62} fill="#3b82f6" r={9} stroke="#fff" />
      <Arrow d={`M${cells[5] + 4} 100 Q ${cells[6] + 14} 120 ${cells[7] + 12} 86`} color="#f87171" />
      <text x={cells[0] + 14} y="30" textAnchor="middle" {...TXT}>salida</text>
      <text x={cells[2] + 14} y="30" textAnchor="middle" {...TXT}>barrera</text>
      <text x={cells[4] + 14} y="30" textAnchor="middle" {...TXT}>seguro</text>
      <text x={cells[7] + 14} y="30" textAnchor="middle" {...TXT}>sola: se come</text>
      <text x={cells[6]} y="140" textAnchor="middle" {...TXT} fill="#fca5a5">¡comés y contás 20!</text>
    </Frame>
  );
}

function Ludo() {
  return (
    <Frame label="Las estrellas son seguros en el Ludo">
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={50 + i * 32} y="55" width="30" height="34" rx="3" fill={i === 0 ? "#ef4444" : "#f8fafc"} stroke="#94a3b8" />
      ))}
      <text x={50 + 3 * 32 + 15} y="78" textAnchor="middle" fontSize="16" fill="#64748b">★</text>
      <text x="65" y="40" textAnchor="middle" {...TXT}>sale con 6</text>
      <text x={50 + 3 * 32 + 15} y="40" textAnchor="middle" {...TXT}>seguro</text>
      <text x="160" y="125" textAnchor="middle" {...TXT}>Sin barreras: varias fichas pueden compartir casilla.</text>
    </Frame>
  );
}

function Backgammon() {
  const pts = Array.from({ length: 6 }, (_, i) => i);
  return (
    <Frame label="Dirección del movimiento en el backgammon">
      <rect x="20" y="12" width="280" height="126" rx="6" fill="#5b3a1e" />
      {pts.map((i) => (
        <g key={i}>
          <polygon points={`${30 + i * 22},14 ${50 + i * 22},14 ${40 + i * 22},62`} fill={i % 2 ? "#e7d3a7" : "#9a3412"} />
          <polygon points={`${170 + i * 22},14 ${190 + i * 22},14 ${180 + i * 22},62`} fill={i % 2 ? "#e7d3a7" : "#9a3412"} />
          <polygon points={`${30 + i * 22},136 ${50 + i * 22},136 ${40 + i * 22},88`} fill={i % 2 ? "#9a3412" : "#e7d3a7"} />
          <polygon points={`${170 + i * 22},136 ${190 + i * 22},136 ${180 + i * 22},88`} fill={i % 2 ? "#9a3412" : "#e7d3a7"} />
        </g>
      ))}
      <rect x="160" y="12" width="6" height="126" fill="#3b240f" />
      <rect x="168" y="86" width="130" height="52" fill="none" stroke="#34d399" strokeWidth="2" strokeDasharray="5 3" rx="4" />
      <text x="233" y="82" textAnchor="middle" {...TXT} fill="#6ee7b7">tu casa (1–6)</text>
      <Arrow d="M290 40 L 60 40" />
      <Arrow d="M40 75 Q 25 75 40 105" />
      <Arrow d="M60 112 L 290 112" />
      <text x="295" y="24" textAnchor="end" {...TXT} fontSize="9">24</text>
    </Frame>
  );
}

function Otelo() {
  const row = (cells: string[], y: number, x0: number) =>
    cells.map((c, i) => (
      <g key={i}>
        <rect x={x0 + i * 28} y={y} width="26" height="26" fill="#047857" />
        {c !== "." && <Disc x={x0 + i * 28 + 13} y={y + 13} fill={c === "n" ? "#111827" : "#f8fafc"} r={10} />}
      </g>
    ));
  return (
    <Frame label="Encerrar fichas en el Otelo">
      {row(["n", "b", "b", "."], 50, 20)}
      <Disc x={20 + 3 * 28 + 13} y={63} fill="#111827" r={10} stroke="#fbbf24" />
      <Arrow d="M145 63 L 175 63" />
      {row(["n", "n", "n", "n"], 50, 185)}
      <text x="75" y="105" textAnchor="middle" {...TXT}>ponés una negra…</text>
      <text x="240" y="105" textAnchor="middle" {...TXT}>…y las blancas encerradas</text>
      <text x="240" y="120" textAnchor="middle" {...TXT}>pasan a ser negras</text>
    </Frame>
  );
}

function Damas() {
  const sq = (c: number, r: number) => ({ x: 100 + c * 30, y: 15 + r * 30 });
  return (
    <Frame label="Comer en las damas">
      {Array.from({ length: 16 }, (_, k) => {
        const c = k % 4;
        const r = Math.floor(k / 4);
        const { x, y } = sq(c, r);
        return <rect key={k} x={x} y={y} width="30" height="30" fill={(c + r) % 2 ? "#451a03" : "#fde68a"} opacity={(c + r) % 2 ? 1 : 0.8} />;
      })}
      <Disc x={sq(0, 3).x + 15} y={sq(0, 3).y + 15} fill="#f5efe0" r={11} />
      <Disc x={sq(1, 2).x + 15} y={sq(1, 2).y + 15} fill="#1f2937" r={11} stroke="#64748b" />
      <circle cx={sq(2, 1).x + 15} cy={sq(2, 1).y + 15} r="6" fill="#34d399" />
      <Arrow d={`M${sq(0, 3).x + 22} ${sq(0, 3).y + 8} L ${sq(2, 1).x + 10} ${sq(2, 1).y + 20}`} />
      <text x="232" y="60" {...TXT}>saltás la ficha</text>
      <text x="232" y="75" {...TXT}>rival y la comés</text>
      <text x="232" y="100" {...TXT} fill="#fbbf24">¡obligatorio!</text>
    </Frame>
  );
}

function Ajedrez() {
  const pieces: [string, string][] = [
    ["♚", "una casilla"],
    ["♛", "todo recto y diagonal"],
    ["♜", "todo recto"],
    ["♝", "todo diagonal"],
    ["♞", "en L, salta"],
    ["♟", "avanza, come en diagonal"],
  ];
  return (
    <Frame label="Cómo se mueve cada pieza de ajedrez">
      {pieces.map(([p, t], i) => {
        const x = 18 + (i % 3) * 100;
        const y = 22 + Math.floor(i / 3) * 62;
        return (
          <g key={p}>
            <text x={x + 14} y={y + 26} textAnchor="middle" fontSize="30" fill="#f8fafc" fontFamily='"Segoe UI Symbol", "DejaVu Sans", serif'>
              {p}&#xFE0E;
            </text>
            <text x={x + 34} y={y + 14} {...TXT} fontSize="10">
              {t.split(" ").slice(0, 2).join(" ")}
            </text>
            <text x={x + 34} y={y + 27} {...TXT} fontSize="10">
              {t.split(" ").slice(2).join(" ")}
            </text>
          </g>
        );
      })}
    </Frame>
  );
}

function Truco() {
  // Number and, when it matters, the suit ("todos" = any suit).
  const order: [string, string][] = [
    ["1", "espada"],
    ["1", "basto"],
    ["7", "espada"],
    ["7", "oro"],
    ["3", "todos"],
    ["2", "todos"],
    ["1", "copa, oro"],
    ["12", "todos"],
    ["11", "todos"],
    ["10", "todos"],
    ["7", "copa, basto"],
    ["6", "todos"],
    ["5", "todos"],
    ["4", "todos"],
  ];
  return (
    <Frame label="Orden de las cartas en el truco, de mayor a menor">
      <text x="12" y="20" {...TXT} fill="#fbbf24">de la más alta…</text>
      {order.map(([n, suit], i) => {
        const x = 12 + (i % 7) * 43;
        const y = 32 + Math.floor(i / 7) * 54;
        return (
          <g key={i}>
            <rect x={x} y={y} width="38" height="46" rx="5" fill="#fffbeb" stroke="#d6d3d1" />
            <text x={x + 19} y={y + 24} textAnchor="middle" fontSize="16" fontWeight="800" fill="#1c1917" fontFamily="system-ui, sans-serif">
              {n}
            </text>
            <text x={x + 19} y={y + 38} textAnchor="middle" fontSize="7" fill={suit === "todos" ? "#a8a29e" : "#b45309"} fontFamily="system-ui, sans-serif">
              {suit}
            </text>
          </g>
        );
      })}
      <text x="308" y="146" textAnchor="end" {...TXT}>…a la más baja</text>
    </Frame>
  );
}

function Chinchon() {
  const card = (x: number, n: string, color: string) => (
    <g key={x}>
      <rect x={x} y="40" width="30" height="44" rx="4" fill="#fffbeb" stroke="#d6d3d1" />
      <text x={x + 15} y="68" textAnchor="middle" fontSize="15" fontWeight="800" fill={color} fontFamily="system-ui, sans-serif">
        {n}
      </text>
    </g>
  );
  return (
    <Frame label="Piernas y escaleras en el chinchón">
      {card(20, "7", "#2563eb")}
      {card(54, "7", "#dc2626")}
      {card(88, "7", "#15803d")}
      {card(170, "4", "#2563eb")}
      {card(204, "5", "#2563eb")}
      {card(238, "6", "#2563eb")}
      {card(272, "🃏", "#7c3aed")}
      <text x="70" y="110" textAnchor="middle" {...TXT}>pierna: mismo número</text>
      <text x="235" y="110" textAnchor="middle" {...TXT}>escalera: seguidas, mismo palo</text>
      <text x="235" y="126" textAnchor="middle" {...TXT} fill="#c4b5fd">(el comodín hace de 7)</text>
    </Frame>
  );
}

function Domino() {
  const tile = (x: number, y: number, a: number, b: number, hl = false) => (
    <g>
      <rect x={x} y={y} width="56" height="28" rx="5" fill="#fdfaf2" stroke={hl ? "#34d399" : "#94a3b8"} strokeWidth={hl ? 3 : 1.5} />
      <line x1={x + 28} y1={y + 4} x2={x + 28} y2={y + 24} stroke="#94a3b8" />
      <text x={x + 14} y={y + 19} textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f172a" fontFamily="system-ui">{a}</text>
      <text x={x + 42} y={y + 19} textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f172a" fontFamily="system-ui">{b}</text>
    </g>
  );
  return (
    <Frame label="En el dominó, la ficha tiene que coincidir con una punta">
      {tile(70, 45, 3, 6)}
      {tile(128, 45, 6, 6)}
      {tile(186, 45, 6, 2)}
      {tile(12, 95, 5, 3, true)}
      {tile(250, 95, 2, 4, true)}
      <Arrow d="M40 92 L 70 70" color="#34d399" />
      <Arrow d="M276 92 L 240 70" color="#34d399" />
      <text x="160" y="25" textAnchor="middle" {...TXT}>las puntas de la mesa son 3 y 2</text>
      <text x="160" y="120" textAnchor="middle" {...TXT} fill="#6ee7b7">entran el 5-3 y el 2-4</text>
    </Frame>
  );
}

function Oca() {
  const items: [string, string][] = [
    ["🪿", "a la próxima oca"],
    ["🌉", "puente: al otro"],
    ["🏨", "pierde 1 turno"],
    ["🕳️", "espera rescate"],
    ["🌀", "vuelve a la 30"],
    ["⛓️", "pierde 2 turnos"],
    ["💀", "al principio"],
    ["🌷", "¡meta! (63)"],
  ];
  return (
    <Frame label="Las casillas especiales de la Oca">
      {items.map(([e, t], i) => {
        const x = 12 + (i % 4) * 77;
        const y = 22 + Math.floor(i / 4) * 66;
        return (
          <g key={e}>
            <rect x={x} y={y} width="70" height="56" rx="8" fill="#1e293b" />
            <text x={x + 35} y={y + 26} textAnchor="middle" fontSize="20">{e}</text>
            <text x={x + 35} y={y + 46} textAnchor="middle" {...TXT} fontSize="9">{t}</text>
          </g>
        );
      })}
    </Frame>
  );
}

function Cuatro() {
  const grid = [
    "......",
    "...a..",
    "..ab..",
    ".abb..",
    "abbab.",
  ];
  return (
    <Frame label="Cuatro en línea en diagonal">
      <rect x="85" y="10" width="150" height="128" rx="10" fill="#1d4ed8" />
      {grid.map((row, r) =>
        row.split("").map((c, k) => (
          <circle
            key={`${r}${k}`}
            cx={100 + k * 24}
            cy={26 + r * 24}
            r="9"
            fill={c === "a" ? "#ef4444" : c === "b" ? "#facc15" : "#0b1220"}
            stroke={c === "a" && r + k === 4 ? "#fff" : "none"}
            strokeWidth="2.5"
          />
        ))
      )}
      <text x="250" y="70" {...TXT}>cuatro</text>
      <text x="250" y="85" {...TXT}>seguidas</text>
      <text x="250" y="100" {...TXT}>¡ganan!</text>
    </Frame>
  );
}

function Cajas() {
  const p = (c: number, r: number) => ({ x: 110 + c * 50, y: 25 + r * 50 });
  return (
    <Frame label="Cerrar un cuadrado en puntos y cajas">
      <rect x={p(0, 0).x} y={p(0, 0).y} width="50" height="50" fill="#22d3ee33" />
      <line x1={p(0, 0).x} y1={p(0, 0).y} x2={p(1, 0).x} y2={p(1, 0).y} stroke="#cbd5e1" strokeWidth="4" />
      <line x1={p(0, 0).x} y1={p(0, 0).y} x2={p(0, 1).x} y2={p(0, 1).y} stroke="#cbd5e1" strokeWidth="4" />
      <line x1={p(0, 1).x} y1={p(0, 1).y} x2={p(1, 1).x} y2={p(1, 1).y} stroke="#cbd5e1" strokeWidth="4" />
      <line x1={p(1, 0).x} y1={p(1, 0).y} x2={p(1, 1).x} y2={p(1, 1).y} stroke="#22d3ee" strokeWidth="4" strokeDasharray="6 4" />
      {[0, 1, 2].map((c) => [0, 1, 2].map((r) => <circle key={`${c}${r}`} cx={p(c, r).x} cy={p(c, r).y} r="5" fill="#f8fafc" />))}
      <text x={p(0, 0).x + 25} y={p(0, 0).y + 30} textAnchor="middle" fontSize="16" fill="#22d3ee">A</text>
      <text x="20" y="60" {...TXT}>trazás el</text>
      <text x="20" y="75" {...TXT}>cuarto lado:</text>
      <text x="20" y="90" {...TXT}>es tuyo y</text>
      <text x="20" y="105" {...TXT}>jugás de nuevo</text>
    </Frame>
  );
}

function Naval() {
  return (
    <Frame label="Agua, tocado y hundido">
      {Array.from({ length: 30 }, (_, k) => {
        const c = k % 10;
        const r = Math.floor(k / 10);
        return <rect key={k} x={10 + c * 30} y={20 + r * 30} width="28" height="28" rx="3" fill="#0c4a6e" />;
      })}
      <text x={24} y={39} textAnchor="middle" fontSize="13">💧</text>
      <rect x={130} y={50} width="88" height="28" rx="6" fill="#475569" />
      <text x={144} y={69} textAnchor="middle" fontSize="13">💥</text>
      <text x={174} y={69} textAnchor="middle" fontSize="13">💥</text>
      <text x={24} y={125} textAnchor="middle" {...TXT}>agua</text>
      <text x={174} y={125} textAnchor="middle" {...TXT}>tocado: seguís tirando</text>
    </Frame>
  );
}

function Codigo() {
  const colors = ["#ef4444", "#3b82f6", "#d6d3d1", "#ef4444", "#111827", "#3b82f6", "#d6d3d1", "#ef4444", "#3b82f6", "#d6d3d1"];
  return (
    <Frame label="El mapa del jefe de espías">
      {colors.map((c, i) => (
        <rect key={i} x={20 + (i % 5) * 34} y={30 + Math.floor(i / 5) * 34} width="30" height="30" rx="4" fill={c} stroke="#475569" />
      ))}
      <text x="198" y="40" {...TXT} fill="#fca5a5">rojo / azul: equipos</text>
      <text x="198" y="58" {...TXT}>gris: neutral</text>
      <text x="198" y="76" {...TXT} fill="#94a3b8">negro: ¡la bomba!</text>
      <text x="20" y="120" {...TXT}>Pista del jefe: «Fruta 2» → tocá dos palabras rojas</text>
    </Frame>
  );
}

function Onda() {
  return (
    <Frame label="El dial de En la misma onda">
      <path d="M60 130 A 100 100 0 0 1 260 130" fill="#1e293b" />
      <path d="M160 130 L 205 45 A 100 100 0 0 1 225 58 Z" fill="#22c55e" opacity="0.8" />
      <line x1="160" y1="130" x2="200" y2="48" stroke="#f43f5e" strokeWidth="4" strokeLinecap="round" />
      <circle cx="160" cy="130" r="6" fill="#f43f5e" />
      <text x="50" y="146" {...TXT}>Frío</text>
      <text x="270" y="146" textAnchor="end" {...TXT}>Caliente</text>
      <text x="245" y="40" {...TXT} fill="#86efac">objetivo</text>
      <text x="95" y="60" {...TXT} fill="#fda4af">la aguja</text>
    </Frame>
  );
}

function Palabra() {
  const letters: [string, string][] = [
    ["P", "#16a34a"],
    ["E", "#64748b"],
    ["R", "#ca8a04"],
    ["R", "#64748b"],
    ["O", "#16a34a"],
  ];
  return (
    <Frame label="Los colores de la palabra secreta">
      {letters.map(([l, c], i) => (
        <g key={i}>
          <rect x={60 + i * 42} y="30" width="38" height="38" rx="5" fill={c} />
          <text x={79 + i * 42} y="56" textAnchor="middle" fontSize="18" fontWeight="800" fill="#fff" fontFamily="system-ui">{l}</text>
        </g>
      ))}
      <text x="20" y="98" {...TXT} fill="#86efac">verde: en su lugar</text>
      <text x="150" y="98" {...TXT} fill="#fde047">amarillo: está, en otro lugar</text>
      <text x="20" y="118" {...TXT} fill="#94a3b8">gris: no está</text>
    </Frame>
  );
}

function Generala() {
  const rows: [string, string][] = [
    ["Escalera", "20 · servida 25"],
    ["Full", "30 · servido 35"],
    ["Póker", "40 · servido 45"],
    ["Generala", "50"],
    ["Doble generala", "100"],
  ];
  return (
    <Frame label="Puntos de las jugadas de la generala">
      {rows.map(([n, p], i) => (
        <g key={n}>
          <rect x="30" y={10 + i * 27} width="260" height="24" rx="5" fill={i % 2 ? "#1e293b" : "#0f172a"} />
          <text x="42" y={27 + i * 27} {...TXT} fontWeight="700">{n}</text>
          <text x="278" y={27 + i * 27} textAnchor="end" {...TXT} fill="#fde68a">{p}</text>
        </g>
      ))}
    </Frame>
  );
}

function Lobo() {
  const roles: [string, string, string][] = [
    ["🐺", "Lobos", "eligen víctima"],
    ["🔮", "Vidente", "descubre un rol"],
    ["🩺", "Médico", "protege a uno"],
    ["🧑‍🌾", "Aldeanos", "votan de día"],
  ];
  return (
    <Frame label="Los roles del hombre lobo">
      {roles.map(([e, n, t], i) => (
        <g key={n}>
          <rect x={10 + i * 77} y="18" width="70" height="114" rx="8" fill="#1e1b4b" stroke="#4338ca" />
          <text x={45 + i * 77} y="60" textAnchor="middle" fontSize="26">{e}</text>
          <text x={45 + i * 77} y="88" textAnchor="middle" {...TXT} fontWeight="700">{n}</text>
          <text x={45 + i * 77} y="106" textAnchor="middle" {...TXT} fontSize="9">{t}</text>
        </g>
      ))}
    </Frame>
  );
}

function Sopa() {
  const grid = ["GATOX", "QPERR", "LMSOA", "TROJO", "KCASA"];
  return (
    <Frame label="Marcar una palabra en la sopa de letras">
      {grid.map((row, r) =>
        row.split("").map((l, c) => (
          <text key={`${r}${c}`} x={100 + c * 26} y={30 + r * 26} textAnchor="middle" fontSize="15" fontWeight="700" fill="#e2e8f0" fontFamily="monospace">
            {l}
          </text>
        ))
      )}
      <rect x={88} y={14} width={102} height="22" rx="11" fill="#22d3ee33" stroke="#22d3ee" />
      <circle cx="100" cy="25" r="12" fill="none" stroke="#fbbf24" strokeWidth="2.5" />
      <circle cx="178" cy="25" r="12" fill="none" stroke="#fbbf24" strokeWidth="2.5" />
      <text x="240" y="60" {...TXT}>1. tocá la</text>
      <text x="240" y="75" {...TXT}>primera letra</text>
      <text x="240" y="95" {...TXT}>2. tocá la</text>
      <text x="240" y="110" {...TXT}>última</text>
    </Frame>
  );
}

function Deslizante() {
  const tiles = ["1", "2", "3", "4", "", "6", "7", "5", "8"];
  return (
    <Frame label="Deslizar una ficha hacia el hueco">
      {tiles.map((t, i) => {
        const x = 110 + (i % 3) * 34;
        const y = 22 + Math.floor(i / 3) * 34;
        return t ? (
          <g key={i}>
            <rect x={x} y={y} width="31" height="31" rx="4" fill={t === "5" ? "#7c3aed" : "#4c1d95"} />
            <text x={x + 15.5} y={y + 21} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff" fontFamily="system-ui">{t}</text>
          </g>
        ) : (
          <rect key={i} x={x} y={y} width="31" height="31" rx="4" fill="none" stroke="#475569" strokeDasharray="4 3" />
        );
      })}
      <Arrow d="M159 92 L 159 70" />
      <text x="20" y="60" {...TXT}>tocá una ficha</text>
      <text x="20" y="75" {...TXT}>junto al hueco</text>
      <text x="220" y="65" {...TXT}>y se desliza</text>
    </Frame>
  );
}

function Memotest() {
  return (
    <Frame label="Encontrar pares en el memotest">
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={40 + i * 64} y="30" width="54" height="70" rx="8" fill={i === 0 || i === 2 ? "#e0f2fe" : "#0369a1"} />
      ))}
      <text x="67" y="74" textAnchor="middle" fontSize="28">🐶</text>
      <text x="195" y="74" textAnchor="middle" fontSize="28">🐶</text>
      <text x="160" y="128" textAnchor="middle" {...TXT}>¡pareja! te las quedás</text>
    </Frame>
  );
}

function Triqui() {
  // Infinite mode: X places its fourth mark and its oldest one goes away.
  const cell = (i: number, x0: number) => ({ x: x0 + (i % 3) * 34, y: 22 + Math.floor(i / 3) * 34 });
  const board = (x0: number, marks: [number, "x" | "o", number?][]) => (
    <g>
      {[1, 2].map((k) => (
        <g key={k} stroke="#475569" strokeWidth="3" strokeLinecap="round">
          <line x1={x0 + k * 34} y1={22} x2={x0 + k * 34} y2={124} />
          <line x1={x0} y1={22 + k * 34} x2={x0 + 102} y2={22 + k * 34} />
        </g>
      ))}
      {marks.map(([i, m, opacity = 1]) => {
        const { x, y } = cell(i, x0);
        return m === "x" ? (
          <path key={i} d={`M${x + 9} ${y + 9} L${x + 25} ${y + 25} M${x + 25} ${y + 9} L${x + 9} ${y + 25}`} stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" opacity={opacity} />
        ) : (
          <circle key={i} cx={x + 17} cy={y + 17} r="9" stroke="#fb7185" strokeWidth="4" fill="none" opacity={opacity} />
        );
      })}
    </g>
  );
  return (
    <Frame label="Modo infinito del triqui: la marca más vieja se borra">
      {board(20, [[0, "x", 0.35], [4, "x"], [8, "o"], [2, "o"], [6, "o"], [5, "x"]])}
      <Arrow d="M135 73 L 175 73" />
      {board(190, [[4, "x"], [8, "o"], [2, "o"], [6, "o"], [5, "x"], [3, "x"]])}
      <text x="71" y="140" textAnchor="middle" {...TXT}>la X más vieja titila…</text>
      <text x="241" y="140" textAnchor="middle" {...TXT}>…y se borra al poner otra</text>
    </Frame>
  );
}

const ART: Record<ArtId, () => ReactNode> = {
  parchis: Parchis,
  ludo: Ludo,
  backgammon: Backgammon,
  otelo: Otelo,
  triqui: Triqui,
  damas: Damas,
  ajedrez: Ajedrez,
  truco: Truco,
  chinchon: Chinchon,
  domino: Domino,
  oca: Oca,
  cuatro: Cuatro,
  cajas: Cajas,
  naval: Naval,
  codigo: Codigo,
  onda: Onda,
  palabra: Palabra,
  generala: Generala,
  lobo: Lobo,
  sopa: Sopa,
  deslizante: Deslizante,
  memotest: Memotest,
};

export default function GuideArt({ art }: { art: ArtId }) {
  const Art = ART[art];
  return <Art />;
}
