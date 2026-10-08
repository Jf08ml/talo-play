// Small inline SVG "cover art" pieces for the games hub — no external image
// assets, drawn in the same violet/cyan/fuchsia neon palette as the rest of
// the app so a game's card reads as part of the same family before you ever
// open it.

export function PuzzleThumbnail() {
  return (
    <svg viewBox="0 0 400 240" className="h-full w-full">
      <defs>
        <radialGradient id="puzzle-bg" cx="30%" cy="20%" r="90%">
          <stop offset="0%" stopColor="#2e1065" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
        <filter id="puzzle-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="400" height="240" fill="url(#puzzle-bg)" />

      <g filter="url(#puzzle-glow)" opacity="0.95">
        <g transform="translate(150 60) rotate(-8)">
          <rect width="90" height="90" rx="14" fill="#a855f7" />
          <circle cx="90" cy="45" r="16" fill="#a855f7" />
        </g>
        <g transform="translate(230 90) rotate(6)">
          <rect width="90" height="90" rx="14" fill="#22d3ee" />
          <circle cx="0" cy="45" r="16" fill="#0b0a14" />
        </g>
        <g transform="translate(170 145) rotate(-4)">
          <rect width="90" height="90" rx="14" fill="#e879f9" />
          <circle cx="45" cy="0" r="16" fill="#0b0a14" />
        </g>
      </g>
    </svg>
  );
}

export function MemotestThumbnail() {
  const cards = [
    { x: 92, y: 52, r: -10, face: "🦊" },
    { x: 162, y: 40, r: -3, face: null },
    { x: 232, y: 46, r: 5, face: "🦊" },
    { x: 126, y: 132, r: 4, face: null },
    { x: 200, y: 128, r: -6, face: "🚀" },
  ];
  return (
    <svg viewBox="0 0 400 240" className="h-full w-full">
      <defs>
        <radialGradient id="memo-bg" cx="70%" cy="20%" r="90%">
          <stop offset="0%" stopColor="#164e63" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
        <linearGradient id="memo-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#a21caf" />
        </linearGradient>
        <filter id="memo-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="400" height="240" fill="url(#memo-bg)" />
      <g filter="url(#memo-glow)">
        {cards.map((c, i) => (
          <g key={i} transform={`translate(${c.x} ${c.y}) rotate(${c.r} 32 38)`}>
            <rect
              width="64"
              height="76"
              rx="10"
              fill={c.face ? "#1e293b" : "url(#memo-back)"}
              stroke={c.face ? "#22d3ee" : "#c084fc"}
              strokeWidth="2.5"
            />
            {c.face ? (
              <text x="32" y="50" textAnchor="middle" fontSize="32">
                {c.face}
              </text>
            ) : (
              <text x="32" y="47" textAnchor="middle" fontSize="20" fill="#e9d5ff" opacity="0.6">
                ✦
              </text>
            )}
          </g>
        ))}
      </g>
    </svg>
  );
}

export function TuttiThumbnail() {
  const rows = [
    { label: "Nombre", value: "Martina" },
    { label: "País", value: "México" },
    { label: "Animal", value: "Mono" },
    { label: "Color", value: "Marrón" },
  ];
  return (
    <svg viewBox="0 0 400 240" className="h-full w-full">
      <defs>
        <radialGradient id="tutti-bg" cx="20%" cy="80%" r="90%">
          <stop offset="0%" stopColor="#4a044e" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
        <linearGradient id="tutti-letter" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#c026d3" />
        </linearGradient>
        <filter id="tutti-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="400" height="240" fill="url(#tutti-bg)" />
      <g filter="url(#tutti-glow)">
        <rect x="58" y="70" width="96" height="96" rx="20" fill="url(#tutti-letter)" transform="rotate(-6 106 118)" />
      </g>
      <text
        x="106"
        y="140"
        textAnchor="middle"
        fontSize="64"
        fontWeight="700"
        fill="#fff"
        fontFamily="system-ui, sans-serif"
        transform="rotate(-6 106 118)"
      >
        M
      </text>
      <g transform="translate(184 48)">
        <rect width="170" height="148" rx="12" fill="#0f172a" stroke="#22d3ee" strokeOpacity="0.5" strokeWidth="2" />
        {rows.map((r, i) => (
          <g key={r.label} transform={`translate(14 ${30 + i * 32})`}>
            <text fontSize="11" fill="#64748b" fontFamily="system-ui, sans-serif">
              {r.label}
            </text>
            <text x="58" fontSize="14" fill="#e2e8f0" fontFamily="system-ui, sans-serif" fontWeight="600">
              {r.value}
            </text>
            <line x1="58" y1="6" x2="146" y2="6" stroke="#334155" />
          </g>
        ))}
      </g>
    </svg>
  );
}

export function DibujoThumbnail() {
  return (
    <svg viewBox="0 0 400 240" className="h-full w-full">
      <defs>
        <radialGradient id="dibujo-bg" cx="80%" cy="80%" r="90%">
          <stop offset="0%" stopColor="#3b0764" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
        <filter id="dibujo-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="400" height="240" fill="url(#dibujo-bg)" />
      <g transform="rotate(-3 200 120)">
        <rect x="70" y="38" width="200" height="150" rx="12" fill="#f8fafc" />
        {/* A quick sun-over-a-house doodle */}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5">
          <path d="M118 150 V112 L150 86 L182 112 V150 Z" stroke="#8b5cf6" />
          <path d="M142 150 V128 H158 V150" stroke="#ec4899" />
          <circle cx="226" cy="76" r="14" stroke="#eab308" />
          <path d="M226 50 V56 M226 96 V102 M200 76 H206 M246 76 H252" stroke="#eab308" />
          <path d="M92 160 Q170 150 250 162" stroke="#22c55e" />
        </g>
      </g>
      <g filter="url(#dibujo-glow)" transform="translate(296 70)">
        <rect width="78" height="30" rx="15" fill="#0f172a" stroke="#22d3ee" strokeWidth="2" />
        <text x="39" y="20" textAnchor="middle" fontSize="13" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
          ¿casa?
        </text>
        <rect y="42" width="78" height="30" rx="15" fill="#064e3b" stroke="#34d399" strokeWidth="2" />
        <text x="39" y="62" textAnchor="middle" fontSize="13" fill="#a7f3d0" fontFamily="system-ui, sans-serif">
          ✓ +92
        </text>
      </g>
    </svg>
  );
}

export function CodigoThumbnail() {
  // 3×3 slice of a board: revealed agents in team colors, the rest face down.
  const cells = [
    { w: "BANCO", fill: "#fb3a5d", ink: "#fff" },
    { w: "LUNA", fill: "#f1ead8", ink: "#1e1b16" },
    { w: "PILA", fill: "#0891b2", ink: "#fff" },
    { w: "CARTA", fill: "#f1ead8", ink: "#1e1b16" },
    { w: "💣", fill: "#020617", ink: "#e2e8f0" },
    { w: "TORRE", fill: "#f1ead8", ink: "#1e1b16" },
    { w: "OLA", fill: "#d6c7a1", ink: "#3f3a2e" },
    { w: "RED", fill: "#f1ead8", ink: "#1e1b16" },
    { w: "ESPÍA", fill: "#fb3a5d", ink: "#fff" },
  ];
  return (
    <svg viewBox="0 0 400 240" className="h-full w-full">
      <defs>
        <radialGradient id="codigo-bg" cx="50%" cy="10%" r="90%">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#codigo-bg)" />
      <g transform="translate(92 34) rotate(-4 108 86)">
        {cells.map((c, i) => (
          <g key={i} transform={`translate(${(i % 3) * 74} ${Math.floor(i / 3) * 58})`}>
            <rect width="68" height="50" rx="7" fill={c.fill} stroke="#00000033" strokeWidth="2" />
            <text
              x="34"
              y="30"
              textAnchor="middle"
              fontSize={c.w.length > 2 ? 12 : 22}
              fontWeight="700"
              fill={c.ink}
              fontFamily="system-ui, sans-serif"
            >
              {c.w}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export function DeslizanteThumbnail() {
  // A 3×3 board one move away from solved, with the gap glowing.
  const order = [1, 2, 3, 4, 5, 6, 7, 0, 8];
  const colors = ["#7c3aed", "#8b5cf6", "#a855f7", "#c026d3", "#d946ef", "#e879f9", "#0891b2", "#22d3ee"];
  return (
    <svg viewBox="0 0 400 240" className="h-full w-full">
      <defs>
        <radialGradient id="desliz-bg" cx="70%" cy="30%" r="90%">
          <stop offset="0%" stopColor="#312e81" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#desliz-bg)" />
      <g transform="translate(125 25)">
        <rect x="-6" y="-6" width="162" height="162" rx="14" fill="#0f172a" stroke="#8b5cf6" strokeOpacity="0.5" strokeWidth="2" />
        {order.map((tile, pos) =>
          tile === 0 ? (
            <rect key={pos} x={(pos % 3) * 50 + 2} y={Math.floor(pos / 3) * 50 + 2} width="46" height="46" rx="8" fill="none" stroke="#22d3ee" strokeDasharray="4 4" strokeWidth="2" />
          ) : (
            <g key={pos} transform={`translate(${(pos % 3) * 50 + 2} ${Math.floor(pos / 3) * 50 + 2})`}>
              <rect width="46" height="46" rx="8" fill={colors[tile - 1]} />
              <text x="23" y="30" textAnchor="middle" fontSize="18" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">
                {tile}
              </text>
            </g>
          )
        )}
        <path d="M120 125 h-22 m6 -6 l-6 6 l6 6" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
