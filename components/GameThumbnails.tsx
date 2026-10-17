// Small inline SVG "cover art" pieces for the games hub — no external image
// assets, drawn in the same violet/cyan/fuchsia neon palette as the rest of
// the app so a game's card reads as part of the same family before you ever
// open it.

export function PuzzleThumbnail() {
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
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
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
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
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
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
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
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
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
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
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
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

export function CuatroThumbnail() {
  // A 7×6 board mid-game, with red about to complete a diagonal.
  const rows = [
    ".......",
    ".......",
    "...a...",
    "..ab...",
    ".abba..",
    "babab.b",
  ];
  const fill: Record<string, string> = { a: "#fb3a5d", b: "#facc15", ".": "#0b0a14" };
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="cuatro-bg" cx="20%" cy="20%" r="90%">
          <stop offset="0%" stopColor="#4c0519" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#cuatro-bg)" />
      <g transform="translate(100 34)">
        <rect width="200" height="172" rx="14" fill="#1d4ed8" stroke="#60a5fa" strokeOpacity="0.6" strokeWidth="2" />
        {rows.map((row, r) =>
          [...row].map((c, col) => (
            <circle key={`${r}-${col}`} cx={18 + col * 27.3} cy={17 + r * 27.6} r="10.5" fill={fill[c]} />
          ))
        )}
      </g>
      <g transform="translate(100 34)">
        <circle cx={18 + 0 * 27.3} cy={17 - 34} r="10.5" fill="#fb3a5d" />
        <path d="M18 -4 v10 m-5 -5 l5 5 l5 -5" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export function PalabraThumbnail() {
  // Three guesses closing in on the word, Wordle-style.
  const rows = [
    { word: "LIMON", s: "y.yy." },
    { word: "NOCHE", s: ".g..y" },
    { word: "MOTEL", s: "ggggg" },
  ];
  const fill: Record<string, string> = { g: "#10b981", y: "#fbbf24", ".": "#334155" };
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="palabra-bg" cx="80%" cy="20%" r="90%">
          <stop offset="0%" stopColor="#064e3b" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#palabra-bg)" />
      <g transform="translate(97 36)">
        {rows.map((row, r) =>
          [...row.word].map((ch, i) => (
            <g key={`${r}-${i}`} transform={`translate(${i * 42} ${r * 58})`}>
              <rect width="38" height="50" rx="6" fill={fill[row.s[i]]} />
              <text
                x="19"
                y="33"
                textAnchor="middle"
                fontSize="22"
                fontWeight="700"
                fill={row.s[i] === "y" ? "#0f172a" : "#fff"}
                fontFamily="system-ui, sans-serif"
              >
                {ch}
              </text>
            </g>
          ))
        )}
      </g>
    </svg>
  );
}

export function TriviaThumbnail() {
  // A question card with four colored answers, one marked right.
  const options = [
    { color: "#ef4444", w: 92 },
    { color: "#3b82f6", w: 70, right: true },
    { color: "#eab308", w: 84 },
    { color: "#22c55e", w: 60 },
  ];
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="trivia-bg" cx="50%" cy="0%" r="100%">
          <stop offset="0%" stopColor="#713f12" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#trivia-bg)" />
      <g transform="translate(70 26)">
        <rect width="260" height="64" rx="12" fill="#0f172a" stroke="#facc15" strokeOpacity="0.5" strokeWidth="2" />
        <text x="130" y="41" textAnchor="middle" fontSize="26" fontWeight="700" fill="#fde68a" fontFamily="system-ui, sans-serif">
          ¿ ? ? ?
        </text>
        {options.map((o, i) => (
          <g key={i} transform={`translate(${(i % 2) * 134} ${80 + Math.floor(i / 2) * 52})`}>
            <rect
              width="126"
              height="42"
              rx="9"
              fill={`${o.color}33`}
              stroke={o.right ? "#10b981" : o.color}
              strokeWidth={o.right ? 3 : 2}
            />
            <rect x="8" y="9" width="24" height="24" rx="6" fill={o.color} />
            <rect x="40" y="18" width={o.w - 20} height="7" rx="3.5" fill="#e2e8f0" opacity="0.7" />
            {o.right && (
              <path d="M14 21 l5 5 l9 -10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </g>
        ))}
      </g>
    </svg>
  );
}

export function ImpostorThumbnail() {
  // A row of identical cards and one that's different.
  const cards = [
    { x: 58, r: -8, impostor: false },
    { x: 130, r: -3, impostor: false },
    { x: 202, r: 3, impostor: true },
    { x: 274, r: 8, impostor: false },
  ];
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="impostor-bg" cx="55%" cy="40%" r="80%">
          <stop offset="0%" stopColor="#500724" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
        <filter id="impostor-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="400" height="240" fill="url(#impostor-bg)" />
      {cards.map((c, i) => (
        <g key={i} transform={`translate(${c.x} 58) rotate(${c.r} 34 62)`} filter={c.impostor ? "url(#impostor-glow)" : undefined}>
          <rect
            width="68"
            height="124"
            rx="10"
            fill={c.impostor ? "#4c0519" : "#1e293b"}
            stroke={c.impostor ? "#fb7185" : "#a78bfa"}
            strokeWidth="2.5"
          />
          <text x="34" y="74" textAnchor="middle" fontSize={c.impostor ? 34 : 13} fontWeight="700" fill="#e2e8f0" fontFamily="system-ui, sans-serif">
            {c.impostor ? "?" : "PIZZA"}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function NavalThumbnail() {
  // A slice of the rival's map: misses, hits, and a ship going down.
  const shots: { x: number; y: number; hit?: boolean }[] = [
    { x: 1, y: 1 },
    { x: 4, y: 0 },
    { x: 2, y: 3, hit: true },
    { x: 3, y: 3, hit: true },
    { x: 4, y: 3, hit: true },
    { x: 6, y: 1 },
    { x: 7, y: 4 },
    { x: 0, y: 4 },
    { x: 5, y: 2 },
  ];
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="naval-bg" cx="30%" cy="70%" r="90%">
          <stop offset="0%" stopColor="#0c4a6e" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
        <filter id="naval-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="400" height="240" fill="url(#naval-bg)" />
      <g transform="translate(76 36)">
        {Array.from({ length: 6 }, (_, r) =>
          Array.from({ length: 8 }, (_, c) => (
            <rect key={`${r}-${c}`} x={c * 31} y={r * 29} width="28" height="26" rx="4" fill="#0c4a6e" opacity="0.7" />
          ))
        )}
        {shots.map((s, i) =>
          s.hit ? (
            <g key={i} filter="url(#naval-glow)">
              <rect x={s.x * 31} y={s.y * 29} width="28" height="26" rx="4" fill="#f43f5e" />
              <path
                d={`M${s.x * 31 + 8} ${s.y * 29 + 7} l12 12 m0 -12 l-12 12`}
                stroke="#fff"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </g>
          ) : (
            <circle key={i} cx={s.x * 31 + 14} cy={s.y * 29 + 13} r="4" fill="#bae6fd" opacity="0.8" />
          )
        )}
        <g transform="translate(155 120)">
          <circle r="22" fill="none" stroke="#e879f9" strokeWidth="2.5" />
          <path d="M-30 0 h20 M10 0 h20 M0 -30 v20 M0 10 v20" stroke="#e879f9" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

export function ProbableThumbnail() {
  // Votes piling up on one friend.
  const people = [
    { x: 110, color: "#22d3ee", votes: 1 },
    { x: 200, color: "#f472b6", votes: 4, crown: true },
    { x: 290, color: "#a78bfa", votes: 2 },
  ];
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="probable-bg" cx="50%" cy="30%" r="90%">
          <stop offset="0%" stopColor="#831843" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#probable-bg)" />
      <text x="200" y="44" textAnchor="middle" fontSize="15" fontWeight="600" fill="#fbcfe8" fontFamily="system-ui, sans-serif">
        ¿Quién es más probable que…?
      </text>
      {people.map((p) => (
        <g key={p.x} transform={`translate(${p.x} 0)`}>
          {Array.from({ length: p.votes }, (_, i) => (
            <rect key={i} x="-22" y={178 - i * 16} width="44" height="12" rx="4" fill={p.color} opacity={0.35 + i * 0.15} />
          ))}
          <circle cy="206" r="16" fill={p.color} />
          {p.crown && (
            <path d="M-16 92 l6 -14 l10 9 l10 -9 l6 14 z" fill="#fcd34d" transform="translate(0 0)" />
          )}
        </g>
      ))}
    </svg>
  );
}

export function ConocesThumbnail() {
  // Two players, one secret answer, and a match.
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="conoces-bg" cx="50%" cy="50%" r="80%">
          <stop offset="0%" stopColor="#881337" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#conoces-bg)" />
      <g transform="translate(70 40)" fontFamily="system-ui, sans-serif">
        <rect width="260" height="40" rx="10" fill="#0f172a" stroke="#fb7185" strokeOpacity="0.6" strokeWidth="2" />
        <text x="130" y="26" textAnchor="middle" fontSize="15" fontWeight="600" fill="#ffe4e6">
          ¿Playa o montaña?
        </text>
        {[
          { label: "Playa", y: 56, right: true },
          { label: "Montaña", y: 104 },
        ].map((o) => (
          <g key={o.label} transform={`translate(0 ${o.y})`}>
            <rect
              width="260"
              height="38"
              rx="10"
              fill={o.right ? "#064e3b" : "#1e293b"}
              stroke={o.right ? "#34d399" : "#475569"}
              strokeWidth="2"
            />
            <text x="16" y="25" fontSize="15" fill="#e2e8f0">
              {o.label}
            </text>
            {o.right && (
              <>
                <circle cx="206" cy="19" r="11" fill="#f472b6" />
                <circle cx="226" cy="19" r="11" fill="#38bdf8" />
                <path d="M238 19 l5 5 l9 -10" stroke="#6ee7b7" strokeWidth="3" fill="none" strokeLinecap="round" />
              </>
            )}
          </g>
        ))}
      </g>
    </svg>
  );
}

export function GeneralaThumbnail() {
  // Five dice: a full house, two of them held.
  const dice = [
    { v: 3, x: 70, r: -10, held: true },
    { v: 3, x: 128, r: 6, held: true },
    { v: 3, x: 186, r: -4 },
    { v: 5, x: 244, r: 9 },
    { v: 5, x: 302, r: -7 },
  ];
  const pips: Record<number, [number, number][]> = {
    3: [
      [12, 12],
      [24, 24],
      [36, 36],
    ],
    5: [
      [12, 12],
      [36, 12],
      [24, 24],
      [12, 36],
      [36, 36],
    ],
  };
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="generala-bg" cx="50%" cy="80%" r="90%">
          <stop offset="0%" stopColor="#14532d" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#generala-bg)" />
      {dice.map((d, i) => (
        <g key={i} transform={`translate(${d.x - 24} ${d.held ? 82 : 96}) rotate(${d.r} 24 24)`}>
          <rect
            width="48"
            height="48"
            rx="10"
            fill={d.held ? "#fef3c7" : "#f1f5f9"}
            stroke={d.held ? "#fbbf24" : "none"}
            strokeWidth="3"
          />
          {pips[d.v].map(([x, y], j) => (
            <circle key={j} cx={x} cy={y} r="4.5" fill="#0f172a" />
          ))}
        </g>
      ))}
      <text x="200" y="188" textAnchor="middle" fontSize="20" fontWeight="700" fill="#bbf7d0" fontFamily="system-ui, sans-serif">
        FULL · 30
      </text>
    </svg>
  );
}

export function EmojisThumbnail() {
  // A puzzle card and the answer's blanks.
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="emojis-bg" cx="50%" cy="30%" r="90%">
          <stop offset="0%" stopColor="#713f12" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#emojis-bg)" />
      <g transform="translate(80 40)">
        <rect width="240" height="100" rx="18" fill="#0f172a" stroke="#facc15" strokeOpacity="0.6" strokeWidth="2" />
        <text x="120" y="68" textAnchor="middle" fontSize="48">
          🦁👑
        </text>
      </g>
      <text x="200" y="182" textAnchor="middle" fontSize="20" fontWeight="700" letterSpacing="4" fill="#fde68a" fontFamily="monospace">
        E_ R__ L___
      </text>
    </svg>
  );
}

export function VerdadesThumbnail() {
  // Three statements; one is the lie.
  const rows = [
    { w: 180, lie: false },
    { w: 150, lie: true },
    { w: 200, lie: false },
  ];
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="verdades-bg" cx="70%" cy="20%" r="90%">
          <stop offset="0%" stopColor="#3730a3" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#verdades-bg)" />
      {rows.map((r, i) => (
        <g key={i} transform={`translate(70 ${42 + i * 56})`}>
          <rect
            width="260"
            height="44"
            rx="10"
            fill={r.lie ? "#4c0519" : "#1e293b"}
            stroke={r.lie ? "#fb7185" : "#475569"}
            strokeWidth="2"
          />
          <rect x="16" y="18" width={r.w - 40} height="8" rx="4" fill="#e2e8f0" opacity="0.7" />
          <text
            x="244"
            y="28"
            textAnchor="end"
            fontSize="12"
            fontWeight="700"
            fill={r.lie ? "#fda4af" : "#6ee7b7"}
            fontFamily="system-ui, sans-serif"
          >
            {r.lie ? "MENTIRA" : "VERDAD"}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function DamasThumbnail() {
  // A corner of the board with a crowned piece.
  const pieces: Record<string, "w" | "b" | "W"> = { "0-1": "b", "0-3": "b", "1-2": "b", "2-1": "W", "3-4": "w", "3-2": "w", "4-1": "w" };
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="damas-bg" cx="30%" cy="30%" r="90%">
          <stop offset="0%" stopColor="#7c2d12" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#damas-bg)" />
      <g transform="translate(110 25) rotate(-4 90 95)">
        {Array.from({ length: 5 }, (_, r) =>
          Array.from({ length: 5 }, (_, c) => {
            const p = pieces[`${r}-${c}`];
            return (
              <g key={`${r}-${c}`}>
                <rect x={c * 38} y={r * 38} width="38" height="38" fill={(r + c) % 2 ? "#451a03" : "#fde68a"} opacity={(r + c) % 2 ? 1 : 0.85} />
                {p && (
                  <circle
                    cx={c * 38 + 19}
                    cy={r * 38 + 19}
                    r="14"
                    fill={p === "b" ? "#1f2937" : "#f5efe0"}
                    stroke={p === "b" ? "#64748b" : "#d6c7a1"}
                    strokeWidth="3"
                  />
                )}
                {p === "W" && (
                  <path
                    d={`M${c * 38 + 11} ${r * 38 + 24} l2 -10 l6 5 l6 -5 l2 10 z`}
                    fill="#d97706"
                  />
                )}
              </g>
            );
          })
        )}
      </g>
    </svg>
  );
}

export function CajasThumbnail() {
  // A 3×3 dots-and-boxes board, half played.
  const S = 52;
  const lines: [number, number, number, number, string][] = [
    [0, 0, 1, 0, "#22d3ee"],
    [1, 0, 2, 0, "#f472b6"],
    [0, 0, 0, 1, "#22d3ee"],
    [1, 0, 1, 1, "#f472b6"],
    [0, 1, 1, 1, "#22d3ee"],
    [2, 0, 2, 1, "#22d3ee"],
    [1, 1, 2, 1, "#f472b6"],
    [3, 1, 3, 2, "#f472b6"],
    [2, 2, 3, 2, "#22d3ee"],
    [1, 2, 1, 3, "#f472b6"],
  ];
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="cajas-bg" cx="60%" cy="40%" r="90%">
          <stop offset="0%" stopColor="#164e63" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#cajas-bg)" />
      <g transform="translate(122 42)">
        <rect x="4" y="4" width={S - 8} height={S - 8} rx="5" fill="#22d3ee" opacity="0.3" />
        <rect x={S + 4} y="4" width={S - 8} height={S - 8} rx="5" fill="#f472b6" opacity="0.3" />
        {lines.map(([x1, y1, x2, y2, color], i) => (
          <line key={i} x1={x1 * S} y1={y1 * S} x2={x2 * S} y2={y2 * S} stroke={color} strokeWidth="6" strokeLinecap="round" />
        ))}
        {Array.from({ length: 16 }, (_, d) => (
          <circle key={d} cx={(d % 4) * S} cy={Math.floor(d / 4) * S} r="6" fill="#e2e8f0" />
        ))}
      </g>
    </svg>
  );
}

export function RetoThumbnail() {
  // Two cards: verdad and reto.
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="reto-bg" cx="50%" cy="50%" r="80%">
          <stop offset="0%" stopColor="#7c2d12" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
        <linearGradient id="reto-v" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id="reto-r" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill="url(#reto-bg)" />
      <g fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="24" textAnchor="middle" fill="#fff">
        <g transform="translate(92 50) rotate(-8 60 70)">
          <rect width="120" height="140" rx="16" fill="url(#reto-v)" />
          <text x="60" y="80">VERDAD</text>
        </g>
        <g transform="translate(190 46) rotate(7 60 70)">
          <rect width="120" height="140" rx="16" fill="url(#reto-r)" />
          <text x="60" y="80">RETO</text>
        </g>
      </g>
    </svg>
  );
}

export function MimicaThumbnail() {
  // A stick figure acting, a word card and a clock.
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="mimica-bg" cx="40%" cy="40%" r="90%">
          <stop offset="0%" stopColor="#115e59" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#mimica-bg)" />
      <g stroke="#e2e8f0" strokeWidth="6" strokeLinecap="round" fill="none" transform="translate(130 40)">
        <circle cx="0" cy="22" r="18" />
        <path d="M0 40 V110 M0 60 L-40 30 M0 60 L38 82 M0 110 L-28 160 M0 110 L30 158" />
      </g>
      <g transform="translate(220 64)">
        <rect width="130" height="70" rx="12" fill="#0f172a" stroke="#2dd4bf" strokeWidth="2" />
        <text x="65" y="44" textAnchor="middle" fontSize="20" fontWeight="700" fill="#ccfbf1" fontFamily="system-ui, sans-serif">
          Pingüino
        </text>
      </g>
      <text x="285" y="178" textAnchor="middle" fontSize="28" fontWeight="700" fill="#5eead4" fontFamily="monospace">
        0:42
      </text>
    </svg>
  );
}

export function AhorcadoThumbnail() {
  // The gallows mid-game and a half-guessed word.
  const word = ["M", "", "T", "E"];
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="ahorcado-bg" cx="30%" cy="30%" r="90%">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#ahorcado-bg)" />
      <g transform="translate(70 30)">
        <path d="M10 180 H90 M40 180 V10 H120 V34" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" fill="none" />
        <g stroke="#f8fafc" strokeWidth="5" strokeLinecap="round" fill="none">
          <circle cx="120" cy="52" r="18" />
          <path d="M120 70 V120 M120 84 L98 104 M120 84 L142 104" />
        </g>
      </g>
      <g transform="translate(220 150)" fontFamily="monospace" fontSize="30" fontWeight="700" fill="#f1f5f9" textAnchor="middle">
        {word.map((ch, i) => (
          <g key={i} transform={`translate(${i * 36} 0)`}>
            <text x="14" y="0">
              {ch}
            </text>
            <line x1="0" y1="8" x2="28" y2="8" stroke="#94a3b8" strokeWidth="3" />
          </g>
        ))}
      </g>
    </svg>
  );
}

export function SopaThumbnail() {
  // A letter grid with two words circled.
  const rows = ["GATOXQ", "LMPERO", "EOSAPO", "ÑNRUAT", "TOLEON", "BZAPIS"];
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="sopa-bg" cx="60%" cy="30%" r="90%">
          <stop offset="0%" stopColor="#365314" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#sopa-bg)" />
      <g transform="translate(110 22)">
        <rect x="-4" y="2" width="128" height="30" rx="15" fill="#22d3ee" opacity="0.35" />
        <rect x="58" y="126" width="122" height="30" rx="15" fill="#f472b6" opacity="0.35" />
        {rows.map((row, r) =>
          [...row].map((ch, c) => (
            <text
              key={`${r}-${c}`}
              x={c * 31 + 14}
              y={r * 32 + 24}
              textAnchor="middle"
              fontSize="20"
              fontWeight="700"
              fill="#ecfccb"
              fontFamily="monospace"
            >
              {ch}
            </text>
          ))
        )}
      </g>
    </svg>
  );
}

export function CarrerasThumbnail() {
  // Two cars on a curve, seen from above, with the start line.
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="carreras-bg" cx="50%" cy="40%" r="90%">
          <stop offset="0%" stopColor="#14532d" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
        <pattern id="carreras-check" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="#f8fafc" />
          <rect width="6" height="6" fill="#0f172a" />
          <rect x="6" y="6" width="6" height="6" fill="#0f172a" />
        </pattern>
      </defs>
      <rect width="400" height="240" fill="url(#carreras-bg)" />
      <path d="M-20 200 C 120 200, 160 40, 300 50 S 420 120, 430 120" fill="none" stroke="#f8fafc" strokeWidth="92" opacity="0.9" strokeDasharray="14 14" />
      <path d="M-20 200 C 120 200, 160 40, 300 50 S 420 120, 430 120" fill="none" stroke="#334155" strokeWidth="80" />
      <path d="M-20 200 C 120 200, 160 40, 300 50 S 420 120, 430 120" fill="none" stroke="#e2e8f0" strokeWidth="3" strokeDasharray="16 14" opacity="0.6" />
      <rect x="60" y="160" width="12" height="80" fill="url(#carreras-check)" />
      <g transform="translate(150 125) rotate(-62)">
        <rect x="-22" y="-12" width="44" height="24" rx="7" fill="#fb3a5d" />
        <rect x="2" y="-9" width="11" height="18" rx="3" fill="#0f172a" opacity="0.7" />
      </g>
      <g transform="translate(232 70) rotate(-20)">
        <rect x="-22" y="-12" width="44" height="24" rx="7" fill="#22d3ee" />
        <rect x="2" y="-9" width="11" height="18" rx="3" fill="#0f172a" opacity="0.7" />
      </g>
    </svg>
  );
}

export function ArenaThumbnail() {
  // Two knights facing off on the sand, crossed swords between them, the stands behind.
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <linearGradient id="arena-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a6fb5" />
          <stop offset="100%" stopColor="#f2c48d" />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill="url(#arena-sky)" />
      <path d="M0 70 Q200 40 400 70 V130 H0 Z" fill="#9c8f78" />
      <g fill="#7c6f5a">
        <rect y="88" width="400" height="5" />
        <rect y="104" width="400" height="5" />
      </g>
      <g>
        {Array.from({ length: 34 }, (_, i) => (
          <circle key={i} cx={8 + i * 12} cy={82 + (i % 3) * 16} r="4" fill={["#dc2646", "#1d9bd1", "#f59e0b", "#a3e635"][i % 4]} opacity="0.85" />
        ))}
      </g>
      <rect y="126" width="400" height="12" fill="#a39782" />
      <rect y="138" width="400" height="102" fill="#d9b77e" />
      <ellipse cx="200" cy="200" rx="120" ry="16" fill="#9a6b35" opacity="0.25" />
      {/* Red knight */}
      <g transform="translate(120 128)">
        <rect x="-14" y="56" width="10" height="34" rx="3" fill="#5b6470" />
        <rect x="4" y="56" width="10" height="34" rx="3" fill="#5b6470" />
        <rect x="-20" y="14" width="40" height="46" rx="6" fill="#dc2646" />
        <rect x="-12" y="-14" width="24" height="28" rx="8" fill="#b8c2cc" />
        <rect x="-8" y="-2" width="16" height="3" fill="#0b0b0f" />
        <rect x="-3" y="-30" width="6" height="18" rx="2" fill="#dc2646" />
        <circle cx="-26" cy="34" r="16" fill="#dc2646" stroke="#5b6470" strokeWidth="3" />
        <circle cx="-26" cy="34" r="4" fill="#d4a72c" />
      </g>
      {/* Blue knight */}
      <g transform="translate(280 128)">
        <rect x="-14" y="56" width="10" height="34" rx="3" fill="#5b6470" />
        <rect x="4" y="56" width="10" height="34" rx="3" fill="#5b6470" />
        <rect x="-20" y="14" width="40" height="46" rx="6" fill="#1d9bd1" />
        <rect x="-12" y="-14" width="24" height="28" rx="8" fill="#b8c2cc" />
        <rect x="-8" y="-2" width="16" height="3" fill="#0b0b0f" />
        <rect x="-3" y="-30" width="6" height="18" rx="2" fill="#1d9bd1" />
      </g>
      {/* Crossed blades */}
      <g strokeLinecap="round">
        <line x1="150" y1="150" x2="232" y2="88" stroke="#e2e8f0" strokeWidth="6" />
        <line x1="250" y1="150" x2="168" y2="88" stroke="#e2e8f0" strokeWidth="6" />
        <line x1="142" y1="146" x2="156" y2="160" stroke="#d4a72c" strokeWidth="6" />
        <line x1="258" y1="146" x2="244" y2="160" stroke="#d4a72c" strokeWidth="6" />
      </g>
      <circle cx="200" cy="104" r="10" fill="#fde047" opacity="0.8" />
    </svg>
  );
}

export function Carreras3dThumbnail() {
  // The road seen from behind a car, vanishing into the horizon.
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <linearGradient id="c3d-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#bae6fd" />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill="url(#c3d-sky)" />
      <path d="M0 112 L60 70 L110 100 L170 55 L240 104 L300 64 L360 96 L400 80 V112 Z" fill="#64748b" opacity="0.7" />
      <rect y="110" width="400" height="130" fill="#3f9a43" />
      <path d="M180 110 L220 110 L360 240 L40 240 Z" fill="#3b3b44" />
      <path d="M180 110 L172 110 L22 240 L40 240 Z" fill="#dc2626" />
      <path d="M220 110 L228 110 L378 240 L360 240 Z" fill="#dc2626" />
      <path d="M199 118 L201 118 L203 140 L197 140 Z M196 158 L204 158 L207 190 L193 190 Z" fill="#f8fafc" opacity="0.8" />
      <g fill="#14532d">
        <path d="M70 112 L82 80 L94 112 Z" />
        <path d="M300 112 L314 74 L328 112 Z" />
        <path d="M120 112 L128 92 L136 112 Z" />
      </g>
      <g transform="translate(240 128)">
        <rect x="-13" y="0" width="26" height="12" rx="3" fill="#22d3ee" />
        <rect x="-8" y="-5" width="16" height="6" rx="2" fill="#1e293b" />
      </g>
      <g transform="translate(200 205)">
        <rect x="-62" y="-8" width="124" height="10" rx="3" fill="#b91c1c" />
        <rect x="-50" y="-30" width="100" height="34" rx="9" fill="#fb3a5d" />
        <rect x="-30" y="-48" width="60" height="22" rx="6" fill="#1e293b" />
        <rect x="-60" y="2" width="22" height="24" rx="4" fill="#0b0b0f" />
        <rect x="38" y="2" width="22" height="24" rx="4" fill="#0b0b0f" />
      </g>
    </svg>
  );
}

