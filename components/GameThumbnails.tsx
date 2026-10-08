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

export function ComingSoonThumbnail() {
  return (
    <svg viewBox="0 0 400 240" className="h-full w-full">
      <defs>
        <radialGradient id="soon-bg" cx="50%" cy="50%" r="80%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0b0a14" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill="url(#soon-bg)" />
      <text
        x="200"
        y="140"
        textAnchor="middle"
        fontSize="64"
        fill="#334155"
        fontFamily="system-ui, sans-serif"
        fontWeight="700"
      >
        ?
      </text>
    </svg>
  );
}