export function YoNuncaThumbnail() {
  // A phrase card and two raised / crossed hands.
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="yonunca-bg" cx="50%" cy="30%" r="90%">
          <stop offset="0%" stopColor="#78350f" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#yonunca-bg)" />
      <g transform="translate(70 40)">
        <rect width="260" height="70" rx="14" fill="#0f172a" stroke="#fbbf24" strokeWidth="2" />
        <text x="130" y="44" textAnchor="middle" fontSize="22" fontWeight="800" fill="#fde68a" fontFamily="system-ui, sans-serif">
          Yo nunca nunca…
        </text>
      </g>
      <g fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="18" textAnchor="middle">
        <rect x="88" y="140" width="104" height="56" rx="14" fill="#f97316" />
        <text x="140" y="174" fill="#fff">YO SÍ</text>
        <rect x="208" y="140" width="104" height="56" rx="14" fill="#334155" />
        <text x="260" y="174" fill="#cbd5e1">YO NO</text>
      </g>
    </svg>
  );
}

export function OndaThumbnail() {
  // The half dial with scoring bands and a needle.
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="onda-bg" cx="50%" cy="90%" r="90%">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
        <linearGradient id="onda-thumb-face" x1="0" x2="1">
          <stop offset="0%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#c2410c" />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill="url(#onda-bg)" />
      <path d="M60 205 A140 140 0 0 1 340 205 Z" fill="url(#onda-thumb-face)" />
      <path d="M200 205 L266 81 A140 140 0 0 1 300 107 Z" fill="#22d3ee" />
      <path d="M200 205 L276 88 A140 140 0 0 1 292 99 Z" fill="#facc15" />
      <line x1="200" y1="205" x2="280" y2="92" stroke="#f8fafc" strokeWidth="7" strokeLinecap="round" />
      <circle cx="200" cy="205" r="14" fill="#0f172a" stroke="#94a3b8" strokeWidth="3" />
      <g fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="16">
        <text x="40" y="232" fill="#7dd3fc">FRÍO</text>
        <text x="300" y="232" fill="#fdba74">CALIENTE</text>
      </g>
    </svg>
  );
}

export function TelefonoThumbnail() {
  // A phrase, an arrow, a doodle, an arrow, a wrong guess.
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="telefono-bg" cx="50%" cy="40%" r="90%">
          <stop offset="0%" stopColor="#14532d" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#telefono-bg)" />
      <g fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="15" textAnchor="middle">
        <rect x="20" y="40" width="110" height="44" rx="10" fill="#0f172a" stroke="#a3e635" strokeWidth="2" />
        <text x="75" y="67" fill="#ecfccb">Un gato DJ</text>
        <rect x="270" y="156" width="110" height="44" rx="10" fill="#0f172a" stroke="#a3e635" strokeWidth="2" />
        <text x="325" y="183" fill="#ecfccb">¿Un tostador?</text>
      </g>
      <rect x="140" y="72" width="120" height="96" rx="10" fill="#ffffff" />
      <g fill="none" stroke="#0f172a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="200" cy="112" r="22" />
        <path d="M184 94 L186 80 L196 92 M216 94 L214 80 L204 92 M190 112 h0.1 M210 112 h0.1 M195 122 q5 5 10 0" />
        <path d="M160 150 h80" stroke="#ef4444" />
      </g>
      <g stroke="#a3e635" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M100 92 q20 30 36 26" />
        <path d="M264 140 q24 6 36 14" />
      </g>
    </svg>
  );
}
